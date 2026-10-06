-- Keep request-linked checkout state aligned with the shared fulfillment claim.
-- This changes no eligibility rules and does not scan or enqueue historical rows.

create or replace function public.claim_topup_fulfillment(
  p_order_id uuid,
  p_supplier_reference text
)
returns table (
  id uuid, product_id uuid, carrier text, product_type text, product_name text,
  recipient_phone text, amount_usd numeric, service_fee_usd numeric,
  total_usd numeric, status text, payment_status text, supplier_status text,
  supplier_reference text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimed as (
    update public.topup_orders o
    set supplier_status = 'processing',
        status = case when o.status = 'paid' then 'processing' else o.status end,
        supplier_reference = p_supplier_reference,
        updated_at = now()
    where o.id = p_order_id
      and o.payment_status = 'paid'
      and o.supplier_status = 'not_sent'
      and o.supplier_reference is null
      and o.status <> 'completed'
    returning o.*
  ), request_updated as (
    update public.data_requests r
    set fulfillment_status = 'processing',
        internal_status = 'processing',
        updated_at = now()
    from claimed c
    where (r.id = c.data_request_id or r.completed_order_id = c.id)
      and r.payment_status = 'paid'
    returning r.id
  )
  select c.id, c.product_id, c.carrier, c.product_type, c.product_name,
         c.recipient_phone, c.amount_usd, c.service_fee_usd, c.total_usd,
         c.status, c.payment_status, c.supplier_status, c.supplier_reference
  from claimed c;
end;
$$;

create or replace function public.finalize_topup_fulfillment(
  p_order_id uuid,
  p_supplier_status text,
  p_status text,
  p_supplier_reference text
)
returns table (
  id uuid, product_id uuid, carrier text, product_type text, product_name text,
  recipient_phone text, amount_usd numeric, service_fee_usd numeric,
  total_usd numeric, status text, payment_status text, supplier_status text,
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
  with finalized as (
    update public.topup_orders o
    set supplier_status = p_supplier_status,
        status = p_status,
        supplier_reference = coalesce(p_supplier_reference, o.supplier_reference),
        updated_at = now()
    where o.id = p_order_id
      and o.supplier_status in ('processing', 'pending')
    returning o.*
  ), request_updated as (
    update public.data_requests r
    set fulfillment_status = case
          when p_supplier_status = 'successful' then 'successful'
          when p_supplier_status = 'failed' then 'failed'
          else 'processing'
        end,
        public_status = case when p_supplier_status = 'successful' then 'completed' else r.public_status end,
        internal_status = case
          when p_supplier_status = 'successful' then 'completed'
          when p_supplier_status = 'failed' then 'failed'
          else 'processing'
        end,
        updated_at = now()
    from finalized f
    where (r.id = f.data_request_id or r.completed_order_id = f.id)
      and r.payment_status = 'paid'
    returning r.id
  )
  select f.id, f.product_id, f.carrier, f.product_type, f.product_name,
         f.recipient_phone, f.amount_usd, f.service_fee_usd, f.total_usd,
         f.status, f.payment_status, f.supplier_status, f.supplier_reference
  from finalized f;
end;
$$;

revoke all on function public.claim_topup_fulfillment(uuid, text) from public;
revoke all on function public.claim_topup_fulfillment(uuid, text) from anon;
revoke all on function public.claim_topup_fulfillment(uuid, text) from authenticated;
revoke all on function public.finalize_topup_fulfillment(uuid, text, text, text) from public;
revoke all on function public.finalize_topup_fulfillment(uuid, text, text, text) from anon;
revoke all on function public.finalize_topup_fulfillment(uuid, text, text, text) from authenticated;
grant execute on function public.claim_topup_fulfillment(uuid, text) to service_role;
grant execute on function public.finalize_topup_fulfillment(uuid, text, text, text) to service_role;
