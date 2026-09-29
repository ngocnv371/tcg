import { useSearchParams } from 'react-router-dom'

import { Screen } from '@/components/Screen'
import { Tabs } from '@/components/Tabs'
import { VaultChests } from '@/features/chests/ChestOpenScreen'
import { VaultResources } from '@/features/inventory/InventoryScreen'

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
      <Tabs ariaLabel="Vault sections" tabs={TABS} value={tab} onChange={selectTab} />
      {tab === 'resources' ? <VaultResources /> : <VaultChests />}
    </Screen>
  )
}
