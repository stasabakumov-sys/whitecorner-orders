# Hub → storefront catalogue

Owner decision, 28 September 2026: the selected `white-corner-design` storefront
must read product information only from Hub. This supersedes the earlier
frontend → Wix catalogue sequence; checkout and real commerce remain separate.

## Audit before this release

The production read-only audit found 190 operational products: 178 linked Wix
snapshots and 12 local-only products. The saved Wix snapshots contained 1,203
variants, 104 visible products and 74 hidden products. All 178 had descriptions,
slugs and media. The full import checkpoint was complete; snapshots were of mixed
ages. Images/videos were still Wix URLs, categories were only collection IDs.

## Implemented sequence

1. Refresh all Wix V1 products through the existing resumable importer. Preserve
   Hub UUIDs, local operational fields, drawings, costing and order history.
2. Read all Wix collections into Hub. Validate pagination before saving them.
3. Copy product images, videos and the prototype's existing editorial images into
   Hub Storage. Save the source URL, destination, size, MIME and SHA-256 in Hub.
   Resume by already confirmed file records. Hidden product media stays private.
4. Build the separate allowlisted `wc_storefront_catalog` document. Include visible
   products, category membership, descriptions, options, exact variant prices,
   stock semantics, SKU, weight, custom fields, SEO text and Hub media URLs.
   Fail on incomplete photos, unknown categories, duplicate IDs/slugs or bad prices.
   The owner approved deferring inaccessible videos; their reasons are recorded in
   the private `wc_catalog_media_issues` table and never replaced with Wix URLs.
5. Atomically replace the `live` document only after the entire run succeeds.
   Existing published data stays readable during import and on failure.
6. The Next.js/Vinext storefront fetches this document server-side from Hub.
   It has no Wix catalogue client and no prototype-product fallback. Prices are
   resolved from the selected Hub variant. Checkout remains explicitly a demo.

## Operations

Use GitHub Actions **Hub storefront catalogue**, on the reviewed source branch.
`mode=audit` is read-only. `mode=sync` applies only the three named migrations,
deploys the dedicated importer, resumes the saved run and publishes the catalogue.
Set `restart=true` only to deliberately start a fresh complete Wix product scan.
Re-running with `restart=false` resumes file copying without downloading confirmed
files again. Inspect failures before retrying; no missing products are deleted.

Security and the separately approved short-lived machine token are documented in
`STOREFRONT_SECURITY_REVIEW.md`. The Site's owner-private audience is preserved.
No courier booking, emails, Wix writes, orders, payments or production UI deployment
are part of this release.

## Explicit gaps

Production import completed on 28 September 2026 (Actions run 36397596149):
179 source products and 18 collections, 103 visible products, 76 hidden products,
939 public variants. Storage contains 1,114 confirmed media files. All photos were
copied; 12 videos remain deferred (11 Wix HTTP 403 responses, one over 50 MB).
Two visible products are affected by deferred video. Their photo galleries are complete.

The 12 local-only registry entries have no linked commercial Wix snapshot. They
must be reviewed before publication: titles alone are not a safe identity match,
and prices/media must not be invented. Hidden Wix products remain hidden.
Location-specific inventory and checkout calculations are not implied by the
V1 product availability snapshot. Missing merchant SKU/SEO values remain missing.
