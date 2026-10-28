# Recon notes: remaining baseline-red test files (batch C), candidate 3573ded81

Model output; partial. Dispatch W7-RECON-BASELINE-REDS-C-C1-20261027. Read-only recon, no patch.

## Status: INCOMPLETE (tool budget reached while the main run was still going)

The 13-file run `node scripts/run-parallel.mjs 3 w7rc ...` (3 isolated workers) had printed only its header line
(`commit=3573ded81...`, workers=3) when the budget checkpoint hit. Its per-file result was NOT read. The next
dispatch must re-run it (or read the finished output) and classify the reds. No red group was classified.

## Orchestrator addendum (Elephant, 2026-10-28): batch result and grouping

The Goldfish ran out of budget; the Elephant re-ran the batch itself
(`node scripts/run-parallel.mjs 3 w7rc --allow-dirty <12 files>`, commit 3573ded81) and re-ran four of the red files
once in the REAL checkout (full HOME) to separate environment from code. Model output plus raw logs; classes marked
"read" were confirmed against the error text, "inferred" ones only by family resemblance.

| File | Isolated-clone result | Real checkout | Class | Effort |
|---|---|---|---|---|
| `lib/pins/parallel-work-in-one-checkout-is-unsafe.test.mjs` | RED 14/19, M6a/c/d/e/f | RED, same | FIXTURE, read: stderr `DBG-GENERATED-BRIEFING-REQUIRED` (hand-built briefing refused), exit 2 vs expected 0, test line 762; same family as guard-dispatch group C | M, needs a generator-built briefing fixture |
| `lib/project-onboarding-v3.test.mjs` | RED, no summary (shards 2-4 exit 1) | RED, same (5 shards exit 1; sharded reporter, 5 named FAIL cases read) | FIXTURE or production, read, three causes: (1) the seeded push gate and SECGATE-1 cases are refused with `candidate-bound independent review and Verify are unavailable (private-critic-binding-unavailable)` (the critic-bound-verify family of push-init, no Critic binding in a fixture root); (2) NVA-R40-PROJDRIFT: `set-phase implementation refused calibration commit preflight (CVCT-CALIBRATION)`, calibration is not committed in the fixture; (3) the public onboarding handover cases for codex and antigravity fail at `configure verify` (exit 2, empty message), the CVCT family of the configure-verify-names pin | M to L, three causes, separate slices |
| `lib/onboarding-continuity.test.mjs` | RED 323/324, OBC264 | RED, same | FIXTURE, read: `KickoffError BOOTSTRAP-BIND-DESIGN-AUTHORING-REQUIRED: author the generated PRD and Spec before binding their bytes` (onboarding-continuity.mjs:5987 via planOnboardingBootstrapBind, test line 4443); the fixture binds generated, unauthored design bytes | M, fixture must author the PRD and Spec first |
| `scripts/pipeline-state-approve-announce.test.mjs` | RED 0/1 | RED, same | FIXTURE, read: `submit-plan blocked by ARCHITECTURE-MAP-MISSING`, exit 2 vs 0 at test line 157; the architecture gate the pipeline-state neutral-only repair handled | S to M, reuse the neutral-only technique |
| `scripts/project-onboarding-e2e.test.mjs` | RED 5/7 pass | RED, same | PIN STALE or production decision, read: the driver now ends `unsupported-next-action` with nextAction `design-authoring-required` where the pin expects code `ARCHITECTURE-DESIGN-AUTHORING-INCOMPLETE` (assertion diff `code: undefined` vs that code) | M, needs a decision which outcome is intended |
| `lib/plan-authority-staging-guard.test.mjs` | RED 10/11, set-feature continuity | RED, same | FIXTURE, read: `submit-plan blocked by ARCHITECTURE-MAP-MISSING`, exit 2 vs 0 | S to M, reuse the neutral-only technique |
| `scripts/measure-tofu-push-e2e.test.mjs` | RED 8/9, ADR-0085 boundary | RED, same | same family as the e2e row, read: outcome `unsupported-next-action` where the pin expects `error` | M, same decision as the e2e row |
| `scripts/pipeline-state-observer-conformance.test.mjs` | RED 7/14 fail | RED, same 7 | FIXTURE, read: fixture repository has no commit, every `submit-plan` verb refuses `PLAN-SUBMIT-HEAD-UNAVAILABLE`; same defect the phoenix observer-conformance fixture had (patch c4) | S, one fixture commit |
| `scripts/push-init.test.mjs` | RED 23/32, 9 fail | RED, same | CORRECTED 2026-10-28 (see `w7-push-init-fixture-architecture-readiness.notes.md`): the first version of this row blamed the architecture gate, wrongly. The `ARCHITECTURE-MAP-MISSING` line is stderr of a PASSING test that fails closed on purpose. The reds fail at the `critic-bound-verify` check (`candidate qualification unavailable (CBV-ROOT)`, `push-prepare.mjs` lines 745-755), because `prepareDepsAllGreen()` overrides neither `deps.requiresPublicationReview` nor `deps.checkCriticBoundVerify`. Names 6 (`2 !== 1`) and 9 (`doc-reconciliation` exit 2 at pinned refs) are separate, not yet diagnosed. | M |
| `lib/pins/configure-verify-names-the-unmet-approval-condition.test.mjs` | RED 3/6, all case A | RED, same | read: refusals are `CAC-SOURCE-BINDING-MISMATCH` / `CVCT-AUTHORITY-STALE` and carry no `repair` text, the pin (commit cff00accd, "pin that configure-verify names the unmet condition") expects /repair/iu. Either the production message never gained the repair clause (PRODUCTION, a pin ahead of its fix) or a later refusal path replaced it; not separated | M, needs a production read |
| `lib/pins/consumer-approved-plan-reaches-the-first-item-host-commit.test.mjs` | RED 7/8, case (g) PF-34 | RED, same | PIN STALE (wording), read: the pin expects /earliest base a Critic review of this feature course can use/ but the refusal now says `commit both paths in one commit. The first Critic review of this feature course may start from any base on the candidate history that already lists the feature manifest ...`; update the pin to the new wording after confirming the change was deliberate (git log of the producing file) | S |
| `lib/pins/denial-names-a-diagnosis-it-refuses.test.mjs` | GREEN 13/13 | n/a | the 2026-10-27 red was environmental or fixed since | none |
| `lib/human-guard-override.test.mjs` (the "Q9 D55 library suite": the red case is `Q9 (D55): a plugin update after a commit rebinds the registry and keeps the legacy armed-capability member`) | GREEN 177 pass, 1 skip, 0 fail (isolated worker) | RED 176/178: `SDC-AUTHORITY-UNAVAILABLE: domain-ancestor-unsafe`, status `unavailable` where `initialized` is expected | ENVIRONMENT, measured: the same file is green under the runner's private HOME and TMPDIR and red under the real ones, so an ancestor directory of the real HOME or TMPDIR fails the domain ancestor safety check (WSL path permissions are the likely cause; the exact directory was not isolated). Not a code defect, no fix owed; run this file only through `scripts/run-parallel.mjs`. | none |

Second pass (later the same night): the seven previously unclassified files were re-run once each in the real checkout
(plain node, full HOME) and their error text read. All six that ran are red in the real checkout too, so none is
environmental. Two families: the architecture gate at `submit-plan` (approve-announce, plan-authority-staging-guard) and
the design-authoring gate of the intake path (onboarding-continuity OBC264, project-onboarding-e2e, measure-tofu), plus
one stale wording pin (consumer-approved-plan). project-onboarding-v3 was not run in this pass. The 'real checkout'
column above for these rows is this second pass.

Conclusions: none of the four re-run reds is environmental (same failures in the real checkout). Three of the read
groups are fixtures stale against two later production gates (generated-briefing requirement, architecture entry
readiness, head-required submit-plan), so they extend families already seen in the guard-dispatch and pipeline-state
repairs. Recommended slice order: observer-conformance (S), push-init (M), parallel-work (M, shares the generator
fixture helper with guard-dispatch group C), then configure-verify (needs the production read). Not classified (7
files above) stay open; they were not reached.

## Name resolution (verified by rg / find at the candidate)

| Briefing name | Resolved file |
|---|---|
| parallel-work PARWORK-M6a/c/d/e/f | `plugins/pipeline-core/lib/pins/parallel-work-in-one-checkout-is-unsafe.test.mjs` (tests at lines 759-817) |
| project-onboarding-v3 | `plugins/pipeline-core/lib/project-onboarding-v3.test.mjs` |
| its "scripts variant" | UNRESOLVED/out of scope: the verify note pairs v3 with `scripts/pipeline-state` ("abort identically"), which the briefing excludes. `scripts/project-onboarding-v3-*.test.mjs` exist (3 files) but were not named in the red list. |
| onboarding-continuity OBC264 | `plugins/pipeline-core/lib/onboarding-continuity.test.mjs` |
| approve-announce | `plugins/pipeline-core/scripts/pipeline-state-approve-announce.test.mjs` |
| project-onboarding-e2e | `plugins/pipeline-core/scripts/project-onboarding-e2e.test.mjs` |
| plan-authority-staging-guard | `plugins/pipeline-core/lib/plan-authority-staging-guard.test.mjs` |
| measure-tofu | `plugins/pipeline-core/scripts/measure-tofu-push-e2e.test.mjs` |
| observer-conformance (7) | `plugins/pipeline-core/scripts/pipeline-state-observer-conformance.test.mjs` (14 top-level tests) |
| push-init (9) | `plugins/pipeline-core/scripts/push-init.test.mjs` (32 top-level tests) |
| configure-verify-names (3) | `plugins/pipeline-core/lib/pins/configure-verify-names-the-unmet-approval-condition.test.mjs` (3 tests; sibling `configure-verify-output-lacks-a-walkable-commit-route.test.mjs` exists, not named) |
| consumer-approved-plan (g) | `plugins/pipeline-core/lib/pins/consumer-approved-plan-reaches-the-first-item-host-commit.test.mjs` |
| Q9 D55 library suite | UNRESOLVED: no test file names "Q9"; "D55" matches only guard sources and `commit-message-policy.test.mjs`, `human-guard-override.test.mjs`, `close-coordinator-...`, etc. `lib/human-guard-override.test.mjs` was queued as a guess only. |
| sanctioned-args-scripts consumers | No test file of that name. Importers: see below. |

## Results actually obtained

| File | Result | Evidence |
|---|---|---|
| `hooks/design-approval-command-admission.test.mjs` | GREEN 13/13 | plain node in the real checkout, exit 0 |
| `lib/guard/audit-pack-command-admission.test.mjs` | GREEN 3/3 | plain node, real checkout |
| `lib/pins/lifecycle-coordination-commands-refused-as-implementation-writes.test.mjs` | GREEN 30 pass, 1 skip (Git Bash host limitation), 0 fail; includes the D64 cases | plain node, real checkout (it printed 4 harmless `fatal: ambiguous argument 'HEAD'` lines from fixture repos) |
| `lib/pins/windows-private-dacl-detail-codes-and-root-only-rule.test.mjs` (the briefed check) | GREEN 6/6 | plain node, real checkout, unchanged file |
| All 13 files of the run-parallel batch | NOT READ | run still printing; re-run needed |

These three sanctioned-args consumers being green in the real checkout (full HOME) means their 2026-10-27 reds, if any,
were either environmental to the isolated clone (private HOME) or fixed since; this was not separated (the control in
an isolated clone was not run). Not run: `lib/pins/denial-names-a-diagnosis-it-refuses.test.mjs` is inside the batch;
`lib/pins/preflight-with-a-forward-slash-plugin-path-records-no-bootstrap-receipt.test.mjs` was not run.

## Observations for the next dispatch (hypotheses, not findings)

- PARWORK-M6a/c/d/e/f are the "admitted" cases (exit 0 expected); M6b, the "refused" case, is NOT in the red list.
  The Goldfish type `pipeline-core:goldfish-implementor` (test line 42) is admitted by
  `writeCapableCarrierAdmission` (`hooks/guard-dispatch.mjs` line 248), so the red is NOT
  `DISPATCH-WRITE-CARRIER-REQUIRED`. Read the actual stderr of M6a in the run output (`assert.equal(result.status, 0, result.stderr)`
  prints it) before classifying; a later admission gate in the real hook is the likely site. Class unknown.
- Isolated clones run under a private HOME/TMPDIR with only a `.gitconfig` identity: anything reading the installed
  marketplace plugin root, signing keys or a global git hook would be red there regardless of code (ENVIRONMENT
  candidate for every group). Control (same file under real HOME) not run.
- Counts in the composed note ("observer-conformance 7, push-init 9, configure-verify-names 3") are failing-case
  counts; configure-verify has only 3 tests, so that whole file is red.

## Not reached

Per-file pass/fail and counts for the 13 batch files; error grouping; classification; fixes and effort sizes; the
`preflight-with-a-forward-slash...` test.

## Recommended next step

Re-dispatch with a larger budget: run the batch once in the background, wait for the notice, Read the output once,
group by first error line, one production read per group, write the sections. Do not reuse the
`scratch/clones/pw-w7rc-*` workers' state beyond reading (they stay in place; run-parallel reuses them by design).

## Briefing defects

- Write scope and DoD name `windows-private-dacl-detail-codes-and-root-only-rule.test.mjs` with a RED-to-GREEN cycle,
  but the Goal says notes only, no patch; "Files that may differ in the patch" is empty. The test file was not touched;
  the test-first cycle is inapplicable to a recon.
- The Goal asks for a driver under `scratch/agent-out/w7rc/`; `scripts/run-parallel.mjs` already provides isolated clones,
  so no driver or `git clone --shared` was created and no cleanup is owed except the reused `scratch/clones/pw-w7rc-*`
  clones (untracked, left in place).
