-- Progression: everything that changes player state, and nothing else.
--
-- Every function here is SECURITY DEFINER and re-reads the numbers it needs from the
-- catalog inside the same transaction, so a client can only ever name *what* to do —
-- never what it costs, what it pays or whether it worked. RLS on the tables stays
-- SELECT-only (see 20260915000000_init.sql); this file is the entire write path.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Provisioning: a signup gets a profile, a starter party and a dev account
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
    -- The starter copies are rank 1 like every other copy: a catalog row carries no rank of its
    -- own, so the first cards in catalog order are as good as any.
    insert into public.player_cards (profile_id, card_id, level, rank)
    select p_profile_id, c.id, 1, 1
    from public.cards c
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

-- Callable by the seed runner (service role) and by handle_new_user; never by a client.
revoke all on function public.provision_starter_loadout(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Chests
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

create or replace function public.grant_test_chests(p_qty integer default 10)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_qty < 1 or p_qty > 100 then raise exception 'test chest quantity must be between 1 and 100'; end if;

  insert into public.chest_inventory (profile_id, chest_id, source)
  select auth.uid(), 'common', 'test grant'
  from generate_series(1, p_qty);

  return p_qty;
end;
$$;

-- Dev-only faucet for the premium currency `rush_run` spends, mirroring grant_test_chests.
-- Gems have no earn path in v1, so without this the rush button could never be exercised.
create or replace function public.grant_test_gems(p_qty integer default 100)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_qty < 1 or p_qty > 10000 then raise exception 'test gem quantity must be between 1 and 10000'; end if;

  update public.profiles set gems = gems + p_qty where id = auth.uid();
  return p_qty;
end;
$$;

-- The roll lives here and nowhere else. A duplicate pull still inserts a real copy (the
-- copy is the unit of progression — it levels and ranks on its own) *and* still pays the
-- dupe shards, because card_rank_costs is what rank_up_card spends.
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
  new_player_card_id uuid;
  shard_material text;
  shard_qty integer;
  is_first_copy boolean;
  roll numeric := random() * 100;
  cursor numeric := 0;
  odds_row record;
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

  -- Every catalog card is a rank-1 base and the rolled rank is the *copy's* rank, so the pool is
  -- the whole catalog. Filtering it by the rolled rank would make a 3★ roll depend on the catalog
  -- happening to hold a 3★ row — a content accident, not a rule.
  select * into selected_card from public.cards order by random() limit 1;
  if not found then raise exception 'card catalog is empty'; end if;

  -- Ownership is per (profile_id, card_id) and never per rank: a 3★ roll of a card you
  -- already own at 1★ is still a duplicate, not a new card.
  is_first_copy := not exists (
    select 1 from public.player_cards
    where profile_id = auth.uid() and card_id = selected_card.id
  );

  insert into public.player_cards (profile_id, card_id, rank)
  values (auth.uid(), selected_card.id, selected_rank)
  returning id into new_player_card_id;

  if not is_first_copy then
    select dupe_shard_material, dupe_shard_qty into shard_material, shard_qty
    from public.rank_meta where rank = selected_rank;
    insert into public.player_materials (profile_id, material_id, qty)
    values (auth.uid(), shard_material, shard_qty)
    on conflict (profile_id, material_id) do update set qty = public.player_materials.qty + excluded.qty;
  end if;

  update public.chest_inventory set opened_at = now() where id = chest.id;
  insert into public.pull_history (profile_id, chest_id, card_id, rank, was_new)
  values (auth.uid(), chest.chest_id, selected_card.id, selected_rank, is_first_copy);

  return jsonb_build_object(
    'card_id', selected_card.id,
    -- The instance id, so the reveal can deep-link to the exact copy it just granted
    -- instead of the catalog row (which may now map to several owned copies).
    'player_card_id', new_player_card_id,
    'card_name', selected_card.name,
    'art_path', selected_card.art_path,
    'rank', selected_rank,
    'was_new', is_first_copy,
    'shard_material', shard_material,
    'shard_qty', coalesce(shard_qty, 0)
  );
end;
$$;

-- The vault stacks duplicates by chest type, so opening burns several chests in one call.
-- Each chest still rolls through open_chest; this function only picks which unopened rows
-- to spend, oldest first, and returns the reveals.
create or replace function public.open_chests(p_chest_id text, p_qty integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  available integer;
  target record;
  openings jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 10 then
    raise exception 'open quantity must be between 1 and 10';
  end if;

  select count(*) into available
  from public.chest_inventory
  where profile_id = auth.uid() and chest_id = p_chest_id and opened_at is null;
  if available < p_qty then
    raise exception 'not enough unopened % chests', p_chest_id;
  end if;

  -- Lock the picked rows before rolling so two concurrent calls can't open the same chest.
  for target in
    select id
    from public.chest_inventory
    where profile_id = auth.uid() and chest_id = p_chest_id and opened_at is null
    order by granted_at, id
    limit p_qty
    for update
  loop
    openings := openings || jsonb_build_array(public.open_chest(target.id));
  end loop;

  return openings;
end;
$$;

grant execute on function public.claim_daily_chest() to authenticated;
grant execute on function public.grant_test_chests(integer) to authenticated;
grant execute on function public.grant_test_gems(integer) to authenticated;
grant execute on function public.open_chest(uuid) to authenticated;
grant execute on function public.open_chests(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Parties
-- ---------------------------------------------------------------------------

-- Mirrors `unique (player_card_id)` on party_slots with a readable error, so the client
-- gets "a card can only be in one party" instead of a raw unique-violation.
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

  -- Excludes this party: re-saving the same lineup must stay legal.
  if exists (
    select 1
    from unnest(coalesce(p_player_card_ids, '{}'::uuid[])) as selected(card_id)
    join public.party_slots ps on ps.player_card_id = selected.card_id
    where ps.party_id <> p_party_id
  ) then
    raise exception 'a card can only be in one party';
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

-- Teams are unlimited, so creation is a function rather than a fixed set of slots.
-- Names and the append index are server-owned.
create or replace function public.create_party(p_name text default null)
returns public.parties
language plpgsql
security definer
set search_path = public
as $$
declare
  next_index smallint;
  result public.parties;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if char_length(btrim(coalesce(p_name, ''))) > 40 then
    raise exception 'party name cannot be longer than 40 characters';
  end if;

  select coalesce(max(slot_index), 0) + 1 into next_index
  from public.parties
  where profile_id = auth.uid();

  insert into public.parties (profile_id, name, slot_index)
  values (
    auth.uid(),
    coalesce(nullif(btrim(coalesce(p_name, '')), ''), 'Team ' || next_index),
    next_index
  )
  returning * into result;

  return result;
end;
$$;

create or replace function public.rename_party(p_party_id uuid, p_name text)
returns public.parties
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.parties;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception 'party name cannot be empty';
  end if;
  if char_length(btrim(p_name)) > 40 then
    raise exception 'party name cannot be longer than 40 characters';
  end if;

  update public.parties
  set name = btrim(p_name)
  where id = p_party_id and profile_id = auth.uid()
  returning * into result;

  if not found then raise exception 'party not found'; end if;
  return result;
end;
$$;

create or replace function public.delete_party(p_party_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  if not exists (
    select 1 from public.parties
    where id = p_party_id and profile_id = auth.uid()
  ) then
    raise exception 'party not found';
  end if;

  -- Keep one team around so `start_run`'s default party always resolves.
  if (select count(*) from public.parties where profile_id = auth.uid()) <= 1 then
    raise exception 'cannot delete your only party';
  end if;

  -- A run snapped its power at start, but deleting a party mid-run would leave
  -- `dungeon_runs.party_id` nulled and the history harder to read.
  if exists (
    select 1 from public.dungeon_runs
    where party_id = p_party_id and resolved_at is null
  ) then
    raise exception 'party has an active run';
  end if;

  delete from public.parties where id = p_party_id and profile_id = auth.uid();
end;
$$;

grant execute on function public.save_party(uuid, uuid[]) to authenticated;
grant execute on function public.create_party(text) to authenticated;
grant execute on function public.rename_party(uuid, text) to authenticated;
grant execute on function public.delete_party(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Runs
-- ---------------------------------------------------------------------------

-- A run ALWAYS clears. Party power only scales how much of the listed payout comes home,
-- so there is no success roll to make server-side — but failure is still not something a
-- client can choose.
create or replace function private.resolve_due_runs(p_profile_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  run public.dungeon_runs;
  dungeon public.dungeons;
  -- The yield multiplier is the only thing party power decides. Mirrors
  -- REWARD_MULT_MIN / REWARD_MULT_MAX in src/game/formulas.ts.
  mult numeric;
  reward_gold integer;
  reward_materials jsonb;
  resolved_count integer := 0;
begin
  -- p_profile_id null means "every profile", which is how the scheduled job (see
  -- 20260915000005_jobs.sql) advances runs for players who are not online. The same body
  -- serves both callers, so an online resolve and the sweep can never disagree.
  for run in
    select * from public.dungeon_runs
    where resolved_at is null
      and ends_at <= now()
      and (p_profile_id is null or profile_id = p_profile_id)
    for update
  loop
    select * into dungeon from public.dungeons where id = run.dungeon_id;

    mult := greatest(1, least(1.5, run.power_snapshot::numeric / greatest(dungeon.req_power, 1)));
    reward_gold := round(dungeon.gold_base * mult);

    -- EVERY entry pays out, rather than one weighted pick, because a predictable yield is
    -- the whole point of targeting a dungeon for its tags.
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'material_id', item ->> 'material_id',
          'qty', greatest(
            1,
            round(
              (
                floor(random() * ((item ->> 'max')::numeric - (item ->> 'min')::numeric + 1))
                + (item ->> 'min')::numeric
              ) * mult
            )
          )::integer
        )
      ),
      '[]'::jsonb
    )
    into reward_materials
    from jsonb_array_elements(dungeon.materials) item;

    update public.dungeon_runs
    set resolved_at = now(),
      success = true,
      rewards = jsonb_build_object(
        'gold', reward_gold,
        'materials', reward_materials,
        'chest_id', dungeon.chest_on_clear,
        'multiplier', mult
      )
    where id = run.id;

    resolved_count := resolved_count + 1;
  end loop;

  return resolved_count;
end;
$$;

revoke all on function private.resolve_due_runs(uuid) from public, anon, authenticated;

-- Idempotent by construction: it only touches runs whose `ends_at` has passed, so calling
-- it on every login and hub focus is free.
create or replace function public.resolve_runs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  return private.resolve_due_runs(auth.uid());
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
  perform public.resolve_runs();
  -- Locking the profile row is what makes the slot and busy-party checks race-free.
  select * into profile from public.profiles where id = auth.uid() for update;
  select * into dungeon from public.dungeons where id = p_dungeon_id;
  if not found then raise exception 'dungeon not found'; end if;

  -- Checked before the party is picked, so the gate is account-wide rather than per-lineup:
  -- keeping a queue of resolved-but-unclaimed runs would otherwise make ignoring the claim
  -- flow free.
  if exists (
    select 1 from public.dungeon_runs
    where profile_id = auth.uid() and resolved_at is not null and claimed_at is null
  ) then
    raise exception 'claim your finished runs first';
  end if;

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

  -- Mirrors the client-side "Running" badge with a readable error; the badge alone would
  -- let a hand-rolled client farm one lineup through two dungeons at once.
  if exists (
    select 1 from public.dungeon_runs
    where party_id = party.id and resolved_at is null
  ) then
    raise exception 'that party is already on a run';
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

-- Payout is exactly what the resolver wrote on the run. Every run clears, so there is no
-- `if run.success` branch left to fall through.
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

  update public.profiles
  set gold = gold + coalesce((run.rewards ->> 'gold')::integer, 0)
  where id = auth.uid();

  for material in select * from jsonb_array_elements(coalesce(run.rewards -> 'materials', '[]'::jsonb)) loop
    insert into public.player_materials (profile_id, material_id, qty)
    values (auth.uid(), material ->> 'material_id', (material ->> 'qty')::integer)
    on conflict (profile_id, material_id) do update set qty = public.player_materials.qty + excluded.qty;
  end loop;

  chest_id := run.rewards ->> 'chest_id';
  if chest_id is not null then
    insert into public.chest_inventory (profile_id, chest_id, source)
    values (auth.uid(), chest_id, 'dungeon clear');
  end if;

  update public.dungeon_runs set claimed_at = now() where id = run.id;
  return jsonb_build_object('success', run.success, 'rewards', run.rewards);
end;
$$;

-- Rushing buys the wait back with gems: it moves `ends_at` to now() and lets the normal
-- resolver finish the run, so payout stays on the single claim path and the client never
-- decides when a run ends. The price is computed here from the stored `ends_at`, never from
-- anything the client sends; `rushCost` in src/game/formulas.ts is only the button preview.
create or replace function public.rush_run(p_run_id uuid)
returns public.dungeon_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  run public.dungeon_runs;
  remaining_seconds numeric;
  -- Mirrors RUSH_GEMS_PER_MINUTE / RUSH_GEMS_MIN in src/game/formulas.ts.
  cost integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform public.resolve_runs();

  select * into run
  from public.dungeon_runs
  where id = p_run_id and profile_id = auth.uid()
  for update;
  if not found then raise exception 'run not found'; end if;
  if run.resolved_at is not null then raise exception 'run already finished'; end if;

  remaining_seconds := greatest(0, extract(epoch from (run.ends_at - now())));
  cost := greatest(1, (ceil(remaining_seconds / 60.0) * 2)::integer);

  -- Guarded spend: `not found` means the balance never covered the rush, and the exception
  -- rolls back the ends_at change below.
  update public.profiles
  set gems = gems - cost
  where id = auth.uid() and gems >= cost;
  if not found then raise exception 'not enough gems'; end if;

  -- now() is the transaction timestamp, so the resolver below sees ends_at <= now() and
  -- finishes the run through the same body the cron sweep uses. start_run committed in an
  -- earlier transaction, so started_at < now() and the ends_at > started_at check holds.
  update public.dungeon_runs set ends_at = now() where id = run.id;
  perform public.resolve_runs();

  select * into run from public.dungeon_runs where id = run.id;
  return run;
end;
$$;

grant execute on function public.resolve_runs() to authenticated;
grant execute on function public.start_run(text, uuid) to authenticated;
grant execute on function public.claim_run(uuid) to authenticated;
grant execute on function public.rush_run(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Rank-up
-- ---------------------------------------------------------------------------

-- Rank-up is a SPEND, so it has to be one server-side step: read the ladder for the card's
-- CURRENT rank, take the gold and the materials, then bump the rank. Two concurrent clicks
-- can't double-spend because the player_cards row is locked first and the cost is re-read
-- inside the same transaction. The client never sends a cost; it only names the copy to
-- upgrade, and `card_rank_costs` is what both the detail screen and this function read.
create or replace function public.rank_up_card(p_player_card_id uuid)
returns public.player_cards
language plpgsql
security definer
set search_path = public
as $$
declare
  card_row public.player_cards;
  cost public.card_rank_costs;
  material record;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select * into card_row
  from public.player_cards
  where id = p_player_card_id and profile_id = auth.uid()
  for update;
  if not found then raise exception 'card not found'; end if;

  select * into cost
  from public.card_rank_costs
  where card_id = card_row.card_id and from_rank = card_row.rank;
  if not found then raise exception 'this card cannot rank up further'; end if;

  -- Guarded update: `not found` means the balance never covered the cost, and the
  -- exception rolls back anything already spent in this call.
  update public.profiles
  set gold = gold - cost.gold
  where id = auth.uid() and gold >= cost.gold;
  if not found then raise exception 'not enough gold'; end if;

  for material in
    select key as material_id, (value)::integer as qty from jsonb_each_text(cost.materials)
  loop
    update public.player_materials
    set qty = qty - material.qty
    where profile_id = auth.uid()
      and material_id = material.material_id
      and qty >= material.qty;
    if not found then
      raise exception 'not enough %', material.material_id;
    end if;
  end loop;

  update public.player_cards
  set rank = cost.to_rank
  where id = card_row.id
  returning * into card_row;

  return card_row;
end;
$$;

grant execute on function public.rank_up_card(uuid) to authenticated;
