# Fera reviews → private Hub archive

Fera owns the source reviews and customer media. Hub keeps an independent private
archive for the future storefront. This release does not publish reviews, change
Fera/Wix, or expose customer details to the storefront.

Fera's [private review API](https://developers.fera.ai/reference/list-reviews)
and [media API](https://developers.fera.ai/reference/list-media) are both required.
The CSV export alone is not a complete source for attached photos and videos.
The private API uses a `Secret-Key` header; its key must be held only in the
`FERA_SECRET_KEY` GitHub Actions secret, never in a URL, repository file or log.

## Run

1. Add the existing Fera Secret API Key as the repository Actions secret
   `FERA_SECRET_KEY`. Do not create a new key unless the owner approves that
   access change. The production workflow also needs the existing
   `SUPABASE_ACCESS_TOKEN` and `SUPABASE_SERVICE_ROLE_KEY` secrets.
2. On `main`, manually run **Fera reviews production archive** with `mode=audit`.
   It reads all review and media pages and prints only aggregate counts and
   source media hostnames. No customer payload is uploaded as an artifact.
3. Review the count of product/store reviews, attached media and any standalone
   media. Use the exact media hosts from this audit as the `media_hosts` input.
4. Run `mode=apply`. It rehearses the migration, verifies production
   prerequisites, creates manager-only tables and a private Storage bucket,
   upserts reviews by Fera ID, then copies attached photos/videos into Hub.
   Exact Wix external IDs link reviews to existing Hub product UUIDs. Missing
   product IDs remain unresolved for manual review; names never auto-link.
5. The run succeeds only after Hub confirms all fetched reviews and linked
   media. On failure, rerun `apply`: existing records are retained and absent
   source records are never deleted. Check any oversized, inaccessible or
   unrecognised media format manually before declaring the archive complete.

The script logs no review text, customer contact data, media URLs or secret
values. Source payloads, including possible customer contact details, remain
in `wc_fera_reviews` under manager-only RLS. Only copied media is kept in the
private `fera-review-media` bucket. A future public review projection must
allowlist fields, include only publication-approved reviews, omit private
customer data, and use copied media rather than Fera URLs.
