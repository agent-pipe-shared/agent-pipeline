# Architecture orientation after ready preflight

Consume the mandatory `architectureOrientation` readback in the ready
preflight envelope. It is runner-neutral and produced by the same normal
entry point for Claude, Codex and Antigravity; do not replace it with a guess
from an `AGENTS.md` pointer.

When its status is `adoption-required`, execute its nested, read-only
`nextAction` verbatim to obtain the staged proposal and surface it to the PO.
For `design-pending`, state that the physical greenfield scaffold exists but
is not an adopted baseline. The scoped disposition is part of the PRD's
architecture design block and is approved with the plan; there is no separate
PO adoption step. After `approve-plan`, run
`pipeline-state.mjs materialize-architecture` yourself, then
`set-phase --phase implementation`. Never use `architecture-adoption.mjs
prepare`/`apply` on a greenfield repository; that route is for existing ones
and leaves an entry that blocks materialization. For `decision-recorded`, read the declared architecture
map and compiled decision summary in the AGENTS re-entry order, then only
concepts for touched modules. `unavailable` is an honest retry/diagnosis,
never a claim that a map exists.

When its status is `migration-required`, a legacy deferred adoption exists
and must be migrated before implementation (D162). Run the nested read-only
`nextAction` and show the PO the proposal's `migration` block: measure when the
map is missing, prepare the approved-scoped adoption, then confirm and apply it
through the same route as a fresh adoption. The measure step is the
`scripts/architecture-measure.mjs` entry point (`Usage: node scripts/architecture-measure.mjs --root <dir> [--apply] [--json]`;
without `--apply` it only reports). Never run the measure or apply steps
without the PO's go, and never offer a new deferral.

Orientation and proposal are not authority to write a map or make a PO
decision. The later implementation-authority boundary, not bootstrap,
refuses an unresolved, out-of-scope, or physically unready architecture estate.
