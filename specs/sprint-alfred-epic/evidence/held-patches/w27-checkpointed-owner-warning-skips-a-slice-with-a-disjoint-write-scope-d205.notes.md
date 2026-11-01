# Held patch notes — DBG-CHECKPOINTED-OWNER is not raised for a slice with a disjoint write scope (D205, candidate 15c)

Patch: `w27-checkpointed-owner-warning-skips-a-slice-with-a-disjoint-write-scope-d205.patch`. Independent of the other 15c patches (applies on the bare tree). Wanted 4 of the backlog item "A Goldfish stop leaves registry drift and blocks parallel dispatch".

## Why

D205 admits two slices of the same item when their write scopes are disjoint, but the briefing generator still warned `DBG-CHECKPOINTED-OWNER` for the second one, telling the dispatcher to grant-and-resume or cancel a slice that is simply running in parallel. The warning exists to stop the successor route for a budget-checkpointed outcome; a slice with a disjoint scope is a different outcome.

## What

- `scripts/dispatch-briefing.mjs`: `defaultStartedOwners` carries the governed queue row's `writeScope` on each started owner; the warning loop drops a started owner whose recorded scope is non-empty and does not overlap this briefing's allowed paths (`scopesOverlap`, the same test the D76 scope check uses). An unknown or empty scope, or any overlap, keeps the warning; the overlap is still refused as `DBG-SCOPE-OVERLAP` below. Warning only, no refusal either way.
- `docs/parallel-work.md` and `skills/pipeline-start/references/workflow-dispatch.md` state the rule.
- Tests: one case with four sides (disjoint = no warning; overlap, empty scope, no recorded scope = warning) and one assertion on the default reader that the queue row's scope rides along.

## Evidence

- dispatch-briefing suite 133/133; doc-contract, case-completion and the two parallel-work pin suites pass.
- Mutation: removing the new filter turns the new case red (`disjoint scope: a parallel slice, no warning`).

## Not covered

- Wanted 3 (the integration-dependency hold `NGHS-ITEM-INTEGRATION-DEPENDENCY-HELD` honouring D205) is a different gate and stays open; this patch changes only the generator's warning.
- The generated plugin copy of the Elephant role text (`DBG-CHECKPOINTED-OWNER` wording) is unchanged; it describes the warning, not its exemption.
