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

# Only the migrations the stubbed Postgres can run: 000002 needs pg_cron and 000004 the
# storage schema, neither of which exists outside the real Supabase stack.
MIGRATIONS=(
  "20260918000000_init.sql"
  "20260919000000_multi_party.sql"
  "20260920000000_one_party_per_card.sql"
  "20260922000000_busy_party_guard.sql"
  "20260923000000_claim_before_start.sql"
  "20260924000000_failed_run_pity.sql"
)

docker cp "$ROOT_HOST/supabase/seed.sql" "$NAME:/tmp/seed.sql" >/dev/null

echo "→ applying migrations"
for migration in "${MIGRATIONS[@]}"; do
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
begin
  select count(*) into card_count from public.cards;
  -- cards.csv is deliberately empty now; catalog content ships via scripts/import-concept-cards.mjs.
  if card_count <> 0 then raise exception 'expected 0 seed cards, found %', card_count; end if;

  select count(*) into dungeon_count from public.dungeons;
  -- dungeons.csv is deliberately empty now; content ships via scripts/import-concept-dungeons.mjs.
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

    -- a failed run pays pity gold: claim has to credit rewards->gold for a loss too
    select gold into gold_before from public.profiles
      where id = '00000000-0000-0000-0000-000000000001';
    update public.dungeon_runs
      set resolved_at = now(), success = false,
          rewards = jsonb_build_object('gold', 1, 'materials', jsonb_build_array())
      where party_id = busy_party;
    perform public.claim_run((select id from public.dungeon_runs where party_id = busy_party));
    if (select gold from public.profiles where id = '00000000-0000-0000-0000-000000000001')
       <> gold_before + 1 then
      raise exception 'a failed run did not pay its 1 gold pity (mirrors FAILED_RUN_PITY_GOLD)';
    end if;

    -- leave the throwaway database as the assertions found it
    create or replace function auth.uid() returns uuid language sql stable
      as $fn$ select null::uuid $fn$;
    delete from public.dungeon_runs where dungeon_id = busy_dungeon;
    delete from public.dungeons where id = busy_dungeon;
    delete from public.player_cards where card_id = 'verify_busy_card';
    delete from public.cards where id = 'verify_busy_card';
  end;
end $$;

select 'cards'                 as check, count(*)::text as value from public.cards
union all select 'dungeons',   count(*)::text from public.dungeons
union all select 'materials',  count(*)::text from public.materials
union all select 'rank costs', count(*)::text from public.card_rank_costs
union all select 'chest odds', count(*)::text from public.chest_odds
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
