# Spec requirement-level coverage, AC-26..AC-37 (RECON-3B, 2026-10-07)

PARTIAL RUN: the dispatch tool budget (35 counted calls) ended before every family was searched. Rows marked
`unsearched` were NOT searched in this run; they are not evidence of absence. Rows marked `none (inh)` rest on the
RECON-2A finding (`spec-ac-reconciliation-2026-10-07.md`) and were not re-grepped here. No test was executed.
Evidence is `git grep` by requirement id or distinctive term at HEAD of `feat/sprint-alfred`. Paths are repo-relative;
`hooks/` = `plugins/pipeline-core/hooks/`, `scripts/` = `plugins/pipeline-core/scripts/`, `lib/` = `plugins/pipeline-core/lib/`.

Classes: `covered` (test or code cited) · `partial` · `none` (searched, nothing found) · `unsearched`.

## R1 (AC-26)

| Requirement | Gist | Class | Note |
|---|---|---|---|
| R1-1 | Catalogue enumerates emitted argv; course outputs writable | partial | `hooks/guard-lifecycle-ready.test.mjs:3998` emitted argv; catalogue slice not authored |
| R1-2 | Design course up to present-plan admitted, zero overrides | none | No such walk fixture located |
| R1-3 | Preflight admitted in all spellings; same basename refused | partial | `hooks/guard-lifecycle-ready.test.mjs:4912` basename cases; spellings unconfirmed |
| R1-4 | scratch/ script in awaiting-approval refused, typed | none | No titled test found |
| R1-5 | `git stash list` admitted, `stash pop` refused | partial | `hooks/guard-lifecycle-ready.test.mjs:6675` pop only; list not seen |
| R1-6 | Onboarding commits scaffold; later production commit refused | none | Only unrelated scaffold-commit mentions found |
| R1-7 | F6 repair classifying new ADR draft in draft | partial | `hooks/guard-lifecycle-ready.test.mjs:2814` checker admission only |
| R1-8 | Test fails on undocumented preflight status | covered | `hooks/setup-check.test.mjs:408` EVERY preflight status |
| R1-9 | Preflight and guard share readiness intent | none | No K7-3 fixture located |

## R2 (AC-27)

| Requirement | Gist | Class | Note |
|---|---|---|---|
| R2-1 | Case-mismatched roots: in-root Read/Grep/Glob/head admitted | covered | `hooks/guard-lifecycle-ready.test.mjs:11427`; code `lib/guard/read-scope.mjs:483` |
| R2-2 | UNC exact-file Read admitted; WSL spellings refused | partial | `hooks/guard-lifecycle-ready.test.mjs:11591`; no wsl credential-root test |
| R2-3 | Directory Grep, glob, rg shapes admitted in root | none | No titled test found |
| R2-4 | `git show HEAD:docs/state.md \| head` admitted | none | No such fixture found |
| R2-5 | Refusal-text audit; no APB code for role parse | none | `APB-DISPATCH-INVALID` exists in lib; no audit test |

## R3 (AC-28, AC-36)

| Requirement | Gist | Class | Note |
|---|---|---|---|
| R3-1 | Ceremony inventory scenarios A-D per runner and mode | none | RECON-2A also found no inventory test |
| R3-2 | Fresh-clone checkpoint push refused unsigned, admitted signed | partial | `scripts/pre-push-hook-install.test.mjs:243` block case; signed/chat cases unconfirmed |
| R3-3 | Armed capability survives unrelated drift | none | No `HGO-DRIFT` hit in override script or test |
| R3-4 | Unborn-HEAD signing intent builds and verifies | none | Only unrelated unborn cases |
| R3-5 | PO commands: no continuation, 100 columns | none | `238d9b5de` single-line commit-flow copy is related only |
| R3-6 | Signed routing override survives migration-v3 activate | none | Not located |
| R3-7 | Release/main needs full chain; checkpoint does not | partial | `scripts/pre-push-hook-install.test.mjs:570` checkpoint bypass |
| R3-8 | Signing window 60 min default, 5-120 range | none | No window constant or test found |
| R3-9 | Chat confirmation commit-bound, labelled | partial | `hooks/antigravity-pretool-guard.test.mjs:809` chat attribution |
| R3-10 | standing-approved checkpoint push without approval | partial | `scripts/pre-push-hook-install.test.mjs:266` and `:570` |

## R4 (AC-29, AC-35)

| Requirement | Gist | Class | Note |
|---|---|---|---|
| R4-1 | Role-route preflight fixtures per runner | none (inh) | RECON-2A: no `fallback-self-dispatch` code |
| R4-2 | Fallback Advisor labelled; Critic subagent evidence rules | none (inh) | Same RECON-2A finding |
| R4-3 | Antigravity readiness and Critic via observed children | unsearched | |
| R4-4 | Native-Windows budget-counted Goldfish; built-in types | unsearched | |
| R4-5 | Codex unmarked dispatch typed pre-dispatch finding | unsearched | |
| R4-6 | Claude SessionStart names no other runner | unsearched | |
| R4-7 | Advisor failure stderr; export re-run byte-identical | unsearched | |
| R4-8 | Windows sweep test fails on unguarded POSIX checks | unsearched | |
| R4-9 | Windows Claude CLI under `.local/bin` resolved | unsearched | |
| R4-10 | CLI schema carries no `$schema`/`$id` | unsearched | |
| R4-11 | Model-family fixtures per runner | partial (inh) | `model-family-*.test.mjs` per RECON-2A, not re-checked |
| R4-12 | Hook-measured Critic/plan-verifier start per runner | none (inh) | RECON-2A: hook measurement missing |

## R5 (AC-30)

| Requirement | Gist | Class | Note |
|---|---|---|---|
| R5-1 | Doc/emitter consistency; small-project course | unsearched | |
| R5-2 | Printed commit examples pass commit guard | unsearched | |
| R5-3 | 30 KB answers file accepted on Windows | none (inh) | RECON-2A: no `--answers-file` code |
| R5-4 | Presentation refused without Verify contract | unsearched | |
| R5-5 | Short form carries EL-16 qualifiers | unsearched | |
| R5-6 | Design revision needs zero PO interactions | unsearched | |
| R5-7 | Private first name refused; role path preflight | unsearched | |
| R5-8 | Course-run fixtures (run-v2, runner argv, resume) | unsearched | |

## R6 (AC-31)

| Requirement | Gist | Class | Note |
|---|---|---|---|
| R6-1 | Multi-segment transcripts readable per runner | partial (inh) | `runner-transcript-recovery.test.mjs` per RECON-2A |
| R6-2 | Continuity digest drift reported by inspect | none (inh) | RECON-2A: no continuity-digest code |
| R6-3 | Unclassified docs commit refused | unsearched | |
| R6-4 | Audit index with missing gate | none (inh) | RECON-2A: no audit-index code |
| R6-5 | Host user path refused at pre-commit | unsearched | |

## R7 (AC-37)

| Requirement | Gist | Class | Note |
|---|---|---|---|
| R7-1a | NUL-rejecting git stub; ratchet scan | covered | `lib/worktree-lifecycle.test.mjs:1304`; `lib/git-null-device.mjs:3` |
| R7-1b | Discovery failure envelope with cause, diagnose-git | none | (3E) `diagnose-git` term has no hit in plugins/harness/schemas/policies |
| R7-1c | Not-ready preflight admits diagnostics | none | (3E) No titled test or id commit found |
| R7-2a | Ended-session descriptors archived, bytes preserved | none | (3E) No id commit; no ended-session term hit |
| R7-2b | Null/absent owner descriptors take attended route | none | (3E) No id commit or test found |
| R7-2c | Preflight lists orphans; nextAction idempotent | partial | `scripts/toolchain-preflight.mjs:323` mentions R7-2 finding only |
| R7-3a | present-plan refuses ignored/untracked/modified bound path | partial | `991cb703f` refuses git-ignored bound paths |
| R7-3b | Producer writes tracked package; fresh-clone digests verify | covered | `scripts/design-course-session.test.mjs:251` |
| R7-3c | Close check lists bound paths | none | (3E) No id commit; `991cb703f` is the refuse side only (R7-3a) |
| R7-3d | Ratchet over State fields naming bound paths | none | (3E) No id commit or ratchet test found |
| R7-4a | Backlog/docs/scratch writes admitted every state | none | (3E) No id commit or titled test found |
| R7-4b | State-only commit admitted via writer receipt | none | (3E) No id commit or titled test found |
| R7-5a | Rebind approval reaches verified, zero signatures | none | (3E) Only unrelated PO-REBIND authority fixtures seen; no design-rebind test |
| R7-5b | Changed PRD/Spec yields digest-set-changed | none | (3E) `digest-set-changed` has no hit |
| R7-5c | Lost artifact yields DWP-REBIND-ARTIFACT-LOST | none | (3E) `DWP-REBIND-ARTIFACT-LOST` has no hit |
| R7-6a | Machine key directory used when repo value unset | covered | `scripts/po-human-approval.test.mjs:4527` |
| R7-6b | openssl resolution and capability | covered | `scripts/po-human-approval.test.mjs:4558` |
| R7-6c | Failing openssl stub yields typed result | covered | `scripts/po-human-approval.test.mjs:4596` |
| R7-6d | Readiness check runs before signing command | covered | `scripts/po-human-approval.test.mjs:4624`; `35d876a11` |
| R7-6e | No Pipeline-chosen signing executable (static scan) | covered | `scripts/po-human-approval.test.mjs:4642` |
| R7-6f | Key directory checks, no private-key read | covered | `scripts/po-human-approval.test.mjs:4765` |
| R7-7a | Finding matrix ok/repairable/attended | covered | `scripts/toolchain-preflight.test.mjs:511` |
| R7-7b | Known-bad git version yields attended finding | covered | `scripts/toolchain-preflight.test.mjs:548` |
| R7-7c | Same report at bootstrap and prepare-for-signature | covered | `scripts/toolchain-preflight.test.mjs:571`; `67f0b4cd4` |
| R7-7d | Report runs from installed copy, no source path | partial | `scripts/toolchain-preflight.test.mjs:391` label only |
| R7-7e | Missing pre-push hook repairable; foreign attended | covered | `scripts/toolchain-preflight.test.mjs:583` |
| R7-8a | Both shell lanes give same refusal outcome | none | (3E) No id commit or lane-parity test found |
| R7-8b | continuity-cas same recovery from PowerShell | partial | (3E) `harness/scripts/pipeline-state.test.mjs:1990` continuity-cas cases exist; PowerShell lane not seen |
| R7-8c | Unparseable PowerShell carries typed retry action | none | (3E) No id commit or titled test found |
| R7-9a | Device-switch walk, zero PO acts | none | (3E) `device-switch` has no hit |
| R7-9b | Static check on signature classes and T-map | none | (3E) No id commit or static check found |
| R7-9c | T18 replay: preparation scripts admitted in draft | none | (3E) No id commit or replay fixture found |
| R7-10a | Earlier-revision registration superseded without override | none | (3E) No supersede-registration term hit |
| R7-10b | Same-digest unobserved owner superseded | none | (3E) Same |
| R7-10c | Refusals each name a route, zero mutation | none | (3E) Same |
| R7-10d | Supersede action idempotent, lane-equal | none | (3E) Same |
| R7-11a | N concurrent calls admitted, counter exact | covered | `hooks/guard-dispatch-budget.test.mjs:968`, `:1225` |
| R7-11b | Dead-owner lock recovered, malformed fail-closed | covered | `hooks/guard-dispatch-budget.test.mjs:1239` |
| R7-11c | Per-agent counters isolated | covered | `hooks/guard-dispatch-budget.test.mjs:1274` |
| R7-11d | Live lock beyond bound yields counter-lock-timeout | covered | `hooks/guard-dispatch-budget.test.mjs:1302`; code `hooks/guard-dispatch-budget.mjs:114` |
| R7-11e | First Write of subagent admitted via SubagentStart receipt | partial | (3E) `lib/native-goldfish-host-state.mjs:162` binds SubagentStart (Codex); no first-Write admission test seen; Protected `hooks.json` slice not confirmed |

## RV (AC-33)

| Requirement | Gist | Class | Note |
|---|---|---|---|
| RV-1 | Owner states unavailable/unobserved never not-live | none (inh) | RECON-2A: no RV-labelled test |
| RV-2 | CAS-conflict classification fails safe | none (inh) | Same |
| RV-3 | Detached proof binds receipt bytes or absence | none (inh) | Same |
| RV-4 | Receipt replay/archive dispositions | none (inh) | Same |
| RV-5 | Archive readback preserves bytes, grants no authority | none (inh) | Same |
| RV-6 | State/activeFeature unchanged across archival | none (inh) | Same |
| RV-7 | Refusal fixtures and CI registration check | none (inh) | Same |
| RV-8 | External CLI verifies signer anchor and signature | none (inh) | RECON-2A: no external-route code |
| RV-9 | CLI applies exactly signed bounded paths | none (inh) | Same |
| RV-10 | Crash at each journal step resumes forward | none (inh) | Same |
| RV-11 | Unknown cases return typed attended prerequisite | none (inh) | Same |

## Counts per family (101 requirement rows)

| Family | Rows | covered | partial | none | unsearched |
|---|---|---|---|---|---|
| R1 | 9 | 1 | 4 | 4 | 0 |
| R2 | 5 | 1 | 1 | 3 | 0 |
| R3 | 10 | 0 | 4 | 6 | 0 |
| R4 | 12 | 0 | 1 | 3 | 8 |
| R5 | 8 | 0 | 0 | 1 | 7 |
| R6 | 5 | 0 | 1 | 2 | 2 |
| R7 (3E) | 41 | 16 | 5 | 20 | 0 |
| RV | 11 | 0 | 0 | 11 | 0 |
| Total (3E: R7 delta applied to prior totals) | 101 | 18 | 16 | 50 | 17 |

## Class `none` by family

- R1: R1-2, R1-4, R1-6, R1-9.
- R2: R2-3, R2-4, R2-5.
- R3: R3-1, R3-3, R3-4, R3-5, R3-6, R3-8.
- R4: R4-1, R4-2, R4-12 (all inherited from RECON-2A).
- R5: R5-3 (inherited).
- R6: R6-2, R6-4 (inherited).
- R7: R7-1b, R7-1c, R7-2a, R7-2b, R7-3c, R7-3d, R7-4a, R7-4b, R7-5a, R7-5b, R7-5c, R7-8a, R7-8c, R7-9a, R7-9b, R7-9c,
  R7-10a, R7-10b, R7-10c, R7-10d (3E; one commit-message grep plus term greps, may hide tests under other names).
- RV: RV-1..RV-11 (inherited from RECON-2A, not re-grepped).

## Not reached (follow-up dispatch needed)

R4-3..R4-10; R5-1, R5-2, R5-4..R5-8; R6-3, R6-5 (R7 rows searched in 3E). The `none` rows of R3 and R1 rest on one title-pattern grep each and
may hide tests under other names.
