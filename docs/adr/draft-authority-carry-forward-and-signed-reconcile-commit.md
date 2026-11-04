# ADR: Authority carries forward across features and evidence-only commits, and a signed reconcile commits its own files

Status: Proposed (draft for an independent review; the PO decided on 2026-11-03 to build it in candidate 19 as an opt-in block of the apply script, so the PO's act of applying or leaving out the patches is the final gate; EL-04)

Date: 2026-11-03

## Context

Three greenfield runs of candidate 18 met the same defect family: authority that was granted once is thrown away by a step that changed no product line.

- **Architecture receipt of the predecessor (Codex, P0).** `lib/architecture-design.mjs` (the materialization check, line 287) compares the whole `architecture/design-materialization.json` with a receipt rebuilt for the current feature. The receipt binds `featureId` and `planPath`, so the next feature, even a purely administrative one over an unchanged design, fails with `ARCHITECTURE-DESIGN-RECEIPT-STALE`. The report's conclusion was that the Pipeline offers no supported transition and the agent may neither delete nor rewrite the receipt.
- **Evidence-only commits (Antigravity D4, Claude E3).** A late `project/push-threat-model.md`, the exported Critic evidence and the registration commit each move HEAD and the tree although no product file changed. Verify and Security evidence is bound to the exact commit, so every one of these commits made it stale and forced a second Critic round and a second Verify with no product change.
- **Signed reconcile (Antigravity D3).** `feature-package-plan --reconcile` writes `lifecycle.json` and `result.md` into the tracked tree before the PO signs; the signature step then refuses (`repository must be clean before preparing a PO approval request`, `po-approval-request.mjs`). After the PO signed the reconcile, the pre-commit hook still refused to commit exactly those files (`PB-CONTINUITY-<feature>-result`), so a second override signature was needed. Five signatures instead of two in one run; a second design signature in the Codex run came from a schema value that no step had checked before the first review.

All four are the same design question: what is granted by a signature or an accepted receipt, and when does it stay valid.

## Decision (proposed)

1. **Design inheritance by equality.** A typed, idempotent command re-binds the architecture receipt for a new feature when the design package it would materialize is byte-equal to the one of the accepted predecessor (`designSha256` and every target digest equal). It writes a new receipt that names the predecessor (`inheritedFrom: {featureId, planPath, designSha256}`) and binds the new feature and plan. Any difference, however small, falls back to the full materialization of today. Nobody deletes or edits a receipt by hand; the check at line 287 accepts a receipt that is either exact for this feature or an inheritance receipt whose recorded predecessor is accepted and whose design digest equals the current package. **Accepted predecessor** means: a feature that is closed in the closed-feature audit, whose own receipt is an exact materialization receipt (never itself an inheritance receipt). An inheritance receipt therefore names the materializing feature directly, the chain has depth one, and a successor of a successor re-names the original.
2. **Evidence-only commits carry Verify and Security forward.** Define a closed set of evidence paths in plugin source (not project configuration), by record class and not by file type: the feature's `evidence/**`, `audit-bundles/**`, the generated `lifecycle.json` and `result.md` of the feature package, and the single named gate record `project/push-threat-model.md`. Everything else is product-bound and never in the set, in particular the feature spec, plan and PRD under `specs/<feature>/`, `project/guard-config.json` and every other `project/` file, and any source, script or configuration extension. Verify and Security evidence additionally records `productTreeSha256`, the hash over the tree entries outside the set. A commit range whose changed paths all lie inside the set leaves `productTreeSha256` equal, so Verify evidence bound to the earlier candidate is carried forward and names the evidence-only commits it passed over. **Security evidence is carried forward only together with a secret scan of the files changed by the passed-over commits**, run by the reader at the carry-forward moment; when that scan is unavailable or reports a finding, the Security evidence is not carried (fail closed). Anything outside the set, or a changed `productTreeSha256`, invalidates exactly as today. **Critic rounds are not carried forward by this decision:** their rules are bound to the exact previous reviewed candidate and no reader consumes such a carry-forward; it stays an open question.
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
2. Should a Critic carry-forward exist at all, given the exact-previous-candidate rule for correction reviews? It needs a named reader and a rule for the correction base before it can be built.
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

## Proposed amendment of 2026-11-04: one definition of "evidence-only", one shared freshness function

Found by reading the code after the first build stage (patch w156, which is inert): the push boundary already carries Verify and Security across record-only commits through the release-promotion envelope (`lib/release-promotion-envelope.mjs`, `RECORD_ONLY_PATH_PATTERNS`, used by `hooks/guard-push.mjs` and `scripts/push-prepare.mjs`), and the Critic delta course has a third, narrower test (`lib/feature-package-registration.mjs`). Three definitions of "may change without invalidating a record" is itself a trust-boundary hazard, so point 2 is amended before any reader is wired:

- **One path set, owned by one module.** The base is the set the production envelope already uses (reviewed and in force). The two classes this ADR needs and the envelope lacks, `specs/<feature>/audit-bundles/**` and `project/push-threat-model.md`, are added as a named extension that the envelope does not accept until it has been reviewed for them. The Critic delta course keeps its own narrower test on purpose (it answers a different question: whether a commit is a correction candidate); it is not widened.
- **The wider members of the envelope set are acknowledged, not silently adopted:** `backlog/**`, `docs/state.md` and the two pipeline-state files are not product code, but they are consumed by gates. Carrying a Security record across them needs the secret scan of point 2 like any other path; Verify may be carried across them only if the independent review of this amendment confirms that no Verify suite reads them as input. Until then the carry-forward decision of w156 keeps its narrower set and refuses these paths.
- **One shared freshness function** replaces the four hand-written comparisons (`hooks/guard-push.mjs`, `lib/security-completeness-gate.mjs`, `scripts/push-prepare.mjs`, and the template of the managed pre-push hook in `scripts/pre-push-hook-install.mjs`), returns a stable code next to the message (today `scripts/push-gate-satisfiability.mjs` classifies by the substring `is stale (HEAD is`), and the hook template loads it by dynamic import as it already does for the security completeness gate. The envelope stays one input of that function, not a second path next to it.
- **Order of work:** (1) the shared module with the single path set and no behaviour change, pinned by the existing push suites; (2) the shared freshness function with stable codes, still exact-commit only; (3) the carry-forward branch behind its own opt-in. No stage widens what a push accepts before the independent review of this amendment.

This amendment has had no review. It changes nothing in code.

## Not decided

Nothing is built by this draft. It needs an independent review (fresh context, ADR-0014 contract); the patches follow in the apply script behind their own opt-in block.
