# Boulio Supabase Backend

This project uses Supabase for auth, database storage, row level security, and later backend functions.

## Overview

- Lottery results are public and do not require login.
- Top-up checkout and order creation require authenticated users.
- Data request links are created by authenticated users and later read by request code.
- Payment processing and DT One fulfillment will be added later through trusted backend functions, not directly from the mobile app.
- Data request links are public only when open and will later be read by request code.
- Row Level Security stays enabled on all private tables.

## Table Map

### `profiles`

- Purpose: Stores the authenticated user's profile and app preferences.
- Access: Private.
- Read/write: Users can read and update their own profile row only.
- Important fields: `user_id`, `full_name`, `phone`, `email`, `country`, `preferred_state`, `created_at`, `updated_at`.

### `lottery_results`

- Purpose: Public lottery result archive for supported states and games.
- Access: Public.
- Read/write: Anyone can read; writes should come from trusted data import or admin processes.
- Important fields: `state`, `game`, `draw`, `result_date`, `numbers`, `source`, `created_at`.

### `topup_products`

- Purpose: Catalog of mock and later real top-up products.
- Access: Public for active products only.
- Read/write: Public read access for active rows; writes should be handled by trusted admin or backend processes.
- Important fields: `carrier`, `product_type`, `name`, `bundle_label`, `amount_usd`, `service_fee_usd`, `total_usd`, `active`.

### `saved_recipients`

- Purpose: Stores saved Haiti recipient contacts for faster checkout.
- Access: Private.
- Read/write: Users can read, create, update, and delete their own rows only.
- Important fields: `user_id`, `recipient_name`, `phone_number`, `carrier`, `created_at`, `updated_at`.

### `topup_orders`

- Purpose: Stores top-up checkout and order records.
- Access: Private.
- Read/write: Users can create and read their own orders only. They should not directly update status, payment, or supplier fields.
- Important fields: `user_id`, `carrier`, `product_type`, `product_name`, `recipient_phone`, `recipient_name`, `amount_usd`, `service_fee_usd`, `total_usd`, `status`, `payment_status`, `supplier_status`, `supplier_reference`, `created_at`, `updated_at`.

### `data_requests`

- Purpose: Stores data request links that can later be shared with family or supporters.
- Access: Public when open; private for the requester’s own rows.
- Read/write: Authenticated requesters can create and read their own rows. Later public access should be by `request_code` on open rows only. Payment and fulfillment state changes are reserved for trusted backend/admin processes.
- Important fields: `requester_user_id`, `requester_mode`, `recipient_phone`, `carrier`, `product_type`, `product_name`, `bundle_label`, `amount_usd`, `service_fee_usd`, `total_usd`, `request_code`, `public_status`, `internal_status`, `payment_status`, `fulfillment_status`, `supporter_user_id`, `supporter_email`, `completed_order_id`, `expires_at`, `created_at`, `updated_at`.

### `notification_settings`

- Purpose: Stores per-user notification preferences.
- Access: Private.
- Read/write: Users can read and update their own settings only.
- Important fields: `user_id`, `result_alerts_enabled`, `topup_status_alerts_enabled`, `marketing_enabled`, `created_at`, `updated_at`.

### `support_messages`

- Purpose: Stores support requests from authenticated users.
- Access: Private.
- Read/write: Users can create and read their own support messages only.
- Important fields: `user_id`, `subject`, `message`, `order_id`, `status`, `created_at`.

## Access Rules

- `lottery_results` are publicly readable.
- Active `topup_products` are publicly readable.
- Open `data_requests` rows are publicly readable, and later app code should look them up by `request_code`.
- User-owned tables are protected by RLS.
- Authenticated users can create `topup_orders`, but they should not directly update `status`, `payment_status`, or `supplier_status`.
- Authenticated requesters can create `data_requests`, but payment and fulfillment fields are reserved for trusted backend/admin code.
- Trusted backend or admin processes will update order, payment, and supplier state later.

## Future Integration Plan

Later phases will add:

1. Supabase client wiring in the app.
2. Public lottery result fetches.
3. Auth only when the user starts checkout.
4. Creation of a pending top-up order.
5. Payment processing.
6. DT One supplier fulfillment through a backend function.
7. Admin and order management tools.

## Security Notes

- Never expose DT One API keys in the mobile app.
- Never expose payment secret keys in the mobile app.
- Use Supabase Edge Functions or a backend server for payment and supplier calls.
- Keep RLS enabled at all times.

## Migration

The MVP schema lives in:

- `supabase/migrations/20260703_000001_boulio_mvp_schema.sql`
- `supabase/migrations/20260703_000002_boulio_data_requests.sql`
