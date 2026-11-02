# w67 — the budget-grant refusal says the counter is Claude-only and names the route on the other runners (candidate 17, intake 1o)

Applies on the nine-patch chain; one message in `scripts/dispatch-budget-grant.mjs` and its test.

## What went wrong

On Codex a budget continuation ended in `DISPATCH-BUDGET-GRANT-REFUSED: agent-counter-missing`. The grant route (grant record plus a message to the same agent id) is shaped for Claude, where the budget guard keeps
a per-agent counter. Codex has no agent counter, so the refusal was correct, but its text ("the agent never ran under the budget guard here") sent the agent looking for a bug in the pipeline source, which a
consumer must never edit.

## Change

- `agent-counter-missing` now also says: only a Claude dispatch has a per-agent counter; on Codex and Antigravity nothing counts the budget (the w54 briefing line says so), so there is nothing to grant; let the
  child finish or stop with its interim report, commit the verified partial state, dispatch the remainder as a new task; on Claude check the agent id against the Agent call's result.
- Test: the existing missing-counter case also asserts the three sentences. The checkpoint suite passes (17 tests).

## Not changed / not proven

- No runner-neutral budget counter: that needs a measured child payload on Codex and Antigravity, which this repository does not have (the readback says `unenforced:<runner>`). The refusal states the limit and the manual route.
- "Dispatch the remainder as a new task" is the existing partial-state convention (commit the verified partial state, then a follow-up slice); it was not run on Codex.
- Text only; not mutation-checked.
