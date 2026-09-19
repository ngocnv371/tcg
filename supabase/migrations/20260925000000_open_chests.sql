-- The vault stacks duplicates by chest type, so opening has to be able to burn
-- several chests in one click. Each chest still rolls through open_chest (odds,
-- insert, shard conversion and pull_history all stay server-side); this function
-- only picks which unopened rows to spend, oldest first, and returns the reveals.

create or replace function public.open_chests(p_chest_id text, p_qty integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  available integer;
  target record;
  openings jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 10 then
    raise exception 'open quantity must be between 1 and 10';
  end if;

  select count(*) into available
  from public.chest_inventory
  where profile_id = auth.uid() and chest_id = p_chest_id and opened_at is null;
  if available < p_qty then
    raise exception 'not enough unopened % chests', p_chest_id;
  end if;

  -- Lock the picked rows before rolling so two concurrent calls can't open the same chest.
  for target in
    select id
    from public.chest_inventory
    where profile_id = auth.uid() and chest_id = p_chest_id and opened_at is null
    order by granted_at, id
    limit p_qty
    for update
  loop
    openings := openings || jsonb_build_array(public.open_chest(target.id));
  end loop;

  return openings;
end;
$$;

grant execute on function public.open_chests(text, integer) to authenticated;
