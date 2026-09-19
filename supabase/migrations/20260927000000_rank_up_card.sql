-- Rank-up is a SPEND, so it has to be one server-side step: read the ladder for the
-- card's CURRENT rank, take the gold and the materials, then bump the rank. Two
-- concurrent clicks can't double-spend because the player_cards row is locked first
-- and the cost is re-read inside the same transaction. The client never sends a cost;
-- it only names the copy to upgrade, and `card_rank_costs` (public catalog) is what
-- both the detail screen and this function read for the requirements.

create or replace function public.rank_up_card(p_player_card_id uuid)
returns public.player_cards
language plpgsql
security definer
set search_path = public
as $$
declare
  card_row public.player_cards;
  cost public.card_rank_costs;
  material record;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select * into card_row
  from public.player_cards
  where id = p_player_card_id and profile_id = auth.uid()
  for update;
  if not found then raise exception 'card not found'; end if;

  select * into cost
  from public.card_rank_costs
  where card_id = card_row.card_id and from_rank = card_row.rank;
  if not found then raise exception 'this card cannot rank up further'; end if;

  -- Guarded update: `not found` means the balance never covered the cost, and the
  -- exception rolls back anything already spent in this call.
  update public.profiles
  set gold = gold - cost.gold
  where id = auth.uid() and gold >= cost.gold;
  if not found then raise exception 'not enough gold'; end if;

  for material in
    select key as material_id, (value)::integer as qty from jsonb_each_text(cost.materials)
  loop
    update public.player_materials
    set qty = qty - material.qty
    where profile_id = auth.uid()
      and material_id = material.material_id
      and qty >= material.qty;
    if not found then
      raise exception 'not enough %', material.material_id;
    end if;
  end loop;

  update public.player_cards
  set rank = cost.to_rank
  where id = card_row.id
  returning * into card_row;

  return card_row;
end;
$$;

grant execute on function public.rank_up_card(uuid) to authenticated;
