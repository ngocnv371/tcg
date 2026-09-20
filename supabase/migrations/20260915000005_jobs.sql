-- Time-driven plumbing: the realtime publication the client subscribes to, and the sweep
-- that resolves runs for players who are not online.
--
-- Both are guarded, because neither the publication nor pg_cron exists on a bare Postgres
-- — scripts/verify-db.sh applies every migration to one and only asserts the schema.

-- The dungeons screen watches its own runs, so a run that finishes while the app is open
-- repaints without a refresh.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'dungeon_runs'
     )
  then
    execute 'alter publication supabase_realtime add table public.dungeon_runs';
  else
    raise notice 'supabase_realtime publication not present or already covers dungeon_runs — skipping';
  end if;
end;
$$;

-- Offline progress. Run expiry is `started_at + duration` in Postgres, so nothing has to
-- tick the client: the sweep just asks `private.resolve_due_runs` for every profile, using
-- the same body the online path calls with a single profile id. That shared body is why a
-- run cannot resolve one way in the app and another way in the background.
--
-- Verified on the way in by scripts/verify-db.sh, which calls public.resolve_runs()
-- directly rather than waiting on the schedule.
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron unavailable — skipping the run-resolution schedule';
    return;
  end if;

  execute 'create extension if not exists pg_cron';

  execute $ddl$select cron.unschedule(jobid) from cron.job where jobname = 'resolve-dungeon-runs'$ddl$;

  execute $ddl$select cron.schedule(
    'resolve-dungeon-runs',
    '5 seconds',
    'select private.resolve_due_runs()'
  )$ddl$;
end;
$$;
