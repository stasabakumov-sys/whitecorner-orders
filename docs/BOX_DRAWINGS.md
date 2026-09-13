# Saved box drawings

## Current backdrop rule — 13 September 2026

The shared packing drawing is keyed by the normalized product size **and** the explicit Foldable option: for example `2000x1000:foldable` and `2000x1000:nonfoldable`. Colour and product title do not distinguish drawings; package measurements are not the lookup key. Missing/conflicting size or folding options block uploading until the profile is corrected.

The Packing table contains exactly one drawing control for a backdrop. An existing shared file is shown with “Packaging drawing already exists” and a replacement control. Individual backdrop uploads are blocked in the UI and by a database trigger, including older clients. Non-backdrop individual package drawings retain their existing contract.

Migration `20260913000100_backdrop_drawing_folding.sql` keeps all size-only library entries and previously attached individual files. A size-only file remains downloadable but cannot be replaced or bypassed by another upload until the user classifies it as Foldable or Non-foldable in Backdrop box drawings. Classification retains its storage path, checks revision, and refuses to overwrite an existing qualified key. Old individual attachments remain stored for manual reconciliation; they are not silently promoted to the shared library.

Use `.github/scripts/product-card-release.mjs --print-sql` for the exact targeted, transactional release of this migration and the backdrop paint-route migration. The wrapper checks the reviewed Shop Floor command body, registers each migration, refuses mismatched replay, and verifies RLS and function access. Earlier sections below document the previous rollout stages.

Products (formerly Shipping Data) adds a Drawing column to each saved packaging row. One file per row can be uploaded, downloaded or replaced. CDR and other formats are kept unchanged; files must be non-empty and at most 1 MiB. There is no inline rendering or execution of uploaded files.

Apply `20260909000100_box_drawings.sql` before publishing the UI. It creates a private `box-drawings` Storage bucket and separate attachment metadata. Existing packaging JSON, quote signatures, order costs and courier bookings are unchanged. Authenticated Hub users upload files and receive 60-second attachment download links; anonymous access is denied.

For Cart and other-product drawings, the saved box snapshot and row index must still match when attaching or displaying a drawing. Changed/reordered boxes hide an old drawing until a matching file is uploaded. Concurrent replacements require the current revision. Storage paths are unique and cannot be overwritten; linked files cannot be deleted through Storage policies. A failed/uncertain metadata request may leave an unlinked private upload rather than risk deleting a committed attachment. No production migration was performed during local testing.

Checks: isolated PostgreSQL migration/RLS and replacement tests, Angular CDR upload/download/failure tests, required Angular suite/build, and a synthetic-data browser review.

## Products page and shared Backdrop library

The page is a searchable product table with available product sizes and row numbers on the right. Product cards open in a centered modal. Existing /shipping-data links stay valid.

Apply 20260909000200_backdrop_drawing_library.sql after the base drawing migration. Backdrops use one shared CDR per exact size of the product, independently of product name and packaging dimensions. 190cm x 95cm and 950 x 1900 mm normalize to the same key. Unknown or ambiguous dimensions never auto-match. The library supports adding sizes, uploading and replacing files. Carts and other products retain individual drawings per box/profile. Both tables use the same private storage bucket with protection against deleting linked files.

Local verification: 143 Angular tests, build, SQL/RLS tests and browser review of the Products list, modal card and shared library. Production has not been updated for these changes.
## Product drawings

Apply 20260909000300_product_drawings.sql before publishing the product-drawing controls. Product drawing stores one original file for the product; each existing cost variant also has an independent drawing slot. Metadata belongs to the same wc_shipping_products catalogue, with an optional variant key. Product drawings never reuse a backdrop box drawing just because dimensions match. Upload/download limits and privacy are the same as packaging drawings. Replacement uses revision checks and linked-file deletion protection now covers all three attachment tables. No new production migration was applied during implementation.

The product list numbering is now the first column on the left.

Apply 20260909000500_drawing_upload_limit.sql before publishing the 20 MiB drawing limit (all drawing types). File validation displays filename, actual size and limit; failures use a persistent alert, and success requires confirmed attachment metadata. Replacement is an accessible icon beside the saved filename. Hub-wide error-feedback requirements are recorded in AGENTS.md.

Product cards now use the same right-aligned, full-height PrimeNG Drawer interaction as Fulfilment (dismissible backdrop, scroll lock), with width min(1260px, 96vw). The backdrop drawing library remains a centered dialog.
