/**
 * Card pipeline, stage 2 of 4 — *design*: fills the `design` column of data/cards.csv, the
 * concept-art prompt for a card, using an OpenAI-compatible chat endpoint (DeepSeek, OpenAI,
 * a local vLLM, …). Stage 1 is scripts/cards-1-idea.mjs (it writes the rows); stage 3 is
 * scripts/cards-3-render.mjs, which renders this prompt.
 *
 * Only rows with a BLANK design are touched, so this is resumable: re-running after a
 * crash (or a rate-limit that killed one batch) picks up exactly where it stopped. The
 * CSV is rewritten after every batch for the same reason — a long run that dies at row
 * 180 of 200 keeps the 175 designs it already paid for.
 *
 * The house style lives in HOUSE_STYLE and is handed to the model as a verbatim clause;
 * that keeps every prompt in one art direction instead of one per request.
 *
 * Usage: node scripts/cards-2-design.mjs [options]
 *
 * Options:
 *   --url=<url>     Chat completions base url. Defaults to env CARD_DESIGN_API_URL
 *                   (falls back to OPENAI_BASE_URL). A base ("https://api.deepseek.com")
 *                   or the full ".../chat/completions" path are both accepted.
 *   --key=<key>     API key. Defaults to env CARD_DESIGN_API_KEY (fallback OPENAI_API_KEY).
 *   --model=<name>  Model id. Defaults to env CARD_DESIGN_MODEL, then "deepseek-chat".
 *   --batch=<n>     Cards per request. Default 5.
 *   --limit=<n>     Stop after n cards (for a cheap smoke test).
 *   --delay=<ms>    Wait between batches. Default 0; raise it if the endpoint 429s.
 *   --no-json       Skip response_format=json_object (for endpoints that reject it).
 *   --dry-run       Generate but do NOT write the CSV.
 *   --help          Show this message.
 *
 * Env vars are read from .env.local too, so the url/key never need to be exported.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const CARDS_CSV = join(root, 'data/cards.csv')

if (existsSync(join(root, '.env.local'))) process.loadEnvFile(join(root, '.env.local'))

// --- art direction ------------------------------------------------------------

/** The one style every card shares. Editable here, not per card. */
const HOUSE_STYLE = 'cartoonish digital illustration, dramatic rim lighting, rich saturated color with accents'

const DESIGN_COLUMN = 'design'

/** Request knobs. High temperature on purpose: a batch of five should not read like one card. */
const TEMPERATURE = 0.9
const REQUEST_TIMEOUT_MS = 120_000
const MAX_ATTEMPTS = 3

/** Cheap sanity gate: a one-word answer is a truncated/refused response, not a design. */
const MIN_DESIGN_LENGTH = 20

const SYSTEM_PROMPT = [
  'You are the art director for TCG, a collection RPG about fantastical creatures.',
  "For each card you write ONE image-generation prompt describing that card's concept art.",
  '',
  'House style — every prompt must END with this clause, word for word:',
  `"${HOUSE_STYLE}"`,
  '',
  'Write each prompt as a one or two paragraphs of about 100 words, no line breaks, no markdown, no lists,',
  'no camera or parameter syntax (no "--ar", no weights). Cover, in this order: the creature and its',
  'silhouette, its materials and texture, pose and expression, colour story, and a one-line setting.',
  '',
  'Derive the palette and motif from the card tags: fire = embers/soot, water = currents/foam,',
  'electric = charge/arc-light, grass = growth/pollen, earth = stone/soil, ice = frost/prism,',
  'dragon = scales/regalia, dark = shadow/smoke. `physical` is the NEUTRAL type: that creature',
  'should be mighty, not elemental but cleary fantastical. A card with two tags must read as a blend of both.',
  '',
  'Never mention stats, rank, rarity, gameplay, or that the subject is a card. Never add text or',
  'watermarks to the image. Keep each creature visually distinct from the others in the batch.',
  '',
  'Reply with ONLY this JSON object, one entry per input card, ids copied exactly:',
  '{"designs":[{"id":"<id>","design":"<prompt>"}]}',
].join('\n')

// --- helpers ------------------------------------------------------------------

/** Minimal RFC-4180-ish CSV reader; keeps rows as string arrays so unknown columns survive. */
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
  return { header: header.map((key) => key.trim()), rows: body }
}

const csvField = (value) => {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Serialises header + rows back to the CSV. Everything not in `design` is round-tripped as-is. */
const renderCsv = (header, rows) =>
  `${[header, ...rows].map((line) => line.map(csvField).join(',')).join('\n')}\n`

/** Turns any accepted base ("https://api.deepseek.com", "…/v1") into a chat completions url. */
function chatCompletionsUrl(url) {
  const base = url.trim().replace(/\/+$/, '')
  return /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`
}

/** Models like to wrap JSON in a fenced block; recover the payload instead of failing the batch. */
function extractJson(content) {
  const text = content.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}

/** Accepts {"designs":[…]}, {"cards":[…]} or a bare array — endpoints differ. */
function designsFrom(payload) {
  if (Array.isArray(payload)) return payload
  const list = payload?.designs ?? payload?.cards ?? payload?.results
  return Array.isArray(list) ? list : []
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// --- one batch ----------------------------------------------------------------

/**
 * Asks the model for the designs of up to `batch` cards. Retries transient failures
 * (network, 429, 5xx) with a linear backoff; a 4xx that is not 429 is a config error and
 * is thrown straight away so the run does not burn three attempts on a bad key.
 */
async function requestDesigns(cards, { url, key, model, useJsonMode }) {
  const body = {
    model,
    temperature: TEMPERATURE,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify(
          cards.map(({ id, name, rank, tags, atk, def, lore }) => ({ id, name, rank, tags, atk, def, lore })),
        ),
      },
    ],
  }
  // json_object mode is what makes a 5-card batch parseable; some proxies reject the field.
  if (useJsonMode) body.response_format = { type: 'json_object' }

  let lastError
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })

      if (!response.ok) {
        const detail = (await response.text().catch(() => '')).slice(0, 400)
        const error = new Error(`HTTP ${response.status} ${response.statusText}: ${detail}`)
        // 401/403/404 mean the url or key is wrong — retrying only delays the same answer.
        if (response.status !== 429 && response.status < 500) throw error
        lastError = error
      } else {
        const payload = await response.json()
        const content = payload?.choices?.[0]?.message?.content
        if (typeof content !== 'string') {
          lastError = new Error(`no message content in response: ${JSON.stringify(payload).slice(0, 300)}`)
        } else {
          const parsed = extractJson(content)
          if (!parsed) {
            lastError = new Error(`could not parse JSON from: ${content.slice(0, 300)}`)
          } else {
            return designsFrom(parsed)
          }
        }
      }
    } catch (error) {
      if (error.message?.startsWith('HTTP 4') && !error.message.startsWith('HTTP 429')) throw error
      lastError = error
    }
    if (attempt < MAX_ATTEMPTS) {
      const backoff = attempt * 2000
      console.warn(`    retry ${attempt}/${MAX_ATTEMPTS - 1} in ${backoff}ms — ${lastError.message}`)
      await sleep(backoff)
    }
  }
  throw lastError
}

// --- main ---------------------------------------------------------------------

const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    key: { type: 'string' },
    model: { type: 'string' },
    batch: { type: 'string', default: '5' },
    limit: { type: 'string' },
    delay: { type: 'string', default: '0' },
    'no-json': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
})

if (values.help) {
  console.log(
    [
      'Generate the `design` (concept-art prompt) for every card in data/cards.csv with a blank one.',
      `House style: ${HOUSE_STYLE}`,
      '',
      'Usage: node scripts/cards-2-design.mjs [options]',
      '  --url=<url>     Defaults to env CARD_DESIGN_API_URL / OPENAI_BASE_URL.',
      '  --key=<key>     Defaults to env CARD_DESIGN_API_KEY / OPENAI_API_KEY.',
      '  --model=<name>  Defaults to env CARD_DESIGN_MODEL, then "deepseek-chat".',
      '  --batch=<n>     Cards per request. Default 5.',
      '  --limit=<n>     Stop after n cards.',
      '  --delay=<ms>    Wait between batches. Default 0.',
      '  --no-json       Drop response_format=json_object.',
      '  --dry-run       Generate but do not write the CSV.',
      '',
      'Env vars may live in .env.local (url, key, model).',
    ].join('\n'),
  )
  process.exit(0)
}

const rawUrl = values.url ?? process.env.CARD_DESIGN_API_URL ?? process.env.OPENAI_BASE_URL
const apiKey = values.key ?? process.env.CARD_DESIGN_API_KEY ?? process.env.OPENAI_API_KEY
const model = values.model ?? process.env.CARD_DESIGN_MODEL ?? 'deepseek-chat'

if (!rawUrl || !apiKey) {
  console.error(
    [
      'missing endpoint config — nothing was generated.',
      'Set CARD_DESIGN_API_URL and CARD_DESIGN_API_KEY (in .env.local or the shell), or pass',
      '--url=<base url> --key=<api key>. OPENAI_BASE_URL / OPENAI_API_KEY also work.',
      'Example:',
      '  CARD_DESIGN_API_URL=https://api.deepseek.com/v1',
      '  CARD_DESIGN_API_KEY=sk-…',
      '  CARD_DESIGN_MODEL=deepseek-chat',
    ].join('\n'),
  )
  process.exit(1)
}

const endpoint = chatCompletionsUrl(rawUrl)

for (const [flag, raw, min] of [
  ['--batch', values.batch, 1],
  ['--delay', values.delay, 0],
]) {
  if (!Number.isInteger(Number(raw)) || Number(raw) < min) {
    console.error(`${flag} must be an integer >= ${min}, got ${raw}`)
    process.exit(1)
  }
}
const batchSize = Number(values.batch)
const delayMs = Number(values.delay)

const { header, rows } = parseCsv(readFileSync(CARDS_CSV, 'utf8'))
const designIndex = header.indexOf(DESIGN_COLUMN)
if (designIndex === -1) {
  console.error(`data/cards.csv has no "${DESIGN_COLUMN}" column — add it to the header first.`)
  process.exit(1)
}
// Shorter rows are common in hand-edited CSVs; pad so every row can hold a design.
for (const row of rows) while (row.length < header.length) row.push('')
if (rows.some((row) => row.length > header.length)) {
  console.warn(`warn: some rows have more cells than the header (${header.length}) — extra cells are kept as-is`)
}

const cell = (row, key) => (row[header.indexOf(key)] ?? '').trim()

/** Only blanks: a filled design is a human decision (or a previous run's result). */
let pending = rows.filter((row) => !row[designIndex].trim())
if (values.limit !== undefined) {
  const limit = Number(values.limit)
  if (!Number.isInteger(limit) || limit < 1) {
    console.error(`--limit must be a positive integer, got ${values.limit}`)
    process.exit(1)
  }
  pending = pending.slice(0, limit)
}

console.log(`cards.csv: ${rows.length} rows, ${pending.length} with a blank design`)
if (!pending.length) {
  console.log('nothing to do — every row already has a design')
  process.exit(0)
}
console.log(`model: ${model} @ ${endpoint}  (batch ${batchSize}${values['dry-run'] ? ', dry-run' : ''})`)

const text = (value) => (typeof value === 'string' ? value.trim() : '')

let written = 0
let failed = 0
const batches = []
for (let i = 0; i < pending.length; i += batchSize) batches.push(pending.slice(i, i + batchSize))

for (const [index, batch] of batches.entries()) {
  const label = `[${index + 1}/${batches.length}]`
  const payload = batch.map((row) => ({
    id: cell(row, 'id'),
    name: cell(row, 'name'),
    rank: cell(row, 'rank'),
    tags: cell(row, 'tags'),
    atk: cell(row, 'base_atk'),
    def: cell(row, 'base_def'),
    lore: cell(row, 'lore'),
  }))

  try {
    const designs = await requestDesigns(payload, {
      url: endpoint,
      key: apiKey,
      model,
      useJsonMode: !values['no-json'],
    })

    const byId = new Map(designs.map((entry) => [text(entry?.id), text(entry?.design)]))
    let applied = 0
    for (const row of batch) {
      const design = byId.get(cell(row, 'id'))
      if (!design) {
        console.warn(`${label} no design returned for ${cell(row, 'id')} — left blank for the next run`)
      } else if (design.length < MIN_DESIGN_LENGTH) {
        console.warn(`${label} design for ${cell(row, 'id')} looks truncated ("${design}") — left blank`)
      } else {
        row[designIndex] = design
        applied += 1
      }
    }

    written += applied
    console.log(`${label} ${applied}/${batch.length} designs — ${cell(batch[0], 'name')} …`)

    // Written per batch on purpose: a run that dies later keeps everything it already paid for.
    if (applied && !values['dry-run']) writeFileSync(CARDS_CSV, renderCsv(header, rows))
  } catch (error) {
    failed += 1
    console.error(`${label} failed: ${error.message}`)
    console.error(`${label} continuing — the ${batch.length} cards in this batch are still blank`)
  }

  if (delayMs && index < batches.length - 1) await sleep(delayMs)
}

console.log(
  values['dry-run']
    ? `dry-run: ${written} designs generated, CSV untouched (${failed} batches failed)`
    : `wrote ${written} designs to data/cards.csv (${failed} batches failed)`,
)
if (failed) {
  console.log('re-run to retry the failed batches — filled designs are never regenerated.')
  process.exitCode = 1
}
