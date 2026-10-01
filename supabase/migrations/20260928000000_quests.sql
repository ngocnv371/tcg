-- Quests: story encounters with a manual, turn-based fight — deliberately NOT a dungeon.
--
-- A dungeon is idle: the client sends a party, waits, and the server pays on a timer. A quest
-- is played: the player picks a party, answers a question on each of their cards' turns (a
-- right answer is a hit, a wrong one a miss) and the fight is over in one sitting. So there is
-- no timer and no run row to resolve here.
--
-- Trust split, same as the rest of the schema: the fight is simulated on the client (it has no
-- RNG — turn order is SPD, and the only input is which quiz option the player tapped), and the
-- SERVER owns the reward. `complete_quest` re-reads the reward from `quests` and is the only
-- thing that can move gold or materials, so a hand-rolled client cannot invent a payout — it
-- can only claim a clear it did not earn, which in a learning game is the same as answering
-- correctly. Losses are never reported: the client only calls this after it won.

-- ---------------------------------------------------------------------------
-- SPD: the quest turn-order stat
-- ---------------------------------------------------------------------------

-- Baseline 10 (CARD_SPEED_BASE): a card with 20 acts twice as often. Stored on the card row
-- so the server never derives it; `scripts/assets-import.mjs` stamps it from the id.
alter table public.cards
  add column if not exists speed smallint not null default 10 check (speed between 1 and 40);

-- ---------------------------------------------------------------------------
-- Catalog: the authored encounters
-- ---------------------------------------------------------------------------

create table if not exists public.quests (
  id text primary key,
  name text not null,
  sort_order integer not null default 0,
  -- Advisory "recommended power" for the card; the server does not gate a clear on it.
  req_power integer not null default 0 check (req_power >= 0),
  -- [{ "id", "name", "icon", "hp", "atk", "def", "spd" }, ...] — 1..5 members, authored in
  -- src/game/quests.ts and written by the quest importer (they are catalog content, not seeded).
  enemies jsonb not null
    check (jsonb_typeof(enemies) = 'array' and jsonb_array_length(enemies) between 1 and 5),
  -- Repeating reward, paid every clear.
  gold integer not null default 0 check (gold >= 0),
  materials jsonb not null default '{}'::jsonb,
  -- One-time bonus, paid only on the first clear.
  first_clear_gold integer not null default 0 check (first_clear_gold >= 0),
  first_clear_materials jsonb not null default '{}'::jsonb,
  -- Visual-novel beats: [{ "speaker", "avatar", "text" }, ...].
  intro jsonb not null default '[]'::jsonb,
  outro jsonb not null default '[]'::jsonb
);

comment on table public.quests is
  'Authored quest encounters, imported from src/game/quests.ts by the quest importer.';

-- ---------------------------------------------------------------------------
-- Player state: how often a quest has been cleared
-- ---------------------------------------------------------------------------

-- One row per (player, quest) once cleared at least once. `first_cleared_at` is written once
-- and never overwritten, which is what makes the first-clear bonus un-farmable.
create table if not exists public.quest_completions (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  quest_id text not null references public.quests (id) on delete cascade,
  clears integer not null default 0 check (clears >= 0),
  first_cleared_at timestamptz,
  last_cleared_at timestamptz not null default now(),
  primary key (profile_id, quest_id)
);

create index if not exists quest_completions_profile_idx on public.quest_completions (profile_id);

-- ---------------------------------------------------------------------------
-- The one mutation: pay a clear
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER, like every other progression write. The client names the quest and the
-- party it fought with — never a reward — and this function re-reads `quests` for the payout,
-- checks the party is really the caller's and non-empty, then merges the base reward with the
-- first-clear bonus in one pass. `clears` is bumped so the card can show "Cleared ×N".
create or replace function public.complete_quest(p_quest_id text, p_party_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  quest public.quests;
  party public.parties;
  card_count integer;
  first_clear boolean;
  reward_gold integer;
  reward_materials jsonb := '{}'::jsonb;
  entry record;
  total_clears integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select * into quest from public.quests where id = p_quest_id;
  if not found then raise exception 'quest not found'; end if;

  select * into party from public.parties where id = p_party_id and profile_id = auth.uid();
  if not found then raise exception 'party not found'; end if;

  select count(*) into card_count from public.party_slots where party_id = party.id;
  if card_count = 0 then raise exception 'party has no cards'; end if;

  first_clear := not exists (
    select 1 from public.quest_completions
    where profile_id = auth.uid() and quest_id = quest.id
  );

  reward_gold := quest.gold + (case when first_clear then quest.first_clear_gold else 0 end);

  update public.profiles set gold = gold + reward_gold where id = auth.uid();

  -- Pay the base reward, then the one-time bonus, accumulating the total for the response.
  -- Two plain loops keep the merge obvious and the objects small (base + bonus only).
  for entry in
    select key as material_id, (value)::integer as qty from jsonb_each_text(quest.materials)
  loop
    reward_materials := jsonb_set(
      reward_materials,
      array[entry.material_id],
      to_jsonb(coalesce((reward_materials ->> entry.material_id)::integer, 0) + entry.qty),
      true
    );
    insert into public.player_materials (profile_id, material_id, qty)
    values (auth.uid(), entry.material_id, entry.qty)
    on conflict (profile_id, material_id) do update
      set qty = public.player_materials.qty + excluded.qty;
  end loop;

  if first_clear then
    for entry in
      select key as material_id, (value)::integer as qty from jsonb_each_text(quest.first_clear_materials)
    loop
      reward_materials := jsonb_set(
        reward_materials,
        array[entry.material_id],
        to_jsonb(coalesce((reward_materials ->> entry.material_id)::integer, 0) + entry.qty),
        true
      );
      insert into public.player_materials (profile_id, material_id, qty)
      values (auth.uid(), entry.material_id, entry.qty)
      on conflict (profile_id, material_id) do update
        set qty = public.player_materials.qty + excluded.qty;
    end loop;
  end if;

  -- Upsert, keeping `first_cleared_at` from the insert: the conflict branch touches only the
  -- clear count and the last-clear stamp, so the bonus can never be paid twice.
  insert into public.quest_completions (profile_id, quest_id, clears, first_cleared_at, last_cleared_at)
  values (auth.uid(), quest.id, 1, now(), now())
  on conflict (profile_id, quest_id) do update
    set clears = public.quest_completions.clears + 1,
        last_cleared_at = now()
  returning clears into total_clears;

  -- Server-source telemetry: the clear is a progression event the client cannot name.
  perform private.log_telemetry_event(auth.uid(), 'quest_cleared', jsonb_build_object(
    'quest_id', quest.id,
    'first_clear', first_clear,
    'gold', reward_gold
  ));

  return jsonb_build_object(
    'quest_id', quest.id,
    'first_clear', first_clear,
    'clears', total_clears,
    'rewards', jsonb_build_object('gold', reward_gold, 'materials', reward_materials)
  );
end;
$$;

grant execute on function public.complete_quest(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

alter table public.quests enable row level security;
alter table public.quest_completions enable row level security;

-- Catalog: readable by anyone, like every other seeded content table.
create policy catalog_quests_read on public.quests for select to anon, authenticated using (true);

-- Player state: SELECT your own rows only. No write policy — `complete_quest` is the door.
create policy quest_completions_select_own on public.quest_completions
  for select to authenticated using (profile_id = auth.uid());

grant select on public.quests to anon, authenticated;
grant select on public.quest_completions to authenticated;
