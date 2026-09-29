import { Coins, Gem, LogOut, Map, Menu, Store, Wrench, X } from 'lucide-react'
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
  { to: '/quests', label: 'Quests', icon: '✦' },
  { to: '/inventory', label: 'Vault', icon: '◇' },
]

/** Secondary destinations that live in the header so they don't crowd the bottom tab bar. */
const HEADER_NAV = [
  { to: '/market', label: 'Market', icon: Store },
  { to: '/dungeons', label: 'Dungeons', icon: Map },
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
  const [menuOpen, setMenuOpen] = useState(false)
  const num = (value: number | undefined) =>
    value === undefined ? '—' : value.toLocaleString('en-US')

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

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
          Runewatch
        </NavLink>
        <div className="flex items-center gap-1.5">
          {/* Desktop quick links; on small screens these move into the menu drawer. */}
          <div className="hidden items-center gap-1.5 md:flex">
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
          </div>
          <Resource icon={<Coins className="size-3.5 text-gold-400" />} value={num(profile?.gold)} />
          <Resource icon={<Gem className="size-3.5 text-faction-tide" />} value={num(profile?.gems)} />
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            title="Menu"
            className="grid size-8 place-items-center rounded-card text-ink-400 hover:bg-ink-800 hover:text-ink-100 md:hidden"
          >
            <Menu className="size-4" />
          </button>
        </div>
      </header>

      {menuOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col border-l border-ink-800 bg-ink-900 pb-[var(--safe-bottom)] shadow-lg"
          >
            <header className="flex items-center justify-between border-b border-ink-800 px-4 py-3">
              <span className="font-display text-sm tracking-wide text-gold-300">Runewatch</span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                title="Close"
                className="grid size-8 place-items-center rounded-card text-ink-400 hover:bg-ink-800 hover:text-ink-100"
              >
                <X className="size-4" />
              </button>
            </header>
            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              {HEADER_NAV.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-card px-3 py-2.5 text-sm',
                      isActive
                        ? 'bg-ink-800 text-gold-300'
                        : 'text-ink-300 hover:bg-ink-800 hover:text-ink-100',
                    )
                  }
                >
                  <Icon className="size-4" />
                  {label}
                </NavLink>
              ))}
            </nav>
            <div className="border-t border-ink-800 p-3">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  void signOut()
                }}
                disabled={signingOut}
                className="flex w-full items-center gap-3 rounded-card px-3 py-2.5 text-sm text-ink-300 hover:bg-ink-800 hover:text-ink-100 disabled:opacity-50"
              >
                <LogOut className="size-4" />
                Sign out
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      <main className="flex-1">
        <Outlet />
      </main>

      <OnboardingWizard />

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
