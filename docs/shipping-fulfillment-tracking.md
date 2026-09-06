# Shipping fulfillment tracking and recovery

The shared `wix-orders-sync` action `fulfillShipping` reads `wc_shipments.selected_quote` by the supplied Hub order ID. It uses `booking.status.consignmentNumber` for tracking, `courierName` for the actual carrier (not the Fast Courier aggregator), and `name` for the booked service. Missing metadata stops before any Wix request. There is no manual tracking input or courier API call in this action.

Create Fulfillment sends `fulfillment.lineItems` and `fulfillment.trackingInfo.trackingNumber` / `shippingProvider` in one POST. Service is validated from the saved quote; the Wix fulfillment tracking object has no service field, so none is invented. No tracking URL or notification-management parameters are sent. Wix recalculates the order fulfillment status asynchronously; Hub confirms concrete records, not that eventually updated status.

Before POST, the server reads the Wix order and its fulfillment records, verifies order identity and quantities, and matches the saved tracking and carrier. A matching record covering the remaining order is reused with its existing ID. Incomplete matching shipments, mismatching fully fulfilled orders and ambiguous duplicate records require review. Unrelated partial fulfillments leave only remaining quantities for a new fulfillment.

A database lease serializes requests for the same order. `uncertain` is committed before POST. A lost response or ambiguous failure triggers another fulfillment-record read immediately. If a matching complete result is found, it is recorded without another POST. Otherwise the uncertain state remains; a later Retry reads records again and never blindly repeats POST. Definite rejection may be retried, always following fresh reads.

The new migration `20260906000100_shipping_fulfillment_completed.sql` adds `completed` while accepting legacy `synced` for rollout compatibility. Confirmed completion requires a Wix fulfillment ID and atomically updates Orders and Fulfilment, saves the ID/status and adds one `WIX fulfilled` note. A repeat of the same completion is a no-op. A failed Wix operation can update sync diagnostics, but does not complete Orders/Fulfilment or add an Order Note. The migration does not process existing orders.

New booking uses the existing booking-status fetch to save tracking before calling the same action. If tracking arrives later, the existing polling flow invokes it once tracking is saved. Retry never fetches courier status or documents. Retry is disabled without saved metadata or while its order request is running and disappears when the row becomes Fulfilled.

## Release prerequisite

Apply the new migration in a separately approved operation before deploying the updated Edge Function. The existing main-branch workflow automatically deploys Wix source changes on merge, so do not merge this PR until the migration/deployment sequence is approved and ready. Neither migration nor deployment is performed by repository tests or PR creation. Email AI is unrelated and must not be included in that migration operation.

The updated action requires the migration's `contractVersion: 2` claim response before any Wix request, so deploying code prematurely cannot create a fulfillment with an incompatible completion function.

For deployment compatibility, terminal claim responses keep `status: synced` for the old Edge Function and include `contractVersion: 2` and `wixFulfillmentId` for the new one. Stored completion still uses `completed`. Legacy terminal records without a fulfillment ID remain terminal for the old code; the new action reports manual review rather than claiming verified success or creating a duplicate.

## Validation

- `npm test -- --watch=false` and `npm run build` from `angular-app`.
- `node supabase/tests/shipping-fulfillment.mjs <absolute-path-to-pglite/dist/index.js>` runs both shipping migrations against isolated synthetic PostgreSQL tables; checks completion rollback, record ID, note idempotency, leases and RLS.
- Mock fixtures use synthetic order identities. No production API or order (including #10830) is read or mutated for these tests.
- Existing authenticated user validation in the Edge handler and service-only claim/completion permissions remain enabled. Wix secrets remain inside the Edge runtime.
