import { useState } from 'react'

import { supabase } from '@/lib/supabase'

export function SignInScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('dev@tcg2.local')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)

    const result =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })

    setBusy(false)
    if (result.error) {
      setError(result.error.message)
      return
    }
    if (mode === 'signup' && !result.data.session) {
      setNotice('Account created — check your email to confirm, then sign in.')
    }
  }

  return (
    <div className="app-shell grid place-items-center bg-ink-950 px-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <div className="text-center">
          <h1 className="font-display text-2xl text-gold-300">TCG 2</h1>
          <p className="mt-1 text-xs text-ink-400">
            {mode === 'signin' ? 'Sign in to your collection' : 'Create your account'}
          </p>
        </div>

        <input
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-card border border-ink-700 bg-ink-900 px-3 py-2.5 text-sm outline-none focus:border-gold-500"
        />
        <input
          type="password"
          required
          minLength={6}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-card border border-ink-700 bg-ink-900 px-3 py-2.5 text-sm outline-none focus:border-gold-500"
        />

        {error ? <p className="text-xs text-faction-ember">{error}</p> : null}
        {notice ? <p className="text-xs text-faction-verdant">{notice}</p> : null}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-card bg-gold-500 px-3 py-2.5 text-sm font-medium text-ink-950 disabled:opacity-50"
        >
          {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
        </button>

        <button
          type="button"
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          className="w-full text-center text-xs text-ink-400 underline"
        >
          {mode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  )
}
