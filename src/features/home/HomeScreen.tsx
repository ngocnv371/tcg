import { useState } from 'react'
import { NavLink } from 'react-router-dom'

import { Panel, Screen } from '@/components/Screen'
import { useCardCatalog, useCollection } from '@/features/cards/api'
import { useDungeons, useRuns } from '@/features/dungeons/api'
import { RunProgress } from '@/features/dungeons/RunProgress'
import { RunRewardsModal } from '@/features/dungeons/RunRewardsModal'
import { RunVictoryOverlay, type RunVictory } from '@/features/dungeons/RunVictoryOverlay'
import {
  ONBOARDING_DISMISS_KEY,
  buildOnboardingSteps,
  dailyChestReady,
  rankUpReadyCopies,
} from '@/features/home/homeTasks'
import { OnboardingChecklist } from '@/features/home/OnboardingChecklist'
import { useInventory } from '@/features/inventory/api'
import { useProfile } from '@/features/profile/api'
import {
  useClaimDailyChest,
  useClaimRun,
  useChestInventory,
  useRushRun,
  type RunClaim,
} from '@/features/progression/api'

function readChecklistDismissed() {
  try {
    return window.localStorage.getItem(ONBOARDING_DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * The hub: what needs the player right now, then what is still running. Every row either
 * performs the action in place (claim) or deep-links to the screen that owns it — Home
 * never grows a second copy of a feature.
 */
export function HomeScreen() {
  const { data: runs } = useRuns()
  const { data: dungeons } = useDungeons()
  const { data: profile } = useProfile()
  const { data: chests } = useChestInventory()
  const { data: collection } = useCollection()
  const { data: cards } = useCardCatalog()
  const { data: inventory } = useInventory()

  const claimRun = useClaimRun()
  const rushRun = useRushRun()
  const claimDaily = useClaimDailyChest()
  const [claim, setClaim] = useState<RunClaim | null>(null)
  /** The claim celebration, played once before the settlement panel — same as the dungeon screen. */
  const [victory, setVictory] = useState<RunVictory | null>(null)
  const [checklistDismissed, setChecklistDismissed] = useState(readChecklistDismissed)

  const activeRuns = runs?.filter((run) => !run.resolved_at) ?? []
  const claimableRuns = runs?.filter((run) => run.resolved_at && !run.claimed_at) ?? []
  const dungeonNames = new Map((dungeons ?? []).map((dungeon) => [dungeon.id, dungeon.name]))

  const unopened = chests?.filter((chest) => !chest.opened_at) ?? []
  const dailyReady = dailyChestReady(profile?.daily_chest_claimed_at)
  const rankReady = rankUpReadyCopies(
    collection ?? [],
    cards ?? [],
    inventory ?? [],
    profile?.gold ?? 0,
  )

  const steps = buildOnboardingSteps({
    chests: chests ?? [],
    runs: runs ?? [],
    collection: collection ?? [],
  })
  const showChecklist = !checklistDismissed && !steps.every((step) => step.done)
  const slotsFree = (profile?.run_slots ?? 0) > activeRuns.length
  const anythingReady =
    claimableRuns.length > 0 || dailyReady || unopened.length > 0 || rankReady.length > 0

  const dismissChecklist = () => {
    setChecklistDismissed(true)
    try {
      window.localStorage.setItem(ONBOARDING_DISMISS_KEY, '1')
    } catch {
      // A browser with storage disabled keeps the card for this session only.
    }
  }

  return (
    <Screen title="Home" hint="What needs you, and what is still running.">
      <div className="space-y-3">
        {showChecklist ? <OnboardingChecklist onDismiss={dismissChecklist} steps={steps} /> : null}

        <Panel title="Ready now">
          {anythingReady ? (
            <ul className="space-y-2.5">
              {claimableRuns.map((run) => (
                <li key={run.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink-100">
                      {dungeonNames.get(run.dungeon_id) ?? run.dungeon_id}
                    </p>
                    <p className="text-xs text-faction-verdant">Cleared — rewards ready</p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-card bg-gold-500 px-3 py-2 text-xs font-medium text-ink-950 disabled:opacity-50"
                    disabled={claimRun.isPending}
                    onClick={() =>
                      claimRun.mutate(run.id, {
                        // Celebrate first, settle second: the panel opens once the
                        // victory animation has been dismissed.
                        onSuccess: (result) => {
                          setClaim(result)
                          const dungeon = (dungeons ?? []).find(
                            (candidate) => candidate.id === run.dungeon_id,
                          )
                          if (dungeon) {
                            setVictory({ claim: result, dungeon, key: run.id, run })
                          }
                        },
                      })
                    }
                  >
                    Claim
                  </button>
                </li>
              ))}

              {dailyReady ? (
                <ReadyRow
                  detail="One free common chest, once a day."
                  label="Daily chest ready"
                >
                  <button
                    type="button"
                    className="rounded-card bg-gold-500 px-3 py-2 text-xs font-medium text-ink-950 disabled:opacity-50"
                    disabled={claimDaily.isPending}
                    onClick={() => claimDaily.mutate()}
                  >
                    {claimDaily.isPending ? 'Claiming...' : 'Claim'}
                  </button>
                </ReadyRow>
              ) : null}

              {unopened.length > 0 ? (
                <ReadyRow
                  detail={`${unopened.length} chest${unopened.length === 1 ? '' : 's'} in the vault.`}
                  label="Open your chests"
                >
                  <ActionLink to="/chests">Open</ActionLink>
                </ReadyRow>
              ) : null}

              {rankReady.length > 0 ? (
                <ReadyRow
                  detail={`${rankReady.length} card${rankReady.length === 1 ? '' : 's'} have the gold and Cores.`}
                  label="Rank up"
                >
                  <ActionLink to={`/cards/${rankReady[0].playerCardId}`}>Rank up</ActionLink>
                </ReadyRow>
              ) : null}
            </ul>
          ) : (
            <p className="text-sm text-ink-400">All caught up — nothing needs you.</p>
          )}
          {claimRun.error ? (
            <p className="mt-3 text-xs text-faction-ember">{claimRun.error.message}</p>
          ) : null}
          {claimDaily.error ? (
            <p className="mt-2 text-xs text-faction-ember">{claimDaily.error.message}</p>
          ) : null}
        </Panel>

        <Panel title="In progress">
          {activeRuns.length > 0 ? (
            <div className="space-y-3">
              {activeRuns.map((run) => (
                <div key={run.id}>
                  <p className="text-sm text-ink-100">
                    {dungeonNames.get(run.dungeon_id) ?? run.dungeon_id}
                  </p>
                  <div className="mt-1.5">
                    <RunProgress
                      run={run}
                      gems={profile?.gems}
                      rushPending={rushRun.isPending && rushRun.variables === run.id}
                      onRush={() => rushRun.mutate(run.id)}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-400">No runs in progress.</p>
          )}
          {slotsFree && claimableRuns.length === 0 ? (
            <NavLink
              to="/dungeons"
              className="mt-3 block rounded-card border border-gold-600 px-3 py-2 text-center text-xs text-gold-300"
            >
              Send a party
            </NavLink>
          ) : null}
          {rushRun.error ? (
            <p className="mt-2 text-xs text-faction-ember">{rushRun.error.message}</p>
          ) : null}
        </Panel>
      </div>

      {victory ? (
        <RunVictoryOverlay victory={victory} onClose={() => setVictory(null)} />
      ) : null}
      {/* Held back until the celebration is over, so the two never stack. */}
      {claim && !victory ? <RunRewardsModal claim={claim} onClose={() => setClaim(null)} /> : null}
    </Screen>
  )
}

function ReadyRow({
  label,
  detail,
  children,
}: {
  label: string
  detail: string
  children: React.ReactNode
}) {
  return (
    <li className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm text-ink-100">{label}</p>
        <p className="truncate text-xs text-ink-400">{detail}</p>
      </div>
      <span className="shrink-0">{children}</span>
    </li>
  )
}

function ActionLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className="rounded-card border border-gold-600 px-3 py-2 text-xs text-gold-300 hover:bg-ink-850"
    >
      {children}
    </NavLink>
  )
}
