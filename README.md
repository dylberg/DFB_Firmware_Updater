# TraffiCalm DFB Slim browser updater — bench release 0.1

Desktop Chrome / Edge, USB-C, firmware 1.0.0. No installed customer application, Python, Node, or browser extension is needed once hosted. Open the HTTPS page directly, not inside a site-builder preview or embedded frame.

## Try locally

With Node installed, run `node serve.mjs` from this folder, then open http://127.0.0.1:4173 in desktop Chrome or Edge. This is a developer convenience; customers will use the hosted URL. Do not double-click index.html: firmware fetches and browser permissions require a proper origin.

1. Close the Windows updater, Espressif tool and any serial terminal.
2. Connect a powered DFB Slim controller using the internal USB-C data cable.
3. Click Connect controller and choose the ESP32-S3 device in the browser picker.
4. Click Update. Keep the tab open and power/USB connected. The page checks compatibility, reads a full 8 MB backup, saves and reads it back from browser storage, writes four files and verifies firmware plus settings.
5. Once programming is verified, save a backup copy, power-cycle the controller, and confirm version 1.0.0 in Pelco One. The page’s confirmation button records your observation; it does not query Pelco One.

Backups remain in IndexedDB on the same browser profile and website origin. Save backup downloads the latest backup as a raw 8 MB BIN. Backups are not sent anywhere. Clearing browser data/private browsing can remove them. The session log is downloadable separately. A failed backup write or readback stops before programming.

## GitHub Pages

Create the engineering-owned repository (suggested name: DFB_Firmware_Updater). Copy this folder's contents into the repository root. In Settings → Pages choose Deploy from a branch, main, / (root). Use the HTTPS address GitHub returns; no build or external CDN is required. All paths are relative, including firmware and vendor scripts, so project subpaths work.

This package does not create a GitHub repository or publish to the TraffiCalm organization. The existing SE_Sign_Simulator site is separate and is not modified.

## Scope and verification

This is a NEW browser implementation requiring a physical browser bench run. Successful Windows updater tests do not establish browser transport compatibility. Tests exercise real firmware integrity and simulated device workflows. They do not operate the USB hardware.

Only ESP32-S3, 8 MB flash, security flags=0/crypt count=0, the exact supplied partition table, and recognized dfb_slim_fw factory versions 0.1.1/1.0.0 are accepted. The factory descriptor is not necessarily the currently running OTA version. Existing OTA descriptors, when present, must also be recognized. Blank, secured, unidentified or differently partitioned devices are rejected.

Writes: bootloader 0x0000; partition table 0x8000; OTA data 0xC000; application 0x10000. Flash header settings are kept unchanged. No full-chip erase, eFuse operation, security override or automatic backup restore exists. NVS at 0x9000, PHY at 0xE000 and storage at 0x310000 are read back and compared after programming. OTA boot metadata is deliberately reinitialized by the supplied firmware package, matching the tested manual/Windows process.

After interruption: save the log and backup. Power-cycle and reconnect. Retry only if compatibility checks pass. If a partial write prevents recognition, contact Technical Services and use the qualified Windows/manual service procedure. The Windows app also rejects unknown layouts; it is not an automatic full-backup restore tool. Do not restore backups across controllers.

Before customer release: test browser connection, multiple board revisions, known 0.1.1 migration, settings/normal sign operation after restart, cable removal during backup and write, retry/service recovery, denied storage and port permission, and managed Chrome/Edge policy restrictions. Bench release labeling should remain until those checks pass.

Future releases belong in firmware/release.json with reviewed binary hashes and compatibility rules. Current code deliberately restricts target version to 1.0.0. Do not simply replace BIN files or remove compatibility checks. SHA-256 detects corruption; the manifest is not a cryptographically signed release. Protect repository publishing access.

## Development

`node --test tests/*.test.mjs` runs workflow tests. No install step. Source: app.js (UI/storage), core.js (checks/workflow), device.js (Web Serial adapter). esptool-js 0.7.1 and SparkMD5 3.0.2 are bundled under vendor with their licenses. esptool-js includes pako and Espressif stubs. READ_FLASH packets and the final MD5 trailer are validated; firmware additionally has readback byte comparisons.

Support: 1-844-457-3526.
