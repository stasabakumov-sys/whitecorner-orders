# Modeling module

Keep owner communication in Russian and every interface label, message, title, tooltip, and aria label in English. Apply the root AGENTS.md rules here too.

## Editor and geometry

- Use light compact sections with thin borders and rounded corners. Keep controls, labels, values, help, and state text at 10px / weight 400 / line height 1.45 with the inherited Inter font. Section headings are 10px / 600. Verify computed styles in the browser, including nested components, dialogs, loading, and errors; save a review screenshot.
- Order the first sections Dimensions → Finish → Options → Front logo. Parts & assembly and Building stay below. Binary options use checkboxes and section summaries show None or the selected value.
- Finish combines Body, Table top, and Side shelves. Side shelves inherit the table top by default and may have an independent finish. Use the table top swatch pattern. Preserve painted/raw and colour semantics for catalogue variants and pricing.
- Keep glued and mating front, top, and side shelf joints square. Round free edges. The entire plywood edge thickness has plywood edge texture.
- Start every cart with its front panel toward the viewer in the same 3D angle. Home resets orbit, pan, and zoom without changing the configuration. Orbit, Move, Home, and Four views use translucent icons; Move has a hand icon but the ordinary arrow cursor. Four views contains orthographic Top, Front, Side and interactive 3D. Hide floor shadows in technical views.
- The roofless decorative wheel cart derives geometry from the private roof cart source but has its own product/configuration slug. Remove roof parts, tall posts, four holders directly under the tabletop, and the four tabletop post holes. Keep the short lower Legs 1–4 that support the castors, together with the body, decorative wheels, and roof family resize/material rules. It has an optional internal shelf, two optional 200 × 600 mm side shelves, and an optional umbrella hole/preview. It has no ice shelf. A derived view must never overwrite the saved roof source.
- The 1200 × 600 × 850 mm 2-in-1 cart derives its folding body, castors and side shelves from the private 1500 × 600 × 850 mm MDF side shelf cart. Keep its own slug and exact Hub product link. The 1500 mm pan cutout tabletop does not fit the 1200 mm body: use the plain tabletop until a verified 1200 mm cutout layout exists. Its two 200 × 600 mm side shelves are included in the base product; internal and ice shelves are optional. Place the umbrella hole at Left, Middle or Right and align the top, shelf, ice shelf and bottom holder. Do not overwrite the saved 1500 mm source.
- Put the model picker and Hub product photo in the right settings panel, show model names only through their first full stop, and keep the desktop panel 288 px wide. Keep the picker usable on narrow screens.

## Data and output

- GLB source files remain in private Hub storage; do not include them in public bundles or expose their signed URLs in the interface. Keep source model, cached file, and uploaded model identity distinct.
- Use Hub's customer selling prices in AUD including GST, not cost. Bind products by exact Hub UUID and path and variants by their full choice set. Never infer a price from a similar name, size, finish, or different cart. Unknown combinations and unlisted add-ons are Quote required. Wix remains the commercial source until a separate migration decision.
- PDF includes White Corner branding, saved configuration, dimensions, and optional prices. Keep the with/without prices choice. Do not add Edge rounding or the obsolete glasses description. The rack name is Wine Glass Rack Chrome 405mm.
- CNC uses G-Code Arcs (mm) (*.tap); do not prepare toolpaths or run equipment without a corresponding task.
