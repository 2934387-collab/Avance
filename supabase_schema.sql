create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_number text not null,
  number_value integer not null,
  document_date date not null default current_date,
  organization text,
  person_name text,
  opening_balance numeric(12, 2) not null default 0,
  ending_balance numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, number_value)
);

create table if not exists public.operations (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_date date not null default current_date,
  name text not null default '',
  amount numeric(12, 2) not null default 0,
  operation_type text not null default 'expense' check (operation_type in ('expense', 'income')),
  created_at timestamptz not null default now()
);

alter table public.documents enable row level security;
alter table public.operations enable row level security;

drop policy if exists "Users can manage their documents" on public.documents;
create policy "Users can manage their documents"
  on public.documents for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage their operations" on public.operations;
create policy "Users can manage their operations"
  on public.operations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists documents_user_id_idx on public.documents(user_id);
create index if not exists operations_document_id_idx on public.operations(document_id);

alter table public.operations add column if not exists operation_type text not null default 'expense';
alter table public.operations drop constraint if exists operations_operation_type_check;
alter table public.operations add constraint operations_operation_type_check check (operation_type in ('expense', 'income'));

alter table public.documents add column if not exists ending_balance numeric(12, 2) not null default 0;

update public.documents d
set ending_balance = d.opening_balance + coalesce((
  select sum(case when o.operation_type = 'income' then o.amount else -o.amount end)
  from public.operations o
  where o.document_id = d.id
), 0);
