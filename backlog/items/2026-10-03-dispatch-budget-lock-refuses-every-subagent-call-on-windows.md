---
schema: pipeline.backlog-item.v1
id: pipeline.dispatch-budget-lock-refuses-every-subagent-call-on-windows
type: defect
owner: pipeline
status: open
created: 2026-10-03
source: "Live observation, Agent-Pipeline Claude/Windows session 2026-10-03: a pipeline-core:goldfish-deep authoring dispatch (ALFRED-FR-AUTHOR-1) was refused on every tool call, including Read."
sprint: alfred
done_when: manual
---

# On native Windows every Pipeline subagent tool call is refused by the dispatch-budget lock

## Observed again 2026-10-05

Defect 5 of the ALFRED-BACKLOG-20261005 set: when a dispatched agent issues parallel tool calls, the budget-counter lock collides and the refusal tells the agent to "repair through the trusted host path", although a plain retry of the same call succeeds. Impact: the misleading message sends agents hunting for a repair route that does not exist and each refused attempt spends budget. Fix direction: distinguish a transient lock collision from a genuine counter fault and say "retry this call once" (or retry inside the guard with a short bounded back-off) before surfacing a refusal.

## Observed again 2026-10-06/07 — root cause in source, PO decision #26

Night run on the second PC (IC-2d installed): several dispatches lost calls to
`DISPATCH-BUDGET-INPUT-INVALID (counter-lock-busy)` whenever they issued parallel
tool calls; the Elephant then serialized all dispatches. Source reading
(`plugins/pipeline-core/hooks/guard-dispatch-budget.mjs` at IC-2d): the counter
and its `<path>.binding.lock` are per agent (`counterPath`, ~516), so separate
agents never contend; contention is between concurrent hook processes of ONE
agent's parallel tool calls. `acquireDispatchBudgetCounterLock` (~749) returns
`counter-lock-busy` immediately when the live owner holds the lock (~765-771);
the only caller (~1181-1184) converts that into `invalidBudgetInputBlocked`
without any retry, although the code comment says contention "must remain
retryable by the caller". PO decision 2026-10-07 #26 makes parallel dispatch a
required supported mode; Spec §22 R7-11 (design revision 5) carries the contract:
bounded wait with backoff while the owner is live, counted exactly once, typed
`counter-lock-timeout` only after the bound.

## Description

A `pipeline-core:goldfish-deep` dispatch from a Claude Code session on native
Windows could not execute a single tool call. Read, Write and Bash were all
refused with
`DISPATCH-BUDGET-INPUT-INVALID ... invalid budget state (counter-lock-owner-ambiguous)`.

Root cause from source: `localCounterLockOwner()` in
`plugins/pipeline-core/hooks/guard-dispatch-budget.mjs:420-433` throws
`counter-lock-owner-ambiguous` whenever `process.platform !== "linux"`, because
lock ownership is derived from `/proc` (`boot_id`, process start). The guard can
therefore never acquire its counter lock on Windows or macOS.
`counterLockOwnerState` (`:499-512`) likewise returns `ambiguous` for every
non-Linux platform. As a result no Goldfish or Critic dispatch can work under
Claude on Windows, though ADR-0051 makes native Windows a hard platform
requirement. Read-only `general-purpose` agents were unaffected; apparently only
Pipeline role agents are budget-counted.

Second, related observation: the subagent's first `Write` (its mandatory
dispatch record) was refused with `GUARD-BOOTSTRAP-RECEIPT-MISSING`, which told it
to run the preflight first. Neither `templates/prompts/goldfish-task.md` nor the
generated obligations tell a Goldfish to run the preflight, or which exact
(backslash) spelling is admitted on Windows (see
`2026-10-03-draft-phase-guard-blocks-mandatory-bootstrap-preflight.md`).

Addendum (same day): non-Pipeline subagents (`general-purpose`) are also
refused on their first Write with `GUARD-BOOTSTRAP-RECEIPT-MISSING`. The remedy,
running the preflight, is a `node` invocation that briefings commonly forbid
and that the runner's auto-mode classifier may deny. That was observed for the
first operator-hotfix dispatch, which wrote nothing in 9 tool calls. A retry
whose briefing mandated the exact preflight as first act succeeded. An operator
hotfix package for the installed copy was prepared under
`scratch/hotfix-budget-lock-win32/`; the source fix remains Spec §21.4 R4-4.

## Acceptance

- The counter lock has a cross-platform owner identity (for example
  Windows PID plus process creation time via a supported API, or an
  advisory-file-lock primitive) with the same live/dead/ambiguous semantics.
- A native-Windows regression test runs a budget-counted subagent through
  Read, Write and Bash calls under the real hook.
- The Goldfish/Critic briefing templates state the exact bootstrap-receipt step
  a dispatched role must perform before its first write, admitted on every
  platform spelling.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
