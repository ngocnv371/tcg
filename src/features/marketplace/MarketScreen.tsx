import { Gem } from 'lucide-react'

import { Panel, Screen } from '@/components/Screen'
import { ChestIcon } from '@/features/chests/ChestIcon'
import { useBuyChest, useChestCatalog } from '@/features/marketplace/api'
import { useProfile } from '@/features/profile/api'
import { toast } from '@/lib/toast'

/** Marketplace purchase steps. 1 is the default action. */
const BUY_QUANTITIES = [1, 10] as const

export function MarketScreen() {
  const { data: profile } = useProfile()
  const { data: marketChests } = useChestCatalog()
  const buyChest = useBuyChest()
  const gems = profile?.gems ?? 0

  const handleBuy = (chestId: string, qty: number) => {
    buyChest.mutate(
      { chestId, qty },
      { onSuccess: (tx) => toast(`Bought ${tx.qty} × ${chestId} chest for ${tx.total_gems} gems`) },
    )
  }

  return (
    <Screen title="Market" hint="Buy chests with gems">
      <div className="space-y-3">
        <Panel title="Chests">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-ink-200">Buy chests with gems</p>
            <span className="flex items-center gap-1 text-sm tabular-nums text-ink-100">
              <Gem className="size-3.5 text-faction-tide" />
              {gems.toLocaleString('en-US')}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {(marketChests ?? []).map((chest) => {
              const isBuying = buyChest.isPending && buyChest.variables?.chestId === chest.id
              const forSale = chest.gem_price > 0
              return (
                <div
                  key={chest.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-ink-700 bg-ink-850 px-3 py-2"
                >
                  <span className="flex flex-wrap items-center gap-2 text-sm text-ink-100">
                    <ChestIcon chest={chest} size={32} />
                    <span className="capitalize">{chest.name}</span>
                    <span className="rounded-full bg-ink-700 px-2 py-0.5 text-xs tabular-nums text-ink-200">
                      T{chest.tier}
                    </span>
                    {forSale ? (
                      <span className="inline-flex items-center gap-0.5 text-xs tabular-nums text-faction-tide">
                        <Gem className="size-3" />
                        {chest.gem_price.toLocaleString('en-US')}
                      </span>
                    ) : (
                      <span className="text-xs text-ink-500">Not for sale</span>
                    )}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {BUY_QUANTITIES.map((qty) => {
                      const cost = chest.gem_price * qty
                      const affordable = forSale && gems >= cost
                      return (
                        <button
                          key={qty}
                          type="button"
                          aria-label={`Buy ${qty} ${chest.id} chest${qty === 1 ? '' : 's'} for ${cost} gems`}
                          className="rounded-card border border-ink-600 px-2.5 py-1.5 text-xs font-medium text-ink-200 disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={buyChest.isPending || !affordable}
                          title={affordable ? undefined : 'Not enough gems'}
                          onClick={() => handleBuy(chest.id, qty)}
                        >
                          {isBuying ? '...' : `Buy ${qty} · ${cost}`}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            {!marketChests?.length ? (
              <p className="text-sm text-ink-400">No chests for sale.</p>
            ) : null}
          </div>
          {buyChest.error ? (
            <p className="mt-3 text-xs text-faction-ember">{buyChest.error.message}</p>
          ) : null}
        </Panel>
      </div>
    </Screen>
  )
}
