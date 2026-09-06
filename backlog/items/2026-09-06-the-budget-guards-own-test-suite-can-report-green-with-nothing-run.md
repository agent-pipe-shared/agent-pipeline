---
schema: pipeline.backlog-item.v1
id: pipeline.budget-guard-test-suite-silent-pass
type: defect
owner: pipeline
status: open
created: 2026-09-06
sprint: nova-b
done_when: manual
tracking: "Nova B -- guard-dispatch-budget.test.mjs imports its module at the test file's own module scope. If that guard's entrypoint gate ever regresses to an unconditional top-level body, the import calls process.exit at module-evaluation time and node --test reports the whole file as ONE PASSING TEST with no assertion having run. The sibling suite guard-dispatch.test.mjs had the identical shape and it was removed in e4aeb8fe; this one was on that package's no-go list and was carried forward in a commit message body, which is not a tracked mitigation."
source: "T1 Critic finding F3 on commits adc165bb/e4aeb8fe, 2026-09-06. The hazard's effect is not argued but measured: evidence/NVA-B-GD16HARDEN-1-red-demonstration.txt Part B is an executed probe showing node --test reporting a module whose import consumes control via process.exit(0) as one passing test."
---

# The budget guard's own test suite can report green with nothing run

## The gap

`plugins/pipeline-core/hooks/guard-dispatch-budget.test.mjs` imports symbols
from `guard-dispatch-budget.mjs` at the test file's module scope.

That is safe only while the guard module's top-level body stays behind its
`isDirectInvocation(import.meta.url)` gate. Remove or break that gate — the
exact regression class this repository has already paid for once — and the
import executes the hook during module evaluation, hits `process.exit`, and
`node --test` reports the file as a single passing test with **none** of its
cases having run.

A green suite, nothing checked, no error.

## Why this one matters more than the sibling it mirrors

The suite that would silently pass is the suite covering
`guard-dispatch-budget.mjs` — a guard that is **already** confirmed not to be
firing in practice (see
`2026-09-06-a-dispatchs-own-tool-budget-stop-condition-cannot-fire-because-nothing-counts.md`).
So the guard union's blind spot is doubled here: a guard that does not fire,
whose test suite is structurally capable of reporting green while testing
nothing.

## Measured, not reasoned

`evidence/NVA-B-GD16HARDEN-1-red-demonstration.txt` Part B is an executed
probe, not an argument: it constructs a module whose import consumes control
via `process.exit(0)` and shows `node --test` reporting one passing test.

## The fix shape already exists

`plugins/pipeline-core/hooks/guard-dispatch.test.mjs` was carrying the same
hazard and no longer does (`e4aeb8fe`). Its replacement pattern is the answer
here too: drop the module-scope import, keep only a path constant, and reach
the module through a spawned child process whose success marker and exact
result line are both asserted — so an import that produces nothing fails
loudly instead of passing silently.

## Why it is filed rather than fixed in place

It was on the no-go list of the package that fixed the sibling, and that
package correctly respected its scope and disclosed the carry-forward. The
defect is that the disclosure lived only in a commit message body: QG-06 is
explicit that a known gap without an owner and an expiry is a finding, not a
mitigation. This item is that owner.
