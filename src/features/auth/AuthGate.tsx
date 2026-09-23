import { useSession } from './useSession'
import { SignInScreen } from './SignInScreen'

/**
 * Everything behind the shell requires a session, and the profile row is created
 * by the `handle_new_user` trigger in the init migration.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession()

  if (loading) {
    return (
      <div className="app-shell grid place-items-center bg-ink-950">
        <p className="animate-pulse text-sm text-ink-400">Loading…</p>
      </div>
    )
  }

  if (!session) return <SignInScreen />

  return <>{children}</>
}
