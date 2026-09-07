# Material costing (first release)

## Business rules

- Materials and calculations are AUD **including GST**. No division by 1.1.
- A profile specifies material quantities for **one product unit**. The material's unit is fixed after creation; create a new material to change its unit. Use m2 for area and sheet for whole/fractional sheets; no implicit unit conversions.
- Zero is a valid free material price. A blank price means unknown and prevents calculation. Archived materials remain in history but cannot produce new calculations.
- Profiles match product identity and exact imported options (including Size, catalog options, custom fields and description lines). This deliberately does not guess equivalence between different option representations or unrelated products. Quantity, order IDs and prices are not part of the variant identity.
- Each production unit gets its own costing record. Ready units without a calculation are excluded; a mixed order includes only eligible units. Hidden/#10242, archived, cancelled and already fulfilled orders are excluded from initial processing. Non-AUD orders are outside this release.
- Existing eligible products start as Materials required. Creating a profile calculates matching pending units. Completing a missing price calculates pending units. New units calculate automatically using the available profile and current prices.
- A calculated record is immutable to application users. It stores names, units, quantities, prices and rounded line totals, plus the profile version, options and time. Price/profile edits only affect later calculations, including previously uncalculated products.
- Recorded costs remain visible when production advances to Ready. Deleted/replaced units and changed quantities/options are marked Order changed; the earlier calculation is never silently replaced. Order/product totals cover recorded units and are labelled partial when records are pending or changed.
- No production gate, quote, booking, Wix mutation, payment or customer notification is introduced.

## Storage and automatic processing

Migration `20260907000800_material_costing.sql` adds `wc_materials`, immutable price history in `wc_material_prices`, shared `wc_material_profiles`, and immutable calculated snapshots in `wc_product_costs`.

Authenticated clients have read-only table access. Material/profile mutations use authenticated security-definer RPCs with validation and optimistic concurrency checks. Internal calculation functions are not callable by authenticated/anonymous clients. Triggers process imported units and changed items; Ready progression does not recalculate saved results. Writes are serialized with a transaction advisory lock to prevent price/profile races.

The migration seeds costing records for existing eligible units without updating any order, item or production status. With the initially empty profile catalogue these records contain no guessed prices. Opening either report is read-only; Refresh does not invoke quotes or recalculate stored results.

The snapshot line format includes `kind: material`. A later separately scoped release can add labour/work definitions and a new snapshot version. This release contains no labour entry controls, rates, work calculations or totals presented as full manufacturing cost.

## Release

Not automatically applied by CI. Before production, inspect current schema/history and apply only this migration in a guarded transaction after approval. Do not use db push/include-all or apply pending Email AI. Deploy the Hub only after schema verification. No Edge Function changes/deployment are required. The base `orders-schema.sql` remains a bootstrap schema; migrations are authoritative.

## Verification

Run Angular unit tests and build. `.github/scripts/material-costing.test.mjs` rehearses the migration and automatic calculations using isolated PGlite. CI runs it with the other isolated migration tests. Browser checks use synthetic products and intercepted requests; no real order data or integrations are needed.
