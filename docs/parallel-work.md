# Parallel work

Agent-Pipeline can use native subagent facilities when a batch contains at
least three independent work packages. Whether to fan out is an advisory
default: a sequential plan remains valid and needs no special justification,
and the slicing hints that suggest a fan-out are advisory too (see
[Enforcement registrations](enforcement.md)). Write-scope overlap is different:
once you do dispatch in parallel, the dispatch guard enforces it by default.

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
record whose owner is not provably gone). Read-only dispatches are not judged,
and a scope that cannot be read only warns. The refusal names the overlapping
paths and the repairs:

- send the dispatch in a later call;
- narrow one `Write scope:` list;
- finalize the record of an abandoned dispatch;
- on Claude Code only: run it in its own worktree (`isolation: "worktree"`;
  such a call is not checked), or set the hook environment variable
  `PIPELINE_FANOUT_SCOPE_MODE=shadow` to turn the refusal into a warning.

The briefing generator applies the same check when it binds a dispatch
(`DBG-SCOPE-OVERLAP`).

This can shorten independent review, documentation, or implementation work.
It also adds coordination and integration work, so small, overlapping, or
dependent work is often better kept sequential. No cross-runner speed or cost
estimate is currently available.

## Item ownership and review batches

Parallelism is scheduled across complete, independently verifiable outcomes,
not across analysis, test authorship and code for the same item. The
Coordinator declares file owners before dispatch; an item that collides with an
active owner waits. The per-item steps and their trade-off are in the
[delivery step table](../PIPELINE_FLOW.md#3-deliver-in-independently-checkable-packages).

Declare a coherent review batch before its items start, then freeze membership
after integration and before the single full Critic. This batching rule applies
at every risk tier, including architecture, guardrail and security changes; risk
selects the review route. A singleton needs a substantial risk rationale.
One fresh Correction Goldfish owns all batch findings, fixes and delta reviews.
The review budget and the rules for retaining evidence are stated once in
[Usage](usage.md#deliver-work-after-readiness).

## After a cancelled slice

After a slice was cancelled with the class `wrong-premise`, the briefing
generator refuses to brief a new dispatch for the same item
(`DBG-RECON-REQUIRED`) until a recon note is referenced: the `reconNote` field
of the briefing package, or `--recon-note` on the binding route, naming a
non-empty file under `scratch/` or `specs/`. The duty ends once a slice of that
item has been delivered (integrated into the candidate).

## Runner boundary

Parallelism uses each runner's native subagent surface; it does not create a
portable workflow command or require the same mechanism on every host. A
registered hook or observed lifecycle event is not proof that a model received
or acted on an advisory, and no advisory launches children or changes
permissions by itself. Read [runner support](runner-support.md) and the
[runtime boundary](runtime-boundary.md) for supported surfaces, assurance, and
host-specific limits.
