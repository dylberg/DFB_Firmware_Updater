# Manufacturing add-on 0.2

Upload these four files to the root of DFB_Firmware_Updater, alongside index.html. Commit the replacements and reopen https://dylberg.github.io/DFB_Firmware_Updater/manufacturing.html once Pages deploys. Confirm the footer shows Manufacturing 0.2.

## Bench test and recovery

1. Use the same site address and Chrome or Edge profile for the entire test. Connect the spare controller. To check whether an earlier backup is available, select Restore backup and inspect the list. Selecting an entry verifies its size, SHA-256 and controller MAC.
2. Select Factory program / reset, check the erase box, and click Erase & program. The page reads the full 8 MB before erasing. If any data is present, it saves a dated pre-erase backup, reads it back and verifies its hash. A backup error stops the erase. A fully blank board still receives the full read but needs no saved backup.
3. Save the log before recovering the board. After programming PASS, unplug USB-C, power-cycle, and check the sign and Pelco One.
4. If recovery is needed, reconnect the same board and select Restore backup. Choose the record from before the failed run, confirm overwrite, and click Restore backup. The page checks the board and image again, writes all 8 MB, and verifies the SHA-256 of the complete readback. Power-cycle after PASS.

Backups are local to this site and browser profile. The restore list includes earlier customer-updater records for the same MAC. This release restores those records directly and has no file-import option. Keep your downloaded backup for the Windows recovery procedure if browser storage is lost or browser recovery fails. Update existing board skips backup and leaves the settings ranges untouched.

Manufacturing browser restore has passed simulated tests. A physical USB restore and post-restart check are still needed. Factory programming is for bench validation pending confirmation of the firmware and provisioning sequence.
