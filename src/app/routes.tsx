import { createBrowserRouter } from 'react-router-dom'

import { AppShell } from './AppShell'
import { AuthGate } from '@/features/auth/AuthGate'
import { CardLibraryScreen } from '@/features/cards/CardLibraryScreen'
import { CardDetailScreen } from '@/features/cards/CardDetailScreen'
import { ChestOpenScreen } from '@/features/chests/ChestOpenScreen'
import { DevToolsScreen } from '@/features/dev/DevToolsScreen'
import { DungeonMapScreen } from '@/features/dungeons/DungeonMapScreen'
import { HomeScreen } from '@/features/home/HomeScreen'
import { InventoryScreen } from '@/features/inventory/InventoryScreen'
import { MarketScreen } from '@/features/marketplace/MarketScreen'
import { PartyBuilderScreen } from '@/features/party/PartyBuilderScreen'
import { ProfileScreen } from '@/features/profile/ProfileScreen'

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <AuthGate>
        <AppShell />
      </AuthGate>
    ),
    children: [
      { index: true, element: <HomeScreen /> },
      { path: 'cards', element: <CardLibraryScreen /> },
      { path: 'cards/:cardRefId', element: <CardDetailScreen /> },
      { path: 'party', element: <PartyBuilderScreen /> },
      { path: 'dungeons', element: <DungeonMapScreen /> },
      { path: 'chests', element: <ChestOpenScreen /> },
      { path: 'market', element: <MarketScreen /> },
      { path: 'inventory', element: <InventoryScreen /> },
      { path: 'dev', element: <DevToolsScreen /> },
      { path: 'profile', element: <ProfileScreen /> },
    ],
  },
])
