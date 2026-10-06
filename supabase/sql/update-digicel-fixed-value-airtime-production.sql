-- Digicel Haiti fixed-value airtime catalog for DT One PRODUCTION.
-- Manual SQL Editor preview script. Review the verification SELECT, then
-- replace the final ROLLBACK with COMMIT in a separate reviewed run.

BEGIN;

-- Abort unless each legacy Digicel airtime offer to be changed exists exactly
-- once. Matching on carrier, product type, and the current Boulio name keeps
-- Natcom and all unrelated products out of scope.
DO $preflight$
DECLARE
  v_5_count integer;
  v_10_count integer;
  v_20_count integer;
  v_50_count integer;
BEGIN
  SELECT
    count(*) FILTER (WHERE name = 'Digicel Airtime $5'),
    count(*) FILTER (WHERE name = 'Digicel Airtime $10'),
    count(*) FILTER (WHERE name = 'Digicel Airtime $20'),
    count(*) FILTER (WHERE name = 'Digicel Airtime $50')
  INTO v_5_count, v_10_count, v_20_count, v_50_count
  FROM public.topup_products
  WHERE carrier = 'Digicel'
    AND product_type = 'airtime'
    AND name IN (
      'Digicel Airtime $5',
      'Digicel Airtime $10',
      'Digicel Airtime $20',
      'Digicel Airtime $50'
    );

  IF v_5_count <> 1
    OR v_10_count <> 1
    OR v_20_count <> 1
    OR v_50_count <> 1
  THEN
    RAISE EXCEPTION
      'Expected exactly one row for each legacy Digicel airtime offer ($5, $10, $20, $50); found %, %, %, %',
      v_5_count, v_10_count, v_20_count, v_50_count;
  END IF;
END
$preflight$;

UPDATE public.topup_products
SET
  name = 'Digicel Airtime $5',
  amount_usd = 5.00,
  service_fee_usd = 1.49,
  active = true,
  external_provider = 'dtone',
  external_product_id = '4304',
  external_product_metadata = (COALESCE(external_product_metadata, '{}'::jsonb) - ARRAY[
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
    'destination_amount', 650,
    'destination_currency', 'HTG',
    'supplier_cost_usd', 4.59,
    'dtone_product_type', 'FIXED_VALUE_RECHARGE',
    'dtone_product_id', '4304',
    'fulfillment_mode', 'fixed_value',
    'match_reason', 'Exact verified DT One production fixed-value recharge',
    'dtone_environment', 'production'
  )
WHERE carrier = 'Digicel'
  AND product_type = 'airtime'
  AND name = 'Digicel Airtime $5';

UPDATE public.topup_products
SET
  name = 'Digicel Airtime $10',
  amount_usd = 10.00,
  service_fee_usd = 1.99,
  active = true,
  external_provider = 'dtone',
  external_product_id = '42861',
  external_product_metadata = (COALESCE(external_product_metadata, '{}'::jsonb) - ARRAY[
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
    'destination_amount', 1300,
    'destination_currency', 'HTG',
    'supplier_cost_usd', 9.17,
    'dtone_product_type', 'FIXED_VALUE_RECHARGE',
    'dtone_product_id', '42861',
    'fulfillment_mode', 'fixed_value',
    'match_reason', 'Exact verified DT One production fixed-value recharge',
    'dtone_environment', 'production'
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
    'destination_amount', 2000,
    'destination_currency', 'HTG',
    'supplier_cost_usd', 14.11,
    'dtone_product_type', 'FIXED_VALUE_RECHARGE',
    'dtone_product_id', '3920',
    'fulfillment_mode', 'fixed_value',
    'match_reason', 'Exact verified DT One production fixed-value recharge',
    'dtone_environment', 'production'
  )
WHERE carrier = 'Digicel'
  AND product_type = 'airtime'
  AND name = 'Digicel Airtime $20';

UPDATE public.topup_products
SET active = false
WHERE carrier = 'Digicel'
  AND product_type = 'airtime'
  AND name = 'Digicel Airtime $50';

-- Abort if any target update failed or produced an unexpected final state.
DO $postflight$
DECLARE
  v_mapped_count integer;
  v_inactive_50_count integer;
BEGIN
  SELECT count(*)
  INTO v_mapped_count
  FROM public.topup_products
  WHERE carrier = 'Digicel'
    AND product_type = 'airtime'
    AND (
      (name = 'Digicel Airtime $5'
        AND amount_usd = 5.00
        AND service_fee_usd = 1.49
        AND active = true
        AND external_provider = 'dtone'
        AND external_product_id = '4304'
        AND external_product_metadata @> jsonb_build_object(
          'destination_amount', 650,
          'destination_currency', 'HTG',
          'supplier_cost_usd', 4.59,
          'dtone_product_type', 'FIXED_VALUE_RECHARGE'
        ))
      OR
      (name = 'Digicel Airtime $10'
        AND amount_usd = 10.00
        AND service_fee_usd = 1.99
        AND active = true
        AND external_provider = 'dtone'
        AND external_product_id = '42861'
        AND external_product_metadata @> jsonb_build_object(
          'destination_amount', 1300,
          'destination_currency', 'HTG',
          'supplier_cost_usd', 9.17,
          'dtone_product_type', 'FIXED_VALUE_RECHARGE'
        ))
      OR
      (name = 'Digicel Airtime $15'
        AND amount_usd = 15.00
        AND service_fee_usd = 1.99
        AND active = true
        AND external_provider = 'dtone'
        AND external_product_id = '3920'
        AND external_product_metadata @> jsonb_build_object(
          'destination_amount', 2000,
          'destination_currency', 'HTG',
          'supplier_cost_usd', 14.11,
          'dtone_product_type', 'FIXED_VALUE_RECHARGE'
        ))
    );

  SELECT count(*)
  INTO v_inactive_50_count
  FROM public.topup_products
  WHERE carrier = 'Digicel'
    AND product_type = 'airtime'
    AND name = 'Digicel Airtime $50'
    AND active = false;

  IF v_mapped_count <> 3 OR v_inactive_50_count <> 1 THEN
    RAISE EXCEPTION
      'Post-update assertion failed: expected 3 mapped fixed-value rows and 1 inactive $50 row; found % and %',
      v_mapped_count, v_inactive_50_count;
  END IF;
END
$postflight$;

-- Review these four Digicel rows before replacing the final transaction statement.
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
  external_product_metadata->>'dtone_product_type' AS dtone_product_type
FROM public.topup_products
WHERE carrier = 'Digicel'
  AND product_type = 'airtime'
  AND name IN (
    'Digicel Airtime $5',
    'Digicel Airtime $10',
    'Digicel Airtime $15',
    'Digicel Airtime $50'
  )
ORDER BY amount_usd;

ROLLBACK;
