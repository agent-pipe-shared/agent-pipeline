fix(guard-maintenance-window): list the three leaf modules candidate 28e added to kernel imports

GMWKC01 found the never-liftable kernel no longer transitively closed
on the applied candidate 28e: the lifecycle guard imports
lib/reopen-design-po-step.mjs, the package registration, the Critic
course, pipeline-state.mjs and po-human-approval.mjs import
lib/spec-addendum.mjs, and pipeline-state.mjs imports
lib/feature-id.mjs, while none of the three was a kernel path. A
maintenance window could have lifted code that kernel code executes.

The three leaf modules (no first-party imports) are kernel paths now,
and the threat model's protected-assets prose names them with the
reason none of them may be lifted.

Checkpoint-Intent: candidate 29a, a regression of candidate 28e found by the 29a affected-suite run
AI-Assisted: true
Dispatch: stage-0 (elephant)
