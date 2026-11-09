# Liang Nü Zhuang

English women's dress catalog for US customers, USD pricing, a Chinese owner workspace, and persistent availability requests.

Production: https://582916.com
Owner workspace: https://582916.com/admin

## Current operational status

The site currently accepts availability requests only. It does not accept payments, reserve supplier stock, or create paid orders. PayPal merchant integration, merchant-specific product-image permission, supplier onboarding, US fulfillment costs and return arrangements remain unconfirmed. Product images and specifications come from the linked supplier catalog; samples and photographic authenticity have not been independently verified. Display prices are estimated opening retail prices chosen for this store, not supplier costs or final payable quotes.

Do not remove these qualifications or enable payment solely to obtain an account review.

## Maintenance

The owner signs in through the hosting platform using the same ChatGPT account that owns this Site. The server compares the trusted platform identity email to the `STORE_ADMIN_EMAIL` runtime secret on every protected request. There is no default admin password.

The Chinese `/admin` interface can add and edit products, upload images, manage gallery links and size charts, publish/unpublish catalog entries, edit shipping/returns text, view and update inquiry status, export inquiry CSV and product JSON, and delete personal inquiry records.

Changes are stored in D1 and survive redeployment. Uploaded JPG/PNG/WebP images are stored in R2 and served from `/media/`. Source catalog records are merged with database overrides. The storefront is rendered from the current database on every page request; internal notes are omitted from public API and page data.

## Architecture

- Vinext / React / Cloudflare Worker
- D1: `catalog_edits`, `store_settings`, `inquiries`, `audit_log`
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
