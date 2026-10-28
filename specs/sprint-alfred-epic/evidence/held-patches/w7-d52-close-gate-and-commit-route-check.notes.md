# D52 close gate and commit-route check (c1): CHECKPOINT notes, no patch yet

Slice W7-D52-CLOSE-GATE-AND-COMMIT-ROUTE-CHECK-C1-20261027, candidate a79923a9df3e72cf934b858e8f5b4781555d72d1. Targeted delivery: **blocked at the budget checkpoint** (RED recorded, production edit not yet made, no patch). Batch Critic, Full Verify and PO acceptance stay parent-owned and pending.

Proposed commit message (when finished): `fix(close): the close coordinator refuses while a Critic slice of the feature course is still scheduled (D52)`

## Recon, re-verified against the repository
- Clause A (onboarding checks the commit route early): `plugins/pipeline-core/scripts/pipeline-start-preflight.test.mjs` pins `HOOK-SNAPSHOT-STALE` / `installed-but-stale` only for the **pre-push** hook (around lines 902-914). The `pre-commit-hook` and `commit-msg-hook` checks appear only as clone-provisioning check ids with status `install` / `current` (lines 169-170, 221-230, 290, 808-828, status `hook-provisioning-required`). No case found that pins a **stale pre-commit or commit-msg snapshot** as a start-blocking status (`hook-refresh-required`). The production side was not read by me in this run, so whether `scripts/pipeline-start-preflight.mjs` already emits it is unverified. Missing pin to name: "stale pre-commit/commit-msg snapshot yields a start-blocking status with a mutating nextAction". The preflight test file is outside the slice; nothing edited.
- Clause B: `plugins/pipeline-core/scripts/close-coordinator.mjs` `assertCourseCriticEvidence` (lines ~405-437) has no check on slice `tier`/`state`; it only gates dispatch records that require a Critic (`CLOSE-CRITIC-EVIDENCE-MISSING`) and authorship. RED confirms: a course with a scheduled `tier: critic` slice plans successfully.

## RED (unchanged clone at the candidate)
New pin file in the clone only: `plugins/pipeline-core/lib/pins/close-coordinator-refuses-a-scheduled-critic-slice.test.mjs` (needs Verify-suite registration if it is delivered; the fixture mirrors `close-coordinator-refuses-a-required-critic-without-evidence.test.mjs`).
Run: `node --test <pin>` in the clone, log `scratch/agent-out/w7cc/red.close-coordinator-refuses-a-scheduled-critic-slice.test.mjs.log` (untracked). Result: 6 tests, pass 2, fail 4.
- pass: fixture course is a valid queue; (c) a Critic slice with a terminal record plans (control).
- RED as intended: (a) scheduled Critic slice, no record, planned (status 0, expected refusal 2); (b) Critic slice with an in-progress record, planned; (e) apply step re-check, not refused.
- RED because of a **fixture defect, to fix next**: (d) cancelled Critic slice returned `CLOSE-DELIVERY-COURSE-INVALID` (the queue validator rejects my cancelled critic row; likely needs the cancelled slice shaped like a valid row, for example a `cancelClass`/`tierReason` combination or no dependency edge). Do not weaken (a)/(b)/(e).

## Planned implementation (not made)
In the clone's `close-coordinator.mjs`, directly after the `requiredTaskIds` refusal in `assertCourseCriticEvidence`: for a legacy `pipeline.slice-queue.v1` course, collect validated slices with `tier === "critic"` and `state === "ready"` that have no terminal dispatch record (`evidence/dispatch-record-<id>.json` read via `readJsonFile`, `isTerminalOutcome` from `../lib/dispatch-record.mjs`); if any, `fail("CLOSE-CRITIC-SLICE-SCHEDULED", ...)` naming the ids and both repairs (run the Critic review and record its evidence, or cancel the critic slice through the sanctioned slice-queue route). Zero mutation (the check runs in the plan and the apply re-check, like the existing gate). Item-owned (v2) courses are left alone: their done state comes from integration readiness, not records. Known gap: hand-back terminal records are treated as done (`isHandBack` is not exported).

## Not done
- Production edit, GREEN run, whole `close-coordinator.test.mjs` baseline-vs-patched in clone and clone2 (clone2 exists, unchanged), patch, apply check, cleanup of both clones (`scratch/agent-out/w7cc/clone`, `clone2` still present; `node scratch/agent-out/w7cc/driver.mjs cleanup`).
- Clause A has no delivered pin (see above).
- Independent Critic review: parent-owned batch gate.

## Operator flow (once a patch exists)
Apply the diff, `git add -u` with a path limit (plus the new pin file), `--no-verify` commit, stamp, install. Protected-path classification: none of the touched files (close-coordinator.mjs, the new pin) match TP-1..TP-13.
