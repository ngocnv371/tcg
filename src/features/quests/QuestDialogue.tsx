import { useState } from 'react'

import type { QuestLine } from '@/types/db'

/**
 * A visual-novel beat: a speaker avatar with a text panel, tapped to advance. Used for both
 * a quest's `intro` (the context before the fight) and its `outro` (after a win).
 */
export function QuestDialogue({
  title,
  lines,
  onDone,
}: {
  title: string
  lines: QuestLine[]
  onDone: () => void
}) {
  const [index, setIndex] = useState(0)
  const line = lines[Math.min(index, lines.length - 1)]
  if (!line) return null

  const last = index + 1 >= lines.length
  function advance() {
    if (last) onDone()
    else setIndex(index + 1)
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-ink-950">
      <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-3 text-xs text-ink-400">
        <span className="truncate">{title}</span>
        <button
          type="button"
          onClick={onDone}
          className="rounded-card px-2 py-1 text-ink-400 hover:bg-ink-800 hover:text-ink-100"
        >
          Skip
        </button>
      </div>

      <button
        type="button"
        onClick={advance}
        aria-label={last ? 'Begin' : 'Next line'}
        className="flex min-h-0 w-full flex-1 flex-col justify-end gap-4 px-4 pb-6 text-left"
      >
        <div className="flex min-h-0 flex-1 items-end justify-center">
          {/* Scales with the viewport height, so a short window never crowds the text out. */}
          <span
            aria-hidden
            className="leading-none drop-shadow-[0_0_24px_rgba(224,169,41,0.25)]"
            style={{ fontSize: 'clamp(3rem, 16vh, 6rem)' }}
          >
            {line.avatar}
          </span>
        </div>

        <div className="scrollbar-slim mx-auto max-h-[55vh] w-full max-w-md overflow-y-auto rounded-card border border-ink-800 bg-ink-900/90 p-4">
          <p className="text-xs uppercase tracking-wide text-gold-300">{line.speaker}</p>
          <p className="mt-1.5 min-h-[3.5rem] text-sm leading-relaxed text-ink-100">{line.text}</p>
          <p className="mt-2 text-right text-[11px] text-ink-400">
            {last ? 'Tap to begin ▸' : 'Tap to continue ▸'}
          </p>
        </div>
      </button>
    </div>
  )
}
