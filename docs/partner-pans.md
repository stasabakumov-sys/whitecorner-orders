# Partner Pans

The Wix option named `Pans` is supplied directly by a partner. Keep every option
visible in order composition but exclude this option from the shared packaging
component mapper. The exclusion applies to any Pans value, including `Cart
without pans`. Other addons, cart quantities and insurance valuation are unchanged.

The Partner Pans report reads all non-hidden order items, including fulfilled
orders. Order 10242 remains excluded. It lists positive Pans selections only;
without-pans / No / None / zero variants are not partner dispatch tasks.
Quantity is the product quantity; the Pans selection itself retains Wix's wording
(for example a set of six pans). Opening or refreshing never invokes integrations.

Each item can be marked Ordered and sent, or corrected back to To arrange.
These are internal confirmations, not partner orders, bookings or Wix fulfilments.
Status is stored against the selection and quantity, with authenticated actor,
timestamp and append-only event history. A changed selection or quantity displays
To arrange again. The RPC compares the complete item snapshot before writing and
repeated identical requests do not duplicate the history. No order status changes.

Apply only `20260907000400_partner_pans_report.sql` before publishing the UI.
It adds the RLS-protected tracking table and one authenticated RPC, with no backfill
or order writes. Email AI remains unrelated and pending. Do not use db push.
Shared-code changes deploy Wix / Delivery Review and Fast Courier functions via
existing workflows; no quote, booking or customer notification is run by deployment.

Old saved quote snapshots are kept as historical records. Editable packaging
discards old `option:pans` assignments when saved; measurements are never changed
automatically. A box containing only pans must be reviewed/removed explicitly.
