# D190 residual-finding acceptance: partial slice (RED cases only)

Status: CHECKPOINT. The patch contains ONLY the RED cases; no production edit exists. Targeted delivery: blocked (budget).

## Stacking

The patch is the diff against the state "candidate 62532c7ff plus the committed budget patch
(w7-d190-critic-delta-rounds-are-not-capped.patch)". Apply order: budget patch, then this patch.
Apply check of the stacked patch was NOT run (no third-clone check done; the patch touches only
plugins/pipeline-core/lib/critic-verify-lifecycle.test.mjs).

## Read results (verified in the repository)

- recordCriticVerifyLifecycle -> readBoundConsumedCriticReceipt refuses `reviewPass !== true` with
  CVL-CRITIC-FAILED (critic-verify-lifecycle.mjs line 74). The same function runs on readback, so
  readback needs the same acceptance dependency.
- The receipt carries only `verdictSha256` and `findingCount`, NOT finding ids or severities. The open
  findings live in the consumed result (`readConsumedCandidateResult(...).result.verdict.findings`),
  and verdict findings have no `id` field (required: gap, risk, severity, evidence, spec_ref).
  Recon premise "finding ids" therefore needs a derived id: chosen `residualFindingId(f) = sha256(canonicalJson(f))`.
- Authorization route (critical-action-authorization.mjs): verifySignedAction is kind-generic
  (kind, candidate, subject digest, intent, anchors); authorizeRecordedPush and authorizeRecordedDeploy
  use it; authorizeRecordedChatPush is the chat route (waiver via criticalProofWaiverFor, record in
  state.pushApproval.lastApproved). A recorded authorization binds commit, tree, a subject digest and
  the plan/spec authority; modes diverge in push: signature = detached proof + ledger entry, chat =
  waiver plus labelled attribution record. NOT verified: whether criticalActionSubjectSha256 accepts a
  new kind without editing its module (a lookup of lib/critical-action.mjs failed, wrong filename).

## Chosen design (not implemented)

1. New action kind `accept-residual-critic-findings`; subject = {candidate commit, tree,
   criticReceiptSha256, sorted [{id, severity}]}. Authorized through a new function in
   critical-action-authorization.mjs modelled on push (signature via verifySignedAction, chat via the waiver).
2. recordCriticVerifyLifecycle/readCriticVerifyLifecycle get optional deps: `readOpenFindingsFn`
   (default: consumed result verdict.findings), `residualAcceptance` (the recorded acceptance) and
   `verifyResidualAcceptanceFn` (the proof/chat check, wired to the authorization function).
   A failed receipt passes only if findings are non-empty, count equals receipt.findingCount, every
   severity is "minor", the acceptance binds the same commit, tree, receipt sha and the exact sorted
   id/severity list, and the verify function returns authorized. Otherwise CVL-CRITIC-FAILED stays.
3. The written record uses schema `pipeline.critic-verify-lifecycle-receipt.v3` with an extra key
   `residualAcceptance {basis: "po-acceptance-of-residual-minor-findings", mode, acceptanceSha256, findings}`;
   a passing receipt keeps v1 and is byte-identical.
4. push-prepare.mjs refusal (about line 752) gets one closing sentence naming the authorize-critical route
   for this kind and that CCA-REVIEW-BUDGET-EXHAUSTED is a PO decision (pin in push-prepare.test.mjs is a text pin; not touched yet).

## RED evidence

Cases added to the existing lifecycle suite (5 new tests): (a) minor-only acceptance qualifies and the
record is labelled, incl. readback; (b) a major finding is refused despite an acceptance; (c) other commit,
tree, receipt, or finding list differing by one id refused; (d) missing/unverified acceptance refused, chat
and signature modes both pass the injected verify; (f) a passing receipt unchanged.
Run in the clone (budget patch applied): `node plugins/pipeline-core/lib/critic-verify-lifecycle.test.mjs`
exit 1, SyntaxError: module does not provide an export named `residualFindingId`. The whole file is RED
(import failure), so the cases are RED against the original code. They were not run GREEN.

## NOT done

Production edits (lifecycle, authorization function, push-prepare sentence); authorization-suite and
push-prepare-suite cases; GREEN runs; whole-suite failing-name comparison against clone2; kernel-closure,
finalizer, push-prepare, po-human-approval, architecture-overview checks; revert proof; stacked apply
check; po-human-approval/pipeline-state wiring to record the acceptance; production wiring of deps into
critic-verify-readiness (needed for the push gate to qualify). Kernel-path listing not checked.

## Operator flow (once completed)

Apply budget patch, then this patch; `git add -u` with a path limit; commit as the PO; stamp; install.
An independent Critic review stays a parent-owned batch gate.

Proposed commit message: feat(critic): let the PO accept residual minor findings through the configured approval mode so the push gate can qualify the candidate

## Continuation

Next slice: implement the lifecycle branch and `residualFindingId` export (design item 2-3), run the new cases
GREEN, then the authorization function and push-prepare sentence. The scratch driver and clones are removed
at cleanup; recreate them from the patch.
