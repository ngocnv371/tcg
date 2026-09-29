import { useSearchParams } from 'react-router-dom'

import { Screen } from '@/components/Screen'
import { VaultChests } from '@/features/chests/ChestOpenScreen'
import { VaultResources } from '@/features/inventory/InventoryScreen'
import { cn } from '@/lib/utils'

/**
 * Resources and Chests both lived in the bottom bar; folding them into one Vault screen keeps
 * the bar to five destinations while leaving each a full surface. The active tab is the URL
 * (`?tab=chests`), so Home's "open your chests" link and the back button both land right.
 */
type VaultTab = 'resources' | 'chests'

const TABS: readonly { id: VaultTab; label: string }[] = [
  { id: 'resources', label: 'Resources' },
  { id: 'chests', label: 'Chests' },
]

const HINTS: Record<VaultTab, string> = {
  resources: "Cores come from dungeons — farm the ones a card's tags need to rank it up.",
  chests: 'Open your chests to grow the collection — dupes pay shards for rank-ups.',
}

export function VaultScreen() {
  const [params, setParams] = useSearchParams()
  const tab: VaultTab = params.get('tab') === 'chests' ? 'chests' : 'resources'

  const selectTab = (next: VaultTab) => {
    // Resources is the default, so it carries no param — the URL stays clean.
    setParams(next === 'resources' ? {} : { tab: next }, { replace: true })
  }

  return (
    <Screen title="Vault" hint={HINTS[tab]}>
      <div
        role="tablist"
        aria-label="Vault sections"
        className="mb-3 grid grid-cols-2 gap-1 rounded-card border border-ink-800 bg-ink-900/70 p-1"
      >
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => selectTab(id)}
            className={cn(
              'rounded-card py-2 text-sm font-medium transition-colors',
              tab === id ? 'bg-ink-700 text-gold-300' : 'text-ink-400 hover:text-ink-100',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'resources' ? <VaultResources /> : <VaultChests />}
    </Screen>
  )
}
