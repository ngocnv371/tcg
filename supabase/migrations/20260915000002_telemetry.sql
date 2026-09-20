-- Telemetry — the numbers the week-11 balance pass reads (plan §5, §9).
--
-- Two sources, deliberately split by how much they can be trusted:
--
--   1. `source = 'server'`. Rows written by triggers on pull_history, dungeon_runs and
--      player_cards. Those tables are only ever written inside the SECURITY DEFINER
--      functions that own the roll, the timer and the spend, so the trigger sees exactly
--      what the server decided. The client cannot skip the event or invent one.
--   2. `source = 'client'`. Rows written by `track_event`, which a signed-in player may
--      call but only with a name from a fixed allow-list (app lifecycle, UI). A client
--      that can name its own events can also name 'card_ranked_up', so it is not allowed
--      to name anything at all.
--
-- Telemetry is append-only observation. It is never read back to compute a balance, so a
-- forged client row can only mislead the tuning pass, never move gold or cards.

create table public.telemetry_events (
  id bigserial primary key,
  profile_id uuid references public.profiles (id) on delete set null,
  name text not null check (char_length(name) between 1 and 64),
  source text not null check (source in ('client', 'server')),
  props jsonb not null default '{}'::jsonb check (jsonb_typeof(props) = 'object'),
  created_at timestamptz not null default now()
);

create index telemetry_events_profile_idx on public.telemetry_events (profile_id, created_at desc);
create index telemetry_events_name_idx on public.telemetry_events (name, created_at desc);

-- ---------------------------------------------------------------------------
-- Server-side writer
-- ---------------------------------------------------------------------------

create or replace function private.log_telemetry_event(p_profile_id uuid, p_name text, p_props jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.telemetry_events (profile_id, name, source, props)
  values (p_profile_id, p_name, 'server', coalesce(p_props, '{}'::jsonb));
$$;

revoke all on function private.log_telemetry_event(uuid, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Triggers: one event per thing the player actually did
-- ---------------------------------------------------------------------------

-- A pull. Carries the chest and the rank, which is what "chests/day" and the
-- rarity distribution of the tuning pass are read from.
create or replace function private.telemetry_on_pull()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.log_telemetry_event(new.profile_id, 'chest_pulled', jsonb_build_object(
    'chest_id', new.chest_id,
    'card_id', new.card_id,
    'rank', new.rank,
    'was_new', new.was_new
  ));
  return null;
end;
$$;

create trigger telemetry_after_pull
  after insert on public.pull_history
  for each row execute function private.telemetry_on_pull();

-- A granted card. Starter loadouts land here too, which is how the first-session
-- script is measured: five cards, no pull involved.
create or replace function private.telemetry_on_card_granted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.log_telemetry_event(new.profile_id, 'card_acquired', jsonb_build_object(
    'player_card_id', new.id,
    'card_id', new.card_id,
    'rank', new.rank
  ));
  return null;
end;
$$;

create trigger telemetry_after_card_granted
  after insert on public.player_cards
  for each row execute function private.telemetry_on_card_granted();

-- A rank-up is a rank *increase* on an existing copy: player_cards has no history table,
-- so without this the only upgrade in the game would leave no trace and "time to first
-- rank-up" would be unanswerable.
create or replace function private.telemetry_on_card_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.rank > old.rank then
    perform private.log_telemetry_event(new.profile_id, 'card_ranked_up', jsonb_build_object(
      'player_card_id', new.id,
      'card_id', new.card_id,
      'from_rank', old.rank,
      'to_rank', new.rank
    ));
  end if;
  return null;
end;
$$;

create trigger telemetry_after_card_changed
  after update on public.player_cards
  for each row execute function private.telemetry_on_card_changed();

create or replace function private.telemetry_on_run_started()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.log_telemetry_event(new.profile_id, 'run_started', jsonb_build_object(
    'run_id', new.id,
    'dungeon_id', new.dungeon_id,
    'power_snapshot', new.power_snapshot
  ));
  return null;
end;
$$;

create trigger telemetry_after_run_started
  after insert on public.dungeon_runs
  for each row execute function private.telemetry_on_run_started();

-- resolve_runs() is called on every login and hub focus and is idempotent, so these fire
-- on the null → not-null transition only, exactly once per run.
create or replace function private.telemetry_on_run_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.resolved_at is null and new.resolved_at is not null then
    perform private.log_telemetry_event(new.profile_id, 'run_resolved', jsonb_build_object(
      'run_id', new.id,
      'dungeon_id', new.dungeon_id,
      'success', new.success,
      'duration_seconds', extract(epoch from (new.ends_at - new.started_at))::integer
    ));
  end if;

  if old.claimed_at is null and new.claimed_at is not null then
    perform private.log_telemetry_event(new.profile_id, 'run_claimed', jsonb_build_object(
      'run_id', new.id,
      'dungeon_id', new.dungeon_id,
      'success', new.success,
      'gold', coalesce((new.rewards ->> 'gold')::integer, 0)
    ));
  end if;

  return null;
end;
$$;

create trigger telemetry_after_run_changed
  after update on public.dungeon_runs
  for each row execute function private.telemetry_on_run_changed();

-- ---------------------------------------------------------------------------
-- Client-side writer
-- ---------------------------------------------------------------------------

create or replace function public.track_event(p_name text, p_props jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Only names that *no* server trigger could produce belong here. Anything that maps to
  -- a real progression step stays server-side, or it becomes forgeable.
  allowed constant text[] := array['app_open', 'screen_view'];
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  if p_name is null or not (p_name = any (allowed)) then
    raise exception 'unknown client event: %', coalesce(p_name, '(null)');
  end if;

  if jsonb_typeof(coalesce(p_props, '{}'::jsonb)) <> 'object' then
    raise exception 'event props must be a json object';
  end if;

  -- A client can send this as often as it likes; cap the payload so it cannot be used as
  -- free storage.
  if pg_column_size(coalesce(p_props, '{}'::jsonb)) > 2048 then
    raise exception 'event props are too large';
  end if;

  insert into public.telemetry_events (profile_id, name, source, props)
  values (auth.uid(), p_name, 'client', coalesce(p_props, '{}'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

alter table public.telemetry_events enable row level security;

-- Read-only, and only your own rows: there is no INSERT/UPDATE/DELETE policy, so the two
-- routes above are the only way a row can appear.
create policy telemetry_events_select_own on public.telemetry_events
  for select to authenticated using (profile_id = auth.uid());

grant select on public.telemetry_events to authenticated;
grant execute on function public.track_event(text, jsonb) to authenticated;
