---
schema: pipeline.backlog-item.v1
id: pipeline.the-opaque-payload-lane-refuses-a-mention-not-a-write
type: defect
owner: pipeline
status: open
created: 2026-09-02
sprint: nova-b
done_when: manual
source: "Round-L Critic finding F3, observed first-hand by the reviewing dispatch when its own scratch-note write was refused, and anchored to plugins/pipeline-core/lib/protected-test-paths.mjs's opaque-interpreter-code lane."
---

# The opaque-payload lane refuses a mention, not a write

## The defect

`extractShellWriteTargets()`'s `opaque-interpreter-code` lane contributes
every path-shaped token from an interpreter payload — `node -e`, `python3 -c`
and, since `3f92cae8`, `git rebase --exec`. The lane cannot tell a write from
a mention, so any payload whose text merely *contains* a protected test path
is refused.

The guard's own denial text says the opposite, verbatim:

> Reading and RUNNING the suite are unaffected: `node --test`, `node <suite>`,
> `cat`, `rg`, `git add/commit/diff/log/show` on this path are all admitted.
> Only a detected write is refused.

That contract is false for this lane. Observed first-hand during the round-L
review: a `node -e` call writing plain prose into the reviewer's own scratch
notes was refused with `GUARD-TESTPATH-SHELL: TP-3 … lane:
opaque-interpreter-code`, solely because the prose text contained a protected
basename. The identical call with the token broken up succeeded.

Consequence of the widened surface: `git rebase --exec "node --test <a
protected suite>" main` — running a suite, not writing to it — is now refused,
and the refusal offers no override route.

## Why it is a defect and not a deliberate conservatism

Fail-closed is the right default, and this item does not propose loosening it
blindly. The defect is the disagreement between what the guard does and what
it tells the user it does. A session reading that denial text will conclude the
guard is broken, because by its own stated contract it is.

Two honest resolutions exist and either is acceptable:

1. Make the lane distinguish a write from a mention for the shapes it can
   parse, and keep refusing everything it cannot.
2. Keep the behaviour and correct the denial text for this lane, so it states
   that an opaque payload naming a protected path is refused regardless of
   what it does with it, and names the route forward.

Resolution 2 is cheap and immediately honest; resolution 1 is the better end
state. Doing 2 now does not close the item.

## Test coverage gap

`TPSHELL-REBASE-EXEC` in `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`
asserts the refuse direction for `sed -i` and `rm` payloads, and the
non-claim direction only for a payload naming an *unprotected* path
(`scratch/other.test.mjs`). No test asserts what happens to a read-only payload
naming a *protected* path — which is exactly the case in dispute.

## Acceptance

- A test exists for a read-only payload naming a protected path, asserting
  whichever behaviour is decided.
- The guard's denial text and the guard's behaviour agree for this lane, and a
  test pins that agreement rather than a human reading both.
- If resolution 1 is chosen, the write/mention distinction is proved by
  breaking it: the production rule is removed, the test goes RED, the rule is
  restored, the test goes green.
