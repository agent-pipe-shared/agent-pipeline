# w8-ls-files-output-exceeds-the-spawn-buffer (held patch, not applied)

Cause of red Verify steps found by the green-Verify pass: the tracked-file listing (`git ls-files -z`) is now about 1.2 MB, above the 1 MiB
`spawnSync` default, so four checkers ended with "git ls-files failed with exit unknown" (`status` null on ENOBUFS).

Change: `maxBuffer: 256 * 1024 * 1024` (the value the other listing sites in this repository already use) on the four spawn sites
`check-directory-contract.mjs`, `check-reference-paths.mjs`, `check-consumer-safe-paths.mjs`, `check-backlog-state.mjs` (path-scoped, same guard).

Evidence: `check-directory-contract`, `check-reference-paths`, `check-consumer-safe-paths` suites green in a clean clone of HEAD with the patch; the first two
were red there without it. Applies to the repository HEAD (`git apply --check`).
Not covered: the remaining red suites with other causes (see the classification notes of the green-Verify pass).
