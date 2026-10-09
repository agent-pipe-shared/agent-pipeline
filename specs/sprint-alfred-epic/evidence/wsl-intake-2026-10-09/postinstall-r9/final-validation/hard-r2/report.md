# ALFRED bootstrap remaining fixtures R2

1. **Result:** Added the existing complete current `checkCloneProvisioningFn` seam to only the Claude and Codex non-invocation unit cases. Their detector spies and `status === "ready"` assertions are unchanged. No production gate or hook metadata changed.

2. **Evidence:** Direct Node ran against this postimage's copied plugin graph with cwd, `TMPDIR`, and `GIT_CEILING_DIRECTORIES` isolated under this r2 scratch fixture. Result: 23 pass / 0 fail. The captured output is `hard-enforcement-r2.green.log`, SHA-256 `3f177c9c7b2bc4f46950a492bb904dd42e04e0a11dde8a9aa98b6efd09b848dc`. The combined-root RED capture was `scratch/alfred-combined-r9-focused-resumed-20261009/hard-enforcement.tap.txt` (21 pass / 2 fail at the two non-invocation cases).

3. **Changed files:** Only this r2 scratch tree. The test postimage SHA-256 is `2b8f664c7176fc31b2d42cd32b87f1426f393ac95dcec66c0d9841e19bb44e88`. It starts from the r1 test postimage and adds the two current-readiness injections. The r1 file remains unchanged at SHA-256 `1e94747e89becd06a089198e8feaed1d26c3057325660965d77c290f5cf03c51`.

4. **Not changed:** The other two r1 postimages, all main-repository files, production source, native hook state and settings were left untouched. The current-readiness seam is injected test data for pure unit cases and makes no claim about installed hooks.

5. **Limits:** Verification covers this copied plugin graph under the isolated r2 scratch cwd; it does not claim host-native or live-install readiness.

6. **Open items:** Independent review and coordinator acceptance remain pending.
