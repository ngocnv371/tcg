alter table public.cards
  add column if not exists tags text[] not null default '{}';