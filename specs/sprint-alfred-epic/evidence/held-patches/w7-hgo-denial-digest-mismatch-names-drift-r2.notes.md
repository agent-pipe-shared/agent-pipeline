# Held patch r2: an armed override whose denial digests drifted is refused as HGO-DRIFT instead of skipped silently (production, protected kernel path)

State: HELD PATCH. Nothing applied, reviewed or accepted. Base is the candidate commit 0f90ea53ddd4f60ea1d8ae2648e0150e7e31de9f (the r1 denial binding fix is already part of it). Written by a Goldfish that reached its budget checkpoint; independent Critic review stays a parent-owned batch gate. Backlog item: `backlog/items/2026-10-29-a-one-off-guard-warning-disarms-an-armed-override.md` (second wish). Recon note re-verified: `bindingDenialReason`/`denialDigests` are used on both the record and the consume side; no contradiction found.

## Cause

`consumeHumanGuardOverride` in `plugins/pipeline-core/lib/human-guard-override.mjs` skipped an armed capability whose `canonical(capability.denials)` differed from `canonical(currentDenialDigests)` in the first scan filter, before the lock, audit and `examineCapability` drift checks. A genuine change of the denial text therefore fell through to a plain unarmed-looking denial and burned the signature with no diagnostic.

## Existing shape of a drift refusal

`examineCapability` already computes `driftChecks` including a `denials` entry. A drifted, non-expired match is audited as `{type:"rejected", code:"HGO-DRIFT", driftedChecks:[...]}`, sets `driftReplanRequired`, is not consumed, and the function returns `{status:"replan", code:"HGO-DRIFT"}`. No new code is invented.

## Change (in the patch)

- `human-guard-override.mjs`: the denials clause is removed from the first skip filter (now only status and toolName). The denials comparison moves into the existing `toolInputSha256` mismatch branch: a capability for another input is put into `nonMatching` only when its denials equal the current ones, otherwise it is skipped silently exactly as before. A capability matching tool and input with different denials now reaches `examineCapability` and is refused with HGO-DRIFT, `driftedChecks` containing `denials`. Design choice: the request binding (tool, tool input) identifies the intended capability first; denials are compared only afterwards, so an unrelated capability stays invisible (case b).
- `human-guard-override.test.mjs`: helper `armDenialDriftCapability` and three cases (chat mode, PTY seam), placed after AC-160 case (c): (a) replay with different denial text gives HGO-DRIFT, audit `driftedChecks` includes `denials`, the capability stays armed and the original text consumes it; (b) an armed capability for another tool input with different denials gives `{status:"absent"}`; (c) unchanged happy path consumes.

## Measured

- RED against the unchanged clone (whole file): failing names `HGO denial drift (a) ...` and `Q9 (D55) ...`; (b) and (c) pass on the base by design (they guard against over-matching).
- GREEN with the patch (whole file): only `Q9 (D55)` fails (known baseline red, `unavailable` against `initialized`, red in both trees). The printed reporter tail does not show pass counts for the large file; counts were not captured.
- Baseline clone2 (unchanged candidate), whole file: only `Q9 (D55)` fails. Failing-name sets: baseline {Q9}, patched {Q9}, identical.
- `scripts/guard-human-override.test.mjs` (`plugins/pipeline-core/scripts/`): 39 of 39 in the patched clone. `lib/pins/hgo-stale-capability-shadows-current-authorization.test.mjs`: 8 of 8 in the patched clone.
- Revert proof: with the production logic reverted in the clone, (a) is RED again (log `revert.human-guard-override.test.mjs.log`); the edit was then restored and the patch generated from the restored state.
- `generate-architecture-overview.mjs --check` run once from the clone path: "Architecture overview current". Not run separately in clone2.
- Apply check in clone2 at the candidate: run via the driver `check` mode (see the report; result is recorded there).

## Independent re-measurement (Elephant, fresh clone via the verify tool, 2026-10-29)

- Patch applies at the candidate (exit 0). `human-guard-override.test.mjs`: red in both baseline and patched (the known `Q9 (D55)`); `scripts/guard-human-override.test.mjs` exit 0 in both; `check-verify-case-completion.test.mjs` exit 0 in both.
- `hgo-stale-capability-shadows-current-authorization.test.mjs`: exit 1 in the baseline run of that tool and exit 0 patched. The baseline red does NOT reproduce: the same file run on the unpatched installed HEAD passes 8 of 8, so it is a one-off of the fresh environment (the failing frame pointed at the fixture setup of AC8), not an effect of this patch, and it is not counted as fixed by it.
- Not re-run by the Elephant: the revert proof of case (a) (taken from the Goldfish report and its kept log).

## NOT done

- The baseline copies of `guard-human-override.test.mjs` and the pin test were not run in clone2 (the baseline job ran them, but their tails were not read). `check-verify-case-completion.test.mjs` was not run; no VCR01 count change is in the patch. Counts for the large file are not recorded. Clones were not cleaned up.

## Proposed commit message

fix(hgo): refuse an armed override whose denial digests drifted as HGO-DRIFT instead of skipping it silently

## Operator flow

`git apply` the patch, `git add -u -- plugins/pipeline-core/lib/human-guard-override.mjs plugins/pipeline-core/lib/human-guard-override.test.mjs`, `git commit --no-verify`, stamp, install.

## Protected path

`plugins/pipeline-core/lib/human-guard-override.mjs` is in `NEVER_LIFTABLE_KERNEL_PATHS`: the PO applies this patch under a Guard Maintenance Window, not an agent. The test file is not in the protected test-path list (TP-1..TP-13). Independent Critic review remains a parent-owned batch gate.
