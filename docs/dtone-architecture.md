# DT One Architecture

Boulio will only talk to DT One from trusted Supabase Edge Functions in a later
phase. The mobile app must never call DT One directly.

## Security rules

- DT One credentials must live only in Supabase secrets
- The client must never see DT One API keys
- Fulfillment must only run from server-side code
- Stripe payment and webhook logic stay separate from supplier fulfillment
- No supplier request should be triggered directly from the app UI

## DT One endpoint configuration

Use the DT One base API URL only, without credentials, as the environment value
for `DTONE_API_BASE_URL`.

Example base URL:

- `https://preprod-dvs-api.dtone.com/v1`

The create-transaction path is controlled separately by
`DTONE_TRANSACTIONS_PATH`.

For synchronous transaction creation, use:

- `/sync/transactions`

The final request endpoint is built as:

- `DTONE_API_BASE_URL + DTONE_TRANSACTIONS_PATH`

Do not include credentials in these docs or in the configured URL itself.

## When fulfillment is allowed

Future fulfillment should only run when all of these are true:

- the order or request has already been paid
- the row is in a processing-ready state
- the product is mapped to a DT One product
- the server has validated the amount and product metadata

## Status plan

When DT One is eventually connected:

- a paid row enters `processing`
- the supplier request is created server-side
- supplier success may move the row to `completed`
- supplier failure should move the row to `failed` or `needs review`
- the client never marks supplier success

## Validation rules

Before any supplier call, the backend should verify:

- carrier matches exactly
- product type matches exactly
- amount matches the mapped product
- bundle label matches when the product is data
- a DT One mapping exists for the product

If a product is unmapped:

- do not fulfill automatically
- do not send a supplier request
- show an internal message like "Needs product mapping"

## Fulfillment readiness validation

The placeholder fulfillment function should treat a row as ready only when:

- the target exists
- payment is confirmed
- the row is in a processing-ready state
- the mapped product exists and is active
- the mapped product provider is `dtone`
- the external product id is present
- the carrier and product type match exactly
- the amount matches the mapped product amount
- the bundle label matches for data products

If any of those checks fail, the backend should return a clear non-fulfillable
status instead of trying to send the request.

Unmapped products must never be sent to the supplier because that would risk
sending the wrong service, wrong amount, or wrong carrier request.

## Required secrets later

Store these only in Supabase secrets when the integration is ready:

- `DTONE_API_KEY`, or `DTONE_CLIENT_ID` / `DTONE_CLIENT_SECRET` depending on DT One API requirements
- `DTONE_BASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL`

## Placeholder-only phase

This phase prepares the architecture only.
It does not:

- call DT One
- send airtime or data
- update supplier success
- mark orders completed
- expose supplier credentials to the client

## Fulfillment modes

The `fulfill-topup` Edge Function supports two locked-down server-only modes
for top-up orders:

- `dry_run`
- `live_manual`

### Dry run

Dry-run behavior:

- requires an authorization header
- loads the paid top-up order on the server
- requires `topup_orders.product_id`
- loads the linked `topup_products` row by exact id
- validates carrier, product type, product name, amount, and mapping status
- normalizes the recipient phone for DT One
- returns a payload preview only
- does not call DT One
- does not create a transaction
- does not update supplier status
- does not mark the order completed

Only mapped and paid top-up orders with `product_id` pass the dry run.
Old orders without `product_id` fail safely with `PRODUCT_ID_MISSING` until
they are backfilled.
Inactive products, missing external ids, or non-DT One products also fail
before any supplier action could happen.

### Manual live fulfillment

`live_manual` is locked down behind an extra secret:

- `x-fulfillment-admin-secret`
- `FULFILLMENT_ADMIN_SECRET`

Manual live fulfillment:

- is server-side only
- is not triggered from Stripe
- is not exposed as a user-facing button
- uses the same validated payload data as dry run
- posts to the configured DT One endpoint built from
  `DTONE_API_BASE_URL + DTONE_TRANSACTIONS_PATH`
- sends the actual DT One request only after the admin secret passes
- uses `boulio-topup-order-<order_id>` as the idempotency/external id
- stores only a safe supplier reference and status summary
- does not mark the order completed unless DT One confirms success

Response handling:

- confirmed DT One success moves `supplier_status` to `successful` and `status` to `completed`
- pending or processing DT One responses keep the order in `processing` and set `supplier_status` to `pending`
- DT One failures set `supplier_status` to `failed` and do not trigger refunds

The current schema does not include `fulfilled_at`, so no timestamp update is
performed yet.

## Language to avoid

Avoid remittance-style wording such as:

- send money
- remittance
- wallet
- cash transfer
- cash pickup

Use service wording instead:

- pay for top-up
- pay for data
- processing
- completed
- needs review
