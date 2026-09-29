# White Corner Hub: security audit, 29 September 2026

Scope: repository state `origin/main` at `bc3231a`, fetched again before inspection, including the Packing membership rollout and private product drafts. Changes are in local branch `codex/security-audit-20260929`, in `.security-audit/`. The original checkout was 45 commits behind and contained unrelated uncommitted work; it was not reset or merged into.

The owner explicitly confirmed during this audit: **all currently active Hub members must retain access**. The migrations preserve every existing membership row, role and active flag. They neither promote Auth users nor create members. `docs/PACKING_LASER.md` documents the earlier two-manager rollout and manager-issued worker invitations. Production membership records were not downloaded. An active manager is required as a migration prerequisite; an empty/uninitialized roster fails closed.

## Findings and corrections

| Area | Current finding | Correction |
|---|---|---|
| Orders, customers, shipments, email, costing, production | Many permissive policies use `true` or only `auth.uid()`. A valid unrelated Auth account can access data. | Restrictive active-membership policy on private Hub tables and the six Finance tables. The separate public storefront projection retains its published-read contract. Existing row ownership/manager restrictions remain in force. Revoke PUBLIC/anon private-table access and authenticated TRUNCATE/REFERENCES/TRIGGER. |
| Finance | `transactions`, `imports`, `business_categories`, `classification_rules`, `personal_rules`, `personal_rule_transactions` do not have the `wc_` prefix. Their original schema/policies are absent from this repository. | Include these known tables explicitly. Local tests use synthetic schema/policies; live policy drift remains a deployment preflight item. |
| Views | `wc_shipping_product_summary` uses owner privileges by default. | Set Hub views to `security_invoker=true` so table RLS applies to the caller. |
| Membership | Auth insert/update trigger automatically enrolls all Auth users as active workers. | Trigger only synchronizes email for an existing member. The already manager-protected `hub-users` invitation explicitly creates a worker; conflict handling preserves existing roles and inactive status. No signup-metadata trust. |
| RPC / SECURITY DEFINER | Auth-only RPC checks and default PUBLIC EXECUTE on internal helpers bypass the new table restrictions. | Revoke PUBLIC/anon/authenticated EXECUTE on the existing `wc_*` function surface, re-grant only the explicit application RPC allowlist, add membership checks inside those functions, and preserve existing service-only grants. Harden definer search paths and revoke schema CREATE. |
| Fast Courier | Authentication and delivery-review enforcement for booking depend on `DELIVERY_REVIEW_ENABLED`. Other actions have no member check. Packing, form and price confirmation were mainly client checks. | Session/member check on every action; manager required for save-details/booking; unconditional delivery gate; server validation of approved complete packing, server-saved provider quote, date, required form/consents, goods value, insurance and separately confirmed total. |
| Fast Courier replay | The browser coordinates booking; directly replayed requests can reach the paid endpoint. | Private quote/preparation records and atomic service-only preparation/claim RPCs. Persist attempt before paid POST. Reject concurrent/replayed or uncertain attempts. Package edits through PostgREST also invalidate approval/quotes; attempted bookings block package edits. |
| Wix | `markFulfilled` lacks a user/role check. `fulfillShipping` checks authentication but not manager membership. Other reads/imports lack membership checks. | Central action allowlist and fresh active membership. Both external fulfillment actions require manager. Exact runtime service credential is accepted only for default sync, contact sync and history import; address-review has its own explicit job path. Gateway JWT verification remains enabled. |
| Gmail API / Email AI | User session exists but membership is not checked. | Require active membership before mailbox reads, token refresh, Gmail operations, private order reads or AI provider calls. Sanitize Gmail/OAuth errors to avoid returning/logging provider payloads. |
| Gmail OAuth | Signed, time-limited state and mailbox email matching already exist; manager membership and callback revocation/replay checks do not. | Manager required to initiate and complete connection. One-use server nonce bound to the verified user's Auth session, expiry and active manager membership. Callback checks Auth session existence/not-after. HMAC verification uses WebCrypto. No access/refresh token is added to state or handshake storage. |
| Storage | Drawing/CNC/RD policies allow authenticated outsiders. Product drafts are already manager-only. Bucket definitions are private, but `ON CONFLICT DO NOTHING` does not repair an accidentally public existing bucket. | Force all five internal buckets private; restrictive active-member and anon-deny policies. Existing per-bucket ownership/manager restrictions stay. Courier API returns stored private paths instead of raw provider document URLs. |

## Findings not confirmed

- `wc_mailboxes` already has no authenticated RLS policy; refresh tokens are server-only. This migration also explicitly revokes client table grants.
- Product drafts and draft media already require `wc_is_hub_manager()`. Packing administration, RD editing and invitations already have active-manager checks. They were not treated as unprotected just because older findings mentioned broader access.
- Gmail OAuth state was already signed and limited to 15 minutes. The issue was missing membership/session-revocation/replay enforcement, not an unsigned state.
- Shipping/Wix claim-and-record RPCs were already service-role-only. Those grants and fulfillment consistency logic are preserved.
- No confirmed secret exposure was found. A redacting scan examined **2,816 reachable Git blobs across all local refs**, including fetched main and committed publication bundles, and **301 current files** in Angular sources/public/production output, workflows and Edge Functions. Patterns included service-role JWT payloads, private keys, Google/OpenAI/GitHub/Stripe/Supabase token formats, Google refresh tokens and literal assignments to credential fields. The scan printed types/paths only; there were no findings. Runtime-secret references and public Supabase anon configuration are not private secrets. Pattern scanning cannot prove absence of every possible opaque secret.

## Changed files

New migrations, in order:

1. `supabase/migrations/20260929000100_hub_access_hardening.sql`: roster-preserving membership, all current Hub/Finance RLS, view invoker rights, RPC EXECUTE and definer guards, private Storage.
2. `supabase/migrations/20260929000200_server_action_state.sql`: private OAuth handshakes, provider quotes and booking preparation/attempt records; service-only RPCs; packing invalidation trigger.

No applied migrations or `orders-schema.sql` snapshot were rewritten.

Server changes: `_shared/hub-auth.ts`, `_shared/courier-booking-validation.ts`, and the `index.ts` entry points of `address-review-sync`, `delivery-cost-review`, `email-ai`, `fast-courier-api`, `gmail-api`, `gmail-oauth`, `hub-users`, `wix-orders-sync`. `supabase/config.toml` explicitly retains JWT verification on previously implicit protected functions. Gmail OAuth remains the sole configured public callback exception.

Client changes: `fast-courier.service.ts`, `fulfilment.service.ts`, `fulfilment.component.ts` forward shipment identity and the separately confirmed total; the existing confirmation dialog and GST/AUD/insurance rules are retained. Corresponding Angular specs are updated.

Tests: `_shared/hub-security.test.cjs`, `.github/scripts/hub-security.test.mjs`, `.github/scripts/courier-fixture.cjs`, existing delivery-review worker tests and Email AI handler tests. Gmail API and Email AI deployment workflow path filters now include their shared authorization dependency. No deployment workflow was run.

## Validation

- Angular: `npm test -- --watch=false`: **67 files / 389 tests passed**. Includes mocked booking confirmation, displayed errors, Pickup rollback and shipping/Wix consistency tests.
- Angular: `npm run build`: **passed**. Existing bundle-size/CommonJS warnings remain. Initial sandboxed run failed on filesystem ACLs; local rerun outside that sandbox succeeded.
- Node Edge suites: **121 tests passed**, including five caller states, all eight function entry points, Gmail list/send provider boundaries, OAuth signed-state/revocation/replay, Wix cron success and fulfillment denial through the job exception, mandatory booking enforcement with the environment flag absent/false/true, signed document TTL, complete booking, replay, uncertain POST, quote/packing/form/insurance failures and existing Gmail/Wix/review regressions. External calls are mocked.
- Deno 2.9.6: `deno check` passed for all eight Edge entry points and their imports. Only public dependencies were downloaded; no production credentials were loaded.
- PGlite 0.3.14: reconstructed the repository schema and sequential migrations, then executed the two new migrations and role tests. **60 tables/views, 105 functions, 43 authenticated RPCs** inspected. Checks include preserved roster, signup/metadata not granting membership, anon grants, inactive/outsider denials, worker/manager allowance, definer RPC denials, internal RPC EXECUTE denial, Storage privacy, OAuth logout/revocation/replay, serialized booking preparation/claim and package invalidation.
- The local SQL harness stubs Supabase Auth/Storage base schema and six legacy Finance tables. It omits the `pgcrypto` extension statement because PGlite already supplies `gen_random_uuid()`. Two historical data-only migrations requiring production-specific records (`20260918000300`, `20260923000700`) are explicitly skipped. No production SQL connection was used.
- Browser: the actual Angular booking dialog was opened locally with synthetic data and a mocked service. Verified disabled confirmation before consent, the exact 3,000-cent amount passed after confirmation, and a visible server refusal that retains the form. All external browser requests were blocked. Screenshot saved outside the repository as `security-booking-review.png`; temporary preview source/build removed.
- Both changed deployment workflow YAML files parsed successfully. Full diff reviewed and `git diff --check` passed. No historical publication artifacts were edited.

Run the SQL test with an installed PGlite module path:

```text
node .github/scripts/hub-security.test.mjs /path/to/@electric-sql/pglite/dist/index.js
node --test supabase/functions/_shared/hub-security.test.cjs supabase/functions/email-ai/handler.test.cjs supabase/functions/wix-orders-sync/*.test.cjs .github/scripts/delivery-review-worker.test.cjs
```

## Owner actions before a separately authorized release

1. Preserve the confirmed current active roster. Inspect the live schema, policies, grants, Auth sessions schema and migration ledger for drift from this repository, especially legacy Finance definitions and any extra non-`wc_*` RPCs/views. Local tests do not certify the live deployment.
2. Rehearse on staging with the same Supabase/PostgreSQL versions. Coordinate these migrations, all changed Edge Functions (including Gmail OAuth and address-review, which have no dedicated automatic deployment workflow here), and the Angular build. Apply both SQL migrations before the new Edge code. Reload old browser clients after the API contract update; missing shipment/confirmed-total fields fail closed.
3. Existing unbooked courier quotes have no server-owned quote record. Reapprove packing/request a fresh quote before booking. Do not backfill trusted quotes from browser-writable historical JSON. Existing booked shipments/status/document reads remain supported. A prepared or attempted request with an uncertain result needs reconciliation; do not delete attempt records merely to retry a charge.
4. Restart any OAuth connection begun before this update. Existing connected mailbox refresh tokens are preserved. If invitation succeeds but membership persistence fails, repair that specific worker's membership through an authorized administrative process; do not rerun a blanket Auth-user enrollment.
5. No key rotation is requested on the evidence found: no exposed private key/token was confirmed. No keys or production secrets were changed.

Internal app links use existing short TTLs: drawings/CNC/RD 60 seconds, courier documents 300 seconds, draft media previews 600 seconds. Links already issued are bearer links until expiry. Storage RLS restricts issuance; it does not impose a global maximum TTL on an authenticated caller's direct Storage API request. The app's issuance paths use the stated TTLs.

At completion of the initial audit, no production deployment or migration had been performed. The owner subsequently authorized production release. No real booking, email send, Wix mutation, Stripe call, Google Maps call, account-setting change or secret rotation is part of release verification.

Reference checks: [PostgreSQL restrictive policies](https://www.postgresql.org/docs/17/sql-createpolicy.html), [invoker views](https://www.postgresql.org/docs/17/sql-createview.html), [Supabase private Storage](https://supabase.com/docs/guides/storage/buckets/fundamentals), [signed URL expiry](https://supabase.com/docs/reference/javascript/file-buckets-createsignedurl).

## Authorized production release preflight

The owner subsequently requested production deployment. Read-only Management API checks, executed with the existing GitHub Actions secret, confirmed PostgreSQL 17.6, two active managers, no inactive members, and the required Auth session columns. No membership identities or token values were printed.

Production contains three catalog migrations from outside this repository (`20260928000100` through `20260928000300`). Their schema and policies were inspected: `wc_storefront_catalog` is a separate publication table with an existing anon/authenticated SELECT policy limited to `id='live'`. The still-unapplied hardening migration was adjusted to preserve that contract. Internal media/import tables remain in the private Hub sweep. The public `catalog-media` bucket is published catalog media; the five internal document/draft buckets stay private. The extra `rls_auto_enable` definer is an event-trigger function, not a callable business RPC.

The release wrapper applies and registers only the two reviewed security migrations in one transaction, compares their stored source on retries, asserts unchanged membership and checks grants/RLS before commit. Local rehearsal verified rollback of the first migration when the second fails, successful application, safe repeat execution, and preservation of public catalog reads without public writes. Deployment credentials remain in GitHub Actions secrets.
