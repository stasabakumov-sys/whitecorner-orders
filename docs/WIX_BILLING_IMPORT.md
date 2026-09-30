# Wix invoices and receipts → Hub

Deployed on 30 September 2026 following the owner's explicit production approval.
This is customer billing, not Wix subscription/vendor bills. The live section is
[Invoices & receipts](https://stasabakumov-sys.github.io/whitecorner-orders/angular2/#/billing-documents).
Deployment does not itself establish that all Wix documents have been migrated.

## Source and scope

- Wix remains the source of imported documents, including original monetary
  strings, currency, tax breakdowns, line items, payment records and business /
  customer details. Hub does not recalculate GST or substitute current catalogue
  data. Importing a receipt does not book income again in Finance.
- Query invoices and receipts independently across all statuses, including drafts
  and archived records, without restricting them to the operational orders list.
  Each scan fixes a creation-time cutoff and follows every returned cursor.
  A fresh scan includes documents created since the preceding scan.
- The external identity is `(site_id, kind, wix_id)`. Internal UUIDs survive
  refresh. Link only explicit Wix eCommerce order IDs to existing Hub orders;
  retain standalone documents and Wix Payments references without guessing a
  match by customer, invoice number or amount.
- Preserve source revisions and prior PDFs. A missing record in a subsequent
  scan never deletes anything. PDF download URLs are removed from snapshots;
  obtain fresh URLs server-side when copying. All other source values remain.

## API constraints verified against official documentation

- [Query Invoices](https://dev.wix.com/docs/api-reference/business-management/get-paid/invoices/invoices/query-invoices):
  `/invoices/v4/invoices/query`, `Manage Invoices` permission. This API is in
  Developer Preview. [Wix's introduction](https://dev.wix.com/docs/api-reference/business-management/get-paid/invoices/invoices/introduction)
  says sites not yet migrated by Wix receive HTTP 428. This must be checked on
  the actual White Corner site; a mock cannot establish availability or completeness.
- [Query Receipts](https://dev.wix.com/docs/api-reference/business-management/get-paid/receipts/receipts/query-receipts):
  `/receipts/v1/receipts/query`, `Manage Receipts` permission. Both adapters use
  `query.cursorPaging` and validate `pagingMetadata.count`, `hasNext`, and
  `cursors.next`. Permission failures are explicit, never an empty successful scan.
- Get existing documents by ID and copy their AVAILABLE `documentInfo.downloadUrl`
  (invoice) or `document.downloadUrl` (receipt). There are no calls to create,
  publish, send, void, pay, mark paid, generate receipts or generate invoice PDFs.
  [Generate PDF Document](https://dev.wix.com/docs/api-reference/business-management/get-paid/invoices/invoices/generate-pdf-document)
  mutates the invoice and is outside this read-only Wix adapter.
- If Wix cannot provide a document/PDF, migration remains incomplete. Use Wix's
  [invoice export](https://support.wix.com/en/article/wix-invoices-managing-your-invoices)
  or [receipt export](https://support.wix.com/en/article/wix-receipts-issuing-receipts)
  to obtain the originals. **Uploading dashboard exports is not implemented in
  this change**; review their real format and original IDs before building that
  fallback. Do not reconstruct accounting originals from Hub order totals.

## Storage and security

Migration: `20260930000500_billing_document_import.sql`. It adds document records,
immutable source snapshots with versioned PDF metadata, import runs and run items.
`wc_billing_document_list` joins the current snapshot and explicit order link.
No existing order, Finance row or historical snapshot is rewritten.

RLS permits only active Hub members to read. Clients cannot write the tables or
call the service-only import RPCs. The private `billing-documents` bucket has a
restrictive policy against direct client access even if a broad legacy storage
policy exists. Files are opened through a session-verified Edge action returning
a 60-second signed URL. There is no public catalogue projection of this data.

`wix-billing-import` keeps `verify_jwt = true` and calls `requireHubSession` on
every action. Managers alone can check Wix access, import and copy PDFs; active
members can view saved records. There is no machine-token exception. Runtime
secrets: the existing `WIX_API_KEY`, `WIX_SITE_ID`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`; never put these in frontend code or fixtures.

PDF requests send no Wix API credentials to download hosts. Only HTTPS on
`static.wixstatic.com`, `files.wix.com`, `www.wixapis.com`, or `manage.wix.com`
is accepted, with no redirects. Production Wix Get Receipt returned the official
`manage.wix.com` host on 30 September 2026; only that exact host was added.
If different, review an actual Wix-provided link and approve an exact trusted
host; do not broaden this to arbitrary URLs or disable redirect/SSRF checks.
PDFs must have a PDF signature and be at most 20 MiB. Oversize, unavailable,
changed or untrusted documents retain a visible, persisted error.

## Rollout and operation

1. Approve applying the single migration and deploying the new protected Edge
   Function. Use the established deployment credentials. Do not change existing
   functions' JWT settings. The base `orders-schema.sql` is not a full schema
   snapshot and is unchanged.
2. Deploy the Angular source through the owner's chosen existing publication
   target. Do not guess a new hosting flow or edit historical previews.
3. As a Hub manager, open **Invoices & receipts → Check Wix access**. This makes
   only read requests and writes no documents. Verify invoices and receipts
   independently. Additional Wix permissions, if needed, require separate review.
4. Select **Import / resume all**. Each page saves atomically with its cursor.
   Reloading/pausing preserves progress. **Fresh invoice/receipt scan** deliberately
   starts a new run; it does not delete the preceding run or saved documents.
5. Run **Copy all invoice PDFs** and **Copy all receipt PDFs**. Existing saved PDFs
   are skipped; failed files do not prevent later files from being attempted.
   A changed Wix source requires a fresh data scan before copying its current PDF.
6. Compare the final run's distinct document counts and numbers with the Wix
   dashboard/export at the same cutoff, and review totals by type and currency.
   Check drafts, archived invoices, standalone invoices, partial payments and
   historical receipts. API pagination completion alone does not prove legacy
   dashboard coverage. Check `saved_count` against saved run items and ensure PDF
   pending counts are zero or every unavailable original is explicitly accounted
   for. Do not call the overall migration complete merely because a scan ended.

`wix-billing-import-check.yml` only validates code. The explicitly dispatched
`wix-billing-release.yml` deploy mode applies only the named billing migration
(or verifies its exact registered source), deploys the protected function and
checks aggregate counts/security. Verify mode is read-only. Initial release
[36718141186](https://github.com/stasabakumov-sys/whitecorner-orders/actions/runs/36718141186)
passed; Angular2 publication and Pages deployment also completed. Hosted checks
confirmed RLS, private storage, server-only writes and RPCs, JWT verification,
and HTTP 401 for unauthenticated requests.
Existing deployment workflows watch `supabase/config.toml`, so review their
automatic effects before any future push to `main`.

## Local verification

- `node --test supabase/functions/wix-billing-import/billing.test.cjs`
- `node supabase/functions/wix-billing-import/check.cjs` — TypeScript semantic
  check of adapter/handler; the Edge entrypoint/auth paths run in mocked tests.
  Deno itself is not installed locally; `deno check` with Deno 2.9.6 passed in
  the production release workflow.
- `migration.test.cjs` uses disposable PGlite 0.5.8 with synthetic auth/storage
  fixtures. Set `BILLING_PGLITE_PATH` to that package's absolute installation path.
  It verifies SQL execution, rollback, resume, duplicate rejection, stale-run
  rejection, immutable versions, preservation of local fields and RLS/storage
  denial. It does not replace a hosted Supabase integration test.
- From `angular-app`: `npm test -- --watch=false` and `npm run build`.
- UI review uses the actual billing component/service with synthetic data and
  mocked Edge responses; no live session or customer data is included.
