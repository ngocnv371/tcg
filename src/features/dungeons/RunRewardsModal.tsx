import { X } from 'lucide-react'

import { materialLabel } from '@/features/dungeons/format'
import { useMaterialCatalog } from '@/features/inventory/api'
import { MaterialIcon } from '@/features/inventory/MaterialIcon'
import type { RunClaim } from '@/features/progression/api'

export function RunRewardsModal({ claim, onClose }: { claim: RunClaim; onClose: () => void }) {
  const rewards = claim.rewards
  const { data: materials } = useMaterialCatalog()

  const materialById = new Map((materials ?? []).map((material) => [material.id, material]))
  const nameOf = (id: string) => materialById.get(id)?.name ?? materialLabel(id)

  return (
    <div
      className="fixed inset-0 z-30 grid place-items-end bg-ink-950/90 px-4 py-6 backdrop-blur-sm sm:place-items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="run-rewards-title"
    >
      <section className="w-full max-w-sm rounded-card border border-ink-700 bg-ink-900 p-4 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="run-rewards-title" className="font-display text-lg text-ink-50">
              Run rewards
            </h2>
            <p className="mt-1 text-sm text-ink-400">
              {/* A run always clears now; the only variable is how much it paid. */}
              {rewards?.multiplier
                ? `Yield ×${rewards.multiplier.toFixed(2)} — added to your vault.`
                : 'Resources added to your vault.'}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close rewards"
            title="Close"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-card text-ink-400 hover:bg-ink-800 hover:text-ink-50"
          >
            <X className="size-5" />
          </button>
        </div>

        {rewards ? (
          <ul className="mt-4 divide-y divide-ink-800 border-y border-ink-800 text-sm">
            {/* Runs resolved before the yield-multiplier change carry gold: 0 — nothing to show. */}
            {rewards.gold > 0 ? (
              <li className="flex items-center justify-between py-3">
                <span className="text-ink-200">Gold</span>
                <span className="tabular-nums text-gold-300">
                  +{rewards.gold.toLocaleString('en-US')}
                </span>
              </li>
            ) : null}
            {rewards.materials.map((material) => (
              <li key={material.material_id} className="flex items-center justify-between py-3">
                <span className="flex min-w-0 items-center gap-2">
                  <MaterialIcon material={materialById.get(material.material_id)} size={24} />
                  <span className="truncate text-ink-200">{nameOf(material.material_id)}</span>
                </span>
                <span className="tabular-nums text-ink-50">+{material.qty}</span>
              </li>
            ))}
            {rewards.chest_id ? (
              <li className="flex items-center justify-between py-3">
                <span className="text-ink-200">Chest</span>
                <span className="capitalize text-gold-300">{rewards.chest_id}</span>
              </li>
            ) : null}
          </ul>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-card bg-gold-500 px-3 py-2.5 text-sm font-medium text-ink-950"
        >
          Continue
        </button>
      </section>
    </div>
  )
}