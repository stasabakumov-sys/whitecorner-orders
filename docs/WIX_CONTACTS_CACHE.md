# Saved Wix contacts

Wix remains the source of truth for imported contact fields. Hub stores only the fields used by the Customers screen in `wc_wix_contacts`. The authenticated UI reads this saved list; it does not query Wix on each page load.

## Rollout

1. Apply `supabase/migrations/20260923000300_wix_contacts_cache.sql` through the normal migration process.
2. Deploy `wix-orders-sync`, then the Angular app. Do not deploy the UI before the migration and function.
3. Open Customers once or use **Refresh Wix** to create the first complete snapshot. The existing five-minute order sync also starts a contact refresh when no snapshot exists.

The order sync checks the last successful contact refresh and starts another when the snapshot is more than six hours old. This uses the existing order cron; no new schedule or secret is needed. If the order cron is not configured, manual refresh still works, but automatic refresh will not run.

The Wix pages are validated before one database transaction replaces the saved snapshot. Failed, duplicate, incomplete, or empty-after-population responses leave the previous list in place. Contact IDs come from Wix; this flow does not edit Wix contacts or Hub order data. The snapshot tables are readable only by authenticated users under RLS, and only the server role can write them.
