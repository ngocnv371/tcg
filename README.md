# TCG 2

Idle collection RPG: collect cards → open chests → build parties → send on timed dungeon runs →
gather materials → level and rank up cards → run harder dungeons.

This is the **vertical-slice** stage of the build: full loop, 30 cards, no payments, a handful of
testers. The plan lives in the Obsidian vault at
`Projects/TCG 2/1 Execution Plan.md` (design detail in `Projects/TCG 2/0 Outline.md`); this repo is
its week-by-week output.

## Stack

| Layer | Choice |
| --- | --- |
| Client | React 19 + Vite + TypeScript, Tailwind v4, React Router |
| State | TanStack Query (server cache) — server is the truth, client is a view |
| Backend | Supabase: Postgres + Auth + RLS + Edge Functions |
| PWA | vite-plugin-pwa (installable; Capacitor wrap is a post-slice task) |
| Tests | Vitest for the economy math; `scripts/verify-db.sh` for the schema |

## Non-negotiables

1. **All rolls and all timers are server-side.** A run's expiry is `started_at + duration`
   computed in Postgres, which is what makes offline progress work without a tick loop.
2. **The client never writes progression tables.** RLS grants SELECT on your own rows and nothing
   else; every mutation arrives through a `SECURITY DEFINER` function.
3. **Balance is data.** Numbers live in `src/game/formulas.ts` (shared constants) and
   `data/*.csv` (content), which generate `supabase/seed.sql`. Editing numbers means re-seeding,
   not shipping app code.

## Layout

```
data/                    concept art (cards/, dungeons/) + the CSVs seed:build reads
scripts/build-seed.mjs   CSVs + balance constants -> supabase/seed.sql (npm run seed:build)
scripts/import-concept-cards.mjs     concept-art folder (json + png) -> cards + `card-art` bucket
scripts/import-concept-dungeons.mjs  concept-art folder (json + png) -> dungeons + `dungeon-art` bucket
scripts/verify-db.sh     migration + seed against a throwaway Postgres, with assertions
scripts/make-icons.py    placeholder PWA icons (pure stdlib, replace in week 10)
src/app/                 router + shell (resource bar, bottom tabs)
src/components/          shared UI atoms
src/features/<domain>/   api.ts (queries) + screens per domain
src/game/formulas.ts     the balance numbers, as code — tests pin them
src/lib/supabase.ts      browser client (reads + RPC only)
src/types/db.ts          row types mirroring the migration
supabase/migrations/     schema v1: tables, RLS, derived functions
supabase/seed.sql        GENERATED — never hand-edit
```

## Getting started

```bash
npm install
cp .env.example .env.local     # .env.local already points at the local stack
npm run db:start               # Supabase in Docker (first run pulls images)
npm run db:reset               # apply migrations + seed
npm run dev                    # http://localhost:5173
```

Sign up with any email/password (local Supabase auto-confirms); the `handle_new_user` trigger
creates your profile with 2 run slots, grants five rank-1 cards, and fills your first party.
For local development, reset the database and sign in with `dev@tcg2.local` / `tcg2devpass`.

## Checks

```bash
npm test          # economy math
npm run lint      # oxlint
npm run build     # tsc -b && vite build (also emits the service worker)
bash scripts/verify-db.sh   # migration + seed against throwaway Postgres, with assertions
npm run db:types  # regenerate src/types/database.gen.ts from the local DB
```

`scripts/verify-db.sh` is the fast gate: ~10 seconds, no Supabase stack needed. It stubs the
`auth` schema and the `anon`/`authenticated` roles, applies the migration and the seed, then
asserts card/dungeon/material counts, that every rank-up row references real materials, that chest
odds sum to 100, that `rank_up_card` spends and rejects a short balance without charging, that
**no non-SELECT policies exist** (the anti-cheat invariant), and that signing up provisions a profile.

## Build order (from the plan)

Week 1 schema + seed · 2 auth/RLS · 3 card library · 4 chest opening · 5 party builder ·
6 dungeon timers + resolve/claim · 7 offline notifications · 8 rank-up + inventory ·
9 hub + first-session script · 10–11 art + telemetry · 12 balance tuning · 13 tester week.

Card level-up is cancelled and player progression is out of scope for v1: rank-up is the
only way a card gets stronger, and nothing grants XP. `level_up_card` is not a to-do.

Built: daily chest claiming and server-authoritative chest opening. The vault stacks duplicates by
type and opens 1/2/5/10 at once through `open_chests`, which spends the rows server-side and returns
one reveal per chest. `rank_up_card` spends the gold and materials from `card_rank_costs` and moves
one owned copy up a rank, then plays a 5s Remotion reveal. `start_run`, `resolve_runs` and
`claim_run` drive the dungeon loop.

Also built: telemetry and run-finished notifications.

- **Telemetry** (`20260928000000_telemetry.sql`) is append-only in `telemetry_events`. Progression
events are written by database triggers on `pull_history`, `dungeon_runs` and `player_cards`, so the
client cannot skip or forge one; `track_event` is allow-listed to `app_open` / `screen_view` for the
lifecycle metrics no table can observe. Rows carry `source = 'server' | 'client'` so a tuning query
can tell them apart. Read it with, e.g.
`select name, count(*) from public.telemetry_events where created_at > now() - interval '1 day' group by 1;`
- **Run-finished push** (`20260929000000_notifications.sql`) queues a message the moment a run
resolves, keyed by run id so `resolve_runs()` cannot queue it twice, and only when the player has a
registered device. The queue is server-only; `supabase/functions/notify-runs` drains it and talks to
the push service.

### Enabling push notifications

1. `npx web-push generate-vapid-keys`
2. Put the public key in `.env.local` as `VITE_VAPID_PUBLIC_KEY=…`.
3. `supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:you@example.com NOTIFY_CRON_SECRET=…`
4. `supabase functions deploy notify-runs --no-verify-jwt`
5. Schedule it every minute (Supabase scheduled functions, or pg_cron + pg_net) with the
   `x-cron-secret` header set to `NOTIFY_CRON_SECRET`.

Web push needs HTTPS, so this is a deployed-build feature; `localhost` works in Chrome but not on a
tester's phone. Without `VITE_VAPID_PUBLIC_KEY` the toggle reports the browser as unsupported.

## Known follow-ups

- Route-level code splitting: the single JS chunk is ~612 kB (mostly supabase-js + react-query).
  Trim in week 9.
- No browser-render smoke test yet — needs a Chromium install.
- `src/types/database.gen.ts` should replace the hand-written `src/types/db.ts` once the local
  stack is running (`npm run db:types`).
