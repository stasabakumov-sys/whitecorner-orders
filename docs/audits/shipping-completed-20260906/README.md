# Shipping completed: apply-only preparation

Production was inspected read-only on 2026-09-06: eleven expected migration versions (through shipping sync), seven shipping-sync columns, validated PK/FK/status constraints, RLS and authenticated SELECT policy; three original function definitions and expected execute ACLs. The sync table has zero rows and no active claims. Email AI tables/history are absent. No order rows were read.

The original PR had a rollout incompatibility: terminal claims returned completed, but deployed code expects synced. The corrected migration preserves the synced RPC response and legacy null-ID rows, adds contractVersion and wixFulfillmentId, and still stores new results as completed. New code refuses to treat legacy null-ID completion as verified. Old synced completion calls remain accepted. No existing rows are rewritten.

Migration: `20260906000100_shipping_fulfillment_completed.sql`

SHA-256: `BD8F393F09715BF8C99035FE7B3F0C2FA9DC1BE730DE023BF82AF42BA3857534`

Apply-only: `apply-completed-only.sql`

SHA-256: `89350ED99E3FF9731B69CE2A81D10FC0B31DA9167DAEC20580C3491F293648C4`

The wrapper executes only the reviewed migration and registers only 20260906000100. It locks history and shipping sync, checks the exact eleven-version baseline, empty sync state, function-definition hashes, status constraint, RLS, permission boundaries and absent Email AI. Any mismatch raises an exception. DDL and history insert commit together. Locks have a 5-second timeout; statements have a 30-second timeout. No shipping function is invoked by the wrapper.

Local rehearsal: `node docs/audits/shipping-completed-20260906/rehearse.mjs <absolute-path-to-pglite/dist/index.js>`. It uses synthetic data and verifies the actual wrapper with matching catalog guards, rollback after an injected failure, history mismatch/replay rejection, unchanged business tables and old synced/no-ID RPC behavior. The normal shipping SQL regression covers new completed/ID/atomic note behavior.

After separate approval: apply this exact file, read-only verify DB, merge PR #14, wait for Wix Function and Hub deployments, verify deployed versions, then separately authorized Retry API test for #10806. No other orders are test targets.

Merge triggers: Deploy Wix orders sync / deploy; Build Angular2 preview / build (includes publication commit on main); GitHub Pages publication via repository Pages configuration. Wix and Hub workflows are independent. The package-contents and Fast Courier push filters do not match this PR. Their PR checks do run with production jobs skipped. Never use db push or include-all for this file; Email AI remains pending.

No SQL application, merge, deployment or production API test was performed during preparation.
