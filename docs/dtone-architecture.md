# DT One Architecture

Boulio will only talk to DT One from trusted Supabase Edge Functions in a later
phase. The mobile app must never call DT One directly.

## Security rules

- DT One credentials must live only in Supabase secrets
- The client must never see DT One API keys
- Fulfillment must only run from server-side code
- Stripe payment and webhook logic stay separate from supplier fulfillment
- No supplier request should be triggered directly from the app UI

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
