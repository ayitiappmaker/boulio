create table if not exists public.fulfillment_action_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  admin_user_id uuid,
  admin_email text,
  action text not null,
  target_type text not null default 'topup_order',
  target_id uuid not null,
  order_status_before text,
  supplier_status_before text,
  order_status_after text,
  supplier_status_after text,
  ok boolean,
  response_code text,
  response_message text,
  supplier_reference text,
  dtone_transaction_id text,
  safe_response jsonb
);

alter table public.fulfillment_action_logs enable row level security;

create index if not exists fulfillment_action_logs_created_at_idx
  on public.fulfillment_action_logs (created_at desc);

create index if not exists fulfillment_action_logs_target_id_idx
  on public.fulfillment_action_logs (target_id);

create index if not exists fulfillment_action_logs_action_idx
  on public.fulfillment_action_logs (action);

create index if not exists fulfillment_action_logs_admin_email_idx
  on public.fulfillment_action_logs (admin_email);
