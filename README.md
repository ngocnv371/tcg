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
data/                    cards.csv, dungeons.csv — the content source of truth
scripts/build-seed.mjs   CSVs + balance constants -> supabase/seed.sql (npm run seed:build)
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
odds sum to 100, that **no non-SELECT policies exist** (the anti-cheat invariant), and that signing
up provisions a profile.

## Build order (from the plan)

Week 1 schema + seed · 2 auth/RLS · 3 card library · 4 chest opening · 5 party builder ·
6 dungeon timers + resolve/claim · 7 offline notifications · 8 level/rank-up + inventory ·
9 hub + first-session script · 10–11 art + telemetry · 12 balance tuning · 13 tester week.

Not built yet, by design: `open_chest`, `start_run`, `resolve_runs`, `claim_run`, `level_up_card`,
`rank_up_card`. Until those land, screens render seeded data and say which week they arrive in.

## Known follow-ups

- Route-level code splitting: the single JS chunk is ~612 kB (mostly supabase-js + react-query).
  Trim in week 9.
- No browser-render smoke test yet — needs a Chromium install.
- `src/types/database.gen.ts` should replace the hand-written `src/types/db.ts` once the local
  stack is running (`npm run db:types`).
