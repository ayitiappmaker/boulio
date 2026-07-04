-- Boulio data request links
-- Phase 7 only: schema and RLS for mock/request-link support.
-- Public access is limited to open rows. Payment and fulfillment changes
-- must be handled later by trusted backend/admin processes.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.generate_data_request_code()
returns text
language sql
immutable
as $$
  select lower(replace(gen_random_uuid()::text, '-', ''));
$$;

create or replace function public.protect_data_request_updates()
returns trigger
language plpgsql
as $$
begin
  -- Authenticated clients should not be able to drive payment or fulfillment
  -- state directly. Trusted backend/admin jobs will handle those transitions.
  if auth.role() = 'authenticated'
    and (
      new.public_status is distinct from old.public_status
      or new.internal_status is distinct from old.internal_status
      or new.payment_status is distinct from old.payment_status
      or new.fulfillment_status is distinct from old.fulfillment_status
      or new.supporter_user_id is distinct from old.supporter_user_id
      or new.supporter_email is distinct from old.supporter_email
      or new.completed_order_id is distinct from old.completed_order_id
    ) then
    raise exception 'data request status fields cannot be updated directly';
  end if;

  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.data_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid references auth.users(id) on delete set null,
  requester_mode text not null default 'haiti_user',
  recipient_phone text not null,
  carrier text not null,
  product_type text not null default 'data',
  product_name text not null,
  bundle_label text,
  amount_usd numeric(10,2) not null,
  service_fee_usd numeric(10,2) not null default 0,
  total_usd numeric(10,2) generated always as (amount_usd + service_fee_usd) stored,
  request_code text not null default public.generate_data_request_code() unique,
  public_status text not null default 'open',
  internal_status text not null default 'created',
  payment_status text not null default 'unpaid',
  fulfillment_status text not null default 'not_started',
  supporter_user_id uuid references auth.users(id) on delete set null,
  supporter_email text,
  completed_order_id uuid references public.topup_orders(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint data_requests_requester_mode_check
    check (requester_mode in ('haiti_user', 'diaspora_supporter')),
  constraint data_requests_carrier_check
    check (carrier in ('digicel', 'natcom')),
  constraint data_requests_product_type_check
    check (product_type in ('data')),
  constraint data_requests_public_status_check
    check (public_status in ('open', 'paid', 'completed', 'expired', 'cancelled')),
  constraint data_requests_internal_status_check
    check (internal_status in ('created', 'payment_pending', 'paid', 'processing', 'completed', 'failed', 'cancelled')),
  constraint data_requests_payment_status_check
    check (payment_status in ('unpaid', 'pending', 'paid', 'failed', 'refunded')),
  constraint data_requests_fulfillment_status_check
    check (fulfillment_status in ('not_started', 'queued', 'processing', 'successful', 'failed')),
  constraint data_requests_amount_check
    check (amount_usd > 0),
  constraint data_requests_fee_check
    check (service_fee_usd >= 0)
);

create index if not exists data_requests_requester_user_id_idx
  on public.data_requests (requester_user_id);

create index if not exists data_requests_supporter_user_id_idx
  on public.data_requests (supporter_user_id);

create index if not exists data_requests_public_status_idx
  on public.data_requests (public_status);

create index if not exists data_requests_payment_status_idx
  on public.data_requests (payment_status);

create index if not exists data_requests_created_at_idx
  on public.data_requests (created_at desc);

drop trigger if exists data_requests_set_updated_at on public.data_requests;
create trigger data_requests_set_updated_at
before update on public.data_requests
for each row
execute function public.set_updated_at();

drop trigger if exists data_requests_guard_updates on public.data_requests;
create trigger data_requests_guard_updates
before update on public.data_requests
for each row
execute function public.protect_data_request_updates();

alter table public.data_requests enable row level security;

drop policy if exists "Data requests are publicly readable when open" on public.data_requests;
create policy "Data requests are publicly readable when open"
on public.data_requests
for select
using (public_status = 'open');

drop policy if exists "Data requests are readable by requester" on public.data_requests;
create policy "Data requests are readable by requester"
on public.data_requests
for select
to authenticated
using (auth.uid() = requester_user_id);

drop policy if exists "Data requests are insertable by requester" on public.data_requests;
create policy "Data requests are insertable by requester"
on public.data_requests
for insert
to authenticated
with check (auth.uid() = requester_user_id);

-- No direct update policy is granted here. Trusted backend/admin code can
-- update payment and fulfillment state later with elevated privileges.
