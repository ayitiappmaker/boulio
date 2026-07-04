-- Boulio payment metadata
-- Adds nullable Stripe tracking fields only. No payment logic is connected yet.

alter table public.topup_orders
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists paid_at timestamptz,
  add column if not exists payment_provider text;

alter table public.data_requests
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists paid_at timestamptz,
  add column if not exists payment_provider text;

-- These columns are intentionally nullable so future server-side checkout and
-- webhook flows can attach provider ids after the fact without changing the
-- current client-facing order/request creation flow.
