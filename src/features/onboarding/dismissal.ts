import { useSyncExternalStore } from 'react'

import { ONBOARDING_WIZARD_DISMISS_KEY } from '@/features/home/homeTasks'

/**
 * The wizard's dismissal is browser state, not progression — the same call the Home checklist
 * makes. It lives in a tiny external store so the wizard (rendered by the shell) and Home
 * (which hides its checklist behind it) stay in sync the moment it is skipped, without
 * pulling in a persistence library.
 */
const listeners = new Set<() => void>()

function read(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_WIZARD_DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

let dismissed = read()

export function dismissOnboardingWizard() {
  dismissed = true
  try {
    window.localStorage.setItem(ONBOARDING_WIZARD_DISMISS_KEY, '1')
  } catch {
    // A browser with storage disabled keeps the wizard hidden for this session only.
  }
  listeners.forEach((listener) => listener())
}

export function useWizardDismissed(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    () => dismissed,
    () => false,
  )
}
