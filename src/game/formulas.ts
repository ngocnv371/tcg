/**
 * Balance v1 — the numbers from the execution plan (§6), as code.
 *
 * These values are the source of truth for the CLIENT-side preview only
 * (what a player sees before committing). The authoritative copies live in
 * Postgres (`rank_meta`, `dungeons`, `chest_odds`) and are applied inside
 * server functions. Keep the two in sync via `supabase/seed.sql`, and change
 * numbers from telemetry — never from vibes.
 */

export type CardRank = 1 | 2 | 3 | 4 | 5

export type RankMeta = {
  /** ATK for a card of this rank at level 1. */
  atkBase: number
  /** DEF as a fraction of ATK. */
  defRatio: number
  /** Multiplier applied to (ATK + DEF) when scoring a party. */
  rankMult: number
  /** Level ceiling at this rank. */
  levelCap: number
  /** Duplicate of this rank converts into this many shards. */
  dupeShards: number
}

export const RANK_META: Record<CardRank, RankMeta> = {
  1: { atkBase: 20, defRatio: 0.6, rankMult: 1.0, levelCap: 20, dupeShards: 5 },
  2: { atkBase: 35, defRatio: 0.6, rankMult: 1.5, levelCap: 40, dupeShards: 10 },
  3: { atkBase: 55, defRatio: 0.6, rankMult: 2.2, levelCap: 60, dupeShards: 25 },
  4: { atkBase: 85, defRatio: 0.6, rankMult: 3.2, levelCap: 80, dupeShards: 60 },
  5: { atkBase: 130, defRatio: 0.6, rankMult: 4.5, levelCap: 99, dupeShards: 150 },
}

/** ATK grows 8% of base per level. */
export const ATK_GROWTH_PER_LEVEL = 0.08
/** level-up gold cost = round(GOLD_BASE * level ^ GOLD_EXP) */
export const LEVELUP_GOLD_BASE = 25
export const LEVELUP_GOLD_EXP = 1.4

/** Success-chance curve: p = clamp(MIN, MAX, K * (power / required) ^ EXP). */
export const SUCCESS_MIN = 0.1
export const SUCCESS_MAX = 0.95
export const SUCCESS_K = 0.6
export const SUCCESS_EXP = 0.8

/** Reward scaling band for the over/under-powered reward multiplier. */
export const REWARD_MULT_MIN = 1.0
export const REWARD_MULT_MAX = 1.5

/** Extra concurrent runs unlock from player level — the pacing lever. */
export const RUN_SLOT_UNLOCKS: ReadonlyArray<{ playerLevel: number; slots: number }> = [
  { playerLevel: 1, slots: 2 },
  { playerLevel: 10, slots: 3 },
  { playerLevel: 25, slots: 4 },
]

/** ★ distribution per chest tier, as percentages summing to 100. */
export const CHEST_ODDS: Record<string, Partial<Record<CardRank, number>>> = {
  common: { 1: 70, 2: 25, 3: 5 },
  rare: { 1: 35, 2: 45, 3: 18, 4: 2 },
  epic: { 1: 10, 2: 30, 3: 45, 4: 14, 5: 1 },
  legendary: { 2: 10, 3: 40, 4: 40, 5: 10 },
  mythic: { 3: 20, 4: 50, 5: 30 },
}

export function cardAtk(rank: CardRank, level: number): number {
  const meta = RANK_META[rank]
  return Math.round(meta.atkBase * (1 + ATK_GROWTH_PER_LEVEL * (level - 1)))
}

export function cardDef(rank: CardRank, level: number): number {
  return Math.round(cardAtk(rank, level) * RANK_META[rank].defRatio)
}

/** Single-card contribution to party power. */
export function cardPower(rank: CardRank, level: number): number {
  return Math.round((cardAtk(rank, level) + cardDef(rank, level)) * RANK_META[rank].rankMult)
}

export function partyPower(cards: ReadonlyArray<{ rank: CardRank; level: number }>): number {
  return cards.reduce((total, card) => total + cardPower(card.rank, card.level), 0)
}

export function levelUpGold(level: number): number {
  return Math.round(LEVELUP_GOLD_BASE * Math.pow(level, LEVELUP_GOLD_EXP))
}

export function successChance(power: number, requiredPower: number): number {
  if (requiredPower <= 0) return SUCCESS_MAX
  const raw = SUCCESS_K * Math.pow(power / requiredPower, SUCCESS_EXP)
  return Math.min(SUCCESS_MAX, Math.max(SUCCESS_MIN, raw))
}

export function rewardMultiplier(power: number, requiredPower: number): number {
  if (requiredPower <= 0) return REWARD_MULT_MAX
  const raw = power / requiredPower
  return Math.min(REWARD_MULT_MAX, Math.max(REWARD_MULT_MIN, raw))
}

export function goldReward(baseGold: number, power: number, requiredPower: number): number {
  return Math.round(baseGold * rewardMultiplier(power, requiredPower))
}

export function dupeShards(rank: CardRank): number {
  return RANK_META[rank].dupeShards
}

export function runSlotsForLevel(playerLevel: number): number {
  return RUN_SLOT_UNLOCKS.reduce(
    (slots, unlock) => (playerLevel >= unlock.playerLevel ? unlock.slots : slots),
    RUN_SLOT_UNLOCKS[0].slots,
  )
}

/**
 * Weighted pick used by tests and (mirrored in SQL) by chest opening.
 * `rnd` is expected in [0, 1).
 */
export function pickRank(
  odds: Partial<Record<CardRank, number>>,
  rnd: number,
): CardRank {
  const entries = Object.entries(odds) as Array<[string, number]>
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
  let cursor = rnd * total
  for (const [rank, weight] of entries) {
    cursor -= weight
    if (cursor < 0) return Number(rank) as CardRank
  }
  return Number(entries[entries.length - 1][0]) as CardRank
}
