-- ScaleMyLife cloud sync schema.
-- Run this once in your Supabase dashboard: SQL Editor -> New query -> paste -> Run.
--
-- One row per user holding the full save as JSON. Row Level Security ensures a
-- user can only ever read/write their own row — this is what makes it safe to
-- ship the publishable (anon) key inside the client.

create table if not exists public.saves (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb        not null,
  updated_at timestamptz  not null default now()
);

alter table public.saves enable row level security;

drop policy if exists "saves: read own"   on public.saves;
drop policy if exists "saves: insert own" on public.saves;
drop policy if exists "saves: update own" on public.saves;

create policy "saves: read own"   on public.saves for select using (auth.uid() = user_id);
create policy "saves: insert own" on public.saves for insert with check (auth.uid() = user_id);
create policy "saves: update own" on public.saves for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- No delete policy on purpose: the app never deletes a save; if you ever want
-- account deletion, do it via auth.users (the row cascades).
