/**
 * Pure derivations behind the Home hub. Kept out of the component so the "ready now"
 * queue and the onboarding checklist can be unit tested without mounting React or a
 * Supabase client. Everything here is a *preview*: the server functions remain the
 * authority on whether an action is actually allowed.
 */
import { selectRankUpFodder } from '@/game/formulas'
import type { CardRank, ChestInventoryRow, DungeonRun, PlayerCard } from '@/types/db'

/**
 * Whether today's free chest is still unclaimed. Mirrors the `current_date` guard inside
 * `claim_daily_chest`; the comparison is local, so it can only be optimistic by a timezone,
 * never authoritative.
 */
export function dailyChestReady(claimedAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!claimedAt) return true
  const claimed = new Date(claimedAt)
  return (
    claimed.getFullYear() !== now.getFullYear() ||
    claimed.getMonth() !== now.getMonth() ||
    claimed.getDate() !== now.getDate()
  )
}

export type RankUpReady = {
  /** The owned copy to open — copies rank independently. */
  playerCardId: string
  cardId: string
  fromRank: CardRank
  toRank: CardRank
}

/**
 * Every owned copy with enough duplicate fodder to rank up. Runs the same
 * `selectRankUpFodder` the server mirrors; an equipped copy cannot be fodder, so the caller
 * passes the set of player_card ids currently in a party.
 */
export function rankUpReadyCopies(
  collection: readonly PlayerCard[],
  equippedIds: ReadonlySet<string> = new Set(),
): RankUpReady[] {
  const candidates = collection.map((copy) => ({
    id: copy.id,
    card_id: copy.card_id,
    rank: copy.rank,
    locked: copy.locked,
    inParty: equippedIds.has(copy.id),
  }))

  return collection.flatMap((copy) => {
    const fodder = selectRankUpFodder(copy, candidates)
    if (!fodder) return []
    return [
      {
        playerCardId: copy.id,
        cardId: copy.card_id,
        fromRank: copy.rank,
        toRank: (copy.rank + 1) as CardRank,
      },
    ]
  })
}

export type OnboardingStep = {
  id: string
  label: string
  hint: string
  /** Label for the step's call to action; the wizard's one-tap button, not the checklist. */
  cta: string
  done: boolean
  to: string
}

/** Just enough of a party to know it can field a lineup; keeps this module out of `party/api`. */
export type PartyLike = { slots: readonly unknown[] }

/**
 * The first-session arc, derived entirely from state the client already reads — no extra
 * table, no client-written progression flag. Steps clear themselves as the player acts.
 *
 * A party must come before a run: provisioning builds an empty "First Expedition" for an
 * account created before any cards exist (the empty-catalog dev account), so the first card a
 * chest grants still has to be added to a lineup by hand.
 */
export function buildOnboardingSteps(input: {
  chests: readonly ChestInventoryRow[]
  runs: readonly DungeonRun[]
  collection: readonly PlayerCard[]
  parties: readonly PartyLike[]
}): OnboardingStep[] {
  return [
    {
      id: 'open-chest',
      label: 'Open your Rare chest',
      hint: 'The first one is on the house.',
      cta: 'Open chests',
      done: input.chests.some((chest) => chest.opened_at),
      to: '/inventory?tab=chests',
    },
    {
      id: 'build-party',
      label: 'Build a party',
      hint: 'Add your new card to a lineup.',
      cta: 'Go to party',
      done: input.parties.some((party) => party.slots.length > 0),
      to: '/party',
    },
    {
      id: 'first-run',
      label: 'Run the Training Grounds',
      hint: 'Send your party on the 10-second tutorial.',
      cta: 'Go to dungeons',
      done: input.runs.length > 0,
      to: '/dungeons',
    },
    {
      id: 'claim-run',
      label: 'Claim your rewards',
      hint: 'Rewards return when the timer ends.',
      cta: 'Claim',
      done: input.runs.some((run) => run.claimed_at),
      to: '/dungeons',
    },
    {
      id: 'level-up',
      label: 'Level up a stat',
      hint: 'Spend the tutorial gold and Cores on a 1★ copy.',
      cta: 'Level up',
      done: input.collection.some(
        (copy) =>
          copy.atk_level > 1 || copy.hp_level > 1 || copy.def_level > 1 || copy.spd_level > 1,
      ),
      to: '/cards',
    },
  ]
}

/** The checklist is presentation only, so its dismissal is a browser concern, not a DB one. */
export const ONBOARDING_DISMISS_KEY = 'tcg:home:checklist-dismissed'
/** The first-session wizard is dismissed separately, so the checklist can still take over. */
export const ONBOARDING_WIZARD_DISMISS_KEY = 'tcg:onboarding:wizard-dismissed'
