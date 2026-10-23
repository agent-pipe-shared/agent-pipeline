# Sitting preparation index, 2026-10-23

Single entry point for a session that has to find what was prepared for the operator sitting of 2026-10-23 (about 15:00) and what comes after. `docs/state.md` points here. All paths are repository-relative. Status words follow the repository rule: "implementation complete" is not "PO-accepted".

## 1. Start here

| Need | File |
|---|---|
| Apply the sitting (operator) | `specs/sprint-alfred-epic/evidence/sitting/README.md`, then `runbook.md` in the same folder |
| What every rehearsal found | `specs/sprint-alfred-epic/evidence/sitting/notes/k133-results.md` and `k133-runbook-corrections.md` (rehearsal 3, merged into the runbook), `rehearsal-notes.md` (rehearsal 2) |
| PO decisions of the day | `specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md` (batches 1 to 12) |
| Open PO topics | `specs/sprint-alfred-epic/plans/po-list-afk-2026-10-22.md` (rows 1 to 48; presented only on request) |
| Index and work packages | `specs/sprint-alfred-epic/plans/index-75-plan-2026-10-23.md` |
| Older ceremony table | `specs/sprint-alfred-epic/plans/po-ceremonies-pending.md` (superseded by the runbook for ordering) |
| Held patches (older form) | `specs/sprint-alfred-epic/evidence/held-patches/` |

## 2. What the sitting contains

Runbook steps 01 to 34, 36 to 39, 39b, 40 to 46, 46b and 47 (step 35, the Critic preimage re-pin C28, is deferred to just before the stamp by PO decision). Step 47 generates the Reader-input mirrors with `scripts/sync-reader-inputs.mjs`; it is the last source-affecting step. Protected commits use `git commit --no-verify -F <message file> -- <paths>`; the commit message of each step is in `specs/sprint-alfred-epic/evidence/sitting/commit-messages/`. The sheet also carries the wording of the two `CLAUDE.md` lines the operator adds by hand.

Packages inside the steps (task id, notes): K92 GS-1 signature route, K93/K104 fan-out guard, K95/K106 recon gate, K96/K105 credential target, K97 git-show lane, K98 refusal texts, K103 chat approve-push repair, K118 registration of seven test files, K120 `NODE_TEST_CONTEXT` fix, K125 architecture capability and governance class, K127 source-checkout identity exemption (replaces the K112 hold patches), K128 fallback record on the review receipt, K132/K133 mirrors and final ratchet. Notes per package: `specs/sprint-alfred-epic/evidence/sitting/notes/`.

## 3. Reader course (documentation, 2+1 protocol)

- Rounds: `20261023a` and `20261023b`; reports in `specs/sprint-alfred-epic/evidence/reader-review/phase-one/` and `phase-two/`.
- Working dispositions (not the closed schema): `specs/sprint-alfred-epic/plans/reader-round-20261023a-working-disposition.json` and `reader-round-20261023b-working-disposition.json`. Correction batches 1 and 2 are on `feat/sprint-alfred`. No third round (PO decision, batch 12).
- Still to do after the sitting: the terminal v2 record, per-round terminal dispositions and the owner decision (`by: APS`, supplied by the PO as a standing value for this repository). Drafts are prepared by task K137 under `scratch/agent-out/K137-draft/` on the machine that ran it (see section 5).
- Open Reader items: 8 (global route documented by K129/K131, Antigravity run verifies the scope), 41 (governance class, sitting step 41), 64 (inventory capability, sitting step 40).

## 4. After the sitting (agent work, in order)

1. `node scripts/post-sitting-checks.mjs` (task K134, if imported; otherwise the check list in the sitting README) and record the counts.
2. Restate the four stale `sites` counts of `harness/scripts/check-verify-case-completion.test.mjs` and the registration fixture (QG-04, PO decision batch 12, row 39).
3. Serial count pass: `scripts/sitting-count-pass.mjs --list specs/sprint-alfred-epic/plans/count-pass-suites.json`; then the delivery remeasure with `scripts/delivery-remeasure-inputs.mjs` and the reader prompt that carries the batch-10 rulings.
4. Reader terminal record (section 3).
5. Only on the PO's call: dev build stamp and install (`scripts/stamp-candidate.mjs`), Full Verify, Critic batch, C28 re-pin, push. Memory rule: no stamp, install, push, Full Verify or Critic batch without an explicit PO call.
6. Native host runs by the PO (Windows, Antigravity S1 to S6, Greenfield on all three runners).

## 5. Preparation tasks that were still running when this index was written

Rows marked IMPORTED are in the repository. For the others the results are NOT yet in the repository: they sit in build clones under `scratch/clones/` and in `scratch/agent-out/` of the machine that ran them (both untracked). A later session on that machine imports them with `git fetch scratch/clones/<name> HEAD` and `git cherry-pick <base>..FETCH_HEAD`; on another machine they do not exist and must be re-run.

| Task | Result | Clone / output |
|---|---|---|
| K134 | IMPORTED: `scripts/post-sitting-checks.mjs` and the extended count-pass suite list (129 entries; list of suites that are red before the sitting by design in `count-pass-suites.md`) | notes in `scratch/agent-out/K134-notes.md` |
| K135 | IMPORTED: release notes draft `specs/sprint-alfred-epic/plans/release-notes-0.7.0-draft.md` (draft, not published, not PO-accepted) | notes in `scratch/agent-out/K135-notes.md` |
| K136 | IMPORTED: checklists for the native host runs `specs/sprint-alfred-epic/plans/host-run-checklists-2026-10-23.md` (eight gaps marked "command not found", PO list row 50) | notes in `scratch/agent-out/K136-notes.md` |
| K139 | MP-04 readback (`CLAUDE_CODE_SUBAGENT_MODEL` set/unset, never the value) in the Elephant preflight; PO decision batch 7 row 8, never built before; becomes runbook step 48 if its diff verifies on the post-sitting state | `scratch/clones/k139`, `scratch/agent-out/K139-notes.md` |
| K137 | Reader closure drafts (dispositions, owner decision, record skeleton, runbook) | `scratch/agent-out/K137-draft/`, `scratch/agent-out/K137-notes.md`; nothing committed by design |
| K138 | Critic batch plan `specs/sprint-alfred-epic/plans/critic-batch-plan-2026-10-23.md` (fields only, nothing dispatched) | `scratch/clones/k138`, `scratch/agent-out/K138-notes.md` |

Import rule: these files do not touch the runbook's targets, so they may be imported before or after the sitting; do not import anything that edits a file named in `specs/sprint-alfred-epic/evidence/sitting/runbook.md` before the sitting is done.

## 6. Known open points (details in the PO list)

Rows 45 to 48 of the PO list: unowned `scripts/*.mjs` findings of the architecture boundary checker (the checker stays at exit 1), missing dispatch-record files of decision-round Goldfish commits, the pre-existing line-bound overshoot of the model-family store test, and the hook-less rehearsal method. Backlog state check: only the known-accepted DRIFT lines remain.
