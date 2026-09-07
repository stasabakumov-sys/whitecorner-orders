# Size-specific packaging templates

Shipping Data now has Packaging variants per shipping product. Choose an existing
order's option values or enter the exact Wix options, assign every component to
boxes and save a one-product template. Copy to another Size retains an independent
copy of boxes and assignments and requires a new Size and confirmation. Other
options (including Internal Shelf) remain part of the exact signature.

Delivery Review can load a matching template into its editable draft. Configure
packaging variant opens Shipping Data for the product. Loading never quotes;
explicit packaging confirmation follows the existing one-time quote flow. Saved
quotes are not rewritten. The worker and Fulfilment reuse exact per-product
profiles and expand physical boxes for quantity. Legacy product-only boxes are
never used for an item carrying a Size option.

Migration 20260907000500_packaging_variant_editor.sql adds nullable product/item
metadata and an index to the existing profile table. Existing profiles and RLS
remain unchanged. The authenticated delivery-cost-review save-packaging-variant
action validates the complete packing list and writes canonical components using
service-role access. It makes no external API calls and updates no orders.

Apply only this migration before deploying the matching function and Hub; do not
apply pending Email AI or use db push. Merge/deployment needs production approval.
No measurements for real products or orders are invented by this release.
