# WINACLFIX-F run evidence (native Windows, Claude, own checkout)

Durable copy of the run results behind the WINACLFIX-F commit (Critic WINACLFIX F1/F2); the machine-written logs
live in the ignored `scratch/WINACLFIX-F/` and do not leave this machine.

All runs: `node plugins/pipeline-core/scripts/capture-evidence.mjs --out scratch/WINACLFIX-F/<name>.log --label <name>
-- node --test <suite>`, single files only (no full Verify on native Windows).

| Suite | Before | After | Note |
|---|---|---|---|
| `lib/hardened-private-directory.test.mjs` | RED: exit 1, 8 pass / 6 fail (the 6 new cases) | exit 0, 14/14 | reproduce-first by the Goldfish |
| `lib/hardened-private-directory.install.test.mjs` (new) | n/a | exit 0, 3/3, 0 skipped (~13 s each, real DACL assessment) | real `applyInstall` in fresh temp repositories |
| `scripts/pre-push-hook-install.test.mjs` | exit 0, 44/44 | exit 0, 44/44 | identical |
| `scripts/commit-msg-hook-install.test.mjs` | exit 1, 20 pass / 2 fail | exit 1, 20 pass / 2 fail | identical failing names: CMI002, CMI018 (pre-existing on this host) |
| `scripts/pre-commit-hook-install.test.mjs` | exit 1, 5 pass / 51 fail | exit 1, 5 pass / 51 fail | identical failing-name list (pre-existing on this host) |
| `harness/scripts/check-consumer-safe-paths.test.mjs` | — | exit 0, 9/9 | run by the Elephant |

Before-captures by the Goldfish (WINACLFIX-F), after-captures and the name-list comparison by the Elephant.

Matrix: Claude x native Windows x own checkout (temp fixture repos) observed. Codex/Antigravity, WSL, macOS and a
real consumer repository: not verified; the code is runner-neutral, the POSIX branch is covered only by the
platform-injected unit case and the never-executed non-win32 branch of the install test.
