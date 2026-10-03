# Constructor RD export

The local Constructor generates two `.rd` files: one bottom half and one lid
half. Each is cut twice. Inputs describe the assembled bottom; the lid is
10 mm larger in L and W, with the same D. SVG layout does not affect RD output.

## Browser generation

`angular-app/public/rd-generator/worker.mjs` starts a module worker and loads
Pyodide **314.0.7** from jsDelivr. Geometry and settings pass to the worker as
JSON and remain on the computer. The first export requires internet access;
runtime errors and timeouts are visible, keep inputs and permit retry.
Both files are prepared before separate download buttons appear. Preparation
does not prove the browser saved a file. No controller connection is made.

The separately distributed `ruida.py` is from jnweiger/ruida-laser, revision
`a1e7b9b93b10d5cac79c875bc3efec46f7397a11`, under GPL v2. Its copyright,
license, upstream hash and local syntax correction are in the adjacent README
and LICENSE. `generate.py` is a GPL v2 adapter calling that generator. It uses
absolute coordinates, zeros power on lasers 2–4, folds before cutting and
selects Ruida Anchor point (`D8 11`) instead of the upstream current-position
command (`D8 12`). Air assist is enabled by the upstream generator. Travel
speed is a controller default: the upstream speed tuple's travel element is
not emitted, so no misleading travel-speed field is offered.

## Owner settings (2026-10-03)

- Red Laser Cut: speed 120 mm/s; minimum power 70%, maximum 80%.
- Blue Laser Dot: speed 120 mm/s; minimum power 70%, maximum 80%; dot time
  0.1 s, dot interval 2 mm, dot length 1 mm.

RDWorks V8 manual section 4.10.4 describes positive Dot Length as a moving
dash. Dot Time applies only when Dot Length is zero. Its Dot Interval is the
distance between consecutive starts. Constructor expands the supplied mode
into 1 mm laser-on paths at 2 mm pitch (1 mm uncut gap), clipped to each fold
line. The RD stores these explicit dash paths, not editable RDWorks Laser Dot
settings. The 0.1 s value is retained in the UI but is not emitted as a dwell
because the dot length is positive. Zero-length stationary pulses are rejected.

References:
- https://github.com/jnweiger/ruida-laser/blob/a1e7b9b93b10d5cac79c875bc3efec46f7397a11/src/ruida.py
- https://lasermeister.ee/wp-content/uploads/2021/04/RDWorks-V8-manual.pdf
- https://github.com/meerk40t/meerk40t/blob/main/meerk40t/ruida/rdjob.py
- https://pyodide.org/en/stable/usage/webworker.html

Tests inspect output geometry, binary commands, dimensions, speed/power,
single-laser selection, origin and EOF. These checks do not establish physical
controller compatibility. An operator must review and confirm a test cut before
calling these files production-verified. File generation does not transfer
jobs, start cutting or mark any Hub packing task complete.

Read-only binary check using the supplied owner settings:

```text
python scripts/rd-generator/verify-files.py <bottom-half.rd> <lid-half.rd>
```

Local checks on 2026-10-03: 450 Angular tests passed; production build passed
with existing bundle/CSS budget and CommonJS warnings. Chrome generated and
downloaded both files for 715 × 415 × 49.3 mm; network failure followed by retry
worked; mobile 390 px had no horizontal overflow. The independent binary check
confirmed half blanks 406.8 × 513.6 and 411.8 × 523.6 mm, 615/626 fold dashes,
12 outline segments, 120 mm/s, 70–80% on laser 1, zero other-laser powers and
Anchor point. Physical cutting and controller loading were not performed.

## Cart packaging integration

Constructor remains an independent Hub tab at `/packing/constructor`. Cart
packaging uses the same `BoxConstructorComponent` in a dialog, with saving added
by `CartBoxConstructorComponent`. This does not replace the independent editor.

Only saved reusable Cart Base and Add-on boxes offer the Constructor icon.
Save packaging edits first. Shipping L/W are reduced by 15 mm for the assembled
bottom and 5 mm for the assembled lid; H is unchanged. For example, packaging
1230 × 630 × 80 produces bottom 1215 × 615 × 80 and lid 1225 × 625 × 80.
The dialog fixes these derived dimensions; laser settings and SVG layout remain
editable. The independent Constructor continues to accept bottom dimensions.

Generate two RD files, review the drawing, then use the Save icon. One SVG and
two RD files are saved to that box, with two cutting copies per RD. SVG uses the
private `box-drawings` bucket and its own `wc_cart_box_svg_drawings` reference;
existing CDR references remain separate. SVG is downloaded as a reference and
appears in the existing CDR column alongside any CDR source. That column checks
the SVG snapshot against packaging dimensions and refreshes after Constructor
Save; its file dialog provides the signed SVG download. SVG does not enter
the laser queue. Existing RD sets of exactly two files require
explicit bottom/lid selection unless prior Constructor metadata identifies
them. Other existing sets require review in the RD editor first.

Manual packaging drawing uploads accept SVG or CDR (up to 20 MB). Cart source
uploads require `20261003000600_packaging_svg_sources.sql`; existing access,
revision and geometry checks remain in force.

Migration `20261003000400_cart_constructor_files.sql` must be applied before
using this integration in a deployed Hub, together with
`20261003000500_cart_file_mapping_access.sql`, which enforces active Hub
membership on existing Cart mapping functions. The Constructor migration adds SVG MIME support to the
existing private bucket, read access for active Hub members and manager-only
atomic saving. Geometry, revisions, uploaded object sizes and the complete RD
set are checked by the server. RD replacement uses the existing function and
preserves its active-transfer guards and unfinished-task update rules. No
transfer or cutting is started. A save receipt allows the identical request to
recover after a lost response. The frontend retains that request for Retry;
upload failure before saving leaves previous saved files intact.

Cart checks use mock browser storage and isolated PGlite SQL. They do not write
to production. Custom combined Main profiles remain profile-local and use their
existing file editors; this integration belongs to reusable Cart box IDs.

Integration verification on 2026-10-03: 456 Angular tests in 79 files passed,
production build passed with existing budget/CommonJS warnings, and the
isolated Packing PGlite suite passed. SQL checks cover permission restrictions,
dimension checks, rollback of a partial set or stale second RD, stable file IDs
on replacement, and identical-request retry. Browser review generated the
1230 × 630 × 80 example, saved all three files using mock storage, recovered
from a simulated save failure, and verified the separate editable Constructor.
The dialog had no horizontal overflow at 390 px. Screenshots and command logs
are local review artifacts. No production migration, deployment or laser
transfer was performed.
