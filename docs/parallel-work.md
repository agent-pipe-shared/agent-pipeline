# Parallel work

Agent-Pipeline can use native subagent facilities when a batch contains at
least three independent work packages. This is an advisory default: a
sequential plan remains valid and needs no special justification.

## Native runner surfaces

The configured Claude adapter observes `Task`, `Agent`, `Workflow`, and
`TodoWrite`. A Workflow can fan out `agent()` calls; `Task` and `Agent` are
the corresponding native dispatch surfaces. The Codex adapter observes
`spawn_agent` and `update_plan`, and also receives `SubagentStart` and
`SubagentStop` lifecycle events. The Antigravity adapter observes native
`invoke_subagent` calls and uses its preceding `PreInvocation` event to
deliver a due advisory.

These are the runner contracts represented in the shipped hook configuration
and adapters. They do not imply a portable workflow command, a new workflow
engine, or an obligation to use the same mechanism on every runner.

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

## What the advisory observes

The native advisory uses a threshold of three. Codex deduplicates exact
`spawn_agent` call identities and plan batches, and resets a serial run while
child lifecycle overlap is active. Antigravity deduplicates retry steps,
groups observations by invocation, and treats a multi-child native call as
fan-out. The Claude adapter similarly rate-limits its plan and serial-work
signals. A malformed event or unavailable local state silently produces no
advisory; none of these adapters denies a tool call, escalates permission, or
launches a child on its own.

There are several different facts here. A runner may expose a native execution
surface; a hook may be registered for it; a lifecycle event may be observed;
and an adapter may emit `additionalContext` or an Antigravity ephemeral
message. None of those facts alone proves that the model received or acted on
the message. Fixture tests validate source behavior and registration shapes;
they are not evidence of live delivery on every runner.

## Current evidence boundary

The accepted [ADR-0080](adr/0080-parallel-dispatch-slicing-enforcement.md)
records the Claude implementation and its prior channel probe. The current
native delivery observation confirms checked installed/source parity for the
Codex slicing files and, after a corrected state-key derivation, confirms that
one parent-bound `SubagentStart` observation persisted. It does not establish
a parent `PreToolUse` `spawn_agent` observation, a due nudge, or
model-visible `additionalContext` delivery. Antigravity live delivery remains
unproven by that observation as well. The sanitized receipt and its correction
are recorded in
[the delivery observation](../backlog/evidence/2026-09-08-native-slicing-delivery-observation.md).

For source details, see the configured Claude
[`Task|Agent|Workflow|TodoWrite` hook](../plugins/pipeline-core/hooks/hooks.json),
the Codex [native hook configuration](../plugins/pipeline-core/hooks/codex-hooks.json),
and the Antigravity [native hook configuration](../plugins/pipeline-core/hooks.json).
