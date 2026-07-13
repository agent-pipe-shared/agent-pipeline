# Dispatch and Budget Guardrails

This file defines the provider-neutral dispatch, context, and bounded-execution
contract. Concrete model names, runner commands, context windows, and enforced
limits belong to runner projections. A projection may narrow this contract but
must not silently weaken it.

**Enforcement status:** the kernel requirements are normative, but their
machine enforcement is projection-owned. Until a projection names and tests an
enforcement surface, the corresponding requirement is advisory and checked by
review. The conformance fixtures listed below are pending, not delivered here.

Rule IDs use `TB-xx`.

## B4E-DISPATCH-BUDGET

### TB-01 — Every dispatch has six explicit fields

Every agent or autonomous-run dispatch MUST state:

1. **Task and scope:** the single purpose, allowed inputs, allowed paths or
   outputs, and excluded work.
2. **Capability route:** role or capability profile, risk class, and why that
   profile meets the task's ambiguity and risk.
3. **Runner binding:** runner, model or capability binding, model/version pin
   where supported, and effort or reasoning tier. Silent inheritance is
   forbidden.
4. **Budgets:** token, context, tool-call, and elapsed-time budgets, marking each
   as requested, technically enforceable, or observational when supported
   controls differ.
5. **Verification:** the deterministic result or evidence required for
   completion.
6. **Stop and escalation:** when to stop, what partial result to return, and the
   capability or decision owner to escalate to.

If a runner cannot expose or enforce one of these dimensions, the dispatch MUST
say so. Omission is not a limit. Completion evidence reports the binding that
actually ran and any divergence from the dispatch.

### TB-02 — Route to the lowest validated capability

Routing MUST use the lowest capability profile validated for the task's risk,
ambiguity, and verification needs. Risk-class floors are policy; concrete model
names, environment variables, and effort values are projection configuration.
Moving above the normal floor requires a reason. Moving below it requires an
approved, separately defined profile rather than an informal exception.

Architecture, security, guardrail, policy, and adversarial review work retains
its higher capability and independence requirements. A cheap or fast binding is
not validated merely because it can accept the prompt.

### TB-03 — Micro-Goldfish is a distinct bounded route

The micro-Goldfish capability profile is limited to one small, testable SDLC
slice with fresh context and no durable memory. Its dispatch MUST include
explicit path/output scope, tool/context/time budgets, deterministic
verification, and a stop-and-report condition.

Suitable work includes bounded mechanical implementation, focused
verification, and routine documentation or maintenance. The micro-Goldfish MUST
stop and escalate to a full Goldfish or Elephant when the slice:

- uncovers architectural ambiguity;
- crosses its declared scope;
- needs a security, guardrail, or policy decision;
- cannot be verified deterministically; or
- approaches any stated budget.

It is never a substitute for an independent Critic or for a higher capability
floor already required by the task. A runner projection owns the concrete
binding, invocation, model/version, context window, supported controls,
telemetry mapping, and enforceable limits. No micro-Goldfish runner is enabled
by default until the pending canonical decision in TB-09 is complete.

### TB-04 — Context thresholds are calibrated configuration

Each runner projection MUST define a context-threshold ladder that combines:

- calibrated absolute token thresholds;
- calibrated percentages of the available context window; and
- freshness of the usage observation.

A stale or incomplete usage snapshot is treated conservatively. Persist the
handover/checkpoint before compaction, restart, or handoff. Emergency automatic
compaction is a safety net, not a session strategy. Sessions and work packages
stay single-purpose, with planned checks after dispatch waves and at natural
phase boundaries.

Cache-invalidating changes and mid-session model switches SHOULD be minimized.
Any sanctioned switch MUST be declared by the runner projection and recorded in
the evidence. Runner commands for inspecting, compacting, clearing, rewinding,
or handing off context are projection vocabulary, not kernel vocabulary.

### TB-05 — Calibrate novel or expensive paths

A novel or expensive execution path SHOULD start with a small representative
slice. The calibration defines an expected budget and an overrun condition
before the larger run starts. Crossing that condition stops the run and returns
completed work, remaining work, and the reason for escalation; it does not
authorize a final unbudgeted push.

Verbose investigation belongs in a bounded fresh executor. Bulk deterministic
edits are script-first when that reduces repeated tool calls without weakening
reviewability or verification.

## B4E-BOUNDED-TOOLS

### TB-06 — Every dispatch has a tool-call budget

The dispatch's tool-call budget is mandatory even when the runner provides no
technical counter or hard stop. At the stated budget, the executor MUST stop
cleanly and report what is complete, what remains, and the next safe action.
Approaching the budget is a reason to simplify, checkpoint, or escalate, not to
hide additional calls.

A budget is technically enforced only when the named runner surface actually
blocks or terminates further calls. Otherwise it is an advisory behavioral
limit, verified from the trajectory or completion report. Policy and reports
MUST NOT describe an advisory limit as a hook, hard cap, or guarantee.

### TB-07 — Use bounded tasks and deterministic bulk operations

Dispatches MUST be narrow enough to finish within their declared budgets.
Repeated per-file or per-line edits SHOULD be replaced by a reviewable,
deterministic script when a script can perform the same transformation in fewer
calls. The script and its result remain subject to the same scope and
verification requirements.

If a task reveals unbounded discovery, the executor stops early with findings
and a proposed re-slice. Partial, well-evidenced completion is preferable to a
truncated or unverifiable result.

### TB-08 — Budget evidence separates four values

Completion evidence MUST distinguish:

- the requested budget;
- the technically enforceable limit, if any;
- actual or approximate observed use; and
- estimation uncertainty.

It also records interventions, budget-triggered stops, and runner termination
signatures. Approximate values MUST be labeled approximate. Missing telemetry
MUST be stated rather than reconstructed as fact.

## Runner projections

### Claude compatibility projection

The following values are compatibility evidence for the Claude runner only;
they are not cross-provider defaults:

- Existing context handling uses soft absolute checkpoints at approximately
  180k tokens (plan the cut), 200k (checkpoint is overdue), and 250k (strongest
  soft warning), together with percentage-based warnings at 50%, 75%, and an
  emergency brake at 85%. Freshness remains part of the decision. These values
  may remain only until runner-specific recalibration replaces them.
- An observed Claude Workflow-agent termination near 50 tool calls motivates a
  recommended dispatch budget of no more than 45 calls for that execution mode.
  This is scoped operational evidence, not a universal Claude guarantee and not
  a limit for direct agents, Codex, Snap, or another runner.
- Commands such as `/compact`, `/clear`, `/rewind`, `/usage`, `/goal`, and
  `/workflows` are Claude bindings. Their presence here does not make them
  portable policy vocabulary.

### Codex and other runner projections

Each projection MUST document its public commands, supported controls, context
window configuration, telemetry fields, and genuinely enforceable limits. No
numeric tool-call or context threshold is inferred from the Claude
compatibility projection. Unsupported controls are declared explicitly.

### Snap micro-Goldfish projection

The approved direction is a Snap-backed projection of the micro-Goldfish
profile, not a redefinition of Goldfish or Critic and not a kernel model name.
Its exact model/version, invocation, limits, and telemetry remain pending the
canonical decision and calibration below. This policy does not claim that the
projection is enabled, supported, or calibrated today.

## Pending bounded follow-ups

### TB-09 — Phase-3 work not delivered by this policy wave

The following work remains bounded and pending:

1. Before enabling the micro-Goldfish route by default, add a durable decision
   naming the profile, Snap binding, allowed task classes, escalation triggers,
   and its narrow precedence over the full-Goldfish floor.
2. Calibrate rather than guess: run 3–5 representative bounded Snap slices and
   a comparable full-Goldfish control, recording completion, verification,
   interventions, elapsed time, tokens/context, and tool use. Until then,
   require explicit per-dispatch budgets and publish no universal micro default.
3. Add conformance fixtures that reject silent inheritance, unsupported risk
   classes, and over-budget continuation, and that verify stale-usage handling,
   checkpoint-before-cut, and stop-and-report. Keep any `<=45` fixture inside
   the Claude projection.
4. Complete the adapter-owned tooling-radar source registry described in the
   tooling policy before claiming runner/provider support.

These follow-ups do not lower existing full-role floors and are not claimed as
implemented by this document.
