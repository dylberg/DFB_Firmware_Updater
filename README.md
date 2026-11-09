# DFB Slim browser updater

Engineering handoff for browser updater 0.1 and DFB Slim firmware 1.0.0. The package contains the customer page, source, pinned firmware, vendored dependencies and automated tests. It runs as a static HTTPS site in desktop Chrome or Edge. No application install or build step is required to use the hosted page.

## Take ownership

1. Put the contents of this folder in an Engineering-owned repository. Keep `index.html`, `.nojekyll`, `firmware/` and `vendor/` at the publishing root.
2. Assign an Engineering owner for firmware compatibility, release approval, hosting and service recovery. Keep release commits and exact firmware binaries traceable together.
3. Publish a bench URL under Engineering's account. For GitHub Pages, publish from `main` at `/ (root)`. Review the publishing workflow and open the deployed page to confirm it loads the intended release. Use an HTTPS link that opens the page directly.
4. Complete the release checks below before distributing the customer link. If the host changes, export needed backups from the old site first. Browser backups belong to the original site origin and browser profile. They do not follow the user to a new domain.

Current reference deployment: https://dylberg.github.io/DFB_Firmware_Updater/

## Run and test locally

From this folder, run `node --test tests/*.test.mjs` with Node.js 24. The tests use the included firmware files and a simulated controller. Run `node serve.mjs` and open http://127.0.0.1:4173 in Chrome or Edge for a local bench session.

Connect the powered controller with a USB-C data cable. Close other serial tools. Click **Connect controller**, select the controller in the browser, then click **Update**. Keep power and USB connected until verification completes. Power-cycle the controller and confirm firmware version and sign operation in Pelco One. The confirmation button records the operator's observation.

## Compatibility and write behavior

- Supported path: DFB Slim with ESP32-S3, 8 MB flash, the supplied partition layout, security flags and flash crypt count both zero, and a recognized `dfb_slim_fw` image at version 0.1.1 or 1.0.0. An installed OTA descriptor, if detected, must pass the same project/version checks. The factory image descriptor may differ from the currently running OTA version.
- Before programming, the updater checks firmware hashes and controller identity, reads all 8 MB, and verifies the backup after saving it in browser storage. **Save backup** exports a raw 8 MB BIN. **Save log** exports the session record.
- The release writes the bootloader at `0x0000`, partition table at `0x8000`, initial OTA data at `0xC000`, and application at `0x10000`. Flash header settings are preserved. Writing the initial OTA data resets OTA boot selection.
- The updater verifies the firmware readback and compares NVS, PHY calibration and storage with the backup. The update writes only the approved ranges. A failed check stops the workflow and reports the error.

## Release a firmware update

1. Obtain the approved binaries, flash map, hardware revisions and migration rules from Firmware Engineering. Verify what must be preserved and which image should boot after a power cycle.
2. Update `firmware/release.json` with the approved filenames, offsets, exact byte sizes and SHA-256 hashes. Update the target release and supported source versions in `core.js` based on the validated migration paths. Its current target is explicitly pinned to 1.0.0. Review the flash range and partition guards whenever the layout changes.
3. Update the displayed target and confirmation text in `index.html` and the target version in the session log in `app.js`. Update test fixtures and rerun the suite. Keep the vendor licenses and notices with the packaged browser libraries.
4. Record the reviewed commit, firmware hashes, bench results, approver and published URL. Keep the previous site release available to redeploy if hosting or UI changes regress. Any controller downgrade needs its own validation.

`app.js` handles the page, browser storage and logs. `core.js` enforces release compatibility and controls the update sequence. `device.js` wraps the vendored esptool-js Web Serial adapter. The manifest hashes check file integrity. Release authenticity depends on control of the repository and publishing path.

## Evidence and remaining release checks

The November 5 Chrome bench log shows one complete browser reinstall of 1.0.0 on an ESP32-S3 controller. The 8 MB backup took about 83 seconds. All four writes, firmware readback and preserved-settings checks passed. The operator power-cycled and confirmed 1.0.0 in Pelco One. The separately tested Windows updater succeeded on multiple boards.

Engineering should document these checks before customer rollout:

- Migrate an actual 0.1.1 controller and verify the running version, existing settings and normal sign operation after a power cycle.
- Repeat on each supported hardware revision. Exercise managed Chrome and Edge, including permission denial and unavailable browser storage.
- Disconnect USB during backup and during a write on a backed-up bench controller. Verify the resulting message and the service recovery path.
- Verify the hosted page in a clean browser session, including access to all firmware and vendor files. Confirm the published version against the approved release.

## Service recovery

Capture the log and export the backup before clearing browser data or switching host/profile. The customer page can retry when compatibility checks pass. For a controller that fails to boot or no longer passes those checks, use the Engineering-approved service procedure.

A Windows esptool restore of a full pre-erase 8 MB backup was verified on the original controller, followed by a power cycle and successful Pelco One reconnection. Before a service restore, confirm the backup belongs to the connected controller by MAC and verify its byte size and SHA-256 against the original log. Treat backups as controller-specific service data and keep them out of the public repository.
