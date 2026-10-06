-- Digicel Haiti fixed-value airtime catalog for DT One PREPROD only.
-- Manual SQL Editor script. Do not run against production.
-- The production DT One product IDs must be verified independently first.
-- Existing JSON metadata is preserved with the jsonb || operator.

BEGIN;

UPDATE public.topup_products
SET
  name = 'Digicel Airtime $5',
  amount_usd = 5.00,
  active = true,
  external_provider = 'dtone',
  external_product_id = '4304',
  external_product_metadata = (COALESCE(external_product_metadata, '{}'::jsonb) - ARRAY[
    'calculation_mode', 'dtone_product_name', 'source_unit'
  ]) || jsonb_build_object(
    'destination_amount', 650,
    'destination_currency', 'HTG',
    'supplier_cost_usd', 4.59,
    'dtone_product_type', 'FIXED_VALUE_RECHARGE',
    'dtone_product_id', '4304',
    'fulfillment_mode', 'fixed_value',
    'match_reason', 'Exact verified DT One preprod fixed-value recharge',
    'dtone_environment', 'preprod'
  )
WHERE carrier = 'Digicel'
  AND product_type = 'airtime'
  AND name = 'Digicel Airtime $5';

UPDATE public.topup_products
SET
  name = 'Digicel Airtime $10',
  amount_usd = 10.00,
  active = true,
  external_provider = 'dtone',
  external_product_id = '42861',
  external_product_metadata = (COALESCE(external_product_metadata, '{}'::jsonb) - ARRAY[
    'calculation_mode', 'dtone_product_name', 'source_unit'
  ]) || jsonb_build_object(
    'destination_amount', 1300,
    'destination_currency', 'HTG',
    'supplier_cost_usd', 9.17,
    'dtone_product_type', 'FIXED_VALUE_RECHARGE',
    'dtone_product_id', '42861',
    'fulfillment_mode', 'fixed_value',
    'match_reason', 'Exact verified DT One preprod fixed-value recharge',
    'dtone_environment', 'preprod'
  )
WHERE carrier = 'Digicel'
  AND product_type = 'airtime'
  AND name = 'Digicel Airtime $10';

UPDATE public.topup_products
SET
  name = 'Digicel Airtime $15',
  amount_usd = 15.00,
  service_fee_usd = 1.99,
  active = true,
  external_provider = 'dtone',
  external_product_id = '3920',
  external_product_metadata = (COALESCE(external_product_metadata, '{}'::jsonb) - ARRAY[
    'calculation_mode', 'dtone_product_name', 'source_unit'
  ]) || jsonb_build_object(
    'destination_amount', 2000,
    'destination_currency', 'HTG',
    'supplier_cost_usd', 14.11,
    'dtone_product_type', 'FIXED_VALUE_RECHARGE',
    'dtone_product_id', '3920',
    'fulfillment_mode', 'fixed_value',
    'match_reason', 'Exact verified DT One preprod fixed-value recharge',
    'dtone_environment', 'preprod'
  )
WHERE carrier = 'Digicel'
  AND product_type = 'airtime'
  AND name = 'Digicel Airtime $20';

UPDATE public.topup_products
SET active = false
WHERE carrier = 'Digicel'
  AND product_type = 'airtime'
  AND name = 'Digicel Airtime $50';

-- Expect exactly three active rows before committing this transaction.
SELECT
  id,
  carrier,
  product_type,
  name,
  amount_usd,
  service_fee_usd,
  active,
  external_provider,
  external_product_id,
  external_product_metadata->>'destination_amount' AS destination_amount,
  external_product_metadata->>'destination_currency' AS destination_currency,
  external_product_metadata->>'supplier_cost_usd' AS supplier_cost_usd
FROM public.topup_products
WHERE carrier = 'Digicel'
  AND product_type = 'airtime'
ORDER BY amount_usd;

-- Change this to COMMIT only after reviewing the SELECT result in PREPROD.
ROLLBACK;
