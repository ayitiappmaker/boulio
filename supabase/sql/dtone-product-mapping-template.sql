-- DT One product mapping template
-- Safe review-only SQL for identifying products that still need mapping.
-- Do not replace the placeholder ids below with guessed live DT One ids.

select
  id,
  carrier,
  product_type,
  name,
  bundle_label,
  amount_usd,
  service_fee_usd,
  total_usd,
  external_provider,
  external_product_id,
  external_product_metadata
from public.topup_products
order by carrier, product_type, amount_usd;

-- Products missing a DT One mapping
select
  id,
  carrier,
  product_type,
  name,
  bundle_label,
  amount_usd,
  service_fee_usd,
  total_usd,
  external_provider,
  external_product_id,
  external_product_metadata
from public.topup_products
where external_provider is null
   or external_product_id is null
order by carrier, product_type, amount_usd;

-- Example placeholder update only.
-- Replace TODO_BULIO_PRODUCT_ID and TODO_DTONE_PRODUCT_ID only after a real
-- DT One catalog review. Do not use guessed ids.
--
-- update public.topup_products
-- set
--   external_provider = 'dtone',
--   external_product_id = 'TODO_DTONE_PRODUCT_ID',
--   external_product_metadata = jsonb_build_object(
--     'reviewed', false,
--     'notes', 'Placeholder only. Replace after catalog validation.'
--   )
-- where id = 'TODO_BULIO_PRODUCT_ID';
