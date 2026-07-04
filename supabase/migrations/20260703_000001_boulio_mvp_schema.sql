-- Boulio MVP schema
-- Phase 3 only: schema, RLS, and seed data. No app integration yet.
-- The schema stays deliberately small, but the constraints and policies are written
-- so the app can grow into a production-backed flow later without reshaping tables.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.protect_topup_order_updates()
returns trigger
language plpgsql
as $$
begin
  -- Client-side users should not be able to mutate order state directly.
  -- Service-role or backend jobs can still update these columns later.
  if auth.role() = 'authenticated'
    and (
      new.status is distinct from old.status
      or new.payment_status is distinct from old.payment_status
      or new.supplier_status is distinct from old.supplier_status
    ) then
    raise exception 'topup order state fields cannot be updated directly';
  end if;

  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  email text not null unique,
  country text not null default 'United States',
  preferred_state text not null default 'Florida',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_preferred_state_check
    check (preferred_state in ('Florida', 'New York', 'Georgia', 'New Jersey', 'Tennessee'))
);

create table if not exists public.lottery_results (
  id uuid primary key default gen_random_uuid(),
  state text not null,
  game text not null,
  draw text not null,
  result_date date not null,
  numbers text[] not null,
  source text not null,
  created_at timestamptz not null default now(),
  constraint lottery_results_state_check
    check (state in ('Florida', 'New York', 'Georgia', 'New Jersey', 'Tennessee')),
  constraint lottery_results_game_check
    check (game in ('Pick 3', 'Pick 4')),
  constraint lottery_results_draw_check
    check (draw in ('Midday', 'Evening')),
  constraint lottery_results_numbers_shape_check
    check (
      (game = 'Pick 3' and cardinality(numbers) = 3)
      or (game = 'Pick 4' and cardinality(numbers) = 4)
    )
);

create unique index if not exists lottery_results_unique_idx
  on public.lottery_results (state, game, draw, result_date);

create index if not exists lottery_results_state_idx
  on public.lottery_results (state);

create index if not exists lottery_results_game_idx
  on public.lottery_results (game);

create index if not exists lottery_results_draw_idx
  on public.lottery_results (draw);

create index if not exists lottery_results_result_date_idx
  on public.lottery_results (result_date desc);

create table if not exists public.topup_products (
  id uuid primary key default gen_random_uuid(),
  carrier text not null,
  product_type text not null,
  name text not null,
  bundle_label text,
  amount_usd numeric(10,2) not null,
  service_fee_usd numeric(10,2) not null,
  total_usd numeric(10,2) generated always as (amount_usd + service_fee_usd) stored,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint topup_products_carrier_check
    check (carrier in ('Digicel', 'Natcom')),
  constraint topup_products_type_check
    check (product_type in ('airtime', 'data')),
  constraint topup_products_bundle_label_check
    check (
      (product_type = 'airtime' and bundle_label is null)
      or (product_type = 'data' and bundle_label is not null)
    ),
  constraint topup_products_amount_check
    check (amount_usd > 0),
  constraint topup_products_fee_check
    check (service_fee_usd >= 0)
);

create unique index if not exists topup_products_unique_idx
  on public.topup_products (carrier, product_type, name);

create index if not exists topup_products_carrier_idx
  on public.topup_products (carrier);

create index if not exists topup_products_product_type_idx
  on public.topup_products (product_type);

create index if not exists topup_products_active_idx
  on public.topup_products (active)
  where active;

create table if not exists public.saved_recipients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipient_name text not null,
  phone_number text not null,
  carrier text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_recipients_carrier_check
    check (carrier in ('Digicel', 'Natcom'))
);

create index if not exists saved_recipients_user_id_idx
  on public.saved_recipients (user_id);

create table if not exists public.topup_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  carrier text not null,
  product_type text not null,
  product_name text not null,
  recipient_phone text not null,
  recipient_name text not null,
  amount_usd numeric(10,2) not null,
  service_fee_usd numeric(10,2) not null,
  total_usd numeric(10,2) not null,
  status text not null default 'draft',
  payment_status text not null default 'unpaid',
  supplier_status text not null default 'not_sent',
  supplier_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint topup_orders_carrier_check
    check (carrier in ('Digicel', 'Natcom')),
  constraint topup_orders_product_type_check
    check (product_type in ('airtime', 'data')),
  constraint topup_orders_status_check
    check (status in ('draft', 'pending_payment', 'paid', 'processing', 'completed', 'failed', 'refunded', 'cancelled')),
  constraint topup_orders_payment_status_check
    check (payment_status in ('unpaid', 'pending', 'paid', 'failed', 'refunded')),
  constraint topup_orders_supplier_status_check
    check (supplier_status in ('not_sent', 'pending', 'successful', 'failed')),
  constraint topup_orders_amount_check
    check (amount_usd > 0),
  constraint topup_orders_fee_check
    check (service_fee_usd >= 0),
  constraint topup_orders_total_check
    check (total_usd = amount_usd + service_fee_usd)
);

-- Status fields are guarded by a trigger so authenticated clients cannot mutate
-- them directly. In production, trusted backend jobs should be the only writers.
create trigger topup_orders_guard_and_stamp_updated_at
before update on public.topup_orders
for each row
execute function public.protect_topup_order_updates();

create index if not exists topup_orders_user_id_idx
  on public.topup_orders (user_id);

create index if not exists topup_orders_status_idx
  on public.topup_orders (status);

create index if not exists topup_orders_payment_status_idx
  on public.topup_orders (payment_status);

create index if not exists topup_orders_created_at_idx
  on public.topup_orders (created_at desc);

create table if not exists public.notification_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  result_alerts_enabled boolean not null default true,
  topup_status_alerts_enabled boolean not null default true,
  marketing_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  message text not null,
  order_id uuid references public.topup_orders(id) on delete set null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  constraint support_messages_status_check
    check (status in ('open', 'pending', 'closed'))
);

create index if not exists support_messages_user_id_idx
  on public.support_messages (user_id);

create index if not exists support_messages_order_id_idx
  on public.support_messages (order_id);

create index if not exists profiles_updated_at_idx
  on public.profiles (updated_at);

create index if not exists saved_recipients_updated_at_idx
  on public.saved_recipients (updated_at);

create index if not exists topup_orders_updated_at_idx
  on public.topup_orders (updated_at);

create index if not exists notification_settings_updated_at_idx
  on public.notification_settings (updated_at);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists saved_recipients_set_updated_at on public.saved_recipients;
create trigger saved_recipients_set_updated_at
before update on public.saved_recipients
for each row
execute function public.set_updated_at();

drop trigger if exists notification_settings_set_updated_at on public.notification_settings;
create trigger notification_settings_set_updated_at
before update on public.notification_settings
for each row
execute function public.set_updated_at();

-- RLS
alter table public.profiles enable row level security;
alter table public.lottery_results enable row level security;
alter table public.topup_products enable row level security;
alter table public.saved_recipients enable row level security;
alter table public.topup_orders enable row level security;
alter table public.notification_settings enable row level security;
alter table public.support_messages enable row level security;

drop policy if exists "Public read lottery results" on public.lottery_results;
create policy "Public read lottery results"
on public.lottery_results
for select
using (true);

drop policy if exists "Public read active topup products" on public.topup_products;
create policy "Public read active topup products"
on public.topup_products
for select
using (active);

drop policy if exists "Profiles are readable by owner" on public.profiles;
create policy "Profiles are readable by owner"
on public.profiles
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Profiles are insertable by owner" on public.profiles;
create policy "Profiles are insertable by owner"
on public.profiles
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Profiles are updateable by owner" on public.profiles;
create policy "Profiles are updateable by owner"
on public.profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Saved recipients are readable by owner" on public.saved_recipients;
create policy "Saved recipients are readable by owner"
on public.saved_recipients
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Saved recipients are insertable by owner" on public.saved_recipients;
create policy "Saved recipients are insertable by owner"
on public.saved_recipients
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Saved recipients are updateable by owner" on public.saved_recipients;
create policy "Saved recipients are updateable by owner"
on public.saved_recipients
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Saved recipients are deletable by owner" on public.saved_recipients;
create policy "Saved recipients are deletable by owner"
on public.saved_recipients
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Topup orders are readable by owner" on public.topup_orders;
create policy "Topup orders are readable by owner"
on public.topup_orders
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Topup orders are insertable by owner" on public.topup_orders;
create policy "Topup orders are insertable by owner"
on public.topup_orders
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Notification settings are readable by owner" on public.notification_settings;
create policy "Notification settings are readable by owner"
on public.notification_settings
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Notification settings are insertable by owner" on public.notification_settings;
create policy "Notification settings are insertable by owner"
on public.notification_settings
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Notification settings are updateable by owner" on public.notification_settings;
create policy "Notification settings are updateable by owner"
on public.notification_settings
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Support messages are readable by owner" on public.support_messages;
create policy "Support messages are readable by owner"
on public.support_messages
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Support messages are insertable by owner" on public.support_messages;
create policy "Support messages are insertable by owner"
on public.support_messages
for insert
to authenticated
with check (auth.uid() = user_id);

-- Seed data for the mock UI and MVP demos.
insert into public.topup_products (carrier, product_type, name, bundle_label, amount_usd, service_fee_usd, active)
values
  ('Digicel', 'airtime', 'Digicel Airtime $5', null, 5.00, 0.99, true),
  ('Digicel', 'airtime', 'Digicel Airtime $10', null, 10.00, 1.49, true),
  ('Digicel', 'airtime', 'Digicel Airtime $20', null, 20.00, 1.99, true),
  ('Digicel', 'airtime', 'Digicel Airtime $50', null, 50.00, 2.99, true),
  ('Natcom', 'airtime', 'Natcom Airtime $5', null, 5.00, 0.99, true),
  ('Natcom', 'airtime', 'Natcom Airtime $10', null, 10.00, 1.49, true),
  ('Natcom', 'airtime', 'Natcom Airtime $20', null, 20.00, 1.99, true),
  ('Natcom', 'airtime', 'Natcom Airtime $50', null, 50.00, 2.99, true),
  ('Digicel', 'data', 'Digicel Data 1GB', '1GB', 6.00, 0.99, true),
  ('Digicel', 'data', 'Digicel Data 3GB', '3GB', 12.00, 1.49, true),
  ('Digicel', 'data', 'Digicel Data 5GB', '5GB', 18.00, 1.99, true),
  ('Digicel', 'data', 'Digicel Data 10GB', '10GB', 30.00, 2.99, true),
  ('Natcom', 'data', 'Natcom Data 1GB', '1GB', 6.00, 0.99, true),
  ('Natcom', 'data', 'Natcom Data 3GB', '3GB', 12.00, 1.49, true),
  ('Natcom', 'data', 'Natcom Data 5GB', '5GB', 18.00, 1.99, true),
  ('Natcom', 'data', 'Natcom Data 10GB', '10GB', 30.00, 2.99, true)
on conflict (carrier, product_type, name) do nothing;

insert into public.lottery_results (state, game, draw, result_date, numbers, source)
values
  ('Florida', 'Pick 3', 'Evening', date '2026-07-03', array['4', '1', '9'], 'Mock state lottery feed'),
  ('Florida', 'Pick 4', 'Evening', date '2026-07-03', array['2', '8', '6', '1'], 'Mock state lottery feed'),
  ('New York', 'Pick 3', 'Midday', date '2026-07-03', array['0', '7', '3'], 'Mock state lottery feed'),
  ('Georgia', 'Pick 4', 'Midday', date '2026-07-02', array['1', '5', '9', '4'], 'Mock state lottery feed')
on conflict (state, game, draw, result_date) do nothing;

