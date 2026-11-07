# w265: the close walk starts from the sanctioned feature course and is carried to the audit-route refusal; the push gate and release preflight are not yet walked (candidate 20, G20-35 step 5, AC-108)

Base: `b8f65ab49` (the w264 chain head). Built in the slice clone `scratch/agent-out/s-push`. One held patch (it changes only the walk test
`plugins/pipeline-core/scripts/close-path-e2e.test.mjs`; it applies on top of the w264 patch). Closest criterion: AC-108 (PRD and Spec unchanged).

STATUS: PARTIAL, checkpoint hand-back. The delivered walk is GREEN on all three runner identities (claude, codex, antigravity) up to and including the
measured `CLOSE-QUALIFICATION-REQUIRED` refusal at `feature-close-prepared`. The audit route, the close, the push-boundary Verify, the `guard-push.mjs`
child-process decision and the release preflight are NOT built and NOT proven. No product file was changed; no product break is established yet.

## What the patch changes

The start state of the walk is no longer built with library transitions. It is the sanctioned consumer course (a trimmed port of
`lib/pins/consumer-approved-plan-reaches-the-first-item-host-commit.test.mjs`, approval mode chat): `set-feature`, `continuity-init`,
`submit-plan --profile feature`, `present-plan --review-receipt`, `approve-plan --design-approval-request` (plan-approval v9),
`materialize-architecture`, `set-phase implementation`, then `register-feature-package.mjs`. The State verbs run in-process (the same `run` the CLI wraps)
under the test process's markers; every command from the registration on runs as a child process under the runner identity's own markers.

Walk (green per runner): 0 register-feature-package, commit; 1 implementation commit + dispatch record; 2 work Verify (baseline-security);
3 Critic on the FEATURE COURSE: `critic-diagnostic-evidence.mjs`, `--add-diagnostic-evidence`, evidence-only registration commit,
`critic-dispatch-preflight.mjs --registration-commit` (`packet-ready`), request v2 with `review.courseContext`, `admit`, `finalize` (consume + identical
readback), `export`, lineage read back as `already-registered` (the export registers it); 4 close: `plan-start`/`apply`, `checkpointed`,
Result bootstrap, fixture-signed `feature-package-reconcile`, `continuity-result-close`, then the refusal below.

## Decisions with evidence (from the sanctioned flow, not from what makes the walk pass)

1. The library-built start state had no plan-submission rigor row. Measured on the sanctioned fixture: `submit-plan` records the row with
   `retainedProfile: "feature"` even for `--profile mini`, because four inputs are unavailable in a fresh consumer (`protectedIdentity`,
   `architectureProfile`, `fitnessOutcomes`, `interruptionLineage`). Consequence: `publication-review-requirement.mjs` returns
   `REVIEW-RETAINED-PROFILE-REQUIRED` for such a consumer from submission on; the coordinator therefore demands the audit route before the close
   (`CLOSE-QUALIFICATION-REQUIRED`, `close-coordinator.mjs` line 727). The briefing's measurement is confirmed; the mini route cannot be pushed without
   a carried Critic, and making it pushable would be a rigor-0-at-publication decision (stop condition), which is not built.
2. A mini course cannot register a package (w264 finding 3), so the realistic course is `--profile feature` (plan-approval v9). Taken from the
   existing pins, not invented.
3. Measured (new): in a REGISTERED package the Result bootstrap leaves `reconciliation-pending`; the sanctioned repair is a PO-signed
   `feature-package-reconcile` (an always-required critical kind, `pipeline-state.mjs` `ALWAYS_REQUIRED_KINDS`). The fixture signs it with its own
   test Ed25519 key, trusted through `project/critical-human-proof.json` (v3 trust anchor), the way `pipeline-state-result-bootstrap.test.mjs` signs.
   No real PO key is involved. Consequence for the product: every consumer feature close with a registered package meets one PO signature BEFORE the
   close, in addition to the push approval (not changed here, noted for the PO).

4. Measured (new, the decisive carry question, partly answered): the Critic-bound candidate Verify
   (`verify-evidence-producer.mjs --mode candidate --critic-packet-id P --critic-evidence-feature-id e2e`) carries the Critic bound at the
   reviewed candidate across the three commits that follow it on the realistic course (diagnostic registration, Critic export, Result bind + signed
   reconcile) and passes, on all three runner identities. It passes ONLY when the export is committed as two evidence-only commits: the three
   export files alone, then the manifest and the lineage file. The single combined commit that the export's own output tempts (export files +
   lineage file + changed `lifecycle.json`) is classified as a content commit and the Verify refuses `VEP-CVL-CARRY-CONTENT-CHANGED` ("Critic
   carry-forward range contains unreviewed content"): `lib/critic-course-admission.mjs` `criticExportOnlyCommit` admits a commit only when every changed
   path is an `A` entry under `evidence/critic/<packet>/`, `evidenceOnlyCommit` does not admit a commit that carries export files, and the
   administration route vetoes `evidence/critic/**` (`lib/administration-documentation-paths.mjs`). The skill text names the lineage commit as a separate
   step (critic-review skill, PF-94 step 3) but the export prints no such order. Not decided here: whether this is a product break to fix
   (candidate fix, smallest: `criticExportOnlyCommit` also admits the lineage file and the manifest change the export itself registers, with its own
   regression case) or a documentation gap (the export output names the two-commit order). Left unbuilt: it needs a decision; the walk follows the
   sanctioned two-commit order.

5. Finding 4 DECIDED by the coordinator as a product break and FIXED at its cause (clone commit `0919af47b`): `criticExportOnlyCommit`
   (`lib/critic-course-admission.mjs`) now also admits the single commit that holds exactly what the export itself produced: the export files, the
   `specs/<feature>/evidence/critic-lineage-<sha256>.json` file(s) (named by their own digest, naming a packet exported in the same commit) and the
   `specs/<feature>/lifecycle.json` change; the expected manifest is RECOMPUTED (manifest before + exactly those lineage entries, canonical digest
   equality), never admitted by path alone; anything else in the commit is refused as before. Regression cases (inside the N23 case of
   `lib/critic-verify-lifecycle.test.mjs`): the combined commit is an export commit and carries (`evidenceOnlyCommits` = that commit); five tampered
   forms (lineage named by another digest, manifest entry with another digest, an extra manifest artifact, a lineage file without its entry, a lineage
   file naming another packet) are refused. The case run alone (`--name N23`) is green. Test-first honesty: the tamper loop was seen failing before the
   fix; the positive combined-commit assertion was NOT isolated RED before the fix. No new import in a kernel file (GMWKC01 not affected, not run).
   UPDATE (second grant): the walk now commits the export, the lineage file and the manifest entry as ONE commit and passes the Critic-bound candidate
   Verify with the REAL lineage record on all three runner identities (clone commit `e39de4bf1`, the patch is saved at that commit). The whole
   `lib/critic-verify-lifecycle.test.mjs` is green after the fix (30 tests, 30 pass). `lib/critic-course-admission.test.mjs` was started once, alone, and had
   NOT reported a result when the budget checkpoint arrived (the runner buffers its output); it is NOT verified. The clone's working tree carries
   UNCOMMITTED, UNRUN walk edits that are NOT in the patch: the package side of the audit route (`--add-verify-evidence`, `feature-package-plan`/`-apply`
   to verifying and completed), the audit request built from the lifecycle id found in the private lifecycle directory, `feature-close-prepared` with
   the audit route, the push gate configured in the fixture manifest from the start (standing approval), and step 5 (push-mode Verify with
   `--critic-packet-id`, then `hooks/guard-push.mjs` as a child process). The release preflight (`createReleasePreflight` through
   `release-preflight-cli.mjs` needs the documentation reader binding) is not started.

## Fixture findings (not product breaks)

- The project authority tier is selected by the `project/pipeline.json` twin: the State lives in `project/pipeline-state.json`, not `.claude/`.
- The calibration `project` must equal the repository directory's base name (`PCI-NAME-MISMATCH`); the fixture root is named `repo`.
- The Critic request is v2 (`review.courseContext`) for the course; the export registers the lineage itself, so `--add-review-lineage` reads back
  `already-registered`.
- The fixture lives under the checkout's `scratch/` (`nativeContractFixtureParent()`): the authority walk refuses the world-writable temp directory.

## Not done (next steps, in the order the sanctioned flow gives them)

1. Audit route (the candidate Verify bound to the Critic packet is DONE and green, see decision 4; the walk ends right after it with a `continue`
   guarded by `G2035_STOP_AT_AUDIT`): `register-feature-package.mjs --add-verify-evidence` for that evidence, `feature-package-plan`/`-apply` with `--next-state verifying` then
   `completed` (package candidate equal to HEAD; nothing committed in between; may need one more reconcile signature), the audit request file
   (`pipeline.feature-close-audit-request.v1`, `packs: ["pipeline-core-baseline"]`), then `feature-close-prepared --audit-request --critic-verify-lifecycle`.
2. The rest of the close chain (already green in w264 for the bare close), then the push-boundary Verify, `hooks/guard-push.mjs` as a child process
   with a fixture push approval, and `createReleasePreflight` (shape: `scripts/release-preflight-cli.test.mjs`).
3. The decisive question stays OPEN: is the Critic bound at the close carried across the close's own commits to the pushed commit
   (`lib/critic-verify-lifecycle.mjs` `inspectConsumedCriticEvidenceCarryForward`, the administration/documentation carry route)?

## Not changed

`lib/path-spelling.mjs`, the separator-sweep sites, `harness/verify-suites.json` (the walk is already registered), any product file, the walk's
w264 steps that are still valid (scanner injection, drive readback, the close chain after the refusal is kept in the test, guarded by the
`G2035_STOP_AT_AUDIT` environment switch so the checkpoint is green).

## Not proven

The audit route, the close on the realistic course, the carry of the bound Critic to the pushed commit, the push gate decision with a fixture
approval, the release preflight, a signed push approval, full Verify, Critic review, PO acceptance, Windows/macOS (the fixture uses the POSIX private-profile
write only). `git apply --check` in the real repository is expected to fail until the w264 chain is applied in order.
