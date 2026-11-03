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

1. **Design inheritance by equality.** A typed, idempotent command re-binds the architecture receipt for a new feature when the design package it would materialize is byte-equal to the one of the accepted predecessor (`designSha256` and every target digest equal). It writes a new receipt that names the predecessor (`inheritedFrom: {featureId, planPath, designSha256}`) and binds the new feature and plan. Any difference, however small, falls back to the full materialization of today. Nobody deletes or edits a receipt by hand; the check at line 287 accepts a receipt that is either exact for this feature or an inheritance receipt whose recorded predecessor is accepted and whose design digest equals the current package.
2. **Evidence-only commits carry Verify and Security forward.** Define a closed set of evidence paths in plugin source (not project configuration): the feature's `evidence/**`, `audit-bundles/**`, the generated lifecycle and result records, and bound JSON or Markdown records under `project/` and `specs/<feature>/`. Only data file types are in the set (`.json`, `.md`, `.txt`); a source or script extension never is. Verify and Security evidence additionally records `productTreeSha256`, the hash over the tree entries outside the set. A commit range whose changed paths all lie inside the set leaves `productTreeSha256` equal, so evidence bound to the earlier candidate is carried forward and names the evidence-only commits it passed over. A Critic round reviewed the product subtree and stays valid under the same equality. Anything outside the set, or a changed `productTreeSha256`, invalidates exactly as today.
3. **A signed reconcile commits its own files.** The reconcile plan writes its proposal to `scratch/` (or the control directory), never to a tracked path, so the tree stays clean for the signature step. The signed apply writes the tracked files and deposits one commit capability bound to exactly those paths and their bytes (the proof already binds them); the pre-commit hook consumes it once. The capability covers nothing else and expires with the apply window.
4. **The agent checks before the human is asked.** The prepare step of every signature ceremony runs the checks an agent can run itself: clean tree (with the repair command), the official parser of the design or package, and the schema value checks, and refuses with a repair before any signature is requested. The PO is only asked once everything the agent can verify has passed.

## Trust analysis

- Point 2 moves a trust boundary: candidate equality over a subtree. The risk is a product change hidden under an evidence path. Mitigations: the set is closed and defined in plugin source, only data file types are in it, the product hash covers everything else, and the carry-forward record names the passed-over commits so an auditor can re-check them.
- Point 1 weakens nothing for a changed design (full materialization) and removes only a restatement of equal bytes.
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

1. Is the closed evidence set (point 2) tight enough, and are `project/` records really data-only in all calibrations?
2. Should a carried-forward Critic round be limited to rigor 1 and below, or to a number of evidence-only commits?
3. Where is the capability of point 3 stored (the existing human-guard-override journal) and how does it interact with the stale-window checks?
4. Must the inheritance receipt of point 1 also bind the predecessor's close state (closed or approved)?

## Not decided

Nothing is built by this draft. It needs an independent review (fresh context, ADR-0014 contract); the patches follow in the apply script behind their own opt-in block.
