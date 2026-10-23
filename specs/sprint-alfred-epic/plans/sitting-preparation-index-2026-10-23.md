# Sitting preparation index, 2026-10-23

Single entry point for a session that has to find what was prepared for the operator sitting of 2026-10-23 (about 15:00) and what comes after. `docs/state.md` points here. All paths are repository-relative. Status words follow the repository rule: "implementation complete" is not "PO-accepted".

## 1. Start here

| Need | File |
|---|---|
| Apply the sitting (operator) | `specs/sprint-alfred-epic/evidence/sitting/README.md`, then `runbook.md` in the same folder |
| What every rehearsal found | `specs/sprint-alfred-epic/evidence/sitting/notes/k133-results.md` and `k133-runbook-corrections.md` (rehearsal 3, merged into the runbook), `rehearsal-notes.md` (rehearsal 2) |
| PO decisions of the day | `specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md` (batches 1 to 14) |
| Open PO topics | `specs/sprint-alfred-epic/plans/po-list-afk-2026-10-22.md` (rows 1 to 56; presented only on request) |
| Index and work packages | `specs/sprint-alfred-epic/plans/index-75-plan-2026-10-23.md` |
| Older ceremony table | `specs/sprint-alfred-epic/plans/po-ceremonies-pending.md` (superseded by the runbook for ordering) |
| Held patches (older form) | `specs/sprint-alfred-epic/evidence/held-patches/` |

## 2. What the sitting contains

Runbook steps 01 to 34, 36 to 39, 39b, 40 to 46, 46b, 47, 48a and 48b (48a/48b: K139, MP-04 readback in the preflight; step 35, the Critic preimage re-pin C28, is deferred to just before the stamp by PO decision). Step 47 generates the Reader-input mirrors with `scripts/sync-reader-inputs.mjs`; it is the last source-affecting step. Protected commits use `git commit --no-verify -F <message file> -- <paths>`; the commit message of each step is in `specs/sprint-alfred-epic/evidence/sitting/commit-messages/`. The sheet also carries the wording of the two `CLAUDE.md` lines the operator adds by hand.

Packages inside the steps (task id, notes): K92 GS-1 signature route, K93/K104 fan-out guard, K95/K106 recon gate, K96/K105 credential target, K97 git-show lane, K98 refusal texts, K103 chat approve-push repair, K118 registration of seven test files, K120 `NODE_TEST_CONTEXT` fix, K125 architecture capability and governance class, K127 source-checkout identity exemption (replaces the K112 hold patches), K128 fallback record on the review receipt, K132/K133 mirrors and final ratchet. Notes per package: `specs/sprint-alfred-epic/evidence/sitting/notes/`.

## 3. Reader course (documentation, 2+1 protocol)

- Rounds: `20261023a` and `20261023b`; reports in `specs/sprint-alfred-epic/evidence/reader-review/phase-one/` and `phase-two/`.
- Working dispositions (not the closed schema): `specs/sprint-alfred-epic/plans/reader-round-20261023a-working-disposition.json` and `reader-round-20261023b-working-disposition.json`. Correction batches 1 and 2 are on `feat/sprint-alfred`. PO decision batch 13 (supersedes the batch-12 "no third round"): a third full round runs after the sitting on the final state.
- Order after the sitting (batch 13, PO list row 52): (1) checker diff limiting the v2 check to the current course, older rounds listed as a typed historical course, with pin (built by K140, held in `specs/sprint-alfred-epic/evidence/sitting/post-sitting/` as `k140-checker.diff`, `k140-pin.diff`, messages `k140-msg-*.txt`, notes `k140-notes.md`; cut against the post-sitting state, apply after the sitting, checker first and pin second; K140 found the checker in neither the protected baseline nor the kernel list, so an agent session may commit it, and if the hook refuses it the operator uses `git commit --no-verify -F <message> -- <path>`; pin suite 16 to 21 pass); (2) commit the escalation justification (`afterRound: 2`, reason, digest-bound source) before either reader launches; (3) third complete two-stage round on the final state; (4) final correction batch; (5) terminal v2 record, per-round terminal dispositions and owner decision (`by: APS`, standing value for this repository). Drafts by task K137 under `scratch/agent-out/K137-draft/` on the machine that ran it (see section 5); they need adapting to the third round.
- Owner acceptances already decided: findings 15, 71, 76, 78, 34, 11/50/52, 49 (accepted gap) and b/48 (the pointer already stands at the first Critic-bound occurrence).
- Open Reader items: 8 (global route documented by K129/K131, Antigravity run verifies the scope), 60 (divergent `setup.mjs` wording, Critic batch), 41 (governance class, sitting step 41), 57/64 (inventory capability, sitting step 40); these close against the freshly read state of round three.

## 4. After the sitting (agent work, in order)

1. `node scripts/post-sitting-checks.mjs` (task K134, if imported; otherwise the check list in the sitting README) and record the counts.
2. Restate the four stale `sites` counts of `harness/scripts/check-verify-case-completion.test.mjs` and the registration fixture (QG-04, PO decision batch 12, row 39).
3. Serial count pass: `scripts/sitting-count-pass.mjs --list specs/sprint-alfred-epic/plans/count-pass-suites.json`; then the delivery remeasure with `scripts/delivery-remeasure-inputs.mjs` and the reader prompt that carries the batch-10 rulings.
4. Reader course closure: checker diff, third round, terminal record (section 3, PO list row 52).
5. Only on the PO's call, in the order of decision batch 14: dev build stamp and install by the PO (`scripts/stamp-candidate.mjs`), Critic batch (`plans/critic-batch-plan-2026-10-23.md`; Opus for G1, G4, G5, G6, Sonnet for the other groups, always with the tool-layer `model` parameter), Full Verify, then the C28 re-pin directly before the final stamp and install, push last. Memory rule: no stamp, install, push, Full Verify or Critic batch without an explicit PO call.
6. Native host runs by the PO (Windows, Antigravity S1 to S6, Greenfield on all three runners).

## 5. Preparation tasks that were still running when this index was written

Rows marked IMPORTED are in the repository. For the others the results are NOT yet in the repository: they sit in build clones under `scratch/clones/` and in `scratch/agent-out/` of the machine that ran them (both untracked). A later session on that machine imports them with `git fetch scratch/clones/<name> HEAD` and `git cherry-pick <base>..FETCH_HEAD`; on another machine they do not exist and must be re-run.

| Task | Result | Clone / output |
|---|---|---|
| K134 | IMPORTED: `scripts/post-sitting-checks.mjs` and the extended count-pass suite list (129 entries; list of suites that are red before the sitting by design in `count-pass-suites.md`) | notes in `scratch/agent-out/K134-notes.md` |
| K135 | IMPORTED: release notes draft `specs/sprint-alfred-epic/plans/release-notes-0.7.0-draft.md` (draft, not published, not PO-accepted) | notes in `scratch/agent-out/K135-notes.md` |
| K136 | IMPORTED: checklists for the native host runs `specs/sprint-alfred-epic/plans/host-run-checklists-2026-10-23.md` (eight gaps marked "command not found", PO list row 50) | notes in `scratch/agent-out/K136-notes.md` |
| K139 | HELD AS SITTING STEPS 48a/48b: MP-04 readback (`CLAUDE_CODE_SUBAGENT_MODEL` set/unset, never the value) in the Elephant preflight; diffs verified on the post-sitting state (preflight suite 87 to 92 pass, doc contracts, consumer-safe-paths green), diffs and messages are in the sitting folder, notes in `evidence/sitting/notes/k139-mp04-readback.md` | `scratch/clones/k139` |
| K137 | Reader closure drafts (dispositions, owner decision, record skeleton, runbook); found two structural blockers (older-course reports in the shared phase directories; Reader inputs change after the last reviewed state), resolved by batch 13 | `scratch/agent-out/K137-draft/`, `scratch/agent-out/K137-notes.md`; nothing committed by design |
| K140 | HELD AS POST-SITTING DIFFS (not part of the sitting): Reader terminal checker scope for the older course (batch 13), pin extended with 5 cases, RED then green | `specs/sprint-alfred-epic/evidence/sitting/post-sitting/`, `scratch/clones/k140` |
| K138 | IMPORTED: Critic batch plan `specs/sprint-alfred-epic/plans/critic-batch-plan-2026-10-23.md` (groups G1-G7, G9, G10; fields only, SHAs and model id open, nothing dispatched; PO list row 53) | notes in `scratch/agent-out/K138-notes.md` |

Import rule: these files do not touch the runbook's targets, so they may be imported before or after the sitting; do not import anything that edits a file named in `specs/sprint-alfred-epic/evidence/sitting/runbook.md` before the sitting is done.

## 6. Known open points (details in the PO list)

Rows 45 to 48 of the PO list: unowned `scripts/*.mjs` findings of the architecture boundary checker (the checker stays at exit 1), missing dispatch-record files of decision-round Goldfish commits, the pre-existing line-bound overshoot of the model-family store test, and the hook-less rehearsal method. Backlog state check: only the known-accepted DRIFT lines remain.
