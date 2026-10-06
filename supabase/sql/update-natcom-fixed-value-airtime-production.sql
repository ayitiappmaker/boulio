-- Natcom Haiti fixed-value airtime catalog for DT One PRODUCTION.
-- Manual SQL Editor preview script only. It intentionally ends in ROLLBACK.
-- Review the verification SELECT before preparing any separately approved run.
--
-- Expected legacy -> production mapping (customer-facing USD prices unchanged):
--   Natcom Airtime $5  ($5.00)  -> 9762,  644.74 HTG, wholesale $4.63 USD
--   Natcom Airtime $10 ($10.00) -> 8023, 1289.48 HTG, wholesale $9.26 USD
--   Natcom Airtime $20 ($20.00) -> 8033, 2578.95 HTG, wholesale $18.51 USD
--
-- DT One reports USD at the top-level destination for these products, but the
-- authoritative recipient credit is benefits[CREDITS].amount.base in HTG.
-- Boulio stores that benefit as destination_amount/destination_currency.
-- Product 11213, Natcom Airtime $50, Natcom bundles, and Digicel are excluded.

BEGIN;

-- Abort unless each intended legacy row exists exactly once at its established
-- Boulio base price. active is deliberately inspected but not required or changed.
DO $preflight$
DECLARE
  v_5_count integer;
  v_10_count integer;
  v_20_count integer;
BEGIN
  SELECT
    count(*) FILTER (WHERE name = 'Natcom Airtime $5' AND amount_usd = 5.00),
    count(*) FILTER (WHERE name = 'Natcom Airtime $10' AND amount_usd = 10.00),
    count(*) FILTER (WHERE name = 'Natcom Airtime $20' AND amount_usd = 20.00)
  INTO v_5_count, v_10_count, v_20_count
  FROM public.topup_products
  WHERE carrier = 'Natcom'
    AND product_type = 'airtime'
    AND name IN (
      'Natcom Airtime $5',
      'Natcom Airtime $10',
      'Natcom Airtime $20'
    );

  IF v_5_count <> 1 OR v_10_count <> 1 OR v_20_count <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one Natcom airtime row at each established base price ($5, $10, $20); found %, %, %',
      v_5_count, v_10_count, v_20_count;
  END IF;
END
$preflight$;

WITH mapping(name, amount_usd, external_product_id, destination_amount, supplier_cost_usd) AS (
  VALUES
    ('Natcom Airtime $5',  5.00::numeric, '9762',  644.74::numeric,  4.63::numeric),
    ('Natcom Airtime $10', 10.00::numeric, '8023', 1289.48::numeric,  9.26::numeric),
    ('Natcom Airtime $20', 20.00::numeric, '8033', 2578.95::numeric, 18.51::numeric)
)
UPDATE public.topup_products AS product
SET
  external_provider = 'dtone',
  external_product_id = mapping.external_product_id,
  external_product_metadata = (COALESCE(product.external_product_metadata, '{}'::jsonb) - ARRAY[
    'calculation_mode',
    'source_unit',
    'source_amount',
    'source_min',
    'source_max',
    'source_amount_min',
    'source_amount_max',
    'destination_min',
    'destination_max',
    'destination_amount_min',
    'destination_amount_max',
    'min_amount',
    'max_amount',
    'open_range',
    'dtone_product_name'
  ]) || jsonb_build_object(
    'destination_amount', mapping.destination_amount,
    'destination_currency', 'HTG',
    'supplier_cost_usd', mapping.supplier_cost_usd,
    'dtone_product_type', 'FIXED_VALUE_RECHARGE',
    'dtone_product_id', mapping.external_product_id,
    'fulfillment_mode', 'fixed_value',
    'match_reason', 'Exact authenticated DT One production fixed-value recharge; HTG recipient credit from CREDITS benefit',
    'dtone_environment', 'production'
  )
FROM mapping
WHERE product.carrier = 'Natcom'
  AND product.product_type = 'airtime'
  AND product.name = mapping.name
  AND product.amount_usd = mapping.amount_usd;

-- Abort if any intended mapping is missing or has an unexpected final value.
DO $postflight$
DECLARE
  v_mapped_count integer;
BEGIN
  SELECT count(*)
  INTO v_mapped_count
  FROM public.topup_products
  WHERE carrier = 'Natcom'
    AND product_type = 'airtime'
    AND (
      (name = 'Natcom Airtime $5'
        AND amount_usd = 5.00
        AND external_provider = 'dtone'
        AND external_product_id = '9762'
        AND external_product_metadata @> jsonb_build_object(
          'destination_amount', 644.74,
          'destination_currency', 'HTG',
          'supplier_cost_usd', 4.63,
          'dtone_product_type', 'FIXED_VALUE_RECHARGE',
          'fulfillment_mode', 'fixed_value'
        ))
      OR
      (name = 'Natcom Airtime $10'
        AND amount_usd = 10.00
        AND external_provider = 'dtone'
        AND external_product_id = '8023'
        AND external_product_metadata @> jsonb_build_object(
          'destination_amount', 1289.48,
          'destination_currency', 'HTG',
          'supplier_cost_usd', 9.26,
          'dtone_product_type', 'FIXED_VALUE_RECHARGE',
          'fulfillment_mode', 'fixed_value'
        ))
      OR
      (name = 'Natcom Airtime $20'
        AND amount_usd = 20.00
        AND external_provider = 'dtone'
        AND external_product_id = '8033'
        AND external_product_metadata @> jsonb_build_object(
          'destination_amount', 2578.95,
          'destination_currency', 'HTG',
          'supplier_cost_usd', 18.51,
          'dtone_product_type', 'FIXED_VALUE_RECHARGE',
          'fulfillment_mode', 'fixed_value'
        ))
    );

  IF v_mapped_count <> 3 THEN
    RAISE EXCEPTION
      'Post-update assertion failed: expected 3 mapped Natcom fixed-value rows; found %',
      v_mapped_count;
  END IF;
END
$postflight$;

-- Verify the three narrowly targeted rows, including their unchanged active state.
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
  external_product_metadata->>'supplier_cost_usd' AS supplier_cost_usd,
  external_product_metadata->>'dtone_product_type' AS dtone_product_type,
  external_product_metadata->>'fulfillment_mode' AS fulfillment_mode,
  external_product_metadata->>'dtone_environment' AS dtone_environment
FROM public.topup_products
WHERE carrier = 'Natcom'
  AND product_type = 'airtime'
  AND (
    (name = 'Natcom Airtime $5' AND amount_usd = 5.00)
    OR (name = 'Natcom Airtime $10' AND amount_usd = 10.00)
    OR (name = 'Natcom Airtime $20' AND amount_usd = 20.00)
  )
ORDER BY amount_usd;

ROLLBACK;
