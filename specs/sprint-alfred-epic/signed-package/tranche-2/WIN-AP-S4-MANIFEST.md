# WIN-AP-S4 manifest: the guard-side creators use the private-root entry point (tranche-2 post-images, kernel, class S)

Dispatch: WIN-AP-S4-20261009. Slice S4 of Ruling 141 (`specs/sprint-alfred-epic/evidence/win-ap-d-agent-pipeline-creators-2026-10-09.md`,
section 3). Only post-images are produced here; the live `lib/guard/` files are never written by an agent.

## Targets

Both are protected guard files; each post-image is delivered as a signed-package artifact and installed by the ceremony.

| Install target | Post-image | Base blob (git sha1) | Base sha256 / bytes | Post-image sha256 / bytes |
|---|---|---|---|---|
| `plugins/pipeline-core/lib/guard/bootstrap-receipt.mjs` | `specs/sprint-alfred-epic/signed-package/tranche-2/lib/guard/bootstrap-receipt.mjs` | `8014901a13fe1960726c03dbc16d084758c64333` | `ae8d75e1e5d083883fecae74a7b972da7486c9e5a3b283e85795d12a90c6f066` / 9267 | `7a0f39e1627bd336e68123c50104b615f7538daadd0950e37b25bddd9289f0d3` / 10229 |
| `plugins/pipeline-core/lib/guard/denial-telemetry.mjs` | `specs/sprint-alfred-epic/signed-package/tranche-2/lib/guard/denial-telemetry.mjs` | `17ddfe91ae20b6712ef2f08d4eca2e53b7e601a5` | `462b07f7be775524c8a44b27beec109776b1a50dfe4870b1ddc83354cdabaceb` / 12134 | `8d2904c4d1b26ec691788892608ceec2faef6db712b5b9392c7b8fb2e60c5e3b` / 13000 |

Base = the live file as read from the working tree at candidate `4b79b33a0` (both files unmodified there; LF, `eol=lf`). The post-images
use the live files' relative imports, so each works only when installed at its target path.

## The anchored edits (each anchor occurs exactly once; the build asserts it and refuses a CRLF input; no other line changes)

`bootstrap-receipt.mjs` (4 edits):

1. `import`: after `import { verdict } from "./verdict.mjs";` add `import { ensureAgentPipelineRoot, ensureHardenedPrivateDirectory } from "../hardened-private-directory.mjs";`.
2. `helper`: after `bootstrapReceiptDir()` a new module-private `ensureBootstrapReceiptDir(commonDir, mkdirSyncFn)`: it calls
   `ensureAgentPipelineRoot(commonDir, { mkdir: mkdirSyncFn })` and then `ensureHardenedPrivateDirectory(privateRoot, bootstrapReceiptDir(commonDir), { mkdir: mkdirSyncFn })`.
3. `observation-site` (live `:63`, inside `recordBootstrapObservation`): `mkdirSyncFn(bootstrapReceiptDir(commonDir), { recursive: true, mode: 0o700 });` becomes `ensureBootstrapReceiptDir(commonDir, mkdirSyncFn);`.
4. `receipt-site` (live `:93`, inside `recordBootstrapPreflightReceipt`): the same replacement.

`denial-telemetry.mjs` (3 edits):

1. `import`: after the `resolveGitCommonDir` import add the same `hardened-private-directory.mjs` import.
2. `helper`: after `guardDenialClassesDir()` a new module-private `ensureGuardDenialClassesDir(commonDir, mkdirSyncFn)`, same two calls as above for `guardDenialClassesDir(commonDir)`.
3. `state-site` (live `:112`, inside `isFirstDenialThisScope`): `mkdirSyncFn(guardDenialClassesDir(commonDir), { recursive: true, mode: 0o700 });` becomes `ensureGuardDenialClassesDir(commonDir, mkdirSyncFn);`.

The `mkdirSyncFn` injection seam is passed through to both entry points, so the documented test seam survives (no test of these two modules
injects it). Every site was already inside a `try`/`catch` that fails open, so a `PrivateBoundaryError` lands on the existing branch with no new handling:
the receipt writer records a `fail-open-receipt-write-error` observation, the telemetry writer returns `true` (full text).

## Behaviour changes the ceremony needs to know

- **Install precondition (win32).** `ensureHardenedPrivateDirectory` refuses a pre-existing child that assesses insecure; it does not repair one.
  A checkout whose `<common>/agent-pipeline/bootstrap-receipt` was created by the old unhardened mkdir under an insecure root may therefore fail every
  receipt write after installation, and with no receipt every dispatched subagent's first Write is refused (`GUARD-BOOTSTRAP-RECEIPT-MISSING`).
  The root itself is repaired in place under the D0 posture. Assess, and if needed re-harden, the two existing children on each Windows checkout
  before installing (this is the "latent state becomes hard failure" warning at `win-ap-d-agent-pipeline-creators-2026-10-09.md:104`). The
  telemetry child fails open to the full-text rendering, so it is only a cost, not a block.
- **Per-call cost (win32).** Site `observation-site` runs on every dispatched subagent gate decision (the `allow-receipt-present` observation),
  so on win32 a DACL assessment of the root and the child now runs per call instead of a plain mkdir. Not redesigned here.
- **POSIX.** Root and child are now created `0o700` without a recursive mkdir; an existing root with group/other bits is repaired to `0o700` when owned by the current user.

## Verification

Method deviation (same shape as `TR-C-F-MANIFEST.md:72-82`): a guard-side module is imported by its live URL, so the post-images are exercised through an
ESM load hook (`scratch/dispatch-wip/WIN-AP-S4/redirect.mjs`, git-ignored, not part of this commit) that serves the post-image bytes under the live module
URLs. The test imports the modules in-process, so the test file is run directly with `--import`. Each run prints one line per module from the hook's exit
handler (`WINAPS4-REDIRECT-FIRED <module> (1 loads)`); an absent line would mean the run was against the live modules.

Build (writes both post-images; prints the shas above):

```
node scratch/dispatch-wip/WIN-AP-S4/build.mjs
```

Runs (the contract is pins (b) and (c) of `plugins/pipeline-core/lib/agent-pipeline-root-creation.test.mjs`; pin (a) must stay green):

```
node plugins/pipeline-core/scripts/capture-evidence.mjs --out evidence/WIN-AP-S4-20261009/before.txt --label WIN-AP-S4-before -- node plugins/pipeline-core/lib/agent-pipeline-root-creation.test.mjs
node plugins/pipeline-core/scripts/capture-evidence.mjs --out evidence/WIN-AP-S4-20261009/after.txt --label WIN-AP-S4-after -- node --import ./scratch/dispatch-wip/WIN-AP-S4/redirect.mjs plugins/pipeline-core/lib/agent-pipeline-root-creation.test.mjs
wsl.exe -e bash -lc "cd <repo-root-in-wsl>; node plugins/pipeline-core/scripts/capture-evidence.mjs --out evidence/WIN-AP-S4-20261009/wsl-after.txt --label WIN-AP-S4-wsl-after -- node --import ./scratch/dispatch-wip/WIN-AP-S4/redirect.mjs plugins/pipeline-core/lib/agent-pipeline-root-creation.test.mjs"
```

| Capture | Where | Modules | Wrapped exit | tests / pass / fail |
|---|---|---|---|---|
| `evidence/WIN-AP-S4-20261009/before.txt` | native win32 | live | 1 | 5 / 3 / 2 (pins (b), (c) red: `status=insecure, reason=private path DACL grants a non-owner principal`) |
| `evidence/WIN-AP-S4-20261009/after.txt` | native win32 | post-images, both hook lines FIRED | 0 | 5 / 5 / 0 |
| `evidence/WIN-AP-S4-20261009/wsl-after.txt` | WSL | post-images, both hook lines FIRED | 0 | 5 / 5 / 0 |

Pin (a), the premise case and pin (e) are green in all three captures; the only state change between `before.txt` and `after.txt` is (b) and (c) turning green.
The native baseline discriminates on this host (the temporary directory hands down a foreign ACE), so the green is not an absent premise. No WSL baseline was
captured: on POSIX the old recursive mkdir already passed `mode: 0o700`, so (b) and (c) are green there by the test header's own account.

`node harness/scripts/check-consumer-safe-paths.mjs` is run against the three committed paths before the commit; its result is in the dispatch record.

## Installing

Not performed by this dispatch. The ceremony installs each post-image at its target above and re-runs the three captures with the live modules (no
`--import`); the expected result is the `after.txt` shape. Forbidden and untouched here: live `hooks/`, live `lib/guard/`, tests, the tranche README.
