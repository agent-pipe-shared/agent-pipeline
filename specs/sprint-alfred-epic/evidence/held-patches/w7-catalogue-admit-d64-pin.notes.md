# W7 catalogue-admit D64 pin (held patch, interim state)

Candidate 22561315c7b793d67070dad6877d86ee5803d01a. Class: FIXTURE (stale pin). Patch: `w7-catalogue-admit-d64-pin.patch` (1 file, +10/-4).

## Cause and evidence
- Red case (recon section C, re-verified at test lines 554-560): `D64 model-role bootstrap admits a host session ... it stays refused here` called `bothRefuse` on `model-role-bootstrap.mjs --repo-root <root> --runner codex`.
- Production site: `plugins/pipeline-core/lib/guard/command-catalogue.mjs` lines 297-304, `sanctionedModelRoleBootstrapArgs`: admits exactly `--repo-root <this root> --runner <codex|claude|antigravity>` plus an optional `--host-session-id <id>`.
- Changing commit: e9e866fec "fix(guard): admit the Antigravity design-phase bootstrap scripts in the shell guard with closed argument grammars" (K152 part 3, greenfield finding G7). It pins the admission in `plugins/pipeline-core/lib/pins/antigravity-design-phase-scripts-refused-in-draft.test.mjs` (K152 case 1, 2). The D64 pin had left it refused as a pending product decision; that decision was made afterwards.
- Decision id: K152 / G7 (no D-numbered register entry found: `rg K152` over docs/state.md and docs/adr found nothing; the governing record is the commit and its pin test).

## Changed lines (test only, clone, 14 diff lines)
The one case now has the admitted form asserted with `bothAdmit`, and keeps refusals via `bothRefuse` for: unknown runner, foreign root, missing runner, extra flag. QG-04 justification comment cites K152/G7 and e9e866fec. Case name changed to `D64 model-role bootstrap admits a host session: admitted by its exact argv (K152/G7, e9e866fec); any other shape stays refused`. No production file touched.

## Results
- RED: the original case fails on the clean candidate (strictEqual true vs false, test line 555), as in the recon. A new RED run was not separate: the stale case itself is the RED.
- Baseline (clone2) and patched (clone) whole-file runs were started in the background (logs `scratch/agent-out/w7d6/base.*.log` and `patched.*.log`) but had NOT completed when the budget checkpoint arrived. Failing-name sets and counts: NOT VERIFIED. The new case GREEN is therefore NOT VERIFIED.
- Apply check in clone2 at the candidate: `git apply --check` exit 0.

## Orchestrator addendum (2026-10-28, read from the logs after the hand-back)
Both runs finished after the agent's budget ended. Baseline (clone2, candidate): 22 tests, 21 pass, 1 fail (the D64 case).
Patched (clone): 22 tests, 22 pass, 0 fail. Failing-name sets: baseline {D64 model-role bootstrap case}, patched {}.
This supersedes the NOT VERIFIED lines in Results above. Open for the PO: no D-numbered register entry governs the
admission (commit e9e866fec, K152/G7, is the only record); confirm that admitting the exact bootstrap argv is intended.

## Not done
Held-in-hand: completed GREEN run, baseline vs patched failing-name comparison, driver cleanup (clones left in `scratch/agent-out/w7d6/`, untracked). Independent Critic review stays a parent-owned batch gate.

## Proposed commit message
test(guard): pin the governed admission of the model-role bootstrap in the catalogue admit file

## Operator flow
Apply the patch with `git apply`, `git add -u -- plugins/pipeline-core/lib/pins/catalogue-admit-prescribed-lifecycle-verbs.test.mjs`, `--no-verify` commit, stamp, install. The test file matched no TP-1..TP-13 pattern (not protected).
