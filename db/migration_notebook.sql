-- FamKart: Notebook + Memory Calendar migration
-- Run in Supabase SQL Editor (Dashboard → SQL → New query → paste → Run).

-- =========================================================================
-- Tables
-- =========================================================================

-- Instant-writing list rows, one row per (family, date, sr_no)
create table if not exists public.notebook_entries (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  entry_date date not null default (now())::date,
  sr_no int not null,
  item_name text default '',
  quantity numeric(12,2),
  unit text,
  price numeric(12,2),
  bought boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, entry_date, sr_no)
);
create index if not exists idx_notebook_entries_family_date
  on public.notebook_entries(family_id, entry_date);

-- 3 shared notepad slots per (family, date)
create table if not exists public.notebook_notes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  entry_date date not null default (now())::date,
  slot_index int not null check (slot_index between 0 and 2),
  content text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (family_id, entry_date, slot_index)
);
create index if not exists idx_notebook_notes_family_date
  on public.notebook_notes(family_id, entry_date);

-- =========================================================================
-- Grants
-- =========================================================================
grant select, insert, update, delete on public.notebook_entries to authenticated;
grant select, insert, update, delete on public.notebook_notes   to authenticated;
grant all on public.notebook_entries, public.notebook_notes to service_role;

-- =========================================================================
-- RLS
-- =========================================================================
alter table public.notebook_entries enable row level security;
alter table public.notebook_notes   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['notebook_entries','notebook_notes']
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
-- Realtime: add tables to the supabase_realtime publication
-- =========================================================================
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.notebook_entries';
  exception when duplicate_object then null; end;
  begin
    execute 'alter publication supabase_realtime add table public.notebook_notes';
  exception when duplicate_object then null; end;
  begin
    execute 'alter publication supabase_realtime add table public.items';
  exception when duplicate_object then null; end;
  begin
    execute 'alter publication supabase_realtime add table public.purchase_history';
  exception when duplicate_object then null; end;
end $$;
