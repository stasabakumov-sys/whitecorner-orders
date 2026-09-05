# Shipping fulfillment synchronization

## Confirmed code findings

Investigated from `origin/main` at `9d8d838`.

- `bookShipment` saved `Shipping Booked` in `wc_shipments` and `wc_fulfilment`, then called only `refreshBookingStatus`. That method stores courier status/documents; it never completes an order or calls Wix.
- Commit `b3d33a624f9c15c13d4994a48852352adf733097` introduced that shipping path without a Wix call. Commit `986f5015106b70f1265eb10aa9f2436524e5862d` added `markFulfilledInWix` only inside `markCollected` (pickup). The available history does not show shipping fulfillment being removed.
- The UI explicitly displayed “Future: In Transit → Delivered → Fulfilled from courier tracking.” Thus Shipping Booked was the last implemented shipping transition, even though it was not a completed order status.
- Orders reconciles only `wc_fulfilment.status = 'Fulfilled'`. Production Board filters `wc_orders.fulfillment_status = 'FULFILLED'`. Neither could complete the original shipping path.
- The old Wix action uses the Hub ID to look up `wix_order_id`; it does not substitute one ID for the other. It had no shipping caller. Pickup notes use `Order status: FULFILLED`, not an explicit Wix synchronization result.

These facts explain the reported symptom in the source. They do **not** establish what was deployed or the exact production history of order #10806.

## New behavior

1. Check synchronization schema availability before booking. Existing packing, quote, insurance, payment confirmation and courier booking behavior remains in place.
2. After Fast Courier acknowledges booking, `wc_save_shipping_booking` saves shipment/fulfilment booking state and a pending sync record in one transaction.
3. Automatically invoke the authenticated `fulfillShipping` action using the Hub order ID. Its server-side claim requires a saved shipping booking and resolves the Wix ID from the order.
4. Read the Wix order and its fulfillment list. Use remaining authoritative Wix line quantities, including actual delivery/service lines, so the order is fully fulfilled. This does not change goods value, insurance or GST calculations.
5. A per-order server lease serializes calls. Persist `uncertain` before POST. If a response is lost or Wix returns a potentially ambiguous failure, subsequent attempts only verify existing fulfillments. An absent result remains visible for manual review; it never causes a blind second POST. Definite rejections (e.g. HTTP 429) and failed reads can safely retry.
6. After Wix confirms all lines, commit `wc_orders = FULFILLED`, `wc_fulfilment = Fulfilled`, sync success and `WIX fulfilled — shipping booking synchronized` in one transaction. A Notes write failure rolls the transaction back; retry reads Wix before doing anything else.
7. Refresh the local order, open drawer and activity list. Production Board excludes the completed order; Fulfilment uses its existing ordering that places completed rows below active rows. Reload uses persisted status.

Wix failure leaves the shipment booked and the order visibly awaiting synchronization. It is not presented as successful completion. Retry acts only on Wix synchronization. Pickup retains its collection trigger and rollback behavior and cannot use the shipping action.

## Operational boundaries

- Apply `20260905000100_shipping_fulfillment_sync.sql` before releasing the updated UI/Edge Function. The existing `deploy-wix-orders-sync.yml` path filter already includes the new module; JWT verification is not disabled. No workflow change is necessary. The baseline `orders-schema.sql` is not treated as the current schema snapshot.
- No migration, deployment, courier booking, Wix mutation, notification, or backfill was executed against production. Existing bookings are not automatically processed by this migration or by page load.
- If the browser disconnects between saving booking and invoking Wix, the stored pending state can be retried. This change does not introduce a background worker. A courier booking accepted before its local save fails needs reconciliation, not another booking.
- Wix can send its configured buyer notification on fulfillment creation. The tests use mocks only; no such notification was sent.
- An unresolved ambiguous POST requires verification/manual review rather than assuming a retry is safe.

## Migration filename normalization

The audited [rename manifest](audits/migrations-20260905/rename-manifest.json) maps the original filenames to unique 14-digit timestamps. Eleven files were renamed without changing SQL; the confirmed-finance migration already had a unique timestamp. The manifest hashes record the audited working-copy bytes, including their line endings. Its `registerOnly` field records the earlier audit assessment, not permission to modify database history.

Repository preparation does not reconcile production migration history or apply pending SQL. Before merging, review the existing main-branch workflows: the updated package-contents workflow will execute its SQL, and the Fast Courier workflow will deploy its function. Creating this PR does not trigger those workflows.

## Validation

- Angular/Vitest tests cover automatic booking completion, ordering of persistence and Wix call, error visibility, reload, retry without booking, pickup separation, per-order isolation, server concurrency, partial/existing fulfillments, rate limiting and ambiguous responses.
- `supabase/tests/shipping-fulfillment.mjs` executes the migration in isolated PGlite PostgreSQL. It verifies real SQL, booking atomicity, completion/Notes rollback, leases, stale tokens, repeat safety, pickup isolation, existing-data behavior and authenticated/anonymous RLS. It uses representative base tables and the repository's fulfilment/shipment/quote migrations; it is not a production schema test.
- To run that SQL test, install `@electric-sql/pglite@0.3.14` in a temporary directory, then run `node supabase/tests/shipping-fulfillment.mjs <absolute-path-to-pglite/dist/index.js>`.
- The server module is also checked with the project's TypeScript compiler. A full Deno runtime check was not run because Deno is not installed.
- Browser review used the production Angular bundle behind a local mock server, with external connections blocked. Checked error → retry → Fulfilled, open-drawer refresh, reload, Orders, empty active Board and Wix note. Screenshots are recorded in the task. No production payloads were used.
- Build succeeds with warnings for the initial bundle budget and the unrelated Email component CSS budget.

## Production verification still required for #10806

No suitable authorized connector, session, Wix/Supabase environment credentials or `.env` configuration was available. The project's frontend publishable configuration is not privileged diagnostic access. Hub rows, deployed logs, and Wix responses for #10806 were therefore **not read**.

In an authorized environment, read only the order's Hub ID/Wix ID mapping, both local statuses, shipping booking timestamp/reference, related activity and Edge logs; then GET the Wix order and GET its fulfillment list. Establish whether a fulfillment already exists and which deployed code handled booking. Do not trigger sync, repair status, rebook/cancel shipping or notify the customer without separate authorization.

References: [Wix Create Fulfillment](https://dev.wix.com/docs/rest/business-solutions/e-commerce/orders/order-fulfillments/create-fulfillment) documents asynchronous order-status recalculation; [List Fulfillments for Single Order](https://dev.wix.com/docs/rest/business-solutions/e-commerce/orders/order-fulfillments/list-fulfillments-for-single-order) provides the read path used for reconciliation.
