# Browser updater verification — November 5, 2026

24 automated tests passed using Node.js 24.22.1. JavaScript syntax checks passed for app.js, core.js and device.js.

Test coverage: original firmware SHA-256 values; successful ordered workflow with backup before write; simulated v0.1.1 descriptor; security/encryption/chip/capacity rejection; short backup; read disconnect; backup storage failure; controller identity change; partition/project/version rejection; interrupted write; firmware and settings mismatch; changed package and addresses; missing security fields; real vendored module import; chunked flash reads and MD5 trailer consumption; corrupted checksum; short transfer; unchanged flash headers/no full erase and real MD5 calculation.

No physical serial write was performed with this browser release. The separately tested Windows updater succeeded on multiple boards and Pelco One showed 1.0.0 after restart. That hardware result must not be represented as a browser test.

Browser visual QA could not be completed in the current execution environment: installed Chrome/Edge headless launches returned without producing a DOM or screenshot. Page behavior, device picker, actual IndexedDB backup persistence, disconnect handling and USB timing still need an interactive Chrome/Edge bench run. No successful browser render is claimed.

The browser adapter was checked against bundled esptool-js 0.7.1 and the Espressif Python loader READ_FLASH protocol. Tests validate the application’s read-trailer handling with simulated transport, not real hardware.
