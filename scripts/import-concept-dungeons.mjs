/**
 * Reusable pipeline for turning a folder of dungeon key-art exports (one
 * `<Title>.json` + `<Title>.png` pair per dungeon) into rows that match the
 * `dungeons` table (src/types/db.ts) and, optionally, pushing them straight into
 * Supabase with a service-role token.
 *
 * The sidecar JSON is treated as a read-only *source*: unlike the card importer
 * this script never writes derived fields back into it. Re-runs therefore read
 * any previously-uploaded `art_path` back from the database instead of the file,
 * so `--import` alone never clobbers art already in Storage.
 *
 * A dungeon only has a name to carry over from its sidecar; the numbers an
 * economy needs (kind, tier, power, timer, gold, drops) don't exist in the art
 * metadata, so they are *rolled* here. Rolls are seeded from the dungeon name,
 * so the same source always yields the same dungeon across runs (no churn on
 * re-import) while staying comfortably random-looking.
 *
 * This is a content-authoring tool, not app code: it talks to Postgres with the
 * service_role key (never the anon key), so it must only ever be run from a
 * trusted machine/CI, never shipped to the client.
 *
 * Usage:
 *   node scripts/import-concept-dungeons.mjs <folder> [options]
 *
 * Options:
 *   --import              Also upsert the derived dungeons into Supabase.
 *   --upload-art          Re-encode each image to WebP, upload it to the public
 *                         `dungeon-art` Storage bucket, and point art_path at
 *                         its public URL — matching the art/dungeons/<id>.webp
 *                         convention.
 *   --supabase-url=<url>  Defaults to env SUPABASE_URL.
 *   --service-key=<key>   Defaults to env SUPABASE_SERVICE_ROLE_KEY.
 *   --stage-art           Re-encode each image to WebP into public/art/dungeons/<id>.webp.
 *   --dry-run             Print what would happen, write/import nothing.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Picks up SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from .env.local without
// requiring it to be exported in the shell first.
if (existsSync(join(root, '.env.local'))) process.loadEnvFile(join(root, '.env.local'))

// --- content tables (edit here, not per-dungeon, to keep dungeons coherent) ---

/** Public Storage bucket dungeon art is uploaded to (created on first use). */
const DUNGEON_ART_BUCKET = 'dungeon-art'

/**
 * Per-tier target economy. These are authoring-time defaults, not runtime
 * balance — the numbers that actually gate a run live in the `dungeons` rows,
 * which is why jitter (not these bands) decides the shipped value.
 */
const TIER_BANDS = {
  1: { power: 150, gold: 60, duration: 300 },
  2: { power: 500, gold: 300, duration: 1800 },
  3: { power: 1500, gold: 1200, duration: 3600 },
  4: { power: 4500, gold: 4500, duration: 14400 },
  5: { power: 9000, gold: 9000, duration: 28800 },
}

/** Most dungeons are farms; bosses stay rare so a boss clear still feels like one. */
const KIND_WEIGHTS = [
  ['resource', 45],
  ['card', 35],
  ['boss', 20],
]

/** Lower tiers are common, the top of the ladder is a destination. */
const TIER_WEIGHTS = [
  [1, 22],
  [2, 26],
  [3, 22],
  [4, 18],
  [5, 12],
]

/** Material pool a tier can drop — mirrors MATERIALS in scripts/build-seed.mjs. */
const MATERIALS_BY_TIER = {
  1: ['common_shard', 'iron_ore'],
  2: ['uncommon_shard', 'iron_ore', 'ember_essence', 'tide_essence', 'verdant_essence', 'umbral_essence', 'radiant_essence'],
  3: ['rare_shard', 'crystal', 'beast_fang', 'ember_essence', 'tide_essence'],
  4: ['epic_shard', 'crystal', 'beast_fang', 'boss_core'],
  5: ['mythic_shard', 'boss_core', 'epic_shard'],
}

/** The chest a clear hands out — one step up the ladder per tier. */
const CHEST_BY_TIER = { 1: 'common', 2: 'rare', 3: 'epic', 4: 'legendary', 5: 'mythic' }

/** Dungeons gate on player level so early tiers don't overwhelm a new account. */
const UNLOCK_LEVEL_BY_TIER = { 1: 1, 2: 3, 3: 6, 4: 10, 5: 15 }

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
    const raw = JSON.parse(readFileSync(join(folder, jsonFile), 'utf8'))
    pairs.push({
      jsonPath: join(folder, jsonFile),
      imagePath: join(folder, imageFile),
      title: raw.title ?? stem,
      summary: raw.summary ?? '',
      raw,
    })
  }
  return pairs
}

// --- step 2: derive dungeon fields from the title ----------------------------

/** Drops a leading article and keeps the first 3 words — the seed's names are terse. */
export function shortenDungeonName(title) {
  const words = title.trim().split(/\s+/).filter(Boolean)
  const start = /^(a|an|the)$/i.test(words[0] ?? '') ? 1 : 0
  return words.slice(start, start + 3).join(' ')
}

export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/**
 * Deterministic PRNG seeded from a string (mulberry32 with a cheap string hash).
 * Seeding from the id is what makes re-imports stable: the "random" numbers are
 * reproducible, so only a rename changes a dungeon's rolled stats.
 */
export function makeRng(seed) {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function weightedPick(rng, entries) {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
  let cursor = rng() * total
  for (const [value, weight] of entries) {
    cursor -= weight
    if (cursor < 0) return value
  }
  return entries[entries.length - 1][0]
}

/** Rounds to a step that scales with magnitude, so values read as designed. */
function roundNice(value) {
  const step = value < 1000 ? 10 : value < 10000 ? 100 : 1000
  return Math.round(value / step) * step
}

/** Random weights that sum to exactly 100 (largest-remainder on the last entry). */
function weightsSummingTo100(count, rng) {
  const raw = Array.from({ length: count }, () => 0.5 + rng())
  const total = raw.reduce((sum, weight) => sum + weight, 0)
  const weights = raw.map((weight) => Math.round((weight / total) * 100))
  weights[count - 1] += 100 - weights.reduce((sum, weight) => sum + weight, 0)
  return weights
}

function buildDrops(tier, rng) {
  const pool = [...MATERIALS_BY_TIER[tier]]
  const count = Math.min(pool.length, rng() < 0.5 ? 2 : 3)
  const chosen = []
  for (let i = 0; i < count; i += 1) {
    chosen.push(pool.splice(Math.floor(rng() * pool.length), 1)[0])
  }

  const weights = weightsSummingTo100(chosen.length, rng)
  return chosen.map((material_id, index) => ({
    material_id,
    weight: weights[index],
    min: 1,
    // Deeper tiers hand out bigger stacks, so the material sink stays meaningful.
    max: 1 + tier + Math.floor(rng() * 2),
  }))
}

/**
 * Builds a full `dungeons` row (src/types/db.ts) from a scanned pair. The roll
 * is seeded from the slugified name (not the deduped id), so a cluster of
 * same-named files still each get their own stable numbers.
 *
 * `existingArtPaths` maps id -> art_path already in the database; it is the only
 * place a previously-uploaded URL can come from, since the source JSON is never
 * written back to.
 */
export function buildDungeonRecord({ title }, existingIds = new Set(), existingArtPaths = new Map()) {
  const rng = makeRng(slugify(shortenDungeonName(title)))

  const name = shortenDungeonName(title)
  let id = slugify(name)
  if (existingIds.has(id)) {
    let n = 2
    while (existingIds.has(`${id}_${n}`)) n += 1
    id = `${id}_${n}`
  }
  existingIds.add(id)

  const kind = weightedPick(rng, KIND_WEIGHTS)
  const tier = weightedPick(rng, TIER_WEIGHTS)
  const band = TIER_BANDS[tier]

  const power = roundNice(band.power * (0.85 + rng() * 0.3))
  const gold = roundNice(band.gold * (0.85 + rng() * 0.3))
  // Timers land on whole minutes — a 47-second dungeon isn't a thing to check back on.
  const duration = Math.max(60, Math.round((band.duration * (0.8 + rng() * 0.4)) / 60) * 60)

  const uploadedArtPath = existingArtPaths.get(id)

  return {
    id,
    name,
    kind,
    tier,
    req_power: power,
    duration_seconds: duration,
    gold_base: gold,
    materials: buildDrops(tier, rng),
    card_id: null,
    unlocks_at_level: UNLOCK_LEVEL_BY_TIER[tier],
    chest_on_clear: CHEST_BY_TIER[tier],
    art_path: uploadedArtPath ?? `art/dungeons/${id}.webp`,
  }
}

// --- step 3: stage art locally (optional) ------------------------------------

/** Converts the source image to WebP and writes it into public/art/dungeons/<id>.webp. */
export async function stageArt(imagePath, id) {
  const outDir = join(root, 'public', 'art', 'dungeons')
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

/** Re-encodes a source image (any format sharp reads) to WebP. */
async function toWebp(buffer) {
  const sharp = (await import('sharp')).default
  return sharp(buffer).webp({ quality: 90 }).toBuffer()
}

/**
 * Reads the art_path already stored for every dungeon. Re-importing without
 * `--upload-art` must not blank out an art URL the database already has, and the
 * source JSON is never written back to, so this is the only place to recover it.
 */
export async function fetchExistingArtPaths(admin) {
  const { data, error } = await admin.from('dungeons').select('id, art_path')
  if (error) throw new Error(`failed to read existing dungeons: ${error.message}`)
  return new Map((data ?? []).map((row) => [row.id, row.art_path]))
}

/**
 * Converts a dungeon's art to WebP and uploads it to the public `dungeon-art`
 * Storage bucket (created if missing), returning its public URL. Dungeon art is
 * public game asset data, not player progression, so a public bucket +
 * service-role upload is fine.
 */
export async function uploadArtToSupabase(admin, imagePath, id) {
  const { data: buckets, error: listError } = await admin.storage.listBuckets()
  if (listError) throw new Error(`storage.listBuckets failed: ${listError.message}`)
  if (!buckets.some((b) => b.name === DUNGEON_ART_BUCKET)) {
    const { error: createError } = await admin.storage.createBucket(DUNGEON_ART_BUCKET, { public: true })
    if (createError) throw new Error(`storage.createBucket failed: ${createError.message}`)
  }

  const objectPath = `${id}.webp`
  const webp = await toWebp(readFileSync(imagePath))
  const { error: uploadError } = await admin.storage.from(DUNGEON_ART_BUCKET).upload(objectPath, webp, {
    contentType: 'image/webp',
    upsert: true,
  })
  if (uploadError) throw new Error(`storage upload failed for ${id}: ${uploadError.message}`)

  const { data } = admin.storage.from(DUNGEON_ART_BUCKET).getPublicUrl(objectPath)
  return data.publicUrl
}

/**
 * Upserts rows into public.dungeons using a service-role client (bypasses RLS,
 * same as the seed does over a direct Postgres connection). Dungeons are catalog
 * data, not player progression, so a trusted server-side write here is fine.
 */
export async function importDungeonsToSupabase(admin, dungeons) {
  const { data, error } = await admin.from('dungeons').upsert(dungeons, { onConflict: 'id' }).select('id')
  if (error) throw new Error(`supabase upsert failed: ${error.message}`)
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
    console.error(
      'usage: node scripts/import-concept-dungeons.mjs <folder> [--import] [--upload-art] [--stage-art] [--dry-run]',
    )
    process.exit(1)
  }

  const pairs = scanExportFolder(folder)
  if (!pairs.length) {
    console.error(`no json+image pairs found in ${folder}`)
    process.exit(1)
  }

  let admin
  let existingArtPaths = new Map()
  if ((values.import || values['upload-art']) && !values['dry-run']) {
    admin = await createServiceClient({
      supabaseUrl: values['supabase-url'] ?? process.env.SUPABASE_URL,
      serviceRoleKey: values['service-key'] ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
    })
    existingArtPaths = await fetchExistingArtPaths(admin)
  }

  const existingIds = new Set()
  const dungeons = []
  for (const pair of pairs) {
    const dungeon = buildDungeonRecord(pair, existingIds, existingArtPaths)
    console.log(
      `${pair.title} -> ${dungeon.name} (${dungeon.id}) [${dungeon.kind}/T${dungeon.tier}, ` +
        `${dungeon.req_power} power, ${dungeon.duration_seconds}s, ${dungeon.gold_base}g]`,
    )

    if (!values['dry-run']) {
      if (values['upload-art']) {
        dungeon.art_path = await uploadArtToSupabase(admin, pair.imagePath, dungeon.id)
        console.log(`  uploaded art -> ${dungeon.art_path}`)
      }
      if (values['stage-art']) stageArt(pair.imagePath, dungeon.id)
    }
    dungeons.push(dungeon)
  }

  if (values.import && !values['dry-run']) {
    const inserted = await importDungeonsToSupabase(admin, dungeons)
    console.log(`imported ${inserted.length} dungeon(s) into Supabase`)
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
