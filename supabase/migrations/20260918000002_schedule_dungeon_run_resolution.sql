create extension if not exists pg_cron;

create schema if not exists private;
revoke all on schema private from public;

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
      update public.dungeon_runs set resolved_at = now(), success = false,
        rewards = jsonb_build_object('gold', 0, 'materials', jsonb_build_array()) where id = run.id;
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

select cron.unschedule(jobid)
from cron.job
where jobname = 'resolve-dungeon-runs';

select cron.schedule(
  'resolve-dungeon-runs',
  '5 seconds',
  $$select private.resolve_due_runs()$$
);