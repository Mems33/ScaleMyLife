-- ScaleMyLife friends + gated profiles (run AFTER schema.sql and leaderboard.sql).
-- Idempotent: safe to run once in the Supabase SQL Editor.
--
-- Turns the leaderboard row into a "profile" that is visible only to: the owner,
-- people who follow them, and (if they joined the global board) everyone.
-- Friends is a one-directional follow model — add someone by their friend code
-- to see their profile and race them on a Friends board.

-- 1) profile columns on the existing leaderboard table
alter table public.leaderboard add column if not exists friend_code text;
alter table public.leaderboard add column if not exists on_board boolean not null default true;
create unique index if not exists leaderboard_friend_code_idx on public.leaderboard (friend_code);

-- 2) friends (follows): user_id follows friend_id
create table if not exists public.friends (
  user_id    uuid not null references auth.users (id) on delete cascade,
  friend_id  uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);
alter table public.friends enable row level security;

drop policy if exists "friends: read own"   on public.friends;
drop policy if exists "friends: add own"    on public.friends;
drop policy if exists "friends: remove own" on public.friends;
create policy "friends: read own"   on public.friends for select using (user_id = auth.uid());
create policy "friends: add own"    on public.friends for insert with check (user_id = auth.uid());
create policy "friends: remove own" on public.friends for delete using (user_id = auth.uid());

-- 3) gate profile reads: on the global board, OR yourself, OR someone you follow
drop policy if exists "board: public read"    on public.leaderboard;
drop policy if exists "profiles: read visible" on public.leaderboard;
create policy "profiles: read visible" on public.leaderboard for select using (
  on_board = true
  or user_id = auth.uid()
  or user_id in (select friend_id from public.friends where user_id = auth.uid())
);

-- 4) exact-code lookup that bypasses RLS (knowing the secret code grants a peek,
--    which is how you add someone before you follow them)
create or replace function public.find_by_friend_code(code text)
returns table (user_id uuid, name text, avatar text, level int, rank_code text, week_xp int, best_streak int, ascension int)
language sql security definer set search_path = public as $$
  select user_id, name, avatar, level, rank_code, week_xp, best_streak, ascension
  from public.leaderboard where friend_code = upper(code) limit 1;
$$;
grant execute on function public.find_by_friend_code(text) to anon, authenticated;
