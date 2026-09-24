import { useState } from 'react'

import { Panel, Screen } from '@/components/Screen'
import { useMaterialCatalog } from '@/features/inventory/api'
import { useProfile } from '@/features/profile/api'
import { toast } from '@/lib/toast'
import {
  useGrantTestChests,
  useGrantTestGems,
  useGrantTestGold,
  useGrantTestMaterial,
} from '@/features/progression/api'

type Faucet = {
  /** Stable value for the picker: a currency id, or `material:<id>`. */
  value: string
  label: string
  defaultQty: number
}

const CURRENCY_FAUCETS: Faucet[] = [
  { value: 'gold', label: 'Gold', defaultQty: 10000 },
  { value: 'gems', label: 'Gems', defaultQty: 100 },
  { value: 'chests', label: 'Common chests', defaultQty: 10 },
]

const MATERIAL_PREFIX = 'material:'

/**
 * Dev-only faucets for currencies and materials with no quick earn path in v1. The RPCs are
 * granted to `authenticated` in every build, so this screen is a convenience, not a boundary.
 */
export function DevToolsScreen() {
  const { data: profile } = useProfile()
  const { data: materials } = useMaterialCatalog()
  const grantTestGold = useGrantTestGold()
  const grantTestGems = useGrantTestGems()
  const grantTestChests = useGrantTestChests()
  const grantTestMaterial = useGrantTestMaterial()

  const [selected, setSelected] = useState('gold')
  const [quantity, setQuantity] = useState('10000')

  const isPending =
    grantTestGold.isPending ||
    grantTestGems.isPending ||
    grantTestChests.isPending ||
    grantTestMaterial.isPending
  const error =
    grantTestGold.error ?? grantTestGems.error ?? grantTestChests.error ?? grantTestMaterial.error

  function defaultQtyFor(value: string) {
    if (value.startsWith(MATERIAL_PREFIX)) return 10
    return CURRENCY_FAUCETS.find((faucet) => faucet.value === value)?.defaultQty ?? 1
  }

  function handleGrant() {
    const qty = Number.parseInt(quantity, 10)
    if (!Number.isFinite(qty) || qty < 1) return

    const label = selected.startsWith(MATERIAL_PREFIX)
      ? (materials?.find((material) => material.id === selected.slice(MATERIAL_PREFIX.length))
          ?.name ?? 'material')
      : (CURRENCY_FAUCETS.find((faucet) => faucet.value === selected)?.label ?? 'resource')
    const onSuccess = () => toast(`Granted ${qty.toLocaleString('en-US')} ${label}`)

    if (selected === 'gold') grantTestGold.mutate(qty, { onSuccess })
    else if (selected === 'gems') grantTestGems.mutate(qty, { onSuccess })
    else if (selected === 'chests') grantTestChests.mutate(qty, { onSuccess })
    else if (selected.startsWith(MATERIAL_PREFIX)) {
      grantTestMaterial.mutate(
        { materialId: selected.slice(MATERIAL_PREFIX.length), quantity: qty },
        { onSuccess },
      )
    }
  }

  function handleSelect(next: string) {
    setSelected(next)
    setQuantity(String(defaultQtyFor(next)))
  }

  return (
    <Screen title="Testing" hint="Faucets for currencies and materials with no earn path in v1.">
      <div className="space-y-3">
        <Panel title="Account">
          <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
            <dt className="text-ink-400">Gold</dt>
            <dd className="tabular-nums">{profile?.gold?.toLocaleString('en-US') ?? '—'}</dd>
            <dt className="text-ink-400">Gems</dt>
            <dd className="tabular-nums">{profile?.gems?.toLocaleString('en-US') ?? '—'}</dd>
            <dt className="text-ink-400">Run slots</dt>
            <dd className="tabular-nums">{profile?.run_slots ?? '—'}</dd>
          </dl>
        </Panel>

        <Panel title="Faucets">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selected}
              onChange={(event) => handleSelect(event.target.value)}
              className="min-w-0 flex-1 rounded-card border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-100 outline-none focus:border-gold-500"
            >
              <optgroup label="Currencies">
                {CURRENCY_FAUCETS.map((faucet) => (
                  <option key={faucet.value} value={faucet.value}>
                    {faucet.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Materials">
                {(materials ?? []).map((material) => (
                  <option key={material.id} value={`${MATERIAL_PREFIX}${material.id}`}>
                    {material.name}
                  </option>
                ))}
              </optgroup>
            </select>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className="w-28 rounded-card border border-ink-700 bg-ink-900 px-3 py-2 text-sm tabular-nums text-ink-100 outline-none focus:border-gold-500"
            />
            <button
              type="button"
              className="rounded-card border border-gold-500/60 px-3 py-2 text-xs font-medium text-gold-300 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isPending}
              onClick={handleGrant}
            >
              {isPending ? 'Granting...' : 'Grant'}
            </button>
          </div>
          <p className="mt-3 text-xs text-ink-500">
            Gems buy the wait back on a running dungeon; chests open in the Vault; gold and
            materials feed rank-up.
          </p>
          {error ? <p className="mt-3 text-xs text-faction-ember">{error.message}</p> : null}
        </Panel>
      </div>
    </Screen>
  )
}
