# Fera reviews storefront release

The Fera archive (`wc_fera_reviews`, `wc_fera_review_media`) remains private with
manager-only read access. `source_data` can contain contact data and is never
returned to the storefront. Wix/Fera owns imported content; Hub owns
`is_published`, `public_author_name`, and any explicitly corrected Hub product
link. Repeat imports omit these local columns.

The first publication migration enables only reviews whose Fera state is
`approved` or `published`, matching the existing Wix storefront editorial
decision. New imports default to private. A Hub manager can change publication
status. Display names default to `Customer`; a manager can enter an approved
public display name. Storefront payloads contain an explicit list of review
fields, the Hub product name, and media IDs. They exclude the private Fera
payload, source URLs, email, location and customer IDs. Product association
uses the exact saved Wix/Hub mapping, never a name match.

`hub-reviews-public` has gateway JWT verification disabled **only** to serve
published review content and its copied media. It accepts GET/HEAD/OPTIONS,
has no mutation, accepts only UUID media IDs, checks the linked review's
publication status on every request, and reads only the private review bucket.
Oversized video parts are streamed in order with byte-range support. The
service-role key remains in the Edge runtime. CORS is open because these
published reviews are intentionally public; the new test Site itself remains
owner-private. Changing this contract or Site audience requires a fresh review.

The one Fera attachment returning 404 has only a private missing-media marker;
it is never advertised by the storefront. Partial media import does not delete
prior copies or publish source URLs. No Fera writeback occurs.
