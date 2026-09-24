/**
 * Material pipeline, stage 4 of 4 — *import*: turns the rendered icons in data/materials
 * (`<id>.png`, one per material) into the `materials.icon` column, optionally re-encoding
 * them to WebP and uploading to the public `material-art` Storage bucket first.
 *
 * Materials have no idea/design stage (the catalog is derived from CORE_TAGS / CORE_VARIANTS
 * and the prompts already live in data/materials.csv), and no row to *insert*: scripts/
 * build-seed.mjs owns the catalog, so this stage only ever updates the `icon` of a row that
 * already exists. A CSV id with no matching material row is reported and skipped rather than
 * invented.
 *
 * Only rows whose art actually exists are imported: a material with no `<id>.png` is not
 * content yet, so `icon` is left alone instead of pointing at nothing.
 *
 * This is a content-authoring tool, not app code: it talks to Postgres with the
 * service_role key (never the anon key), so it must only ever be run from a trusted
 * machine/CI, never shipped to the client.
 *
 * Usage:
 *   node scripts/materials-4-import.mjs [artFolder] [options]
 *
 * Options:
 *   --csv=<path>          Catalog to read. Defaults to data/materials.csv.
 *   --import              Write the resolved `icon` into Supabase.
 *   --upload-art          Re-encode each png to WebP, upload it to the public
 *                         `material-art` bucket and point `icon` at its public URL.
 *   --stage-art           Re-encode each png to WebP into public/art/materials/<id>.webp.
 *   --supabase-url=<url>  Defaults to env SUPABASE_URL.
 *   --service-key=<key>   Defaults to env SUPABASE_SERVICE_ROLE_KEY.
 *   --dry-run             Print what would happen, write/import nothing.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** The catalog: one row per material, in display order. */
const MATERIALS_CSV = join(root, 'data/materials.csv')

/** Where the rendered material icons live — `<material id>.png` files. */
const DEFAULT_ART_FOLDER = join(root, 'data/materials')

/** Public Storage bucket material icons are uploaded to (created on first use). */
const MATERIAL_ART_BUCKET = 'material-art'

// Picks up SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from .env.local without
// requiring it to be exported in the shell first.
if (existsSync(join(root, '.env.local'))) process.loadEnvFile(join(root, '.env.local'))

// --- step 1: read the catalog csv --------------------------------------------

/** Minimal RFC-4180-ish CSV reader: quoted fields, doubled quotes, CRLF. Rows stay arrays. */
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
    if (char === '"') quoted = true
    else if (char === ',') {
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
    .filter((material) => material.id)
}

/** Reads the material catalog csv into row objects, in file order. */
export function readCatalog(csvPath = MATERIALS_CSV) {
  return parseCsv(readFileSync(csvPath, 'utf8'))
}

// --- step 2: art ---------------------------------------------------------------

/** Extensions an art folder may use for `<id><ext>`, in preference order. */
const ART_EXTS = ['.png', '.webp', '.jpg', '.jpeg']

/** The image for a material id, or null when that material has not been rendered yet. */
export function findMaterialArt(folder, id) {
  for (const ext of ART_EXTS) {
    const candidate = join(folder, `${id}${ext}`)
    if (existsSync(candidate)) return candidate
  }
  return null
}

/** Converts the source image to WebP and writes it into public/art/materials/<id>.webp. */
export async function stageArt(imagePath, id) {
  const outDir = join(root, 'public', 'art', 'materials')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, `${id}.webp`)
  writeFileSync(outPath, await toWebp(readFileSync(imagePath)))
  return outPath
}

// --- step 3: import straight into Supabase ------------------------------------

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
 * The `icon` already stored for every material. `--import` without `--upload-art` must not
 * blank a URL the database already has, so this is how a re-run recovers it.
 */
export async function fetchExistingIcons(admin) {
  const { data, error } = await admin.from('materials').select('id, icon')
  if (error) throw new Error(`failed to read existing materials: ${error.message}`)
  return new Map((data ?? []).map((row) => [row.id, row.icon]))
}

/**
 * Converts a material's icon to WebP and uploads it to the public `material-art` Storage
 * bucket (created if missing), returning its public URL. Material icons are public
 * game-asset data, not player progression, so a public bucket + service-role upload is fine.
 */
export async function uploadArtToSupabase(admin, imagePath, id) {
  const { data: buckets, error: listError } = await admin.storage.listBuckets()
  if (listError) throw new Error(`storage.listBuckets failed: ${listError.message}`)
  if (!buckets.some((b) => b.name === MATERIAL_ART_BUCKET)) {
    const { error: createError } = await admin.storage.createBucket(MATERIAL_ART_BUCKET, { public: true })
    if (createError) throw new Error(`storage.createBucket failed: ${createError.message}`)
  }

  const objectPath = `${id}.webp`
  const webp = await toWebp(readFileSync(imagePath))
  const { error: uploadError } = await admin.storage.from(MATERIAL_ART_BUCKET).upload(objectPath, webp, {
    contentType: 'image/webp',
    upsert: true,
  })
  if (uploadError) throw new Error(`storage upload failed for ${id}: ${uploadError.message}`)

  const { data } = admin.storage.from(MATERIAL_ART_BUCKET).getPublicUrl(objectPath)
  return data.publicUrl
}

/**
 * Sets `icon` on the given material rows. A material is seeded catalog data, so this is an
 * update and never an upsert — a row the seed does not know about is a mistake, not a card
 * to mint. Sequential on purpose: 41 tiny updates is not worth a bulk payload, and it keeps
 * a failure pinned to the id it happened on.
 */
export async function importIconsToSupabase(admin, updates) {
  let updated = 0
  for (const { id, icon } of updates) {
    const { error } = await admin.from('materials').update({ icon }).eq('id', id)
    if (error) throw new Error(`supabase update failed for ${id}: ${error.message}`)
    updated += 1
  }
  return updated
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
  const csvPath = values.csv ? join(root, values.csv) : MATERIALS_CSV
  const rows = readCatalog(csvPath)
  if (!rows.length) {
    console.error(`no material rows found in ${csvPath}`)
    process.exit(1)
  }

  const wantsDb = (values.import || values['upload-art']) && !values['dry-run']
  let admin
  let existingIcons = new Map()
  if (wantsDb) {
    admin = await createServiceClient({
      supabaseUrl: values['supabase-url'] ?? process.env.SUPABASE_URL,
      serviceRoleKey: values['service-key'] ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
    })
    existingIcons = await fetchExistingIcons(admin)
  }

  const updates = []
  const withoutArt = []
  const unknown = []
  for (const row of rows) {
    if (wantsDb && !existingIcons.has(row.id)) {
      unknown.push(row.id)
      continue
    }

    const imagePath = findMaterialArt(artFolder, row.id)
    if (!imagePath) {
      withoutArt.push(row.id)
      continue
    }

    if (values['dry-run']) {
      console.log(`${row.id} -> ${values['upload-art'] ? 'upload + icon url' : imagePath}`)
      updates.push({ id: row.id, icon: null })
      continue
    }

    let icon = existingIcons.get(row.id) ?? null
    if (values['upload-art']) {
      icon = await uploadArtToSupabase(admin, imagePath, row.id)
      console.log(`${row.id} -> uploaded ${icon}`)
    } else if (values['stage-art']) {
      stageArt(imagePath, row.id)
      icon = `art/materials/${row.id}.webp`
      console.log(`${row.id} -> staged ${icon}`)
    } else {
      console.log(`${row.id} -> ${icon ?? '(no icon)'}`)
    }
    updates.push({ id: row.id, icon })
  }

  if (unknown.length) {
    console.warn(
      `${unknown.length} csv id(s) have no materials row — run npm run seed:build + db reset: ${unknown.join(', ')}`,
    )
  }
  if (withoutArt.length) {
    console.warn(
      `${withoutArt.length} of ${rows.length} material(s) have no art in ${artFolder} — run npm run materials:3:render`,
    )
  }

  if (!updates.length) {
    console.error(`no material in ${csvPath} has art in ${artFolder} — nothing to import`)
    process.exit(1)
  }

  if (values['dry-run']) {
    console.log(`dry-run: ${updates.length} material(s) not written`)
    process.exit(0)
  }

  if (values.import) {
    const updated = await importIconsToSupabase(admin, updates)
    console.log(`updated ${updated} material icon(s) in Supabase`)
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
