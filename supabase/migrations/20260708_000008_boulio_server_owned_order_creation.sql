-- Boulio server-owned pricing and safe order/request creation
-- Closes an insert-time gap: existing triggers only guarded UPDATE, so an
-- authenticated client could previously INSERT a topup_orders/data_requests
-- row directly with a fake price or a privileged status (e.g. payment_status
-- = 'paid'). This migration adds BEFORE INSERT guards that re-derive pricing
-- from the trusted topup_products catalog and force safe default statuses,
-- plus canonical RPCs the client should call instead of raw inserts.

-- data_requests needs a trusted product reference, mirroring the existing
-- topup_orders.product_id column added in 20260705_000006.
alter table if exists public.data_requests
  add column if not exists product_id uuid references public.topup_products(id);

create index if not exists data_requests_product_id_idx
  on public.data_requests (product_id);

-- Re-derives all financial and status fields for top-up orders from the
-- trusted topup_products row whenever an authenticated client inserts a row,
-- regardless of what values were supplied. This makes it impossible for a
-- direct client insert (bypassing create_topup_order) to set a fake price or
-- a privileged status.
create or replace function public.protect_topup_order_inserts()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_product public.topup_products%rowtype;
begin
  if auth.role() = 'authenticated' then
    new.user_id := auth.uid();

    if new.product_id is null then
      raise exception 'A top-up product selection is required to create an order.';
    end if;

    select * into v_product
    from public.topup_products
    where id = new.product_id
      and active = true;

    if not found then
      raise exception 'Selected product is not available.';
    end if;

    new.carrier := v_product.carrier;
    new.product_type := v_product.product_type;
    new.product_name := v_product.name;
    new.amount_usd := v_product.amount_usd;
    new.service_fee_usd := v_product.service_fee_usd;
    new.total_usd := v_product.amount_usd + v_product.service_fee_usd;
    new.status := 'pending_payment';
    new.payment_status := 'unpaid';
    new.supplier_status := 'not_sent';
    new.supplier_reference := null;
  end if;

  return new;
end;
$$;

drop trigger if exists topup_orders_protect_inserts on public.topup_orders;
create trigger topup_orders_protect_inserts
before insert on public.topup_orders
for each row
execute function public.protect_topup_order_inserts();

-- Same protection for data requests: re-derives carrier/name/pricing from the
-- trusted topup_products row and forces safe default statuses on insert.
create or replace function public.protect_data_request_inserts()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_product public.topup_products%rowtype;
begin
  if auth.role() = 'authenticated' then
    new.requester_user_id := auth.uid();

    if new.product_id is null then
      raise exception 'A data package selection is required to create a request.';
    end if;

    select * into v_product
    from public.topup_products
    where id = new.product_id
      and active = true
      and product_type = 'data';

    if not found then
      raise exception 'Selected data package is not available.';
    end if;

    new.carrier := lower(v_product.carrier);
    new.product_type := 'data';
    new.product_name := v_product.name;
    new.bundle_label := v_product.bundle_label;
    new.amount_usd := v_product.amount_usd;
    new.service_fee_usd := v_product.service_fee_usd;
    new.public_status := 'open';
    new.internal_status := 'created';
    new.payment_status := 'unpaid';
    new.fulfillment_status := 'not_started';
    new.supporter_user_id := null;
    new.supporter_email := null;
    new.completed_order_id := null;
  end if;

  return new;
end;
$$;

drop trigger if exists data_requests_protect_inserts on public.data_requests;
create trigger data_requests_protect_inserts
before insert on public.data_requests
for each row
execute function public.protect_data_request_inserts();

-- Canonical creation RPCs. These intentionally run as SECURITY INVOKER (the
-- default) so they still respect the existing ownership RLS policies; the
-- BEFORE INSERT triggers above are the actual trust boundary for pricing and
-- status, so these functions only need to accept safe user-supplied fields.
create or replace function public.create_topup_order(
  p_product_id uuid,
  p_recipient_phone text,
  p_recipient_name text default null
)
returns public.topup_orders
language plpgsql
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.topup_orders%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required to create a top-up order.';
  end if;

  if trim(coalesce(p_recipient_phone, '')) = '' then
    raise exception 'Recipient phone is required.';
  end if;

  insert into public.topup_orders (
    user_id,
    product_id,
    recipient_phone,
    recipient_name
  ) values (
    v_user_id,
    p_product_id,
    trim(p_recipient_phone),
    coalesce(nullif(trim(p_recipient_name), ''), '')
  )
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.create_topup_order(uuid, text, text) from public;
grant execute on function public.create_topup_order(uuid, text, text) to authenticated;

create or replace function public.create_data_request(
  p_product_id uuid,
  p_recipient_phone text
)
returns public.data_requests
language plpgsql
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_requester_mode text;
  v_request public.data_requests%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required to create a data request.';
  end if;

  if trim(coalesce(p_recipient_phone, '')) = '' then
    raise exception 'Recipient phone is required.';
  end if;

  select user_mode into v_requester_mode
  from public.profiles
  where user_id = v_user_id;

  insert into public.data_requests (
    requester_user_id,
    requester_mode,
    product_id,
    recipient_phone
  ) values (
    v_user_id,
    coalesce(v_requester_mode, 'haiti_user'),
    p_product_id,
    trim(p_recipient_phone)
  )
  returning * into v_request;

  return v_request;
end;
$$;

revoke all on function public.create_data_request(uuid, text) from public;
grant execute on function public.create_data_request(uuid, text) to authenticated;
