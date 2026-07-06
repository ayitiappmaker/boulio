# Fulfillment Architecture

Boulio treats fulfillment as a server-side supplier step that happens after payment is confirmed.
The app should never call DT One directly from the client, and it should never mark an order
completed on its own.

## Core principle

- Payment is confirmed by Stripe webhook events.
- Fulfillment is handled later by trusted backend code.
- The client only shows status, readiness, and history.
- The client must not send supplier requests directly.

## Current status model

### Top-up orders

Current columns already in the schema:
- `status`
- `payment_status`
- `supplier_status`

Practical flow:
- `pending_payment`
- `paid` or `processing`
- `supplier_pending`
- `supplier_sent`
- `completed`

Failure or review path:
- `supplier_failed`
- `needs review`

The schema already stores:
- `draft`
- `pending_payment`
- `paid`
- `processing`
- `completed`
- `failed`
- `cancelled`
- `refunded`

And supplier states:
- `not_sent`
- `pending`
- `successful`
- `failed`

### Data requests

Current columns already in the schema:
- `public_status`
- `internal_status`
- `payment_status`
- `fulfillment_status`

Practical flow:
- `open`
- `paid` or `processing`
- `fulfillment_pending`
- `fulfillment_sent`
- `completed`

Failure or review path:
- `fulfillment_failed`
- `needs review`

The schema already stores:
- `open`
- `paid`
- `completed`
- `expired`
- `cancelled`

And internal / fulfillment states:
- `created`
- `payment_pending`
- `paid`
- `processing`
- `completed`
- `failed`
- `cancelled`
- `not_started`
- `queued`
- `processing`
- `successful`
- `failed`

## What the webhook does

The Stripe webhook is the source of truth for payment completion.

When Stripe confirms payment:
- `topup_orders.payment_status` becomes `paid`
- `topup_orders.status` becomes `processing`
- `data_requests.payment_status` becomes `paid`
- `data_requests.public_status` becomes `paid`
- `data_requests.internal_status` becomes `processing`

That is enough to mark a record ready for fulfillment.
No supplier request should happen in the webhook yet.

## What fulfillment will do later

In a future phase, the backend will:
- read paid and ready rows
- create a supplier request on the server
- store supplier response ids
- move top-up rows from `processing` to `completed`
- move data request rows from `processing` to `completed`
- mark failures for manual review

## Current admin workflow

Boulio now includes a manual-only internal admin screen for top-up fulfillment.
The screen lives behind a hidden route and is not linked from the normal user UI.

Current path:

- `/admin/fulfillment`

The screen does not call DT One directly.
It calls the Supabase Edge Function `admin-fulfillment-action`, which verifies the signed-in user is on the admin allowlist and then forwards safe requests to `fulfill-topup` with the fulfillment secret attached server-side.

This keeps the browser away from:

- `FULFILLMENT_ADMIN_SECRET`
- DT One credentials
- direct supplier calls

The admin screen is manual-only:

- it can list recent top-up orders
- it can run `dry_run`
- it can run `live_manual`
- it can run `check_status`

It does not automate Stripe webhook fulfillment.
Stripe webhook handling remains unchanged.

## Exact product linkage

Top-up orders now store a nullable `product_id` reference to `topup_products`.
New orders should save the exact selected product id at creation time.

Older orders without `product_id` can be backfilled safely when there is exactly
one product match on:

- carrier
- product type
- product name
- amount

If a row is ambiguous or unmatched, leave `product_id` null.

## Manual live fulfillment

The `fulfill-topup` Edge Function has a locked-down `live_manual` mode for
trusted operators only.

Safety rules:

- the request must include `x-fulfillment-admin-secret`
- the header value must match `FULFILLMENT_ADMIN_SECRET`
- the row must be paid and in `processing` or `paid`
- the order must not already be completed or successfully fulfilled
- the order must have `product_id`
- the linked product must exist, be active, and be mapped to DT One
- the request must use the validated exact product payload
- the DT One request endpoint is built from
  `DTONE_API_BASE_URL + DTONE_TRANSACTIONS_PATH`
- `DTONE_TRANSACTIONS_PATH` controls the create-transaction path
- for synchronous transaction creation, use `/sync/transactions`
- `DTONE_TRANSACTION_LOOKUP_PATH` controls the status lookup path
- for transaction lookup, use `/transactions`
- do not include DT One credentials in the endpoint configuration
- the stored phone stays `509XXXXXXXX`
- the DT One payload sends `+509XXXXXXXX`
- the DT One payload uses `bt_<uuid_without_hyphens>` for `external_id`
- `live_manual` sends `auto_confirm: true`
- `live_manual` is rejected if `supplier_reference` already exists, so the same order cannot create two DT One transactions

Status handling:

- success -> `supplier_status = successful`, `status = completed`
- pending or processing -> `supplier_status = pending`, `status = processing`
- failure -> `supplier_status = failed`, `status = failed`

The function returns only a safe summary of the DT One response.
No automatic fulfillment is triggered from Stripe or anywhere else.
Dry-run remains a safe preview only and never calls DT One.

## Manual status check

The `fulfill-topup` Edge Function also supports a locked-down
`check_status` mode for manual reconciliation.

Safety rules:

- the request must include `x-fulfillment-admin-secret`
- the header value must match `FULFILLMENT_ADMIN_SECRET`
- the order must already exist and be paid
- the order must have `supplier_status` of `pending` or `processing`
- the lookup uses `supplier_reference` or the derived `bt_<uuid_without_hyphens>` value
- the function must only read DT One status, not create a transaction
- `live_manual` must not be called again
- DT One may return an array for the lookup; use the first transaction object
  when one is present and treat an empty array as not found

Status handling:

- successful DT One status -> `supplier_status = successful`, `status = completed`
- pending or processing DT One status -> keep `supplier_status = pending`, `status = processing`
- failed DT One status -> `supplier_status = failed`, `status = failed`

The lookup endpoint is built from:

- `DTONE_API_BASE_URL + DTONE_TRANSACTION_LOOKUP_PATH`

The lookup query uses:

- `?external_id=<supplier_reference>`

The response returns a safe reconciliation summary only.

## Dry-run preview

Before real supplier fulfillment is enabled, Boulio can run a safe server-side
dry run for top-up orders.

Dry-run rules:

- the request must come through the `fulfill-topup` Edge Function
- the request body must use `mode: "dry_run"`
- the order must already be paid
- the order must be in `processing` or `paid` status
- the order must have `product_id`
- the linked `topup_products` row must exist
- the product must be active
- the product provider must be `dtone`
- the product must have an external product id
- the linked product id must match exactly
- the carrier and product type must match exactly
- the stored product name and amount must match the linked product
- the recipient phone must be normalizable for DT One

Dry-run responses return a preview only.
They do not call DT One, do not mark the row completed, and do not update
`supplier_status` to successful.
The preview should match the live manual DT One payload exactly.

If `product_id` is missing, the dry run fails with `PRODUCT_ID_MISSING`.
If a linked product cannot be found, the dry run fails safely.
If a product is unmapped or not safe to fulfill, the dry run must fail cleanly
instead of sending anything upstream.

## Server-side only

Fulfillment must stay server-side because:
- DT One credentials must never be exposed to the app
- supplier requests must be validated against the stored order/request
- the client must not be able to mark an order fulfilled
- the client must not be able to set completion status directly

## Failure handling

If supplier fulfillment fails:
- keep the payment record intact
- move the item into a failure or review state
- show the user a clear status like `Needs review`
- avoid automatic completion

## Manual review

If a supplier response is unclear or missing:
- do not mark the order completed
- keep the row in a readable waiting or review state
- allow an internal admin or support flow to inspect it later

## Important language

Avoid remittance-style language such as:
- send money
- remittance
- wallet
- deposit
- withdraw
- cash pickup

Use service language instead:
- pay for top-up
- pay for data
- processing
- completed
- needs review

## Placeholder-only for now

This phase only prepares the model for future fulfillment.
It does not:
- call DT One
- send airtime
- send mobile data
- mark completion automatically

The admin dashboard is now available as a manual operator tool, but it still does not automate fulfillment or move payment logic into the webhook.

Real fulfillment is still disabled until the live DT One send path is added in
a later phase.
