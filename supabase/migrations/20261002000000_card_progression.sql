-- Card progression rework.
--
-- Three changes, all in one place because they share the same stat model:
--
--   1. A rank is now a flat multiplier across EVERY stat. The catalog stores a copy's
--      rank-1 base numbers; `card_atk/card_def` apply `rank_meta.stat_mult` (and the copy's
--      own stat level) instead of a per-rank atk_base.
--   2. A rank-up consumes DUPLICATE COPIES of the same catalog card rather than gold +
--      materials. Going rank N -> N+1 needs fodder worth 2^N rank-1 copies, where a rank-r
--      copy is worth 2^(r-1) — the exponential farming pressure. The copy's four stats
--      level independently instead, with gold + the card's tag Cores (the old currencies).
--   3. A quest clear has a per-quest chance to drop one of its enemies as a rank-1 card, so
--      a quest is a deterministic farm spot for a specific card.
--
-- All balance numbers mirror src/game/formulas.ts. Change one, change both.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

alter table public.rank_meta
  add column if not exists stat_mult numeric(6, 3) not null default 1 check (stat_mult > 0);

comment on column public.rank_meta.stat_mult is
  'Flat multiplier applied to every base stat of a copy at this rank (RANK_META.statMult).';

-- The dormant shared `level` becomes four independent stat levels, one per stat. The old
-- column is dropped AFTER the SQL functions that read it (party_power) are dropped, because a
-- SQL function body records a dependency on the columns it names.
alter table public.player_cards
  add column if not exists atk_level smallint not null default 1 check (atk_level >= 1),
  add column if not exists hp_level smallint not null default 1 check (hp_level >= 1),
  add column if not exists def_level smallint not null default 1 check (def_level >= 1),
  add column if not exists spd_level smallint not null default 1 check (spd_level >= 1);

-- Per-quest chance a clear drops one of its enemies as a card (QUEST_CARD_DROP_CHANCE).
alter table public.quests
  add column if not exists card_drop_chance numeric(4, 3) not null default 0.5
    check (card_drop_chance between 0 and 1);

-- ---------------------------------------------------------------------------
-- Derived stats (mirror src/game/formulas.ts)
-- ---------------------------------------------------------------------------

-- The Core grade a copy of this rank spends on a stat level. Mirrors coreVariantForRank().
create or replace function public.core_variant_for_rank(p_rank smallint)
returns text
language sql
immutable
as $$
  select case
    when p_rank <= 1 then 'lesser'
    when p_rank = 2 then 'greater'
    when p_rank = 3 then 'mythic'
    else 'legendary'
  end;
$$;

-- Old signatures are replaced, not overloaded: the catalog no longer owns per-rank bases.
-- Dropped in reverse dependency order (card_power -> card_def -> card_atk, and party_power
-- sits on top of card_power) so no DROP trips over a dependent SQL function.
drop function if exists public.party_power(uuid);
drop function if exists public.card_power(smallint, integer);
drop function if exists public.card_def(smallint, integer);
drop function if exists public.card_atk(smallint, integer);

-- Safe now that no SQL function references it; plpgsql bodies (start_run, provisioning) do
-- not record column dependencies and are replaced below.
alter table public.player_cards drop column if exists level;

create or replace function public.card_atk(p_base_atk integer, p_rank smallint, p_atk_level integer)
returns integer
language sql
immutable
as $$
  select round(
    p_base_atk
    * (select m.stat_mult from public.rank_meta m where m.rank = p_rank)
    * (1 + (select m.atk_growth from public.rank_meta m where m.rank = p_rank)
      * (greatest(p_atk_level, 1) - 1))
  )::integer;
$$;

create or replace function public.card_def(p_base_def integer, p_rank smallint, p_def_level integer)
returns integer
language sql
immutable
as $$
  select round(
    p_base_def
    * (select m.stat_mult from public.rank_meta m where m.rank = p_rank)
    * (1 + (select m.atk_growth from public.rank_meta m where m.rank = p_rank)
      * (greatest(p_def_level, 1) - 1))
  )::integer;
$$;

create or replace function public.card_power(
  p_base_atk integer,
  p_base_def integer,
  p_rank smallint,
  p_atk_level integer,
  p_def_level integer
)
returns integer
language sql
stable
as $$
  -- The rank is already inside atk/def, so power is their plain sum.
  select public.card_atk(p_base_atk, p_rank, p_atk_level)
       + public.card_def(p_base_def, p_rank, p_def_level);
$$;

-- Security invoker on purpose: RLS means a caller can only ever score their own party.
create or replace function public.party_power(p_party_id uuid)
returns integer
language sql
stable
as $$
  select coalesce(sum(
    public.card_power(c.base_atk, c.base_def, pc.rank, pc.atk_level, pc.def_level)
  ), 0)::integer
  from public.party_slots ps
  join public.player_cards pc on pc.id = ps.player_card_id
  join public.cards c on c.id = pc.card_id
  where ps.party_id = p_party_id;
$$;

grant execute on function public.core_variant_for_rank(smallint) to anon, authenticated;
grant execute on function public.card_atk(integer, smallint, integer) to anon, authenticated;
grant execute on function public.card_def(integer, smallint, integer) to anon, authenticated;
grant execute on function public.card_power(integer, integer, smallint, integer, integer) to anon, authenticated;
grant execute on function public.party_power(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Provisioning: the starter insert must not name the dropped `level` column
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
    -- The starter copies are rank 1 (stat levels default to 1): a catalog row carries no rank
    -- of its own, so the first cards in catalog order are as good as any.
    insert into public.player_cards (profile_id, card_id, rank)
    select p_profile_id, c.id, 1
    from public.cards c
    order by c.sort_order, c.id
    limit 5;

    -- One of them is the guaranteed 3★ starter — the same first-in-catalog copy, so the guide
    -- always has a known strong body to lead the first party. Catalog content is empty during
    -- the migration that creates the dev account, so this is a no-op there and lands for real
    -- signups (which run after the importers).
    update public.player_cards
    set rank = 3
    where id = (
      select pc.id
      from public.player_cards pc
      join public.cards c on c.id = pc.card_id
      where pc.profile_id = p_profile_id
      order by c.sort_order, c.id
      limit 1
    );
  end if;

  if exists (select 1 from public.chests where id = 'rare')
    and not exists (
      select 1 from public.chest_inventory
      where profile_id = p_profile_id and source = 'starter'
    )
  then
    insert into public.chest_inventory (profile_id, chest_id, source)
    values (p_profile_id, 'rare', 'starter');
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

revoke all on function public.provision_starter_loadout(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Runs: power now reads base × rank × stat level
-- ---------------------------------------------------------------------------

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
  match_count integer;
  affinity numeric;
  result public.dungeon_runs;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform public.resolve_runs();
  select * into profile from public.profiles where id = auth.uid() for update;
  select * into dungeon from public.dungeons where id = p_dungeon_id;
  if not found then raise exception 'dungeon not found'; end if;

  if dungeon.is_tutorial then
    if exists (
      select 1 from public.dungeon_runs
      where profile_id = auth.uid() and dungeon_id = dungeon.id
    ) then
      raise exception 'tutorial already completed';
    end if;
  end if;

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

  if exists (
    select 1 from public.dungeon_runs
    where party_id = party.id and resolved_at is null
  ) then
    raise exception 'that party is already on a run';
  end if;

  select count(*),
    coalesce(sum(public.card_power(c.base_atk, c.base_def, pc.rank, pc.atk_level, pc.def_level)), 0)::integer,
    coalesce(sum(case when c.tags && dungeon.tags then 1 else 0 end), 0)::integer
  into card_count, power, match_count
  from public.party_slots ps
    join public.player_cards pc on pc.id = ps.player_card_id
    join public.cards c on c.id = pc.card_id
  where ps.party_id = party.id;
  if card_count = 0 then raise exception 'party has no cards'; end if;

  if coalesce(array_length(dungeon.tags, 1), 0) = 0 then
    affinity := 1;
  else
    affinity := 0.85 + (1.15 - 0.85) * (match_count::numeric / card_count);
  end if;

  if (select count(*) from public.dungeon_runs where profile_id = auth.uid() and resolved_at is null) >= profile.run_slots
    then raise exception 'all run slots are busy'; end if;

  insert into public.dungeon_runs (profile_id, dungeon_id, party_id, power_snapshot, affinity_mult, ends_at)
  values (auth.uid(), dungeon.id, party.id, power, affinity, now() + make_interval(secs => dungeon.duration_seconds))
  returning * into result;
  return result;
end;
$$;

grant execute on function public.start_run(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Rank-up: consume duplicate copies of the same card
-- ---------------------------------------------------------------------------

-- A rank-up is a SPEND, so it is one server-side step: lock the target copy, pick or
-- validate the fodder, then delete the fodder and bump the rank. The client only names the
-- copy and the fodder ids — never a cost. An empty fodder list makes the server pick the
-- cheapest covering set (lowest ranks first), so a one-tap rank-up is safe.
drop function if exists public.rank_up_card(uuid);
create or replace function public.rank_up_card(
  p_player_card_id uuid,
  p_fodder_ids uuid[] default '{}'::uuid[]
)
returns public.player_cards
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.player_cards;
  required_value integer;
  selected uuid[] := '{}'::uuid[];
  fodder public.player_cards;
  fid uuid;
  supplied integer := 0;
  distinct_count integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select * into target
  from public.player_cards
  where id = p_player_card_id and profile_id = auth.uid()
  for update;
  if not found then raise exception 'card not found'; end if;
  if target.rank >= 5 then raise exception 'this card is already at the maximum rank'; end if;

  -- Rank N -> N+1 costs 2^N base copies; a rank-r fodder copy is worth 2^(r-1).
  required_value := 1 << target.rank;

  if coalesce(array_length(p_fodder_ids, 1), 0) = 0 then
    -- Prefer a single copy that already covers the step (the smallest such), mirroring
    -- selectRankUpFodder() in src/game/formulas.ts.
    select * into fodder
    from public.player_cards pc
    where pc.profile_id = auth.uid()
      and pc.card_id = target.card_id
      and pc.id <> target.id
      and not pc.locked
      and not exists (select 1 from public.party_slots ps where ps.player_card_id = pc.id)
      and (1 << (pc.rank - 1)) >= required_value
    order by pc.rank, pc.obtained_at
    limit 1;

    if found then
      selected := array[fodder.id];
    else
      for fodder in
        select * from public.player_cards pc
        where pc.profile_id = auth.uid()
          and pc.card_id = target.card_id
          and pc.id <> target.id
          and not pc.locked
          and not exists (select 1 from public.party_slots ps where ps.player_card_id = pc.id)
        order by pc.rank, pc.obtained_at
      loop
        selected := selected || fodder.id;
        supplied := supplied + (1 << (fodder.rank - 1));
        exit when supplied >= required_value;
      end loop;
    end if;
  else
    selected := p_fodder_ids;
  end if;

  -- Guard the explicit path: an id counted twice would delete once but value twice.
  select count(distinct x) into distinct_count from unnest(selected) as x;
  if distinct_count <> coalesce(array_length(selected, 1), 0) then
    raise exception 'duplicate fodder';
  end if;

  supplied := 0;
  foreach fid in array selected loop
    if fid = target.id then raise exception 'a card cannot consume itself'; end if;

    select * into fodder
    from public.player_cards
    where id = fid and profile_id = auth.uid()
    for update;
    if not found then raise exception 'fodder card not found'; end if;
    if fodder.card_id <> target.card_id then raise exception 'fodder must be the same card'; end if;
    if fodder.locked then raise exception 'a locked card cannot be used as fodder'; end if;
    if exists (select 1 from public.party_slots ps where ps.player_card_id = fid) then
      raise exception 'a card in a party cannot be used as fodder';
    end if;

    supplied := supplied + (1 << (fodder.rank - 1));
  end loop;

  if supplied < required_value then raise exception 'not enough duplicate cards'; end if;

  delete from public.player_cards where id = any(selected) and profile_id = auth.uid();

  update public.player_cards
  set rank = target.rank + 1
  where id = target.id
  returning * into target;

  return target;
end;
$$;

grant execute on function public.rank_up_card(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Stat levelling: the gold + Core sink
-- ---------------------------------------------------------------------------

-- One stat of one copy, one level: a fixed gold price for the target level plus ONE Core per
-- tag the card carries, graded by the copy's current rank. Deterministic, so the detail
-- screen can preview it exactly and the server re-reads it inside the transaction.
create or replace function public.level_up_stat(p_player_card_id uuid, p_stat text)
returns public.player_cards
language plpgsql
security definer
set search_path = public
as $$
declare
  card_row public.player_cards;
  current_level smallint;
  cap smallint;
  gold_cost integer;
  core_id text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_stat is null or p_stat not in ('atk', 'hp', 'def', 'spd') then
    raise exception 'unknown stat';
  end if;

  select * into card_row
  from public.player_cards
  where id = p_player_card_id and profile_id = auth.uid()
  for update;
  if not found then raise exception 'card not found'; end if;

  select level_cap into cap from public.rank_meta where rank = card_row.rank;
  current_level := case p_stat
    when 'atk' then card_row.atk_level
    when 'hp' then card_row.hp_level
    when 'def' then card_row.def_level
    else card_row.spd_level
  end;
  if current_level >= cap then raise exception 'this stat is at its rank cap'; end if;

  select round(m.levelup_gold_base * power((current_level + 1)::numeric, m.levelup_gold_exp))::integer
  into gold_cost
  from public.rank_meta m where m.rank = card_row.rank;

  -- Guarded spend, exactly like rank_up_card's old material spend: `not found` means the
  -- balance never covered the price and rolls everything back.
  update public.profiles
  set gold = gold - gold_cost
  where id = auth.uid() and gold >= gold_cost;
  if not found then raise exception 'not enough gold'; end if;

  -- One Core per tag the card carries, at the grade of its current rank, when that material
  -- exists (a bestiary tag outside CORE_TAGS simply costs no Core).
  for core_id in
    select core
    from (
      select public.core_variant_for_rank(card_row.rank) || '_' || lower(t) || '_core' as core
      from public.cards c, unnest(c.tags) as t
      where c.id = card_row.card_id
    ) candidates
    where exists (select 1 from public.materials m where m.id = candidates.core)
  loop
    update public.player_materials
    set qty = qty - 1
    where profile_id = auth.uid() and material_id = core_id and qty >= 1;
    if not found then raise exception 'not enough %', core_id; end if;
  end loop;

  update public.player_cards
  set atk_level = atk_level + case when p_stat = 'atk' then 1 else 0 end,
      hp_level  = hp_level  + case when p_stat = 'hp'  then 1 else 0 end,
      def_level = def_level + case when p_stat = 'def' then 1 else 0 end,
      spd_level = spd_level + case when p_stat = 'spd' then 1 else 0 end
  where id = card_row.id
  returning * into card_row;

  return card_row;
end;
$$;

grant execute on function public.level_up_stat(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Quests: a chance to drop one of the enemies as a card
-- ---------------------------------------------------------------------------

create or replace function public.complete_quest(p_quest_id text, p_party_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  quest public.quests;
  party public.parties;
  card_count integer;
  first_clear boolean;
  reward_gold integer;
  reward_materials jsonb := '{}'::jsonb;
  entry record;
  total_clears integer;
  drop_card_id text;
  drop_player_card_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select * into quest from public.quests where id = p_quest_id;
  if not found then raise exception 'quest not found'; end if;

  select * into party from public.parties where id = p_party_id and profile_id = auth.uid();
  if not found then raise exception 'party not found'; end if;

  select count(*) into card_count from public.party_slots where party_id = party.id;
  if card_count = 0 then raise exception 'party has no cards'; end if;

  first_clear := not exists (
    select 1 from public.quest_completions
    where profile_id = auth.uid() and quest_id = quest.id
  );

  reward_gold := quest.gold + (case when first_clear then quest.first_clear_gold else 0 end);

  update public.profiles set gold = gold + reward_gold where id = auth.uid();

  for entry in
    select key as material_id, (value)::integer as qty from jsonb_each_text(quest.materials)
  loop
    reward_materials := jsonb_set(
      reward_materials,
      array[entry.material_id],
      to_jsonb(coalesce((reward_materials ->> entry.material_id)::integer, 0) + entry.qty),
      true
    );
    insert into public.player_materials (profile_id, material_id, qty)
    values (auth.uid(), entry.material_id, entry.qty)
    on conflict (profile_id, material_id) do update
      set qty = public.player_materials.qty + excluded.qty;
  end loop;

  if first_clear then
    for entry in
      select key as material_id, (value)::integer as qty from jsonb_each_text(quest.first_clear_materials)
    loop
      reward_materials := jsonb_set(
        reward_materials,
        array[entry.material_id],
        to_jsonb(coalesce((reward_materials ->> entry.material_id)::integer, 0) + entry.qty),
        true
      );
      insert into public.player_materials (profile_id, material_id, qty)
      values (auth.uid(), entry.material_id, entry.qty)
      on conflict (profile_id, material_id) do update
        set qty = public.player_materials.qty + excluded.qty;
    end loop;
  end if;

  -- The card drop: a server roll (the client never sees RNG), one uniformly random enemy
  -- that is a real catalog card, granted as a fresh rank-1 copy. This is what turns a quest
  -- into a deterministic farm route for a specific card.
  if random() < quest.card_drop_chance then
    select enemy ->> 'cardId' into drop_card_id
    from jsonb_array_elements(quest.enemies) as enemy
    where enemy ->> 'cardId' is not null
      and exists (select 1 from public.cards c where c.id = (enemy ->> 'cardId'))
    order by random()
    limit 1;

    if drop_card_id is not null then
      insert into public.player_cards (profile_id, card_id, rank)
      values (auth.uid(), drop_card_id, 1)
      returning id into drop_player_card_id;
    end if;
  end if;

  insert into public.quest_completions (profile_id, quest_id, clears, first_cleared_at, last_cleared_at)
  values (auth.uid(), quest.id, 1, now(), now())
  on conflict (profile_id, quest_id) do update
    set clears = public.quest_completions.clears + 1,
        last_cleared_at = now()
  returning clears into total_clears;

  perform private.log_telemetry_event(auth.uid(), 'quest_cleared', jsonb_build_object(
    'quest_id', quest.id,
    'first_clear', first_clear,
    'gold', reward_gold,
    'card_reward', drop_card_id
  ));

  return jsonb_build_object(
    'quest_id', quest.id,
    'first_clear', first_clear,
    'clears', total_clears,
    'rewards', jsonb_build_object('gold', reward_gold, 'materials', reward_materials),
    'card', case
      when drop_player_card_id is null then null
      else jsonb_build_object('card_id', drop_card_id, 'player_card_id', drop_player_card_id)
    end
  );
end;
$$;

grant execute on function public.complete_quest(text, uuid) to authenticated;
