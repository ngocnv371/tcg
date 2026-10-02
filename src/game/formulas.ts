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

/**
 * A rank is a flat multiplier across EVERY stat a card has. The catalog stores a card's
 * rank-1 base numbers (base_atk / base_def / speed), and a copy's effective stat is
 * `base * statMult(rank) * level growth`. Rank-up no longer rewrites the template; it
 * multiplies the copy.
 *
 * The multiplier ladder mirrors the old per-rank ATK bases (20 / 35 / 55 / 85 / 130 for a
 * 20-base card) so a rank-1 party scores what it always did. It also doubles as the fodder
 * value curve: a rank-r copy is worth 2^(r-1) rank-1 copies, so 1→2 costs 2 copies, 2→3
 * costs 4, 3→4 costs 8 and 4→5 costs 16 — the exponential farming pressure.
 */
export type RankMeta = {
  /** Multiplier applied to every base stat of a copy at this rank. */
  statMult: number
  /** Level ceiling for each of a copy's four stat levels at this rank. */
  levelCap: number
  /** Duplicate of this rank converts into this many shards (the stat-level currency). */
  dupeShards: number
}

export const RANK_META: Record<CardRank, RankMeta> = {
  1: { statMult: 1.0, levelCap: 20, dupeShards: 5 },
  2: { statMult: 1.75, levelCap: 40, dupeShards: 10 },
  3: { statMult: 2.75, levelCap: 60, dupeShards: 25 },
  4: { statMult: 4.25, levelCap: 80, dupeShards: 60 },
  5: { statMult: 6.5, levelCap: 100, dupeShards: 150 },
}

/**
 * The neutral rank-1 stat line every catalog card is authored against. Rank multiplies it;
 * the card importer stamps these onto each `cards` row so the base is stored, not implied.
 */
export const CARD_BASE_ATK = 20
export const CARD_BASE_DEF = 12

/** Every stat grows 8% of its base per level. */
export const ATK_GROWTH_PER_LEVEL = 0.08
/** stat-level gold cost = round(GOLD_BASE * level ^ GOLD_EXP) — fixed and predictable. */
export const LEVELUP_GOLD_BASE = 25
export const LEVELUP_GOLD_EXP = 1.4

/**
 * The four independently-levelled stats on a copy. `spd` reuses the catalog `cards.speed`
 * base; `hp` derives from `base_atk` at `CARD_HP_PER_ATK` (defined further down).
 */
export const CARD_STATS = ['atk', 'hp', 'def', 'spd'] as const
export type CardStat = (typeof CARD_STATS)[number]

export function statMultiplier(rank: CardRank): number {
  return RANK_META[rank].statMult
}

export function statLevelCap(rank: CardRank): number {
  return RANK_META[rank].levelCap
}

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

/** The four numbers a battle needs from an enemy, before and after threat scaling. */
export type EnemyStats = {
  hp: number
  atk: number
  def: number
  spd: number
}

/** The threat a line falls back to: a bestiary row as written. */
export const DEFAULT_THREAT = 1

/**
 * One encounter's copy of a bestiary monster: the base stats multiplied by the encounter's
 * threat rating.
 *
 * The bestiary owns a monster's numbers and never changes them, so a monster re-used by a
 * later quest needs no second stat line — the encounter tunes `threat` instead. That also
 * keeps a quest's difficulty off the card catalog: `data/enemies.csv` is not `data/assets.csv`.
 *
 * SPD is deliberately left alone. It is a turn *rate* against `SPEED_FULL`, so scaling it would
 * make a threat-3 enemy act nine times as often per player turn instead of hitting three times
 * as hard. Everything else scales linearly, which keeps `attackDamage`'s ATK-minus-DEF spread
 * proportional to the fight's size.
 */
export function scaleEnemyStats(base: EnemyStats, threat: number = DEFAULT_THREAT): EnemyStats {
  // Always rebuild exactly these four keys, and always as whole numbers: the caller may hand us a
  // bestiary row (which carries `id`/`name`/`tags` too, and spreading those into a combatant would
  // clobber its derived ones), and a rebased bestiary line is itself a fraction until it is scaled.
  return {
    hp: Math.max(1, Math.round(base.hp * threat)),
    atk: Math.max(1, Math.round(base.atk * threat)),
    def: Math.max(0, Math.round(base.def * threat)),
    spd: base.spd,
  }
}

// ---------------------------------------------------------------------------
// Rank-up: duplicates are the currency
// ---------------------------------------------------------------------------

/** A rank-r copy is worth 2^(r-1) rank-1 copies as fodder. */
export function rankUpValue(rank: CardRank): number {
  return 2 ** (rank - 1)
}

/** Base-copy value a copy must consume to go from `fromRank` to `fromRank + 1`; 0 at 5★. */
export function rankUpRequirement(fromRank: CardRank): number {
  if (fromRank >= 5) return 0
  // 1→2 costs 2, 2→3 costs 4, 3→4 costs 8, 4→5 costs 16: exactly two copies of the
  // current rank, or any mix whose rank values sum to the requirement.
  return 2 ** fromRank
}

/** The bits of a copy the fodder picker needs. */
export type FodderCandidate = {
  id: string
  card_id: string
  rank: CardRank
  /** Locked copies are protected from every bulk action, rank-up included. */
  locked?: boolean
  /** An equipped copy is one physical card in a lineup; it cannot be consumed. */
  inParty?: boolean
}

/**
 * Picks the cheapest set of duplicate copies that covers a rank-up, mirroring the
 * server-side auto-selection in `rank_up_card`. Lowest ranks first so a higher-rank copy
 * is never spent when smaller ones would do; returns null when the collection is short.
 */
export function selectRankUpFodder(
  target: { id: string; card_id: string; rank: CardRank },
  copies: readonly FodderCandidate[],
): string[] | null {
  const required = rankUpRequirement(target.rank)
  if (required === 0) return null

  const candidates = copies
    .filter(
      (copy) =>
        copy.card_id === target.card_id &&
        copy.id !== target.id &&
        !copy.locked &&
        !copy.inParty,
    )
    .sort((a, b) => a.rank - b.rank)

  // A single copy that already covers the step (the next rank, or above) is used alone —
  // the smallest such, so a bigger card is never spent when a smaller one covers it.
  const single = candidates.find((copy) => rankUpValue(copy.rank) >= required)
  if (single) return [single.id]

  const ids: string[] = []
  let value = 0
  for (const candidate of candidates) {
    ids.push(candidate.id)
    value += rankUpValue(candidate.rank)
    if (value >= required) return ids
  }
  return null
}

// ---------------------------------------------------------------------------
// Stat levelling: the gold + Core sink
// ---------------------------------------------------------------------------

export function statLevelGold(targetLevel: number): number {
  return levelUpGold(targetLevel)
}

/**
 * What one stat level costs on a card carrying these tags: a fixed gold price for the target
 * level plus ONE Core per tag, at the grade of the copy's current rank. Deterministic, so the
 * detail screen can always show the exact price before the player commits.
 */
export function statLevelCost(
  rank: CardRank,
  tags: readonly string[],
  targetLevel: number,
): { gold: number; materials: Record<string, number> } {
  const variant = coreVariantForRank(rank)
  const materials: Record<string, number> = {}
  for (const tag of coreTagsForCard(tags)) {
    materials[tagCoreId(tag, variant)] = 1
  }
  return { gold: statLevelGold(targetLevel), materials }
}

/**
 * The one-time tutorial run that bootstraps a new account (see
 * `supabase/migrations/20260915000001_progression.sql`). Its payout funds the guided
 * *stat* level-up: enough gold for one level plus one Lesser Core of every family, because a
 * card can carry more than one tag. `scripts/build-seed.mjs` bakes this into the seeded
 * `dungeons` row and the resolver pins its yield multiplier to 1, so the guided step is
 * always affordable.
 */
export const TUTORIAL_DUNGEON_ID = 'training_grounds'
export const TUTORIAL_DUNGEON_NAME = 'Training Grounds'
export const TUTORIAL_DURATION_SECONDS = 10

export function tutorialReward(): { gold: number; materials: Record<string, number> } {
  const materials: Record<string, number> = {}
  for (const tag of CORE_TAGS) {
    materials[tagCoreId(tag, 'lesser')] = 1
  }
  return { gold: statLevelGold(2), materials }
}

/**
 * Reward scaling band for the over/under-powered yield multiplier. A run never fails any
 * more — power only decides how much the same dungeon pays out.
 */
export const REWARD_MULT_MIN = 1.0
export const REWARD_MULT_MAX = 1.5

/**
 * Premium currency spent to finish a run early ("rush"). Priced per *started* minute left,
 * so a nearly-done run is cheap; v1 has no earn path, gems come from the `grant_test_gems`
 * helper. The client uses this only for the button preview — `rush_run` recomputes the
 * price from the stored `ends_at`, and the mirror lives in
 * `20260915000001_progression.sql`.
 */
export const RUSH_GEMS_PER_MINUTE = 2
export const RUSH_GEMS_MIN = 1

/** Gems to skip the rest of a run. Mirrors the maths inside SQL `rush_run`. */
export function rushCost(remainingSeconds: number): number {
  const minutes = Math.ceil(Math.max(0, remainingSeconds) / 60)
  return Math.max(RUSH_GEMS_MIN, minutes * RUSH_GEMS_PER_MINUTE)
}

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

/**
 * What the marketplace charges for one chest, in gems. Seeded into `chests.gem_price` by
 * `scripts/build-seed.mjs`; `buy_chest` re-reads that column, never a client-sent price,
 * so this is only the button preview. Keep the two in sync.
 */
export const CHEST_GEM_PRICES: Record<string, number> = {
  common: 20,
  rare: 60,
  epic: 150,
  legendary: 400,
  mythic: 900,
}

/** Gem price of a chest, or null when it is not sold. Mirrors `chests.gem_price`. */
export function chestGemPrice(chestId: string): number | null {
  return CHEST_GEM_PRICES[chestId] ?? null
}

/** A rank's multiplier times the per-level growth for one stat. */
function statAt(base: number, rank: CardRank, level: number): number {
  const growth = 1 + ATK_GROWTH_PER_LEVEL * (Math.max(level, 1) - 1)
  return Math.round(base * statMultiplier(rank) * growth)
}

export function cardAtk(baseAtk: number, rank: CardRank, atkLevel: number): number {
  return statAt(baseAtk, rank, atkLevel)
}

export function cardDef(baseDef: number, rank: CardRank, defLevel: number): number {
  return statAt(baseDef, rank, defLevel)
}

export function cardHp(baseAtk: number, rank: CardRank, hpLevel: number): number {
  return statAt(baseAtk * CARD_HP_PER_ATK, rank, hpLevel)
}

export function cardSpd(baseSpd: number, rank: CardRank, spdLevel: number): number {
  return statAt(baseSpd, rank, spdLevel)
}

/** The stats a copy actually brings to a battle or a party score. */
export type CardStats = {
  atk: number
  def: number
  hp: number
  spd: number
  power: number
}

/** The catalog template a copy is built from. */
export type CardBase = { base_atk: number; base_def: number; speed: number }

/** The four per-stat levels a copy carries, plus its rank. */
export type CardLevels = {
  rank: CardRank
  atk_level: number
  hp_level: number
  def_level: number
  spd_level: number
}

/** Resolves a copy's effective stats: catalog base × rank × each stat's own level. */
export function resolveCardStats(card: CardBase, copy: CardLevels): CardStats {
  const atk = cardAtk(card.base_atk, copy.rank, copy.atk_level)
  const def = cardDef(card.base_def, copy.rank, copy.def_level)
  return {
    atk,
    def,
    hp: cardHp(card.base_atk, copy.rank, copy.hp_level),
    spd: cardSpd(card.speed, copy.rank, copy.spd_level),
    // Power is the dungeon-yield score: the rank is already inside atk/def.
    power: atk + def,
  }
}

/** One card's contribution to party power. */
export function cardPower(card: CardBase, copy: CardLevels): number {
  return cardAtk(card.base_atk, copy.rank, copy.atk_level) + cardDef(card.base_def, copy.rank, copy.def_level)
}

export function partyPower(
  members: ReadonlyArray<{ card: CardBase; copy: CardLevels }>,
): number {
  return members.reduce((total, member) => total + cardPower(member.card, member.copy), 0)
}

export function levelUpGold(level: number): number {
  return Math.round(LEVELUP_GOLD_BASE * Math.pow(level, LEVELUP_GOLD_EXP))
}

/**
 * A quest clear has a fixed chance to drop one of the enemies as a rank-1 card — the
 * deterministic farm route for a specific card. Rolled server-side in `complete_quest`;
 * `quests.card_drop_chance` carries the per-quest value this constant seeds.
 */
export const QUEST_CARD_DROP_CHANCE = 0.5

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

/**
 * Elemental affinity band: how much matching a dungeon's Core tags is worth. A party whose
 * every card shares a dungeon tag brings `AFFINITY_MULT_MAX`; one where none do gets
 * `AFFINITY_MULT_MIN`; mixed parties sit in between. Mirrored in `start_run`
 * (20260915000001_progression.sql) — change one, change both.
 */
export const AFFINITY_MULT_MIN = 0.85
export const AFFINITY_MULT_MAX = 1.15

/**
 * How many party cards carry at least one of a dungeon's tags. Case-insensitive; a card
 * counts once however many tags it shares.
 */
export function affinityMatchCount(
  partyTags: ReadonlyArray<readonly string[]>,
  dungeonTags: readonly string[],
): number {
  const dungeon = new Set(dungeonTags.map((tag) => tag.toLowerCase()))
  return partyTags.filter((tags) => tags.some((tag) => dungeon.has(tag.toLowerCase()))).length
}

/**
 * Yield multiplier from elemental affinity. `partyTags` is one tag list per party card (the
 * card's own `tags`); a card counts when it shares at least one tag with `dungeonTags`. A
 * dungeon with no tags, or an empty party, is neutral (1.0) — `start_run` short-circuits an
 * untagged dungeon the same way, so the two agree on the tutorial.
 */
export function affinityMultiplier(
  partyTags: ReadonlyArray<readonly string[]>,
  dungeonTags: readonly string[],
): number {
  if (partyTags.length === 0 || dungeonTags.length === 0) return 1
  const matches = affinityMatchCount(partyTags, dungeonTags)
  return AFFINITY_MULT_MIN + (AFFINITY_MULT_MAX - AFFINITY_MULT_MIN) * (matches / partyTags.length)
}

/**
 * The full run yield: power scaling times affinity. Mirrors the `mult` that
 * `resolve_due_runs` records on the run (and that the client previews before sending).
 */
export function runMultiplier(
  power: number,
  requiredPower: number,
  partyTags: ReadonlyArray<readonly string[]>,
  dungeonTags: readonly string[],
): number {
  return rewardMultiplier(power, requiredPower) * affinityMultiplier(partyTags, dungeonTags)
}

/** Widest possible run yield, used by the Resources panel's min–max preview. */
export const RUN_MULT_MIN = REWARD_MULT_MIN * AFFINITY_MULT_MIN
export const RUN_MULT_MAX = REWARD_MULT_MAX * AFFINITY_MULT_MAX

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

// ---------------------------------------------------------------------------
// Quest combat
// ---------------------------------------------------------------------------

/**
 * Quest battles need one stat the idle dungeon runs never did: SPD, which decides how often
 * a combatant acts. It is a per-card value (baseline 10 — a card with 20 acts twice as often
 * as a card with 10), stored on the card row so the server never derives it twice.
 * `rollCardSpeed` is what `scripts/assets-import.mjs` stamps onto `cards.speed`.
 */
export const CARD_SPEED_BASE = 10
export const CARD_SPEED_MIN = 7
export const CARD_SPEED_MAX = 16

/** Deterministic per-card SPD from its id, so a re-import never churns a battle's turn order. */
export function rollCardSpeed(id: string): number {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 997
  return CARD_SPEED_MIN + (hash % (CARD_SPEED_MAX - CARD_SPEED_MIN + 1))
}

/** HP a card brings to a quest battle, derived from ATK so rank and the HP level still matter. */
export const CARD_HP_PER_ATK = 4
