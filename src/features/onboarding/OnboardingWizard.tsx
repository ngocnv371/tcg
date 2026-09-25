import { Sparkles, X } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { useCardCatalog, useCollection } from '@/features/cards/api'
import { useRuns } from '@/features/dungeons/api'
import { buildOnboardingSteps } from '@/features/home/homeTasks'
import { dismissOnboardingWizard, useWizardDismissed } from '@/features/onboarding/dismissal'
import { useParties } from '@/features/party/api'
import { useChestInventory } from '@/features/progression/api'

/**
 * The first-session guide: a one-step-at-a-time coach card, rendered by the shell so it
 * survives navigation between the screens each beat sends the player to. Which step is shown
 * is derived from live state, never stored — the same rule as the Home checklist, which takes
 * over once the wizard is skipped or finished.
 */
export function OnboardingWizard() {
  const dismissed = useWizardDismissed()
  const { data: chests } = useChestInventory()
  const { data: runs } = useRuns()
  const { data: collection } = useCollection()
  const { data: cards } = useCardCatalog()
  const { data: parties } = useParties()

  const steps = buildOnboardingSteps({
    chests: chests ?? [],
    runs: runs ?? [],
    collection: collection ?? [],
    parties: parties ?? [],
  })
  const current = steps.find((step) => !step.done)
  if (dismissed || !current) return null

  const done = steps.filter((step) => step.done).length

  // The guaranteed 3★ starter leads the first party; show its face on the very first beat so
  // the player connects the free chest to the cards they already own.
  const starter = (collection ?? []).find((copy) => copy.rank >= 3)
  const starterCard = starter ? (cards ?? []).find((card) => card.id === starter.card_id) : undefined
  const starterFace =
    current.id === 'open-chest' && starter && starterCard ? { copy: starter, card: starterCard } : null

  return (
    <aside
      aria-label="Getting started"
      className="fixed inset-x-3 bottom-[calc(var(--safe-bottom)+4.25rem)] z-30 mx-auto max-w-sm rounded-card border border-gold-600/70 bg-ink-900/95 p-3 shadow-lg backdrop-blur"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-gold-300">
            Getting started · {done}/{steps.length}
          </p>
          <h2 className="mt-0.5 text-sm text-ink-50">{current.label}</h2>
          <p className="mt-0.5 text-xs text-ink-400">{current.hint}</p>
        </div>
        <button
          type="button"
          aria-label="Skip the guide"
          title="Skip"
          onClick={dismissOnboardingWizard}
          className="grid size-7 shrink-0 place-items-center rounded-card text-ink-500 hover:bg-ink-800 hover:text-ink-200"
        >
          <X className="size-4" />
        </button>
      </div>

      {starterFace ? (
        <p className="mt-2 flex items-center gap-1.5 rounded-card bg-ink-850 px-2 py-1.5 text-xs text-ink-300">
          <Sparkles className="size-3.5 shrink-0 text-gold-400" />
          <span className="min-w-0 truncate">
            <span className="text-ink-100">{starterFace.card.name}</span> joins at 3★.
          </span>
          <NavLink to={`/cards/${starterFace.copy.id}`} className="ml-auto shrink-0 text-gold-300">
            View
          </NavLink>
        </p>
      ) : null}

      <NavLink
        to={current.to}
        className="mt-2.5 block rounded-card bg-gold-500 px-3 py-2 text-center text-xs font-medium text-ink-950"
      >
        {current.cta}
      </NavLink>
    </aside>
  )
}
