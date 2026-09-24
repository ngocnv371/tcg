/**
 * Turns a failed `open_chests` call into something a player can read. The server raises plain
 * English sentences, but most of them describe the *catalog* rather than the player's own vault
 * (`card catalog is empty`), so those get a rewrite aimed at the player while the original
 * wording is kept alongside it. Kept out of the modal component so it stays unit testable and the
 * component file only exports a component.
 */
export type ChestOpenFailure = {
  /** The line the modal leads with. */
  summary: string
  /** The server's own wording, when it says more than the summary does. */
  detail: string | null
}

const SUMMARIES: Record<string, string> = {
  'chest already opened': 'That chest has already been opened.',
  'chest has no odds': 'That chest has no drop odds configured.',
  'chest not found': 'That chest is no longer in your vault.',
  'card catalog is empty': 'The card catalog is empty — there is nothing to reveal yet.',
  'not authenticated': 'Your session has expired — sign in again.',
}

export function describeChestOpenFailure(error: unknown): ChestOpenFailure {
  const raw = messageOf(error)

  // "not enough unopened rare chests" — the vault rows already show the count, so the chest type
  // in the message is noise.
  if (raw.startsWith('not enough unopened')) {
    return { detail: null, summary: "You don't have that many unopened chests of that type." }
  }

  const summary = SUMMARIES[raw]
  return summary ? { detail: raw, summary } : { detail: null, summary: raw || 'Something went wrong.' }
}

/**
 * PostgREST rejects with a plain `{ message, code, details, hint }` object rather than an `Error`,
 * so `instanceof Error` misses it and stringifying gives `[object Object]`.
 */
function messageOf(error: unknown): string {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const { message } = error as { message?: unknown }
    if (typeof message === 'string') return message
  }
  return ''
}
