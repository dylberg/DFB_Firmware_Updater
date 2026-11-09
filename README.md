# DFB Slim browser updater 0.3

Engineering bench build with all seven supplied DFB Slim firmware builds. Start with the October 28, 2026 build of 1.0.0 as the known baseline. Use a backed-up DFB Slim ESP32-S3 controller and desktop Chrome or Edge. The firmware version selector and normal USB-C update workflow are on the main page.

## Install the bench build

For the existing GitHub Pages site, upload the extracted contents to the repository root. Keep all directories under `firmware/` intact and include `releases.js`. `manufacturing.html` replaces the previous programming page at the same URL and redirects to the main updater. Remove the obsolete `manufacturing.js`, `manufacturing-core.js` and `MANUFACTURING.md` from the repository if present.

Wait for Pages to deploy, then open the same HTTPS address in your usual browser profile and check that the footer reads **Browser updater 0.3**. Browser backups stay with the original origin and profile. Export needed backups before changing hosts. For local development, run `node serve.mjs` and open http://127.0.0.1:4173. Run the test suite with `node --test tests/*.test.mjs`.

## Upgrade and rollback on the bench

1. Start with a working board on the October 28 1.0.0 build. Record the version in Pelco One and the sign settings you want to verify. Use a spare board and keep the Windows recovery tool available.
2. Select **1.0.1**, connect, and click **Install 1.0.1**. The page verifies and saves an 8 MB backup before writing. After verification, use **Save backup** and **Save log**. Keep that pre-upgrade backup separate from the next backup.
3. Disconnect USB, power-cycle, and verify 1.0.1 in Pelco One. Check the saved settings and normal sign operation.
4. Reconnect in the browser and select **1.0.0 (Oct 28, 2026)** and install it, then save the second backup and log. Power-cycle and verify 1.0.0, settings and sign operation again.
5. If either write fails or the controller fails to boot, save the log and use the approved Windows service recovery procedure. A same-board full 8 MB backup restore with esptool was previously verified. Match the controller MAC and backup SHA-256 before restoring.

## Release details

The original 1.0.0 package contains a factory app and one OTA slot. Engineering's 1.0.1 package has two OTA slots. Both layouts use the same physical application regions and the same NVS, radio calibration and storage ranges. The updater recognizes each exact partition-table hash and checks the primary and secondary image descriptors where applicable. It writes the selected bootloader, table, initial OTA data and primary app. The initial OTA data resets boot selection. A secondary application can remain on the board. The four selected files and the three preserved ranges are verified by readback.

The menu identifies each build by version and archive date when available. The two 1.0.0 builds and two 0.1.0-1 builds have different application binaries. Pelco One may show the same version for both, so use the updater log and verified readback to identify the build. The June 24 archive name says ESP32, but both its bootloader and application identify the target as ESP32-S3. The updater uses the four USB flash binaries from each package. The .prel file is outside that workflow.

The backup protects the flash state before each write. The updater compares the preserved ranges before the next boot. Changes that the running application makes to settings or storage are outside that comparison, so verify behavior after each power cycle. These firmware paths passed automated simulation with the supplied binaries. The 1.0.0 to 1.0.1 upgrade was verified on one board and confirmed in Pelco One. USB was missing afterward in normal operation. For the Rev B1 bench board, hold the lower BOOT button, tap the upper RESET button, then release BOOT and check Windows for the USB serial port. If download mode does not expose a port, stop the USB downgrade test. Physical downgrade and validation of the other builds are pending.
