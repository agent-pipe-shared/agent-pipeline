# Parallel work

Agent-Pipeline can use native subagent facilities when a batch contains at
least three independent work packages. This is an advisory default: a
sequential plan remains valid and needs no special justification.

## When parallel work helps

Consider a native fan-out when there are three or more remaining packages and
all of the following are true:

- Each package has an explicit, disjoint write scope. Keep shared tracking,
  handover, and other common files with one owner.
- No package needs a file another package will change. A dependency means
  sequence the work.
- The commit surface is safe: use separate worktrees, allow only one slice to
  commit, or sequence commits in a shared checkout.

The dispatch guard enforces the first condition by default. It refuses a
Goldfish dispatch whose declared write scope overlaps another dispatch in the
same call or one that may still be writing in the project's working tree (an open dispatch
record whose owner is not provably gone). The refusal names the overlapping
paths and the repairs: send the dispatch in a later call, narrow one
`Write scope:` list, run it in its own worktree (`isolation: "worktree"`; such
a call is not checked), or finalize the record of an abandoned dispatch.
Read-only dispatches are not judged, and a scope that cannot be read only
warns. Setting `PIPELINE_FANOUT_SCOPE_MODE=shadow` for the hook turns the
refusal into a warning. The briefing generator applies the same check when it
binds a dispatch and refuses with `DBG-SCOPE-OVERLAP`, naming the running
dispatch and the repairs.

This can shorten independent review, documentation, or implementation work.
It also adds coordination and integration work, so small, overlapping, or
dependent work is often better kept sequential. No cross-runner speed or cost
estimate is currently available.

## Item ownership and review batches

Parallelism is scheduled across complete, independently verifiable outcomes,
not across analysis, test authorship and code for the same item. One Goldfish
keeps those duties and targeted fixes in its own context. The Elephant declares
file owners before dispatch; an item that collides with an active owner waits.
Main preserves all deliveries during integration. Original owners end after
tested delivery and integration, rather than remaining alive for later review.

After a slice was cancelled with the class `wrong-premise`, the briefing
generator refuses to brief a new dispatch for the same item
(`DBG-RECON-REQUIRED`) until a recon note is referenced: the `reconNote` field
of the briefing package, or `--recon-note` on the binding route, naming a
non-empty file under `scratch/` or `specs/`. The duty ends once a slice of that
item has been delivered (integrated into the candidate).

Declare a coherent review batch before its items start, then freeze membership
after integration and before the single full Critic. This batching rule applies
at every risk tier, including architecture, guardrail and security changes; risk
selects the review route. A singleton needs a substantial risk rationale.
One fresh Correction Goldfish owns all batch findings, fixes and delta reviews.
The budget remains one full Critic plus at most three delta Critics and ends on
PASS; renaming or restarting a batch cannot reset it.

Retain the item's actual targeted evidence when its inputs and delivered
content still match. Repeat affected checks after a manual merge conflict;
drift or missing evidence requires Goldfish requalification. Full Verify
qualifies the integrated reviewed candidate once. See [Usage](usage.md#deliver-work-after-readiness)
for the remaining test and independent-review obligations.

## Runner boundary

Parallelism uses each runner's native subagent surface; it does not create a
portable workflow command or require the same mechanism on every host. A
registered hook or observed lifecycle event is not proof that a model received
or acted on an advisory, and no advisory launches children or changes
permissions by itself. Read [runner support](runner-support.md) and the
[runtime boundary](runtime-boundary.md) for supported surfaces, assurance, and
host-specific limits.
