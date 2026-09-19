-- A finished run has to be collected before the next party can be sent out.
--
-- Without this, a player can keep a queue of resolved-but-unclaimed runs and never open the
-- claim flow, which makes rewards effectively unbounded to ignore. Gating new runs on the
-- claim closes it, and mirrors the client-side "claim first" notice on the dungeons screen.

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
  select * into profile from public.profiles where id = auth.uid() for update;
  select * into dungeon from public.dungeons where id = p_dungeon_id;
  if not found then raise exception 'dungeon not found'; end if;

  -- Checked before the party is picked, so the gate is account-wide rather than per-lineup.
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

  -- Mirrors the client-side "Running" badge with a readable error.
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
$$
