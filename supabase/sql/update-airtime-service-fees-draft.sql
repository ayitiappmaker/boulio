-- Boulio airtime service fee refresh draft
-- Safe draft only. Do not execute automatically.
-- Purpose:
-- - Update active airtime products to match the current Boulio service fee schedule.
-- - Do not change product active status.
-- - Do not change external_provider or external_product_id.
-- - Do not enable fulfillment.
-- - Do not change payment or webhook logic.

-- Fee schedule:
-- $1.00 to $4.99  => $0.99
-- $5.00 to $9.99  => $1.49
-- $10.00 to $19.99 => $1.99
-- $20.00 to $29.99 => $2.99
-- $30.00 to $49.99 => $3.99
-- $50.00 and above => $4.99

-- ---------------------------------------------------------------------------
-- Digicel airtime products
-- ---------------------------------------------------------------------------

UPDATE public.topup_products
SET service_fee_usd = 1.49
WHERE carrier = 'Digicel'
  AND product_type = 'airtime'
  AND name = 'Digicel Airtime $5'
  AND active = true;

UPDATE public.topup_products
SET service_fee_usd = 1.99
WHERE carrier = 'Digicel'
  AND product_type = 'airtime'
  AND name = 'Digicel Airtime $10'
  AND active = true;

UPDATE public.topup_products
SET service_fee_usd = 2.99
WHERE carrier = 'Digicel'
  AND product_type = 'airtime'
  AND name = 'Digicel Airtime $20'
  AND active = true;

UPDATE public.topup_products
SET service_fee_usd = 4.99
WHERE carrier = 'Digicel'
  AND product_type = 'airtime'
  AND name = 'Digicel Airtime $50'
  AND active = true;

-- ---------------------------------------------------------------------------
-- Natcom airtime products
-- ---------------------------------------------------------------------------

UPDATE public.topup_products
SET service_fee_usd = 1.49
WHERE carrier = 'Natcom'
  AND product_type = 'airtime'
  AND name = 'Natcom Airtime $5'
  AND active = true;

UPDATE public.topup_products
SET service_fee_usd = 1.99
WHERE carrier = 'Natcom'
  AND product_type = 'airtime'
  AND name = 'Natcom Airtime $10'
  AND active = true;

UPDATE public.topup_products
SET service_fee_usd = 2.99
WHERE carrier = 'Natcom'
  AND product_type = 'airtime'
  AND name = 'Natcom Airtime $20'
  AND active = true;

UPDATE public.topup_products
SET service_fee_usd = 4.99
WHERE carrier = 'Natcom'
  AND product_type = 'airtime'
  AND name = 'Natcom Airtime $50'
  AND active = true;
