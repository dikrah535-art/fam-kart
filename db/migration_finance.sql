-- FamKart: EMI & Bills + Fuel & Transport
-- Run in Supabase SQL editor.
-- ALSO: create a PUBLIC storage bucket named `bill_receipts`
-- (Dashboard → Storage → New bucket → name: bill_receipts → Public).

-- =========================================================================
-- Tables
-- =========================================================================
create table if not exists public.emis (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null,
  monthly_payment numeric(12,2) not null default 0,
  total_months int not null default 1,
  start_date date not null default current_date,
  due_day int not null default 1 check (due_day between 1 and 31),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_emis_family on public.emis(family_id);

create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null,
  category text not null default 'Other',
  amount numeric(12,2) not null default 0,
  bill_date date not null default current_date,
  receipt_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_bills_family on public.bills(family_id, bill_date desc);

create table if not exists public.fuel_logs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  state text,
  city text,
  fuel_type text not null default 'Petrol',
  rate numeric(12,2) not null default 0,
  quantity numeric(12,3) not null default 0,
  amount numeric(12,2) not null default 0,
  note text,
  logged_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create index if not exists idx_fuel_family on public.fuel_logs(family_id, logged_at desc);

create table if not exists public.transport_expenses (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null,
  kind text not null default 'Cab',   -- Cab | Hotel | Flight | Train | Toll | Other
  amount numeric(12,2) not null default 0,
  spent_on date not null default current_date,
  receipt_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_transport_family on public.transport_expenses(family_id, spent_on desc);

-- =========================================================================
-- Grants
-- =========================================================================
grant select, insert, update, delete on public.emis                to authenticated;
grant select, insert, update, delete on public.bills               to authenticated;
grant select, insert, update, delete on public.fuel_logs           to authenticated;
grant select, insert, update, delete on public.transport_expenses  to authenticated;
grant all on public.emis, public.bills, public.fuel_logs, public.transport_expenses to service_role;

-- =========================================================================
-- RLS (family scoped, same pattern as the rest of the app)
-- =========================================================================
alter table public.emis               enable row level security;
alter table public.bills              enable row level security;
alter table public.fuel_logs          enable row level security;
alter table public.transport_expenses enable row level security;

do $$
declare t text;
begin
  foreach t in array array['emis','bills','fuel_logs','transport_expenses']
  loop
    execute format('drop policy if exists "%1$s family read"   on public.%1$s', t);
    execute format('drop policy if exists "%1$s family insert" on public.%1$s', t);
    execute format('drop policy if exists "%1$s family update" on public.%1$s', t);
    execute format('drop policy if exists "%1$s family delete" on public.%1$s', t);

    execute format($f$create policy "%1$s family read" on public.%1$s
      for select to authenticated using (family_id = public.current_family_id())$f$, t);
    execute format($f$create policy "%1$s family insert" on public.%1$s
      for insert to authenticated with check (family_id = public.current_family_id())$f$, t);
    execute format($f$create policy "%1$s family update" on public.%1$s
      for update to authenticated using (family_id = public.current_family_id())
      with check (family_id = public.current_family_id())$f$, t);
    execute format($f$create policy "%1$s family delete" on public.%1$s
      for delete to authenticated using (family_id = public.current_family_id())$f$, t);
  end loop;
end $$;

-- =========================================================================
-- Realtime
-- =========================================================================
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.emis'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.bills'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.fuel_logs'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.transport_expenses'; exception when others then null; end;
end $$;

-- =========================================================================
-- Storage policies for the `bill_receipts` bucket
-- (create the bucket in the dashboard first)
-- =========================================================================
drop policy if exists "bill_receipts read"   on storage.objects;
drop policy if exists "bill_receipts write"  on storage.objects;
drop policy if exists "bill_receipts delete" on storage.objects;

create policy "bill_receipts read" on storage.objects
  for select to authenticated using (bucket_id = 'bill_receipts');
create policy "bill_receipts write" on storage.objects
  for insert to authenticated with check (bucket_id = 'bill_receipts');
create policy "bill_receipts delete" on storage.objects
  for delete to authenticated using (bucket_id = 'bill_receipts');
