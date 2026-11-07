# w267: a reconcile that moves only the fence-proven Result digest of an unchanged approved package runs without a PO signature (candidate 20, G20-38, AC-108)

Base: `f4e9c1d3d` (the candidate-20 build chain after the w266 integration). Built in the slice clone `scratch/agent-out/s-rec`. One held patch
(`w267-c20-agent-reconcile.patch`); it applies on top of the chain, so `git apply --check` in the real repository is expected to fail until the
chain is applied in order. Closest criterion: AC-108 (PRD and Spec unchanged). PO decision 2026-11-07 ("Agent bei unveraendertem Paket"):
unchanged approved package = the agent runs the reconcile and shows the readback; a changed package keeps the PO signature.

## What the patch changes

- `lib/feature-package-topology.mjs`: `planFeaturePackageReconcile` sets `requiredAuthority` from its own recomputed `changes`:
  `"agent"` when every change is `result`-class (the fence-proven digest move and the N29 authority lift of the sole Result entry), `"po"` otherwise.
  It is part of the plan object and so of the `--plan-sha256` digest. New export `reconcilePlanIsResultOnly(plan)` (also checks `status` and
  non-empty `changes`); a legacy Result repair plan, a rejected or noop plan and any plan that also moves a non-result entry are `false`.
- `scripts/pipeline-state.mjs`:
  - `runFeaturePackageReconcileCommand` computes `agentRunnable` from the freshly recomputed plan and hands it to the approval closure
    (never read from the caller). Journal, writer lock, readback before retirement, the dry-run precheck and `armReconcileCommitCapability` are untouched
    and run for both routes. The receipt of an agent-run reconcile carries `approval: { basis: "agent-result-only-reconcile-no-po-proof", poProof: false }`
    next to the existing `changes` (the before and after digests) and `manifestSha256`: the receipt is the readback.
  - `defaultFeaturePackageReconcileApproval`: when `agentRunnable` and the call carries NO `--by` and NO proof flag, it writes the same private
    ledger record kind (`feature-package-reconcile`) with `approvedBy: "agent"`, `criticalProof: null` and
    `criticalProofWaiver.mode = agent-result-only-reconcile-no-po-proof` (labelled on its face the way a waived proof is, never a PO approval).
    A caller that passes `--by` or any proof flag keeps the PO-bound route exactly as before, whatever the plan is. A plan that also changes a
    non-result entry gets `agentRunnable: false`, so a call without a proof is still refused (`FTP-RECONCILE-APPROVAL-REJECTED`, zero mutation).
  - `resultBootstrapCompletion`: for a result-only plan there is no `signatureCommand` / `signatureUnavailable`; `reconcileCommand` has no placeholders and
    `requiredInputs: []`; `nextAction` says the agent runs it, with no PO signature and no proof flags, and names the receipt as the readback. The PO plan and
    the legacy repair plan are unchanged. `ALWAYS_REQUIRED_KINDS` still holds `feature-package-reconcile` (the PO route still needs it).
- `lib/critical-action-authorization.mjs`: exported label `AGENT_RESULT_ONLY_RECONCILE_BASIS`. `lib/human-approval-trace.mjs`: such a record is reported
  as `attribution-only` with mode `agent` instead of `PROOF-MISSING`/`untraceable` (it claims no proof, and says so).
- `skills/close-feature/SKILL.md`, section "Closing a feature with active Continuity: the ordered route": step 3 says to read `preview.requiredAuthority`
  first; `"agent"` = no signing step, run `reconcileCommand` yourself and show the receipt; `"po"` = steps 4 and 5 as before. `lib/close-chain-guide.mjs`
  and one `close-coordinator.mjs` message say the same (text only).
- Tests: `scripts/pipeline-state-result-bootstrap.test.mjs` (three new G20-38 cases; N29 `requiredAuthority` and the N30/N31r cases that needed a
  signing route restated in place with a G20-38 comment onto a plan that ALSO changes a non-result entry, every assertion kept),
  `lib/human-approval-trace.test.mjs` (one new case), `scripts/close-path-e2e.test.mjs` (the fixture-signed reconcile step is replaced by the agent-run
  one; a non-result drift case asserts the PO plan, its signing command and the refusal without a proof, then restores the bytes). Only the reconcile step of
  the walk is touched, so the G20-39 patch (Critic finalize and close-gate steps) merges.

## Why

w265 decision 3 measured that every consumer feature close with a registered package costs one extra PO-signed reconcile although the plan only moves
the Result the agent itself produced. The approved package is unchanged in that case: every other artifact keeps the digest the approved manifest pins.

## Not changed

`lib/path-spelling.mjs`; `ALWAYS_REQUIRED_KINDS`; the push, publication and `accept-residual-critic-findings` proof paths; the journal / lock /
readback machinery; `armReconcileCommitCapability` (see risk below); the legacy Result repair plan (stays PO-signed); the protected
`harness/scripts/pipeline-state.test.mjs` (its RG fixtures drift the PRD, so they still demand the approval; verified by reading, not edited).
`lib/close-chain-guide.mjs` still lists `reconcile-signature` as the `po-only` next human gate (its `command` text now says "only when
requiredAuthority is po"); making that list plan-aware is a follow-up.

## Risks and open points

- `armReconcileCommitCapability` stamps any non-`signature` approval mode as a chat-attributed human-guard-override record in its audit event. For an
  agent-run reconcile that label is "chat-attributed-unattested" (true: nobody attested), but it does not name the agent route. It only fires when a
  reconcile file matches a protected test-path rule that already has history (rare for `lifecycle.json` / `result.md`). Left as briefed.
- Like the signed route, the ledger record is written before the journal is published; a failure after it leaves a record for an unapplied reconcile.
- The result-only decision is the recomputed plan itself; a caller that passes `--by` or proof flags still takes the PO route, which can only make the
  route stricter.

## Not proven

Full `harness/scripts/pipeline-state.test.mjs` (protected, not edited); Verify; Critic review; PO acceptance; Windows/macOS; the other close
walks of the G20-39 sibling patch together with this one.
