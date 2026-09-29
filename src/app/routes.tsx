import { Navigate, createBrowserRouter } from 'react-router-dom'

import { AppShell } from './AppShell'
import { AuthGate } from '@/features/auth/AuthGate'
import { CardLibraryScreen } from '@/features/cards/CardLibraryScreen'
import { CardDetailScreen } from '@/features/cards/CardDetailScreen'
import { DevToolsScreen } from '@/features/dev/DevToolsScreen'
import { DungeonMapScreen } from '@/features/dungeons/DungeonMapScreen'
import { HomeScreen } from '@/features/home/HomeScreen'
import { VaultScreen } from '@/features/inventory/VaultScreen'
import { MarketScreen } from '@/features/marketplace/MarketScreen'
import { PartyBuilderScreen } from '@/features/party/PartyBuilderScreen'
import { ProfileScreen } from '@/features/profile/ProfileScreen'
import { QuestListScreen } from '@/features/quests/QuestListScreen'

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
      { path: 'quests', element: <QuestListScreen /> },
      { path: 'inventory', element: <VaultScreen /> },
      { path: 'market', element: <MarketScreen /> },
      { path: 'dev', element: <DevToolsScreen /> },
      { path: 'profile', element: <ProfileScreen /> },
      // The Chests tab moved into the Vault; keep the old URL working for deep links.
      { path: 'chests', element: <Navigate replace to="/inventory?tab=chests" /> },
    ],
  },
])
