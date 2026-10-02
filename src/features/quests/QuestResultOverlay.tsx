import { Coins, Sparkles } from 'lucide-react'

import { materialLabel } from '@/features/dungeons/format'
import type { QuestClear } from '@/features/quests/api'
import type { Quest } from '@/types/db'

/**
 * The settlement panel after a fight. A win shows what the server actually paid (the client
 * never computes it); a loss offers a retry with the same party and no cost.
 */
export function QuestResultOverlay({
  quest,
  won,
  clear,
  dropCardName,
  error,
  onRetry,
  onClose,
}: {
  quest: Quest
  won: boolean
  clear: QuestClear | null
  /** Display name of the card this clear dropped, when the server roll hit. */
  dropCardName?: string | null
  error: string | null
  onRetry: () => void
  onClose: () => void
}) {
  const materials = clear ? Object.entries(clear.rewards.materials) : []

  return (
    <div className="fixed inset-0 z-40 grid items-end justify-items-center bg-ink-950/95 px-4 py-4 backdrop-blur-sm sm:place-items-center">
      <section className="w-full max-w-sm rounded-card border border-ink-700 bg-ink-900 p-5 text-center shadow-lg">
        <p aria-hidden className="text-5xl">
          {won ? '🏆' : '💀'}
        </p>
        <h2 className="mt-2 font-display text-xl text-ink-50">
          {won ? 'Quest cleared!' : 'Defeated'}
        </h2>
        <p className="mt-1 text-sm text-ink-400">{quest.name}</p>

        {won && clear ? (
          <div className="mt-4 rounded-card border border-ink-800 bg-ink-850/60 p-3 text-left">
            {clear.first_clear ? (
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gold-300">
                <Sparkles className="size-3.5" /> First clear bonus!
              </p>
            ) : null}
            <div className="flex items-center justify-between text-sm text-ink-100">
              <span className="flex items-center gap-1.5 text-ink-300">
                <Coins className="size-4 text-gold-400" /> Gold
              </span>
              <span className="tabular-nums">+{clear.rewards.gold.toLocaleString('en-US')}</span>
            </div>
            {materials.map(([materialId, qty]) => (
              <div key={materialId} className="mt-1 flex items-center justify-between text-sm">
                <span className="text-ink-300">{materialLabel(materialId)}</span>
                <span className="tabular-nums text-ink-100">+{qty}</span>
              </div>
            ))}
            {clear.card ? (
              <div className="mt-2 flex items-center justify-between border-t border-ink-800 pt-2 text-sm">
                <span className="flex items-center gap-1.5 font-medium text-gold-300">
                  <Sparkles className="size-3.5" /> Card dropped
                </span>
                <span className="text-ink-100">{dropCardName ?? clear.card.card_id}</span>
              </div>
            ) : null}
            <p className="mt-2 text-[11px] text-ink-400">
              Cleared ×{clear.clears} · replay for the base reward any time.
            </p>
          </div>
        ) : null}

        {!won ? (
          <p className="mt-4 text-sm text-ink-300">
            Answer the times tables correctly to land your hits. Try again!
          </p>
        ) : null}

        {error ? <p className="mt-3 text-xs text-faction-ember">{error}</p> : null}

        <div className="mt-5 space-y-2">
          {!won ? (
            <button
              type="button"
              onClick={onRetry}
              className="w-full rounded-card bg-gold-500 px-3 py-2.5 text-sm font-medium text-ink-950"
            >
              Retry
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-card border border-ink-700 px-3 py-2.5 text-sm text-ink-200 hover:border-ink-600"
          >
            {won ? 'Done' : 'Retreat'}
          </button>
        </div>
      </section>
    </div>
  )
}
