-- FamKart: expand notebook_tasks with assignee + due_date; enable realtime on history.
alter table public.notebook_tasks
  add column if not exists assignee uuid references auth.users(id) on delete set null,
  add column if not exists due_date date;

do $$
begin
  begin execute 'alter publication supabase_realtime add table public.purchase_history';
  exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.items';
  exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.budgets';
  exception when duplicate_object then null; end;
end $$;
