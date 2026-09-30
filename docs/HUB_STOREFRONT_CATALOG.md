# Hub → storefront catalogue

Owner decision, 28 September 2026: the selected `white-corner-design` storefront
must read product information only from Hub. This supersedes the earlier
frontend → Wix catalogue sequence; checkout and real commerce remain separate.

## Audit before this release

The production read-only audit found 190 operational products: 178 linked Wix
snapshots and 12 local-only products. The saved Wix snapshots contained 1,203
variants, 104 visible products and 74 hidden products. All 178 had descriptions,
slugs and media. The full import checkpoint was complete; snapshots were of mixed
ages. Images/videos were still Wix URLs, categories were only collection IDs.

## Implemented sequence

1. Refresh all Wix V1 products through the existing resumable importer. Preserve
   Hub UUIDs, local operational fields, drawings, costing and order history.
2. Read all Wix collections into Hub. Validate pagination before saving them.
3. Copy product images, videos and the prototype's existing editorial images into
   Hub Storage. Save the source URL, destination, size, MIME and SHA-256 in Hub.
   Resume by already confirmed file records. Hidden product media stays private.
4. Build the separate allowlisted `wc_storefront_catalog` document. Include visible
   products, category membership, descriptions, options, exact variant prices,
   stock semantics, SKU, weight, custom fields, SEO text and Hub media URLs.
   Fail on incomplete photos, unknown categories, duplicate IDs/slugs or bad prices.
   The owner approved deferring inaccessible videos; their reasons are recorded in
   the private `wc_catalog_media_issues` table and never replaced with Wix URLs.
5. Atomically replace the `live` document only after the entire run succeeds.
   Existing published data stays readable during import and on failure.
6. The Next.js/Vinext storefront fetches this document server-side from Hub.
   It has no Wix catalogue client and no prototype-product fallback. Prices are
   resolved from the selected Hub variant. Checkout remains explicitly a demo.

## Operations

The integration restored on 30 September uses **Hub storefront catalogue** for
local checks on pull requests/main and a manually dispatched read-only audit.
Push/merge does not obtain production credentials. Manual dispatch returns only
SQL aggregate counts, dates and migration-source match booleans; it never exports
source product, collection or media records to the runner. It does not import,
publish, deploy or apply migrations. The previous branch's `mode=sync` workflow
is superseded; do not use it to maintain this integrated version.

The three original migration files are restored unchanged. The audit compares
their normalized contents with the registered production sources. The complete
migration rehearsal includes the later active-member hardening, using the real
catalogue tables instead of an artificial public-table fixture.

Maintenance scripts remain available for a separately authorized production run:

- `node .github/scripts/hub-storefront-release.mjs --sync --restart` starts a new
  full Wix scan, copies media and publishes after validation.
- `node .github/scripts/hub-storefront-release.mjs --sync --resume` resumes saved
  pages/media. A completed run does **not** re-read all Wix products. It must not
  be described as a fresh scan. Bare `--sync` now fails before creating a job token.
- `--presentation` only rebuilds presentation from saved Hub data.

The existing deployed importer uses its previously reviewed machine-token
authentication. This integration deliberately leaves global Supabase gateway
configuration and all deployment workflows unchanged. Do not perform an
unqualified redeployment of this function: first verify its deployed gateway
setting and the security review below. No new authentication exception is enabled.

Security and the separately approved short-lived machine token are documented in
`STOREFRONT_SECURITY_REVIEW.md`. The Site's owner-private audience is preserved.
No courier booking, emails, Wix writes, orders, payments or production UI deployment
are part of this release.

## Freshness boundary verified in code

Order sync refreshes five existing product snapshots per batch. It neither discovers
all new products nor updates collections, copies new media or publishes
`wc_storefront_catalog`. The storefront reads the published projection server-side
with `cache: 'no-store'`; a fresh HTTP read cannot repair an old projection.

The audit detects visibility differences, missing/hidden variant identities and
variant price/stock or simple-product price changes between saved Hub data and the
published projection. It also reports the last completed full scan, publication
time and reads after publication. A newer read time alone does not establish a
content change. An incomplete run makes missing-product counts provisional.
Zero reported differences does not prove current Wix freshness or complete
agreement of text, media, categories and all commercial fields.

No automatic publication schedule is enabled by this integration. Before enabling
one, review collection removal, revocation of formerly public media when products
become hidden, failure recovery and protection from concurrent publication. The
importer retains absent records; absence or an access failure is not deletion.

## Production verification on 30 September

Aggregate-only read-only audit [36699925518](https://github.com/stasabakumov-sys/whitecorner-orders/actions/runs/36699925518)
passed at 10:03 UTC (20:03 Brisbane). All three restored migration sources exactly
match their registered production versions. There are 179 source/current-run
snapshots, 103 visible and published products, 12 local-only entries, 1,114 confirmed
media records and 12 deferred media records. The audited visibility, variant
identity, price and stock difference counters are all zero.

The last full scan completed on 28 September at 08:15 UTC; the publication is from
08:30 UTC that day. Only one snapshot was read after publication; the latest read
was 29 September at 12:03 UTC. No snapshots were read in the six hours preceding
this audit. `cron.job` is absent in production. External schedulers were not
inspected. These facts do not establish current Wix freshness; automatic updating
must be configured and verified separately before relying on it.

## Current storefront copy

On 30 September the owner published a copy in the current account:
https://white-corner-prototype.stas-abakumov.chatgpt.site/category/cart (version 2).
It keeps reading Hub, remains owner-private, and still has demo checkout. The
version 4 URL below is the historical publication in the previous account.

## Explicit gaps

Production import completed on 28 September 2026 (Actions run 36397596149):
179 source products and 18 collections, 103 visible products, 76 hidden products,
939 public variants. Storage contains 1,114 confirmed media files. All photos were
copied; 12 videos remain deferred (11 Wix HTTP 403 responses, one over 50 MB).
Two visible products are affected by deferred video. Their photo galleries are complete.

The selected Site is deployed as **version 4**, source
`272bab1a6b3ecb98697df4f74ddb8d9e9e2729fc`, at
https://white-corner-design.abakumovasvetlana.chatgpt.site/category/event-backdrops.
Production HTTP checks returned 200 for category, product and management pages;
all three contained Hub catalogue/media and no catalogue-error state.
Local browser checks covered desktop/mobile layouts, Hub photos, category count,
search, option selection and the exact variant price in the demo cart.
TypeScript, the production build and four selection tests passed. Hub CI run
36398989977 passed Deno checking, six projection tests and migration/RLS tests.
No Angular files changed, so Angular tests/build were not run for this release.

The 12 local-only registry entries have no linked commercial Wix snapshot. They
must be reviewed before publication: titles alone are not a safe identity match,
and prices/media must not be invented. Hidden Wix products remain hidden.
These are primarily custom work and test entries, not a missing Wix catalogue
page. Preserve their operational IDs; decide commercial publication individually.
Location-specific inventory and checkout calculations are not implied by the
V1 product availability snapshot. Missing merchant SKU/SEO values remain missing.
