/**
 * Quest pipeline, stage 2 — *import*: turns every authored chain in `data/` into rows that
 * match the `quests` table (src/types/db.ts) and, optionally, pushes them straight into
 * Supabase with a service-role token.
 *
 * The source of truth is a chain file ending in `.quests.json` (e.g.
 * `data/the-long-dark.quests.json`), validated by `data/quest-chain.schema.json`. Each file
 * names the bestiary in `data/` its opponents come from, and an opponent is named by its
 * bestiary id — never restating stats. `src/game/quests.ts` is the loader that joins the two,
 * so this importer runs the SAME loader the content test does: an import can never disagree
 * with what the test proves about the chain.
 *
 * This importer only *references* an opponent: the bestiary's `type=card` rows are imported as
 * real `cards` rows by `npm run assets:import` (the same card importer as the pull pool), so a
 * quest's `cardId` resolves to art and a name and nothing here writes a card. Run `assets:import`
 * before this one so every referenced opponent exists.
 *
 * Quests are catalog content, not player progression, and are deliberately NOT seeded — this
 * importer is the only writer of `public.quests` (`npm run seed:build` leaves it empty). The
 * server pays a clear (`complete_quest` re-reads the row), so the reward written here is the
 * reward that is paid.
 *
 * A quest with no `intro`/`outro` is still a Hook line in the design doc, not shippable
 * content: the client walks intro → fight → outro, and an empty script would strand the
 * player on a blank overlay. Those quests are skipped with a warning rather than shipped
 * without dialogue (the same call the card importer makes for a row with no art).
 *
 * Idempotent: rows are upserted on `id`, so re-running refreshes a chain in place and never
 * deletes a quest a later run no longer mentions.
 *
 * This is a content-authoring tool, not app code: it talks to Postgres with the service_role
 * key (never the anon key), so it must only ever be run from a trusted machine/CI, never
 * shipped to the client.
 *
 * Usage:
 *   node scripts/quests-2-import.mjs [folder] [options]
 *
 * Options:
 *   --import              Upsert the quest rows into Supabase.
 *   --dry-run             Print what would be written, import nothing.
 *   --supabase-url=<url>  Defaults to env SUPABASE_URL.
 *   --service-key=<key>   Defaults to env SUPABASE_SERVICE_ROLE_KEY.
 */
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Picks up SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from .env.local without
// requiring it to be exported in the shell first.
if (existsSync(join(root, '.env.local'))) process.loadEnvFile(join(root, '.env.local'))

import { allCoreIds } from '../src/game/formulas.ts'
import { loadQuests } from '../src/game/quests.ts'

/** The chains ship in `data/`, and the loader resolves a file name against it too. */
const DEFAULT_DATA_DIR = join(root, 'data')

/** How many skipped ids a file's warning lists before it stops enumerating them. */
const SKIP_LIST_CAP = 8

// --- step 1: scan the data folder --------------------------------------------

/**
 * Every `<name>.quests.json` directly in `folder`, in a stable order. The loader resolves the
 * returned name against `data/`, so a chain file must live there — a subfolder would need the
 * loader's `bestiary` field to point at it as well.
 */
export function scanQuestFiles(folder) {
  if (!existsSync(folder)) throw new Error(`data folder not found: ${folder}`)
  return readdirSync(folder)
    .filter((name) => name.toLowerCase().endsWith('.quests.json'))
    .sort()
}

// --- step 2: join each chain to its bestiary and shape the rows ---------------

/** One row for `public.quests`, straight from the loader's `Quest`. */
export function toQuestRow(quest) {
  return {
    id: quest.id,
    name: quest.name,
    sort_order: quest.order,
    req_power: quest.reqPower,
    enemies: quest.enemies,
    gold: quest.gold,
    materials: quest.materials,
    first_clear_gold: quest.firstClearGold,
    first_clear_materials: quest.firstClearMaterials,
    intro: quest.intro,
    outro: quest.outro,
  }
}

/**
 * Loads every chain and flattens it into `public.quests` rows.
 *
 * Referential integrity is `loadQuests`'s job: it throws when an opponent names a monster its
 * bestiary does not have. This adds the checks the `quests` table (and the payout behind it)
 * needs: a unique id across the whole scan, a reward that only names real Core materials (the
 * ids `rank_up_card` spends), and a script on both sides of the fight.
 */
export function buildQuestRows(files) {
  const knownMaterials = new Set(allCoreIds())
  const rows = []
  const skipped = []
  const warnings = []
  const idSource = new Map()
  const orderSource = new Map()

  for (const file of files) {
    const quests = loadQuests(file)
    const fileSkipped = []

    for (const quest of quests) {
      if (quest.intro.length === 0 || quest.outro.length === 0) {
        fileSkipped.push(quest.id)
        continue
      }

      const previous = idSource.get(quest.id)
      if (previous) throw new Error(`duplicate quest id "${quest.id}" in ${file} and ${previous}`)
      idSource.set(quest.id, file)

      const sameOrder = orderSource.get(quest.order)
      if (sameOrder) {
        warnings.push(
          `sort_order ${quest.order} is shared by "${quest.id}" and "${sameOrder}" — the client tie-breaks by id`,
        )
      } else {
        orderSource.set(quest.order, quest.id)
      }

      for (const materials of [quest.materials, quest.firstClearMaterials]) {
        for (const materialId of Object.keys(materials)) {
          if (!knownMaterials.has(materialId)) {
            throw new Error(
              `quest ${quest.id}: "${materialId}" is not a Core material id (see allCoreIds in src/game/formulas.ts)`,
            )
          }
        }
      }

      rows.push(toQuestRow(quest))
    }

    skipped.push({ file, ids: fileSkipped })
  }

  return { rows, skipped, warnings }
}

function describeSkips({ file, ids }) {
  if (ids.length === 0) return null
  const shown = ids.slice(0, SKIP_LIST_CAP).join(', ')
  const more = ids.length > SKIP_LIST_CAP ? ` … (+${ids.length - SKIP_LIST_CAP} more)` : ''
  return `${file}: skipped ${ids.length} quest(s) with no intro/outro yet — ${shown}${more}`
}

// --- step 3: import straight into Supabase -----------------------------------

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

/**
 * Upserts rows into public.quests using a service-role client (bypasses RLS, same as the seed
 * used to over a direct Postgres connection). Quests are catalog data, not player progression,
 * so a trusted server-side write here is fine.
 */
export async function importQuestsToSupabase(admin, rows) {
  const { data, error } = await admin.from('quests').upsert(rows, { onConflict: 'id' }).select('id')
  if (error) throw new Error(`supabase upsert failed: ${error.message}`)
  return data
}

// --- CLI ----------------------------------------------------------------------

async function main() {
  // Windows argv quirk: a trailing `\` before the closing quote (e.g. 'C:\foo\') is parsed
  // as an escaped literal `"`, so the shell never actually closes the string — any flags
  // typed after get absorbed into the same argument. Split them back out before parseArgs.
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
      'dry-run': { type: 'boolean', default: false },
      'supabase-url': { type: 'string' },
      'service-key': { type: 'string' },
    },
  })

  const folder = positionals[0]?.replace(/["']+$/, '') ?? DEFAULT_DATA_DIR
  const files = scanQuestFiles(folder)
  if (!files.length) {
    console.warn(`no *.quests.json files in ${folder} — nothing to import`)
    return
  }

  const { rows, skipped, warnings } = buildQuestRows(files)

  for (const entry of skipped) {
    const line = describeSkips(entry)
    if (line) console.warn(`  ${line}`)
  }
  for (const warning of warnings) console.warn(`  warning: ${warning}`)

  console.log(
    `${files.length} chain file(s), ${rows.length} importable quest(s)` +
      ` (${skipped.reduce((sum, entry) => sum + entry.ids.length, 0)} skipped)`,
  )

  if (values['dry-run']) {
    for (const row of rows) {
      console.log(
        `  ${row.id} [order ${row.sort_order}, ${row.enemies.length} enemy(ies), ` +
          `${row.gold}g + first-clear ${row.first_clear_gold}g]`,
      )
    }
    return
  }

  if (!values.import) {
    console.log('dry write — pass --import to push these rows into Supabase')
    return
  }

  if (!rows.length) {
    console.warn('nothing to import — every quest in the scan is still waiting on its script')
    return
  }

  const admin = await createServiceClient({
    supabaseUrl: values['supabase-url'] ?? process.env.SUPABASE_URL,
    serviceRoleKey: values['service-key'] ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
  })
  const inserted = await importQuestsToSupabase(admin, rows)
  console.log(`imported ${inserted.length} quest(s) into Supabase`)
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
