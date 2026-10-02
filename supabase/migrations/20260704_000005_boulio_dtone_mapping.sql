-- Boulio DT One mapping prep
-- Phase only: add nullable mapping columns for future supplier alignment.
-- No DT One calls, no fulfillment behavior, no live product ids.

alter table if exists public.topup_products
  add column if not exists external_provider text,
  add column if not exists external_product_id text,
  add column if not exists external_product_metadata jsonb;

comment on column public.topup_products.external_provider is
  'Future supplier/provider name for fulfillment mapping. Keep null until a real mapping exists.';

comment on column public.topup_products.external_product_id is
  'Future external supplier product id. Use placeholder values only in development.';

comment on column public.topup_products.external_product_metadata is
  'Future supplier metadata for mapping and validation. Keep null until reviewed.';
