# Liang Nü Zhuang

English women's dress catalog for US customers, USD pricing, a Chinese owner workspace, and persistent availability requests.

Production: https://582916.com
Owner workspace: https://582916.com/admin
Payments, inventory and orders: https://582916.com/admin/commerce

## Current operational status

The site currently accepts availability requests only. It does not accept payments, reserve supplier stock, or create paid orders. PayPal REST integration is implemented behind a closed configuration gate. Actual PayPal credentials, a real sandbox acceptance test, merchant-specific product-image permission, supplier onboarding, US fulfillment costs and return arrangements remain unconfirmed. Product images and specifications come from the linked supplier catalog; samples and photographic authenticity have not been independently verified. Display prices are estimated opening retail prices chosen for this store, not supplier costs or final payable quotes.

Do not remove these qualifications or enable payment solely to obtain an account review.

## Maintenance

The owner signs in through the hosting platform using the same ChatGPT account that owns this Site. The server compares the trusted platform identity email to the `STORE_ADMIN_EMAIL` runtime secret on every protected request. There is no default admin password.

The Chinese `/admin` interface can add and edit products, upload images, manage gallery links and size charts, publish/unpublish catalog entries, edit shipping/returns text, view and update inquiry status, export inquiry CSV and product JSON, and delete personal inquiry records.

Changes are stored in D1 and survive redeployment. Uploaded JPG/PNG/WebP images are stored in R2 and served from `/media/`. Source catalog records are merged with database overrides. The storefront is rendered from the current database on every page request; internal notes are omitted from public API and page data.

## Architecture

- Vinext / React / Cloudflare Worker
- D1: `catalog_edits`, `store_settings`, `inquiries`, `audit_log`, `inventory`, `sales_orders`, `order_reservations`, `payment_events`
- R2: `BUCKET`, owner-authenticated product image uploads
- `/api/catalog`: public catalog, no private notes
- `/api/inquiries`: validated US availability request; no payment side effect
- `/api/admin`: owner-authorized reads and mutations, same-origin checks
- `/api/uploads`: owner-authorized image uploads, content signatures and size limits

Anonymous visitors cannot access inquiry data or edit products. Client-side prices are never used as authoritative inquiry prices. Public request submissions validate IDs, sizes, quantities, consent, origin, input length and hourly request limits.

## Development and deployment

Use Node 22.13+ and the package lock. `npm ci`, then `npm run dev`. Generate new schema migrations with `npm run db:generate`. Apply pending migrations locally as documented by the Sites starter workflow. Do not replay applied migrations or edit their history.

Production is hosted through Sites, using `.openai/hosting.json`. GitHub stores the source; GitHub Pages is not used for ecommerce. Runtime environment values belong in Sites and ignored local `.dev.vars` files, not in this repository.

Required production runtime key: `STORE_ADMIN_EMAIL` (secret). Local preview's simulated user is separate from production identity. No PayPal secret, domain account credential, or customer database is included in source.

The authoritative source publication uses the Sites source helper, exact pushed commit, built archive, saved version and deployment. Changes pushed only to this GitHub mirror are not automatically deployed.

## Payment and order implementation

`/admin/commerce` manages per-size available stock, operating settings, orders, tracking records and full refunds. Sales remain closed in production. No stock or supplier rights have been invented, and no PayPal credentials are in source.

The flow uses PayPal Orders v2 with a redirect to PayPal, server-side capture, Payments v2 capture reconciliation and full refunds. Browser return parameters never mark an order paid. Amount, currency, merchant, invoice, order binding and delivery address are checked against the immutable order snapshot. Customer order access requires the random HttpOnly, Secure, SameSite=Lax checkout cookie; an order ID alone reveals no contact information.

Inventory is explicitly maintained per size. D1 batches reserve all lines atomically, with a database check preventing negative stock and a foreign key rejecting unknown variants. Unpaid holds expire after 30 minutes and are released on the next catalog, availability, checkout or inventory read. Capturing or pending payments are not expired automatically. Failed reservations roll back all lines. Captured stock is not automatically restored after refunds: returned goods must first be checked.

Creation, capture and full refund use stable PayPal request IDs. An uncertain capture remains unresolved and blocks shipment until provider reconciliation. An uncertain refund is not blindly reissued; check PayPal and refresh its status. Partial refunds issued outside this store are reported for review; the built-in action is full refund only. Orders cannot be manually marked paid. Shipping records require a fresh verified payment result; entering a tracking number does not buy postage, place a supplier order or notify a carrier.

Webhooks use PayPal postback signature verification and a configured webhook ID for the matching environment. Verified notifications trigger a provider-side status lookup; event IDs are recorded once. Subscribe at least to PAYMENT.CAPTURE.COMPLETED, PAYMENT.CAPTURE.PENDING, PAYMENT.CAPTURE.DENIED, PAYMENT.CAPTURE.REFUNDED and PAYMENT.CAPTURE.REVERSED. The endpoint is `https://582916.com/api/paypal/webhook/live` (or `/sandbox`). Unsigned or unverifiable events cannot mark an order paid.

### Required runtime configuration

Keep values in Sites runtime secrets, never in GitHub or product notes:

- `PAYPAL_MODE`: `sandbox` or `live`; missing or another value keeps checkout closed.
- `PAYPAL_SANDBOX_CLIENT_ID`, `PAYPAL_SANDBOX_SECRET`, `PAYPAL_SANDBOX_MERCHANT_ID`, `PAYPAL_SANDBOX_WEBHOOK_ID` for sandbox.
- `PAYPAL_LIVE_CLIENT_ID`, `PAYPAL_LIVE_SECRET`, `PAYPAL_LIVE_MERCHANT_ID`, `PAYPAL_LIVE_WEBHOOK_ID` for real payments.
- Existing `STORE_ADMIN_EMAIL` remains required.

Retain credentials for an environment while it has unresolved orders. Only the store owner may start sandbox checkouts. Runtime updates require a Sites deployment to apply. Credential presence alone is not proof of PayPal approval or a successful payment.

Before opening, complete the owner settings with genuine seller identity, delivery and return terms, supported states, and verified shipping/tax charges. A state not configured is unavailable at checkout. The current tax rule is a merchant-entered state rate on merchandise plus shipping, not an address-based tax service or a determination of tax obligations. Do not enable destinations requiring unsupported rate calculations. Products also need published/verified/image-rights/fulfillment flags and actual per-size stock.

There is no automated procurement, tax-registration service, carrier purchase, customer-email sender or scheduled inventory sync. The operator must monitor orders and fulfill them. A buyer can revisit payment status in the same browser for seven days and contact the displayed support address.

### Verification

`npm test` runs isolated SQLite-backed inventory and payment state tests with a mocked PayPal transport. They cover concurrent checkout, the last unit, full rollback, bad client totals, changed identities, lost responses, pending/expired/late captures, amount/merchant/address mismatches, refunds, old notifications and rejected signatures. These tests do not make PayPal calls and do not replace real sandbox and live acceptance tests. Run `node node_modules/typescript/bin/tsc --noEmit` and the Sites production build before publishing.

Official references:
- https://developer.paypal.com/studio/checkout/standard/integrate
- https://developer.paypal.com/api/orders/v2/orders-create
- https://developer.paypal.com/api/orders/v2/orders-capture
- https://developer.paypal.com/api/payments/v2/captures-refund
- https://developer.paypal.com/api/rest/webhooks/rest/
- https://developer.paypal.com/api/rest/reference/idempotency/
