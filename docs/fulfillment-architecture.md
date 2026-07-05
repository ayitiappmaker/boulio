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
- build an admin dashboard
