-- The chest-reveal animation needs the pulled card's art. open_chest already
-- denormalizes card_name into its jsonb payload; include art_path the same way
-- so the client never has to re-query the catalog mid-animation.

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
  existing_card public.player_cards;
  shard_material text;
  shard_qty integer;
  roll numeric := random() * 100;
  cursor numeric := 0;
  odds_row record;
  is_new boolean;
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

  select * into existing_card
  from public.player_cards
  where profile_id = auth.uid() and card_id = selected_card.id
  limit 1;
  is_new := not found;

  if is_new then
    insert into public.player_cards (profile_id, card_id, rank)
    values (auth.uid(), selected_card.id, selected_rank);
  else
    select dupe_shard_material, dupe_shard_qty into shard_material, shard_qty
    from public.rank_meta where rank = selected_rank;
    insert into public.player_materials (profile_id, material_id, qty)
    values (auth.uid(), shard_material, shard_qty)
    on conflict (profile_id, material_id) do update set qty = public.player_materials.qty + excluded.qty;
  end if;

  update public.chest_inventory set opened_at = now() where id = chest.id;
  insert into public.pull_history (profile_id, chest_id, card_id, rank, was_new)
  values (auth.uid(), chest.chest_id, selected_card.id, selected_rank, is_new);

  return jsonb_build_object(
    'card_id', selected_card.id,
    'card_name', selected_card.name,
    'art_path', selected_card.art_path,
    'rank', selected_rank,
    'was_new', is_new,
    'shard_material', shard_material,
    'shard_qty', coalesce(shard_qty, 0)
  );
end;
$$;
