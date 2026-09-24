/**
 * Hand-written row types mirroring supabase/migrations/*_init.sql.
 * Regenerate the machine version with `npm run db:types` once the local
 * Supabase stack is up and prefer it for query typing.
 */

export type CardRank = 1 | 2 | 3 | 4 | 5
export type Faction = 'ember' | 'tide' | 'verdant' | 'umbral' | 'radiant'
export type CardRole = 'tank' | 'dps' | 'support'
export type DungeonKind = 'resource' | 'card' | 'boss'
export type MaterialKind = 'shard' | 'ore' | 'crystal' | 'essence' | 'core'

export type Material = {
  id: string
  name: string
  kind: MaterialKind
  rarity: CardRank | null
  tier: number
  /** Public Storage URL of the icon once materials-4-import has run; null until then. */
  icon: string | null
}

export type Card = {
  id: string
  name: string
  rank: CardRank
  faction: Faction
  role: CardRole
  base_atk: number
  base_def: number
  passive_name: string
  passive_text: string
  lore: string
  tags: string[]
  art_path: string | null
}

export type RankMetaRow = {
  rank: CardRank
  atk_base: number
  def_ratio: number
  rank_mult: number
  level_cap: number
  atk_growth: number
  levelup_gold_base: number
  levelup_gold_exp: number
  dupe_shard_material: string
  dupe_shard_qty: number
}

export type RankCost = {
  card_id: string
  from_rank: CardRank
  to_rank: CardRank
  gold: number
  materials: Record<string, number>
}

export type Dungeon = {
  id: string
  name: string
  kind: DungeonKind
  /** Difficulty band, also the tier of the chest a clear hands out. */
  tier: number
  /** Which Core grade this dungeon yields (1..4 = lesser..legendary, 5 = legendary). */
  rank: number
  /** The Core families this dungeon farms. Drives `materials` at import time. */
  tags: string[]
  req_power: number
  duration_seconds: number
  gold_base: number
  /**
   * The drop table. Generated from `tags` + `rank` at import time and paid IN FULL on
   * every clear, so `weight` is legacy share data the resolver no longer reads.
   */
  materials: Array<{ material_id: string; weight: number; min: number; max: number }>
  card_id: string | null
  unlocks_at_level: number
  /** Chest handed out by a clear; null when the dungeon only pays resources. */
  chest_on_clear: string | null
  art_path: string | null
}

export type Chest = {
  id: string
  name: string
  tier: CardRank
  source: string
}

export type ChestOdd = {
  chest_id: string
  rank: CardRank
  weight: number
}

export type Profile = {
  id: string
  username: string | null
  player_level: number
  gold: number
  gems: number
  run_slots: number
  daily_chest_claimed_at: string | null
  created_at: string
  last_seen_at: string
}

export type PlayerCard = {
  id: string
  profile_id: string
  card_id: string
  level: number
  rank: CardRank
  locked: boolean
  obtained_at: string
}

export type PlayerMaterial = {
  profile_id: string
  material_id: string
  qty: number
}

export type Party = {
  id: string
  profile_id: string
  name: string
  slot_index: number
}

export type PartySlot = {
  party_id: string
  slot: number
  player_card_id: string
}

export type DungeonRun = {
  id: string
  profile_id: string
  dungeon_id: string
  party_id: string
  power_snapshot: number
  started_at: string
  ends_at: string
  resolved_at: string | null
  success: boolean | null
  rewards: RunRewards | null
  claimed_at: string | null
}

export type RunRewards = {
  gold: number
  materials: Array<{ material_id: string; qty: number }>
  chest_id?: string
  /** The party's yield multiplier at resolve time; absent on pre-multiplier rows. */
  multiplier?: number
}

export type ChestInventoryRow = {
  id: string
  profile_id: string
  chest_id: string
  source: string
  granted_at: string
  opened_at: string | null
}

export type PullHistoryRow = {
  id: number
  profile_id: string
  chest_id: string
  card_id: string
  rank: CardRank
  was_new: boolean
  pulled_at: string
}

/** Append-only. `client` rows come from track_event, `server` rows from DB triggers. */
export type TelemetryEvent = {
  id: number
  profile_id: string | null
  name: string
  source: 'client' | 'server'
  props: Record<string, unknown>
  created_at: string
}

/** One browser/device endpoint for run-finished push. */
export type NotificationToken = {
  id: string
  profile_id: string
  endpoint: string
  p256dh: string
  auth: string
  user_agent: string | null
  created_at: string
  last_seen_at: string
  disabled_at: string | null
}
