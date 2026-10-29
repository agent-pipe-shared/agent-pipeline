# w7-gmw-kernel-list-covers-new-critic-imports-s1 (held patch)

Base: candidate 0f00cbba3533c064b7c150f25263932a92f41970, no stacking. Patch: `w7-gmw-kernel-list-covers-new-critic-imports-s1.patch` (3 files, 10 insertions, 0 deletions).

## Cause

GMWKC01 was red on the candidate (10 passed, 1 failed, 5 violations):
- `scripts/guard-human-override.mjs` has two dynamic-import call sites (`./po-human-approval.mjs` at the key-directory resolver, `./toolchain-preflight.mjs` at the readiness report); the test table `DYNAMIC_IMPORT_EDGES` declared only the second.
- `critic-correction-input-bindings.mjs`, `critic-required-guardrails.mjs` (imported twice: preflight and diagnostic producer), `critic-packet-release.mjs` were imported by kernel files but missing from `NEVER_LIFTABLE_KERNEL_PATHS`.

## Changes (all in the patch; the repository tree was not edited)

- `plugins/pipeline-core/lib/guard-maintenance-window.mjs`: five lines after `session-critic-finalizer.mjs`: a two-line comment and the three entries (alphabetical inside the group). No count constant exists; `PLUGIN_KERNEL_SUFFIXES`/`PROJECT_KERNEL_PATHS` derive from the array (GMWKC02 green).
- `plugins/pipeline-core/lib/guard-maintenance-window-kernel-closure.test.mjs`: `DYNAMIC_IMPORT_EDGES["scripts/guard-human-override.mjs"]` now `["./po-human-approval.mjs", "./toolchain-preflight.mjs"]` (source order) plus a comment. `po-human-approval.mjs` was already a kernel entry, so no further list entry was needed. No assertion changed.
- `docs/guard-maintenance-window-threat-model.md`: one sentence naming the three new modules (GMWKC03).

## Evidence (logs in scratch/agent-out/w7dq, removed at cleanup)

- RED (clone at candidate, existing GMWKC01 is the criterion case): 10 passed, 1 failed, 5 violations as above. Baseline clone2 identical.
- GREEN (patched clone): `guard-maintenance-window-kernel-closure: 11 passed, 0 failed`.
- Revert proof: removing only `critic-packet-release.mjs` gave `10 passed, 1 failed`, exactly one violation (`session-critic-finalizer.mjs imports ../lib/critic-packet-release.mjs`); entry restored and the file re-run 11/11.
- Patched clone: `guard-gate-strength.test.mjs` 41/0, `guard-maintenance-window.test.mjs` 63/0 (one SKIP, single volume), `generate-architecture-overview.mjs` "Architecture overview current" (run without `--check`; no file changed).
- Baseline clone2: gate-strength 41/0, window 63/0; kernel closure red as above. Failing-name sets: baseline {GMWKC01}, patched {}.
- Apply check: `git apply --check` of the patch in clone2 at the candidate, exit 0.

## Not done

- The backlog item `2026-09-12-gmw-and-pre-commit-disagree-on-never-liftable-kernel-paths` describes a pre-commit mirror. A listing search over hooks/scripts/docs showed no other enumeration of the array except prose references; I did not read `pre-commit-hook-install.mjs` for a hard-coded copy, so mirror status is not verified. If a mirror exists it needs the same three entries and is outside this slice.
- `--check` form of the architecture overview was not used (driver ran the script bare; result "current").
- Independent Critic review stays a parent-owned batch gate.

## Protected-path classification

`guard-maintenance-window.mjs`, its closure test and the threat-model doc are protected kernel paths; the PO applies this patch under a Guard Maintenance Window, not an agent.

## Proposed commit message

fix(gmw): list the Critic preflight, guardrail and packet release modules as never-liftable kernel paths and correct the dynamic import table

## Operator flow

Apply the diff (`git apply`), `git add -u` limited to the three paths, commit with `--no-verify`, stamp, install.
