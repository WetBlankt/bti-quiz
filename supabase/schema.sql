-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Two tables. Events are append-only (no update/delete policy), so one device can never overwrite another.

create table if not exists public.events (
  seq     bigint generated always as identity,          -- pull cursor
  user_id uuid   not null default auth.uid() references auth.users(id) on delete cascade,
  id      text   not null,                              -- client-generated stable event id
  ts      bigint not null,
  data    jsonb  not null,                              -- the event itself (answers, quiz results, resets...)
  primary key (user_id, id)
);
create index if not exists events_user_seq on public.events (user_id, seq);
alter table public.events enable row level security;
drop policy if exists "events_select_own" on public.events;
drop policy if exists "events_insert_own" on public.events;
create policy "events_select_own" on public.events for select using (auth.uid() = user_id);
create policy "events_insert_own" on public.events for insert with check (auth.uid() = user_id);

create table if not exists public.settings (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data       jsonb not null,                            -- { key: {v, ts} }, merged last-writer-wins per key
  updated_at timestamptz not null default now()
);
alter table public.settings enable row level security;
drop policy if exists "settings_select_own" on public.settings;
drop policy if exists "settings_insert_own" on public.settings;
drop policy if exists "settings_update_own" on public.settings;
create policy "settings_select_own" on public.settings for select using (auth.uid() = user_id);
create policy "settings_insert_own" on public.settings for insert with check (auth.uid() = user_id);
create policy "settings_update_own" on public.settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
