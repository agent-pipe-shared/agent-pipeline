# W7 N29 held patch: a feature whose registered package carries its Result without authority can be closed

Slice W7-N29-CLOSE-WITHOUT-RESULT-AUTHORITY-20261030. Candidate 1b91f4f774e9b8d14e4bc6f832239b22577aeeb1.
Patch: `w7-n29-close-without-result-authority.patch` (applies to the plain candidate; the driver `patch` mode
apply-checked it in the baseline clone). Backlog item: `backlog/items/2026-10-30-close-feature-unreachable-without-result-authority.md`,
decision D206. Nothing committed: the host commits.

## Stages and the test that pins each

All tests are in `plugins/pipeline-core/scripts/pipeline-state-result-bootstrap.test.mjs` (the file that already owns
the registered-package fixtures; `close-coordinator.test.mjs` is outside the write scope, so the close lifecycle is
driven there by spawning `close-coordinator.mjs` exactly as that file does).

| Stage | Production change | Pinned by |
|---|---|---|
| (1) CLOSE-RESULT names the next step and the unmet condition | `close-coordinator.mjs` `authorityFromState`: message names the Implementation Result, `authority.result is null`, the exact `continuity-result-bootstrap-plan` command, the project root, the reconcile where the completion names one, and that the same lifecycle continues (no `plan-start` restart) | anchor test, step "CLOSE-RESULT" |
| (1b) CLOSE-PACKAGE on a package that only lags its bytes names the reconcile verb | `close-coordinator.mjs` feature-close-prepared package check: when every finding is a digest finding, the message names the PO-bound `feature-package-reconcile` plan | anchor test, step "stale" |
| (2) PS-RESULT-BOOTSTRAP-PACKAGE carries class, path and condition; the CLI prints it | `pipeline-state.mjs` `resultBootstrapPackage` returns `detail {class, path, condition}` at every refusal (eight conditions); `buildResultBootstrapPlan` passes it on; the plan refusal prints `class=... path=... condition=...` and keeps `PS-RESULT-BOOTSTRAP-PACKAGE` and `zero mutation` | negatives test (`entry-duplicate`, `path-mismatch`, `manifest-invalid`, `authority-false`, `entry-missing`); existing "registered package authority drift" test still matches the code |
| (3a) The bootstrap admits a package whose ONLY result-class entry sits at the canonical result path with the observed digest and authority false; prd and spec stay strict; the plan records the pending lift | `resultBootstrapPackage` returns `package.resultAuthorityLift: true` (inside `preimage.package`, therefore inside the plan digest) only in that case | anchor test (`p.preimage.package.resultAuthorityLift`), negatives (two result entries, another path, prd without authority) |
| (3b) The lift happens in the same PO-bound step the authority-true path already uses | `feature-package-topology.mjs` `planFeaturePackageReconcile`: the fence-proven digest move of the SOLE result-class entry (the fence already requires Continuity to bind that exact path and digest) also sets `authority: true`; the change object carries `authority: {from:false,to:true}`; `reconcileNoDriftOk(pre, post, {liftResultAuthorityPath})` admits exactly that one key move | anchor test (reconcile applied under the same `featurePackageReconcileApproval` seam as every other reconcile test; manifest compared entry by entry), no-drift test |
| (3c) Nothing wider | `reconcileNoDriftOk` default is unchanged; the lift needs class result, authority false to true, path equal to the one named, and a digest move; a prd, another path, a lowering, another key or a manifest key still refuses | no-drift test |
| (4) A close stopped at checkpointed continues without restarting | no coordinator change was needed: `feature-close-prepared` re-reads State, so after the bootstrap and the reconcile the same lifecycle passes the Result, close-request and package gates. The completion `nextAction` now names the reconcile command and the continuation | anchor test (`inspect` still reads `checkpointed`; `plan-transition` on the same lifecycle id passes CLOSE-RESULT, CLOSE-CONTINUITY, CLOSE-PACKAGE and CLOSE-PACKAGE-AUTHORITY) |

## Behaviour of the anchor and its honest edge

The anchor reaches the designed rigor gate: a registered package has integer rigor, so `resolvePublicationReviewRequirement`
returns `REVIEW-PACKAGE-REQUIRED` and `feature-close-prepared` then demands `--audit-request` and `--critic-verify-lifecycle`
(`CLOSE-QUALIFICATION-REQUIRED`). That is a separate, intended route (a real candidate-bound Critic/Verify lifecycle); the
anchor asserts the plan passes every authority gate of this defect and stops exactly there. It does not fabricate an audit.

Why the anchor does not continue onto the audit route (specific obstacle, read from `close-coordinator-audit-lifecycle.test.mjs`):
its fixture is about 80 lines that mint a committed, candidate-bound Critic/Verify lifecycle (`registerGenericCriticBatch`,
`admitSessionCriticReview`, `finalizeSessionCriticReview`, `recordCriticVerifyLifecycle`, a committed dispatch record, a package in
state `completed` with a frozen candidate, a clean tree at the audited commit). The bootstrap and the reconcile legitimately change
`result.md`, State and the manifest, so the audited candidate would have to be re-committed and the whole lifecycle re-minted after
them; and that fixture has no plan approval/submission that the bootstrap's `implementing` eligibility needs. The two fixtures do not
compose as a bounded in-file function. Evidence that the audit route itself already tolerates a Result entry without authority:
that fixture registers its `result` entry with `authority: false` and its 8 tests pass. The composed end-to-end close (bootstrap,
reconcile, audited `feature-close-prepared`, `close-feature`) is left to the Coordinator's integrated check.

The lifted entry keeps `mutability: immutable` with a moved digest. `validateFeaturePackage` reports an immutable rebind only when a
caller passes a `previous` manifest (line 183); no caller on the reconcile or close path does, and the anchor proves the postimage validates.

## Deviation to decide: `--root` on `continuity-result-bootstrap-plan`

The briefing asks for "the exact continuity-result-bootstrap-plan command with --root". The verb accepts no argument
(`rest.length !== 0` refuses), takes the project from the working directory or `CLAUDE_PROJECT_DIR`, is a controlled-method companion
entry whose argv shape is closed, and its returned apply action is a closed 13-argument form. Adding `--root` would change
that action shape and the companion routes, which are outside the briefed behaviours. The message therefore names the exact verb,
the root, and the two ways to select it (working directory or `CLAUDE_PROJECT_DIR`) and says the verb takes no `--root`.

## Downstream sweep

Searched `plugins/`, `docs/` and `harness/` for: `PS-RESULT-BOOTSTRAP-PACKAGE`, `requires a bound Implementation Result`,
`accepts no caller bindings`, `resultBootstrapPackage`, `registered feature package is inconsistent`, `reconcileNoDriftOk`,
`reconcile-digest`, `reconcile-drift`, `may only change artifact digest`, `obtain the PO-bound feature-package-reconcile`, `then apply it`.

- `resultBootstrapPackage` and the refusal: only `pipeline-state.mjs` and the bootstrap test file; no skill, template, agent or doc names the code.
- `CLOSE-RESULT`, `CLOSE-PACKAGE` messages: only `close-coordinator.mjs`; `close-coordinator.test.mjs` matches the codes, not the text (suite green).
- `reconcileNoDriftOk` (2 arguments) in `harness/scripts/pipeline-state.test.mjs` (RGb..RGb4): semantics unchanged for the 2-argument call (default options). That harness suite crashes at line 1252 (`legacy.planApproval` undefined) under the driver in both the plain candidate clone and the edited clone, so the RGb* pins after it are unreachable there; recorded as not verifiable, diagnosis left to the Coordinator (it is a TP-5 protected path, not touched). The 2-argument semantics are unchanged by construction (default options, same loop).
- `FTP-RECONCILE-DRIFT` finding text gained a parenthetical after the original sentence; the original sentence is intact.
- `planFeaturePackageReconcile` has three callers in `pipeline-state.mjs` (completion, `feature-package-reconcile`, postimage recompute); all call it with the Continuity result binding, so the lift is planned and re-derived identically by each and the `--plan-sha256` binding covers it.
- The same builder serves the Claude, Codex and Antigravity routes (no runner-specific branch in these functions).
- Next command after each changed step: bootstrap refusal -> names the entry to repair; bootstrap apply -> completion names the exact `feature-package-reconcile` command and plan digest and the continuation; reconcile -> manifest valid; close transition on the same lifecycle -> passes the authority gates. No new dead end or circle.
- Documentation (docs/, templates) was not edited (outside the write scope) and no hit named the changed texts.

## Evidence (machine-written logs under the scratch clone directory; commands run from the repository root)

Driver: `node scratch/agent-out/w7close/driver.mjs run LABEL "--test <file>"` (exit 0 = suite green).

- RED before any production edit (`red1`): bootstrap test file, 3 failing (the three N29 tests), 16 passing. Failure causes: CLOSE-RESULT text lacks the verb; PS-RESULT-BOOTSTRAP-PACKAGE has no detail; `reconcileNoDriftOk` ignores the lift option.
- GREEN in the clone: bootstrap test file `c1` 19 tests, 19 pass, 0 fail (16 existing + 3 new); `c2`: `close-coordinator.test.mjs` 35/35, `close-coordinator-audit-lifecycle.test.mjs` 8/8, `feature-package-topology.test.mjs` 1/1 (15 inner checks passed), pin `close-coordinator-refuses-a-required-critic-without-evidence` 14/14, pin `close-coordinator-refuses-a-scheduled-critic-slice` 7/7; `c4`: `pipeline-state-inspect.test.mjs` 26/26.
- Baseline clone (plain candidate): `base1` bootstrap test file 16/16, the same five other suites with the same counts, `base4` inspect 26/26. Failing-name sets: empty in both; the only difference is the three added tests.
- `c3`/`base3`: `harness/scripts/pipeline-state.test.mjs` exits 1 in both clones with the identical crash at line 1252; not verifiable.
- Revert proof (`revert`): with the three production files reverted to the candidate, the bootstrap test file fails exactly the three N29 tests (anchor, negatives, no-drift); production restored byte-equal.
- `patch` mode: patch written, `git apply --check` in the plain baseline clone exit 0.
- Not covered: Full Verify, batch Critic and PO acceptance (parent-owned, pending).
