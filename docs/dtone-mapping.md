# DT One Mapping

Boulio products must be mapped to DT One products before any future supplier
fulfillment can happen.

## What this phase does

- Adds nullable mapping fields to `topup_products`
- Lets the app read mapping metadata from the product record
- Prepares a safe status layer for future supplier checks
- Does not call DT One
- Does not send airtime or data
- Does not mark any order completed

## Mapping fields

The `topup_products` table now supports:

- `external_provider`
- `external_product_id`
- `external_product_metadata`

These are nullable and stay empty until a real mapping has been reviewed.

## Mapping rules

Before supplier fulfillment, the backend should verify:

- carrier name matches exactly
- product type matches exactly
- amount is correct
- bundle label is correct for data products
- supplier mapping exists and is reviewed

Use careful carrier matching:

- Digicel
- Natcom

Use careful product matching:

- airtime
- data

## Review workflow

Before any live mapping is written, complete a manual review using:

- [DT One Product Mapping Review](./dtone-product-mapping-review.md)
- `supabase/sql/dtone-product-mapping-template.sql`

Only approve a mapping after the DT One catalog, dashboard, or API has been
checked directly.

## Safe behavior

If a product is not mapped:

- do not send a supplier request
- do not mark supplier status successful
- do not mark the order completed
- show a clear internal state such as:
  - Product not mapped
  - Needs product mapping
  - Cannot fulfill automatically

If a product is mapped:

- it can be considered ready for supplier fulfillment later
- the actual supplier call must still happen server-side

## Placeholder IDs

Do not invent real DT One product ids.
If a development placeholder is ever needed, use obvious fake values like:

- `TODO_DTONE_DIGICEL_AIRTIME_5`
- `TODO_DTONE_NATCOM_DATA_1GB`

These must never be treated as real supplier ids.

## Future fulfillment rule

The future fulfillment service should refuse to process a row unless:

- the order is paid
- the product is mapped
- the mapping has been reviewed
- the supplier request is sent from trusted backend code

## Placeholder-only for now

This phase only prepares mapping data and validation.
It does not:

- call DT One
- trigger supplier fulfillment
- update supplier status to successful
- complete orders automatically
