-- Guest-first top-up checkout.
-- Historical orders remain valid; sender_phone is enforced for guest rows and
-- by every supported client creation path going forward.

alter table public.topup_orders
  alter column user_id drop not null,
  add column if not exists sender_phone text;

comment on column public.topup_orders.sender_phone is
  'Required payer contact for checkout-created orders. Historical rows may be null.';

alter table public.topup_orders
  drop constraint if exists topup_orders_guest_sender_phone_check;

alter table public.topup_orders
  add constraint topup_orders_guest_sender_phone_check
  check (user_id is not null or (sender_phone is not null and trim(sender_phone) <> ''));

create or replace function public.protect_topup_order_inserts()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_product public.topup_products%rowtype;
begin
  if trim(coalesce(new.sender_phone, '')) = '' then
    raise exception 'Sender phone is required.';
  end if;

  new.sender_phone := trim(new.sender_phone);

  if auth.role() = 'authenticated' then
    new.user_id := auth.uid();

    if new.product_id is null then
      raise exception 'A top-up product selection is required to create an order.';
    end if;

    select * into v_product
    from public.topup_products
    where id = new.product_id and active = true;

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

-- Remove the obsolete overload before exposing one canonical PostgREST call.
drop function if exists public.create_topup_order(uuid, text, text);

create function public.create_topup_order(
  p_product_id uuid,
  p_recipient_phone text,
  p_sender_phone text,
  p_recipient_name text default null
)
returns public.topup_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.topup_products%rowtype;
  v_order public.topup_orders%rowtype;
begin
  if p_product_id is null then
    raise exception 'A top-up product selection is required.';
  end if;

  if trim(coalesce(p_recipient_phone, '')) = '' then
    raise exception 'Recipient phone is required.';
  end if;

  if trim(coalesce(p_sender_phone, '')) = '' then
    raise exception 'Sender phone is required.';
  end if;

  select * into v_product
  from public.topup_products
  where id = p_product_id and active = true;

  if not found then
    raise exception 'Selected product is not available.';
  end if;

  insert into public.topup_orders (
    user_id, product_id, sender_phone, recipient_phone, recipient_name,
    carrier, product_type, product_name, amount_usd, service_fee_usd,
    total_usd, status, payment_status, supplier_status, supplier_reference
  ) values (
    auth.uid(), v_product.id, trim(p_sender_phone), trim(p_recipient_phone),
    coalesce(nullif(trim(p_recipient_name), ''), ''), v_product.carrier,
    v_product.product_type, v_product.name, v_product.amount_usd,
    v_product.service_fee_usd, v_product.amount_usd + v_product.service_fee_usd,
    'pending_payment', 'unpaid', 'not_sent', null
  )
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.create_topup_order(uuid, text, text, text) from public;
grant execute on function public.create_topup_order(uuid, text, text, text) to anon, authenticated;

-- RPC-only creation. Owner reads remain unchanged; anonymous clients receive
-- no table read, insert, update, or delete policy.
drop policy if exists "Topup orders are insertable by owner" on public.topup_orders;
