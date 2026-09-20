#!/usr/bin/env bash
# Verifies the migration + seed against a throwaway Postgres container, with a
# stub auth schema so the Supabase-specific pieces (auth.users, auth.uid())
# resolve. Cheap enough to run before every push; the real Supabase stack
# (npm run db:reset) is the slower confirmation.
#
# Usage: bash scripts/verify-db.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# docker is a native binary: hand it a Windows-style path, not an MSYS one.
if command -v cygpath >/dev/null 2>&1; then
  ROOT_HOST="$(cygpath -m "$ROOT")"
else
  ROOT_HOST="$ROOT"
fi
NAME="${NAME:-tcg2-verify-pg}"
IMAGE="${IMAGE:-postgres:17-alpine}"

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=tcg -e POSTGRES_DB=tcg "$IMAGE" >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT

ready=0
# NB: pg_isready can succeed against the entrypoint's temporary init server, so
# poll with a real query instead.
for _ in $(seq 1 120); do
  if docker exec "$NAME" psql -U postgres -d tcg -tAc 'select 1' >/dev/null 2>&1; then ready=1; break; fi
  sleep 0.5
done
if [ "$ready" != 1 ]; then
  echo "postgres did not become ready" >&2
  exit 1
fi

psql_run() { MSYS_NO_PATHCONV=1 docker exec -i "$NAME" psql -q -v ON_ERROR_STOP=1 -U postgres -d tcg "$@"; }

echo "→ stubbing auth schema"
psql_run <<'SQL'
create schema auth;
create table auth.users (
  instance_id uuid,
  id uuid primary key,
  aud text,
  role text,
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  -- the local dev account insert in the migration names these explicitly
  confirmation_token text,
  email_change text,
  email_change_token_new text,
  recovery_token text
);
create table auth.identities (
  provider_id text not null,
  user_id uuid not null references auth.users(id),
  identity_data jsonb not null,
  provider text not null,
  created_at timestamptz,
  updated_at timestamptz,
  primary key (provider_id, provider)
);
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
-- Supabase roles referenced by the policies/grants in the migration
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
SQL

# Every migration, in filename order — no hand-maintained list to drift out of sync with
# the folder. The files that need the real Supabase stack (storage buckets, pg_cron,
# the realtime publication) guard themselves and skip with a notice, which is what lets a
# bare Postgres apply the same set.
docker cp "$ROOT_HOST/supabase/seed.sql" "$NAME:/tmp/seed.sql" >/dev/null

# Read the list up front rather than looping over a pipe: `docker exec -i` claims stdin,
# which would eat the remaining filenames.
mapfile -t MIGRATIONS < <(find "$ROOT/supabase/migrations" -maxdepth 1 -name '*.sql' | sort)

echo "→ applying migrations"
for migration_path in "${MIGRATIONS[@]}"; do
  migration="$(basename "$migration_path")"
  docker cp "$ROOT_HOST/supabase/migrations/$migration" "$NAME:/tmp/$migration" >/dev/null
  psql_run -f "/tmp/$migration"
done
echo "→ applying seed"
psql_run -f /tmp/seed.sql

echo "→ asserting shape"
docker exec -i "$NAME" psql -q -v ON_ERROR_STOP=1 -U postgres -d tcg <<'SQL'
do $$
declare
  card_count integer;
  dungeon_count integer;
  starter_card_count integer;
  starter_party_count integer;
  starter_slot_count integer;
  write_policies integer;
  missing_power integer;
  missing_drops integer;
  core_count integer;
begin
  select count(*) into card_count from public.cards;
  -- the seed deliberately writes no cards; catalog content ships via scripts/cards-4-import.mjs
  -- (data/cards.csv + data/cards/<id>.png).
  if card_count <> 0 then raise exception 'expected 0 seed cards, found %', card_count; end if;

  select count(*) into dungeon_count from public.dungeons;
  -- nor any dungeons: content ships via scripts/dungeons-1-import.mjs.
  if dungeon_count <> 0 then raise exception 'expected 0 seed dungeons, found %', dungeon_count; end if;

  insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'tester@example.com');
  select count(*) into starter_card_count
  from public.player_cards
  where profile_id = '00000000-0000-0000-0000-000000000001';
  -- no rank-1 cards are seeded, so the starter loadout has nothing to grant.
  if starter_card_count <> 0 then raise exception 'expected 0 starter cards, found %', starter_card_count; end if;

  select count(*) into starter_party_count
  from public.parties
  where profile_id = '00000000-0000-0000-0000-000000000001';
  if starter_party_count <> 1 then raise exception 'expected 1 starter party, found %', starter_party_count; end if;

  select count(*) into starter_slot_count
  from public.party_slots ps
  join public.parties p on p.id = ps.party_id
  where p.profile_id = '00000000-0000-0000-0000-000000000001';
  if starter_slot_count <> 0 then raise exception 'expected 0 starter party slots, found %', starter_slot_count; end if;

  -- every rank-up row must reference real materials
  select count(*) into missing_power
  from public.card_rank_costs c
  cross join lateral jsonb_each_text(c.materials) as m(material_id, qty)
  where not exists (select 1 from public.materials mm where mm.id = m.material_id);
  if missing_power > 0 then raise exception '% rank-up rows reference unknown materials', missing_power; end if;

  -- every dungeon drop must name a real material too: the pool is generated from the
  -- dungeon's tags + rank at import time, so a typo ships a run that pays nothing
  select count(*) into missing_drops
  from public.dungeons d
  cross join lateral jsonb_array_elements(d.materials) as item
  where not exists (select 1 from public.materials m where m.id = item ->> 'material_id');
  if missing_drops > 0 then raise exception '% dungeon drops reference unknown materials', missing_drops; end if;

  -- one Core material per tag per grade: 9 tags x 4 grades
  select count(*) into core_count from public.materials where kind = 'core';
  if core_count <> 36 then raise exception 'expected 36 core materials, found %', core_count; end if;

  -- chest odds must sum to 100 per chest
  perform 1 from (
    select chest_id from public.chest_odds group by chest_id having sum(weight) <> 100
  ) bad;
  if found then raise exception 'chest odds do not sum to 100 for some chest'; end if;

  -- the client must have no write path to player state
  select count(*) into write_policies
  from pg_policies
  where schemaname = 'public' and cmd <> 'SELECT';
  if write_policies > 0 then
    raise exception 'found % non-SELECT policies; clients could write progression', write_policies;
  end if;

  -- provisioning trigger exists
  if not exists (
    select 1 from pg_trigger where tgname = 'on_auth_user_created'
  ) then raise exception 'handle_new_user trigger missing'; end if;

  -- teams are unlimited: no unique (profile_id, slot_index) left on parties
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.parties'::regclass and contype = 'u'
  ) then raise exception 'parties still carries a unique constraint'; end if;

  -- and the create/rename/delete path is SECURITY DEFINER only
  if exists (
    select 1 from (values ('create_party'), ('rename_party'), ('delete_party')) as fn(name)
    where not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = fn.name and p.prosecdef
    )
  ) then raise exception 'a party mutation function is missing or not SECURITY DEFINER'; end if;

  -- proof the old 1..3 cap is gone: 4 teams for one profile, two sharing slot_index
  insert into public.parties (profile_id, name, slot_index)
    values ('00000000-0000-0000-0000-000000000001', 'Second team', 1);
  insert into public.parties (profile_id, name, slot_index)
    values ('00000000-0000-0000-0000-000000000001', 'Fourth team', 4);

  -- one party per card: party_slots is unique on player_card_id alone, not (party_id, player_card_id)
  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.party_slots'::regclass
      and c.contype = 'u'
      and (
        select array_agg(a.attname::text order by a.attname)
        from unnest(c.conkey) as k(attnum)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
      ) = array['player_card_id']
  ) then raise exception 'party_slots is not unique per player_card'; end if;

  declare
    shared_card uuid;
  begin
    -- no rank-1 cards are seeded, so stand one up purely for this check
    insert into public.cards (id, name, rank, faction, role, base_atk, base_def,
                              passive_name, passive_text, lore)
      values ('verify_shared_card', 'Verify Shared Card', 1, 'ember', 'dps', 1, 0, 'p', 'p', 'p');
    insert into public.player_cards (profile_id, card_id, rank)
      values ('00000000-0000-0000-0000-000000000001', 'verify_shared_card', 1)
      returning id into shared_card;

    insert into public.party_slots (party_id, slot, player_card_id)
      select id, 1, shared_card from public.parties
      where profile_id = '00000000-0000-0000-0000-000000000001'
      order by slot_index limit 1;

    begin
      insert into public.party_slots (party_id, slot, player_card_id)
        select id, 1, shared_card from public.parties
        where profile_id = '00000000-0000-0000-0000-000000000001'
        order by slot_index desc limit 1;
      raise exception 'a card was allowed into two parties';
    exception when unique_violation then null;
    end;

    -- leave the throwaway database as the assertions found it
    delete from public.player_cards where card_id = 'verify_shared_card';
    delete from public.cards where id = 'verify_shared_card';
  end;

  -- a party already out on a run cannot be sent again; the UI badge is display only
  declare
    busy_dungeon text := 'verify_busy_dungeon';
    busy_party uuid;
    busy_card uuid;
    gold_before bigint;
  begin
    insert into public.cards (id, name, rank, faction, role, base_atk, base_def,
                              passive_name, passive_text, lore)
      values ('verify_busy_card', 'Verify Busy Card', 1, 'ember', 'dps', 1, 0, 'p', 'p', 'p');
    insert into public.player_cards (profile_id, card_id, rank)
      values ('00000000-0000-0000-0000-000000000001', 'verify_busy_card', 1)
      returning id into busy_card;

    insert into public.parties (profile_id, name, slot_index)
      values ('00000000-0000-0000-0000-000000000001', 'Busy team', 5)
      returning id into busy_party;
    insert into public.party_slots (party_id, slot, player_card_id)
      values (busy_party, 1, busy_card);

    insert into public.dungeons (id, name, kind, tier, req_power, duration_seconds, gold_base)
      values (busy_dungeon, 'Verify Busy Dungeon', 'resource', 1, 10, 3600, 5);

    -- start_run keys off auth.uid(), and the stub always reports null
    create or replace function auth.uid() returns uuid language sql stable
      as $fn$ select '00000000-0000-0000-0000-000000000001'::uuid $fn$;

    perform public.start_run(busy_dungeon, busy_party);
    begin
      perform public.start_run(busy_dungeon, busy_party);
      raise exception 'a party on a live run was allowed to start a second one';
    exception when others then
      if sqlerrm <> 'that party is already on a run' then raise; end if;
    end;

    -- a run always clears now: resolve pays the WHOLE drop table, with party power only
    -- scaling the yield (gold and every stack) between 1.0x and 1.5x
    update public.dungeons
      set rank = 1,
          tags = array['fire', 'earth'],
          materials = jsonb_build_array(
            jsonb_build_object('material_id', 'lesser_fire_core', 'weight', 50, 'min', 2, 'max', 4),
            jsonb_build_object('material_id', 'lesser_earth_core', 'weight', 50, 'min', 2, 'max', 4)
          )
      where id = busy_dungeon;

    -- fast-forward the run instead of ending it at now(): `now()` is the transaction
    -- timestamp, so started_at and a `now()` ends_at would be equal and trip the
    -- `ends_at > started_at` constraint.
    update public.dungeon_runs
      set started_at = now() - interval '2 hours', ends_at = now() - interval '1 hour'
      where party_id = busy_party;
    perform public.resolve_runs();

    if (select success from public.dungeon_runs where party_id = busy_party) is not true then
      raise exception 'a resolved run did not clear — failure is gone, every run pays';
    end if;

    if (select jsonb_array_length(rewards -> 'materials')
        from public.dungeon_runs where party_id = busy_party) <> 2 then
      raise exception 'a clear paid only part of its drop table';
    end if;

    select gold into gold_before from public.profiles
      where id = '00000000-0000-0000-0000-000000000001';
    perform public.claim_run((select id from public.dungeon_runs where party_id = busy_party));

    if (select gold from public.profiles where id = '00000000-0000-0000-0000-000000000001')
       <= gold_before then
      raise exception 'a cleared run paid no gold';
    end if;

    if not exists (
      select 1 from public.player_materials
      where profile_id = '00000000-0000-0000-0000-000000000001'
        and material_id in ('lesser_fire_core', 'lesser_earth_core')
        and qty >= 1
    ) then
      raise exception 'a cleared run paid no materials into the vault';
    end if;

    -- leave the throwaway database as the assertions found it
    create or replace function auth.uid() returns uuid language sql stable
      as $fn$ select null::uuid $fn$;
    delete from public.dungeon_runs where dungeon_id = busy_dungeon;
    delete from public.dungeons where id = busy_dungeon;
    delete from public.player_cards where card_id = 'verify_busy_card';
    delete from public.cards where id = 'verify_busy_card';
  end;

  -- stacked chests burn N rows of one type in a single call, and the guard
  -- refuses to open more than the player actually holds
  declare
    stacked integer;
    opened_rows integer;
    pulls integer;
    reveals jsonb;
    dupe_card text := 'verify_open_card_1';
    dupe_copies integer;
    dupe_copies_after integer;
    first_copies integer;
    shard_id text;
    shard_qty integer;
    shards_before integer;
    shards_after integer;
    original_odds jsonb;
  begin
    -- one card per rank, so any common-chest roll has something to return
    insert into public.cards (id, name, rank, faction, role, base_atk, base_def,
                              passive_name, passive_text, lore)
    select 'verify_open_card_' || rank, 'Verify Open Card ' || rank, rank, 'ember', 'dps', 1, 0, 'p', 'p', 'p'
    from public.rank_meta;

    create or replace function auth.uid() returns uuid language sql stable
      as $fn$ select '00000000-0000-0000-0000-000000000001'::uuid $fn$;

    perform public.grant_test_chests(3);
    select count(*) into stacked
    from public.chest_inventory
    where profile_id = '00000000-0000-0000-0000-000000000001'
      and chest_id = 'common' and opened_at is null;
    if stacked <> 3 then raise exception 'expected 3 stacked common chests, found %', stacked; end if;

    reveals := public.open_chests('common', 2);
    if jsonb_array_length(reveals) <> 2 then
      raise exception 'open_chests(2) returned % reveals', jsonb_array_length(reveals);
    end if;

    select count(*) into opened_rows
    from public.chest_inventory
    where profile_id = '00000000-0000-0000-0000-000000000001'
      and chest_id = 'common' and opened_at is not null;
    if opened_rows <> 2 then raise exception 'open_chests(2) opened % rows', opened_rows; end if;

    select count(*) into pulls
    from public.pull_history
    where profile_id = '00000000-0000-0000-0000-000000000001';
    if pulls <> 2 then raise exception 'open_chests(2) wrote % pull_history rows', pulls; end if;

    begin
      perform public.open_chests('common', 10);
      raise exception 'open_chests opened more chests than the player owns';
    exception when others then
      if sqlerrm <> 'not enough unopened common chests' then raise; end if;
    end;

    -- duplicates now grant a real copy (a second player_cards row for the same card_id)
    -- instead of only paying shards. Pin the odds onto the single rank-1 card so the
    -- duplicate is guaranteed rather than a coin flip.
    select jsonb_agg(jsonb_build_object('rank', rank, 'weight', weight)) into original_odds
      from public.chest_odds where chest_id = 'common';
    update public.chest_odds set weight = case when rank = 1 then 100 else 0 end
      where chest_id = 'common';

    select dupe_shard_material, dupe_shard_qty into shard_id, shard_qty
      from public.rank_meta where rank = 1;

    perform public.grant_test_chests(2);
    -- First pull: a new copy if the card is not owned yet, a duplicate otherwise.
    -- Either way the card is owned afterwards, which makes the next pull deterministic.
    perform public.open_chests('common', 1);

    select count(*) into dupe_copies
      from public.player_cards
      where profile_id = '00000000-0000-0000-0000-000000000001' and card_id = dupe_card;
    select coalesce(qty, 0) into shards_before
      from public.player_materials
      where profile_id = '00000000-0000-0000-0000-000000000001' and material_id = shard_id;
    shards_before := coalesce(shards_before, 0);

    reveals := public.open_chests('common', 1);

    if (reveals->0->>'was_new')::boolean then
      raise exception 'a duplicate pull was reported as a new card';
    end if;
    if (reveals->0->>'player_card_id') is null then
      raise exception 'a reveal is missing its player_card_id';
    end if;

    select count(*) into dupe_copies_after
      from public.player_cards
      where profile_id = '00000000-0000-0000-0000-000000000001' and card_id = dupe_card;
    if dupe_copies_after <> dupe_copies + 1 then
      raise exception 'a duplicate pull did not grant a copy (% -> %)', dupe_copies, dupe_copies_after;
    end if;

    -- was_new must fire exactly once per card, however many copies follow it
    select count(*) into first_copies
      from public.pull_history
      where profile_id = '00000000-0000-0000-0000-000000000001' and card_id = dupe_card and was_new;
    if first_copies <> 1 then
      raise exception 'was_new must be true exactly once per card, found %', first_copies;
    end if;

    -- the shard payout is preserved so the rank-up economy is not starved
    select coalesce(qty, 0) into shards_after
      from public.player_materials
      where profile_id = '00000000-0000-0000-0000-000000000001' and material_id = shard_id;
    if coalesce(shards_after, 0) <> shards_before + shard_qty then
      raise exception 'a duplicate pull stopped paying its % dupe shards', shard_qty;
    end if;

    -- leave the throwaway database as the assertions found it
    update public.chest_odds o
      set weight = (item->>'weight')::numeric
      from jsonb_array_elements(original_odds) as item
      where o.chest_id = 'common' and o.rank = (item->>'rank')::smallint;
    create or replace function auth.uid() returns uuid language sql stable
      as $fn$ select null::uuid $fn$;
    delete from public.pull_history where profile_id = '00000000-0000-0000-0000-000000000001';
    delete from public.chest_inventory where profile_id = '00000000-0000-0000-0000-000000000001';
    delete from public.player_materials where profile_id = '00000000-0000-0000-0000-000000000001';
    delete from public.player_cards where card_id like 'verify_open_card_%';
    delete from public.cards where id like 'verify_open_card_%';
  end;

  -- rank_up_card reads the ladder for the copy's CURRENT rank, spends the gold and the
  -- materials, then moves the copy up one step. A short balance has to raise and roll the
  -- whole spend back.
  declare
    rank_card uuid;
    other_card uuid;
    rank_gold_before bigint;
    rank_rank smallint;
  begin
    insert into public.cards (id, name, rank, faction, role, base_atk, base_def,
                              passive_name, passive_text, lore)
      values ('verify_rank_card', 'Verify Rank Card', 1, 'ember', 'dps', 1, 0, 'p', 'p', 'p');
    insert into public.card_rank_costs (card_id, from_rank, to_rank, gold, materials)
      values ('verify_rank_card', 1, 2, 100, '{"common_shard": 4, "lesser_fire_core": 2}'::jsonb);
    insert into public.player_cards (profile_id, card_id, rank)
      values ('00000000-0000-0000-0000-000000000001', 'verify_rank_card', 1)
      returning id into rank_card;

    create or replace function auth.uid() returns uuid language sql stable
      as $fn$ select '00000000-0000-0000-0000-000000000001'::uuid $fn$;

    select gold into rank_gold_before from public.profiles
      where id = '00000000-0000-0000-0000-000000000001';
    update public.profiles set gold = 1000 where id = '00000000-0000-0000-0000-000000000001';

    -- one shard short of the ladder step
    insert into public.player_materials (profile_id, material_id, qty)
      values ('00000000-0000-0000-0000-000000000001', 'common_shard', 3),
             ('00000000-0000-0000-0000-000000000001', 'lesser_fire_core', 2)
      on conflict (profile_id, material_id) do update set qty = excluded.qty;

    begin
      perform public.rank_up_card(rank_card);
      raise exception 'rank_up_card accepted a short material balance';
    exception when others then
      if sqlerrm <> 'not enough common_shard' then raise; end if;
    end;
    if (select gold from public.profiles where id = '00000000-0000-0000-0000-000000000001') <> 1000 then
      raise exception 'a rejected rank-up still charged its gold';
    end if;

    -- top the shard up and the same call goes through
    update public.player_materials set qty = 4
      where profile_id = '00000000-0000-0000-0000-000000000001' and material_id = 'common_shard';
    perform public.rank_up_card(rank_card);

    select rank into rank_rank from public.player_cards where id = rank_card;
    if rank_rank <> 2 then
      raise exception 'rank_up_card left the copy at % stars', rank_rank;
    end if;
    if (select gold from public.profiles where id = '00000000-0000-0000-0000-000000000001') <> 900 then
      raise exception 'rank_up_card did not spend its 100 gold';
    end if;
    if (select qty from public.player_materials
        where profile_id = '00000000-0000-0000-0000-000000000001' and material_id = 'common_shard') <> 0 then
      raise exception 'rank_up_card did not spend its shards';
    end if;
    if (select qty from public.player_materials
        where profile_id = '00000000-0000-0000-0000-000000000001' and material_id = 'lesser_fire_core') <> 0 then
      raise exception 'rank_up_card did not spend its Cores';
    end if;

    -- the ladder stops where card_rank_costs stops: no 2★ -> 3★ row exists here
    begin
      perform public.rank_up_card(rank_card);
      raise exception 'rank_up_card ranked past the end of the ladder';
    exception when others then
      if sqlerrm <> 'this card cannot rank up further' then raise; end if;
    end;

    -- another player's copy is not addressable, even with its uuid
    insert into public.player_cards (profile_id, card_id, rank)
      values ('00000000-0000-0000-0000-000000000002', 'verify_rank_card', 1)
      returning id into other_card;
    begin
      perform public.rank_up_card(other_card);
      raise exception 'rank_up_card ranked a copy the caller does not own';
    exception when others then
      if sqlerrm <> 'card not found' then raise; end if;
    end;

    -- leave the throwaway database as the assertions found it
    create or replace function auth.uid() returns uuid language sql stable
      as $fn$ select null::uuid $fn$;
    update public.profiles set gold = rank_gold_before
      where id = '00000000-0000-0000-0000-000000000001';
    delete from public.player_materials
      where profile_id = '00000000-0000-0000-0000-000000000001'
        and material_id in ('common_shard', 'lesser_fire_core');
    delete from public.player_cards where card_id = 'verify_rank_card';
    delete from public.card_rank_costs where card_id = 'verify_rank_card';
    delete from public.cards where id = 'verify_rank_card';
  end;

  -- telemetry is written by triggers on the tables the server already owns, so the
  -- client cannot skip or forge a progression event; track_event is allow-listed
  declare
    tel_card uuid;
    tel_dungeon text := 'verify_notify_dungeon';
    tel_party uuid;
    tel_run uuid;
    tel_ooutbox_id bigint;
  begin
    insert into public.cards (id, name, rank, faction, role, base_atk, base_def,
                              passive_name, passive_text, lore)
      values ('verify_tel_card', 'Verify Telemetry Card', 1, 'ember', 'dps', 1, 0, 'p', 'p', 'p');

    create or replace function auth.uid() returns uuid language sql stable
      as $fn$ select '00000000-0000-0000-0000-000000000001'::uuid $fn$;

    -- a granted copy logs itself, with no client involvement
    insert into public.player_cards (profile_id, card_id, rank)
      values ('00000000-0000-0000-0000-000000000001', 'verify_tel_card', 1)
      returning id into tel_card;

    if (select count(*) from public.telemetry_events
        where name = 'card_acquired' and source = 'server'
          and props ->> 'player_card_id' = tel_card::text) <> 1 then
      raise exception 'granting a card wrote no card_acquired telemetry';
    end if;

    -- player_cards keeps no history, so the rank->rank transition is the only record a
    -- rank-up leaves; without it 'time to first rank-up' is unanswerable
    update public.player_cards set rank = 2 where id = tel_card;

    if (select count(*) from public.telemetry_events
        where name = 'card_ranked_up' and source = 'server'
          and props ->> 'player_card_id' = tel_card::text
          and (props ->> 'from_rank')::integer = 1
          and (props ->> 'to_rank')::integer = 2) <> 1 then
      raise exception 'a rank-up wrote no card_ranked_up telemetry';
    end if;

    -- the client may log its own lifecycle...
    perform public.track_event('app_open', jsonb_build_object('build', 'verify'));
    if not exists (
      select 1 from public.telemetry_events
      where profile_id = '00000000-0000-0000-0000-000000000001'
        and name = 'app_open' and source = 'client'
    ) then raise exception 'track_event did not record app_open'; end if;

    -- ...but not a progression step
    begin
      perform public.track_event('card_ranked_up', '{}'::jsonb);
      raise exception 'track_event accepted a server-only event name';
    exception when others then
      if sqlerrm not like 'unknown client event%' then raise; end if;
    end;

    begin
      perform public.track_event('app_open', '[]'::jsonb);
      raise exception 'track_event accepted non-object props';
    exception when others then
      if sqlerrm <> 'event props must be a json object' then raise; end if;
    end;

    -- telemetry is append-only observation: players can read their own rows, nobody else's
    if not has_table_privilege('authenticated', 'public.telemetry_events', 'select') then
      raise exception 'authenticated cannot read its own telemetry';
    end if;
    if has_table_privilege('authenticated', 'public.telemetry_events', 'insert') then
      raise exception 'authenticated can insert telemetry rows directly';
    end if;

    insert into public.parties (profile_id, name, slot_index)
      values ('00000000-0000-0000-0000-000000000001', 'Notify team', 6)
      returning id into tel_party;
    insert into public.party_slots (party_id, slot, player_card_id)
      values (tel_party, 1, tel_card);
    insert into public.dungeons (id, name, kind, tier, req_power, duration_seconds, gold_base)
      values (tel_dungeon, 'Verify Notify Dungeon', 'resource', 1, 10, 3600, 5);

    -- with no registered device there is nothing to send, so nothing is queued
    insert into public.dungeon_runs (profile_id, dungeon_id, party_id, power_snapshot,
                                     started_at, ends_at)
      values ('00000000-0000-0000-0000-000000000001', tel_dungeon, tel_party, 100,
              now() - interval '2 hours', now() - interval '1 minute')
      returning id into tel_run;

    update public.dungeon_runs set resolved_at = now(), success = true, rewards = '{"gold": 5}'::jsonb
      where id = tel_run;

    if exists (select 1 from public.notification_outbox
               where dedupe_key = 'run_finished:' || tel_run::text) then
      raise exception 'a run queued a notification with no registered device';
    end if;

    perform public.register_notification_token('https://push.example/verify-1', 'p256', 'auth', 'verify-agent');
    if (select count(*) from public.notification_tokens
        where profile_id = '00000000-0000-0000-0000-000000000001' and disabled_at is null) <> 1 then
      raise exception 'register_notification_token stored no active token';
    end if;

    -- an endpoint is unique: resubscribing updates the row rather than adding a second
    perform public.register_notification_token('https://push.example/verify-1', 'p256b', 'authb', null);
    if (select count(*) from public.notification_tokens
        where endpoint = 'https://push.example/verify-1') <> 1 then
      raise exception 're-registering an endpoint created a second token';
    end if;

    -- now the same transition claims a notification
    insert into public.dungeon_runs (profile_id, dungeon_id, party_id, power_snapshot,
                                     started_at, ends_at)
      values ('00000000-0000-0000-0000-000000000001', tel_dungeon, tel_party, 100,
              now() - interval '2 hours', now() - interval '1 minute')
      returning id into tel_run;

    update public.dungeon_runs set resolved_at = now(), success = true, rewards = '{"gold": 5}'::jsonb
      where id = tel_run;

    select id into tel_ooutbox_id from public.notification_outbox
      where dedupe_key = 'run_finished:' || tel_run::text and sent_at is null;
    if tel_ooutbox_id is null then
      raise exception 'a resolved run queued no notification';
    end if;

    -- resolve_runs() runs on every login and hub focus, so a re-resolved run must not
    -- queue a second message for the same run id
    update public.dungeon_runs set resolved_at = null where id = tel_run;
    update public.dungeon_runs set resolved_at = now() where id = tel_run;
    if (select count(*) from public.notification_outbox
        where dedupe_key = 'run_finished:' || tel_run::text) <> 1 then
      raise exception 'a second resolve queued a duplicate notification';
    end if;

    -- the sender API is service_role only, and carries the endpoints with the message
    if has_function_privilege('authenticated', 'public.pending_notifications(integer)', 'execute') then
      raise exception 'authenticated can call the notification sender API';
    end if;
    if not has_function_privilege('service_role', 'public.pending_notifications(integer)', 'execute') then
      raise exception 'service_role cannot call the notification sender API';
    end if;
    if has_table_privilege('authenticated', 'public.notification_outbox', 'select') then
      raise exception 'authenticated can read the notification outbox';
    end if;

    if coalesce((select jsonb_array_length(p.endpoints) from public.pending_notifications(50) p
                 where p.id = tel_ooutbox_id), 0) <> 1 then
      raise exception 'pending_notifications did not attach the device endpoint';
    end if;

    perform public.mark_notification_sent(tel_ooutbox_id);
    if exists (select 1 from public.notification_outbox where id = tel_ooutbox_id and sent_at is null) then
      raise exception 'mark_notification_sent left the row pending';
    end if;

    -- a push service that answers 410 Gone disables the endpoint permanently
    if public.disable_notification_tokens(array['https://push.example/verify-1']) <> 1 then
      raise exception 'disable_notification_tokens did not disable the dead endpoint';
    end if;

    perform public.register_notification_token('https://push.example/verify-2', 'p', 'a', null);
    if not public.unregister_notification_token('https://push.example/verify-2') then
      raise exception 'unregister_notification_token did not disable the token';
    end if;

    -- leave the throwaway database as the assertions found it
    create or replace function auth.uid() returns uuid language sql stable
      as $fn$ select null::uuid $fn$;
    delete from public.notification_outbox
      where profile_id = '00000000-0000-0000-0000-000000000001';
    delete from public.notification_tokens
      where profile_id = '00000000-0000-0000-0000-000000000001';
    delete from public.dungeon_runs where dungeon_id = tel_dungeon;
    delete from public.dungeons where id = tel_dungeon;
    delete from public.party_slots where party_id = tel_party;
    delete from public.parties where id = tel_party;
    delete from public.player_cards where card_id = 'verify_tel_card';
    delete from public.cards where id = 'verify_tel_card';
    delete from public.telemetry_events
      where name = 'app_open'
         or props ->> 'card_id' = 'verify_tel_card'
         or props ->> 'dungeon_id' = tel_dungeon
         or props ->> 'player_card_id' = tel_card::text;
  end;
end $$;

select 'cards'                 as check, count(*)::text as value from public.cards
union all select 'dungeons',   count(*)::text from public.dungeons
union all select 'materials',  count(*)::text from public.materials
union all select 'rank costs', count(*)::text from public.card_rank_costs
union all select 'chest odds', count(*)::text from public.chest_odds
union all select 'telemetry events', count(*)::text from public.telemetry_events
union all select 'notif tokens', count(*)::text from public.notification_tokens
union all select 'notif outbox', count(*)::text from public.notification_outbox
union all select '1star card_atk',   public.card_atk(1::smallint, 1)::text
union all select '1star card_def',   public.card_def(1::smallint, 1)::text
union all select '1star card_power', public.card_power(1::smallint, 1)::text
union all select 'slots @ lvl 25',   public.slots_for_level(25::smallint)::text
union all select 'empty party power', public.party_power(gen_random_uuid())::text;
SQL

echo "→ provisioning a user through the trigger"
docker exec -i "$NAME" psql -q -v ON_ERROR_STOP=1 -U postgres -d tcg <<'SQL'
select 'profile created for: ' || coalesce(username, '(no username)') || ' / slots ' || run_slots
from public.profiles where id = '00000000-0000-0000-0000-000000000001';
select 'starter cards: ' || count(*)::text
from public.player_cards
where profile_id = '00000000-0000-0000-0000-000000000001';
select 'starter party slots: ' || count(*)::text
from public.party_slots ps
join public.parties p on p.id = ps.party_id
where p.profile_id = '00000000-0000-0000-0000-000000000001';
SQL

echo "✓ schema + seed verified"
