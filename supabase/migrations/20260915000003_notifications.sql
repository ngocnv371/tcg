-- Run-finished notifications.
--
-- The client only ever *registers* an endpoint. Whether a message is worth sending is
-- decided by the database, on the same `resolved_at` transition that pays the run, so the
-- notification cannot disagree with the outcome and cannot be triggered by the client.
--
-- `dedupe_key` is what makes that safe: `resolve_runs()` runs on every login and hub
-- focus, and the unique key means a run queues at most one notification no matter how
-- many times the resolver looks at it.
--
-- Sending itself is out of the database's hands: `supabase/functions/notify-runs` drains
-- the outbox with the service role and talks to the push service. That is why the outbox
-- has no policies and no grants at all — nobody but the server can see it.

create table public.notification_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- A push service answers 404/410 for an endpoint the browser has thrown away. Marked
  -- rather than deleted so a device that comes back re-registers the same row.
  disabled_at timestamptz
);

create index notification_tokens_active_idx on public.notification_tokens (profile_id)
  where disabled_at is null;

create table public.notification_outbox (
  id bigserial primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('run_finished')),
  title text not null,
  body text not null,
  url text not null default '/',
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts smallint not null default 0,
  last_error text
);

create index notification_outbox_pending_idx on public.notification_outbox (created_at)
  where sent_at is null;

-- ---------------------------------------------------------------------------
-- Queueing
-- ---------------------------------------------------------------------------

-- A run always clears (see 20260915000001_progression.sql), so there is no failure copy
-- to write any more — the message is decided here and cannot be chosen by the client.
create or replace function private.queue_run_finished_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dungeon_name text;
begin
  if old.resolved_at is not null or new.resolved_at is null then
    return null;
  end if;

  -- No live endpoint means there is nothing to send to; queueing anyway would only grow
  -- the outbox for players who never granted permission.
  if not exists (
    select 1 from public.notification_tokens
    where profile_id = new.profile_id and disabled_at is null
  ) then
    return null;
  end if;

  select name into dungeon_name from public.dungeons where id = new.dungeon_id;

  insert into public.notification_outbox (profile_id, kind, title, body, url, dedupe_key)
  values (
    new.profile_id,
    'run_finished',
    'Run complete',
    coalesce(dungeon_name, new.dungeon_id) || ' was cleared — rewards are waiting.',
    '/',
    'run_finished:' || new.id::text
  )
  on conflict (dedupe_key) do nothing;

  return null;
end;
$$;

create trigger queue_run_finished_notification
  after update on public.dungeon_runs
  for each row execute function private.queue_run_finished_notification();

-- ---------------------------------------------------------------------------
-- Client RPCs: register / unregister the browser's endpoint
-- ---------------------------------------------------------------------------

create or replace function public.register_notification_token(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  token_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if coalesce(p_endpoint, '') = '' then raise exception 'endpoint is required'; end if;
  if coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'subscription keys are required';
  end if;

  insert into public.notification_tokens (profile_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent)
  -- A browser hands out one endpoint per install. Resubscribing re-homes it to whoever is
  -- signed in now (the same phone can be a different account) and revives a token a failed
  -- send had disabled.
  on conflict (endpoint) do update set
    profile_id = excluded.profile_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent,
    last_seen_at = now(),
    disabled_at = null
  returning id into token_id;

  return token_id;
end;
$$;

create or replace function public.unregister_notification_token(p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  update public.notification_tokens
  set disabled_at = now()
  where profile_id = auth.uid() and endpoint = p_endpoint and disabled_at is null;

  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sender API (service role only)
-- ---------------------------------------------------------------------------

-- Everything left to send, with the endpoints to send it to. Deliberately a plain read
-- rather than a claim-and-lock: there is one scheduler, and a send that dies mid-flight is
-- retried by the attempts cap instead of being stranded by a lock holder that never
-- released it.
create or replace function public.pending_notifications(p_limit integer default 50)
returns table (
  id bigint,
  profile_id uuid,
  title text,
  body text,
  url text,
  endpoints jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    o.profile_id,
    o.title,
    o.body,
    o.url,
    coalesce(
      (
        select jsonb_agg(jsonb_build_object('endpoint', t.endpoint, 'p256dh', t.p256dh, 'auth', t.auth))
        from public.notification_tokens t
        where t.profile_id = o.profile_id and t.disabled_at is null
      ),
      '[]'::jsonb
    ) as endpoints
  from public.notification_outbox o
  where o.sent_at is null and o.attempts < 5
  order by o.created_at
  limit greatest(p_limit, 1);
$$;

-- p_error null means every endpoint accepted the message. Otherwise the row stays pending
-- and its attempt count climbs until the cap parks it.
create or replace function public.mark_notification_sent(p_id bigint, p_error text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_error is null then
    update public.notification_outbox set sent_at = now(), last_error = null where id = p_id;
  else
    update public.notification_outbox
    set attempts = attempts + 1, last_error = left(p_error, 500)
    where id = p_id;
  end if;
end;
$$;

create or replace function public.disable_notification_tokens(p_endpoints text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  disabled_count integer;
begin
  update public.notification_tokens
  set disabled_at = now()
  where endpoint = any (p_endpoints) and disabled_at is null;

  get diagnostics disabled_count = row_count;
  return disabled_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

alter table public.notification_tokens enable row level security;

create policy notification_tokens_select_own on public.notification_tokens
  for select to authenticated using (profile_id = auth.uid());

grant select on public.notification_tokens to authenticated;
grant execute on function public.register_notification_token(text, text, text, text) to authenticated;
grant execute on function public.unregister_notification_token(text) to authenticated;

-- The outbox is server-only: no policy, no grant. The sender reaches it through the
-- functions below, which are revoked from everyone else.
alter table public.notification_outbox enable row level security;

revoke all on function public.pending_notifications(integer) from public, anon, authenticated;
revoke all on function public.mark_notification_sent(bigint, text) from public, anon, authenticated;
revoke all on function public.disable_notification_tokens(text[]) from public, anon, authenticated;

grant execute on function public.pending_notifications(integer) to service_role;
grant execute on function public.mark_notification_sent(bigint, text) to service_role;
grant execute on function public.disable_notification_tokens(text[]) to service_role;
