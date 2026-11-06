-- Выполнить в Supabase: SQL Editor → Run
-- Политики доступа здесь не создаются повторно.

alter table public.operations
add column if not exists operation_type text
not null default 'expense';

alter table public.operations
drop constraint if exists operations_operation_type_check;

alter table public.operations
add constraint operations_operation_type_check
check (operation_type in ('expense', 'income'));

alter table public.documents
add column if not exists ending_balance numeric(12, 2)
not null default 0;

update public.documents d
set ending_balance = d.opening_balance + coalesce((
  select sum(case when o.operation_type = 'income' then o.amount else -o.amount end)
  from public.operations o
  where o.document_id = d.id
), 0);
