import { useEffect } from 'react'
import { X } from 'lucide-react'

import { formatDuration, materialLabel } from '@/features/dungeons/format'
import { useMaterialCatalog } from '@/features/inventory/api'
import { MaterialIcon } from '@/features/inventory/MaterialIcon'
import {
  AFFINITY_MULT_MAX,
  AFFINITY_MULT_MIN,
  RUN_MULT_MAX,
  RUN_MULT_MIN,
  coreVariantForRank,
  tagLabel,
} from '@/game/formulas'
import type { Dungeon } from '@/types/db'

/**
 * What a dungeon actually pays, so a player can pick one to farm for a specific card's
 * rank-up Cores. Preview only: `resolve_runs` owns the real roll, but the drop *table* is
 * fixed — that predictability is the whole point of the panel.
 */
export function DungeonResourcesModal({
  dungeon,
  onClose,
}: {
  dungeon: Dungeon
  onClose: () => void
}) {
  const { data: materials } = useMaterialCatalog()

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

  const materialById = new Map((materials ?? []).map((material) => [material.id, material]))
  const nameOf = (id: string) => materialById.get(id)?.name ?? materialLabel(id)

  // The tutorial pays a fixed bundle (`resolve_due_runs` pins its multiplier to 1), so it has
  // no band; every other dungeon lists its payout at the floor across both yield bands.
  const fixed = dungeon.is_tutorial
  const multMin = fixed ? 1 : RUN_MULT_MIN
  const multMax = fixed ? 1 : RUN_MULT_MAX
  const goldMin = Math.round(dungeon.gold_base * multMin)
  const goldMax = Math.round(dungeon.gold_base * multMax)
  const grade = coreVariantForRank(dungeon.rank)

  return (
    <div
      className="fixed inset-0 z-30 grid place-items-end bg-ink-950/90 px-4 py-3 backdrop-blur-sm sm:place-items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dungeon-resources-title"
    >
      <section className="flex max-h-[85vh] w-full max-w-sm flex-col rounded-card border border-ink-700 bg-ink-900 shadow-lg">
        <header className="flex items-start justify-between gap-3 border-b border-ink-800 p-4">
          <div className="min-w-0">
            <h2 id="dungeon-resources-title" className="font-display text-lg text-ink-50">
              Resources
            </h2>
            <p className="mt-0.5 truncate text-sm text-ink-400">{dungeon.name}</p>
          </div>
          <button
            type="button"
            aria-label="Close resources"
            title="Close"
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-card text-ink-400 hover:bg-ink-800 hover:text-ink-50"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {dungeon.tags.length ? (
            <div className="flex flex-wrap gap-1.5">
              {dungeon.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-card bg-ink-850 px-2 py-1 text-xs text-ink-200"
                >
                  {tagLabel(tag)}
                </span>
              ))}
            </div>
          ) : null}

          <ul className="divide-y divide-ink-800 border-y border-ink-800 text-sm">
            <li className="flex items-baseline justify-between gap-3 py-2.5">
              <span className="text-ink-200">Gold</span>
              <span className="tabular-nums text-gold-300">
                {goldMin.toLocaleString('en-US')} – {goldMax.toLocaleString('en-US')}
              </span>
            </li>
            {dungeon.materials.map((drop) => (
              <li
                key={drop.material_id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <MaterialIcon material={materialById.get(drop.material_id)} size={24} />
                  <span className="truncate text-ink-200">{nameOf(drop.material_id)}</span>
                </span>
                <span className="tabular-nums text-ink-50">
                  {Math.round(drop.min * multMin)} – {Math.round(drop.max * multMax)}
                </span>
              </li>
            ))}
            {dungeon.chest_on_clear ? (
              <li className="flex items-baseline justify-between gap-3 py-2.5">
                <span className="text-ink-200">Chest</span>
                <span className="capitalize text-gold-300">{dungeon.chest_on_clear}</span>
              </li>
            ) : null}
          </ul>

          <dl className="space-y-1 text-xs">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-400">Core grade</dt>
              <dd className="capitalize text-ink-300">{grade}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-400">Timer</dt>
              <dd className="tabular-nums text-ink-300">
                {formatDuration(dungeon.duration_seconds)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-400">Needs power</dt>
              <dd className="tabular-nums text-ink-300">
                {dungeon.req_power.toLocaleString('en-US')}
              </dd>
            </div>
            {!fixed && dungeon.tags.length > 0 ? (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-400">Resonance</dt>
                <dd className="tabular-nums text-ink-300">
                  ×{AFFINITY_MULT_MIN.toFixed(2)}–×{AFFINITY_MULT_MAX.toFixed(2)}
                </dd>
              </div>
            ) : null}
          </dl>

          {fixed ? (
            <p className="text-xs text-ink-500">
              The tutorial pays exactly this — party power and resonance do not change it, so the
              guided rank-up is always affordable.
            </p>
          ) : (
            <p className="text-xs text-ink-500">
              Every clear pays this whole list — a run never fails. Yield scales with party power
              (×1.00–×1.50) and elemental resonance (×{AFFINITY_MULT_MIN.toFixed(2)}–×
              {AFFINITY_MULT_MAX.toFixed(2)}): cards sharing these tags push it up, off-element
              cards pull it down. Both gold and stacks scale with the final multiplier.
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
