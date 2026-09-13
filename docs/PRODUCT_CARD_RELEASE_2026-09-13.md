# Product card release — 13 September 2026

The owner authorised production rollout of all changes in this task.

- Compact Product header: Short name, Product size and Product drawing share one row where space permits; the redundant Product details heading is removed.
- Backdrop packing uses one shared drawing per product size and folding option. Existing drawings show a replacement control, not a second upload. Unknown legacy folding is explicitly classified without deleting files. SQL rejects stale/concurrent replacements and individual backdrop attachment attempts.
- Reopening Parts & estimated minutes selects an existing saved template instead of presenting a blank new template with the same product name. Saving uses the confirmed returned row, preserves drafts on failure and does not claim success without a saved record.
- Backdrop paint estimates and planned cost use Primer, Sanding and Finish coat. Internal First primer/First sanding keys are retained to preserve saved estimates. Other products retain five operations; Repaint remains unplanned. Existing hidden second-coat estimates are preserved but excluded from backdrop forecasts.
- Shop Floor snapshots the paint route per unit and enforces that sequence server-side. Units with previous painting work or painting completion markers keep their old five-operation route; new/unstarted backdrop units use three. Historical intervals, order financial snapshots and completion markers are not rewritten.

## Verification

Angular unit tests and the production build are required before release. Isolated SQL tests cover both migrations, private storage/RLS, duplicates, exact wrapper replay, new and existing paint snapshots, and three-operation completion. Browser review used synthetic data and confirmed a saved minutes edit survives closing/reopening, a single packing file control, and legacy classification.

## Deployment

Run only the two `20260913000*` migrations via the guarded product-card release helper; never run a blanket `db push`. Publish the Angular app through the existing main-branch workflow after database verification. No Wix writes, courier bookings or email sends are part of this release.
