-- Marketplace: a gem sink that sells chests, and the ledger of what was bought.
--
-- Same trust split as every other spend: the client names *which* chest and *how many*,
-- never the price. `buy_chest` re-reads `chests.gem_price` (seeded from CHEST_GEM_PRICES in
-- src/game/formulas.ts) inside the transaction, takes the gems behind a guarded update and
-- only then inserts the chests and the transaction row. The ledger is SELECT-only to the
-- client, so a row can only appear through the function.

-- ---------------------------------------------------------------------------
-- Chest price: catalog data, like `tier` and `source`, seeded by build-seed.mjs.
-- ---------------------------------------------------------------------------

alter table public.chests
  add column gem_price integer not null default 0 check (gem_price >= 0);

comment on column public.chests.gem_price is
  'Gems the marketplace charges per chest; mirrors CHEST_GEM_PRICES in src/game/formulas.ts. 0 means not for sale.';

-- ---------------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------------

create table public.market_transactions (
  id bigserial primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  chest_id text not null references public.chests (id),
  qty integer not null check (qty >= 1),
  -- Price captured at purchase time, so a later balance change cannot rewrite history.
  unit_price integer not null check (unit_price >= 0),
  total_gems integer not null check (total_gems >= 0),
  created_at timestamptz not null default now()
);

create index market_transactions_profile_idx
  on public.market_transactions (profile_id, created_at desc);

-- ---------------------------------------------------------------------------
-- The one write path
-- ---------------------------------------------------------------------------

-- `p_qty` is bounded like open_chests, and the price comes from the catalog, never the
-- caller. A short balance raises and rolls back the chests, the ledger row and the spend.
create or replace function public.buy_chest(p_chest_id text, p_qty integer default 1)
returns public.market_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  unit integer;
  total integer;
  tx public.market_transactions;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 10 then
    raise exception 'purchase quantity must be between 1 and 10';
  end if;

  select gem_price into unit from public.chests where id = p_chest_id;
  if not found then raise exception 'unknown chest'; end if;
  if unit <= 0 then raise exception 'chest is not for sale'; end if;

  total := unit * p_qty;

  -- Guarded spend, exactly like rush_run: `not found` means the balance never covered the
  -- purchase, and the exception rolls back everything below.
  update public.profiles
  set gems = gems - total
  where id = auth.uid() and gems >= total;
  if not found then raise exception 'not enough gems'; end if;

  insert into public.chest_inventory (profile_id, chest_id, source)
  select auth.uid(), p_chest_id, 'marketplace'
  from generate_series(1, p_qty);

  insert into public.market_transactions (profile_id, chest_id, qty, unit_price, total_gems)
  values (auth.uid(), p_chest_id, p_qty, unit, total)
  returning * into tx;

  -- Server-source telemetry: the purchase is a progression event the client cannot name.
  perform private.log_telemetry_event(auth.uid(), 'chest_purchased', jsonb_build_object(
    'chest_id', p_chest_id,
    'qty', p_qty,
    'unit_price', unit,
    'total_gems', total
  ));

  return tx;
end;
$$;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

alter table public.market_transactions enable row level security;

-- Read-only, own rows only: there is no INSERT/UPDATE/DELETE policy, so `buy_chest` is the
-- only way a transaction row can appear.
create policy market_transactions_select_own on public.market_transactions
  for select to authenticated using (profile_id = auth.uid());

grant select on public.market_transactions to authenticated;
grant execute on function public.buy_chest(text, integer) to authenticated;
