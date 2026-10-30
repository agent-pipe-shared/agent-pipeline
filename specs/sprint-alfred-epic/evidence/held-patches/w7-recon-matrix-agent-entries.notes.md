# Recon: the 46 open agent entries of the delivery matrix (D163 hotfix snapshot), 2026-10-30

Read-only recon, model output. Source: `node scripts/matrix-gaps.mjs specs/sprint-alfred-epic/evidence/delivery-amendment-2026-10-26-d163-hotfix` (exit 0, 46 agent-owned open clauses in 44 rows; row `pipeline.glossover.pf94-...` carries three). Each row's reason/evidence read from `snapshot.json`; the current tree checked by `rg`/`git log`. Two case files were run once (see Evidence). Depth varies: STALE and OPEN-SMALL rows were checked against the tree; UNCLEAR rows say what was not reached. Re-verify a cited line before acting on it.

## Summary table

| # | itemId | entry (80 chars) | class | size | evidence |
|---|---|---|---|---|---|
| 1 | agy-el01-write-authorization-gap | Three fail-open conditions reported open: unparseable hook input, spec without Risk class row, unbound open record | UNCLEAR | - | `hooks/guard-el01-tripwire.test.mjs` TP-09d (l.298) blocks invalid state JSON, TP-05/06 reject closed/invalid records (D86 892cc7dc6); no case for a spec with no Risk class row found |
| 2 | approval-bound-design-package-lives-in-an-ignored-directory | One todo case in rebind-approval.test.mjs (inspect lists rebind-approval) still fails | OPEN-SMALL | M | `scripts/rebind-approval.test.mjs:450-451` `INSPECT_TODO` still `todo`; needs a ready onboarded clone fixture |
| 3 | bounded-reader-terminal-binding | Run the planned 2+1 Reader course on the content-frozen state, write terminal record | OPEN-LIVE | - | a real 2+1 Reader course run and terminal record |
| 4 | brownfield-implementation-entry-demands-a-greenfield-design-block | Confirm established-with-ratchet state of D66 is covered by AC-9 adoption or pin it | OPEN-SMALL | S | `lib/pins/brownfield-implementation-entry-demands-a-greenfield-design-block.test.mjs:9` says "NOT covered (D66...)"; add one case |
| 5 | design-phase-runs-critic-advisor-and-readiness-instead-of-one-review | Qualify integrated G17 publication repair through the complete design-review route | OPEN-LIVE | - | real independent design-review producer and consumer custody |
| 6 | disjoint-signed-hgo-actions-invalidate-one-another | Two diagnostic gaps in isolation suite are todo cases (HGO-DRIFT; audit rows); optional | STALE | - | `lib/human-guard-override-disjoint-isolation.test.mjs:357-391` both cases are normal `test(...)` now (comment l.358-359 "they now pass"); no `todo` option left |
| 7 | elephant-main-context-spent-on-wake-ups-and-inline-reads | Remaining cause coverage and candidate-bound live token 10% measurement | OPEN-LIVE | - | live before/after token measurement on a real session |
| 8 | git-hook-runtime-snapshots-go-stale-after-plugin-changes | Native mid-session recovery and install flow | OPEN-LIVE | - | native session: update plugin mid-session, observe hook recovery |
| 9 | hgo-stale-capability-shadows-current-authorization | Diagnose first-run AC8 failure vs isolated GREEN retry | OPEN-LIVE | - | repeat the AC8 case under overlapping load to reproduce the intermittence |
| 10 | host-crash-during-verify-leaves-a-descriptor-no-recovery-verb-can-clear | Red K1D session-cleanup-binding case (neutral coordinator-close release) open | UNCLEAR | - | `scripts/session-cleanup-binding.test.mjs` run once here: 68 tests, 36 pass, 32 fail (incl. "neutral coordinator-close release is private, byte-stable, and replayable"); the breadth (start, release, recovery cases all red) suggests an environment cause in this checkout, not the one case; not diagnosed |
| 11 | revised-native-design-cannot-reach-a-new-advisor-course | Correct item's stale Reconciled prose to name the committed replacement-route pin | OPEN-SMALL | S | doc only: `backlog/items/2026-10-04-revised-native-design-cannot-reach-a-new-advisor-course.md:60` section "Reconciled 2026-10-23"; prose not read for the pin name |
| 12 | shell-grammar-file-is-a-kernel-path-without-capability-placement | Re-count AC-255 pin once on current HEAD | STALE | - | `lib/pins/shell-grammar-file-is-a-kernel-path-without-capability-placement.test.mjs` run at HEAD 3f90842dc: 8 pass, 0 fail, 0 skipped, exit 0 |
| 13 | signature-ceremony-requires-operator-work-and-breaks | Qualify exact sign-and-apply / agent import without treating proof as self-approval | OPEN-LIVE | - | a real PO signature through the one-command flow |
| 14 | greenfield.g8.design | Bind submit-plan design receipts to genuine independent producer custody | OPEN-LARGE | - | reason: which genuine evidence source replaces `DRC-OBSERVATION-UNATTESTED` is an open design decision |
| 15 | greenfield.g9b | Qualify actual active hook cwd during background update and direct-prune limits | OPEN-LIVE | - | live background plugin update with a deleted cwd |
| 16 | greenfield.g10 | Real signed/native recovery qualification | OPEN-LIVE | - | real signature and native run |
| 17 | greenfield.g18 | Qualify host identity ... reviewer admission for Codex and Claude/Windows | OPEN-LIVE | - | native Codex and Claude/Windows happy path |
| 18 | greenfield.g20 | Qualify production positive publication/proof, review/Verify lineage | OPEN-LIVE | - | production publication run (reason: negative controls only) |
| 19 | greenfield.g21 | Actual signed exact repair and manifest reconcile; native roundtrip | OPEN-LIVE | - | real signed repair on a native host |
| 20 | greenfield.g22 | Qualify fresh isolated worktree dependencies and full Critic/close path | OPEN-LIVE | - | native fresh worktree through Critic and close |
| 21 | greenfield.g23.forensics | Qualify bounded transcript export and independent host identity conflict handling | OPEN-LIVE | - | real transcript export with host identity conflict |
| 22 | greenfield.g28 | Native delivered-branch approval/Verify/Security/review audit package | OPEN-LIVE | - | native delivered branch audit |
| 23 | greenfield.g29 | Agent must execute explicit public update after lifecycle transitions | UNCLEAR | - | reason says the updater, guard admission and 6 duty cases exist (cohort-report, p1-finalization-guard.json); entry reads as a duty statement; tree not checked |
| 24 | greenfield.g35.codex-push-guard-budget | Resolve twelve broad-suite fixture-transition failures via genuine lifecycle inputs | OPEN-LARGE | - | twelve failures in a broad suite, original examiners to be kept; suite not located here |
| 25 | greenfield.r2.branch-checkout-runtime-continuity | Qualify full public Critic/close flow on retained delivery branch | OPEN-LIVE | - | full public Critic/close on a real delivery branch |
| 26 | greenfield.r2.critic-finalizer-original-independence | Finalization requires genuine independent Source/host execution and original review | OPEN-LARGE | - | reason: "no runner issues a Source record yet" (w7-critic-origin-gate delivered the gate only) |
| 27 | consumer-push-blocked-by-late-review-unit | Admit merge base as first review base for late unit; mainRef check; name evidence route | UNCLEAR | - | reason: remedy text (13e6ab727) and feat/ mainRef ancestor (8dc0d90a9) delivered; merge-base-as-first-base part not checked in tree |
| 28 | brownfield-architecture-gate-never-passes | Align entry guard with class 10, class 9 inputs, propose step, hurdles, write route | UNCLEAR | - | D179 (93f1a4d55), e2e regression (49be7a1ec), D162 S2-S4 per reason; the five parts not itemised against the tree |
| 29 | missing-docs-adr-directory-blocks-implementation-entry | Missing docs/adr means no decisions, or refusal names path and repair | STALE | - | commit 93f1a4d55 "a project without docs/adr has no decisions instead of an unavailable source (D179)" |
| 30 | fitness-class-6-blocks-documentation-modules-without-a-verification-entry | Exempt documentation modules from class 6; decide snapshot invalidation | UNCLEAR | - | exemption delivered (w7-fitness-doc-module, per reason); the snapshot-invalidation question is a decision |
| 31 | draft-guard-blocks-the-sanctioned-recovery-wrappers | Admit exact argv shapes, add --out to phoenix plan, document --lock-token | STALE | - | 77db3153e (argv admitted, `--out` added); `plugins/pipeline-core/scripts/phoenix-authority-revision.mjs:28` usage shows `--out` and `--lock-token` |
| 32 | verify-for-an-older-commit-demands-package-lock-in-a-pnpm-project | Recon where Verify picks install step, follow lockfiles, name them, fixture test | UNCLEAR | - | D174 (624016cb1) delivered pnpm lockfile; naming of looked-for lockfiles and the fixture assertion not located |
| 33 | glossover.pf82-host-commit-never-completes-for-background-goldfish | Measure why SubagentStop finalizer does not complete for background launches | OPEN-LIVE | - | one real run_in_background Goldfish, observe SubagentStop |
| 34 | glossover.pf86-registry-lock-is-busy-while-agents-run | Retest four concurrent Agent calls in one message | OPEN-LIVE | - | four Agent calls in one message on the installed candidate |
| 35 | toolbox.d60-admit-refuses-on-a-held-packet-it-would-resume | Pin feature-request admit for a different candidate and release verb after batch recovery | UNCLEAR | - | pins not searched; likely OPEN-SMALL (test only) |
| 36a | glossover.pf94-... (1/3) | Walk the path after the admitted delta end to end on a course | OPEN-LIVE | - | a real course: round-2 preflight, claim, finalize, export, lineage |
| 36b | glossover.pf94-... (2/3) | Pin the untested refusal FPR-LINEAGE-COVERAGE-CLAIM | OPEN-SMALL | S | only occurrence in `plugins`: `lib/feature-package-registration.mjs:538`; no test names it |
| 36c | glossover.pf94-... (3/3) | Surface CGB-CONFLICT detail in finalizer admit output; sanctioned verb for leftover origins file | OPEN-SMALL | M | files not opened here (finalizer admit output, takeover verb) |
| 37 | a-large-tracked-inventory-reads-as-git-identity-unavailable-in-the-security-scan | Register security-scan-large-inventory.test.mjs in the Verify suite list | OPEN-SMALL | S | test exists at `plugins/pipeline-core/scripts/security-scan-large-inventory.test.mjs`; no hit in `harness/verify-suites.json` (protected TP-13; operating-tools ceremony) |
| 38 | agent-dispatch-pretooluse-step-takes-minutes-in-a-consumer | Measure one real consumer dispatch with the installed in-hook trace, then cut spawns | OPEN-LIVE | - | one real consumer dispatch with the trace |
| 39 | briefing-dispatch-needs-hand-retyping | Apply held patch w7-gmw-kernel-list-covers-briefing-file-reference-s2 | STALE | - | `lib/guard-maintenance-window.mjs:540` lists `plugins/pipeline-core/lib/briefing-file-reference.mjs` in the kernel list; GMWKC01 lives in `lib/guard-maintenance-window-kernel-closure.test.mjs` (not run here) |
| 40 | gate-strength-shell-refuses-admitted-reads | Other find predicates and the other seven reads not re-probed | UNCLEAR | - | not checked; an admitted-grammar probe is the work |
| 41 | greenfield.r2.guard-denials-fill-the-override-request-namespace | Denials of other hooks and shell lanes not probed | UNCLEAR | - | reason says pin `lib/guard/no-route-denials-seed-no-overr...` exists; coverage of the other hooks not checked |
| 42 | a-one-off-guard-warning-disarms-an-armed-override | Apply held patch 28 (HGO-DRIFT naming) | STALE | - | commit c206f3370 "refuse an armed override whose denial digests drifted as HGO-DRIFT instead of skipping it silently" |
| 43 | git-hook-runtime-snapshots-are-never-collected | Measure whether unreferenced snapshots slow the PreToolUse hooks | OPEN-LIVE | - | timing of PreToolUse hooks with and without ~2 GB of snapshots |
| 44 | guard-read-refusal-does-not-name-the-missing-target | Refusal for a repeated option (-e twice, --glob) names the rejected element | OPEN-SMALL | S | observed this session: unknown flag `-ln` gets "Rejected element", while repeated `--glob` / `-e` refusals print none; emitter `lib/guard/denial-route.mjs:56`, text `lib/guard/grammar-denials.mjs:52` |

## Counts per class (46)

STALE 6 (rows 6, 12, 29, 31, 39, 42) · OPEN-SMALL 7 (2, 4, 11, 36b, 36c, 37, 44) · OPEN-LARGE 3 (14, 24, 26) · OPEN-LIVE 20 (3, 5, 7, 8, 9, 13, 15-22, 25, 33, 34, 36a, 38, 43) · UNCLEAR 10 (1, 10, 23, 27, 28, 30, 32, 35, 40, 41). Total 46.

## OPEN-SMALL entries, suggested slices

**Slice A, guard refusal text (row 44).** `plugins/pipeline-core/lib/guard/denial-route.mjs:56` prints `Rejected element:` only when a `rejectedElement` is passed; the repeated-option refusal (`GUARD-READ-COMMAND-UNSUPPORTED` with the generic text of `grammar-denials.mjs:52`) passes none. Fix: pass the second occurrence of the repeated option (e.g. `the repeated option "--glob"`) from the read-grammar parser; add one case beside `hooks/guard-lifecycle-ready.test.mjs:2512`. S. Kernel/guard files: check protection before dispatch.

**Slice B, Critic course/registration pins (rows 36b, 36c).** 36b: add a test that a consumed receipt whose `reviewRange` differs from the packet range returns `FPR-LINEAGE-COVERAGE-CLAIM` (`lib/feature-package-registration.mjs:538`); S. 36c: print the delivery-target `CGB-CONFLICT` detail in the finalizer admit output and add a sanctioned verb to move the leftover origins file; M (files not opened; recon first).

**Slice C, test-only pins (rows 2, 4).** Row 2: give the `INSPECT_TODO` case (`scripts/rebind-approval.test.mjs:451`) a ready onboarded clone fixture so it can drop `todo`; M. Row 4: add the established-with-ratchet case named in `lib/pins/brownfield-implementation-entry-demands-a-greenfield-design-block.test.mjs:9`; S.

**Slice D, registration (row 37).** Add `plugins/pipeline-core/scripts/security-scan-large-inventory.test.mjs` to `harness/verify-suites.json` (TP-13 protected; the item says hand registration breaks the capability inventory baseline, so it is an operating-tools ceremony, not a plain edit). S but gated.

**Slice E, documentation (row 11).** Update the "Reconciled 2026-10-23" prose (`backlog/items/2026-10-04-revised-native-design-cannot-reach-a-new-advisor-course.md:60`) to name the replacement-route pin; S, doc only.

## Evidence

- `node scripts/matrix-gaps.mjs specs/sprint-alfred-epic/evidence/delivery-amendment-2026-10-26-d163-hotfix`: exit 0, 46 entries.
- `node plugins/pipeline-core/lib/pins/shell-grammar-file-is-a-kernel-path-without-capability-placement.test.mjs`: exit 0, 8 pass / 0 fail (row 12).
- `node plugins/pipeline-core/scripts/session-cleanup-binding.test.mjs`: exit 1, 36 pass / 32 fail of 68 (row 10; cause not diagnosed).
- A scratch dump script `scratch/gaps-dump.mjs` (untracked) was used to read the rows; it writes only under `scratch/`.

## NOT reached

Rows 1, 10, 23, 27, 28, 30, 32, 35, 40, 41 stay UNCLEAR (what is missing is stated per row). Not run: GMWKC01 case, the pin file for row 41, rebind-approval, any suite for rows classed STALE by tree/log reading only (6, 29, 31, 39, 42; run counts not repeated). Row 11 prose and the files for 36c were not opened. OPEN-LIVE classes rest on the row text; the live measurements were not attempted. The budget checkpoint (call 64 of 80) stopped further checks.
