-- FamKart: Family Tasks / To-Do
-- Run in Supabase SQL Editor.

create table if not exists public.notebook_tasks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null default '',
  completed boolean not null default false,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_notebook_tasks_family
  on public.notebook_tasks(family_id, completed);

grant select, insert, update, delete on public.notebook_tasks to authenticated;
grant all on public.notebook_tasks to service_role;

alter table public.notebook_tasks enable row level security;

drop policy if exists "notebook_tasks family read"   on public.notebook_tasks;
drop policy if exists "notebook_tasks family insert" on public.notebook_tasks;
drop policy if exists "notebook_tasks family update" on public.notebook_tasks;
drop policy if exists "notebook_tasks family delete" on public.notebook_tasks;

create policy "notebook_tasks family read" on public.notebook_tasks
  for select to authenticated
  using (family_id = public.current_family_id());
create policy "notebook_tasks family insert" on public.notebook_tasks
  for insert to authenticated
  with check (family_id = public.current_family_id());
create policy "notebook_tasks family update" on public.notebook_tasks
  for update to authenticated
  using (family_id = public.current_family_id())
  with check (family_id = public.current_family_id());
create policy "notebook_tasks family delete" on public.notebook_tasks
  for delete to authenticated
  using (family_id = public.current_family_id());

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.notebook_tasks';
  exception when duplicate_object then null; end;
end $$;
