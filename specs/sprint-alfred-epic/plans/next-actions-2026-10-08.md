# Next actions for the session on the new machine (ordered; 2026-10-08)

Read first: `handover-2026-10-08-machine-switch.md` (§1 where things live, §2 resume, §4b working rules). Every item
below names its contract source; build each dispatch from `templates/prompts/goldfish-task.md` /
`templates/prompts/critic-review.md`, never freehand. "Pins" = test-only dispatch committing RED cases (QG-04); "fix"
= implementation dispatch that never edits tests. After a package's full Critic plus one delta, the Elephant
self-verifies. Nothing below is PO-accepted.

## 0. Queue after the 2026-10-08 evening tranche (this section wins over §1–§4 below)

Done since the first version of this file: §1 (tranche signed and committed as `da20519dd`, stamped afterwards), all
of §2, and the pins + fixes of RV-S7, GITCLS and AM in §3 (details: handover §0, execution order wave BF-1/BF-2).
Ordered next steps:

1. **AM-W wiring** — AM-W-F2 was stopped uncommitted (PO decision BG). Re-dispatch it from ruling 57 (execution
   order); pins `45fc5ed3b`, `21aeb82fd` are RED until then. Afterwards remove the `t.todo` of the AM-W behaviour
   cases once seams exist (test-change ruling). Also re-run `codex-critic-host.test.mjs` fully (after AL-F2 it was
   stopped at ~135 cases with some red, not yet classified as pre-existing or new).
2. **Signing-ceremony defects first in the next package** (protected path): backlog
   `2026-10-08-sign-intent-disclosure-scan-blocks-for-minutes.md`, `…-signing-toolchain-readiness.md`,
   `…-machine-wide-key-directory-resolution.md`.
3. Follow-ups found in wave BF: AL-F2 null-`selectionId` paths (role-dispatch-rejected, catch, Gitless) still return
   plain results; RV-S7 `--repo` given as a subdirectory is not widened to the toplevel; GITCLS 8-deep `env -S` chain
   costs ~1 s; AC6-F4 (`/var/tmp` writer on win32); `check-product-capability-inventory` baseline refresh; AL-2 needs
   H9 (todo marker in `critic-lane-fallback.test.mjs`).
4. Then §3 below from "R5-T0" onward (R5, R4, RV-S6/S8–S11, R6, N5/N6/N10/N11, AC-6 promotion reader) and §5/§6.
5. Before any `.gitignore` change: handover §4a (`/evidence/` should be tracked; ADR-0063 amendment first).

## 0b. Final content candidate (PO decisions BH, BI — 2026-10-08 late; wins over §0 where they differ)

Scope: all open Alfred ACs and backlog items; autonomous fan-out; PO items in one list. Ordered:

1. **Wave 1 — device portability and approval binding (candidate blockers):** pins + fix for
   `backlog/items/2026-10-08-approval-verification-demands-head-equals-candidate.md` (replaces the PO's install hotfix);
   R7-3 remainder (bound set incl. private readiness receipt + Advisor course must verify on a fresh clone, spec §22.3
   R7-3b) and R7-5 `rebind-approval` (§22.5); R7-4 (§22.4) write admission with an unverifiable approval → advisory.
2. **Wave 1 parallel:** §0 item 1 (AM-W-F2 wiring, ruling 57; `codex-critic-host.test.mjs` classification), §0 item 3
   follow-ups.
3. **Toil reduction (BI):** guard inventory `../evidence/guard-inventory-2026-10-08.md`; after PO confirmation of the
   KEEP/ADVISORY/REMOVE column, one package for the protected hook/guard changes.
4. **Wave 2:** §3 rows from R5-T0 on (R5, R4, RV-S6/S8–S11, R6, N5/N6/N10/N11, AC-6 promotion reader); open backlog sweep.
5. **Wave 3:** signing-ceremony defects + protected-path fixes in one signed tranche → stamp → host checklist H1–H12 →
   spec-AC reconciliation → final handover with an honest per-AC status.

## 0a. Restore (before any dispatch)

1. ~~Re-stage the ENVDUMP patch~~ — obsolete: the lane landed in the signed package `da20519dd`.
2. `node specs/sprint-alfred-epic/evidence/transfer-2026-10-08/unpack.mjs` restores `scratch/` and `evidence/`
   (redacted copies; `<machine-path>` / `<machine-home>` / `<user>` placeholders mark removed machine identifiers).
3. Run `/pipeline-core:pipeline-start`; the projection must say phase `implementation`, feature `sprint-alfred-epic`.

## 1. Tranche 1 ceremony + stamp (needs the PO; was skipped on 2026-10-08 for time)

1. Make the tree clean, except nothing staged (unstage the ENVDUMP lane again for this step; it is tranche 2).
2. `node scratch/T1/build.mjs` then `node scratch/T1/check.mjs` (restored by the unpack step):
   one-file package, `plugins/pipeline-core/scripts/pipeline-state.mjs` → post-image
   `signed-package/tranche-1/plugins/pipeline-core/scripts/pipeline-state.mjs` (+6/−7, three hunks).
3. PO: `sign-intent --request scratch/T1/t1-request.json`, materializer `apply`, then `authorize-commit`
   (`signed-package/ceremony-route.md` §5.3). Agent: `git add` the one path, commit with
   `Dispatch: quality-package-<intentSha256> (integration)` + `AI-Assisted: true`.
4. Stamp: `plugins/pipeline-core/.claude-plugin/plugin.json` version `0.7.0+claude.<UTC yyyymmddhhmmss>.<8-char package
   commit>` as its own `chore(release): stamp intermediate candidate …` commit (precedent `8551faf35`).

## 2. Fix slices whose pins are already committed (RED today)

| Order | Slice | Pins | Contract | Tier |
|---|---|---|---|---|
| 1 | T1-F2 (ENVDUMP recursion bound, in the staged lane; no commit — tranche 2) | `e87fd5488` (T1-T3) | ruling 51, `../evidence/critic-2026-10-07/envdump-delta.md` | deep |
| 2 | WINMF-F (`directoryPathChain` on drive-letter paths) | `f07c41113` | handover §3 AL row; `model-family-runtime-host.mjs` ~42-55 | implementor |
| 3 | PR-S1-F3 (gh marker across redirections / glued `-c`/`-S`) | `86d9a68de` | ruling 43, `pr-s1-delta.md` | deep |
| 4 | RV-S5-F2 (signed archive destination, registry texts, orphan code) | `6d5804e8c` | ruling 44, `rv-s5-full.md`; ratify or rename the `repositoryRoot` input the pins introduced | deep |
| 5 | AC6-F3 (observed vs requested window) | `417d27630` | ruling 45, `ac6-delta.md` | implementor |
| 6 | AL-F2 (fallback `fallback`/`laneRecord`, `profile-drift` → `CLF-EVIDENCE-STALE`) | `9a317fa56`, `091a6f70e`, `543ad7123` | rulings 35/35a; after WINMF-F | deep |

## 3. Pins then fixes still to write

| Slice | Contract |
|---|---|
| RV-S7-T2 → RV-S7-F3 | ruling 49, `rv-s7-full.md` |
| GITCLS-T2 → GITCLS-F2 | ruling 48, `gitcls-full.md` |
| AM-T4 → AM fixes D2–D4; AM-W wiring (pins first) | ruling 50, `am-delta.md` |
| R5-T0 (re-brief: ratify `codeSet: "answers-file"`, `expectedSha256`, `maxBytes` per execution order) → R5-F1…F7 | `../design/answers-file-2026-10-08.md`, PO decision BC |
| R4-T0 (13 cases) → S1–S5 | `../design/role-route-preflight-r4-2026-10-08.md` incl. §7 S0 findings, PO decision BD |
| RV-S6, RV-S8…S11 | `../design/recovery-availability-rv-2026-10-08.md` slice plan, PO decision BE |
| R6 design note (audit index / continuity digest, AC-31) | `unstarted-ac-contracts-2026-10-07.md` §6 |
| N5/N6/N10/N11 implementation slices | PO decisions AV, AU, AZ, BA and their design notes |
| AC-6 promotion record reader | PO decision BB, `../design/ac6-promotion-approval-2026-10-08.md` |
| Backlog items to file: T1-F2 (refusal by effect), EVID win32 redaction (4 failures), AC-6 Windows store backend (AX), `/evidence/` tracking + ADR-0063 amendment (handover §4a) | — |

## 4. Tranche 2 (one signed package)

ENVDUMP lane (after T1-F2, self-verified) + `harness/verify-suites.json` post-image (`dcf6395cd`; re-check that every
suite it registers is green or carries typed host skips) + any further protected-path fixes ready by then. Ceremony as
in §1, then stamp.

## 5. Open PO questions

N1–N4 (`po-open-questions-2026-10-07-night.md`): the Elephant recommendation is not yet written — read the option texts in
`triage-6-po-options-2026-10-07.md`, add a recommendation, present them.

## 6. Before the candidate is offered

Host checklist H1–H12 (`candidate-host-checklist-2026-10-08.md`), spec-AC reconciliation refresh
(`spec-ac-reconciliation-2026-10-07.md`), final handover with an honest status per AC (implementation complete vs
PO-accepted).
