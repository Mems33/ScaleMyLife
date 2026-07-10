-- ScaleMyLife leaderboard (opt-in).
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
--
-- Privacy model: having a row IS the opt-in. Players choose to join from the
-- app; opting out deletes their row. Only the fields below are ever shared —
-- never the save itself. Reads are public (that's what a leaderboard is);
-- each player can only write/remove their own row.

create table if not exists public.leaderboard (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  name        text not null default 'Hero' check (char_length(name) <= 24),
  avatar      text not null default '🧙' check (char_length(avatar) <= 8),
  level       int  not null default 1 check (level >= 1 and level <= 999),
  rank_code   text not null default 'E' check (char_length(rank_code) <= 3),
  week_xp     int  not null default 0 check (week_xp >= 0 and week_xp <= 100000),
  best_streak int  not null default 0 check (best_streak >= 0 and best_streak <= 10000),
  ascension   int  not null default 0 check (ascension >= 0 and ascension <= 1000),
  updated_at  timestamptz not null default now()
);

alter table public.leaderboard enable row level security;

drop policy if exists "board: public read"  on public.leaderboard;
drop policy if exists "board: join own"     on public.leaderboard;
drop policy if exists "board: update own"   on public.leaderboard;
drop policy if exists "board: leave own"    on public.leaderboard;

create policy "board: public read" on public.leaderboard for select using (true);
create policy "board: join own"    on public.leaderboard for insert with check (auth.uid() = user_id);
create policy "board: update own"  on public.leaderboard for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "board: leave own"   on public.leaderboard for delete using (auth.uid() = user_id);

create index if not exists leaderboard_week_xp_idx on public.leaderboard (week_xp desc);
