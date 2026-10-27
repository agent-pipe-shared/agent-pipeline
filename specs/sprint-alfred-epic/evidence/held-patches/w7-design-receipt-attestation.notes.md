# Held patch: the design-review receipt producer refuses a self-asserted observed identity or route as unattested

Slice W7-DESIGN-RECEIPT-ATTESTATION-C1-20261027 · candidate 400c6213db04d4abf1c93335b59d68a9a2e7d086 · item pipeline.greenfield.g8.design (bound to AC-127 only for the generator).
Patch: `w7-design-receipt-attestation.patch` (git diff --binary of a shared clone against the candidate, 7977 bytes, 2 files).

## Cause (re-verified against the clone; recon note lines matched)
`createReceiptFromDisk` (`plugins/pipeline-core/scripts/design-review-receipt.mjs`) accepted `requestedRoute` / `observedIdentity` as free flags and wrote `reviewer.model = observedIdentity ?? "unknown"`. Only a regex was checked; no dispatch record or host observation. A self-authored review could carry a self-asserted model. No source-owned dispatch evidence route exists yet (PO decision 2026-10-27), so the typed-unavailable outcome is delivered.

## Changed lines
- `design-review-receipt.mjs`: +5 lines after the K128 fallback validation block: if `(requestedRoute !== null || observedIdentity !== null) && fallbackReasonCode === null`, refuse with `DRC-OBSERVATION-UNATTESTED`. Shape validation (DRC-USAGE) still runs first. `RECEIPT_KEYS`, binding, signing untouched; default-path output unchanged.
- `design-review-receipt.test.mjs`: +69/-16.

## Interpretation decision (briefing tension, flagged)
The briefing says "a supplied observedIdentity or requestedRoute is refused" AND "the legacy fallback-route flags keep working". The fallback flow itself requires `requestedRoute` (DRC-USAGE without it) and the existing pin `lib/pins/role-route-preflight-with-self-dispatch-fallback.test.mjs` point 7e (outside my scope, must stay green) passes `--observed-identity` together with `--fallback-reason-code`. I therefore refuse route/identity only when NO `fallbackReasonCode` accompanies them; the typed fallback record (self-declared "not an independent review") remains the one carrier. Consequence: with a fallback, `reviewer.model` can still hold a self-supplied identity (pre-existing behaviour, unchanged). If the PO wants that closed as well, it is a follow-up (and would need that pin updated).

## Existing cases updated deliberately (justification)
- "a requested route is recorded as requested and never as executed" -> now asserts the route alone is refused as unattested (it pinned acceptance of a self-asserted route).
- "a supplied observation is recorded as observed ..." -> now asserts refusal for observedIdentity alone and with a route (pinned acceptance of `claude-opus-4-7`).
- "the command line reports role, requested route and observed identity separately" -> plain part kept unchanged; the observed-flags part now asserts exit 2, `status: refused`, `code: DRC-OBSERVATION-UNATTESTED`, nothing written.
Each tied to the PO decision above; no case weakened, skipped or deleted. Malformed-input case (DRC-USAGE for "has space", "", "two words") unchanged and still green.

## New cases
- refusal of requested route alone; of observed identity alone and with route
- same refusal on claude, antigravity, codex envs (9 combinations)
- control: default path, no flags, unknown on all three runners, no fallback key
- control: legacy fallback works with and without observed identity

## RED / GREEN
- RED (clone, unchanged code, `node --test` exit 1): 4 failing: the three refusal cases above plus the updated CLI case. The two control cases passed already (as expected for controls).
- GREEN (clone, patched, exit 0): tests 35, pass 35, fail 0. Baseline (clone2, unchanged, exit 0): tests 32, pass 32, fail 0.
- Failing-name sets: baseline empty; patched empty; no pre-existing failure.
- Not edited, run in the clone patched and in clone2 baseline, all exit 0 both: `design-approval-route.e2e.test.mjs` 14/14; `lib/design-approval-binding.test.mjs` 42/42; `lib/pins/role-route-preflight-with-self-dispatch-fallback.test.mjs` 31/31.
- Apply check: `git apply --check` in clone2 at the candidate, exit 0.
- Logs: `scratch/agent-out/w7k/{red,green,base}.*.log` (untracked scratch).

## NOT done
- No real attestation: nothing verifies a dispatch observation; no schema, binding or signing change.
- Open decision: which evidence source replaces the refusal later: `lib/controlled-method-dispatch-observation.mjs` (`writeSourceOwnedControlledMethodDispatchObservation`, `inspectLocalControlledMethodDispatchEvidenceBinding`) or dispatch-record v4. Not chosen, not invented.
- Fallback-carried self-supplied identity remains (see above).
- Full Verify, batch Critic review (parent-owned batch gate), native-host, PO acceptance: pending.

## Proposed commit message
`fix(design): the design-review receipt producer refuses a self-asserted observed identity as unattested`

## Operator flow
Apply the diff (`git apply` of the patch at the candidate), `git add -u -- plugins/pipeline-core/scripts/design-review-receipt.mjs plugins/pipeline-core/scripts/design-review-receipt.test.mjs`, commit with `--no-verify` per the held-patch routine, then stamp and install.

## Protected-path classification observed
Neither patched file matches TP-1..TP-13 of agent-obligations §2; edits in the scratch clone were not refused. The repository tree under plugins/ was not edited.
