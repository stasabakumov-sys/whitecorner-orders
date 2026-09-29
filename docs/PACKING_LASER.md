# Packing laser jobs

The laser cuts packaging boxes. Its `.rd` jobs are separate from Product CNC `.crv3d` files.

## Hub workflow

1. A manager opens **Products → product card → Packing**. Each saved physical box can have multiple `.rd` files. A positive **Copies** count belongs to each file and tells the operator how many cutouts to make. The laptop sends each distinct file once; it does not start the laser or automatically repeat cutting.
2. **Packing → Manage Packing** lists physical product units by production stage, from Packing to New. The manager presses **Send** for the matching saved packaging variant. No employee is selected. The server rejects the send unless every box in that profile has at least one `.rd` file. Each task saves a snapshot of packaging, filenames, storage paths and copy counts, so later profile edits cannot rewrite sent work.
3. **Packing → Packing work** shows each sent task to every active Hub member, with the Product packaging, box drawing, RD files and the operator's cutting quantity for each file. **Load to laser** queues a transfer only while a station heartbeat is fresh. The laptop transfers each distinct RD file once; the quantity is a visual instruction only and is never configured in the machine by Hub. The operator checks the controller file list, sets the required number of cuts and starts cutting at the machine panel. Completion in this section records packaging work and does not change the product's Production Board stage.

## Accounts

The first migration requires exactly two pre-existing Auth users and gives both manager access, as agreed. New invitations create worker accounts. Only managers may invite employees, edit `.rd` files and send tasks. `hub-users` uses the server-side service role key; no admin credential enters the Angular bundle.

Configure `HUB_INVITE_REDIRECT_URL` as the deployed Hub's HTTPS root with `?setup=1`. Allow that exact URL in Supabase Auth redirect settings. If Supabase falls back to its Site URL, the Hub also recognizes the `type=invite` fragment and opens the password setup form, provided the Site URL points to this Hub. Apply the migrations before deploying `hub-users` or the Angular UI. The invite function has JWT verification enabled. No migration or deployment is performed by this document.

## Connected laptop

Read [the saved connection runbook](LASER_CONNECTION_RUNBOOK.md) first. The confirmed controller is `192.168.1.100`, destination UDP port 50200 and local port 40200. Close RDWorks before starting the station.

The station is a local Node.js 22 program under `scripts/packing-station/`. Run `start.ps1 -ControllerIp 192.168.1.100`. It reads the public Hub URL and publishable key from the repository frontend configuration unless `HUB_SUPABASE_URL` and `HUB_SUPABASE_ANON_KEY` are already set. It prompts for a manager account and keeps the password only in the process environment during this run. Keep the window open; stop with Ctrl+C before disconnecting the laptop. Starting the station allows it to process queued Hub transfers.

The transport first sends the filename command, then `.rd` bytes unchanged, requiring an acknowledgement for every chunk. The named-file sender was tested on the physical controller with `RELTEST2`; the operator confirmed both storage and a successful manual cut. Earlier timeouts were caused by restricted UDP access in the command environment, even though ping worked. Use permitted LAN access without changing the exported RD bytes or disabling security settings.

The station downloads and validates all task files before sending any of them. Controller names preserve the original filename without .rd (D1.rd becomes D1). Names must contain 1-8 ASCII letters, digits, underscores or hyphens; unsupported names are rejected instead of silently renamed. The station window shows each original filename, its controller name and its required cutting quantity. Identical content under the same name is stored once; different source names remain separate. Conflicting names with different contents in one task are rejected before transfer; all cutting quantity instructions remain visible. A partial failure never reports the whole task as transferred. Check the controller file list before retrying; acknowledgements alone are not proof of a usable stored file. No command to start cutting is issued.

After transfer, Packing work shows **Ready to cut**. The operator checks and cuts every listed quantity at the machine, confirms the checkbox, then presses **Boxes made**. Only the server's confirmed `completed` response removes the work card. Manage Packing refreshes task statuses every ten seconds and shows **Boxes made** with `completed_at`; the product's production stage is unchanged. Failed completion retains the task and checkbox so the operator can retry.

## Windows automatic startup

Run `scripts/packing-station/install-autostart.ps1` with Windows PowerShell once on the connected computer. The installer prompts for the Hub manager account, validates active manager access, and saves the credential with Windows DPAPI (`Export-Clixml`). Only the same Windows user on the same computer can decrypt it. Do not copy or commit `credential.xml`. The installation folder is restricted to that user and SYSTEM.

The installed copy lives in `%LOCALAPPDATA%\WhiteCorner\PackingStation`, independently of Git worktrees. A `White Corner Packing Station.lnk` shortcut in the current user's Startup folder launches Windows PowerShell hidden at sign-in, without administrator privileges. `RemoteSigned` is set only for that launcher process; no machine or user execution policy is changed. Node.js is invoked by its resolved absolute path. A named mutex prevents two background station instances; an exited Node process restarts after 15 seconds.

The station starts immediately after setup and processes Hub transfer requests, including already queued requests. Cutting remains manual. Close RDWorks before uploading. `transfer.log` contains original-to-controller filename mappings, `errors.log` contains station errors, and `setup-status.json` records installation progress without credentials. To disable future automatic starts, remove the named shortcut from `shell:startup`; this does not stop an already-running transfer. Re-run setup after changing the Hub password, moving to a different Windows account, or upgrading the installed station code. Real end-to-end file transfer still requires operator verification on the controller.

## Checks

- `npm test -- --watch=false` and `npm run build` from `angular-app/`.
- `node --test scripts/packing-station/ruida-udp.test.mjs scripts/packing-station/transfer-task.test.mjs` (local mocks only).
- `.github/scripts/packing.test.mjs` runs the Packing migrations on isolated PGlite with synthetic users, boxes and orders, checking manager/worker access, missing-file rejection, transfer and completion. It does not touch production data.

After a successful transfer, Reload files to laser remains available until Boxes made. It queues a new transfer through the same authenticated contract; queued or claimed requests are reused to prevent duplicate jobs. Reload clears the local cutting confirmation only after the server accepts the request. Completed and cancelled tasks cannot be reloaded.
