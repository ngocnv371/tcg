/**
 * Balance v1 — the tuned economy numbers, as code.
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

/**
 * Card tags are a card's farming identity: every tag owns a Core family, and a rank-up
 * spends one Core per tag the card carries (a fire + dragon card needs fire *and* dragon
 * Cores). Ids are lowercase; `tagLabel` is the display form.
 *
 * `physical` is the neutral type, not a type every card carries: a card whose title names
 * no known element gets it as its ONLY tag, so it still has a Core to farm.
 */
export const CORE_TAGS = [
  'physical',
  'fire',
  'water',
  'electric',
  'grass',
  'earth',
  'ice',
  'dragon',
  'dark',
] as const

export type CoreTag = (typeof CORE_TAGS)[number]

/** `physical` → `Physical`, for chips and the generated material names. */
export function tagLabel(tag: string): string {
  return tag.charAt(0).toUpperCase() + tag.slice(1)
}

/** One grade per rank-up step, weakest first: 1→2 lesser … 4→5 legendary. */
export const CORE_VARIANTS = ['lesser', 'greater', 'mythic', 'legendary'] as const

export type CoreVariant = (typeof CORE_VARIANTS)[number]

export const CORE_VARIANT_LABELS: Record<CoreVariant, string> = {
  lesser: 'Lesser',
  greater: 'Greater',
  mythic: 'Mythic',
  legendary: 'Legendary',
}

/** `lesser_fire_core` — the same id the seeded `materials` rows use. */
export function tagCoreId(tag: string, variant: CoreVariant): string {
  return `${variant}_${tag.toLowerCase()}_core`
}

/**
 * The card's tags that own a Core family, in catalog order and deduped. A card whose
 * title matched no known element carries `physical`, so the list is never empty.
 */
export function coreTagsForCard(tags: readonly string[]): CoreTag[] {
  const lowered = new Set(tags.map((tag) => tag.toLowerCase()))
  return CORE_TAGS.filter((tag) => lowered.has(tag.toLowerCase()))
}

/** Every Core material id the economy can hand out — 4 grades × every tag. */
export function allCoreIds(): string[] {
  return CORE_TAGS.flatMap((tag) => CORE_VARIANTS.map((variant) => tagCoreId(tag, variant)))
}

/**
 * Which Core grade a dungeon of this rank yields. Dungeons rank 1..5 while there are only
 * four grades, so the top rank shares the legendary band with rank 4.
 */
export function coreVariantForRank(rank: number): CoreVariant {
  const index = Math.min(Math.max(Math.trunc(rank), 1), CORE_VARIANTS.length)
  return CORE_VARIANTS[index - 1]
}

export type RankUpStep = {
  gold: number
  /** Fixed materials for the step; the card's tag Cores are added on top by `rankUpCost`. */
  materials: Record<string, number>
  /** Grade of Core this step consumes. */
  coreVariant: CoreVariant
  /** How many of EACH of the card's tag Cores this step consumes. */
  coreQty: number
}

/**
 * Rank-up ladder, keyed by the card's CURRENT rank. A card's route is decided by its tags,
 * not its faction: two cards of the same faction farm different dungeons whenever their
 * tag sets differ.
 *
 * This is the single source for both the seeded `card_rank_costs` rows
 * (`scripts/build-seed.mjs`) and the ones the card importer writes, so a balance change
 * here reaches existing content on the next import.
 */
export const RANK_UP_LADDER: Record<Exclude<CardRank, 5>, RankUpStep> = {
  1: { gold: 1000, materials: { common_shard: 10 }, coreVariant: 'lesser', coreQty: 3 },
  2: { gold: 5000, materials: { uncommon_shard: 25 }, coreVariant: 'greater', coreQty: 8 },
  3: { gold: 20000, materials: { rare_shard: 50 }, coreVariant: 'mythic', coreQty: 15 },
  4: { gold: 80000, materials: { epic_shard: 100 }, coreVariant: 'legendary', coreQty: 25 },
}

/**
 * What one rank-up costs for a card carrying these tags, or null at 5★ (the top of the
 * ladder). Mirrors the `card_rank_costs` lookup `rank_up_card` does server-side.
 */
export function rankUpCost(
  fromRank: CardRank,
  tags: readonly string[],
): { gold: number; materials: Record<string, number> } | null {
  const step = RANK_UP_LADDER[fromRank as Exclude<CardRank, 5>]
  if (!step) return null

  const materials: Record<string, number> = { ...step.materials }
  for (const tag of coreTagsForCard(tags)) {
    materials[tagCoreId(tag, step.coreVariant)] = step.coreQty
  }
  return { gold: step.gold, materials }
}

/**
 * Reward scaling band for the over/under-powered yield multiplier. A run never fails any
 * more — power only decides how much the same dungeon pays out.
 */
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

/**
 * Yield multiplier: how much of a dungeon's listed payout a party actually brings home.
 * Sending a stronger team is the only lever — there is no win/lose roll to preview.
 */
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
