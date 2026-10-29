---
schema: pipeline.backlog-item.v1
id: pipeline.the-first-dispatch-in-a-consumer-repository-takes-four-guard-round-trips
type: defect
owner: pipeline
status: open
created: 2026-10-26
sprint: alfred
priority: P1
release: 0.7.0
source: "PO consumer run 2026-10-26: about eight minutes and two dozen tool calls for a first native dispatch that was still not admitted"
done_when: manual
---

# The first dispatch in a consumer repository takes four guard round-trips and still fails

## Evidence (one consumer transcript)

One attempt to dispatch the first implementation slice, in order:

1. `DISPATCH-MODEL-MISSING` (the tool-layer `model` parameter was not passed; the briefing text alone does not
   set it, MP-29).
2. `DBG-GENERATED-BRIEFING-REQUIRED` (the briefing was hand-assembled). The dispatcher read the generator and
   the package schema (five searches, three file reads), wrote the package and then edited it **six times**,
   one field per edit: wrong `item` form, the `check` field requires a `.test.mjs` path although the repository
   has no unit-test runner (a throw-away scratch test file was invented to satisfy it), the tool-call estimate
   (60) silently escalated the tier to deep, the implementor cap (40) then forced a three-way split of the spec.
3. Generated briefing accepted; dispatch of slice A blocked by `CVCT-FILE` (plan approval unavailable), see
   `2026-10-26-windows-private-state-check-counts-acls-inherited-from-above-the-repository`.
4. Result: no dispatch, a PO terminal task, and a note "defect 6 for the plugin hand-over".

Every block was typed and correct in isolation. The cost is that each one is discovered one at a time, at the
moment of dispatch, and each repair needs the dispatcher to learn a contract (parameter, generator, package
shape, caps) by reading code. The same class, measured in this repository: `...agent-dispatch-leaves-a-dead-
registry-lock...` and `...briefing-retyping...`.

## Wanted

- **One readiness probe that runs every dispatch-time check in dry-run** (model parameter, generated-briefing
  marker, plan approval and its Windows/POSIX custody, registry lock owner, tier cap vs estimate, scope vs
  architecture boundary) and returns **all** failures at once, each with its exact repair command. Runs from
  `pipeline-start` (bootstrap) when the project is in implementation, so a consumer sees the problems before
  it writes a briefing.
- **`dispatch-briefing.mjs scaffold`**: emits a valid package skeleton from the approved plan/spec (item, criterion,
  paths, forbidden, stops, check, tier, caps filled), and `build` reports **every** package error in one answer
  instead of the first.
- **The generator prints the dispatch call** it expects (`subagent_type`, `model`, `run_in_background`, briefing
  path) next to the briefing, so the dispatcher does not derive the tool-layer parameters.
- **`check` accepts the repository's real verify command** (npm script, e2e spec, registered static check), not only
  a `.test.mjs` file; a repository without a unit runner must not need an invented test file.
- **Tier and cap are explicit, not silent**: a tool-call estimate above the implementor cap proposes the split
  (slices with disjoint scopes) instead of escalating the tier on its own.
- Measure it: a first dispatch in a fresh consumer repository must reach admission in at most one corrective
  round (target), with the round count recorded in the greenfield happy-path evidence.

## Code finding on the `check` rule (2026-10-29, read, not run)

The `.test.mjs|cjs|js` requirement is not only the generator's. Three places enforce the same suffix on the check path: `scripts/dispatch-briefing.mjs` (`DBG-CHECK-NOT-TEST`, and the queue-row rebind hint that picks a `.test` file from the scope), `lib/native-goldfish-host-return.mjs` (the host's validation of the item-delivery check, kernel host state) and `lib/plan-handoff-readiness.mjs` (`CHECK_TOKEN`, the readiness reader). Relaxing only the generator would hand out a binding that the host refuses at return time. The wanted behaviour (a repository's real verify command as the check) therefore needs one contract decision first: what a non-test check is (a registered command id, a script path with a declared runner) and how the host runs and digests it. Until that is decided, the only interim route is a workaround, not a documented one: a repository without a unit runner adds one thin `.test.mjs` that invokes its real verify command, named in the briefing. Not a generator-only patch; held-patch scope is all three files.

## Why P1

PO, 2026-10-26: this effort "has to be reduced clearly". It is the user-facing cost of the pipeline at the exact
moment of first value, and it recurs in every consumer repository.
