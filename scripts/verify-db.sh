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
  updated_at timestamptz
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

docker cp "$ROOT_HOST/supabase/migrations/20260918000000_init.sql" "$NAME:/tmp/init.sql" >/dev/null
docker cp "$ROOT_HOST/supabase/seed.sql" "$NAME:/tmp/seed.sql" >/dev/null

echo "→ applying migration"
psql_run -f /tmp/init.sql
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
  if card_count <> 30 then raise exception 'expected 30 cards, found %', card_count; end if;

  select count(*) into dungeon_count from public.dungeons;
  if dungeon_count <> 6 then raise exception 'expected 6 dungeons, found %', dungeon_count; end if;

  insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'tester@example.com');
  select count(*) into starter_card_count
  from public.player_cards
  where profile_id = '00000000-0000-0000-0000-000000000001';
  if starter_card_count <> 5 then raise exception 'expected 5 starter cards, found %', starter_card_count; end if;

  select count(*) into starter_party_count
  from public.parties
  where profile_id = '00000000-0000-0000-0000-000000000001';
  if starter_party_count <> 1 then raise exception 'expected 1 starter party, found %', starter_party_count; end if;

  select count(*) into starter_slot_count
  from public.party_slots ps
  join public.parties p on p.id = ps.party_id
  where p.profile_id = '00000000-0000-0000-0000-000000000001';
  if starter_slot_count <> 5 then raise exception 'expected 5 starter party slots, found %', starter_slot_count; end if;

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
