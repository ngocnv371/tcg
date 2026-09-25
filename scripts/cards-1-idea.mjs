/**
 * Asset pipeline (cards), stage 1 of 4 — *idea*: rolls new card ideas from the pools in IDEATE.MD
 * (an animal + 1-2 elements, named animal-first so the catalog sorts by species) and
 * appends them to data/assets.csv with `type=card`. Stage 2 is scripts/cards-2-design.mjs,
 * which writes the `design` prompt for those rows.
 *
 * These are seeds, not content: only the columns we can roll from IDEATE.MD are filled
 * (id, type, name, rank, faction, base_atk, base_def, tags, plus the `status=idea` marker).
 * role / passive_name / passive_text / lore are left blank because those are design
 * decisions, not dice — which is also why this never touches data/cards/*.json: that
 * folder is the finished art pipeline, this is the sketchbook in front of it.
 *
 * A roll that matches an id already in the CSV or an art file already rendered in
 * data/cards/ is dropped, so re-running a batch is additive only (see `takenIds`).
 *
 * Usage: node scripts/cards-1-idea.mjs [options]
 *
 * Options:
 *   --count=<n>   How many ideas to append. Default 25.
 *   --seed=<n>    PRNG seed. Omit for a random seed (printed, so a batch can be
 *                 reproduced with `--seed=<n>`).
 *   --dry-run     Print the rows without writing to the CSV.
 *   --help        Show this message.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS_CSV = join(root, 'data/assets.csv')
const CONCEPT_DIR = join(root, 'data/cards')

// --- pools (IDEATE.MD) --------------------------------------------------------

const ANIMALS = [
  'Mouse',
  'Cat',
  'Dog',
  'Sparrow',
  'Beaver',
  'Penguin',
  'Tiger',
  'Lion',
  'Horse',
  'Chicken',
  'Snake',
  'Firefly',
  'Deer',
  'Turtle',
  'Pig',
  'Badger',
  'Spider',
  'Rabbit',
  'Fox',
  'Raccoon',
  'Heron',
  'Crow',
  'Otter',
  'Owl',
  'Eagle',
]

/**
 * Element word -> card tag id. Mirrors ELEMENT_TO_TAG in
 * scripts/cards-4-import.mjs so an idea tagged here means the same thing
 * once it becomes real content.
 *
 * `physical` is deliberately absent: it is the *fallback* tag for a card whose title names
 * no known element (see the importer), so rolling it as an element would invent cards whose
 * only tag is the one that means "we could not tell". Ideas always name a real element.
 */
const ELEMENTS = [
  { word: 'Fire', tag: 'fire' },
  { word: 'Water', tag: 'water' },
  { word: 'Ice', tag: 'ice' },
  { word: 'Grass', tag: 'grass' },
  { word: 'Electric', tag: 'electric' },
  { word: 'Dark', tag: 'dark' },
  { word: 'Dragon', tag: 'dragon' },
  { word: 'Earth', tag: 'earth' },
]

/**
 * Ideas carry a REAL faction so a row reads like a card. `radiant` is the current
 * placeholder; a promoted row should take the faction its tags earn (fire/dragon → ember,
 * water/ice → tide, grass/earth → verdant, dark → umbral, electric → radiant).
 */
const IDEA_FACTION = 'radiant'

/**
 * The lifecycle marker, and the only reason `status` exists in the CSV: build-seed.mjs
 * skips any row flagged `idea`, because an idea has no role/passive yet and so could never
 * be inserted. Keeping it explicit is what leaves `faction` free to be a real faction —
 * parking the marker on a content field means every "fill this column in" change moves it.
 */
const IDEA_STATUS = 'idea'

/** Every idea starts at rank 1; rank-up is the only way a card gets stronger. */
const IDEA_RANK = 1

/** IDEATE.MD rolls both of these in 1-100. */
const STAT_MIN = 1
const STAT_MAX = 100

// --- helpers ------------------------------------------------------------------

/** mulberry32: tiny deterministic PRNG so `--seed` reproduces a batch exactly. */
function makeRng(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = (rng, list) => list[Math.floor(rng() * list.length)]

/**
 * "Hearth Cat of Fire" -> "hearth-cat-of-fire": the CSV id convention, which is also the art
 * filename (`findCardArt` in the card importer looks cards up by id). Apostrophes are dropped
 * rather than treated as a separator, so "Butterfly Keeper's ..." -> "butterfly-keepers-..."
 * and this matches the ids the catalog already carries.
 */
const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** Extensions the card importer accepts as art, so an idea cannot shadow a rendered card. */
const ART_EXTS = ['.png', '.webp', '.jpg', '.jpeg']

const csvField = (value) => {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Minimal CSV reader: enough for the header + id/name columns we dedupe on. */
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
  return {
    header: header.map((key) => key.trim()),
    rows: body.map((line) =>
      Object.fromEntries(header.map((key, index) => [key.trim(), (line[index] ?? '').trim()])),
    ),
  }
}

/**
 * Ids already taken. The CSV's `id` column is the key: it names the DB row *and* the art file,
 * so it is what an idea must not collide with — deduping on `slugify(name)` instead let a roll
 * slip past a row whose id does not equal its slugged name.
 *
 * The name is checked too, because a hand-written row can carry a name no id mirrors, and so is
 * the art folder: a rendered `<id>.png` is content in flight even before its row is filled in.
 * (The folder used to be scanned for `<Title>.json` sidecars, but those were deleted, so the
 * art extensions are the only thing left in there to collide with.)
 */
function takenIds(rows) {
  const taken = new Set()
  for (const row of rows) {
    const id = (row.id ?? '').trim().toLowerCase()
    if (id) taken.add(id)
    const name = slugify(row.name ?? '')
    if (name) taken.add(name)
  }
  if (existsSync(CONCEPT_DIR)) {
    for (const file of readdirSync(CONCEPT_DIR)) {
      const lower = file.toLowerCase()
      if (!ART_EXTS.some((ext) => lower.endsWith(ext))) continue
      taken.add(lower.slice(0, -lower.slice(lower.lastIndexOf('.')).length))
    }
  }
  return taken
}

/**
 * One idea: "<Animal> of <Element>", or "<Animal> of <A> and <B>" for duals. The animal
 * leads on purpose — it is the species, so a name-first sort groups every Cat together
 * instead of scattering them by element (which is also why the habitat was dropped: it
 * added a third axis to the name without changing how the card plays).
 */
function rollIdea(rng) {
  const elementCount = rng() < 0.7 ? 1 : 2
  let elements
  if (elementCount === 1) {
    elements = [pick(rng, ELEMENTS)]
  } else {
    const first = pick(rng, ELEMENTS)
    let second = pick(rng, ELEMENTS)
    while (second.tag === first.tag) second = pick(rng, ELEMENTS)
    elements = [first, second]
  }

  const animal = pick(rng, ANIMALS)
  const elementWords = elements.map((element) => element.word).join(' and ')
  const name = `${animal} of ${elementWords}`

  const rollStat = () => STAT_MIN + Math.floor(rng() * (STAT_MAX - STAT_MIN + 1))
  return {
    type: 'card',
    name,
    tags: elements.map((element) => element.tag).join(';'),
    rank: IDEA_RANK,
    faction: IDEA_FACTION,
    base_atk: rollStat(),
    base_def: rollStat(),
    status: IDEA_STATUS,
  }
}

// --- main ---------------------------------------------------------------------

const { values } = parseArgs({
  options: {
    count: { type: 'string', default: '25' },
    seed: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
})

if (values.help) {
  console.log(
    [
      'Roll card ideas from IDEATE.MD pools and append them to data/assets.csv.',
      'Rank 1, faction "radiant", ATK/DEF rolled 1-100, status "idea".',
      '',
      'Usage: node scripts/cards-1-idea.mjs [options]',
      '  --count=<n>   How many ideas to append. Default 25.',
      '  --seed=<n>    PRNG seed for a reproducible batch. Omit for a random seed.',
      '  --dry-run     Print the ideas without writing to the CSV.',
    ].join('\n'),
  )
  process.exit(0)
}

const count = Number(values.count)
if (!Number.isInteger(count) || count < 1) {
  console.error(`--count must be a positive integer, got ${values.count}`)
  process.exit(1)
}

const seed = values.seed === undefined ? Math.floor(Math.random() * 2 ** 32) : Number(values.seed)
if (!Number.isInteger(seed)) {
  console.error(`--seed must be an integer, got ${values.seed}`)
  process.exit(1)
}
const rng = makeRng(seed)

const { header, rows } = parseCsv(readFileSync(ASSETS_CSV, 'utf8'))
const taken = takenIds(rows)

const ideas = []
const seen = new Set(taken)
// Bounded attempts: a small animal/element cross-product can otherwise
// spin forever once the obvious combinations are taken.
const maxAttempts = count * 50
for (let attempt = 0; attempt < maxAttempts && ideas.length < count; attempt += 1) {
  const idea = rollIdea(rng)
  const id = slugify(idea.name)
  if (seen.has(id)) continue
  seen.add(id)
  ideas.push({ id, ...idea })
}

if (ideas.length < count) {
  console.warn(`only ${ideas.length}/${count} unique ideas found after ${maxAttempts} rolls`)
}

// Blank where we have no information: role/passives/lore are design decisions, not
// something a generator should invent.
const blank = Object.fromEntries(header.map((key) => [key, '']))
const lines = ideas.map((idea) =>
  header.map((key) => csvField({ ...blank, ...idea }[key])).join(','),
)

console.log(`seed: ${seed}`)
for (const idea of ideas)
  console.log(`  ${idea.name}  ${idea.base_atk}/${idea.base_def}  [${idea.tags}]`)

if (values['dry-run']) {
  console.log(`\n--dry-run: ${ideas.length} ideas not written`)
  process.exit(0)
}

// Preserve the existing file exactly and just add lines, so manual edits stay put.
const existing = readFileSync(ASSETS_CSV, 'utf8')
const prefix = existing.endsWith('\n') || existing === '' ? existing : `${existing}\n`
writeFileSync(ASSETS_CSV, `${prefix}${lines.join('\n')}\n`)

console.log(`appended ${ideas.length} ideas to data/assets.csv — fill in role/passive/lore`)
console.log('(status "idea" is the marker: seed:build skips these rows until they are promoted)')
