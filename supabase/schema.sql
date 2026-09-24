-- ==============================================================================
-- Germany Doc Tracker - Supabase Database Schema
-- Run this script in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/_/sql/new
-- ==============================================================================

-- 1. Create app_role enum type (if not already existing)
do $$ begin
  create type public.app_role as enum ('admin', 'user');
exception
  when duplicate_object then null;
end $$;

-- 2. Create user_roles table
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

drop policy if exists "Users read own roles" on public.user_roles;
create policy "Users read own roles" on public.user_roles
  for select to authenticated
  using (auth.uid() = user_id);

-- 3. Create has_role helper function
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

grant execute on function public.has_role(uuid, app_role) to anon, authenticated, service_role;

-- 4. Trigger to make the very first user who signs up the admin
create or replace function public.handle_first_admin()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created_admin on auth.users;
create trigger on_auth_user_created_admin
  after insert on auth.users
  for each row execute function public.handle_first_admin();

-- 5. Create doc_batches table
create table if not exists public.doc_batches (
  id uuid primary key default gen_random_uuid(),
  mail_month date not null,
  coverage_start date not null,
  coverage_end date not null,
  people_count integer not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

grant select on public.doc_batches to anon, authenticated;
grant insert, update, delete on public.doc_batches to authenticated;
grant all on public.doc_batches to service_role;
alter table public.doc_batches enable row level security;

-- Row Level Security policies for doc_batches
drop policy if exists "Anyone can view" on public.doc_batches;
create policy "Anyone can view" on public.doc_batches
  for select to anon, authenticated
  using (true);

drop policy if exists "Admins insert" on public.doc_batches;
create policy "Admins insert" on public.doc_batches
  for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins update" on public.doc_batches;
create policy "Admins update" on public.doc_batches
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins delete" on public.doc_batches;
create policy "Admins delete" on public.doc_batches
  for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));
