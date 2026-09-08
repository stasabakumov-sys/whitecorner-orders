# Tabletop replacement material costing

The confirmed #10812 composition is four Classic carts, each with a Tasmanian Oak tabletop replacing the standard top.

Automatic mapping is intentionally narrow: after excluding delivery, there must be exactly one main cart line and one `Benchtop Upgrade` line, with equal positive quantities. Multiple main products, other components or unequal quantities still require composition review. The existing Board/Packing product grouping is retained.

Materials are entered for one complete cart **with the replacement top**, excluding the standard top. The combined key contains the identities and options of both lines. It is independent of order quantity, so an identical future cart can reuse it, while a standard cart or different upgrade cannot. This is a complete material profile, not an additional charge or a second physical product.

## Legacy data and rollout

Apply `20260908000300_tabletop_material_costing.sql` before publishing the UI. It reassigns only pending cost records to the main product and removes obsolete pending component placeholders for recognized compositions. For #10812 it uses the four existing Oak-line production units, matching the Board adapter. It does not modify units, their statuses/history, or calculated cost snapshots. Existing calculated records with conflicting identities remain visible for review.

The migration also re-evaluates pending composition when an order line is inserted, edited or deleted. Ready units are excluded. Saved calculations retain their original prices; composition changes flag them for review rather than recalculating them.

Validation: Angular tests/build, local browser with mock order data, existing material-costing SQL suite and `material-costing-tabletop.test.mjs` using an isolated PGlite database. No production data changes are needed for validation.
