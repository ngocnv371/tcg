/**
 * Pure derivations behind the Home hub. Kept out of the component so the "ready now"
 * queue and the onboarding checklist can be unit tested without mounting React or a
 * Supabase client. Everything here is a *preview*: the server functions remain the
 * authority on whether an action is actually allowed.
 */
import { rankUpCost } from '@/game/formulas'
import type {
  CardRank,
  Card,
  ChestInventoryRow,
  DungeonRun,
  PlayerCard,
  PlayerMaterial,
} from '@/types/db'

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
 * Every owned copy whose next rank is already covered by the current gold and materials.
 * Runs the same `rankUpCost` ladder the server re-reads; a shortfall anywhere drops the
 * copy, so the shelf never offers a rank-up that would roll back.
 */
export function rankUpReadyCopies(
  collection: readonly PlayerCard[],
  cards: readonly Card[],
  materials: readonly PlayerMaterial[],
  gold: number,
): RankUpReady[] {
  const tagsById = new Map(cards.map((card) => [card.id, card.tags ?? []]))
  const qtyById = new Map(materials.map((row) => [row.material_id, row.qty]))

  return collection.flatMap((copy) => {
    const tags = tagsById.get(copy.card_id)
    if (!tags) return []
    const cost = rankUpCost(copy.rank, tags)
    if (!cost || gold < cost.gold) return []
    const covered = Object.entries(cost.materials).every(
      ([id, need]) => (qtyById.get(id) ?? 0) >= need,
    )
    if (!covered) return []
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
      to: '/chests',
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
      id: 'rank-up',
      label: 'Rank up a card',
      hint: 'Spend the tutorial gold and Cores on a 1★ copy.',
      cta: 'Rank up',
      done: input.collection.some((copy) => copy.rank > 1),
      to: '/cards',
    },
  ]
}

/** The checklist is presentation only, so its dismissal is a browser concern, not a DB one. */
export const ONBOARDING_DISMISS_KEY = 'tcg2:home:checklist-dismissed'
/** The first-session wizard is dismissed separately, so the checklist can still take over. */
export const ONBOARDING_WIZARD_DISMISS_KEY = 'tcg2:onboarding:wizard-dismissed'
