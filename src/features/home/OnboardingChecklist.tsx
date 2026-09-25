import { Check, X } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { Panel } from '@/components/Screen'
import type { OnboardingStep } from '@/features/home/homeTasks'
import { cn } from '@/lib/utils'

/**
 * The first-session arc, as a self-clearing checklist. Every step is derived from live
 * player state, so it disappears once the last item is done — the dismiss control only
 * exists for players who would rather skip the guidance.
 */
export function OnboardingChecklist({
  steps,
  onDismiss,
}: {
  steps: OnboardingStep[]
  onDismiss: () => void
}) {
  const done = steps.filter((step) => step.done).length

  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-gold-300">Getting started</h2>
          <p className="mt-0.5 tabular-nums text-xs text-ink-400">
            {done} of {steps.length} done
          </p>
        </div>
        <button
          type="button"
          aria-label="Dismiss getting started"
          title="Dismiss"
          onClick={onDismiss}
          className="grid size-7 place-items-center rounded-card text-ink-500 hover:bg-ink-800 hover:text-ink-200"
        >
          <X className="size-4" />
        </button>
      </div>

      <ul className="mt-3 space-y-2">
        {steps.map((step) => {
          const content = (
            <>
              <span
                aria-hidden
                className={cn(
                  'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border',
                  step.done
                    ? 'border-faction-verdant bg-faction-verdant/20 text-faction-verdant'
                    : 'border-ink-600 text-transparent',
                )}
              >
                <Check className="size-3" />
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    'block text-sm',
                    step.done ? 'text-ink-500 line-through' : 'text-ink-100',
                  )}
                >
                  {step.label}
                </span>
                {step.done ? null : <span className="block text-xs text-ink-400">{step.hint}</span>}
              </span>
            </>
          )

          return (
            <li key={step.id}>
              {step.done ? (
                <span className="flex items-start gap-2.5">{content}</span>
              ) : (
                <NavLink
                  to={step.to}
                  className="flex items-start gap-2.5 rounded-card px-1 py-1 hover:bg-ink-850"
                >
                  {content}
                </NavLink>
              )}
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
