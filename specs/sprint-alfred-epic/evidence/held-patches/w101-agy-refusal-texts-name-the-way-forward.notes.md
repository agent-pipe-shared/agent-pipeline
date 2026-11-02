# w101 — two refusals from an Antigravity consumer run name the way forward (candidate 18, AGY minor findings)

Built by the Elephant directly under the PO exception of 2026-11-02 (small items of the candidate 18 build). Criterion binding: AC-262 is the closest existing accepted criterion for the signing and design-approval refusals; the PRD and the Spec are unchanged.

## What it changes

- `DRC-OUT-EXISTS` (`scripts/design-review-receipt.mjs`, both raise sites): the text kept saying only that the output is never overwritten; it now ends with the way forward: choose a new `--out` path (for example the same name with a `-2` suffix) and run the command again. The code, the condition and the "never overwritten" guarantee are unchanged.
- `DWP-REQUEST-EXISTS-DRIFT` (`scripts/pipeline-state.mjs`, `writeDesignWorkflowApprovalRequest`): the refusal was a bare code. It now carries `path` and a `message` naming the scratch file, saying that it is a scratch copy bound to this request digest and never overwritten, and that the repair is to move or delete that one file and run the command again; the `present-plan` caller prints `code: message` when a message exists (other callers and codes print as before).

## Tests

`design-review-receipt.test.mjs` gets one case, written first and observed RED against the original text (message lacked the way forward), then GREEN (36 of 36). The `pipeline-state` main suite and `check-consumer-safe-paths` (9 of 9) stay green in the slice clone.

## Not changed / not proven

- No test drives the `DWP-REQUEST-EXISTS-DRIFT` path end to end (the writer is not exported and no existing suite reaches it); the change there is text only and is not exercised by a case.
- The other AGY minor findings (no hook activation after kickoff promotion, the signing wrapper, turn hygiene) are separate items; hook activation needs a PO decision about consent.
- Not proven in a real Antigravity run. The full Verify was not run.
