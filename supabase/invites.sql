-- ScaleMyLife friend invites (run AFTER friends.sql). Idempotent.
--
-- Makes the follow model mutual-friendly: when A adds B by code, B SEES the
-- follow as an incoming invite and can follow back (accept) or remove A's
-- follow (decline) - no code exchange needed in the other direction.

-- 1) the person being followed can see who follows them (that IS the invite)
drop policy if exists "friends: read own" on public.friends;
drop policy if exists "friends: read own or follower" on public.friends;
create policy "friends: read own or follower" on public.friends for select
  using (user_id = auth.uid() or friend_id = auth.uid());

-- 2) the person being followed may remove a follower (decline / un-invite)
drop policy if exists "friends: remove follower" on public.friends;
create policy "friends: remove follower" on public.friends for delete
  using (friend_id = auth.uid());
-- ("friends: remove own" from friends.sql stays: policies are OR'd)

-- 3) someone who follows you becomes visible to you, so the invite can show
--    their name and avatar (they revealed themselves by adding your code)
drop policy if exists "profiles: read visible" on public.leaderboard;
create policy "profiles: read visible" on public.leaderboard for select using (
  on_board = true
  or user_id = auth.uid()
  or user_id in (select friend_id from public.friends where user_id = auth.uid())
  or user_id in (select user_id  from public.friends where friend_id = auth.uid())
);
