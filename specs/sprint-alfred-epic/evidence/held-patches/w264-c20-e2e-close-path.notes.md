# w264: the close path from a finished implementation to the closed local lifecycle is walked on every runner (candidate 20, G20-35, AC-108)

Base: `35db88a31` (the candidate-20 chain). Built in the slice clone `scratch/agent-out/s-e2e`. One held patch. Closest criterion: AC-108
(PRD and Spec unchanged). Source finding: Codex greenfield report ("a real end-to-end test must enable start -> independent return evidence ->
consume -> identical readback -> release"); no greenfield run reached the part after implementation, so it was unproven on every runner.

STATUS: PARTIAL, final hand-back of this slice. The delivered patch is the LAST GREEN state: steps 1-4 (below) pass alone on all three runner identities
(clone commit `a2fb56d1e`). The push gate decision and the release preflight (step 5) are NOT built and NOT proven. No product file was changed; no product
break is established. Later work-in-progress commits in the clone (`bf63a9dc1`, `7eeb70970`, `1a1b482df`) are RED and are deliberately not in the patch.

## What the patch contains

- New test `plugins/pipeline-core/scripts/close-path-e2e.test.mjs` (NEEDS REGISTRATION in `harness/verify-suites.json`; not done here, TP-13 protected).
  One test, a loop over claude, codex, antigravity. Each iteration builds its own consumer project fixture (temp directory) and runs every command as a
  real child process under that runner's ambient markers (`CLAUDECODE`/`CLAUDE_CODE_SESSION_ID`, `CODEX_THREAD_ID`, `ANTIGRAVITY_AGENT`); a failure names the
  step, command and exit code.
- The start state (approved mini-profile plan in implementation, valid Continuity state) is built with the library's `submitPlan`/`approveSubmittedPlan`/
  `enterPlanImplementation`. No Continuity or close state is hand-edited during the walk.

## Walk (green, per runner)

1. consumer fixture, implementation commit, dispatch record commit;
2. work Verify incl. `baseline-security` (`verify-evidence-producer.mjs --mode work`, exit 0, evidence binds the candidate);
3. Critic on the GENERIC batch: critic-mode Verify evidence, `register-batch`, `admit`, `finalize` (consume + identical readback, no fallback flag), `export`;
4. close: `close-coordinator` plan-start/apply, `checkpointed`; `continuity-result-bootstrap-plan`/`-apply`; `continuity-result-close-plan`/`-apply`
   (queue head review -> close); `feature-close-prepared` with the Continuity close request; the `close-feature` State writer action the coordinator
   returned; `tracked-close-finalized` with real digests; one commit; `candidate-frozen`; candidate Verify bound to the frozen commit; injected clean
   scanners (fixture binaries via `PIPELINE_<TOOL>_PATH`, trust assessment mocked, in-process `runSecurityScan`); `final-verify-green` evidence from the
   producers' own digests; `cleanup-complete` via `drive --apply`; `closed-local`; `drive` quality readback (`security-scan` and `critic-report-file` rows present).

## Why step 5 is not delivered: findings (each with command, code and file)

1. The generic-batch Critic round is a dead end for the push. `session-critic-finalizer.mjs export` answers `lineage.status: not-written`,
   `FPR-LINEAGE-NO-COURSE-CLAIM` (the round was finalized outside the feature course). Consequently
   `verify-evidence-producer.mjs --mode release --critic-packet-id P` refuses `VEP-CVL-CRITIC-STALE` (`lib/review-admission-read.mjs` line 1237, the receipt is
   bound to the implementation commit, the frozen candidate is the close commit) and, with `--critic-evidence-feature-id`, `VEP-CVL-CARRY-RANGE`
   (`lib/critic-verify-lifecycle.mjs` lines 83-108: the exported Critic evidence `specs/<feature>/evidence/critic/**` is vetoed from the
   administration/documentation carry route in `lib/administration-documentation-paths.mjs` and only the registered-evidence classifier, which needs
   `specs/<feature>/lifecycle.json`, admits it). `--mode push --critic-packet-id ...` refuses `VEP-CRITIC-CARRY-INPUT`.
   The guard-push child process then refuses a candidate with `EF-NOT-PUSH-BOUNDARY` (needs push-boundary Verify evidence) and
   `private-critic-binding-unavailable` (needs a candidate-bound review and Verify).
2. Decision from the sanctioned flow (critic-review skill, close-feature skill): a feature's Critic is a COURSE round (diagnostic evidence registered in
   `specs/<feature>/lifecycle.json`, request v2 with `review.courseContext`, lineage registered at export), and no Critic round is possible after the close.
   The generic batch used in the delivered walk is therefore the non-feature path; it proves admit/finalize/consume/readback per runner, not the carry to the push.
3. The course path could not be built through sanctioned verbs for a mini course. With the repository's own approved-course fixture
   (`lib/test-item-approved-course-fixture.mjs`: sanctioned `submit-plan`, `present-plan`, `approve-plan`, `set-phase`), the approval written for the
   `mini` profile is `pipeline.plan-approval.v8` without `acceptedContract`, and `register-feature-package.mjs` (no flags) refuses `FPR-NO-APPROVED-PLAN`
   ("no current plan approval of the v9 accepted-contract shape exists ... run approve-plan first", `lib/feature-package-registration.mjs` lines 196-205).
   The named repair (run approve-plan) does not produce v9 for a mini course. Open question, NOT decided: is a mini-profile consumer meant to reach a
   v9 approval (feature profile with a design workflow package, a PO ceremony) before it can run a course Critic and push, or may a low-rigor candidate
   push without a carried Critic (the guard's publication-review duty is resolved from the pushed commit's own state; after the close that state is a
   closed feature, so a bare-candidate review duty applied in the observed refusal)? If no sanctioned way leads a consumer from a mini course to a pushable
   candidate, that is a real break in the close -> push hand-off, to be fixed at its cause with its own regression case.
4. A hand-written `lifecycle.json` is not an option: `FPR-MANIFEST-CONFLICT` (closed schema; `approved` needs prd, acceptance, result, candidate-evidence
   artifacts and one authoritative prd).

## Fixture findings (not product breaks)

- Critic CLI requests refuse an upper-case `projectId` (`SAFE_ID` is lower-case). The Result bootstrap needs `prd_<feature>.md` next to `result.md`.
  The State writer prints a plain sentence, not JSON. Governance enrolment must precede any pipeline file (enrolling afterwards is `declined` as retained
  history). For the guard to demand evidence the manifest must configure the push and security gates (these were added in the WIP commits, not the patch).
- Observation: `finalize` completes on all three runners without `--allow-caller-authored-fallback` (G20-24 holds). With no manifest, `baseline-security`
  reports "not applicable" and exits 0; the spawned Verify CLI cannot take the scanner trust mock, so the frozen candidate's scan runs in-process.

## Not changed

- `lib/path-spelling.mjs`, the separator-sweep sites; nothing registered in `harness/verify-suites.json` or the inventory.
- Briefing step 1 (implementation committed by the host-commit route) is NOT walked: it is a Claude hook contract (`hooks/native-goldfish-host.mjs`); the
  fixture uses plain commits and a dispatch record of the same shape.

## Not proven

Step 5 (push gate decision with a fixture approval, release preflight via `createReleasePreflight`), a signed push approval, the course-path Critic round
and lineage, the host-commit route, the rigor >= 1 audit route (`CLOSE-QUALIFICATION-REQUIRED` for a `feature` profile close), full Verify, Critic review,
PO acceptance, Windows/macOS. The chain is not applied in the real repository, so `git apply --check` there is expected to fail until the chain is applied in
order (the helper printed exit 0 for this patch alone because it only adds one new file).
