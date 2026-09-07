# Delivery decision before production

Active shipping orders must have a current `within_target`, `approved_exception`
or `approved_without_quote` decision before their production status can change.
Pickup and the existing fixed Ready exemption snapshot retain their exemption.
Becoming Ready now does not create a new exemption. Existing orders are not
automatically approved or moved by this release.

For a first manufacture, Delivery Cost Review offers **Approve without quote**.
A reason and explicit risk acknowledgement are required in the UI. The server
uses the authenticated user's ID, records the reason/time/decision in approval
history and leaves the original estimate unattempted. The worker cannot claim
the approved state, so approving never causes a quote or booking.

The approval is tied to the composition, quantities, destination, goods value,
currency and invoice delivery amount. Relevant changes require a new decision.
Users may still enter actual packaging later. Explicitly saving that packaging
resumes the original one-time estimate; if it exceeds the limit it requires a
priced exception. An unquoted approval does not become a priced exception.

Fulfilment accepts a current unquoted approval as the financial exception, but
still requires actual package measurements/contents/approval, a selected quote,
sufficient insurance and booking consent. These physical booking checks remain.

## Server enforcement

Production changes go through authenticated `delivery-cost-review` actions
`production-check` and `production-status`. The latter recomputes the decision
and invokes a service-role-only RPC. The RPC locks and compares order version,
items, active No-effect rules and review version, verifies unit ownership and
atomically changes the unit status and inserts its history. A stale request or
failed history insert rolls back the transition.

Authenticated direct INSERT/DELETE/table-wide UPDATE rights on production units
are revoked; column UPDATE rights remain for comment and priority. Only the
server can set a status or create units. Wix unit import remains server-owned.
This deliberately prevents bypass through a direct REST status write.

## Rollout (requires separate production approval)

Migration: `20260907000300_delivery_production_gate.sql`. It changes the review
state constraint, adds three protected RPCs, extends explicit packaging save to
the new state, and restricts direct production-unit writes. It updates no orders
and invokes no external services. Email AI is unrelated and must remain pending.

The migration is not compatible with old clients' direct production status
writes: those writes will fail safely after application. Coordinate a short
rollout window and ask users to reload Hub after publishing the new frontend.
Do not apply all pending migrations with db push. Review migration history and
prepare an apply-only transaction for this exact file before production changes.

After approved migration application, merge/deploy the matching code. The
existing workflows deploy `wix-orders-sync` and `delivery-cost-review`, deploy
`fast-courier-api` for shared gate changes, and publish Angular. They do not
automatically apply this migration. Confirm the source classifiers and checks
on the final PR before merging. Do not test with a real booking or quote.

## Verification

- Angular component/service tests: rejected transitions leave local state intact,
  pending/blocked controls cannot submit, repeated clicks are suppressed, approval
  requires a reason and acknowledgement.
- Worker/handler mocks: no packaging/failed/over-budget states block production;
  approvals bind inputs and invoice; auth/actor guards; no courier calls.
- `delivery-production-migration.test.mjs`: isolated PGlite, no production sockets;
  migration leaves orders unchanged, REST-equivalent write permissions, approval
  audit/idempotency, stale snapshot and wrong-unit rejection, history rollback,
  and explicit packaging/one-shot estimate behaviour.
- Browser: synthetic order, blocked production -> deep link -> unquoted approval
  -> enabled production; all external requests intercepted/blocked.
