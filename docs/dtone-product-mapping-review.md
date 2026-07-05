# DT One Product Mapping Review

Use this checklist when comparing Boulio top-up products against the real DT One
catalog. Do not fill in real DT One ids unless they come directly from the DT One
catalog, dashboard, or API response.

## Review template

| Boulio product id | Carrier | Product type | Boulio product name | Bundle label | Boulio amount_usd | Boulio service_fee_usd | Boulio total_usd | DT One product id | DT One product name | DT One operator/carrier | DT One destination country | DT One source amount | DT One destination amount | Notes | Reviewed yes/no |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TODO_BULIO_PRODUCT_ID | Digicel | airtime | Digicel Airtime $5 |  | 5.00 | 0.99 | 5.99 | TODO_DTONE_PRODUCT_ID | TODO_DTONe_PRODUCT_NAME | Digicel | Haiti | TODO_SOURCE_AMOUNT | TODO_DESTINATION_AMOUNT | Verify exact match before enabling | no |
| TODO_BULIO_PRODUCT_ID | Natcom | data | Natcom Data 1GB | 1GB | 6.00 | 0.99 | 6.99 | TODO_DTONE_PRODUCT_ID | TODO_DTONe_PRODUCT_NAME | Natcom | Haiti | TODO_SOURCE_AMOUNT | TODO_DESTINATION_AMOUNT | Verify exact match before enabling | no |

## Review notes

- Service fee schedule for draft mapping assumptions:
  - $1.00 to $4.99 product amount: $0.99 fee
  - $5.00 to $9.99 product amount: $1.49 fee
  - $10.00 to $19.99 product amount: $1.99 fee
  - $20.00 to $29.99 product amount: $2.99 fee
  - $30.00 to $49.99 product amount: $3.99 fee
  - $50.00 and above: $4.99 fee
- Only use real DT One ids from the DT One catalog, dashboard, or API.
- Match Digicel and Natcom carefully.
- Match airtime and data carefully.
- Verify amount and bundle label before mapping.
- Leave a product unmapped if you are uncertain.
- The backend must refuse unmapped or uncertain products.
- The old generic 1GB / 3GB / 5GB / 10GB bundle rows should not be fulfilled,
  because they do not match the verified DT One bundle products closely enough.

## Suggested review fields

- Boulio product id
- Carrier
- Product type
- Boulio product name
- Bundle label
- Boulio amount_usd
- Boulio service_fee_usd
- Boulio total_usd
- DT One product id
- DT One product name
- DT One operator/carrier
- DT One destination country
- DT One source amount
- DT One destination amount
- Notes
- Reviewed yes/no
