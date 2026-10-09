# WIN-AP-S6 manifest: the shared private-directory helpers route the agent-pipeline segment through the hardened entry point (tranche-2 post-images, kernel, class S)

Dispatch: WIN-AP-S6-F3-20261009 (built by WIN-AP-S6-F-20261009, verified by the Elephant, caller check by WIN-AP-S6-F2-20261009). Slice S6 of Ruling 141 / Ruling 162.
Only post-images are produced here; the live `lib/` files are never written by an agent (both are in the never-liftable kernel list of `lib/guard-maintenance-window.mjs`).

## Targets

| Install target | Post-image | Base blob (git sha1) | Base sha256 / bytes | Post-image sha256 / bytes |
|---|---|---|---|---|
| `plugins/pipeline-core/lib/private-boundary.mjs` | `specs/sprint-alfred-epic/signed-package/tranche-2/lib/private-boundary.mjs` | `66ba190e3002610c731faf3441e05798ded08bb0` | `86989b371563d4948d7cc86f7b06d8171303729361051016c7f331c94e97e931` / 7617 | `cad86c4815bf555a9e098ba06f0960fbd7722af9e8f582903993db87b3f4773c` / 9258 |
| `plugins/pipeline-core/lib/human-guard-override.mjs` | `specs/sprint-alfred-epic/signed-package/tranche-2/lib/human-guard-override.mjs` | `3fb4bf776feb1c3bb4d651019f6c1132be0e8744` | `19d225ec93f93e47ba0d4e07e6228804e84303aa48a0aa5327f1756739b7a734` / 244117 | `34aa1bd5a1bd1ed6509cb383c423a05bdd382ce429bb16753a5a01bae9b0e362` / 245178 |

Base = `git show HEAD:plugins/pipeline-core/lib/<name>` at candidate `3211c15ea` (LF). The post-images use the live files' relative imports and work only at their target paths.

## The anchored edits (each anchor occurs exactly once; no other line changes)

`private-boundary.mjs` (3 edits):

1. `import`: the `node:path` import gains `join as joinPath, parse as parsePath, sep as pathSep`; after the `windows-private-state.mjs` import add `import { ensureAgentPipelineRoot } from "./hardened-private-directory.mjs";`.
2. `export`: before `ensurePrivateDirectory`, a new `ensureAgentPipelineSegmentOf(path, options = {})`. It derives the anchor as the directory containing the LAST `agent-pipeline` path component and calls `ensureAgentPipelineRoot(anchor, options)`. No such component, or an anchor that does not exist, returns `null` and touches nothing.
3. `call-site`: the first statement of `ensurePrivateDirectory(path)` is `ensureAgentPipelineSegmentOf(path);`.

`human-guard-override.mjs` (2 edits):

1. `import`: after the `governance-hgo-consumption-source.mjs` import add `import { PrivateBoundaryError, ensureAgentPipelineSegmentOf } from "./private-boundary.mjs";`.
2. `secureDirectory` (live `:659`): at the top of the body a `try` calls `ensureAgentPipelineSegmentOf(path, { platform, assess: assessWindowsPrivatePathFn, harden: hardenWindowsPrivateDirectoryFn })`; a `PrivateBoundaryError` is mapped onto the function's own vocabulary (`PB-WINDOWS-ASSURANCE` to `HGO-DACL`, `PB-ROOT-INSECURE` to `HGO-PERMISSIONS`, anything else to `HGO-STORAGE`); any other error is rethrown. No HGO caller sees a new error class.

## Behaviour changes the ceremony needs to know

- **POSIX.** An existing `agent-pipeline` segment with group/other bits and owned by the current user is repaired to `0o700` with one `PB-ROOT-REPAIRED` warning; a segment owned by someone else is refused (`PB-ROOT-INSECURE`, `HGO-PERMISSIONS` in the HGO helper). The `PB-ROOT-MODE-UNRECORDED` acceptance (DrvFs-style `0o777`) now also applies to the segment for these two helpers.
- **win32.** The segment is hardened or repaired by the entry point; children keep the old per-component harden/assess.
- **Import cycle.** `private-boundary.mjs` now imports `hardened-private-directory.mjs`, which already imports `private-boundary.mjs`. Believed safe (the latter uses `PrivateBoundaryError` and `assureWindowsPrivateDirectories` only inside function bodies; `ensureAgentPipelineRoot` is a hoisted declaration). Both load orders were exercised by the captures below only in the order the tests import them; the ceremony's live re-run is the proof for the reverse order.

## Verification (Elephant-run; the post-images are served under the live URLs by a git-ignored ESM load hook, so each capture must carry both `WINAPS6-REDIRECT-FIRED` lines)

| Capture | Command (wrapped in `capture-evidence.mjs`) | Result |
|---|---|---|
| `evidence/WIN-AP-S6-F-20261009/wsl-after.txt` | `node scratch/dispatch-wip/WIN-AP-S6-F/run-after.mjs all` (WSL) | `agent-pipeline-root-creation.test.mjs`: 11 / 11 pass, exit 0, FIRED. `human-guard-override.test.mjs --test-name-pattern 'secureDirectory\|native Windows private-state assurance'`: 3 / 3 pass, exit 0, FIRED. The middle entry `lib/private-boundary.test.mjs` is `ERR_MODULE_NOT_FOUND` (that file does not exist; a runner preset error, not a test result). |
| `evidence/WIN-AP-S6-F-20261009/native-after.txt` | same, native win32 | root-creation 9 / 11: only pins (b) `recordBootstrapPreflightReceipt` and (c) denial-telemetry red, both pre-existing (they need the S4 `bootstrap-receipt`/`denial-telemetry` post-images, not installed live); the target pins (f)(g)(h) for both helpers are green. secureDirectory chunk 3 / 3, exit 0, FIRED. Same non-existent `private-boundary.test.mjs` entry. |
| `evidence/WIN-AP-S6-F2-20261009/wsl-callers-hgo.txt` | `node scratch/dispatch-wip/WIN-AP-S6-F/run-callers.mjs plugins/pipeline-core/lib/human-guard-override.test.mjs` (WSL) | whole file through the redirect: 172 tests, 171 pass, 0 fail, 1 skipped, exit 0, both redirects FIRED. |

`release-version-plan.test.mjs` does not reach the helpers (redirect NOT-FIRED, 26 / 26 pass; `evidence/WIN-AP-S6-F2-20261009/wsl-callers-rvp.txt`): noted, not a caller finding, not re-run.

`node harness/scripts/check-consumer-safe-paths.mjs` is run before the commit; its result is in the dispatch record.

## Installing

Not performed by this dispatch. The ceremony installs each post-image at its target above and re-runs the captures with the live modules (no `--import`); the expected result is the `wsl-after.txt` shape. Forbidden and untouched here: live `lib/`, tests, the tranche README.
