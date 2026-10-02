-- Boulio DT One airtime mapping draft
-- Safe draft only. Do not execute automatically.
-- This file updates only clearly matched airtime products.
-- Do not map data products here.
-- Do not use Open_Range products.
-- Do not enable fulfillment.

-- ---------------------------------------------------------------------------
-- Matched products
-- ---------------------------------------------------------------------------

-- Natcom Haiti airtime mapping
-- Boulio product: Natcom Airtime $5
-- DT One product ID: 9762
-- DT One product type: fixed-value airtime
-- Why matched: Boulio seed amount is USD-denominated and exactly matches the
-- verified DT One fixed-value Natcom $5 airtime product.
UPDATE public.topup_products
SET
  external_provider = 'dtone',
  external_product_id = '9762',
  external_product_metadata = jsonb_build_object(
    'provider', 'dtone',
    'carrier', 'Natcom',
    'product_type', 'airtime',
    'boulio_product_name', 'Natcom Airtime $5',
    'boulio_amount_usd', 5.00,
    'dtone_product_id', '9762',
    'dtone_product_name', 'Verified Natcom fixed-value airtime $5',
    'dtone_amount', 5.00,
    'match_reason', 'Exact USD fixed-value airtime match'
  )
WHERE carrier = 'Natcom'
  AND product_type = 'airtime'
  AND name = 'Natcom Airtime $5'
  AND active = true;

-- Natcom Haiti airtime mapping
-- Boulio product: Natcom Airtime $10
-- DT One product ID: 8023
-- DT One product type: fixed-value airtime
-- Why matched: Boulio seed amount is USD-denominated and exactly matches the
-- verified DT One fixed-value Natcom $10 airtime product.
UPDATE public.topup_products
SET
  external_provider = 'dtone',
  external_product_id = '8023',
  external_product_metadata = jsonb_build_object(
    'provider', 'dtone',
    'carrier', 'Natcom',
    'product_type', 'airtime',
    'boulio_product_name', 'Natcom Airtime $10',
    'boulio_amount_usd', 10.00,
    'dtone_product_id', '8023',
    'dtone_product_name', 'Verified Natcom fixed-value airtime $10',
    'dtone_amount', 10.00,
    'match_reason', 'Exact USD fixed-value airtime match'
  )
WHERE carrier = 'Natcom'
  AND product_type = 'airtime'
  AND name = 'Natcom Airtime $10'
  AND active = true;

-- Natcom Haiti airtime mapping
-- Boulio product: Natcom Airtime $20
-- DT One product ID: 8033
-- DT One product type: fixed-value airtime
-- Why matched: Boulio seed amount is USD-denominated and exactly matches the
-- verified DT One fixed-value Natcom $20 airtime product.
UPDATE public.topup_products
SET
  external_provider = 'dtone',
  external_product_id = '8033',
  external_product_metadata = jsonb_build_object(
    'provider', 'dtone',
    'carrier', 'Natcom',
    'product_type', 'airtime',
    'boulio_product_name', 'Natcom Airtime $20',
    'boulio_amount_usd', 20.00,
    'dtone_product_id', '8033',
    'dtone_product_name', 'Verified Natcom fixed-value airtime $20',
    'dtone_amount', 20.00,
    'match_reason', 'Exact USD fixed-value airtime match'
  )
WHERE carrier = 'Natcom'
  AND product_type = 'airtime'
  AND name = 'Natcom Airtime $20'
  AND active = true;

-- ---------------------------------------------------------------------------
-- Unmapped / uncertain products
-- ---------------------------------------------------------------------------

-- Natcom Airtime $50:
-- No verified fixed-value DT One mapping was provided for this Boulio seed
-- product, so it stays unmapped in this draft.

-- Digicel Airtime $5:
-- The verified Digicel DT One list provided to us is fixed-value in HTG, while
-- the Boulio seed products are USD-denominated. No safe, explicit fixed-value
-- match was provided for this product, so it stays unmapped.

-- Digicel Airtime $10:
-- No safe fixed-value match was provided. Leave unmapped.

-- Digicel Airtime $20:
-- No safe fixed-value match was provided. Leave unmapped.

-- Digicel Airtime $50:
-- No safe fixed-value match was provided. Leave unmapped.

-- Digicel data and Natcom data products are intentionally excluded from this
-- draft. Do not map data products yet.

