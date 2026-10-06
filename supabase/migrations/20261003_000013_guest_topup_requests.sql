-- Guest Request Top-Up MVP.
-- Reuses data_requests while keeping catalog eligibility, snapshots, and public
-- response fields server-owned. Apply manually after review.

alter table public.data_requests
  add column if not exists recipient_benefit text,
  add column if not exists recipient_amount numeric,
  add column if not exists recipient_currency text,
  drop constraint if exists data_requests_product_type_check;

-- Keep a durable server-side link on the checkout order. The request's
-- completed_order_id is cleared when an expired claim is released, while this
-- link lets a concurrently delivered success webhook finish atomically.
alter table public.topup_orders
  add column if not exists data_request_id uuid
  references public.data_requests(id) on delete set null;

create index if not exists topup_orders_data_request_id_idx
  on public.topup_orders (data_request_id);

alter table public.data_requests
  add constraint data_requests_product_type_check
  check (product_type in ('airtime', 'data'));

-- Preserve the direct authenticated-update guard while allowing trusted
-- SECURITY DEFINER functions (whose current_user is the function owner) to
-- perform their server-controlled transitions.
create or replace function public.protect_data_request_updates()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() = 'authenticated'
    and current_user = 'authenticated'
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

-- Keep direct authenticated inserts protected for backwards compatibility.
-- Anonymous callers have no insert policy and can only use the RPC below.
create or replace function public.protect_data_request_inserts()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_product public.topup_products%rowtype;
  v_destination_amount numeric;
  v_destination_currency text;
begin
  if auth.role() = 'authenticated' then
    new.requester_user_id := auth.uid();

    select * into v_product
    from public.topup_products
    where id = new.product_id and active = true;

    if not found then
      raise exception 'Selected product is not available.';
    end if;

    if v_product.product_type = 'airtime' then
      v_destination_amount := case
        when coalesce(v_product.external_product_metadata ->> 'destination_amount', '') ~ '^[0-9]+(\.[0-9]+)?$'
          then (v_product.external_product_metadata ->> 'destination_amount')::numeric
        else null
      end;
      v_destination_currency := upper(coalesce(v_product.external_product_metadata ->> 'destination_currency', ''));
      if v_destination_amount is null or v_destination_amount <= 0 or v_destination_currency <> 'HTG' then
        raise exception 'This airtime product does not have a verified HTG destination value.';
      end if;
    end if;

    new.carrier := lower(v_product.carrier);
    new.product_type := v_product.product_type;
    new.product_name := v_product.name;
    new.bundle_label := v_product.bundle_label;
    new.recipient_benefit := case
      when v_product.product_type = 'data' then coalesce(v_product.bundle_label, v_product.name)
      else trim(to_char(v_destination_amount, 'FM999999990.##')) || ' HTG'
    end;
    new.recipient_amount := case when v_product.product_type = 'airtime' then v_destination_amount else null end;
    new.recipient_currency := case when v_product.product_type = 'airtime' then v_destination_currency else null end;
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

drop function if exists public.create_data_request(uuid, text);

create function public.create_data_request(
  p_product_id uuid,
  p_recipient_phone text
)
returns table (
  id uuid,
  product_id uuid,
  recipient_phone text,
  carrier text,
  product_type text,
  product_name text,
  bundle_label text,
  recipient_benefit text,
  amount_usd numeric,
  service_fee_usd numeric,
  total_usd numeric,
  request_code text,
  public_status text,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested_product_id uuid := p_product_id;
  v_product public.topup_products%rowtype;
  v_request public.data_requests%rowtype;
  v_phone text := regexp_replace(coalesce(p_recipient_phone, ''), '\D', '', 'g');
  v_local_phone text;
  v_detected_carrier text;
  v_destination_amount numeric;
  v_destination_currency text;
begin
  if v_phone ~ '^509[0-9]{8}$' then
    v_local_phone := substring(v_phone from 4);
  elsif v_phone ~ '^[0-9]{8}$' then
    v_local_phone := v_phone;
    v_phone := '509' || v_phone;
  else
    raise exception 'Enter a valid Haiti mobile number.';
  end if;

  if left(v_local_phone, 2) = any (array['30','31','34','36','37','38','39']) then
    v_detected_carrier := 'digicel';
  elsif left(v_local_phone, 2) = any (array['40','41','42','43','46','47','48','49']) then
    v_detected_carrier := 'natcom';
  else
    raise exception 'The carrier could not be verified for this number.';
  end if;

  select tp.* into v_product
  from public.topup_products as tp
  where tp.id = v_requested_product_id
    and tp.active = true;

  if not found or lower(v_product.carrier) <> v_detected_carrier then
    raise exception 'Selected product is not available for this carrier.';
  end if;

  if v_product.product_type = 'airtime' then
    v_destination_amount := case
      when coalesce(v_product.external_product_metadata ->> 'destination_amount', '') ~ '^[0-9]+(\.[0-9]+)?$'
        then (v_product.external_product_metadata ->> 'destination_amount')::numeric
      else null
    end;
    v_destination_currency := upper(coalesce(v_product.external_product_metadata ->> 'destination_currency', ''));
    if v_destination_amount is null or v_destination_amount <= 0 or v_destination_currency <> 'HTG' then
      raise exception 'This airtime product does not have a verified HTG destination value.';
    end if;
  elsif v_product.product_type <> 'data' then
    raise exception 'Selected product type is not supported.';
  end if;

  insert into public.data_requests (
    requester_user_id, requester_mode, product_id, recipient_phone, carrier,
    product_type, product_name, bundle_label, amount_usd, service_fee_usd,
    recipient_benefit, recipient_amount, recipient_currency,
    public_status, internal_status, payment_status, fulfillment_status
  ) values (
    auth.uid(), 'haiti_user', v_product.id, v_phone, lower(v_product.carrier),
    v_product.product_type, v_product.name, v_product.bundle_label,
    v_product.amount_usd, v_product.service_fee_usd,
    case
      when v_product.product_type = 'data' then coalesce(v_product.bundle_label, v_product.name)
      else trim(to_char(v_destination_amount, 'FM999999990.##')) || ' HTG'
    end,
    case when v_product.product_type = 'airtime' then v_destination_amount else null end,
    case when v_product.product_type = 'airtime' then v_destination_currency else null end,
    'open', 'created', 'unpaid', 'not_started'
  ) returning * into v_request;

  return query
  select
    r.id, r.product_id, r.recipient_phone, r.carrier, r.product_type,
    r.product_name, r.bundle_label, r.recipient_benefit, r.amount_usd,
    r.service_fee_usd, r.total_usd, r.request_code, r.public_status,
    r.expires_at, r.created_at
  from public.data_requests r
  where r.id = v_request.id;
end;
$$;

revoke all on function public.create_data_request(uuid, text) from public;
grant execute on function public.create_data_request(uuid, text) to anon, authenticated;

-- Public request links return only the fields needed to render and pay an
-- open, unexpired request. Internal/user/supplier metadata is never returned.
create or replace function public.get_open_data_request(p_request_code text)
returns table (
  id uuid,
  product_id uuid,
  recipient_phone text,
  carrier text,
  product_type text,
  product_name text,
  bundle_label text,
  recipient_benefit text,
  amount_usd numeric,
  service_fee_usd numeric,
  total_usd numeric,
  request_code text,
  public_status text,
  expires_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id, r.product_id, r.recipient_phone, r.carrier, r.product_type,
    r.product_name, r.bundle_label, r.recipient_benefit, r.amount_usd, r.service_fee_usd,
    r.total_usd, r.request_code, r.public_status, r.expires_at, r.created_at
  from public.data_requests r
  join public.topup_products p on p.id = r.product_id
  where r.request_code = trim(p_request_code)
    and r.public_status = 'open'
    and r.internal_status = 'created'
    and r.payment_status = 'unpaid'
    and (r.expires_at is null or r.expires_at > now())
    and p.active = true
    and lower(p.carrier) = r.carrier
    and p.product_type = r.product_type
    and p.amount_usd = r.amount_usd
    and p.service_fee_usd = r.service_fee_usd
    and (
      p.product_type = 'data'
      or (
        coalesce(p.external_product_metadata ->> 'destination_amount', '') ~ '^[0-9]+(\.[0-9]+)?$'
        and (p.external_product_metadata ->> 'destination_amount')::numeric > 0
        and upper(coalesce(p.external_product_metadata ->> 'destination_currency', '')) = 'HTG'
        and (p.external_product_metadata ->> 'destination_amount')::numeric = r.recipient_amount
        and upper(p.external_product_metadata ->> 'destination_currency') = r.recipient_currency
      )
    )
  limit 1;
$$;

revoke all on function public.get_open_data_request(text) from public;
grant execute on function public.get_open_data_request(text) to anon, authenticated;

-- Atomically claim an eligible public request and create its one checkout
-- order from current server-owned catalog data. Repeated calls from the same
-- sender return the existing pending order; no caller-controlled pricing or
-- status fields cross this boundary.
create or replace function public.claim_data_request_for_checkout(
  p_request_code text,
  p_sender_phone text
)
returns public.topup_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.data_requests%rowtype;
  v_product public.topup_products%rowtype;
  v_order public.topup_orders%rowtype;
  v_sender_phone text;
  v_destination_amount numeric;
  v_destination_currency text;
begin
  if trim(coalesce(p_request_code, '')) = '' then
    raise exception 'Request link not found.';
  end if;

  if left(trim(coalesce(p_sender_phone, '')), 1) <> '+' then
    raise exception 'Enter your phone in international format, including the country code.';
  end if;

  v_sender_phone := '+' || regexp_replace(p_sender_phone, '\D', '', 'g');
  if v_sender_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Enter a valid international phone number.';
  end if;

  select * into v_request
  from public.data_requests
  where request_code = trim(p_request_code)
  for update;

  if not found then
    raise exception 'Request link not found.';
  end if;

  if v_request.public_status = 'open'
    and v_request.internal_status = 'payment_pending'
    and v_request.payment_status = 'pending'
    and v_request.completed_order_id is not null then
    select * into v_order
    from public.topup_orders
    where id = v_request.completed_order_id
      and sender_phone = v_sender_phone
      and status in ('draft', 'pending_payment')
      and payment_status in ('unpaid', 'pending');

    if found then
      return v_order;
    end if;
  end if;

  if v_request.public_status <> 'open'
    or v_request.internal_status <> 'created'
    or v_request.payment_status <> 'unpaid'
    or (v_request.expires_at is not null and v_request.expires_at <= now()) then
    raise exception 'This request is not available or is already being paid.';
  end if;

  select * into v_product
  from public.topup_products
  where id = v_request.product_id
    and active = true;

  if not found
    or lower(v_product.carrier) <> v_request.carrier
    or v_product.product_type <> v_request.product_type
    or v_product.amount_usd <> v_request.amount_usd
    or v_product.service_fee_usd <> v_request.service_fee_usd then
    raise exception 'The requested product is no longer available at the requested terms.';
  end if;

  if v_product.product_type = 'airtime' then
    v_destination_amount := case
      when coalesce(v_product.external_product_metadata ->> 'destination_amount', '') ~ '^[0-9]+(\.[0-9]+)?$'
        then (v_product.external_product_metadata ->> 'destination_amount')::numeric
      else null
    end;
    v_destination_currency := upper(coalesce(v_product.external_product_metadata ->> 'destination_currency', ''));

    if v_destination_amount is null
      or v_destination_amount <= 0
      or v_destination_amount is distinct from v_request.recipient_amount
      or v_destination_currency is distinct from v_request.recipient_currency then
      raise exception 'The recipient benefit has changed and this request can no longer be paid.';
    end if;
  elsif v_product.product_type = 'data' then
    if coalesce(v_product.bundle_label, v_product.name) is distinct from v_request.recipient_benefit then
      raise exception 'The recipient benefit has changed and this request can no longer be paid.';
    end if;
  else
    raise exception 'Selected product type is not supported.';
  end if;

  insert into public.topup_orders (
    user_id, product_id, data_request_id, sender_phone, recipient_phone, recipient_name,
    carrier, product_type, product_name, amount_usd, service_fee_usd,
    total_usd, status, payment_status, supplier_status, supplier_reference
  ) values (
    auth.uid(), v_product.id, v_request.id, v_sender_phone, v_request.recipient_phone, '',
    v_product.carrier, v_product.product_type, v_product.name,
    v_product.amount_usd, v_product.service_fee_usd,
    v_product.amount_usd + v_product.service_fee_usd,
    'pending_payment', 'unpaid', 'not_sent', null
  )
  returning * into v_order;

  update public.data_requests
  set completed_order_id = v_order.id,
      internal_status = 'payment_pending',
      payment_status = 'pending'
  where id = v_request.id;

  return v_order;
end;
$$;

revoke all on function public.claim_data_request_for_checkout(text, text) from public;
grant execute on function public.claim_data_request_for_checkout(text, text) to anon, authenticated;

drop policy if exists "Data requests are publicly readable when open" on public.data_requests;

-- Anonymous access is RPC-only. Authenticated owner policies and table
-- privileges are intentionally left unchanged.
revoke select, insert, update, delete on table public.data_requests from anon;

