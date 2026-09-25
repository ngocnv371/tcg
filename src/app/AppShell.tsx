import { Coins, Gem, LogOut, Store, Swords, Wrench } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

import { supabase } from '@/lib/supabase'
import { track } from '@/lib/telemetry'
import { useRunSync } from '@/features/dungeons/api'
import { OnboardingWizard } from '@/features/onboarding/OnboardingWizard'
import { useProfile } from '@/features/profile/api'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/', label: 'Home', icon: '⌂' },
  { to: '/cards', label: 'Cards', icon: '▤' },
  { to: '/party', label: 'Party', icon: '⚔' },
  { to: '/dungeons', label: 'Dungeons', icon: '◈' },
  { to: '/chests', label: 'Chests', icon: '▣' },
  { to: '/inventory', label: 'Vault', icon: '◇' },
]

/** Secondary destinations that live in the header so they don't crowd the bottom tab bar. */
const HEADER_NAV = [
  { to: '/market', label: 'Market', icon: Store },
  { to: '/dev', label: 'Dev', icon: Wrench },
]

function Resource({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-ink-800/80 px-2.5 py-1 text-xs text-ink-100 tabular-nums">
      {icon}
      {value}
    </span>
  )
}

// Module scope, not component state: a remount or a StrictMode double-invoke is still one
// app open, and this event is how D1/D3 return is measured.
let appOpenTracked = false

/** Shell: resource bar on top, bottom tab bar, outlet in between. */
export function AppShell() {
  const { data: profile } = useProfile()
  useRunSync()
  const [signingOut, setSigningOut] = useState(false)
  const num = (value: number | undefined) =>
    value === undefined ? '—' : value.toLocaleString('en-US')

  useEffect(() => {
    if (appOpenTracked) return
    appOpenTracked = true
    track('app_open', {
      // Tells the tuning pass whether the tester actually installed the PWA.
      standalone: window.matchMedia('(display-mode: standalone)').matches,
    })
  }, [])

  async function signOut() {
    setSigningOut(true)
    const { error } = await supabase.auth.signOut()
    if (error) setSigningOut(false)
  }

  return (
    <div className="app-shell flex flex-col bg-ink-950">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-ink-800/70 bg-ink-900/95 px-4 py-2.5 backdrop-blur">
        <NavLink to="/profile" className="font-display text-sm tracking-wide text-gold-300">
          TCG 2
        </NavLink>
        <div className="flex items-center gap-1.5">
          {HEADER_NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              aria-label={label}
              title={label}
              className={({ isActive }) =>
                cn(
                  'grid size-8 place-items-center rounded-card hover:bg-ink-800',
                  isActive ? 'text-gold-300' : 'text-ink-400 hover:text-ink-100',
                )
              }
            >
              <Icon className="size-4" />
            </NavLink>
          ))}
          <Resource icon={<Coins className="size-3.5 text-gold-400" />} value={num(profile?.gold)} />
          <Resource icon={<Gem className="size-3.5 text-faction-tide" />} value={num(profile?.gems)} />
          <Resource icon={<Swords className="size-3.5 text-ink-200" />} value={num(profile?.run_slots)} />
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            aria-label="Sign out"
            title="Sign out"
            className="grid size-8 place-items-center rounded-card text-ink-400 hover:bg-ink-800 hover:text-ink-100 disabled:opacity-50"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <OnboardingWizard />

      <nav className="sticky bottom-0 z-20 grid grid-cols-6 border-t border-ink-800/70 bg-ink-900/95 pb-[var(--safe-bottom)] backdrop-blur">
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
