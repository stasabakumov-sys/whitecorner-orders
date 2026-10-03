# Packing laser jobs

The laser cuts packaging boxes. Its `.rd` jobs are separate from Product CNC `.crv3d` files.

## Hub workflow

1. A manager opens **Products → product card → Packing**. Each saved physical box can have multiple `.rd` files. A positive **Copies** count belongs to each file and tells the operator how many cutouts to make. The laptop sends each distinct file once; it does not start the laser or automatically repeat cutting.
2. **Packing → Manage Packing** lists physical product units by production stage, from Packing to New. The manager presses **Send** for the matching saved packaging variant. No employee is selected. The server rejects the send unless every box in that profile has at least one `.rd` file. Each task saves a snapshot of packaging, filenames, storage paths and copy counts. Replacing an existing RD file in Product Packing explicitly updates that file in all unfinished tasks using its ID. Completed and cancelled snapshots stay unchanged. Other profile edits do not rewrite sent work.
3. **Packing → Packing work** shows each sent task to every active Hub member, with the Product packaging, box drawing, RD files and the operator's cutting quantity for each file. **Load to laser** queues a transfer only while a station heartbeat is fresh. The laptop transfers each distinct RD file once; the quantity is a visual instruction only and is never configured in the machine by Hub. The operator checks the controller file list, sets the required number of cuts and starts cutting at the machine panel. Completion in this section records packaging work and does not change the product's Production Board stage.

### Shared Backdrop RD library

Backdrop packaging RD files are shared by an exact two-dimensional metric size and an explicit Foldable/Non-foldable choice, following the same identity as the shared CDR drawing. Managers can manage them in **Products → Backdrop packaging library** or a matching product's Packing card. A matching Backdrop automatically shows the shared files, and a new Packing task snapshots that set. Files for another size or folding choice never match. CDR remains reference material and is never loaded to the laser.

Migration `20261002000100_shared_backdrop_rd.sql` moves an existing profile's RD set into the shared library only when that size and folding choice have a single source profile with unambiguous filenames. If multiple old sets exist, they remain intact for manager review; the product card offers **Use this set for all matching Backdrops** until a shared set is chosen. Existing Packing tasks retain their file IDs and snapshots. Replacing a shared file updates unfinished tasks that use its ID and clears that file's Done mark. Saving or replacing an RD file never starts cutting.

Cart Base RD files are shared by the reusable `wc_shipping_packages` Base box ID, which fixes the product, Cart size and box number. A saved profile box qualifies only when its main-product contents, name and dimensions match exactly one active Base box. Explicit `cart-main` replacement variants and Add-on boxes keep profile-specific RD files. Migration `20261003000100_shared_cart_base_rd.sql` promotes an old profile's files only when there is one unambiguous source set; conflicts remain profile-local for manager review. New tasks use shared Base files when available, otherwise their profile-local files. Existing task snapshots remain intact and shared file replacement updates unfinished tasks through the existing file-ID guard.

Products → Cart → Packing shows CDR source drawings and RD cutting files under each reusable Base box. Migration `20261003000200_cart_base_rd_from_product.sql` adds direct Base-box saving and a private shared CDR reference. It shares an existing CDR only when exactly one current drawing matches that Base box; original profile records stay intact. CDR geometry is checked when saving and displaying it, and CDR never enters the laser transfer queue. A matching order profile uses the same Base files, while custom Main + Add-ons replacement boxes retain their own files.

### Custom jobs

**Packing → Manage Packing → Custom jobs** stores manager-created jobs independently of products and orders. Save a title and optional instructions, then add one or more private `.rd` files with a copy count for each. **Send to Packing work** takes a snapshot of the title, instructions and files. The shared Packing work queue uses the same transfer, per-file Done and explicit **Confirm boxes made** flow. Files on a sent active job are locked until that task is completed or cancelled; a completed job can be edited and sent again. Custom work has no product drawing and never changes an order or production unit. Database changes are in `20261001000100_custom_packing_jobs.sql` and `20261001000200_custom_packing_rd_and_dispatch.sql`.

Managers may also attach `.cdr` source drawings to a Custom job. They are stored in the separate private `custom-packing-drawings` bucket and `wc_custom_packing_drawings` table, available only to active managers. These files are reference material for preparing RD files. They are never copied into a Packing task snapshot, shown in Packing work, or loaded to the laser. A manager may add or remove them even while the RD task is active. The schema and access policies are in `20261001000300_custom_packing_cdr_drawings.sql`.

## Replacing an RD file in current work

Migration `20260930000200_replace_active_packing_rd.sql` allows the existing Replace control to save a new file and update unfinished task snapshots atomically. It preserves the file ID, box information, other files and their Done marks. The replaced file's Done mark is cleared, affected tasks return to Sent to cutting, and a fresh **Load to laser** is required. Replacement never queues a transfer, starts cutting or changes the production stage. Completed tasks retain their original files; storage cleanup continues to protect those objects.

If any affected task has a queued or claimed transfer, replacement fails without changing the saved file or tasks. Wait for that transfer to finish, then retry. Stale revisions are rejected. Deletion and copies-only edits remain blocked while the file is used by active work. Saving a replacement can include the desired copy count.

New task creation locks the packaging profile, as file saving already does, to prevent a concurrent Send from capturing the old file during replacement. Task locks serialize replacements with transfer requests and cut completion.

## Accounts

The first migration requires exactly two pre-existing Auth users and gives both manager access, as agreed. New invitations create worker accounts. Only managers may invite employees, edit `.rd` files and send tasks. `hub-users` uses the server-side service role key; no admin credential enters the Angular bundle.

Configure `HUB_INVITE_REDIRECT_URL` as the deployed Hub's HTTPS root with `?setup=1`. Allow that exact URL in Supabase Auth redirect settings. If Supabase falls back to its Site URL, the Hub also recognizes the `type=invite` fragment and opens the password setup form, provided the Site URL points to this Hub. Apply the migrations before deploying `hub-users` or the Angular UI. The invite function has JWT verification enabled. No migration or deployment is performed by this document.

## Connected laptop

Read [the saved connection runbook](LASER_CONNECTION_RUNBOOK.md) first. The confirmed controller is `192.168.1.100`, destination UDP port 50200 and local port 40200. Close RDWorks before starting the station.

The station is a local Node.js 22 program under `scripts/packing-station/`. Run `start.ps1 -ControllerIp 192.168.1.100`. It reads the public Hub URL and publishable key from the repository frontend configuration unless `HUB_SUPABASE_URL` and `HUB_SUPABASE_ANON_KEY` are already set. It prompts for a manager account and keeps the password only in the process environment during this run. Keep the window open; stop with Ctrl+C before disconnecting the laptop. Starting the station allows it to process queued Hub transfers.

The transport first sends the filename command, then `.rd` bytes unchanged, requiring an acknowledgement for every chunk. The named-file sender was tested on the physical controller with `RELTEST2`; the operator confirmed both storage and a successful manual cut. Earlier timeouts were caused by restricted UDP access in the command environment, even though ping worked. Use permitted LAN access without changing the exported RD bytes or disabling security settings.

The station downloads and validates all task files before sending any of them. The name command contains the saved filename without its final `.rd` extension (case-insensitive): `D1.rd` is sent as `D1`. Case, spaces and other dots in the name remain unchanged; the Hub retains the full filename. This follows the owner’s correction on 30 September 2026 and supersedes the earlier instruction to include the extension. The station does not derive controller names from hashes. The current sender accepts printable ASCII names up to 255 bytes without path separators; an unsupported name causes a visible transfer error instead of silent renaming. The station window shows each filename and its required cutting quantity. Identical content under the same name is stored once; different source names remain separate. Conflicting names with different contents in one task are rejected before transfer; all cutting quantity instructions remain visible. A partial failure never reports the whole task as transferred. Check the controller file list before retrying; acknowledgements alone are not proof of a usable stored file. No command to start cutting is issued.

After transfer, Packing work shows **Ready to cut**. The operator checks and cuts every listed quantity at the machine, then marks the matching RD file done. The final check opens a confirmation dialog; the server closes the task only after the operator confirms Boxes made. Manage Packing refreshes task statuses every ten seconds and shows **Boxes made** with `completed_at`; the product's production stage is unchanged. Failed saves retain earlier confirmed progress so the operator can retry.

Each RD file now has its own **Done** checkbox. One check confirms that all listed copies of that file were cut. `wc_set_packing_file_done` saves each file ID to `wc_packing_tasks.cut_file_ids`; progress such as 3/4 survives refresh and another operator's session. A failed save leaves the previous check state and shows an error. Unchecking an earlier file saves the reversal. Checking the final remaining file only saves progress and opens the confirmation dialog. Cancel keeps the task open with its saved progress. The Confirm boxes made button reopens the dialog later. Only explicit confirmation calls `wc_complete_packing_task` to set `completed` and `completed_at`, remove the task from Packing work and update Manage Packing. Migration `20260930000300_packing_completion_confirmation.sql` enforces this separation. Only active Hub members may save progress, only for files in a transferred task. The completion RPC requires every file to be marked done. Reloading files does not discard saved cutting progress.

## Windows automatic startup

Run `scripts/packing-station/install-autostart.ps1` with Windows PowerShell once on the connected computer. The installer prompts for the Hub manager account, validates active manager access, and saves the credential with Windows DPAPI (`Export-Clixml`). Only the same Windows user on the same computer can decrypt it. Do not copy or commit `credential.xml`. The installation folder is restricted to that user and SYSTEM.

The installed copy lives in `%LOCALAPPDATA%\WhiteCorner\PackingStation`, independently of Git worktrees. A `White Corner Packing Station.lnk` shortcut in the current user's Startup folder launches Windows PowerShell hidden at sign-in, without administrator privileges. `RemoteSigned` is set only for that launcher process; no machine or user execution policy is changed. Node.js is invoked by its resolved absolute path. A named mutex prevents two background station instances; an exited Node process restarts after 15 seconds.

The station starts immediately after setup and processes Hub transfer requests, including already queued requests. Cutting remains manual. Close RDWorks before uploading. `transfer.log` contains original-to-controller filename mappings, `errors.log` contains station errors, and `setup-status.json` records installation progress without credentials. To disable future automatic starts, remove the named shortcut from `shell:startup`; this does not stop an already-running transfer. Re-run setup after changing the Hub password, moving to a different Windows account, or upgrading the installed station code. Real end-to-end file transfer still requires operator verification on the controller.

## Checks

- `npm test -- --watch=false` and `npm run build` from `angular-app/`.
- `node --test scripts/packing-station/ruida-udp.test.mjs scripts/packing-station/transfer-task.test.mjs` (local mocks only).
- `.github/scripts/packing.test.mjs` runs the Packing migrations on isolated PGlite with synthetic users, boxes and orders, checking manager/worker access, missing-file rejection, transfer and completion. It does not touch production data.

After a successful transfer, Reload files to laser remains available until Boxes made. It queues a new transfer through the same authenticated contract; queued or claimed requests are reused to prevent duplicate jobs. Reload clears the local cutting confirmation only after the server accepts the request. Completed and cancelled tasks cannot be reloaded.
