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

This can shorten independent review, documentation, or implementation work.
It adds coordination cost, so small, overlapping, or dependent work is often
better kept sequential.

## Runner boundary

Parallelism uses each runner's native subagent surface; it does not create a
portable workflow command or require the same mechanism on every host. A
registered hook or observed lifecycle event is not proof that a model received
or acted on an advisory, and no advisory launches children or changes
permissions by itself. Read [runner support](runner-support.md) and the
[runtime boundary](runtime-boundary.md) for supported surfaces, assurance, and
host-specific limits.
