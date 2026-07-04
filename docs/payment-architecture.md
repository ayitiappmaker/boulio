# Payment Architecture

Boulio will treat payments as service checkout, not as money transfer, wallet, remittance, or cash pickup.

## Service payment flow

### Top-up orders
- A signed-in user creates a `topup_orders` row first.
- The client only creates a pending order with trusted product data already selected from the catalog.
- Stripe payment will be created server-side for that order, using the order id as the source of truth.
- The client must never submit its own price as authoritative.
- The server should read the order record, validate the product, and create the Stripe Checkout Session or Payment Intent from the stored amount.

### Data requests
- A signed-in user creates a `data_requests` row first.
- The request row becomes the payment target for the supporter flow.
- Stripe payment will be created server-side using the request id or request code as the source of truth.
- The client must never submit its own price as authoritative.
- The server should read the request record, validate the bundle and carrier, and create the Stripe payment object from the stored amount.

## Why payment must be server-side

- Stripe secret keys must never ship to the app.
- The server can verify the stored order/request amount before creating payment.
- The server can attach metadata for reconciliation.
- The server can update records after webhook confirmation without trusting the client.

## Status changes

### Top-up orders
- Before payment: `pending_payment`
- After successful payment: `paid`
- After supplier fulfillment starts: `processing`
- After fulfillment succeeds: `completed`
- After failure or refund: `failed`, `refunded`, or `cancelled`

### Data requests
- Before payment: `open` or `payment_pending`
- After successful payment: `paid`
- After supporter/service fulfillment starts: `processing`
- After fulfillment succeeds: `completed`
- After expiry, cancellation, or failure: `expired`, `cancelled`, or `failed`

## Webhook responsibilities later

Stripe webhook handling should live on the server or in Supabase Edge Functions later.
The webhook is the source of truth for payment completion once live.

In test mode, the webhook is already responsible for status updates after verified
events, while the client remains read-only for payment state.

The webhook must verify the Stripe signature before it changes any row.

The webhook should:
- confirm payment success or failure
- store Stripe ids on the matching order/request
- set `paid_at`
- update payment status fields
- move orders or requests into the next backend-controlled stage
- handle these Stripe events:
  - `checkout.session.completed`
  - `payment_intent.succeeded`
  - `payment_intent.payment_failed`
  - `checkout.session.expired`
- be idempotent when Stripe retries the same event
- reject unverified or live-mode events during the test-mode phase

## Status transition plan

### Top-up orders
- `pending_payment` to `paid` after Stripe confirms payment
- `paid` to `processing` when supplier fulfillment begins
- `processing` to `completed` when fulfillment succeeds
- `payment_intent.payment_failed` keeps the order unpaid or failed, depending on final schema rules
- `checkout.session.expired` keeps the order pending/unpaid or marks it expired if the schema later supports that state
- the client never marks an order paid

### Data requests
- `open` or `payment_pending` to `paid` after Stripe confirms payment
- `paid` to `processing` when fulfillment begins
- `processing` to `completed` when fulfillment succeeds
- `payment_intent.payment_failed` keeps the request unpaid or failed, depending on final schema rules
- `checkout.session.expired` keeps the request pending/unpaid or marks it expired if the schema later supports that state
- the client never marks a request paid

## Supabase Edge Function shape

The future `create-payment` Edge Function should:

- accept `target_type` and `target_id`
- validate the authenticated user when the target requires ownership
- fetch the stored order or request from Supabase using the service role key
- verify the record exists and is eligible for payment
- refuse targets that are already paid, completed, cancelled, or expired
- return a safe placeholder response until Stripe Checkout is enabled

When Stripe is turned on later, the same function should:

- create the Stripe Checkout Session or Payment Intent server-side
- attach the Supabase order/request id in metadata
- store Stripe identifiers back on the row
- leave fulfillment to a later backend step
- continue to reject any attempt for the client to mark payment complete
- avoid fulfillment until the webhook confirms payment and the supplier phase is ready

## Test mode checkout

Stripe Checkout should stay in test mode only until the webhook and fulfillment handoff are fully verified.

The checkout session should include metadata such as:
- `target_type`
- `target_id`
- `user_id` when the order belongs to a signed-in user
- `request_code` when a data request is paid by request link
- `environment: test`

Required environment variables for the checkout endpoint:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `CHECKOUT_SUCCESS_URL`
- `CHECKOUT_CANCEL_URL`

If the checkout URLs are not configured yet, the function can fall back to a local preview URL such as `http://localhost:8087/`.

Test card usage:
- Use Stripe test card numbers only, such as `4242 4242 4242 4242`
- Use any future expiry date and any CVC
- Never test with live keys in this phase

## Environment variables for later

The backend will eventually need:

- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

## Test mode first

Stripe should stay in test mode while the payment and webhook paths are being validated.
Live mode should only be enabled after the webhook, order updates, and fulfillment handoff are verified end to end.
No fulfillment should begin until the payment webhook confirms success and the supplier integration is ready.
The test-mode webhook should be deployed and verified before switching any checkout flow to live mode.

## Language to avoid

The product should not use:
- send money
- remittance
- wallet
- deposit
- withdraw
- cash pickup

Use:
- pay for top-up
- pay for data
- complete order
- service total
- receipt
- processing
- completed

## Current state

At this phase, Stripe is still placeholder-only in the app. No payment is charged from the client.
