# w103 — the close drive names an already closed lifecycle (candidate 18, AGY minor finding "turn hygiene")

Built by the Elephant directly under the PO exception of 2026-11-02 (small items of the candidate 18 build). Criterion binding: AC-264 (the close drive) is the closest accepted criterion; the PRD and the Spec are unchanged.

## What it changes

- `driveClose` (`scripts/close-coordinator.mjs`): when the lifecycle is in a phase with no further transition (`promoted`), the drive still returns `status: "terminal"`, and now also a `message` that says the lifecycle is already closed, names the phase, says that re-running the drive changes nothing, and tells the agent to treat the human's next request as a new turn instead of repeating the close. Status, schema, phase, chain, actions and `qualityReadback` are unchanged.

## Tests

`close-coordinator.test.mjs`: the existing process scenario that walks a lifecycle to `promoted` gains one `drive` call at the end, asserting the terminal status and the message. The suite is 50 of 50 green in the slice clone. The new assertion was written after the change and was NOT observed red against the original code (the original returned no `message`, so it would fail by construction, but that was not run).

## Order and dependencies

A delta on w79, w93 and w98 (all touch `close-coordinator.mjs`); apply it after w98. It was checked with `git apply --check` against a clone that holds exactly that chain, not against the repository root.

## Not changed / not proven

- Only `promoted` is terminal in the coordinator table; the earlier closed states (`closed-local`, `delivered`) still lead to the human gate for release, which the drive already reports as `human-gate`.
- Whether the message changes an agent's behaviour in a real Antigravity turn is not proven. The full Verify was not run.
