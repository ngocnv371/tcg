-- A dungeon now has a RANK and TAGS, and both drive what it pays:
--   * `tags`  — one Core family each; the drops are generated from them at import time.
--   * `rank`  — picks the Core grade (1..4 = lesser/greater/mythic/legendary, 5 = legendary).
-- That makes a dungeon a known farm spot: "Collapsed Shelves drops Mythic Fire Cores" is a
-- plan a player can act on instead of a lottery.
--
-- Sending a party no longer gambles on a win/lose roll. A run ALWAYS clears; party power
-- only scales how much of the listed payout comes home (the yield multiplier). Failure was
-- a dead click after a timer and the pity gold that patched it is gone with it.

alter table public.dungeons
  add column if not exists rank smallint not null default 1 check (rank between 1 and 5),
  add column if not exists tags text[] not null default '{}';

comment on column public.dungeons.rank is
  'Core grade this dungeon yields; mirrors coreVariantForRank() in src/game/formulas.ts.';
comment on column public.dungeons.tags is
  'Core families this dungeon farms. Regenerate `materials` from these with npm run import:dungeons.';

-- `materials` stays the authoritative drop table the server rolls: the importer derives it
-- from tags + rank, so the two can never drift in the app. Rows imported before this
-- migration still carry ore/crystal/essence ids until the dungeon importer is re-run.

create or replace function public.resolve_runs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  run public.dungeon_runs;
  dungeon public.dungeons;
  -- The yield multiplier is the only thing party power decides now. Mirrors
  -- REWARD_MULT_MIN / REWARD_MULT_MAX in src/game/formulas.ts.
  mult numeric;
  reward_gold integer;
  reward_materials jsonb;
  resolved_count integer := 0;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  for run in
    select * from public.dungeon_runs
    where profile_id = auth.uid() and resolved_at is null and ends_at <= now()
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

  -- Every run clears now, so there is no `if run.success` branch left to fall through: a
  -- claim always pays its gold and its whole drop table.
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
