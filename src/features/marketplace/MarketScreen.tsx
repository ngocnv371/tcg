import { Gem } from 'lucide-react'

import { Panel, Screen } from '@/components/Screen'
import { ChestIcon } from '@/features/chests/ChestIcon'
import { useBuyChest, useChestCatalog } from '@/features/marketplace/api'
import { useProfile } from '@/features/profile/api'
import { rewardToast } from '@/lib/toast'
import type { Chest } from '@/types/db'

export function MarketScreen() {
  const { data: profile } = useProfile()
  const { data: marketChests } = useChestCatalog()
  const buyChest = useBuyChest()
  const gems = profile?.gems ?? 0

  const handleBuy = (chest: Chest) => {
    buyChest.mutate(
      { chestId: chest.id, qty: 1 },
      {
        onSuccess: (tx) =>
          rewardToast({
            title: `${chest.name} secured`,
            detail: `Added to your vault · ${tx.total_gems.toLocaleString('en-US')} gems spent`,
            icon: <ChestIcon chest={chest} size={44} />,
          }),
      },
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
              const affordable = forSale && gems >= chest.gem_price
              return (
                <div
                  key={chest.id}
                  className="flex items-center gap-3 rounded-card border border-ink-700 bg-ink-850 p-3"
                >
                  <ChestIcon chest={chest} size={48} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-medium capitalize text-ink-50">
                      {chest.name}
                    </p>
                    <span className="mt-0.5 inline-block rounded-full bg-ink-700 px-2 py-0.5 text-xs tabular-nums text-ink-200">
                      T{chest.tier}
                    </span>
                  </div>
                  {forSale ? (
                    <button
                      type="button"
                      aria-label={`Buy ${chest.id} chest for ${chest.gem_price} gems`}
                      className="flex shrink-0 items-center gap-1.5 rounded-card bg-faction-tide px-4 py-3 text-base font-semibold tabular-nums text-ink-950 shadow-[0_4px_16px_-4px] shadow-faction-tide/60 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-ink-400 disabled:shadow-none"
                      disabled={buyChest.isPending || !affordable}
                      title={affordable ? undefined : 'Not enough gems'}
                      onClick={() => handleBuy(chest)}
                    >
                      {isBuying ? (
                        '…'
                      ) : (
                        <>
                          <Gem className="size-5" />
                          {chest.gem_price.toLocaleString('en-US')}
                        </>
                      )}
                    </button>
                  ) : (
                    <span className="shrink-0 text-sm text-ink-500">Not for sale</span>
                  )}
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
