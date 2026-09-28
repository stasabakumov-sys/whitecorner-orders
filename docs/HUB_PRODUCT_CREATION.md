# Product creation in Hub

## Current stage: private drafts

Products > Add product draft creates a Hub-owned record in `wc_hub_product_drafts`. It stores the name, description, ribbon, base price, SKU, categories, options, variant prices/SKUs, and private media. Only Hub managers can read or edit drafts. Saving a draft does not call Wix, alter the imported catalog, or expose it on the storefront. A failed upload leaves the saved draft and selected file available for retry.

The migration creates the draft table and a private `hub-product-drafts` Storage bucket. Run the guarded `Hub product drafts release` workflow in `apply` mode before using the Angular UI in production. It applies only this migration and verifies RLS and private Storage; it does not run all pending migrations. The form reads category suggestions from `wc_storefront_catalog`; that projection remains a separate, public, allowlisted catalog source and must not contain Hub operational fields.

## Later publication workflow

Publication is deliberately not implemented in this stage. It needs an authorized server-side Wix adapter and a separate publish action. Wix remains the source of truth for the commercial product and visibility. Hub owns the draft and local operational data such as packing, drawings, and costing.

1. Validate the draft and record a publishing attempt with an idempotency key. Create a **hidden** Wix product through the server adapter. Persist its exact Wix product ID immediately; retries must use that ID and never merge products by name.
2. Send options, variants, prices, SKU, media, and collection assignments to Wix. Keep each step retryable and record the last successful step. Variant-specific prices and SKUs must survive the transfer.
3. Request Wix publication. Read the Wix product back by its ID and confirm Wix reports it visible. A network failure, partial response, or absent product is not evidence of deletion or publication.
4. Only after visibility is confirmed, update the allowlisted public catalog projection with public media URLs and then mark the Hub record `published`. The storefront reads that projection; it never reads the private draft table or private Storage bucket.
5. On partial failure retain the Wix ID and mark the attempt for retry/review. Never create a second Wix product merely because a previous response was lost. Do not rewrite historical order lines or financial snapshots from the current product record.

The publication endpoint, Wix write credentials/scopes, public-media copy, reconciliation job, and deployment are separate follow-up work. No Wix write or production database migration is part of the draft implementation.
