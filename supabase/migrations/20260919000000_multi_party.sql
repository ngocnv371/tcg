-- Teams stop being a fixed set of three slots and become an open-ended list the
-- player builds. `slot_index` survives only as the stable display order, so the
-- per-profile uniqueness (and the 1..3 cap) no longer hold.
--
-- Creation, renaming and deletion are mutations, so they live in SECURITY DEFINER
-- functions: RLS on `parties`/`party_slots` stays SELECT-only.

alter table public.parties drop constraint if exists parties_slot_index_check;
alter table public.parties
  add constraint parties_slot_index_positive check (slot_index >= 1);

alter table public.parties drop constraint if exists parties_profile_id_slot_index_key;

-- ---------------------------------------------------------------------------
-- create_party / rename_party / delete_party
-- ---------------------------------------------------------------------------

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

  -- Names are cosmetic and unique per profile; index is just append order.
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

grant execute on function public.create_party(text) to authenticated;
grant execute on function public.rename_party(uuid, text) to authenticated;
grant execute on function public.delete_party(uuid) to authenticated;
