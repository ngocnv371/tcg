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
  done: boolean
  to: string
}

/**
 * The first-session arc, derived entirely from state the client already reads — no extra
 * table, no client-written progression flag. Steps clear themselves as the player acts.
 */
export function buildOnboardingSteps(input: {
  chests: readonly ChestInventoryRow[]
  runs: readonly DungeonRun[]
  collection: readonly PlayerCard[]
}): OnboardingStep[] {
  return [
    {
      id: 'open-chest',
      label: 'Open a chest',
      hint: 'Claim the daily chest if the vault is empty.',
      done: input.chests.some((chest) => chest.opened_at),
      to: '/chests',
    },
    {
      id: 'first-run',
      label: 'Send a party on a run',
      hint: 'Pick a dungeon and a lineup.',
      done: input.runs.length > 0,
      to: '/dungeons',
    },
    {
      id: 'claim-run',
      label: 'Claim a run',
      hint: 'Rewards return when the timer ends.',
      done: input.runs.some((run) => run.claimed_at),
      to: '/dungeons',
    },
    {
      id: 'rank-up',
      label: 'Rank up a card',
      hint: 'Spend gold and Cores to push a copy higher.',
      done: input.collection.some((copy) => copy.rank > 1),
      to: '/cards',
    },
  ]
}

/** The checklist is presentation only, so its dismissal is a browser concern, not a DB one. */
export const ONBOARDING_DISMISS_KEY = 'tcg2:home:checklist-dismissed'
