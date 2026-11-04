# ADR: Authority carries forward across features and evidence-only commits, and a signed reconcile commits its own files

Status: Accepted (PO decision of 2026-11-04 at the sitting: point 2 and the amendment of 2026-11-04 are built and ACTIVE by default; the safeguards of point 2 stay; the order of work of the amendment is kept; EL-04). Points 1, 3 and 4 are decided as written; their build is tracked by their own items.

Date: 2026-11-03 (accepted 2026-11-04)

Decision line: the PO decided on 2026-11-04 that a Verify or Security record is carried across evidence-only commits by default, through one shared freshness verdict used by the push guard, `push-prepare`, the security completeness gate and the managed pre-push hook. The closed evidence set, the product tree hash equality, the ancestor check, the clean secret scan of the passed-over commits for Security evidence, fail closed on any doubt and the named list of passed-over commits stay. There is no complete Critic carry-forward; the Critic evidence of an earlier reviewed commit stays valid only across commits that are administration or documentation only (open question 2, decided by the PO on 2026-11-04, see the amendment below).

## Context

Three greenfield runs of candidate 18 met the same defect family: authority that was granted once is thrown away by a step that changed no product line.

- **Architecture receipt of the predecessor (Codex, P0).** `lib/architecture-design.mjs` (the materialization check, line 287) compares the whole `architecture/design-materialization.json` with a receipt rebuilt for the current feature. The receipt binds `featureId` and `planPath`, so the next feature, even a purely administrative one over an unchanged design, fails with `ARCHITECTURE-DESIGN-RECEIPT-STALE`. The report's conclusion was that the Pipeline offers no supported transition and the agent may neither delete nor rewrite the receipt.
- **Evidence-only commits (Antigravity D4, Claude E3).** A late `project/push-threat-model.md`, the exported Critic evidence and the registration commit each move HEAD and the tree although no product file changed. Verify and Security evidence is bound to the exact commit, so every one of these commits made it stale and forced a second Critic round and a second Verify with no product change.
- **Signed reconcile (Antigravity D3).** `feature-package-plan --reconcile` writes `lifecycle.json` and `result.md` into the tracked tree before the PO signs; the signature step then refuses (`repository must be clean before preparing a PO approval request`, `po-approval-request.mjs`). After the PO signed the reconcile, the pre-commit hook still refused to commit exactly those files (`PB-CONTINUITY-<feature>-result`), so a second override signature was needed. Five signatures instead of two in one run; a second design signature in the Codex run came from a schema value that no step had checked before the first review.

All four are the same design question: what is granted by a signature or an accepted receipt, and when does it stay valid.

## Decision

1. **Design inheritance by equality.** A typed, idempotent command re-binds the architecture receipt for a new feature when the design package it would materialize is byte-equal to the one of the accepted predecessor (`designSha256` and every target digest equal). It writes a new receipt that names the predecessor (`inheritedFrom: {featureId, planPath, designSha256}`) and binds the new feature and plan. Any difference, however small, falls back to the full materialization of today. Nobody deletes or edits a receipt by hand; the check at line 287 accepts a receipt that is either exact for this feature or an inheritance receipt whose recorded predecessor is accepted and whose design digest equals the current package. **Accepted predecessor** means: a feature that is closed in the closed-feature audit, whose own receipt is an exact materialization receipt (never itself an inheritance receipt). An inheritance receipt therefore names the materializing feature directly, the chain has depth one, and a successor of a successor re-names the original.
2. **Evidence-only commits carry Verify and Security forward.** Define a closed set of evidence paths in plugin source (not project configuration), by record class and not by file type: the feature's `evidence/**`, `audit-bundles/**`, the generated `lifecycle.json` and `result.md` of the feature package, and the single named gate record `project/push-threat-model.md`. Everything else is product-bound and never in the set, in particular the feature spec, plan and PRD under `specs/<feature>/`, `project/guard-config.json` and every other `project/` file, and any source, script or configuration extension. Verify and Security evidence additionally records `productTreeSha256`, the hash over the tree entries outside the set. A commit range whose changed paths all lie inside the set leaves `productTreeSha256` equal, so Verify evidence bound to the earlier candidate is carried forward and names the evidence-only commits it passed over. **Security evidence is carried forward only together with a secret scan of the files changed by the passed-over commits**, run by the reader at the carry-forward moment; when that scan is unavailable or reports a finding, the Security evidence is not carried (fail closed). Anything outside the set, or a changed `productTreeSha256`, invalidates exactly as today. **Critic rounds are not carried forward by this decision:** their rules are bound to the exact previous reviewed candidate and no reader consumes such a carry-forward; the PO decided on 2026-11-04 (open question 2) that only the Critic evidence across administration and documentation only commits stays valid, see the amendment of that date.
3. **A signed reconcile commits its own files.** The reconcile plan writes its proposal to the control directory in the git common directory (which `git status` never counts), never to a tracked path and never to `scratch/` (hosted projects do not ignore `scratch/`, so an untracked proposal there would break the clean-tree precondition it is meant to protect). The signed apply writes the tracked files and deposits one commit capability bound to exactly those paths and their bytes (the proof already binds them); the pre-commit hook consumes it once. The capability covers nothing else and expires with the apply window.
4. **The agent checks before the human is asked.** The prepare step of every signature ceremony runs the checks an agent can run itself: clean tree (with the repair command), the official parser of the design or package, and the schema value checks, and refuses with a repair before any signature is requested. The PO is only asked once everything the agent can verify has passed.

## Trust analysis

- Point 2 moves a trust boundary: candidate equality over a subtree. The risks are a product change hidden under an evidence path, a spec or guard-configuration change that a carried verdict never saw, and a secret committed in an evidence file. Mitigations: the set is closed by record class and defined in plugin source (data file types alone are not enough, because gates, guards and code consume data files, so specs, plans and `project/` configuration are product-bound), the product hash covers everything else, Security evidence is carried only after a fresh secret scan of the passed-over changes (SEC-01), and the carry-forward record names the passed-over commits so an auditor can re-check them.
- Point 1 weakens nothing for a changed design (full materialization) and removes only a restatement of equal bytes. The predecessor must be closed and exactly materialized, so an un-closed or merely inherited predecessor is not accepted.
- Point 3 narrows today's two-signature behaviour to one signature that already binds the bytes; it adds no new authority beyond those exact paths and bytes.
- Point 4 is agent-side only and grants nothing.

## Consequences

- A second feature over an unchanged design no longer needs a repeated architecture step; a feature close needs one signature for the reconcile instead of two; the evidence loop stops forcing a second Critic and Verify round for evidence-only commits.
- Test surface: the materialization check, the verify and security evidence readers (push guard, close coordinator), the pre-commit capability journal, the prepare steps of the ceremonies.
- Existing evidence without `productTreeSha256` keeps its exact-commit meaning (no silent upgrade).

## Alternatives considered

- Leave everything as is: safe, but it costs the PO signatures and review rounds for no product change, and the Codex run could not continue at all.
- Let the agent rewrite the receipt: it hands the receipt authority to the party it constrains.
- Widen candidate equality to the whole tree minus a configurable ignore list: project-controlled, so not a boundary.

## Open questions for the review

1. Is the record-class evidence set (point 2) tight enough now, and does a calibration need another named gate record besides `project/push-threat-model.md`?
2. Should a Critic carry-forward exist at all, given the exact-previous-candidate rule for correction reviews? DECIDED by the PO on 2026-11-04: there is no complete Critic carry-forward, but the gates keep the Critic evidence of an earlier commit valid when every following commit is administration or documentation only (see the amendment "Critic evidence across administration and documentation only commits").
3. Where is the capability of point 3 stored (the existing human-guard-override journal) and how does it interact with the stale-window checks?

(Resolved by the review of 2026-11-03: the predecessor's close state is bound, see point 1.)

## Review disposition (independent Critic review of 2026-11-03, findings F1-F3, F6-F8 of this document)

- F1 (evidence set included specs and guard configuration): fixed in point 2 and the trust analysis.
- F2 (Security carried over secret-prone files): fixed, a secret scan of the passed-over changes is a precondition.
- F3 (`scratch/` is not ignored in hosted projects): fixed in point 3, control directory only.
- F6 (the review object's commit exceeded the design trailer path cap): accepted; later commits of this candidate keep ADR drafts and held-patch files in separate commits.
- F7 (Critic carry-forward had no reader): removed from the decision, kept as open question 2.
- F8 (accepted predecessor undefined): fixed in point 1.

The revised text has not had a second review; the review budget is spent on a working local candidate first (PO decision 2026-11-03).

## Amendment of 2026-11-04 (accepted): one definition of "evidence-only", one shared freshness function

Found by reading the code after the first build stage (patch w156, which is inert): the push boundary already carries Verify and Security across record-only commits through the release-promotion envelope (`lib/release-promotion-envelope.mjs`, `RECORD_ONLY_PATH_PATTERNS`, used by `hooks/guard-push.mjs` and `scripts/push-prepare.mjs`), and the Critic delta course has a third, narrower test (`lib/feature-package-registration.mjs`). Three definitions of "may change without invalidating a record" is itself a trust-boundary hazard, so point 2 is amended before any reader is wired:

- **One path set, owned by one module.** The base is the set the production envelope already uses (reviewed and in force). The two classes this ADR needs and the envelope lacks, `specs/<feature>/audit-bundles/**` and `project/push-threat-model.md`, are added as a named extension that the envelope does not accept until it has been reviewed for them. The Critic delta course keeps its own narrower test on purpose (it answers a different question: whether a commit is a correction candidate); it is not widened.
- **The wider members of the envelope set are acknowledged, not silently adopted:** `backlog/**`, `docs/state.md` and the two pipeline-state files are not product code, but they are consumed by gates. Carrying a Security record across them needs the secret scan of point 2 like any other path; Verify may be carried across them only if the independent review of this amendment confirms that no Verify suite reads them as input. Until then the carry-forward decision of w156 keeps its narrower set and refuses these paths.
- **One shared freshness function** replaces the four hand-written comparisons (`hooks/guard-push.mjs`, `lib/security-completeness-gate.mjs`, `scripts/push-prepare.mjs`, and the template of the managed pre-push hook in `scripts/pre-push-hook-install.mjs`), returns a stable code next to the message (today `scripts/push-gate-satisfiability.mjs` classifies by the substring `is stale (HEAD is`), and the hook template loads it by dynamic import as it already does for the security completeness gate. The envelope stays one input of that function, not a second path next to it.
- **Order of work:** (1) the shared module with the single path set and no behaviour change, pinned by the existing push suites; (2) the shared freshness function with stable codes, still exact-commit only; (3) the carry-forward branch, then moved onto all four comparison sites. Built in that order (stages 1 to 3 as inert or opt-in patches, then the rest: the hook template and the security completeness gate take the shared verdict, and the carry-forward is active by default).
- **Built behaviour (2026-11-04):** the four comparison sites give the same verdict for the same input and keep their own message text with the stable code next to it (`EF-STALE-COMMIT` and its siblings; a refused carry adds the reason, for example `carry-forward refused: PRODUCT-PATH-CHANGED`). A Security record that binds a commit and a tree (the v1 candidate, the v2 envelope) is checked against the commit and tree it was produced for once it is carried; the secret scan covers the range from that commit to the pushed one. The `push-prepare` report and the pre-push hook log name the passed-over commits. A real push through the guard and through the hook template is pinned by `lib/push-gate-real-decision-carry.test.mjs`.
- **Wider members of the envelope set:** `backlog/**`, `docs/state.md` and the two pipeline-state files stay outside the carry-forward set; only the envelope accepts them, as before.

The independent review of this amendment is not done; the PO accepted the amendment on 2026-11-04 on the strength of the built safeguards and the pinned real-decision cases.

## Amendment of 2026-11-04 (PO decision on open question 2): Critic evidence across administration and documentation only commits

Decided by the PO on 2026-11-04: there is no complete Critic carry-forward, but the gates are built so that the Critic evidence of an earlier reviewed commit R stays valid for a candidate C when every commit after R was not content work, only administration or documentation.

- **One closed set, in plugin source.** `lib/administration-documentation-paths.mjs` names the classes: the record-only set of `lib/record-only-paths.mjs` as the base, Markdown files under `docs/` except `docs/adr/**` (a decision is content), README files inside the documentation trees, `backlog/**`, the generated `lifecycle.json` and `result.md` of a feature package, `specs/<feature>/evidence/**` and `audit-bundles/<feature>/**`. Everything else is content: source, scripts, configuration, schemas, tests, ADRs, the PRD, Spec and plan texts of a feature, the repository root README. Two vetoes stand over every class: the tracked Critic export (`specs/<feature>/evidence/critic/**`) and the Critic disposition addenda with the Markdown evidence they digest keep their receipt-bound and record-bound classifiers.
- **One decision.** `lib/critic-evidence-carry.mjs` decides, for R and C, whether R is an ancestor of C, the range is not empty and every path changed between R and C lies in the set as a regular, non-executable file; the answer names the passed-over commits. A content path anywhere in the range answers no; any fault answers no.
- **Wired where the exact previous reviewed candidate was demanded.** The private Critic and Verify lifecycle receipt (`lib/critic-verify-lifecycle.mjs`) takes the decision when the registered evidence-only classification does not carry the range; the close gate, the push readiness check behind `hooks/guard-push.mjs` and the Verify evidence producer all read that one receipt. The classification with the carry option passes administration-only commits over (the advisory of the close stays consistent), the correction candidate of the registration delta course skips them, and the course transport accepts them between the correction candidate and the registration commit. The course counters (classification without the option) are unchanged. `scripts/push-prepare.mjs` names the original reviewed commit and the passed-over commits in its readback.
- **Not decided here:** a Critic round is still required for any content change; a content change anywhere in the range invalidates exactly as before.

## Not decided

Point 2 and the amendment are built (see "Built behaviour"). Points 1, 3 and 4 are tracked by their own items; an independent review (fresh context, ADR-0014 contract) of the whole decision is still open and is batched for the Coordinator.
