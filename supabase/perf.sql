-- ScaleMyLife performance pass (run AFTER invites.sql). Idempotent.
--
-- Fixes everything the Supabase performance advisor flags so queries stay
-- fast when the tables grow from tens to many thousands of rows:
--   1. index the friends.friend_id foreign key (invites look up by it)
--   2. a composite index behind the global-board query (on_board + week_xp)
--   3. wrap auth.uid() as (select auth.uid()) in every policy so Postgres
--      evaluates it once per query instead of once per row
--   4. merge the two DELETE policies on friends into one

-- 1 + 2: indexes
create index if not exists friends_friend_id_idx on public.friends (friend_id);
create index if not exists leaderboard_board_idx on public.leaderboard (on_board, week_xp desc);

-- 3: saves
drop policy if exists "saves: read own"   on public.saves;
drop policy if exists "saves: insert own" on public.saves;
drop policy if exists "saves: update own" on public.saves;
create policy "saves: read own"   on public.saves for select using ((select auth.uid()) = user_id);
create policy "saves: insert own" on public.saves for insert with check ((select auth.uid()) = user_id);
create policy "saves: update own" on public.saves for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- 3: leaderboard
drop policy if exists "board: join own"        on public.leaderboard;
drop policy if exists "board: update own"      on public.leaderboard;
drop policy if exists "board: leave own"       on public.leaderboard;
drop policy if exists "profiles: read visible" on public.leaderboard;
create policy "board: join own"   on public.leaderboard for insert with check ((select auth.uid()) = user_id);
create policy "board: update own" on public.leaderboard for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "board: leave own"  on public.leaderboard for delete using ((select auth.uid()) = user_id);
create policy "profiles: read visible" on public.leaderboard for select using (
  on_board = true
  or user_id = (select auth.uid())
  or user_id in (select friend_id from public.friends where user_id = (select auth.uid()))
  or user_id in (select user_id  from public.friends where friend_id = (select auth.uid()))
);

-- 3 + 4: friends (single DELETE policy: either side of the edge may cut it)
drop policy if exists "friends: read own or follower" on public.friends;
drop policy if exists "friends: add own"              on public.friends;
drop policy if exists "friends: remove own"           on public.friends;
drop policy if exists "friends: remove follower"      on public.friends;
create policy "friends: read own or follower" on public.friends for select
  using (user_id = (select auth.uid()) or friend_id = (select auth.uid()));
create policy "friends: add own" on public.friends for insert
  with check (user_id = (select auth.uid()));
create policy "friends: remove either side" on public.friends for delete
  using (user_id = (select auth.uid()) or friend_id = (select auth.uid()));
