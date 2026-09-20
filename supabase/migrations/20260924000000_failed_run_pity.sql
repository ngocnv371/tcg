-- A failed run pays pity gold instead of nothing.
--
-- Two things had to move together: the resolver wrote `gold: 0` into a failed run's
-- rewards, and `claim_run` only credited gold inside its `if run.success` branch. So even
-- a non-zero failure payout would have been discarded at claim time.
--
-- The amount mirrors FAILED_RUN_PITY_GOLD in src/game/formulas.ts — change both together.
--
-- SUPERSEDED by 20260930000000_core_dungeons.sql: a run never fails any more, so the pity
-- gold and FAILED_RUN_PITY_GOLD itself are gone. Kept as history; its resolve_runs and
-- claim_run definitions are overridden by the later migration.
--
-- `private.resolve_due_runs` is normally created by 20260918000002_schedule_dungeon_run_resolution.sql
-- alongside the pg_cron job; the schema is created here too so this migration stands alone in
-- environments without pg_cron (scripts/verify-db.sh).

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.resolve_due_runs(p_profile_id uuid default null)
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
  for run in
    select *
    from public.dungeon_runs
    where resolved_at is null
      and ends_at <= now()
      and (p_profile_id is null or profile_id = p_profile_id)
    for update
  loop
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
      -- Pity pay: 1 gold, no materials, no chest.
      update public.dungeon_runs set resolved_at = now(), success = false,
        rewards = jsonb_build_object('gold', 1, 'materials', jsonb_build_array()) where id = run.id;
    end if;
    resolved_count := resolved_count + 1;
  end loop;
  return resolved_count;
end;
$$;

revoke all on function private.resolve_due_runs(uuid) from public, anon, authenticated;

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

-- Payout is now whatever `rewards` says, for both outcomes. Materials and the chest only
-- ever appear on a clear, so the success guard had nothing left to protect.
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

  update public.dungeon_runs set claimed_at = now() where id = run.id;
  return jsonb_build_object('success', run.success, 'rewards', run.rewards);
end;
$$;
