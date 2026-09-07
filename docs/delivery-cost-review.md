# Delivery Cost Review

One durable estimate per new delivery order, or after packaging confirmation for an existing non-Ready order. This report is separate from actual booking quotes in Fulfilment. Viewing/reloading it and changes to the Wix invoice never request a new quote.

## Data and workflow

- Migration `20260907000100_delivery_cost_review.sql` creates `wc_delivery_reviews`, `wc_delivery_packaging_profiles`, `wc_delivery_booking_exemptions`, an INSERT-only order trigger and service-only claim/package/exception RPCs. It does not alter existing order rows, create bookings, call APIs or apply Email AI. It snapshots existing Ready/reached-Fulfilment orders as booking exemptions and seeds existing non-Ready delivery orders as `legacy_packaging_required` (not queued for automatic quotes).
- New orders start in `importing`; Wix sync releases them only after its complete item import succeeds. Its background worker examines five waiting rows per successful sync, ordered by last examination so missing packaging cannot starve newer orders. The existing scheduled Wix sync must be configured for unattended queue processing; this change does not install a new cron job.
- Exact saved composition profiles are reused. Legacy product templates are expanded for quantity only where there are no separately packable addons. Unknown addon distribution requires packaging input. Required-component mapping is shared by the report and Fulfilment, including No effect rules.
- Saving complete packaging with explicit confirmation starts the one permitted estimate. Saving a reusable composition profile lets other identical orders use it when the worker next runs. Components may span boxes; duplicates inside a box and unassigned components are rejected.
- Before POST `/api/quotes`, the server commits `quote_attempted_at`, the complete request, package/input snapshot and insurance options. Concurrent claims and subsequent runs cannot POST again. An uncertain result is surfaced for manual investigation, never automatically retried.
- The complete HTTP response/body is saved BEFORE interpreting it. All returned carriers are retained and visible. The browser uses saved data only. Carrier eligibility is separate from storage.
- Aramex, Couriers Please and FedEx exact normalized aliases are considered. TNT is not mapped to FedEx. Unknown carriers remain visible but excluded.
- Existing Hub insurance rules are retained: goods value includes GST; divide by 1.1 for cover selection; insurance fee applies above AUD 450 excluding GST; quote total is GST-inclusive price plus tier fee. Insufficient cover blocks quoting rather than inventing coverage.
- Comparison uses cents: `total * 10 <= invoiceDelivery * 9`. Minimum invoice delivery is rounded UP: `ceil(total * 10 / 9)`. Invoice delivery includes the Wix shipping total plus explicit Delivery/Shipping fee line items. AUD only; missing monetary values do not become zero.
- An exception records authenticated actor, timestamp, reason and exact invoice/input values. Order version and items are checked again in its transaction. A Wix price change recomputes the result against the same saved quotes. Changed goods/address/options/rules show manual review, without another quote. Approval history remains available.
- Saved report packages can seed Fulfilment when its order inputs still match. They do not approve a packing list or create a booking. Existing booking safety checks remain in place. Booking is additionally blocked in Hub and on the server until the review is Within target or Approved exception. Only the fixed pre-cutover Ready exemption bypasses this new gate; becoming Ready later never creates an exemption.

## Estimate assumptions

Use the existing Hub pickup locality (Burleigh Heads QLD 4220, commercial), residential destination and no tail lifts. These assumptions and all request fields are visible in the saved snapshot. The existing quote payload does not send a collection date. No address-classification or booking API is called by this report. This is an initial cost estimate, not a guaranteed future booking price. The snapshot remains available indefinitely; there is no expiry-triggered requote.

## Rollout — separate production authorization required

1. Inspect production migration history and schema read-only. Prepare and rehearse a guarded apply-only transaction for **this migration only**. Do not use blanket `db push` or apply unrelated pending migrations (including Email AI).
2. Apply the reviewed migration only after production authorization; verify tables, RLS and RPC privileges.
3. Merge/deploy only after authorization. Existing main-push workflows publish Hub and deploy `wix-orders-sync` plus `delivery-cost-review`; Fast Courier deployment installs its server booking gate. Shared domain changes trigger both build and function deployment. PR checks do not deploy these functions. Package-contents SQL retains its content-change guard and is not applied by this change. Fast Courier shared dependency edits now trigger its deployment guard.
4. Keep `DELIVERY_REVIEW_ENABLED` unset/false until migration and all three functions have been verified. Enable it via the project runtime secret only as an authorized production activation. It gates background quoting and packaging-triggered quoting. Existing Fast Courier credentials remain server-side.
5. Confirm the existing scheduled Wix sync is configured. New rows created since the migration will be processed; pre-migration non-Ready orders wait for manual packaging confirmation, while already Ready orders retain a fixed booking exemption.
6. Read-only verify a saved response after an authorized real new-order estimate. No live quotes or order writes were used in development.

If a quote may have been sent but its answer is unavailable, do not clear `quote_attempted_at`. Reconcile externally under a separate authorization. There is no Retry quote action in this report.

## Checks

From `angular-app`: `npm.cmd test -- --watch=false` and `npm.cmd run build`.

From repository root:

```powershell
node --test .github/scripts/delivery-review-worker.test.cjs
node --test .github/scripts/production-changes.test.mjs
npx.cmd --yes deno check --no-lock supabase/functions/delivery-cost-review/index.ts supabase/functions/wix-orders-sync/index.ts supabase/functions/fast-courier-api/index.ts
# Supply the path to an isolated PGlite 0.5.8 installation (no production connection):
node .github/scripts/delivery-review-migration.test.mjs '<runtime>/node_modules/@electric-sql/pglite/dist/index.js'
git diff --check
```

CI runs Angular tests/build, worker mocks, Deno check and the in-memory PostgreSQL migration rehearsal. Manual browser review uses synthetic data with outbound integrations blocked.
