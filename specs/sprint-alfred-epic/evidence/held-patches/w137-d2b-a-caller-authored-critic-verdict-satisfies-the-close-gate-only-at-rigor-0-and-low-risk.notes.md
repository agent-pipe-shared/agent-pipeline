# w137 — a caller-authored Critic verdict satisfies the close gate only at rigor 0 and low risk (candidate 19, D2b)

Applies on top of the chain at w135. Criterion binding: AC-108 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## What it adds

- `scripts/close-coordinator.mjs`: `auditLifecycleReadback` now calls a new `assertCriticIndependenceForClose` after `readCriticVerifyLifecycle` returns (so the plan route and the apply-time readback both apply it).
  - It reads the consumed session-critic receipt of `lifecycle.receipt.critic.packetId` with `readConsumedCandidateReceipt` and looks at `receipt.independence`. Only `caller-authored-fallback` is restricted; `source-issued-origin` and a missing key (legacy receipt) pass unchanged. An unreadable receipt refuses.
  - Rigor: `resolvePublicationReviewRequirement` code `REVIEW-LOW-RIGOR` means rigor 0; otherwise `feature.rigor` of `specs/<feature>/lifecycle.json`; anything unreadable leaves the rigor unknown, which refuses (fail closed).
  - Risk: high when any dispatch record from `walkDispatchRecords` has `criticRequired.trigger.riskClass: "high"` or `riskFlag: true`; no such record counts as low.
  - A restricted receipt at rigor above 0, at high risk, or at unknown rigor fails with `CLOSE-CRITIC-CALLER-AUTHORED`, naming the packet id, the rigor and risk found and the repair (run the Critic review as a fresh native session and finalize without the fallback).
- `scripts/close-coordinator-audit-lifecycle.test.mjs`: the fixture takes `origin` (default now a Source-issued return through the finalizer's `readOriginalSourceReturnFn`; `"fallback"` asks for the caller-authored label). Two new cases: a fallback verdict is refused with the typed code naming packet, rigor and repair and builds no audit bundle; a Source-issued receipt carries `independence: "source-issued-origin"` and closes. All existing cases are unchanged and now run on the Source-issued default.

## Checks

- The refusal case was red before the production edit (15 of 16), then `close-coordinator-audit-lifecycle.test.mjs` 16 of 16 in the clone. `close-coordinator.test.mjs` was run alone in the clone; see the Goldfish report for its result.

## Not changed / not proven

- No output field was added for the degraded independence at rigor 0 and low risk (no existing lifecycle fact field fits without a schema change); the close simply proceeds as today.
- Not proven end to end: the accept path at rigor 0 and the refusals at rigor 0 with high risk or unreadable rigor. The audit route requires a feature package, whose rigor is 1 or 2, so rigor 0 is not reachable through it with the real fixtures; those branches are covered by reading only. A legacy receipt (no `independence` key) is likewise not exercised because the consumed receipt cannot be hand-edited.
- The finalizer, receipt shape, packet schemas and `lib/critic-verify-lifecycle.mjs` are untouched. The full Verify run was not made.
