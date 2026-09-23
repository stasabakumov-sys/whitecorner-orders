# Packing laser jobs

The laser cuts packaging boxes. Its `.rd` jobs are separate from Product CNC `.crv3d` files.

## Hub workflow

1. A manager opens **Products → product card → Packing**. Each saved physical box can have multiple `.rd` files. A positive **Copies** count belongs to each file and tells the operator how many cutouts to make. The laptop sends each distinct file once; it does not start the laser or automatically repeat cutting.
2. **Packing → Manage Packing** lists physical product units by production stage, from Packing to New. The manager selects the matching saved packaging variant and an employee. The server rejects assignment unless every box in that profile has at least one `.rd` file. Each task saves a snapshot of filenames, storage paths and copy counts, so later profile edits cannot rewrite assigned work.
3. **Packing → Packing work** shows the employee's assigned files and copy counts on phone or laptop. A manager can also see all tasks. **Load to laser** queues a transfer only while a station heartbeat is fresh. The laptop confirms acknowledged transfer; the operator checks the controller file list and starts cutting at the machine panel. Completion in this section records packaging work and does not change the product's Production Board stage.

## Accounts

The first migration requires exactly two pre-existing Auth users and gives both manager access, as agreed. New invitations create worker accounts. Only managers may invite employees, edit `.rd` files and assign tasks. `hub-users` uses the server-side service role key; no admin credential enters the Angular bundle.

Configure `HUB_INVITE_REDIRECT_URL` as the deployed Hub's HTTPS root with `?setup=1`. Allow that exact URL in Supabase Auth redirect settings. If Supabase falls back to its Site URL, the Hub also recognizes the `type=invite` fragment and opens the password setup form, provided the Site URL points to this Hub. Apply the migrations before deploying `hub-users` or the Angular UI. The invite function has JWT verification enabled. No migration or deployment is performed by this document.

## Connected laptop

The station is a local Node.js 22 program under `scripts/packing-station/`. Set `HUB_SUPABASE_URL` and `HUB_SUPABASE_ANON_KEY` as local environment variables; both are publishable frontend configuration. At the machine, run `start.ps1 -ControllerIp <private LAN address>`. It prompts for a manager account and keeps the password only in the process environment during this run. Stop it with Ctrl+C before disconnecting the laptop. A future server can run the same station contract under its own authenticated manager or dedicated station identity.

The transport sends `.rd` bytes to a private Ruida IPv4 address over UDP and requires an acknowledgement for every chunk. The implementation is based on the [published Ruida protocol research](https://github.com/jnweiger/ruida-laser/blob/master/doc/protocol.md). Its packet exchange is tested with a local mock, but the exact controller model, network address and file-list behavior have not been verified against the physical machine. First validate with a harmless test job and check the controller file list before production use. A timeout or stopped laptop may leave a partially received file; check the controller before resetting and retrying. No command to start cutting is issued by the station program.

## Checks

- `npm test -- --watch=false` and `npm run build` from `angular-app/`.
- `node --test scripts/packing-station/ruida-udp.test.mjs`.
- `.github/scripts/packing.test.mjs` runs the two migrations on isolated PGlite with synthetic users, boxes and orders, checking manager/worker access, missing-file rejection, transfer and completion. It does not touch production data.
