import { Coins, Gem, Swords } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'

import { useProfile } from '@/features/profile/api'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/', label: 'Home', icon: '⌂' },
  { to: '/cards', label: 'Cards', icon: '▤' },
  { to: '/party', label: 'Party', icon: '⚔' },
  { to: '/dungeons', label: 'Dungeons', icon: '◈' },
  { to: '/inventory', label: 'Vault', icon: '◇' },
]

function Resource({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-ink-800/80 px-2.5 py-1 text-xs text-ink-100 tabular-nums">
      {icon}
      {value}
    </span>
  )
}

/** Shell: resource bar on top, bottom tab bar, outlet in between. */
export function AppShell() {
  const { data: profile } = useProfile()
  const num = (value: number | undefined) =>
    value === undefined ? '—' : value.toLocaleString('en-US')

  return (
    <div className="app-shell flex flex-col bg-ink-950">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-ink-800/70 bg-ink-900/95 px-4 py-2.5 backdrop-blur">
        <NavLink to="/profile" className="font-display text-sm tracking-wide text-gold-300">
          TCG 2
        </NavLink>
        <div className="flex items-center gap-1.5">
          <Resource icon={<Coins className="size-3.5 text-gold-400" />} value={num(profile?.gold)} />
          <Resource icon={<Gem className="size-3.5 text-faction-tide" />} value={num(profile?.gems)} />
          <Resource icon={<Swords className="size-3.5 text-ink-200" />} value={num(profile?.run_slots)} />
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <nav className="sticky bottom-0 z-20 grid grid-cols-5 border-t border-ink-800/70 bg-ink-900/95 pb-[var(--safe-bottom)] backdrop-blur">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-0.5 py-2 text-[11px]',
                isActive ? 'text-gold-300' : 'text-ink-400',
              )
            }
          >
            <span aria-hidden className="text-base leading-none">
              {item.icon}
            </span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
