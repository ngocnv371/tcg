/**
 * Rolls new card *ideas* from the pools in IDEATE.MD (animal + 1-2 elements +
 * habitat) and appends them to data/cards.csv.
 *
 * These are seeds, not content: only the columns we can roll from IDEATE.MD are filled
 * (id, name, rank, faction, base_atk, base_def, tags, plus the `status=idea` marker).
 * role / passive_name / passive_text / lore are left blank because those are design
 * decisions, not dice — which is also why this never touches data/cards/*.json: that
 * folder is the finished art pipeline, this is the sketchbook in front of it.
 *
 * Usage: node scripts/idea-cards.mjs [options]
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
const CARDS_CSV = join(root, 'data/cards.csv')
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
 * scripts/import-concept-cards.mjs so an idea tagged here means the same thing
 * once it becomes real content. `Physical` is the neutral single-type only.
 */
const ELEMENTS = [
  { word: 'Physical', tag: 'physical' },
  { word: 'Fire', tag: 'fire' },
  { word: 'Water', tag: 'water' },
  { word: 'Ice', tag: 'ice' },
  { word: 'Grass', tag: 'grass' },
  { word: 'Electric', tag: 'electric' },
  { word: 'Dark', tag: 'dark' },
  { word: 'Dragon', tag: 'dragon' },
  { word: 'Earth', tag: 'earth' },
]

const HABITATS = [
  'Desert',
  'River',
  'Tundra',
  'Forest',
  'Mountain',
  'Ruins',
  'Swamp',
  'Volcano',
  'Plains',
  'Crypts',
  'Caves',
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

/** "Hearth Cat of Fire" -> "hearth-cat-of-fire", matching art/cards/<id>.webp. */
const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

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
 * Names already taken by the CSV *or* by the finished concept-art folder. The
 * folder matters because a name only becomes a real card via its JSON title, so
 * an idea that collides with one is wasted.
 */
function takenNames(rows) {
  const taken = new Set(rows.map((row) => slugify(row.name ?? '')))
  if (existsSync(CONCEPT_DIR)) {
    for (const file of readdirSync(CONCEPT_DIR)) {
      if (!file.endsWith('.json')) continue
      const { title } = JSON.parse(readFileSync(join(CONCEPT_DIR, file), 'utf8'))
      taken.add(slugify(title))
    }
  }
  return taken
}

/** One idea: "<Element> <Animal> of the <Habitat>", or "<A> and <B> ..." for duals. */
function rollIdea(rng) {
  const elementCount = rng() < 0.7 ? 1 : 2
  let elements
  if (elementCount === 1) {
    elements = [pick(rng, ELEMENTS)]
  } else {
    // Physical is the neutral type and never pairs, so duals only draw from the
    // elemental pool — otherwise "Physical and Fire" would be a nonsense tag line.
    const pool = ELEMENTS.filter((element) => element.tag !== 'physical')
    const first = pick(rng, pool)
    let second = pick(rng, pool)
    while (second.tag === first.tag) second = pick(rng, pool)
    elements = [first, second]
  }

  const animal = pick(rng, ANIMALS)
  const habitat = pick(rng, HABITATS)
  const prefix = elements.map((element) => element.word).join(' and ')
  const name = `${prefix} ${animal} of the ${habitat}`

  const rollStat = () => STAT_MIN + Math.floor(rng() * (STAT_MAX - STAT_MIN + 1))
  return {
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
      'Roll card ideas from IDEATE.MD pools and append them to data/cards.csv.',
      'Rank 1, faction "radiant", ATK/DEF rolled 1-100, status "idea".',
      '',
      'Usage: node scripts/idea-cards.mjs [options]',
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

const { header, rows } = parseCsv(readFileSync(CARDS_CSV, 'utf8'))
const taken = takenNames(rows)

const ideas = []
const seen = new Set(taken)
// Bounded attempts: a small animal/element/habitat cross-product can otherwise
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
const existing = readFileSync(CARDS_CSV, 'utf8')
const prefix = existing.endsWith('\n') || existing === '' ? existing : `${existing}\n`
writeFileSync(CARDS_CSV, `${prefix}${lines.join('\n')}\n`)

console.log(`appended ${ideas.length} ideas to data/cards.csv — fill in role/passive/lore`)
console.log('(status "idea" is the marker: seed:build skips these rows until they are promoted)')
