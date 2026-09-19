-- Multiple copies of the same card.
--
-- player_cards has always been able to hold several rows per card_id (surrogate uuid
-- primary key, and rank/level live on the row), and the party picker already lists one
-- entry per row. But open_chest only ever inserted a copy the FIRST time a card dropped;
-- every later pull paid shards instead. The library could therefore never show more than
-- one instance of a card, and "each copy has its own rank" was unreachable.
--
-- A duplicate pull now also grants a copy. The copy is the unit of progression: it levels
-- and ranks independently, so one player can hold a 1★ and a 3★ of the same card.
--
-- The shard payout is deliberately KEPT, and no rank_meta number moves: shards are still
-- what card_rank_costs consumes for rank_up_card (weeks 4-8), so removing the dupe payout
-- would starve the rank-up path. Trading that payout away later is a balance decision —
-- change `dupeShards` in src/game/formulas.ts and re-run `npm run seed:build`, never a hand
-- edit of this file.
--
-- `was_new` keeps its name (pull_history.was_new, the reveal prop) but now means "first
-- copy of this card", which is exactly what the reveal caption needs to distinguish a new
-- card from a duplicate.

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

  select * into selected_card from public.cards where rank = selected_rank order by random() limit 1;
  if not found then raise exception 'chest rank has no cards'; end if;

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

grant execute on function public.open_chest(uuid) to authenticated;
