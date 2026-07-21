-- Sage Phase 2: real conversational chat via the sage-chat Edge Function
-- (supabase/functions/sage-chat/index.ts). This table only tracks a daily
-- message count per user so the function can rate-limit; no chat content is
-- ever stored server-side.

create table if not exists public.sage_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  count int not null default 0,
  primary key (user_id, day)
);

alter table public.sage_usage enable row level security;

drop policy if exists "sage_usage: read own" on public.sage_usage;
create policy "sage_usage: read own" on public.sage_usage for select using (auth.uid() = user_id);
-- deliberately no insert/update/delete policy for anon/authenticated: only the
-- edge function's service-role client can write, so the daily count can't be
-- reset or forged by the client.

-- Atomic per-user daily increment, called only by the edge function's
-- service-role client (see grant below). SECURITY DEFINER so it can write
-- despite sage_usage having no client-facing insert/update policy.
create or replace function public.increment_sage_usage(p_user_id uuid, p_day date)
returns int
language sql
security definer
set search_path = public
as $$
  insert into public.sage_usage (user_id, day, count)
  values (p_user_id, p_day, 1)
  on conflict (user_id, day) do update set count = sage_usage.count + 1
  returning count;
$$;

revoke all on function public.increment_sage_usage(uuid, date) from public;
grant execute on function public.increment_sage_usage(uuid, date) to service_role;
