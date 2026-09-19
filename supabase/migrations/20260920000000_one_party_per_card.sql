-- A player card is a single physical copy, so it can be equipped in at most one party.
--
-- `unique (party_id, player_card_id)` only stopped duplicates *inside* one party, which let
-- the same copy sit in every party at once and multiply the power a player could field.
-- A unique key on `player_card_id` alone closes that, and it subsumes the composite one
-- (a card can appear at most once overall, so certainly at most once per party).

alter table public.party_slots drop constraint if exists party_slots_party_id_player_card_id_key;
alter table public.party_slots
  add constraint party_slots_player_card_id_key unique (player_card_id);

-- Mirrors the constraint with a readable error, so the client gets "a card can only be in
-- one party" instead of a raw unique-violation. Same body as init.sql plus that one check.
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
