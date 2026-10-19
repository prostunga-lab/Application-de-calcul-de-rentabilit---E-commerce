-- À exécuter dans Supabase : SQL Editor → New query → Run. Peut être relancé sans risque.
-- Une ligne par utilisateur ; la sécurité par ligne (RLS) empêche de lire ou modifier les données d'un autre compte.
create table if not exists public.user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

drop policy if exists "lecture de ses données" on public.user_data;
create policy "lecture de ses données" on public.user_data
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "création de ses données" on public.user_data;
create policy "création de ses données" on public.user_data
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "modification de ses données" on public.user_data;
create policy "modification de ses données" on public.user_data
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "suppression de ses données" on public.user_data;
create policy "suppression de ses données" on public.user_data
  for delete to authenticated using (auth.uid() = user_id);
