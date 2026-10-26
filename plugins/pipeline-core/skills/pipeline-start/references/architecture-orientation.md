# Architecture orientation after ready preflight

Consume the mandatory `architectureOrientation` readback in the ready
preflight envelope. It is runner-neutral and produced by the same normal
entry point for Claude, Codex and Antigravity; do not replace it with a guess
from an `AGENTS.md` pointer.

When its status is `adoption-required`, execute its nested, read-only
`nextAction` verbatim to obtain the staged proposal and surface it to the PO.
For `design-pending`, state that the physical greenfield scaffold exists but
is not an adopted baseline; finish initial design before asking the PO for a
scoped disposition. For `decision-recorded`, read the declared architecture
map and compiled decision summary in the AGENTS re-entry order, then only
concepts for touched modules. `unavailable` is an honest retry/diagnosis,
never a claim that a map exists.

When its status is `migration-required`, a legacy deferred adoption exists
and must be migrated before implementation (D162). Run the nested read-only
`nextAction` and show the PO the proposal's `migration` block: measure when the
map is missing, prepare the approved-scoped adoption, then confirm and apply it
through the same route as a fresh adoption. Never run the measure or apply steps
without the PO's go, and never offer a new deferral.

Orientation and proposal are not authority to write a map or make a PO
decision. The later implementation-authority boundary, not bootstrap,
refuses an unresolved, out-of-scope, or physically unready architecture estate.
