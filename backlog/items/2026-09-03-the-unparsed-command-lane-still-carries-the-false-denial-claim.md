---
schema: pipeline.backlog-item.v1
id: pipeline.the-unparsed-command-lane-still-carries-the-false-denial-claim
type: defect
owner: pipeline
status: open
created: 2026-09-03
sprint: nova-b
done_when: "contains plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs pipeline.unparsed-command-lane-caveat"
tracking: "Nova B — the sibling of the opaque-interpreter-code lane. Same blind-scan fallback, same fail-closed refusal of a mere mention, and the guard still tells the reader that only a detected write is refused."
source: "Reported by dispatch NVA-B-OPAQUELANE-1, 2026-09-03, as a finding outside its own acceptance criteria, with a live reproduction: protectedTestPathShellHit() returns lane 'unparsed-command' for the reproducing command shape."
---

# The `unparsed-command` lane still tells the reader that only a detected write is refused

## The defect

`e52e5373` closed the contract gap for the `opaque-interpreter-code` lane: the
lane now distinguishes a write from a mention for the shapes it can parse, and
where it cannot, a caveat in the denial says so and names a route forward.

That caveat is scoped by an explicit `lane === "opaque-interpreter-code"` test.
Its sibling, `unparsed-command`, reaches the same blind-scan fallback in
`extractShellWriteTargets()` and is not covered.

A `unparsed-command` refusal happens when the whole shell command cannot be
parsed — for example because it contains a `;` — so the classifier falls back to
contributing every path-shaped token it can see. Exactly as on the lane that was
just fixed, a command that merely NAMES a protected test path is refused whether
or not it would write to it, and the guard's denial text still says the opposite:

> Reading and RUNNING the suite are unaffected: `node --test`, `node <suite>`,
> `cat`, `rg`, `git add/commit/diff/log/show` on this path are all admitted.
> Only a detected write is refused.

## Confirmed, not inferred

The reporting dispatch reproduced it live rather than reasoning from the code
shape: `protectedTestPathShellHit()` returns `{lane: "unparsed-command", ...}`
for a command of the form `rm <protected-path>; echo done`. It made no code
change and ran no further probes after confirming the one case.

## Why it was reported rather than fixed in the same commit

Deliberate, and the reasoning is worth keeping. The item that produced
`e52e5373` — `pipeline.the-opaque-payload-lane-refuses-a-mention-not-a-write` —
is worded around `opaque-interpreter-code` throughout: its title, its body, and
every DoD check in the briefing said "this lane". Extending the fix to a second
lane would have been undisclosed scope creep, which this repository treats as a
defect in its own right regardless of whether the extra change is an improvement.

That is the correct call, and it produces this item rather than a silent
widening.

## What resolving it means

Two honest options, the same pair the original item named:

1. Widen the caveat so it fires for every lane whose refusal comes from the
   blind-scan fallback rather than from a resolved write target — which is the
   real predicate, and would make the lane test unnecessary.
2. Teach `unparsed-command` the same write-versus-mention distinction the opaque
   lane now has. Harder, because the reason this lane exists is that the command
   could not be parsed at all.

Option 1 makes the guard honest everywhere for a small diff; option 2 narrows the
over-refusal. They are not exclusive, and option 1 does not depend on option 2.

The general principle is worth stating once in whichever fix lands: the caveat
belongs to the *fallback*, not to the lane that happens to reach it, so a third
lane added later inherits the honest text automatically instead of repeating this
item.
