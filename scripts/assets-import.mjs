/**
 * Asset pipeline — *import*: pushes the whole card catalog into Supabase. The cards come from
 * two kinds of file and end up in the same table:
 *
 *   - `data/assets.csv`, the shared catalog's `type=card` rows (the player's pull pool), and
 *   - every `data/*enemies.csv` bestiary, whose rows are also `type=card` — the monsters a quest
 *     fights. An opponent is a real catalog card, so it wears the same `cards` row (art, name)
 *     the rest of the app does; the quest importer only names it by id and never restates it.
 *
 * Both are turned into `Card` records (src/types/db.ts) and, optionally, upserted into Supabase
 * with a service-role token. Art is looked up by
 * card id at data/cards/<id>.png — the file scripts/assets-render.mjs renders for `type=card`
 * rows, bestiaries included — and only rows whose `<id>.png` exists are imported: a row with no
 * art is still an idea, not content, and shipping it would put a placeholder in the catalog.
 *
 * The CSV is the source of truth for id / name / lore / tags / role / passives; whatever a row
 * leaves blank is derived here (tags from the title, role and passives by hash on the id) so a
 * bestiary row — which only carries battle stats, not card fields — still imports. A card's rank
 * is deliberately NOT read from the CSV: every catalog card is a rank-1 base, and the rank a
 * chest rolls belongs to the *copy* that reveal grants, not to the template. The legacy
 * `<Title>.json` sidecars are NOT read: they are kept as provenance of how the first cards were
 * made, not as an input.
 *
 * This is a content-authoring tool, not app code: it talks to Postgres with
 * the service_role key (never the anon key), so it must only ever be run
 * from a trusted machine/CI, never shipped to the client.
 *
 * Usage:
 *   node scripts/assets-import.mjs [artFolder] [options]
 *
 * Options:
 *   --csv=<path>          Main catalog to read. Defaults to data/assets.csv. Every
 *                         `data/*enemies.csv` bestiary is read alongside it, always.
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
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** The shared catalog: one row per asset in data/assets.csv, in display order. */
const ASSETS_CSV = join(root, 'data/assets.csv')

/** Where every `type=card` row's art lives — `<card id>.png` files, not json pairs. */
const DEFAULT_ART_FOLDER = join(root, 'data/cards')

/** The bestiaries sit beside the shared catalog; both are scanned from here. */
const DEFAULT_DATA_DIR = join(root, 'data')

// Picks up SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from .env.local without
// requiring it to be exported in the shell first.
if (existsSync(join(root, '.env.local'))) process.loadEnvFile(join(root, '.env.local'))

import { CARD_BASE_ATK, CARD_BASE_DEF, rollCardSpeed } from '../src/game/formulas.ts'

// --- content tables (edit here, not per-card, to keep cards consistent) -----

/**
 * Element words that can appear after " of " in a concept-art title, mapped onto the
 * card tags in `CORE_TAGS`. Anything not listed here contributes no tag.
 */
const ELEMENT_TO_TAG = {
  Fire: 'fire',
  Dragon: 'dragon',
  Water: 'water',
  Ice: 'ice',
  Earth: 'earth',
  Nature: 'grass',
  Thunder: 'electric',
  Dark: 'dark',
  // Neither has a counterpart in the tag list, so both collapse into the neutral type.
  Light: 'physical',
  Air: 'physical',
}

/** The tag a card gets when its title names no known element — it never ships untaggable. */
const NEUTRAL_TAG = 'physical'

/**
 * Which faction's passive a tag carries. The five factions are unchanged; `physical` is
 * deliberately absent because it is the neutral type, so it falls back like an
 * unknown element always has.
 */
const TAG_TO_FACTION = {
  fire: 'ember',
  dragon: 'ember',
  water: 'tide',
  ice: 'tide',
  grass: 'verdant',
  earth: 'verdant',
  dark: 'umbral',
  electric: 'radiant',
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

// --- step 1: read the catalogs -----------------------------------------------

/** Minimal RFC-4180-ish CSV reader: quoted fields, doubled quotes, CRLF. */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }

  const populated = rows.filter((line) => line.some((cell) => cell !== ''))
  const [header, ...body] = populated
  return body
    .map((line) =>
      Object.fromEntries(header.map((key, index) => [key.trim(), (line[index] ?? '').trim()])),
    )
    .filter((card) => card.id || card.name)
}

/**
 * Reads one csv into row objects, in file order, keeping only `type=card` rows — the shared
 * catalog also carries materials and chests, and a bestiary happens to trail its `type` column.
 * A row without a `type` is treated as a card so an older single-type file still works.
 */
export function readCatalog(csvPath = ASSETS_CSV) {
  return parseCsv(readFileSync(csvPath, 'utf8')).filter((row) => (row.type ?? 'card') === 'card')
}

/**
 * Every bestiary in `data/` — the `<name>.enemies.csv` files a quest chain names as its own
 * (`enemies.csv`, `the-long-dark.enemies.csv`, a future `quest1.enemies.csv`, …). A bestiary is
 * not a different kind of asset: its rows are `type=card`, the same row a player can pull, just
 * with battle stats the shared catalog does not carry. Scanning by suffix is what lets a new
 * chain bring its own monsters without editing this script.
 */
export function enemyCatalogs(dir = DEFAULT_DATA_DIR) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith('enemies.csv'))
    .sort()
    .map((name) => join(dir, name))
}

/**
 * The shared catalog followed by every bestiary — the files whose `type=card` rows become
 * `cards` rows, in the order they are read.
 */
export function cardCatalogs(csvPath = ASSETS_CSV, dir = DEFAULT_DATA_DIR) {
  return [csvPath, ...enemyCatalogs(dir)]
}

/**
 * Reads every catalog file into one row list, in file order, deduped by id. The shared catalog
 * is read first so a promoted row (an enemy the catalog already carries, e.g. `thunder-wolf`)
 * keeps its richer authored fields and the bestiary only supplies monsters the catalog does not.
 * Rows without an id are left to `buildCardRecord` to mint (and dedupe) one.
 */
export function readCatalogRows(files) {
  const seen = new Set()
  const rows = []
  for (const path of files) {
    if (!existsSync(path)) throw new Error(`catalog not found: ${path}`)
    for (const row of readCatalog(path)) {
      const id = (row.id ?? '').trim()
      if (id) {
        if (seen.has(id)) continue
        seen.add(id)
      }
      rows.push(row)
    }
  }
  return rows
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
 * Builds a full Card record (src/types/db.ts) from one catalog row.
 *
 * The CSV wins wherever it has a value; blanks are filled the way the old json-pair importer
 * always did, so an un-promoted idea row — or a bestiary row, which carries battle stats and
 * almost no card fields — still imports. `existingIds` dedupes across the batch.
 */
export function buildCardRecord(row, { index = 0, existingIds = new Set() } = {}) {
  const title = (row.name ?? '').trim()
  const elements = elementsFromTitle(title)
  // A tag per known element, deduped in title order; the neutral tag is the fallback rather
  // than something every card carries, so a single-type card is genuinely single-type.
  const rowTags = (row.tags ?? '').split(';').map((tag) => tag.trim()).filter(Boolean)
  const tags = rowTags.length
    ? rowTags
    : [...new Set(elements.map((element) => ELEMENT_TO_TAG[element]).filter(Boolean))]
  if (!tags.length) tags.push(NEUTRAL_TAG)
  // First tag that actually has an affinity — a Light+Dark card is umbral, not neutral.
  const faction = tags.map((tag) => TAG_TO_FACTION[tag]).find(Boolean) ?? 'verdant'

  // Rank 1 for every card. The catalog row is a template: a copy's rank is decided by the chest
  // that grants it (or by rank_up_card), so neither the CSV's rank cell nor the tag count sets it.
  const rank = 1

  // The id names the art file, so the CSV owns it; only a hand-written row needs one minted.
  let id = (row.id ?? '').trim() || slugify(shortenName(title))
  if (existingIds.has(id)) {
    let n = 2
    while (existingIds.has(`${id}_${n}`)) n += 1
    id = `${id}_${n}`
  }
  existingIds.add(id)

  const role = (row.role ?? '').trim()
  const passive = FACTION_PASSIVES[faction]

  return {
    id,
    name: title || shortenName(id),
    rank,
    faction,
    role: ROLES.includes(role) ? role : pickByHash(id, ROLES),
    // The catalog stores the neutral rank-1 base line: rank is a multiplier applied to the
    // copy, and the level growth is applied per stat, so neither belongs on the template.
    // The CSV's atk/def is a rolled sketch (scripts/cards-1-idea.mjs writes 1-100) and stays
    // ignored — the balance lives in src/game/formulas.ts.
    base_atk: CARD_BASE_ATK,
    base_def: CARD_BASE_DEF,
    passive_name: (row.passive_name ?? '').trim() || passive.name,
    passive_text: (row.passive_text ?? '').trim() || passive.text,
    lore: (row.lore ?? '').trim(),
    tags,
    // Quest turn-order stat (src/game/battle.ts). Derived from the id, not the CSV, so a
    // re-import never churns a card's speed — and the catalog has no second balance table.
    speed: rollCardSpeed(id),
    // Only --stage-art produces this local path; --upload-art replaces it with the public URL.
    art_path: `art/cards/${id}.webp`,
    sort_order: index,
  }
}

// --- step 3: art ---------------------------------------------------------------

/** Extensions an art folder may use for `<id><ext>`, in preference order. */
const ART_EXTS = ['.png', '.webp', '.jpg', '.jpeg']

/** The image for a card id, or null when that card has not been rendered yet. */
export function findCardArt(folder, id) {
  for (const ext of ART_EXTS) {
    const candidate = join(folder, `${id}${ext}`)
    if (existsSync(candidate)) return candidate
  }
  return null
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
 * `art/cards/<id>.webp` convention every other card in data/assets.csv uses. */
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
 * Upserts rows into public.cards using a service-role client (bypasses RLS,
 * same as the seed does over a direct Postgres connection). Cards are catalog
 * data, not player progression, so a trusted server-side write here is fine.
 */
export async function importCardsToSupabase(admin, cards) {
  const { data, error } = await admin.from('cards').upsert(cards, { onConflict: 'id' }).select('id')
  if (error) throw new Error(`supabase upsert failed: ${error.message}`)
  return data
}

/**
 * The per-card rank-up costs are gone: a rank-up consumes duplicate copies, not catalog rows,
 * so `card_rank_costs` is no longer written (see card_progression migration). Kept as a
 * no-op so callers that still invoke it do not break.
 */
export async function importRankCostsToSupabase() {
  return []
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
      csv: { type: 'string' },
      import: { type: 'boolean', default: false },
      'upload-art': { type: 'boolean', default: false },
      'stage-art': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      'supabase-url': { type: 'string' },
      'service-key': { type: 'string' },
    },
  })

  const artFolder = positionals[0]?.replace(/["']+$/, '') || DEFAULT_ART_FOLDER
  const csvPath = values.csv ? join(root, values.csv) : ASSETS_CSV
  if (!existsSync(csvPath)) {
    console.error(`catalog not found: ${csvPath}`)
    process.exit(1)
  }

  // The shared catalog plus every bestiary: an enemy row is a `type=card` row, so it imports
  // through the same path as any other card.
  const catalogs = cardCatalogs(csvPath)
  const rows = readCatalogRows(catalogs)
  if (!rows.length) {
    console.error(`no card rows found in ${catalogs.map((path) => relative(root, path)).join(', ')}`)
    process.exit(1)
  }
  console.log(`catalogs: ${catalogs.map((path) => relative(root, path)).join(', ')}`)

  let admin
  if ((values.import || values['upload-art']) && !values['dry-run']) {
    admin = await createServiceClient({
      supabaseUrl: values['supabase-url'] ?? process.env.SUPABASE_URL,
      serviceRoleKey: values['service-key'] ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
    })
  }

  const existingIds = new Set()
  const cards = []
  const withoutArt = []
  for (const [index, row] of rows.entries()) {
    const card = buildCardRecord(row, { index, existingIds })
    // Art is found by card id — the name scripts/assets-render.mjs writes it under. A row with
    // no image is still an idea, not content, so it is skipped instead of imported artless.
    const imagePath = findCardArt(artFolder, card.id)
    if (!imagePath) {
      withoutArt.push(card.id)
      console.warn(`skipping ${card.id}: no art in ${artFolder}`)
      continue
    }

    console.log(
      `${card.id} -> ${card.name} [${card.faction}/${card.role}, ${card.rank}★, tags: ${card.tags.join('+')}]`,
    )

    if (!values['dry-run']) {
      if (values['upload-art']) {
        card.art_path = await uploadArtToSupabase(admin, imagePath, card.id)
        console.log(`  uploaded art -> ${card.art_path}`)
      }
      if (values['stage-art']) stageArt(imagePath, card.id)
    }
    cards.push(card)
  }
  if (withoutArt.length) {
    console.warn(`${withoutArt.length} of ${rows.length} row(s) skipped for missing art — run npm run assets:render`)
  }
  if (!cards.length) {
    console.error(`no card in ${catalogs.map((path) => relative(root, path)).join(', ')} has art in ${artFolder} — nothing to import`)
    process.exit(1)
  }

  if (values.import && !values['dry-run']) {
    const inserted = await importCardsToSupabase(admin, cards)
    console.log(`imported ${inserted.length} card(s) into Supabase`)
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
