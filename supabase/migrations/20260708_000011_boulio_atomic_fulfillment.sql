-- Boulio atomic fulfillment / supplier handoff
--
-- Closes a check-then-send-then-write race in the DT One manual fulfillment
-- flow: two concurrent or retried admin calls could previously both read a
-- paid order with no supplier_reference yet and both send it to DT One,
-- because the reference was only written after the supplier call returned.
--
-- 'processing' is added as a legal supplier_status value: it marks a row as
-- atomically claimed for a fulfillment attempt, between "never attempted"
-- and a confirmed supplier outcome. (The application code already checked
-- for supplier_status = 'processing' in check_status reconciliation before
-- this migration; the constraint just never allowed it to be stored.)
--
-- claim_topup_fulfillment and finalize_topup_fulfillment are guarded,
-- service-role-only RPCs. Neither performs any caller authorization of its
-- own -- that is enforced entirely upstream by admin-fulfillment-action
-- (verified admin) and fulfill-topup (admin secret) -- so execute is
-- revoked from PUBLIC and granted only to service_role.

alter table public.topup_orders
  drop constraint if exists topup_orders_supplier_status_check;

alter table public.topup_orders
  add constraint topup_orders_supplier_status_check
  check (supplier_status in ('not_sent', 'processing', 'pending', 'successful', 'failed'));

-- Atomically claims a paid, never-attempted order for a single fulfillment
-- attempt. Only a row that is still payment_status='paid',
-- supplier_status='not_sent', supplier_reference is null, and not already
-- completed can be claimed. The claim itself stamps supplier_reference with
-- the deterministic external id (the same value sent to DT One as
-- external_id) before any supplier call happens, so the UPDATE...WHERE is
-- the single atomic gate: at most one concurrent caller will ever see a
-- non-empty result for a given order id.
create or replace function public.claim_topup_fulfillment(
  p_order_id uuid,
  p_supplier_reference text
)
returns table (
  id uuid,
  product_id uuid,
  carrier text,
  product_type text,
  product_name text,
  recipient_phone text,
  amount_usd numeric,
  service_fee_usd numeric,
  total_usd numeric,
  status text,
  payment_status text,
  supplier_status text,
  supplier_reference text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.topup_orders o
  set
    supplier_status = 'processing',
    status = case when o.status = 'paid' then 'processing' else o.status end,
    supplier_reference = p_supplier_reference,
    updated_at = now()
  where o.id = p_order_id
    and o.payment_status = 'paid'
    and o.supplier_status = 'not_sent'
    and o.supplier_reference is null
    and o.status <> 'completed'
  returning
    o.id, o.product_id, o.carrier, o.product_type, o.product_name, o.recipient_phone,
    o.amount_usd, o.service_fee_usd, o.total_usd, o.status, o.payment_status,
    o.supplier_status, o.supplier_reference;
end;
$$;

revoke all on function public.claim_topup_fulfillment(uuid, text) from public;
grant execute on function public.claim_topup_fulfillment(uuid, text) to service_role;

-- Finalizes a fulfillment attempt based on the supplier's actual response.
-- Only applies to a row that is currently 'processing' (freshly claimed, or
-- still awaiting a first confirmed outcome) or 'pending' (a prior
-- check_status/live_manual call already recorded an unconfirmed supplier
-- response and this call is reconciling it). Any other current state means
-- the row was already resolved by a concurrent/earlier call, so this
-- becomes a safe no-op (zero rows updated) instead of overwriting a
-- terminal outcome.
create or replace function public.finalize_topup_fulfillment(
  p_order_id uuid,
  p_supplier_status text,
  p_status text,
  p_supplier_reference text
)
returns table (
  id uuid,
  product_id uuid,
  carrier text,
  product_type text,
  product_name text,
  recipient_phone text,
  amount_usd numeric,
  service_fee_usd numeric,
  total_usd numeric,
  status text,
  payment_status text,
  supplier_status text,
  supplier_reference text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_supplier_status not in ('successful', 'pending', 'failed') then
    raise exception 'invalid supplier_status for finalize_topup_fulfillment: %', p_supplier_status;
  end if;

  if p_status not in ('processing', 'completed', 'failed') then
    raise exception 'invalid status for finalize_topup_fulfillment: %', p_status;
  end if;

  return query
  update public.topup_orders o
  set
    supplier_status = p_supplier_status,
    status = p_status,
    supplier_reference = coalesce(p_supplier_reference, o.supplier_reference),
    updated_at = now()
  where o.id = p_order_id
    and o.supplier_status in ('processing', 'pending')
  returning
    o.id, o.product_id, o.carrier, o.product_type, o.product_name, o.recipient_phone,
    o.amount_usd, o.service_fee_usd, o.total_usd, o.status, o.payment_status,
    o.supplier_status, o.supplier_reference;
end;
$$;

revoke all on function public.finalize_topup_fulfillment(uuid, text, text, text) from public;
grant execute on function public.finalize_topup_fulfillment(uuid, text, text, text) to service_role;
