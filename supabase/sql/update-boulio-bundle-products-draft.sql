-- Boulio bundle/data product refresh draft
-- Safe draft only. Do not execute automatically.
-- Purpose:
-- - Deactivate the old generic 1GB/3GB/5GB/10GB data products.
-- - Add real DT One-style bundle products for Digicel Haiti and Natcom Haiti.
-- - Keep airtime products untouched.
--
-- Service fee note:
-- The values below follow the existing Boulio fee pattern used in the current
-- seed data, but they should still be reviewed before execution.
-- Do not treat these as final pricing until the draft is approved.

-- ---------------------------------------------------------------------------
-- Deactivate the old generic data products
-- ---------------------------------------------------------------------------

UPDATE public.topup_products
SET active = false
WHERE carrier = 'Digicel'
  AND product_type = 'data'
  AND name IN (
    'Digicel Data 1GB',
    'Digicel Data 3GB',
    'Digicel Data 5GB',
    'Digicel Data 10GB'
  );

UPDATE public.topup_products
SET active = false
WHERE carrier = 'Natcom'
  AND product_type = 'data'
  AND name IN (
    'Natcom Data 1GB',
    'Natcom Data 3GB',
    'Natcom Data 5GB',
    'Natcom Data 10GB'
  );

-- ---------------------------------------------------------------------------
-- Digicel Haiti bundle products
-- ---------------------------------------------------------------------------

-- Boulio product: Digicel 7-Day Prepaid Plan
-- DT One product ID: 1975
-- DT One bundle name: 7-Day Prepaid Plan
-- Destination amount: 5 USD
-- Validity: 7 days
-- Why matched: exact DT One bundle name and destination amount; this replaces
-- the old generic data row with a real verified bundle product.
INSERT INTO public.topup_products (
  carrier,
  product_type,
  name,
  bundle_label,
  amount_usd,
  service_fee_usd,
  active,
  external_provider,
  external_product_id,
  external_product_metadata
)
VALUES (
  'Digicel',
  'data',
  'Digicel 7-Day Prepaid Plan',
  '7GB / 7 days',
  5.00,
  1.49,
  true,
  'dtone',
  '1975',
  jsonb_build_object(
    'provider', 'dtone',
    'carrier', 'Digicel',
    'product_type', 'data',
    'dtone_catalog_type', 'Mobile / Bundle',
    'dtone_product_id', '1975',
    'dtone_product_name', '7-Day Prepaid Plan',
    'destination_amount_usd', 5.00,
    'validity_days', 7,
    'bundle_label', '7GB / 7 days',
    'data_benefit', '7GB data',
    'minutes_benefit', null,
    'match_reason', 'Exact verified Digicel bundle match'
  )
);

-- Boulio product: Digicel 7-Day PaleNet Extra
-- DT One product ID: 58256
-- DT One bundle name: 7-Day PaleNet Extra
-- Destination amount: 15 USD
-- Validity: 7 days
-- Why matched: exact DT One bundle name and destination amount.
INSERT INTO public.topup_products (
  carrier,
  product_type,
  name,
  bundle_label,
  amount_usd,
  service_fee_usd,
  active,
  external_provider,
  external_product_id,
  external_product_metadata
)
VALUES (
  'Digicel',
  'data',
  'Digicel 7-Day PaleNet Extra',
  '20GB / 7 days',
  15.00,
  1.99,
  true,
  'dtone',
  '58256',
  jsonb_build_object(
    'provider', 'dtone',
    'carrier', 'Digicel',
    'product_type', 'data',
    'dtone_catalog_type', 'Mobile / Bundle',
    'dtone_product_id', '58256',
    'dtone_product_name', '7-Day PaleNet Extra',
    'destination_amount_usd', 15.00,
    'validity_days', 7,
    'bundle_label', '20GB / 7 days',
    'data_benefit', '20GB data',
    'minutes_benefit', null,
    'match_reason', 'Exact verified Digicel bundle match'
  )
);

-- Boulio product: Digicel 15-Day Stay Connected Plan
-- DT One product ID: 58254
-- DT One bundle name: 15-Day Stay Connected Plan
-- Destination amount: 20 USD
-- Validity: 15 days
-- Why matched: exact DT One bundle name and destination amount.
INSERT INTO public.topup_products (
  carrier,
  product_type,
  name,
  bundle_label,
  amount_usd,
  service_fee_usd,
  active,
  external_provider,
  external_product_id,
  external_product_metadata
)
VALUES (
  'Digicel',
  'data',
  'Digicel 15-Day Stay Connected Plan',
  '12GB / 15 days',
  20.00,
  2.99,
  true,
  'dtone',
  '58254',
  jsonb_build_object(
    'provider', 'dtone',
    'carrier', 'Digicel',
    'product_type', 'data',
    'dtone_catalog_type', 'Mobile / Bundle',
    'dtone_product_id', '58254',
    'dtone_product_name', '15-Day Stay Connected Plan',
    'destination_amount_usd', 20.00,
    'validity_days', 15,
    'bundle_label', '12GB / 15 days',
    'data_benefit', '12GB total data',
    'minutes_benefit', null,
    'match_reason', 'Exact verified Digicel bundle match'
  )
);

-- Boulio product: Digicel 30-Day Prepaid Plan
-- DT One product ID: 58255
-- DT One bundle name: 30-Day Prepaid Plan
-- Destination amount: 24 USD
-- Validity: 30 days
-- Why matched: exact DT One bundle name and validity; destination amount is
-- taken from the verified DT One listing.
INSERT INTO public.topup_products (
  carrier,
  product_type,
  name,
  bundle_label,
  amount_usd,
  service_fee_usd,
  active,
  external_provider,
  external_product_id,
  external_product_metadata
)
VALUES (
  'Digicel',
  'data',
  'Digicel 30-Day Prepaid Plan',
  'Unlimited data / 30 days',
  24.00,
  2.99,
  true,
  'dtone',
  '58255',
  jsonb_build_object(
    'provider', 'dtone',
    'carrier', 'Digicel',
    'product_type', 'data',
    'dtone_catalog_type', 'Mobile / Bundle',
    'dtone_product_id', '58255',
    'dtone_product_name', '30-Day Prepaid Plan',
    'destination_amount_usd', 24.00,
    'validity_days', 30,
    'bundle_label', 'Unlimited data / 30 days',
    'data_benefit', 'Unlimited data',
    'minutes_benefit', null,
    'match_reason', 'Exact verified Digicel bundle match'
  )
);

-- Boulio product: Digicel 30-Day Stay Connected Plan
-- DT One product ID: 58253
-- DT One bundle name: 30-Day Stay Connected Plan
-- Destination amount: 25 USD
-- Validity: 30 days
-- Why matched: exact DT One bundle name and destination amount.
INSERT INTO public.topup_products (
  carrier,
  product_type,
  name,
  bundle_label,
  amount_usd,
  service_fee_usd,
  active,
  external_provider,
  external_product_id,
  external_product_metadata
)
VALUES (
  'Digicel',
  'data',
  'Digicel 30-Day Stay Connected Plan',
  '16GB / 30 days',
  25.00,
  2.99,
  true,
  'dtone',
  '58253',
  jsonb_build_object(
    'provider', 'dtone',
    'carrier', 'Digicel',
    'product_type', 'data',
    'dtone_catalog_type', 'Mobile / Bundle',
    'dtone_product_id', '58253',
    'dtone_product_name', '30-Day Stay Connected Plan',
    'destination_amount_usd', 25.00,
    'validity_days', 30,
    'bundle_label', '16GB / 30 days',
    'data_benefit', '16GB total data',
    'minutes_benefit', null,
    'match_reason', 'Exact verified Digicel bundle match'
  )
);

-- ---------------------------------------------------------------------------
-- Natcom Haiti bundle products
-- ---------------------------------------------------------------------------

-- Boulio product: Natcom 30GB + 110 Minutes / 15 Days
-- DT One product ID: 30165
-- DT One bundle name: 30 GB 110 Minutes 15 Days
-- Destination amount: 10 USD
-- Validity: 15 days
-- Why matched: exact verified Natcom bundle with matching destination amount.
INSERT INTO public.topup_products (
  carrier,
  product_type,
  name,
  bundle_label,
  amount_usd,
  service_fee_usd,
  active,
  external_provider,
  external_product_id,
  external_product_metadata
)
VALUES (
  'Natcom',
  'data',
  'Natcom 30GB + 110 Minutes / 15 Days',
  '30GB + 110 minutes / 15 days',
  10.00,
  1.99,
  true,
  'dtone',
  '30165',
  jsonb_build_object(
    'provider', 'dtone',
    'carrier', 'Natcom',
    'product_type', 'data',
    'dtone_catalog_type', 'Mobile / Bundle',
    'dtone_product_id', '30165',
    'dtone_product_name', '30 GB 110 Minutes 15 Days',
    'destination_amount_usd', 10.00,
    'validity_days', 15,
    'bundle_label', '30GB + 110 minutes / 15 days',
    'data_benefit', '30GB data',
    'minutes_benefit', '110 minutes',
    'match_reason', 'Exact verified Natcom bundle match'
  )
);

-- Boulio product: Natcom 60GB + 220 Minutes / 30 Days
-- DT One product ID: 30166
-- DT One bundle name: 60 GB 220 Minutes 30 Days
-- Destination amount: 20 USD
-- Validity: 30 days
-- Why matched: exact verified Natcom bundle with matching destination amount.
INSERT INTO public.topup_products (
  carrier,
  product_type,
  name,
  bundle_label,
  amount_usd,
  service_fee_usd,
  active,
  external_provider,
  external_product_id,
  external_product_metadata
)
VALUES (
  'Natcom',
  'data',
  'Natcom 60GB + 220 Minutes / 30 Days',
  '60GB + 220 minutes / 30 days',
  20.00,
  2.99,
  true,
  'dtone',
  '30166',
  jsonb_build_object(
    'provider', 'dtone',
    'carrier', 'Natcom',
    'product_type', 'data',
    'dtone_catalog_type', 'Mobile / Bundle',
    'dtone_product_id', '30166',
    'dtone_product_name', '60 GB 220 Minutes 30 Days',
    'destination_amount_usd', 20.00,
    'validity_days', 30,
    'bundle_label', '60GB + 220 minutes / 30 days',
    'data_benefit', '60GB data',
    'minutes_benefit', '220 minutes',
    'match_reason', 'Exact verified Natcom bundle match'
  )
);

-- Boulio product: Natcom 90GB + 330 Minutes / 30 Days
-- DT One product ID: 58222
-- DT One bundle name: 90 GB 330 Minutes 30 Days
-- Destination amount: 30 USD
-- Validity: 30 days
-- Why matched: exact verified Natcom bundle with matching destination amount.
INSERT INTO public.topup_products (
  carrier,
  product_type,
  name,
  bundle_label,
  amount_usd,
  service_fee_usd,
  active,
  external_provider,
  external_product_id,
  external_product_metadata
)
VALUES (
  'Natcom',
  'data',
  'Natcom 90GB + 330 Minutes / 30 Days',
  '90GB + 330 minutes / 30 days',
  30.00,
  3.99,
  true,
  'dtone',
  '58222',
  jsonb_build_object(
    'provider', 'dtone',
    'carrier', 'Natcom',
    'product_type', 'data',
    'dtone_catalog_type', 'Mobile / Bundle',
    'dtone_product_id', '58222',
    'dtone_product_name', '90 GB 330 Minutes 30 Days',
    'destination_amount_usd', 30.00,
    'validity_days', 30,
    'bundle_label', '90GB + 330 minutes / 30 days',
    'data_benefit', '90GB data',
    'minutes_benefit', '330 minutes',
    'match_reason', 'Exact verified Natcom bundle match'
  )
);

-- Boulio product: Natcom 200GB + Unlimited Minutes / 30 Days
-- DT One product ID: 58221
-- DT One bundle name: 200 GB Unlimited Minutes 30 Days
-- Destination amount: 50 USD
-- Validity: 30 days
-- Why matched: exact verified Natcom bundle with matching destination amount.
INSERT INTO public.topup_products (
  carrier,
  product_type,
  name,
  bundle_label,
  amount_usd,
  service_fee_usd,
  active,
  external_provider,
  external_product_id,
  external_product_metadata
)
VALUES (
  'Natcom',
  'data',
  'Natcom 200GB + Unlimited Minutes / 30 Days',
  '200GB + unlimited minutes / 30 days',
  50.00,
  4.99,
  true,
  'dtone',
  '58221',
  jsonb_build_object(
    'provider', 'dtone',
    'carrier', 'Natcom',
    'product_type', 'data',
    'dtone_catalog_type', 'Mobile / Bundle',
    'dtone_product_id', '58221',
    'dtone_product_name', '200 GB Unlimited Minutes 30 Days',
    'destination_amount_usd', 50.00,
    'validity_days', 30,
    'bundle_label', '200GB + unlimited minutes / 30 days',
    'data_benefit', '200GB data',
    'minutes_benefit', 'Unlimited minutes',
    'match_reason', 'Exact verified Natcom bundle match'
  )
);

-- ---------------------------------------------------------------------------
-- Notes for review
-- ---------------------------------------------------------------------------

-- The old generic Digicel/Natcom 1GB/3GB/5GB/10GB data rows are intentionally
-- deactivated above because they do not match the verified DT One bundle
-- products closely enough to fulfill safely.
-- If the team decides to keep them visible in the UI, they should remain
-- unmapped and must not be used for supplier fulfillment.
