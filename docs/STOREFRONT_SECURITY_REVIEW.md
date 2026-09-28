# Catalogue importer security review — 28 September 2026

The owner authorised production on 28 September in the catalogue migration task.
The CI management token permits database queries and function deployment, but cannot
read API keys. Do not broaden that token or export the service-role key.

`hub-catalog-sync` uses application-level machine authentication instead of the
gateway's user-JWT check. Every request must supply a cryptographically random
256-bit job token. Only its SHA-256 digest is stored in an RLS-protected table;
anon and authenticated users cannot read or write that table. CI creates a token
through its existing authorised database connection. The token expires within two
hours, is masked in Actions, is never bundled into the storefront, and is revoked
after successful completion. This exception applies only to this new maintenance
function. All existing protected functions retain JWT verification.

The handler authenticates before parsing the action. Its allowlist is: read Wix
products into Hub, read Wix collections into Hub, and copy Wix-hosted media to the
two dedicated catalogue buckets. It has no order, customer, payment, email,
courier, arbitrary SQL, arbitrary URL or arbitrary bucket action. Media downloads
allow only HTTPS Wix media hosts, reject redirects, enforce MIME and a 50 MB size
limit, and use content-hashed storage names. Private media uses a private bucket.
The private service key stays inside the Edge Function runtime.

The anonymous storefront reads only `wc_storefront_catalog`, containing a field
allowlist of visible products. No source payloads, costs, internal notes, drawings,
customer fields or secrets are included. Source tables retain their existing RLS.
The Site retains its owner-private audience. Public catalogue media is limited to
visible products and existing storefront editorial images. Hidden media remains
private. The release validates the complete import and every copied asset before
atomically replacing the last successful projection.

Validation: migration rehearsals assert anonymous source-data denial, anonymous
write denial, staff write denial and separate public/private buckets. Projection
tests assert hidden-product exclusion, variant-price preservation, stock semantics,
incomplete-media rejection, unknown-category rejection and SSRF host checks.
