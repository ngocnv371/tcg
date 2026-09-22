import { useEffect } from 'react'
import { X } from 'lucide-react'

import type { ChestOpenFailure } from '@/features/chests/openError'

/**
 * Shown when an opening fails. The failure used to print as a line of red text under the vault
 * rows, which read as "the button did nothing" — an open either happens or it doesn't, so the
 * failure gets the same full-screen treatment as the reveal it replaces.
 *
 * `open_chests` runs as a single statement, so a raise anywhere rolls the whole call back and a
 * failed open never spends a chest or grants a card. That is the main thing the player needs
 * told, so it is stated outright rather than implied.
 */
export function ChestOpenErrorModal({
  failure,
  onClose,
}: {
  failure: ChestOpenFailure
  onClose: () => void
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  return (
    <div
      aria-labelledby="chest-open-error-title"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-ink-950/90 px-4 py-3 backdrop-blur-sm"
      role="dialog"
    >
      <section className="w-full max-w-sm rounded-card border border-faction-ember/60 bg-ink-900 p-4 shadow-lg">
        <header className="flex items-start justify-between gap-3">
          <h2 id="chest-open-error-title" className="font-display text-lg text-ink-50">
            Couldn&apos;t open the chest
          </h2>
          <button
            type="button"
            aria-label="Close error"
            title="Close"
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-card text-ink-400 hover:bg-ink-800 hover:text-ink-50"
          >
            <X className="size-5" />
          </button>
        </header>

        <p className="mt-2 text-sm text-ink-200">{failure.summary}</p>
        {failure.detail ? (
          <p className="mt-1.5 break-words text-xs text-ink-500">Server said: {failure.detail}</p>
        ) : null}
        <p className="mt-3 text-xs text-ink-400">No chests were spent.</p>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-card bg-gold-500 px-3 py-2 text-sm font-medium text-ink-950"
        >
          Got it
        </button>
      </section>
    </div>
  )
}
