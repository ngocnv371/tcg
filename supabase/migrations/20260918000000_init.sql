-- TCG 2 — schema v1
-- Source of truth: the execution plan (§3 data model, §6 balance numbers).
--
-- Design rules this file enforces:
--   1. Catalog tables (cards, dungeons, chests, odds, rank_meta) are seeded data.
--      Balance is edited by re-seeding, never by shipping app code.
--   2. Player progression tables are READ-ONLY to the client. RLS grants SELECT
--      on your own rows and nothing else — no INSERT/UPDATE/DELETE policies exist,
--      so every currency/card/run change must arrive through a SECURITY DEFINER
--      function (open_chest, start_run, resolve_runs, claim_run, level_up_card,
--      rank_up_card — landing in weeks 4-8).
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
  art_path text,
  sort_order integer not null default 0
);

-- Per-card farming identity: costs vary by faction material, so different cards
-- send the player to different dungeons.
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
  req_power integer not null check (req_power > 0),
  duration_seconds integer not null check (duration_seconds > 0),
  gold_base integer not null check (gold_base >= 0),
  -- [{ "material_id": "iron_ore", "weight": 70, "min": 2, "max": 5 }, ...]
  materials jsonb not null default '[]'::jsonb,
  card_id text references public.cards (id) on delete set null,
  unlocks_at_level smallint not null default 1,
  chest_on_clear text
);

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

create table public.parties (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  slot_index smallint not null check (slot_index between 1 and 3),
  created_at timestamptz not null default now(),
  unique (profile_id, slot_index)
);

create table public.party_slots (
  party_id uuid not null references public.parties (id) on delete cascade,
  slot smallint not null check (slot between 1 and 5),
  player_card_id uuid not null references public.player_cards (id) on delete cascade,
  primary key (party_id, slot),
  unique (party_id, player_card_id)
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
  was_new boolean not null,
  pity_counter integer not null default 0,
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
-- Provisioning: every signup gets a profile row with 2 run slots and a starter party
-- ---------------------------------------------------------------------------

create or replace function public.provision_starter_loadout(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  starter_party_id uuid;
begin
  if not exists (select 1 from public.player_cards where profile_id = p_profile_id) then
    insert into public.player_cards (profile_id, card_id, level, rank)
    select p_profile_id, c.id, 1, c.rank
    from public.cards c
    where c.rank = 1
    order by c.sort_order, c.id
    limit 5;
  end if;

  select id into starter_party_id
  from public.parties
  where profile_id = p_profile_id and slot_index = 1;

  if starter_party_id is null then
    insert into public.parties (profile_id, name, slot_index)
    values (p_profile_id, 'First Expedition', 1)
    returning id into starter_party_id;
  end if;

  if not exists (select 1 from public.party_slots where party_id = starter_party_id) then
    insert into public.party_slots (party_id, slot, player_card_id)
    select starter_party_id, row_number() over (order by pc.obtained_at, pc.id)::smallint, pc.id
    from public.player_cards pc
    where pc.profile_id = p_profile_id;
  end if;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, run_slots)
  values (new.id, nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 2)
  on conflict (id) do nothing;
  perform public.provision_starter_loadout(new.id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Local-only account for testing the first-session flow. The generated seed
-- completes its starter loadout after catalog rows exist.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000002',
  'authenticated', 'authenticated', 'dev@tcg2.local', crypt('tcg2devpass', gen_salt('bf', 10)), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"sub":"00000000-0000-0000-0000-000000000002","email":"dev@tcg2.local","email_verified":true,"phone_verified":false}'::jsonb,
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
values (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000002',
  '{"sub":"00000000-0000-0000-0000-000000000002","email":"dev@tcg2.local","email_verified":false,"phone_verified":false}'::jsonb,
  'email', now(), now()
)
on conflict (provider_id, provider) do nothing;

revoke all on function public.provision_starter_loadout(uuid) from public, anon, authenticated;

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
-- Progression RPCs
-- ---------------------------------------------------------------------------

create or replace function public.claim_daily_chest()
returns public.chest_inventory
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.chest_inventory;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  update public.profiles
  set daily_chest_claimed_at = now(), last_seen_at = now()
  where id = auth.uid()
    and (daily_chest_claimed_at is null or daily_chest_claimed_at < current_date);

  if not found then raise exception 'daily chest already claimed'; end if;

  insert into public.chest_inventory (profile_id, chest_id, source)
  values (auth.uid(), 'common', 'daily login')
  returning * into result;
  return result;
end;
$$;

create or replace function public.open_chest(p_inventory_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  chest public.chest_inventory;
  selected_rank smallint;
  selected_card public.cards;
  existing_card public.player_cards;
  shard_material text;
  shard_qty integer;
  roll numeric := random() * 100;
  cursor numeric := 0;
  odds_row record;
  is_new boolean;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select * into chest
  from public.chest_inventory
  where id = p_inventory_id and profile_id = auth.uid()
  for update;
  if not found then raise exception 'chest not found'; end if;
  if chest.opened_at is not null then raise exception 'chest already opened'; end if;

  for odds_row in select rank, weight from public.chest_odds where chest_id = chest.chest_id order by rank loop
    cursor := cursor + odds_row.weight;
    if roll < cursor then
      selected_rank := odds_row.rank;
      exit;
    end if;
  end loop;
  if selected_rank is null then raise exception 'chest has no odds'; end if;

  select * into selected_card from public.cards where rank = selected_rank order by random() limit 1;
  if not found then raise exception 'chest rank has no cards'; end if;

  select * into existing_card
  from public.player_cards
  where profile_id = auth.uid() and card_id = selected_card.id
  limit 1;
  is_new := not found;

  if is_new then
    insert into public.player_cards (profile_id, card_id, rank)
    values (auth.uid(), selected_card.id, selected_rank);
  else
    select dupe_shard_material, dupe_shard_qty into shard_material, shard_qty
    from public.rank_meta where rank = selected_rank;
    insert into public.player_materials (profile_id, material_id, qty)
    values (auth.uid(), shard_material, shard_qty)
    on conflict (profile_id, material_id) do update set qty = public.player_materials.qty + excluded.qty;
  end if;

  update public.chest_inventory set opened_at = now() where id = chest.id;
  insert into public.pull_history (profile_id, chest_id, card_id, rank, was_new)
  values (auth.uid(), chest.chest_id, selected_card.id, selected_rank, is_new);

  return jsonb_build_object(
    'card_id', selected_card.id,
    'card_name', selected_card.name,
    'rank', selected_rank,
    'was_new', is_new,
    'shard_material', shard_material,
    'shard_qty', coalesce(shard_qty, 0)
  );
end;
$$;

create or replace function public.save_party(p_party_id uuid, p_player_card_ids uuid[])
returns setof public.party_slots
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_count integer := coalesce(array_length(p_player_card_ids, 1), 0);
  distinct_count integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if selected_count > 5 then raise exception 'party cannot have more than 5 cards'; end if;

  if not exists (
    select 1 from public.parties
    where id = p_party_id and profile_id = auth.uid()
  ) then
    raise exception 'party not found';
  end if;

  select count(distinct selected.card_id) into distinct_count
  from unnest(coalesce(p_player_card_ids, '{}'::uuid[])) as selected(card_id);
  if distinct_count <> selected_count then raise exception 'party cannot contain duplicate cards'; end if;

  if exists (
    select 1
    from unnest(coalesce(p_player_card_ids, '{}'::uuid[])) as selected(card_id)
    where not exists (
      select 1 from public.player_cards pc
      where pc.id = selected.card_id and pc.profile_id = auth.uid()
    )
  ) then
    raise exception 'party contains a card you do not own';
  end if;

  delete from public.party_slots where party_id = p_party_id;
  insert into public.party_slots (party_id, slot, player_card_id)
  select p_party_id, selected.ordinality::smallint, selected.card_id
  from unnest(coalesce(p_player_card_ids, '{}'::uuid[])) with ordinality as selected(card_id, ordinality);

  return query
  select ps.* from public.party_slots ps
  where ps.party_id = p_party_id
  order by ps.slot;
end;
$$;

create or replace function public.start_run(p_dungeon_id text, p_party_id uuid default null)
returns public.dungeon_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  dungeon public.dungeons;
  party public.parties;
  profile public.profiles;
  card_count integer;
  power integer;
  result public.dungeon_runs;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into profile from public.profiles where id = auth.uid() for update;
  select * into dungeon from public.dungeons where id = p_dungeon_id;
  if not found then raise exception 'dungeon not found'; end if;

  if p_party_id is null then
    select * into party from public.parties where profile_id = auth.uid() order by slot_index limit 1;
    if not found then
      insert into public.parties (profile_id, name, slot_index)
      values (auth.uid(), 'First party', 1) returning * into party;
      insert into public.party_slots (party_id, slot, player_card_id)
      select party.id, row_number() over (order by obtained_at), id
      from public.player_cards where profile_id = auth.uid() order by obtained_at limit 5;
    end if;
  else
    select * into party from public.parties where id = p_party_id and profile_id = auth.uid();
    if not found then raise exception 'party not found'; end if;
  end if;

  select count(*), coalesce(sum(public.card_power(pc.rank, pc.level)), 0)::integer
  into card_count, power
  from public.party_slots ps join public.player_cards pc on pc.id = ps.player_card_id
  where ps.party_id = party.id;
  if card_count = 0 then raise exception 'party has no cards'; end if;
  if (select count(*) from public.dungeon_runs where profile_id = auth.uid() and resolved_at is null) >= profile.run_slots
    then raise exception 'all run slots are busy'; end if;

  insert into public.dungeon_runs (profile_id, dungeon_id, party_id, power_snapshot, ends_at)
  values (auth.uid(), dungeon.id, party.id, power, now() + make_interval(secs => dungeon.duration_seconds))
  returning * into result;
  return result;
end;
$$;

create or replace function public.resolve_runs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  run public.dungeon_runs;
  dungeon public.dungeons;
  chance numeric;
  reward_gold integer;
  reward_material jsonb;
  resolved_count integer := 0;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  for run in select * from public.dungeon_runs where profile_id = auth.uid() and resolved_at is null and ends_at <= now() for update loop
    select * into dungeon from public.dungeons where id = run.dungeon_id;
    chance := greatest(0.1, least(0.95, 0.6 * power(run.power_snapshot::numeric / greatest(dungeon.req_power, 1), 0.8)));
    if random() <= chance then
      reward_gold := round(dungeon.gold_base * greatest(1, least(1.5, run.power_snapshot::numeric / dungeon.req_power)));
      select jsonb_build_object('material_id', (item->>'material_id'), 'qty', floor((item->>'max')::numeric * random() + (item->>'min')::numeric)::integer)
      into reward_material from jsonb_array_elements(dungeon.materials) item order by random() limit 1;
      update public.dungeon_runs set resolved_at = now(), success = true,
        rewards = jsonb_build_object('gold', reward_gold, 'materials', jsonb_build_array(reward_material), 'chest_id', dungeon.chest_on_clear)
      where id = run.id;
    else
      update public.dungeon_runs set resolved_at = now(), success = false,
        rewards = jsonb_build_object('gold', 0, 'materials', jsonb_build_array()) where id = run.id;
    end if;
    resolved_count := resolved_count + 1;
  end loop;
  return resolved_count;
end;
$$;

create or replace function public.claim_run(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  run public.dungeon_runs;
  material jsonb;
  chest_id text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform public.resolve_runs();
  select * into run from public.dungeon_runs where id = p_run_id and profile_id = auth.uid() for update;
  if not found then raise exception 'run not found'; end if;
  if run.resolved_at is null then raise exception 'run is still active'; end if;
  if run.claimed_at is not null then raise exception 'run already claimed'; end if;

  if run.success then
    update public.profiles set gold = gold + coalesce((run.rewards->>'gold')::integer, 0) where id = auth.uid();
    for material in select * from jsonb_array_elements(coalesce(run.rewards->'materials', '[]'::jsonb)) loop
      insert into public.player_materials (profile_id, material_id, qty)
      values (auth.uid(), material->>'material_id', (material->>'qty')::integer)
      on conflict (profile_id, material_id) do update set qty = public.player_materials.qty + excluded.qty;
    end loop;
    chest_id := run.rewards->>'chest_id';
    if chest_id is not null then
      insert into public.chest_inventory (profile_id, chest_id, source) values (auth.uid(), chest_id, 'dungeon clear');
    end if;
  end if;
  update public.dungeon_runs set claimed_at = now() where id = run.id;
  return jsonb_build_object('success', run.success, 'rewards', run.rewards);
end;
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
grant execute on function public.claim_daily_chest() to authenticated;
grant execute on function public.open_chest(uuid) to authenticated;
grant execute on function public.start_run(text, uuid) to authenticated;
grant execute on function public.resolve_runs() to authenticated;
grant execute on function public.claim_run(uuid) to authenticated;
