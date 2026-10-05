# Modeling catalogue names and indicative pricing

The two editor models have explicit bindings to Hub product UUIDs and the owner-provided product paths in `modeling-pricing.ts`. Names never merge records. The UI reads only `wc_storefront_catalog` live public projection through the existing Supabase client. Its published names and exact variant selling prices are the source of truth; Wix remains the commercial import source. No operational records, cost prices, customer data or new public contracts are exposed.

Classic dimensions must match a published Size option exactly. The roof model binding covers 1200 × 600 × 900 mm table dimensions only. The editor currently has no side shelves, so its roof-cart variant selects Side shelves = No. Raw/White map explicitly; other painted colours use the published Custom variant. Internal Shelf maps Yes/No. Do not interpolate prices for other dimensions. Missing or duplicate variants produce Quote required.

Breakdown derives cart, finish and shelf deltas from exact variants under the same selected size/colour. Paint deltas can differ by size. The amount is labelled Catalog subtotal, not a final quotation. Front panel and tabletop selections, plus closed roof and rack additions, have no confirmed separate rates in this projection and remain Quote required. This preserves the owner's instruction that pricing is not yet complete.

PDF defaults to Without prices. With prices adds a separate indicative pricing page with the same frozen subtotal and unpriced options, plus the catalogue publication date. No-prices exports contain no pricing page or pricing fields. Existing configuration and historical order values are not rewritten.

A failed catalogue read shows an error and Retry catalogue. Previous catalogue pricing is cleared after a failed refresh rather than silently presented as current. The editor and no-prices export remain usable with the saved model name as a fallback until Hub names can be retrieved.

All right-hand Modeling sections share a compact accordion heading showing the current selection. Optional Shelf and moulding use None when excluded; Shelf uses Middle when included. Required selections retain their actual value (for example Open roof or RAW finish). Collapsing a section keeps projected controls and their state. Sections with new upload, catalogue, drawing or texture errors open automatically to expose the message and retry action.

The owner hid the Model file section, filename and upload/save controls from the customer-style editor. Private model storage and file handling remain internal; model-opening failures still appear as visible alerts.

Owner clarification: headings use light white cards rather than dark bars. Keep 10 px control text and consistent Colour/Paint finish subheadings. Optional Classic moulding uses a checkbox with None/With moulding summary. Parts & assembly sits near the bottom, before Building.
