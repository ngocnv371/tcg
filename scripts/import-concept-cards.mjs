/**
 * Reusable pipeline for turning a folder of concept-art exports (one
 * `<Title>.json` + `<Title>.png` pair per card) into rows that match the
 * `Card` model (src/types/db.ts) and, optionally, pushing them straight into
 * Supabase with a service-role token.
 *
 * This is a content-authoring tool, not app code: it talks to Postgres with
 * the service_role key (never the anon key), so it must only ever be run
 * from a trusted machine/CI, never shipped to the client.
 *
 * Usage:
 *   node scripts/import-concept-cards.mjs <folder> [options]
 *
 * Options:
 *   --import              Also upsert the derived cards into Supabase.
 *   --upload-art          Re-encode each image to WebP, upload it to the public
 *                         `card-art` Storage bucket, and point art_path at its
 *                         public URL — matching the art/cards/<id>.webp convention.
 *   --supabase-url=<url>  Defaults to env SUPABASE_URL.
 *   --service-key=<key>   Defaults to env SUPABASE_SERVICE_ROLE_KEY.
 *   --stage-art           Re-encode each image to WebP into public/art/cards/<id>.webp.
 *   --dry-run             Print what would happen, write/import nothing.
 *
 * Each step is exposed as a standalone function so other scripts can import
 * and reuse them (e.g. from a batch job or a one-off REPL session).
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Picks up SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from .env.local without
// requiring it to be exported in the shell first.
if (existsSync(join(root, '.env.local'))) process.loadEnvFile(join(root, '.env.local'))

import { RANK_META, cardAtk, cardDef, rankUpCost } from '../src/game/formulas.ts'

// --- content tables (edit here, not per-card, to keep cards consistent) -----

/** Element words that can appear after " of " in a concept-art title. */
const ELEMENT_TO_FACTION = {
  Fire: 'ember',
  Dragon: 'ember',
  Water: 'tide',
  Ice: 'tide',
  Earth: 'verdant',
  Nature: 'verdant',
  Dark: 'umbral',
  Light: 'radiant',
  Air: 'radiant',
  Thunder: 'radiant',
}

const ROLES = ['tank', 'dps', 'support']

/** Public Storage bucket card art is uploaded to (created on first use). */
const CARD_ART_BUCKET = 'card-art'

/** Small, clearly-a-draft passive per faction so nothing ships unnamed. Tune later. */
const FACTION_PASSIVES = {
  ember: { name: 'Kindled Spirit', text: '+5% ATK against 1★ and 2★ enemies.' },
  tide: { name: 'Undertow', text: 'Reduces dungeon power requirement by 3% while in the party.' },
  verdant: { name: 'Wild Growth', text: '+5% party power for each other card sharing a tag.' },
  umbral: { name: 'Quiet Step', text: 'Ignores 10% of enemy DEF.' },
  radiant: { name: 'Gentle Light', text: '+2% success chance on any run it joins.' },
}

// --- step 1: scan the export folder ------------------------------------------

/**
 * Finds every `<name>.json` that has a matching image next to it.
 * Returns raw pairs; nothing here touches disk beyond reading directory entries.
 */
export function scanExportFolder(folder) {
  const entries = readdirSync(folder)
  const jsonFiles = entries.filter((f) => extname(f).toLowerCase() === '.json')
  const imageExts = new Set(['.png', '.webp', '.jpg', '.jpeg'])

  const pairs = []
  for (const jsonFile of jsonFiles) {
    const stem = basename(jsonFile, extname(jsonFile))
    const imageFile = entries.find((f) => basename(f, extname(f)) === stem && imageExts.has(extname(f).toLowerCase()))
    if (!imageFile) {
      console.warn(`skipping ${jsonFile}: no matching image found`)
      continue
    }
    const jsonPath = join(folder, jsonFile)
    const raw = JSON.parse(readFileSync(jsonPath, 'utf8'))
    pairs.push({
      jsonPath,
      imagePath: join(folder, imageFile),
      title: raw.title ?? stem,
      summary: raw.summary ?? '',
      raw,
    })
  }
  return pairs
}

// --- step 2: derive Card-model fields from title + summary -------------------

/** Pulls element words out of a "X of Y and Z" style title. */
export function elementsFromTitle(title) {
  const match = title.match(/ of (.+)$/i)
  if (!match) return []
  return match[1]
    .split(/,| and /i)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Name up to 3 words, taken from the part of the title before " of ". */
export function shortenName(title) {
  const base = title.split(/ of /i)[0].trim()
  const words = base.split(/\s+/).filter(Boolean)
  return words.slice(0, 3).join(' ')
}

export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** Deterministic pick from a list, stable across runs for the same id. */
function pickByHash(id, list) {
  const hash = [...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
  return list[hash % list.length]
}

/**
 * Builds a full Card record (src/types/db.ts) from a scanned {title, summary,
 * raw} pair. `existingIds` is a Set used to dedupe slugs across a batch.
 * Reuses a previously-uploaded art_path (a real URL) if the sidecar json
 * already has one, so re-running --import alone doesn't clobber it.
 */
export function buildCardRecord({ title, summary, raw }, existingIds = new Set()) {
  const elements = elementsFromTitle(title)
  const faction = elements.map((e) => ELEMENT_TO_FACTION[e]).find(Boolean) ?? 'verdant'
  const rank = elements.length >= 2 ? 2 : 1
  const meta = RANK_META[rank]

  const name = shortenName(title)
  let id = slugify(name)
  if (existingIds.has(id)) {
    let n = 2
    while (existingIds.has(`${id}_${n}`)) n += 1
    id = `${id}_${n}`
  }
  existingIds.add(id)

  const role = pickByHash(id, ROLES)
  const passive = FACTION_PASSIVES[faction]
  const uploadedArtPath = typeof raw?.art_path === 'string' && raw.art_path.startsWith('http') ? raw.art_path : null

  return {
    id,
    name,
    rank,
    faction,
    role,
    base_atk: cardAtk(rank, 1),
    base_def: cardDef(rank, 1),
    passive_name: passive.name,
    passive_text: passive.text,
    lore: summary,
    tags: [...elements, 'Beast'],
    art_path: uploadedArtPath ?? `art/cards/${id}.webp`,
    sort_order: 0,
    _meta: { levelCap: meta.levelCap }, // not persisted; handy for a sanity check
  }
}

// --- step 3: write the card fields back into the sidecar json ---------------

/** Merges the derived card fields into the original json and writes it back. */
export function updateConceptJson(pair, cardRecord) {
  const { _meta, ...card } = cardRecord
  const updated = { ...pair.raw, ...card }
  writeFileSync(pair.jsonPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8')
  return updated
}

/** Converts the source image to WebP and writes it into public/art/cards/<id>.webp. */
export async function stageArt(imagePath, id) {
  const outDir = join(root, 'public', 'art', 'cards')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, `${id}.webp`)
  writeFileSync(outPath, await toWebp(readFileSync(imagePath)))
  return outPath
}

// --- step 4: import straight into Supabase -----------------------------------

/** Creates a service-role Supabase client. Never pass the anon key here. */
export async function createServiceClient({ supabaseUrl, serviceRoleKey }) {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Supabase admin calls need supabaseUrl + serviceRoleKey (never the anon key). ' +
        'Set env vars SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or pass --supabase-url / --service-key). ' +
        'For the local stack, run `npx supabase status -o env` to get both values.',
    )
  }
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Re-encodes a source image (any format sharp reads) to WebP. Matches the
 * `art/cards/<id>.webp` convention every other card in data/cards.csv uses. */
async function toWebp(buffer) {
  const sharp = (await import('sharp')).default
  return sharp(buffer).webp({ quality: 90 }).toBuffer()
}

/**
 * Converts a card's art to WebP and uploads it to the public `card-art`
 * Storage bucket (created if missing), returning its public URL. Card art is
 * public game asset data, not player progression, so a public bucket +
 * service-role upload is fine.
 */
export async function uploadArtToSupabase(admin, imagePath, id) {
  const { data: buckets, error: listError } = await admin.storage.listBuckets()
  if (listError) throw new Error(`storage.listBuckets failed: ${listError.message}`)
  if (!buckets.some((b) => b.name === CARD_ART_BUCKET)) {
    const { error: createError } = await admin.storage.createBucket(CARD_ART_BUCKET, { public: true })
    if (createError) throw new Error(`storage.createBucket failed: ${createError.message}`)
  }

  const objectPath = `${id}.webp`
  const webp = await toWebp(readFileSync(imagePath))
  const { error: uploadError } = await admin.storage.from(CARD_ART_BUCKET).upload(objectPath, webp, {
    contentType: 'image/webp',
    upsert: true,
  })
  if (uploadError) throw new Error(`storage upload failed for ${id}: ${uploadError.message}`)

  const { data } = admin.storage.from(CARD_ART_BUCKET).getPublicUrl(objectPath)
  return data.publicUrl
}

/**
 * The rank-up ladder a card needs to be upgradeable, derived from the same
 * `RANK_UP_LADDER` the seed uses (src/game/formulas.ts) so a balance change
 * reaches imported cards too. Without these rows `rank_up_card` raises
 * "this card cannot rank up further" and the detail screen shows no path.
 *
 * The cost is charged by TAG, not faction: `rankUpCost` turns the card's tags into one
 * Core requirement per tag (Beast + Fire needs Beast *and* Fire Cores), so re-run the
 * card import after any change to the ladder or to a card's tags.
 */
export function buildRankCostRows(cards) {
  const rows = []
  for (const card of cards) {
    for (let from = Number(card.rank); from < 5; from += 1) {
      const cost = rankUpCost(from, card.tags ?? [])
      rows.push({
        card_id: card.id,
        from_rank: from,
        materials: cost.materials,
        to_rank: from + 1,
        gold: cost.gold,
      })
    }
  }
  return rows
}

/**
 * Upserts rows into public.cards using a service-role client (bypasses RLS,
 * same as the seed does over a direct Postgres connection). Cards are catalog
 * data, not player progression, so a trusted server-side write here is fine.
 */
export async function importCardsToSupabase(admin, cards) {
  const rows = cards.map(({ _meta, ...card }) => card)
  const { data, error } = await admin.from('cards').upsert(rows, { onConflict: 'id' }).select('id')
  if (error) throw new Error(`supabase upsert failed: ${error.message}`)
  return data
}

/**
 * Upserts the per-card rank-up costs. Runs after `importCardsToSupabase` so the
 * `card_id` foreign key always resolves.
 */
export async function importRankCostsToSupabase(admin, cards) {
  const rows = buildRankCostRows(cards)
  if (!rows.length) return []
  const { data, error } = await admin
    .from('card_rank_costs')
    .upsert(rows, { onConflict: 'card_id,to_rank' })
    .select('card_id')
  if (error) throw new Error(`supabase rank-cost upsert failed: ${error.message}`)
  return data
}

// --- CLI ----------------------------------------------------------------------

async function main() {
  // Windows argv quirk: a trailing `\` before the closing quote (e.g. 'C:\foo\')
  // is parsed as an escaped literal `"`, so the shell never actually closes the
  // string — any flags typed after get absorbed into this same argument. Split
  // them back out before handing off to parseArgs.
  const rawArgs = process.argv.slice(2).flatMap((arg) => {
    const quoteIndex = arg.indexOf('"')
    if (quoteIndex === -1) return [arg]
    const before = arg.slice(0, quoteIndex)
    const after = arg.slice(quoteIndex + 1).trim()
    return after ? [before, ...after.split(/\s+/)] : [before]
  })

  const { positionals, values } = parseArgs({
    args: rawArgs,
    allowPositionals: true,
    options: {
      import: { type: 'boolean', default: false },
      'upload-art': { type: 'boolean', default: false },
      'stage-art': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      'supabase-url': { type: 'string' },
      'service-key': { type: 'string' },
    },
  })

  const folder = positionals[0]?.replace(/["']+$/, '')
  if (!folder) {
    console.error('usage: node scripts/import-concept-cards.mjs <folder> [--import] [--upload-art] [--stage-art] [--dry-run]')
    process.exit(1)
  }

  const pairs = scanExportFolder(folder)
  if (!pairs.length) {
    console.error(`no json+image pairs found in ${folder}`)
    process.exit(1)
  }

  let admin
  if ((values.import || values['upload-art']) && !values['dry-run']) {
    admin = await createServiceClient({
      supabaseUrl: values['supabase-url'] ?? process.env.SUPABASE_URL,
      serviceRoleKey: values['service-key'] ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
    })
  }

  const existingIds = new Set()
  const cards = []
  for (const pair of pairs) {
    const card = buildCardRecord(pair, existingIds)
    console.log(`${pair.title} -> ${card.name} (${card.id}) [${card.faction}/${card.role}, ${card.rank}★]`)

    if (!values['dry-run']) {
      if (values['upload-art']) {
        card.art_path = await uploadArtToSupabase(admin, pair.imagePath, card.id)
        console.log(`  uploaded art -> ${card.art_path}`)
      }
      updateConceptJson(pair, card)
      if (values['stage-art']) stageArt(pair.imagePath, card.id)
    }
    cards.push(card)
  }

  if (values.import && !values['dry-run']) {
    const inserted = await importCardsToSupabase(admin, cards)
    console.log(`imported ${inserted.length} card(s) into Supabase`)
    const costs = await importRankCostsToSupabase(admin, cards)
    console.log(`imported ${costs.length} rank-up cost row(s) into Supabase`)
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
