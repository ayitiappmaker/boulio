-- Serialize request-checkout expiry and success webhook transitions.
-- Apply manually after review; the webhook invokes these functions as service_role.

create or replace function public.release_data_request_checkout_claim(
  p_order_id uuid,
  p_stripe_checkout_session_id text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order public.topup_orders%rowtype;
  v_request public.data_requests%rowtype;
begin
  select * into v_order
  from public.topup_orders
  where id = p_order_id
  for update;

  if not found or v_order.data_request_id is null then
    return false;
  end if;

  select * into v_request
  from public.data_requests
  where id = v_order.data_request_id
  for update;

  if not found
    or v_request.completed_order_id is distinct from p_order_id
    or v_request.public_status <> 'open'
    or v_request.internal_status <> 'payment_pending'
    or v_request.payment_status <> 'pending'
    or v_order.payment_status in ('paid', 'refunded')
    or v_order.status in ('paid', 'processing', 'completed', 'refunded')
    or v_order.supplier_status = 'successful'
    or (
      v_order.stripe_checkout_session_id is not null
      and v_order.stripe_checkout_session_id is distinct from p_stripe_checkout_session_id
    ) then
    return false;
  end if;

  update public.topup_orders
  set payment_status = 'failed',
      status = 'cancelled',
      stripe_checkout_session_id = coalesce(
        v_order.stripe_checkout_session_id,
        p_stripe_checkout_session_id
      ),
      payment_provider = 'stripe'
  where id = p_order_id;

  update public.data_requests
  set public_status = 'open',
      internal_status = 'created',
      payment_status = 'unpaid',
      fulfillment_status = 'not_started',
      completed_order_id = null,
      stripe_checkout_session_id = null,
      stripe_payment_intent_id = null,
      paid_at = null,
      payment_provider = null
  where id = v_request.id;

  return true;
end;
$$;

create or replace function public.mark_data_request_checkout_paid(
  p_order_id uuid,
  p_stripe_checkout_session_id text,
  p_stripe_payment_intent_id text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order public.topup_orders%rowtype;
  v_request public.data_requests%rowtype;
begin
  select * into v_order
  from public.topup_orders
  where id = p_order_id
  for update;

  if not found or v_order.data_request_id is null then
    return false;
  end if;

  select * into v_request
  from public.data_requests
  where id = v_order.data_request_id
  for update;

  if not found
    or v_order.payment_status in ('paid', 'refunded')
    or v_order.status in ('paid', 'processing', 'completed', 'refunded')
    or v_order.supplier_status = 'successful'
    or (
      nullif(btrim(p_stripe_checkout_session_id), '') is not null
      and v_order.stripe_checkout_session_id is not null
      and v_order.stripe_checkout_session_id is distinct from btrim(p_stripe_checkout_session_id)
    )
    or (
      nullif(btrim(p_stripe_checkout_session_id), '') is null
      and nullif(btrim(p_stripe_payment_intent_id), '') is null
    )
    or not (
      (
        v_request.completed_order_id = p_order_id
        and v_request.public_status = 'open'
        and v_request.internal_status = 'payment_pending'
        and v_request.payment_status = 'pending'
      )
      or (
        v_request.completed_order_id is null
        and v_request.public_status = 'open'
        and v_request.internal_status = 'created'
        and v_request.payment_status = 'unpaid'
        and v_order.status = 'cancelled'
        and v_order.payment_status = 'failed'
      )
    ) then
    return false;
  end if;

  update public.topup_orders
  set payment_status = 'paid',
      status = 'processing',
      paid_at = now(),
      stripe_checkout_session_id = coalesce(
        nullif(btrim(p_stripe_checkout_session_id), ''),
        v_order.stripe_checkout_session_id
      ),
      stripe_payment_intent_id = coalesce(
        nullif(btrim(p_stripe_payment_intent_id), ''),
        v_order.stripe_payment_intent_id
      ),
      payment_provider = 'stripe'
  where id = p_order_id;

  update public.data_requests
  set public_status = 'paid',
      internal_status = 'processing',
      payment_status = 'paid',
      completed_order_id = p_order_id,
      paid_at = now(),
      stripe_checkout_session_id = coalesce(
        nullif(btrim(p_stripe_checkout_session_id), ''),
        v_order.stripe_checkout_session_id
      ),
      stripe_payment_intent_id = coalesce(
        nullif(btrim(p_stripe_payment_intent_id), ''),
        v_order.stripe_payment_intent_id
      ),
      payment_provider = 'stripe'
  where id = v_request.id;

  return true;
end;
$$;

revoke all on function public.release_data_request_checkout_claim(uuid, text) from public;
revoke all on function public.mark_data_request_checkout_paid(uuid, text, text) from public;
grant execute on function public.release_data_request_checkout_claim(uuid, text) to service_role;
grant execute on function public.mark_data_request_checkout_paid(uuid, text, text) to service_role;
