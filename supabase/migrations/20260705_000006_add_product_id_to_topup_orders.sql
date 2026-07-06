alter table if exists public.topup_orders
  add column if not exists product_id uuid references public.topup_products(id);

create index if not exists topup_orders_product_id_idx
  on public.topup_orders (product_id);

with matched_products as (
  select
    o.id as order_id,
    p.id as product_id,
    count(*) over (partition by o.id) as match_count
  from public.topup_orders o
  join public.topup_products p
    on p.carrier = o.carrier
   and p.product_type = o.product_type
   and p.name = o.product_name
   and p.amount_usd = o.amount_usd
)
update public.topup_orders o
set product_id = m.product_id
from matched_products m
where o.id = m.order_id
  and m.match_count = 1
  and o.product_id is null;

comment on column public.topup_orders.product_id is
  'Exact product reference for fulfillment. Old orders may remain null until backfilled safely.';
