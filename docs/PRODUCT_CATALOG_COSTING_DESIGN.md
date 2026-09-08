# Unified product catalogue and order costing

## Confirmed requirements

- `Tabletop design`, including `Plain - without cutouts`, is a main-product option, not a separate tabletop or addon. A separately purchased `Additional Tabletop` remains a component with its own material/work costs. `Custom Cutouts for the Additional Tabletop` describes processing of that component; it does not create another physical tabletop.
- Shipping Data becomes the common catalogue UI for product variants, packaging, materials, Pans and production work. Existing packaging profiles and their saved identities must remain valid.
- Replace the Products column in Product Costing with order-level financial columns: Product cost, Pans cost, Product − Pans cost. Keep order/customer, status, recorded production costs and the action opening the order drawer.
- Product cost means the order total less delivery, including GST. It is a sales amount, distinct from production cost. Reuse the existing delivery/GST calculation rather than separately subtracting delivery lines and shipping totals.
- The order drawer shows every main product and its assigned addons. Match profiles using stable product identity and relevant variant options, never a fuzzy name match. Load existing data automatically; allow creation when no matching profile exists.
- Materials, CNC, assembly, sanding and painting are separate cost categories for each main product and each addon. Work is included in this requested expansion (superseding the earlier materials-only phase).
- Cost changes apply to new calculations only. Existing snapshots are immutable. Ready main products do not generate new calculations; stray pending addon records must not make an otherwise Ready order actionable.

## Pans valuation used in this implementation

Pans cost is the partner purchase cost including GST for the complete selected set per product. This assumption was stated before proceeding. Product cost − Pans cost therefore subtracts this purchase cost from the order sales amount excluding delivery; it is not a sales breakdown or profit. Pans prices are snapshotted independently once all selected sets have prices, even while materials or work are still incomplete.

## Proposed data and UI structure

Keep a single catalogue entry for each stable Wix product identity, with related variant profiles rather than one price shared by every variant. Extend the existing Shipping Data catalogue to include products that have costing profiles but no packaging profile. Do not create a second editable copy of the same profile.

For each variant, expose:

1. Packaging, retaining the current box editor and quote rules.
2. Materials: catalogue material, unit, quantity for one product, current GST-inclusive price and calculated subtotal.
3. Work: separate GST-inclusive amounts per unit for CNC, assembly, sanding and painting. Blank means unknown, zero explicitly means no cost. If time/rate costing is introduced later, preserve the same cost-category identities.
4. Pans: the amount for the complete selected Pans set for one product, with its Pans selection shown. Multiply by the product quantity once; do not multiply again by the number embedded in the selection label.

In the order drawer, main product and addons each have their own editor and subtotal. The physical-product total is the main product plus assigned addon quantities and their costs. Sum physical products to obtain the order production cost. Keep Pans separate to avoid counting it again in manufactured components.

When no Pans are selected (`without pans`, `without steel pans`, etc.), the order Pans amount is zero. When Pans are selected but a price is missing, show an incomplete amount, not zero. If any required Pans price is unknown, Product − Pans cost is also unknown.

## Composition and historical compatibility

Use the same order-line grouping as Board and Packing. Preserve original component IDs and per-product quantities. Options never create physical products merely because their value contains words such as cutout, tabletop or Pans.

For a replacement tabletop, do not add both the standard top and the replacement top. A separately costed replacement requires an explicit profile decomposition; do not infer a deduction from an existing full-product materials list. Retain existing combined tabletop profiles and locked snapshots as legacy complete-product calculations until a reviewed split profile is saved for future calculations.

Unassigned addon lines, non-divisible quantities and ambiguous parents remain explicitly unresolved. Do not silently suppress these warnings for actionable products. An order whose main products are all Ready and has no recorded costs is excluded from new costing, regardless of pending component placeholders.

## Validation and rollout

- Verify sales totals including GST against existing invoice/delivery rules, discounts, additional fees, missing amounts and zero delivery.
- Verify mixed orders with and without Pans, quantities greater than one, missing prices and the existing negative-Pans selections.
- Verify independent main/addon material and work subtotals, replacement versus additional tabletop, repeated variants and option changes.
- Verify immutable snapshots and price updates, Ready exclusion, stable catalogue matching, authenticated RPCs/RLS and stale-edit guards.
- Migrate without altering packaging, saved courier quotes, booking or production status/history. Publish the UI only after the required database migration.

Implemented locally by migration `20260908000400_catalog_product_costing.sql` and the shared catalogue cost editor. The existing `wc_shipping_products` registry is reused; `wc_material_profiles` holds linked component/variant profiles. Saved profiles retain an example item so they remain editable after its source order line is removed. Existing calculated records retain their original materials-only meaning; no historic work costs are invented.

Before production release, apply the new migration after `20260908000300_tabletop_material_costing.sql`, then publish Angular and deploy the functions using the updated shared delivery domain. Local PGlite regression tests cover shared registration, separate components, Pans snapshots, price changes, Ready exclusion, authenticated access and profile survival after source removal. Angular tests/build and a browser review with synthetic data cover the report and both uses of the shared editor. No production migration or external booking/email operation is part of this implementation check.
