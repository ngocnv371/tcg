-- TCG 2 — schema v1 (squashed baseline).
--
-- This is the only starting point for the database. The 18 migrations that grew the
-- vertical slice were rolled into this set of topical files; apply order is the file
-- order, and each file is self-contained:
--
--   20260915000000_init.sql           tables, indexes, access rules, derived numbers
--   20260915000001_progression.sql    provisioning + every progression mutation RPC
--   20260915000002_telemetry.sql      append-only event log, server + client writers
--   20260915000003_notifications.sql  push endpoints, outbox, service-role sender API
--   20260915000004_storage.sql        public art buckets
--   20260915000005_jobs.sql           realtime publication + run-resolution schedule
--
-- The block is dated before the first real migration on purpose: it replaces all of
-- them, so any database that still lists the old versions must be reset, not migrated.
--
-- Design rules this file enforces:
--   1. Catalog tables (cards, dungeons, chests, odds, rank_meta) are seeded data.
--      Balance is edited by re-seeding, never by shipping app code.
--   2. Player progression tables are READ-ONLY to the client. RLS grants SELECT
--      on your own rows and nothing else — no INSERT/UPDATE/DELETE policies exist,
--      so every currency/card/run change must arrive through a SECURITY DEFINER
--      function (see 20260915000001_progression.sql).
--   3. Timers and rolls are server-side. A run's expiry is derived from
--      started_at + duration, so offline progress needs no tick loop.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

create table public.rank_meta (
  rank smallint primary key check (rank between 1 and 5),
  atk_base integer not null check (atk_base > 0),
  def_ratio numeric(4, 3) not null default 0.600,
  rank_mult numeric(4, 2) not null check (rank_mult > 0),
  -- `level` is dormant: nothing raises `player_cards.level`, but card_atk/card_def stay
  -- level-aware so the formula keeps one shape. See "card level-up is cancelled" in AGENTS.md.
  level_cap smallint not null check (level_cap > 0),
  atk_growth numeric(5, 4) not null default 0.0800,
  levelup_gold_base numeric(8, 2) not null default 25,
  levelup_gold_exp numeric(4, 2) not null default 1.40,
  dupe_shard_material text not null,
  dupe_shard_qty integer not null check (dupe_shard_qty > 0)
);

create table public.materials (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('shard', 'ore', 'crystal', 'essence', 'core')),
  rarity smallint check (rarity between 1 and 5),
  tier smallint not null default 1 check (tier between 1 and 5),
  icon text
);

create table public.cards (
  id text primary key,
  name text not null,
  rank smallint not null references public.rank_meta (rank),
  faction text not null check (faction in ('ember', 'tide', 'verdant', 'umbral', 'radiant')),
  role text not null check (role in ('tank', 'dps', 'support')),
  base_atk integer not null check (base_atk > 0),
  base_def integer not null check (base_def >= 0),
  passive_name text not null,
  passive_text text not null,
  lore text not null,
  -- Card tags own the Core families a rank-up spends, so a card's farm route follows its
  -- tags (CORE_TAGS in src/game/formulas.ts). `physical` is the fallback, not a default.
  tags text[] not null default '{}',
  art_path text,
  sort_order integer not null default 0
);

-- The rank-up ladder per card. Per-card farming identity: costs vary by the Cores the
-- card's tags ask for, so different cards send the player to different dungeons.
create table public.card_rank_costs (
  card_id text not null references public.cards (id) on delete cascade,
  from_rank smallint not null check (from_rank between 1 and 4),
  to_rank smallint not null check (to_rank between 2 and 5),
  gold integer not null default 0 check (gold >= 0),
  materials jsonb not null default '{}'::jsonb,
  primary key (card_id, to_rank),
  check (to_rank = from_rank + 1)
);

create table public.dungeons (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('resource', 'card', 'boss')),
  tier smallint not null check (tier between 1 and 5),
  -- rank picks the Core grade a run pays (coreVariantForRank maps 4 and 5 both to
  -- legendary); tags names the Core families. A dungeon is a known farm spot.
  rank smallint not null default 1 check (rank between 1 and 5),
  tags text[] not null default '{}',
  req_power integer not null check (req_power > 0),
  duration_seconds integer not null check (duration_seconds > 0),
  gold_base integer not null check (gold_base >= 0),
  -- [{ "material_id": "lesser_fire_core", "weight": 50, "min": 2, "max": 4 }, ...]
  -- Derived from rank + tags by scripts/dungeons-1-import.mjs; every entry pays.
  materials jsonb not null default '[]'::jsonb,
  card_id text references public.cards (id) on delete set null,
  unlocks_at_level smallint not null default 1,
  chest_on_clear text,
  art_path text
);

comment on column public.dungeons.rank is
  'Core grade this dungeon yields; mirrors coreVariantForRank() in src/game/formulas.ts.';
comment on column public.dungeons.tags is
  'Core families this dungeon farms. Regenerate `materials` from these with npm run dungeons:1:import.';

create table public.chests (
  id text primary key,
  name text not null,
  tier smallint not null check (tier between 1 and 5),
  source text not null
);

create table public.chest_odds (
  chest_id text not null references public.chests (id) on delete cascade,
  rank smallint not null references public.rank_meta (rank),
  weight numeric(5, 2) not null check (weight >= 0),
  primary key (chest_id, rank)
);

-- Kept even though nothing grants player XP yet (player progression is out of scope for
-- v1): run_slots stays at its profiles default and this table simply never matches.
create table public.run_slot_unlocks (
  player_level smallint primary key check (player_level >= 1),
  slots smallint not null check (slots between 1 and 6)
);

-- ---------------------------------------------------------------------------
-- Player state
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique,
  player_level smallint not null default 1 check (player_level >= 1),
  xp integer not null default 0 check (xp >= 0),
  gold bigint not null default 0 check (gold >= 0),
  gems integer not null default 0 check (gems >= 0),
  run_slots smallint not null default 2 check (run_slots between 1 and 6),
  daily_chest_claimed_at timestamptz,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- One row per physical copy, so a player can hold a 1★ and a 3★ of the same card: rank
-- and level live on the row, and every pull inserts a new one.
create table public.player_cards (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  card_id text not null references public.cards (id),
  level smallint not null default 1 check (level >= 1),
  rank smallint not null references public.rank_meta (rank),
  locked boolean not null default false,
  obtained_at timestamptz not null default now()
);

create table public.player_materials (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  material_id text not null references public.materials (id),
  qty integer not null default 0 check (qty >= 0),
  primary key (profile_id, material_id)
);

-- Teams are unlimited: `slot_index` is append order (and the stable display order) only,
-- so there is deliberately no unique (profile_id, slot_index) and no upper bound.
create table public.parties (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  slot_index smallint not null check (slot_index >= 1),
  created_at timestamptz not null default now()
);

-- `unique (player_card_id)` alone, not (party_id, player_card_id): a copy is one physical
-- card, so it can sit in at most one party — otherwise the same lineup could be fielded
-- everywhere at once and multiply the power a player brings.
create table public.party_slots (
  party_id uuid not null references public.parties (id) on delete cascade,
  slot smallint not null check (slot between 1 and 5),
  player_card_id uuid not null references public.player_cards (id) on delete cascade,
  primary key (party_id, slot),
  unique (player_card_id)
);

create table public.dungeon_runs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  dungeon_id text not null references public.dungeons (id),
  party_id uuid references public.parties (id) on delete set null,
  power_snapshot integer not null,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  resolved_at timestamptz,
  -- A run never fails, so `success` is always true; it is kept because the claim payload
  -- and the telemetry triggers read it.
  success boolean,
  rewards jsonb,
  claimed_at timestamptz,
  check (ends_at > started_at)
);

create table public.chest_inventory (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  chest_id text not null references public.chests (id),
  source text not null,
  granted_at timestamptz not null default now(),
  opened_at timestamptz
);

create table public.pull_history (
  id bigserial primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  chest_id text not null references public.chests (id),
  card_id text not null references public.cards (id),
  rank smallint not null,
  -- "first copy of this card", not "new player_cards row": every pull inserts a row.
  was_new boolean not null,
  pulled_at timestamptz not null default now()
);

create index player_cards_profile_idx on public.player_cards (profile_id);
create index player_cards_card_idx on public.player_cards (card_id);
create index dungeon_runs_open_idx on public.dungeon_runs (profile_id, ends_at)
  where resolved_at is null;
create index dungeon_runs_profile_idx on public.dungeon_runs (profile_id, started_at desc);
create index chest_inventory_unopened_idx on public.chest_inventory (profile_id)
  where opened_at is null;
create index pull_history_profile_idx on public.pull_history (profile_id, pulled_at desc);

-- ---------------------------------------------------------------------------
-- Derived numbers (mirror src/game/formulas.ts — keep them in sync)
-- ---------------------------------------------------------------------------

create or replace function public.card_atk(p_rank smallint, p_level integer)
returns integer
language sql
immutable
as $$
  select round(m.atk_base * (1 + m.atk_growth * (greatest(p_level, 1) - 1)))::integer
  from public.rank_meta m
  where m.rank = p_rank;
$$;

create or replace function public.card_def(p_rank smallint, p_level integer)
returns integer
language sql
immutable
as $$
  select round(public.card_atk(p_rank, p_level) * m.def_ratio)::integer
  from public.rank_meta m
  where m.rank = p_rank;
$$;

create or replace function public.card_power(p_rank smallint, p_level integer)
returns integer
language sql
stable
as $$
  select round((public.card_atk(p_rank, p_level) + public.card_def(p_rank, p_level)) * m.rank_mult)::integer
  from public.rank_meta m
  where m.rank = p_rank;
$$;

-- Security invoker on purpose: RLS on party_slots/player_cards means a caller can
-- only ever score their own party.
create or replace function public.party_power(p_party_id uuid)
returns integer
language sql
stable
as $$
  select coalesce(sum(public.card_power(pc.rank, pc.level)), 0)::integer
  from public.party_slots ps
  join public.player_cards pc on pc.id = ps.player_card_id
  where ps.party_id = p_party_id;
$$;

create or replace function public.slots_for_level(p_level smallint)
returns smallint
language sql
stable
as $$
  select coalesce(max(u.slots), 2)::smallint
  from public.run_slot_unlocks u
  where u.player_level <= p_level;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.rank_meta enable row level security;
alter table public.materials enable row level security;
alter table public.cards enable row level security;
alter table public.card_rank_costs enable row level security;
alter table public.dungeons enable row level security;
alter table public.chests enable row level security;
alter table public.chest_odds enable row level security;
alter table public.run_slot_unlocks enable row level security;
alter table public.profiles enable row level security;
alter table public.player_cards enable row level security;
alter table public.player_materials enable row level security;
alter table public.parties enable row level security;
alter table public.party_slots enable row level security;
alter table public.dungeon_runs enable row level security;
alter table public.chest_inventory enable row level security;
alter table public.pull_history enable row level security;

-- Catalog: readable by anyone (including signed-out clients rendering the shell).
create policy catalog_rank_meta_read on public.rank_meta for select to anon, authenticated using (true);
create policy catalog_materials_read on public.materials for select to anon, authenticated using (true);
create policy catalog_cards_read on public.cards for select to anon, authenticated using (true);
create policy catalog_card_rank_costs_read on public.card_rank_costs for select to anon, authenticated using (true);
create policy catalog_dungeons_read on public.dungeons for select to anon, authenticated using (true);
create policy catalog_chests_read on public.chests for select to anon, authenticated using (true);
create policy catalog_chest_odds_read on public.chest_odds for select to anon, authenticated using (true);
create policy catalog_run_slot_unlocks_read on public.run_slot_unlocks for select to anon, authenticated using (true);

-- Player state: SELECT your own rows only. No write policies by design.
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());

create policy player_cards_select_own on public.player_cards
  for select to authenticated using (profile_id = auth.uid());

create policy player_materials_select_own on public.player_materials
  for select to authenticated using (profile_id = auth.uid());

create policy parties_select_own on public.parties
  for select to authenticated using (profile_id = auth.uid());

create policy party_slots_select_own on public.party_slots
  for select to authenticated using (
    exists (
      select 1 from public.parties p
      where p.id = party_slots.party_id and p.profile_id = auth.uid()
    )
  );

create policy dungeon_runs_select_own on public.dungeon_runs
  for select to authenticated using (profile_id = auth.uid());

create policy chest_inventory_select_own on public.chest_inventory
  for select to authenticated using (profile_id = auth.uid());

create policy pull_history_select_own on public.pull_history
  for select to authenticated using (profile_id = auth.uid());

grant usage on schema public to anon, authenticated;

grant select on public.rank_meta, public.materials, public.cards, public.card_rank_costs,
  public.dungeons, public.chests, public.chest_odds, public.run_slot_unlocks
  to anon, authenticated;

grant select on public.profiles, public.player_cards, public.player_materials, public.parties,
  public.party_slots, public.dungeon_runs, public.chest_inventory, public.pull_history
  to authenticated;

grant execute on function public.card_atk(smallint, integer) to anon, authenticated;
grant execute on function public.card_def(smallint, integer) to anon, authenticated;
grant execute on function public.card_power(smallint, integer) to anon, authenticated;
grant execute on function public.party_power(uuid) to authenticated;
grant execute on function public.slots_for_level(smallint) to anon, authenticated;
