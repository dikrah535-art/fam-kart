-- FamKart initial schema
-- Run this in your Supabase SQL editor (Dashboard → SQL → New query → paste → Run).

-- =========================================================================
-- Extensions
-- =========================================================================
create extension if not exists "pgcrypto";

-- =========================================================================
-- Tables
-- =========================================================================

-- families
create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  monthly_budget numeric(12,2) default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- profiles (1:1 with auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  family_id uuid references public.families(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- categories
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  icon text,
  color text,
  created_at timestamptz not null default now()
);
create index if not exists idx_categories_family on public.categories(family_id);

-- items
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  status text not null default 'needed', -- needed | low_stock | urgent | stocked
  priority text,                          -- normal | urgent
  quantity numeric(12,2),
  unit text,
  estimated_cost numeric(12,2),
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_items_family on public.items(family_id);
create index if not exists idx_items_status on public.items(family_id, status);

-- budgets (per month/year)
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  month int not null check (month between 1 and 12),
  year int not null,
  amount numeric(12,2) not null default 0,
  spent numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, month, year)
);

-- purchase_history
create table if not exists public.purchase_history (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  item_id uuid references public.items(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  item_name text not null,
  quantity numeric(12,2),
  unit text,
  cost numeric(12,2) not null default 0,
  source_type text,
  source_id uuid,
  purchased_by uuid references auth.users(id) on delete set null,
  purchased_at timestamptz not null default now()
);
create index if not exists idx_history_family on public.purchase_history(family_id, purchased_at desc);

-- =========================================================================
-- Helper: current user's family_id (SECURITY DEFINER, avoids RLS recursion)
-- =========================================================================
create or replace function public.current_family_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select family_id from public.profiles where id = auth.uid()
$$;

-- =========================================================================
-- Grants (PostgREST needs explicit grants on public schema)
-- =========================================================================
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.families         to authenticated;
grant select, insert, update, delete on public.profiles         to authenticated;
grant select, insert, update, delete on public.categories       to authenticated;
grant select, insert, update, delete on public.items            to authenticated;
grant select, insert, update, delete on public.budgets          to authenticated;
grant select, insert, update, delete on public.purchase_history to authenticated;

grant all on public.families, public.profiles, public.categories,
             public.items, public.budgets, public.purchase_history
      to service_role;

-- =========================================================================
-- Row Level Security
-- =========================================================================
alter table public.families         enable row level security;
alter table public.profiles         enable row level security;
alter table public.categories       enable row level security;
alter table public.items            enable row level security;
alter table public.budgets          enable row level security;
alter table public.purchase_history enable row level security;

-- profiles: user manages their own row; family members can see each other
drop policy if exists "profiles self select" on public.profiles;
create policy "profiles self select" on public.profiles
  for select to authenticated
  using (id = auth.uid() or family_id = public.current_family_id());

drop policy if exists "profiles self insert" on public.profiles;
create policy "profiles self insert" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- families
drop policy if exists "families read" on public.families;
create policy "families read" on public.families
  for select to authenticated
  using (true); -- needed so the join-by-invite-code lookup works

drop policy if exists "families insert by creator" on public.families;
create policy "families insert by creator" on public.families
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists "families update by members" on public.families;
create policy "families update by members" on public.families
  for update to authenticated
  using (id = public.current_family_id())
  with check (id = public.current_family_id());

drop policy if exists "families delete by creator" on public.families;
create policy "families delete by creator" on public.families
  for delete to authenticated
  using (created_by = auth.uid());

-- Generic family-scoped policies for the rest
do $$
declare
  t text;
begin
  foreach t in array array['categories','items','budgets','purchase_history']
  loop
    execute format('drop policy if exists "%1$s family read"   on public.%1$s', t);
    execute format('drop policy if exists "%1$s family insert" on public.%1$s', t);
    execute format('drop policy if exists "%1$s family update" on public.%1$s', t);
    execute format('drop policy if exists "%1$s family delete" on public.%1$s', t);

    execute format($f$
      create policy "%1$s family read" on public.%1$s
        for select to authenticated
        using (family_id = public.current_family_id())
    $f$, t);

    execute format($f$
      create policy "%1$s family insert" on public.%1$s
        for insert to authenticated
        with check (family_id = public.current_family_id())
    $f$, t);

    execute format($f$
      create policy "%1$s family update" on public.%1$s
        for update to authenticated
        using (family_id = public.current_family_id())
        with check (family_id = public.current_family_id())
    $f$, t);

    execute format($f$
      create policy "%1$s family delete" on public.%1$s
        for delete to authenticated
        using (family_id = public.current_family_id())
    $f$, t);
  end loop;
end $$;

-- =========================================================================
-- Auto-create a profile row when a new auth user signs up
-- =========================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
