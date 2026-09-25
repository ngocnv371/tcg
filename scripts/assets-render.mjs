/**
 * Asset pipeline — *render*: renders concept art for every row in data/assets.csv with a local
 * ComfyUI instance, one asset at a time. This replaces the near-identical card and material
 * renderers that used to live in scripts/cards-3-render.mjs and scripts/materials-3-render.mjs:
 * the workflow is the same graph and the only thing that ever differed was the output size, so
 * the size is now switched by the row's `type`.
 *
 * For every row it takes the `design` column (the concept-art prompt), drops it into the
 * __PROMPT__ placeholder of the workflow json, sets the latent image width/height for that asset
 * type and queues the workflow. If `<type folder>/<id>.png` already exists the asset is skipped,
 * so this is resumable: kill it, re-run it, and it picks up whatever never finished.
 *
 * Assets are rendered strictly one at a time on purpose — one local GPU, and serialising the
 * queue keeps the per-image time predictable instead of thrashing VRAM across queued jobs.
 *
 * The three stages that used to render now are one:
 *   card art     data/cards/<id>.png     390x844
 *   material art data/materials/<id>.png 256x256
 * Output size lives in ASSET_TYPES, not in the workflow json, so a new type is one entry.
 *
 * Usage: node scripts/assets-render.mjs [options]
 *
 * Options:
 *   --type=<t>        Only render one asset type (card, material). Default: every type.
 *   --csv=<path>      Catalog to read. Default data/assets.csv.
 *   --url=<url>       ComfyUI base url. Defaults to env COMFY_URL (fallback COMFYUI_URL),
 *                     then http://127.0.0.1:8188.
 *   --workflow=<p>    Workflow json to run. Default data/comfy-zimage.json.
 *   --limit=<n>       Stop after n assets (for a cheap smoke test).
 *   --seed=<n>        Base seed. Asset n uses seed+n, so a run is reproducible and no two
 *                     assets share a composition. Omit for random seeds (which are logged).
 *   --keep-seed       Run the workflow's own seed untouched.
 *   --timeout=<ms>    Per-asset budget. Default 300000.
 *   --interval=<ms>   Poll interval for /history. Default 2000.
 *   --force           Re-render assets whose png already exists.
 *   --dry-run         List what would be rendered and exit.
 *   --help            Show this message.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS_CSV = join(root, 'data/assets.csv')
const WORKFLOW_JSON = join(root, 'data/comfy-zimage.json')

if (existsSync(join(root, '.env.local'))) process.loadEnvFile(join(root, '.env.local'))

/**
 * The one place an asset type is described: where its art is written and the ComfyUI latent size.
 * The workflow graph is shared, so adding a type means adding an entry here (and nothing else).
 */
const ASSET_TYPES = {
  card: { dir: 'data/cards', width: 390, height: 844 },
  material: { dir: 'data/materials', width: 256, height: 256 },
}

/** The token the workflow json carries where the prompt goes. */
const PROMPT_TOKEN = '__PROMPT__'

/** ComfyUI's own default port, used only when nothing else is configured. */
const DEFAULT_COMFY_URL = 'http://127.0.0.1:8188'

/** Identifies this queueing client to ComfyUI. */
const CLIENT_ID = 'tcg2-asset-art'

/** How often the "still waiting" line is printed, so a long render does not look hung. */
const PROGRESS_EVERY_MS = 15_000

/** PNG magic bytes — a guard against saving an HTML error page as asset art. */
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
 * Sets the latent image size. Every workflow shares one graph; only the output dimensions differ
 * per asset type, so the size is injected here instead of maintaining a workflow json per size.
 */
function applySize(workflow, { width, height }) {
  const nodes = Object.values(workflow).filter(
    (node) => node && typeof node === 'object' && /LatentImage/.test(node.class_type ?? ''),
  )
  if (!nodes.length) {
    throw new Error('workflow has no latent-image node — cannot set the output size')
  }
  for (const node of nodes) {
    const inputs = node.inputs ?? (node.inputs = {})
    inputs.width = width
    inputs.height = height
  }
  return workflow
}

/**
 * Sets every `seed` input to a distinct value. Z-Image Turbo is a fixed-seed workflow, so
 * without this every asset would render the same composition in different colours.
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
    type: { type: 'string' },
    csv: { type: 'string' },
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
      'Render concept art for every row in data/assets.csv with a local ComfyUI instance.',
      'Output size is switched by the row type; skips any <id>.png that already exists.',
      '',
      'Usage: node scripts/assets-render.mjs [options]',
      `  --type=<t>        Only one type (${Object.keys(ASSET_TYPES).join(', ')}). Default: all.`,
      '  --csv=<path>      Default data/assets.csv.',
      '  --url=<url>       Defaults to env COMFY_URL / COMFYUI_URL, then http://127.0.0.1:8188.',
      '  --workflow=<p>    Default data/comfy-zimage.json.',
      '  --limit=<n>       Stop after n assets.',
      '  --seed=<n>        Base seed; asset n gets seed+n. Omit for random seeds.',
      '  --keep-seed       Do not touch the workflow seed.',
      '  --timeout=<ms>    Per-asset budget. Default 300000.',
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
const csvPath = values.csv ? join(root, values.csv) : ASSETS_CSV

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

if (values.type !== undefined && !ASSET_TYPES[values.type]) {
  console.error(`--type must be one of ${Object.keys(ASSET_TYPES).join(', ')}, got ${values.type}`)
  process.exit(1)
}
if (!existsSync(workflowPath)) {
  console.error(`workflow not found: ${workflowPath}`)
  process.exit(1)
}
if (!existsSync(csvPath)) {
  console.error(`assets csv not found: ${csvPath}`)
  process.exit(1)
}

const { header, rows } = parseCsv(readFileSync(csvPath, 'utf8'))
const column = (name) => {
  const index = header.indexOf(name)
  if (index === -1) {
    console.error(`data/assets.csv has no "${name}" column.`)
    process.exit(1)
  }
  return index
}
const idIndex = column('id')
const typeIndex = column('type')
const designIndex = column('design')

const cell = (row, index) => (row[index] ?? '').trim()

/** A row with no design has no prompt, so it can never render. */
const undesign = rows.filter((row) => !cell(row, designIndex))
if (undesign.length) {
  console.warn(`warn: ${undesign.length} row(s) have no design yet — fill in data/assets.csv first`)
}

const selectedTypes = values.type ? [values.type] : Object.keys(ASSET_TYPES)
const unknown = new Set()
const designed = rows.filter((row) => {
  const type = cell(row, typeIndex)
  if (!ASSET_TYPES[type]) {
    if (type) unknown.add(type)
    return false
  }
  return selectedTypes.includes(type) && cell(row, designIndex)
})
if (unknown.size) {
  console.warn(`warn: ignoring row(s) with unknown type: ${[...unknown].join(', ')}`)
}

let pending = designed
if (!values.force) {
  pending = pending.filter((row) => {
    const config = ASSET_TYPES[cell(row, typeIndex)]
    return !existsSync(join(root, config.dir, `${cell(row, idIndex)}.png`))
  })
}
if (values.limit !== undefined) pending = pending.slice(0, intOption('--limit', values.limit, 1))

const byType = pending.reduce((counts, row) => {
  const type = cell(row, typeIndex)
  counts[type] = (counts[type] ?? 0) + 1
  return counts
}, {})

console.log(`comfy: ${baseUrl}${values.url ? '' : envUrl ? ' (env)' : ' (default)'}`)
console.log(`workflow: ${workflowPath}`)
console.log(
  `assets.csv: ${rows.length} rows, ${pending.length} to render${
    Object.keys(byType).length ? ` (${Object.entries(byType).map(([type, n]) => `${n} ${type}`).join(', ')})` : ''
  }${values.force ? ' (--force)' : ''}`,
)
if (!pending.length) {
  console.log('nothing to do — every designed asset already has an image')
  process.exit(0)
}

if (values['dry-run']) {
  for (const row of pending) console.log(`  [${cell(row, typeIndex)}] ${cell(row, idIndex)}`)
  console.log(`dry-run: ${pending.length} assets not rendered`)
  process.exit(0)
}

const baseWorkflow = JSON.parse(readFileSync(workflowPath, 'utf8'))
const client = new ComfyClient(baseUrl)

// Fail once, loudly, instead of pretending every asset failed to connect.
if (!(await client.isReachable())) {
  console.error(
    [
      `ComfyUI is not answering at ${baseUrl}.`,
      'Start it (or point the script at it) then re-run:',
      '  COMFY_URL=http://127.0.0.1:8188',
      '  node scripts/assets-render.mjs --url=http://<host>:8188',
    ].join('\n'),
  )
  process.exit(1)
}

let written = 0
let failed = 0

for (const [index, row] of pending.entries()) {
  const id = cell(row, idIndex)
  const type = cell(row, typeIndex)
  const config = ASSET_TYPES[type]
  const design = cell(row, designIndex)
  const target = join(root, config.dir, `${id}.png`)
  const label = `[${index + 1}/${pending.length}]`

  mkdirSync(join(root, config.dir), { recursive: true })

  // Per-asset seed keeps the run reproducible without giving every asset the same composition.
  const seed = baseSeed === null ? randomSeed() : baseSeed + index
  const workflow = applyTokens(baseWorkflow, { [PROMPT_TOKEN]: design })
  applySize(workflow, config)
  if (!values['keep-seed']) {
    let call = 0
    applySeeds(workflow, () => seed + call++)
  }

  const startedAt = Date.now()
  try {
    const promptId = await client.queuePrompt(workflow)
    console.log(`${label} [${type}] ${id} — queued ${promptId} (seed ${seed})`)

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
    console.log(
      `${label} saved ${config.dir}/${id}.png (${config.width}x${config.height}) — ${(bytes.length / 1024).toFixed(0)} KB in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
    )
  } catch (error) {
    failed += 1
    console.error(`${label} ${id} failed: ${error.message}`)
    console.error(`${label} continuing — re-run to retry this asset`)
  }
}

console.log(`rendered ${written}/${pending.length} assets${failed ? ` (${failed} failed)` : ''}`)
if (failed) {
  console.log('re-run to retry the failures — existing images are skipped, not re-rendered.')
  process.exitCode = 1
}
