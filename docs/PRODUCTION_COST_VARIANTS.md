# Production cost and structural estimates

Backdrops show four production cost rows for each explicit product size: Foldable Raw, Foldable Painted, Non-foldable Raw and Non-foldable Painted. Columns show current materials, planned work and total in AUD including GST. Optional add-ons are excluded from this per-product comparison. Existing order costing snapshots are not recalculated.

Materials match the product's saved main-material profile by product size and folding. Colour does not create a different backdrop material specification; conflicting saved colour profiles remain incomplete until reviewed. Missing or unconfirmed quantities, material prices, minutes and rates do not become zero. Repaint is excluded; Raw excludes painting. Backdrops retain the three painting operations.

Estimated min provides size selection and separate Foldable/Non-foldable tabs. Each stores its own parts and every stage's minutes; switching preserves unsaved variant drafts. The database enforces one template per product/size/folding and checks optimistic versions. Existing templates retain their data with unassigned scope: open the saved template, choose size and assign its folding option, then save. Do not infer folding from product title or copy the same minutes into both variants.

New Shop Floor assignments must match the order item's explicit size and folding. An unassigned old backdrop template cannot be assigned until classified. Already assigned unit parts/estimates and historical intervals remain unchanged, even when templates are edited later.

Migration: `20260914000100_production_template_variants.sql`. Apply with the targeted `production-variants-release.mjs` wrapper; it preserves previous migrations, supports replay, verifies grants/RLS and never performs a blanket database push. No packing or product drawing changes are included.

Validation includes separate costs for all four rows, explicit zeros/missing inputs, conflicting material profiles, variant draft switching, saved-row confirmation, unique/stale server rejection, wrong-variant assignment rejection, unchanged historical unit snapshots, and private access. Browser verification uses synthetic data in the actual edited Angular components, including save/reopen and the four-row table.
