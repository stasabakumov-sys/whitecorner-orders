# Shop Floor Tracker — agreed pilot

One authenticated owner operates the pilot. Existing Hub authentication remains required; no public data or Wix writes. Later roles are outside this pilot.

* One physical `wc_production_units` per board card; existing IDs are preserved.
* CNC and Painting track the whole unit. Assembly and Sanding track unique named parts; Sides is one part.
* A saved parts snapshot is required before CNC. Estimated minutes are optional and never gate production.
* Painting: First primer → First sanding → Second primer → Second sanding → Finish coat. Repaint is optional, outside the sequence. Finish Painting is explicit.
* One active interval per worker. Pause is global, unrelated to a unit. Starting/resuming any task ends that pause. Waiting units do not accumulate time.
* Shift start/end bound all intervals. End shift stops time without completing the task. Forgotten ends are editable on a phone, with an audit trail.
* Other: Cleaning, Design, Administration, Development, Rest. Rest is separate from productive work and pauses.
* Analytics: worker/day/week/month, time per stage, separate pause/rest totals. No monetary costing.
* RAW skips Painting, retains Packing. Finish/colour are distinct; unknown finish requires explicit choice.

Implementation uses SQL RPC transactions and RLS, independent production templates and unit snapshots. Existing reviewed production-status endpoint continues to own board transitions and delivery approval. Database guards apply to all status writers. New migrations require a separately authorised deployment; the baseline orders-schema.sql is not a current schema snapshot.

## Pilot operation

Open **Products → Product card → Parts & estimated minutes** and save a named template (including Sides as one part). Assign every row to the main Product or a known Add-on. Leave unavailable estimated minutes blank. In Shop Floor select the product-specific template and RAW/Painted finish, then move it to CNC. The saved unit snapshot contains only parts for components present in that order. Existing started products retain their earlier snapshot.

Start shift, select a product/activity, then start work. Pause is always global. Finish CNC and Finish Painting are explicit. Finishing all Assembly/Sanding parts makes the stage eligible for the next board transition; a failed delivery approval leaves work saved and shows a retry action. Existing delivery approval is still required: missing estimated minutes add no restriction.

End shift closes its active interval. A forgotten overnight shift shows a correction prompt at next entry. Edit the shift end to close the last open interval too. Existing closed intervals must be corrected first if they extend beyond the proposed shift end. Corrections retain audit entries. Report weeks start Monday; all calendar filters use Australia/Brisbane and split intervals at period boundaries. CSV contains BOM and neutralizes formula-leading text.

## Storage and boundaries

SQL tables: templates, unit snapshots, shifts, intervals, correction audit and idempotent command receipts. All writes use `wc_shop_command`; RLS restricts time records to the signed-in worker. This pilot has no delegated roles. Template and unit configuration are shared among authenticated Hub accounts, consistent with the single-owner pilot.

IndexedDB stores server data and pending commands per authenticated user. Loaded-page timer actions can continue during network loss; the UI marks them pending rather than reporting server success. Replay retains command UUIDs and checks the previously active timer to reject conflicting device changes. Board transitions and edits require synchronization. Rejected configuration inputs stay in the form; uncertain writes are retained for retry.

The phone follow-up adds an installable PWA, cached application shell and a minimal per-user product list (IDs, names, codes, stages). Sign in and load products online first. Offline startup requires a usable existing session and browser storage; expired sessions still require an online sign-in. API/customer/email responses are not cached by the service worker. Queued actions stay visibly pending until confirmed. Automatic realtime board subscriptions and app-store packaging are not included. See [phone and test-order release notes](SHOP_FLOOR_PHONE.md).

## Validation / deployment

* Angular production build and unit suite; build still reports initial bundle, Email CSS budget and third-party CommonJS warnings.
* `.github/scripts/shop-floor.test.mjs` exercises this migration on an isolated PGlite instance with synthetic units/users, including RLS, idempotency, RAW route, CNC gate, global pause, painting order and correction of a forgotten shift. It does not apply production migrations.
* Existing delivery-review worker tests transpile the shared Edge Function module and exercise the added safe-error path (15 tests passed). Full Deno checking exists in the current CI workflow but was not run locally; Deno is not on the local command path.
* Mobile (390px) visual checks use a temporary synthetic Angular harness, without credentials or integration calls. The harness is removed after review.
* Production rollout still needs explicit authorization: apply `20260912000100_shop_floor_tracker.sql` after the existing Sanding schema migration, deploy the shared-function consumer `delivery-cost-review`, and publish Angular using the agreed deployment target. No workflow or production environment was changed here.
