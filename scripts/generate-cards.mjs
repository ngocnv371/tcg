/**
 * Renders card concept art with a local ComfyUI instance, one card at a time.
 *
 * For every row in data/cards.csv it takes the `design` column (the concept-art prompt
 * written by scripts/design-cards.mjs), drops it into the __PROMPT__ placeholder of the
 * workflow json and queues that workflow. If data/cards/<card id>.png already exists the
 * card is skipped, so this is resumable: kill it, re-run it, and it picks up the cards that
 * never finished.
 *
 * Cards are rendered strictly one at a time on purpose — one local GPU, and serialising the
 * queue keeps the ~50s per image predictable instead of thrashing VRAM across queued jobs.
 *
 * Usage: node scripts/generate-cards.mjs [options]
 *
 * Options:
 *   --url=<url>       ComfyUI base url. Defaults to env COMFY_URL (fallback COMFYUI_URL),
 *                     then http://127.0.0.1:8188.
 *   --workflow=<p>    Workflow json to run. Default data/comfy-zimage.json.
 *   --limit=<n>       Stop after n cards (for a cheap smoke test).
 *   --seed=<n>        Base seed. Card n uses seed+n, so a run is reproducible and no two
 *                     cards share a composition. Omit for random seeds (which are logged).
 *   --keep-seed       Run the workflow's own seed untouched.
 *   --timeout=<ms>    Per-card budget. Default 300000.
 *   --interval=<ms>   Poll interval for /history. Default 2000.
 *   --force           Re-render cards whose png already exists.
 *   --dry-run         List what would be rendered and exit.
 *   --help            Show this message.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const CARDS_CSV = join(root, 'data/cards.csv')
const CARDS_DIR = join(root, 'data/cards')
const WORKFLOW_JSON = join(root, 'data/comfy-zimage.json')

if (existsSync(join(root, '.env.local'))) process.loadEnvFile(join(root, '.env.local'))

/** The token the workflow json carries where the prompt goes. */
const PROMPT_TOKEN = '__PROMPT__'

/** ComfyUI's own default port, used only when nothing else is configured. */
const DEFAULT_COMFY_URL = 'http://127.0.0.1:8188'

/** Identifies this queueing client to ComfyUI. */
const CLIENT_ID = 'tcg2-art'

/** How often the "still waiting" line is printed, so a 50s card does not look hung. */
const PROGRESS_EVERY_MS = 15_000

/** PNG magic bytes — a guard against saving an HTML error page as card art. */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

// --- helpers ------------------------------------------------------------------

/** Minimal RFC-4180-ish CSV reader; rows stay string arrays so unknown columns survive. */
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Substitutes __PROMPT__ (and any other __TOKEN__) in a workflow.
 *
 * The tokens live inside the serialised workflow's JSON string literals, so a value is
 * JSON-escaped and the wrapping quotes stripped before splicing — a prompt with quotes,
 * backslashes or newlines would otherwise emit invalid JSON.
 */
function applyTokens(workflow, replacements) {
  let text = JSON.stringify(workflow)
  for (const [token, value] of Object.entries(replacements)) {
    if (!text.includes(token)) {
      throw new Error(`token ${token} not found in the workflow — nothing was queued`)
    }
    text = text.split(token).join(JSON.stringify(value).slice(1, -1))
  }
  return JSON.parse(text)
}

/**
 * Sets every `seed` input to a distinct value. Z-Image Turbo is a fixed-seed workflow, so
 * without this all 25 cards would render the same composition in different colours.
 */
function applySeeds(workflow, seedOf) {
  const nodes = Object.values(workflow).filter((node) => node && typeof node === 'object' && node.inputs)
  for (const [index, node] of nodes.entries()) {
    if (typeof node.inputs.seed === 'number') node.inputs.seed = seedOf(index)
  }
  return workflow
}

const randomSeed = () => Math.floor(Math.random() * 2 ** 32)

// --- ComfyUI client -----------------------------------------------------------

/**
 * Thin wrapper around the ComfyUI HTTP API: queue a workflow, poll /history for the
 * result, then pull the image back through /view. Mirrors the Python client the
 * placeholder substitution is modelled on.
 */
class ComfyClient {
  constructor(baseUrl) {
    this.base = baseUrl.replace(/\/+$/, '')
  }

  async json(path, init) {
    const response = await fetch(`${this.base}${path}`, init)
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 400)
      throw new Error(`${path} failed: HTTP ${response.status} ${response.statusText} ${detail}`)
    }
    return response.json()
  }

  async isReachable() {
    try {
      await this.json('/system_stats')
      return true
    } catch {
      return false
    }
  }

  async queuePrompt(workflow) {
    const payload = await this.json('/prompt', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: CLIENT_ID }),
      signal: AbortSignal.timeout(30_000),
    })
    if (payload.error) {
      // ComfyUI validates the graph before queueing and reports per-node problems here.
      throw new Error(`ComfyUI rejected the workflow: ${payload.error.message ?? payload.error}`)
    }
    if (!payload.prompt_id) throw new Error(`ComfyUI returned no prompt_id: ${JSON.stringify(payload).slice(0, 300)}`)
    return payload.prompt_id
  }

  async getHistory(promptId) {
    return this.json(`/history/${promptId}`, { signal: AbortSignal.timeout(30_000) })
  }

  /** Blocks until the workflow finishes and returns its outputs dict. */
  async waitForOutputs(promptId, { timeoutMs, intervalMs, onWait }) {
    const deadline = Date.now() + timeoutMs
    let lastWaitAt = 0
    while (Date.now() < deadline) {
      let history
      try {
        history = await this.getHistory(promptId)
      } catch (error) {
        // A dropped poll is not a failed render — the job is still running server-side.
        console.warn(`    poll failed (${error.message.slice(0, 80)}) — retrying`)
        await sleep(intervalMs)
        continue
      }

      const entry = history[promptId]
      if (entry) {
        const status = entry.status ?? {}
        if (status.status_str === 'error') {
          throw new Error(`ComfyUI workflow failed: ${JSON.stringify(status).slice(0, 400)}`)
        }
        if (status.completed) return entry.outputs ?? {}
      }

      const now = Date.now()
      if (now - lastWaitAt >= PROGRESS_EVERY_MS) {
        lastWaitAt = now
        onWait?.(Math.round((deadline - now) / 1000))
      }
      await sleep(intervalMs)
    }
    throw new Error(`ComfyUI workflow ${promptId} did not complete within ${timeoutMs}ms`)
  }

  async download({ filename, subfolder = '', type = 'output' }) {
    const params = new URLSearchParams({ filename, subfolder, type })
    const response = await fetch(`${this.base}/view?${params}`, { signal: AbortSignal.timeout(120_000) })
    if (!response.ok) {
      throw new Error(`/view failed: HTTP ${response.status} ${response.statusText}`)
    }
    return Buffer.from(await response.arrayBuffer())
  }
}

/** First image in an outputs dict: { "<node id>": { images: [{filename, subfolder, type}] } }. */
function firstImage(outputs) {
  for (const output of Object.values(outputs)) {
    const images = output?.images
    if (Array.isArray(images) && images.length) return images[0]
  }
  return null
}

// --- main ---------------------------------------------------------------------

const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    workflow: { type: 'string' },
    limit: { type: 'string' },
    seed: { type: 'string' },
    'keep-seed': { type: 'boolean', default: false },
    timeout: { type: 'string', default: '300000' },
    interval: { type: 'string', default: '2000' },
    force: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
})

if (values.help) {
  console.log(
    [
      'Render card concept art with a local ComfyUI instance, one card at a time.',
      'Skips any card that already has data/cards/<id>.png.',
      '',
      'Usage: node scripts/generate-cards.mjs [options]',
      '  --url=<url>       Defaults to env COMFY_URL / COMFYUI_URL, then http://127.0.0.1:8188.',
      '  --workflow=<p>    Default data/comfy-zimage.json.',
      '  --limit=<n>       Stop after n cards.',
      '  --seed=<n>        Base seed; card n gets seed+n. Omit for random seeds.',
      '  --keep-seed       Do not touch the workflow seed.',
      '  --timeout=<ms>    Per-card budget. Default 300000.',
      '  --interval=<ms>   /history poll interval. Default 2000.',
      '  --force           Re-render even if the png exists.',
      '  --dry-run         List what would be rendered, queue nothing.',
      '',
      'Env may live in .env.local. Example: COMFY_URL=http://127.0.0.1:8188',
    ].join('\n'),
  )
  process.exit(0)
}

const envUrl = process.env.COMFY_URL ?? process.env.COMFYUI_URL
const baseUrl = values.url ?? envUrl ?? DEFAULT_COMFY_URL
const workflowPath = values.workflow ? join(root, values.workflow) : WORKFLOW_JSON

const intOption = (flag, raw, min) => {
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min) {
    console.error(`${flag} must be an integer >= ${min}, got ${raw}`)
    process.exit(1)
  }
  return value
}

const timeoutMs = intOption('--timeout', values.timeout, 1000)
const intervalMs = intOption('--interval', values.interval, 200)
const baseSeed = values.seed === undefined ? null : intOption('--seed', values.seed, 0)

if (!existsSync(workflowPath)) {
  console.error(`workflow not found: ${workflowPath}`)
  process.exit(1)
}
if (!existsSync(CARDS_CSV)) {
  console.error(`cards csv not found: ${CARDS_CSV}`)
  process.exit(1)
}

const { header, rows } = parseCsv(readFileSync(CARDS_CSV, 'utf8'))
const column = (name) => {
  const index = header.indexOf(name)
  if (index === -1) {
    console.error(`data/cards.csv has no "${name}" column.`)
    process.exit(1)
  }
  return index
}
const idIndex = column('id')
const designIndex = column('design')

/** A card with no design has no prompt, so it can never render — that is design-cards' job. */
const undesign = rows.filter((row) => !(row[designIndex] ?? '').trim())
if (undesign.length) {
  console.warn(`warn: ${undesign.length} row(s) have no design yet — run \`npm run design:cards\` first`)
}

let pending = rows.filter((row) => (row[designIndex] ?? '').trim())
if (!values.force) pending = pending.filter((row) => !existsSync(join(CARDS_DIR, `${row[idIndex]}.png`)))
if (values.limit !== undefined) pending = pending.slice(0, intOption('--limit', values.limit, 1))

console.log(`comfy: ${baseUrl}${values.url ? '' : envUrl ? ' (env)' : ' (default)'}`)
console.log(`workflow: ${workflowPath}`)
console.log(`cards.csv: ${rows.length} rows, ${pending.length} to render${values.force ? ' (--force)' : ''}`)
if (!pending.length) {
  console.log('nothing to do — every designed card already has an image')
  process.exit(0)
}

if (values['dry-run']) {
  for (const row of pending) console.log(`  ${row[idIndex]}`)
  console.log(`dry-run: ${pending.length} cards not rendered`)
  process.exit(0)
}

const baseWorkflow = JSON.parse(readFileSync(workflowPath, 'utf8'))
const client = new ComfyClient(baseUrl)

// Fail once, loudly, instead of pretending 25 cards failed to connect.
if (!(await client.isReachable())) {
  console.error(
    [
      `ComfyUI is not answering at ${baseUrl}.`,
      'Start it (or point the script at it) then re-run:',
      '  COMFY_URL=http://127.0.0.1:8188',
      '  node scripts/generate-cards.mjs --url=http://<host>:8188',
    ].join('\n'),
  )
  process.exit(1)
}

mkdirSync(CARDS_DIR, { recursive: true })

let written = 0
let failed = 0

for (const [index, row] of pending.entries()) {
  const id = row[idIndex]
  const design = row[designIndex].trim()
  const target = join(CARDS_DIR, `${id}.png`)
  const label = `[${index + 1}/${pending.length}]`

  // Per-card seed keeps the run reproducible without giving every card the same composition.
  const seed = baseSeed === null ? randomSeed() : baseSeed + index
  const workflow = applyTokens(baseWorkflow, { [PROMPT_TOKEN]: design })
  if (!values['keep-seed']) {
    let call = 0
    applySeeds(workflow, () => seed + call++)
  }

  const startedAt = Date.now()
  try {
    const promptId = await client.queuePrompt(workflow)
    console.log(`${label} ${id} — queued ${promptId} (seed ${seed})`)

    const outputs = await client.waitForOutputs(promptId, {
      timeoutMs,
      intervalMs,
      onWait: (remaining) => console.log(`${label} ${id} — waiting… (${remaining}s left)`),
    })

    const image = firstImage(outputs)
    if (!image) throw new Error(`workflow produced no image outputs: ${JSON.stringify(outputs).slice(0, 300)}`)

    const bytes = await client.download(image)
    if (!bytes.subarray(0, 8).equals(PNG_MAGIC)) {
      throw new Error(`${image.filename} is not a PNG (${bytes.length} bytes) — not saved`)
    }
    writeFileSync(target, bytes)
    written += 1
    console.log(`${label} saved data/cards/${id}.png — ${(bytes.length / 1024).toFixed(0)} KB in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`)
  } catch (error) {
    failed += 1
    console.error(`${label} ${id} failed: ${error.message}`)
    console.error(`${label} continuing — re-run to retry this card`)
  }
}

console.log(`rendered ${written}/${pending.length} cards${failed ? ` (${failed} failed)` : ''}`)
if (failed) {
  console.log('re-run to retry the failures — existing images are skipped, not re-rendered.')
  process.exitCode = 1
}
