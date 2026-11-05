# Manufacturing add-on 0.1

Upload manufacturing.html, manufacturing.js and manufacturing-core.js to the existing repository root next to index.html. No existing customer files need replacing. Open https://dylberg.github.io/DFB_Firmware_Updater/manufacturing.html after GitHub Pages finishes deployment.

Update existing board is selected by default. It checks the qualified firmware/layout, skips backup and settings readback, and writes only the approved four image ranges. Settings areas are left untouched. Factory program/reset works on blank or previously programmed ESP32-S3 8 MB boards and erases ALL flash before programming. Security/profile checks still apply. Confirm the erase checkbox AFTER connecting each board; it is cleared after every attempt and whenever mode changes.

Both modes validate firmware SHA-256, chip/security/capacity and device identity, and verify flashed firmware using library MD5 plus explicit byte readback. PASS means programming verified, not normal operation. Power-cycle and run manufacturing acceptance tests. This tool loads the supplied firmware only; it does not provision serial numbers, keys, calibration or custom manufacturing defaults.

No backup or automatic restore exists. On failure save the log, power-cycle and select the appropriate mode. Factory mode intentionally deletes all prior settings and stored data. A separate URL is not access control: on this public site anyone can open this tool, but programming requires their local USB device selection.

Automated checks cover update without erase/backup, blank-board rejection in update, factory programming/reset, required erase confirmation, security rejection, erase/write/verification failures and invalid mode. Manufacturing modes have not yet been physically bench-tested. The customer browser updater was successfully tested separately; its files are unchanged.

Timing needs measurement: skipping the approximately 83-second full backup should shorten the observed customer run substantially. Full-chip factory erase adds time. No 15–25-second guarantee is made.
