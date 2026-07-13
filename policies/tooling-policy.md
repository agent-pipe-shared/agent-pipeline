# Tooling Policy

This file is the English, provider-neutral policy for selecting, constraining,
and reviewing tools. Runner product names, commands, hook events, settings
syntax, versions, and documented limitations belong to runner projections.

**Enforcement status:** this kernel defines normative outcomes. An individual
hard requirement is machine-enforced only when its runner projection names and
tests the enforcement surface; otherwise it is advisory and review-checked.

## B4E-TOOLING-LIFECYCLE

### T1 — Enforcement claims must name an enforcement surface

A hard rule MUST name the machine surface that enforces it: a runner lifecycle
event or hook, permission boundary, policy check, CI gate, or wrapper. If no
such surface exists, the rule is explicitly **advisory** and its review method
is stated. Prose alone is never described as technical enforcement.

An adapter may implement a hard rule differently, but it MUST preserve the
outcome and report residual gaps. Product-specific claims such as which event
fires, which permission mode applies, or which setting wins are valid only in
the projection that documents and tests them.

### T2 — Diagnose the smallest representative harness first

Before increasing model capability or reasoning effort in response to a
failure, check the smallest representative path in this order:

1. briefing and specification completeness;
2. context freshness, state drift, and topic mixing;
3. tool and permission scope; and
4. lifecycle events, gates, and whether they actually ran.

Exercise every new transport path with a short full-path smoke test before a
costly run. The smoke test uses the same execution mode, input transport,
working directory, credentials boundary, and material flags as the intended
payload.

### T3 — Background work needs a visible watchdog

Background work without regular visible progress MUST have an automated,
visible watchdog with timeout or idle detection, termination behavior, and a
loud failure result. Terminal evidence MUST distinguish success, failure,
timeout, and cancellation. A human decision owner is never the watchdog.

If the runner cannot supply this control directly, use a tested wrapper or do
not launch the work unattended. A promise to check later is advisory prose, not
a watchdog.

### T4 — Select capabilities, then bind runner tools

Choose the required capability first:

| Need | Kernel capability | Required boundary |
|---|---|---|
| Reusable procedure | Versioned procedure | Invocation and side effects are explicit |
| Bounded implementation or verbose investigation | Scoped fresh executor | Single task, declared budget, summary return |
| Independent review | Independent reviewer | Read-only tools and independent input |
| Guaranteed lifecycle reaction | Lifecycle event or policy check | Named event, matcher, test, and failure behavior |
| Repository or action boundary | Permission boundary | Least privilege, versioned where portable |
| Exploration before edits | Plan/read-only mode | Residual side effects stated |
| Parallel research or migration | Parallel workflow | Opt-in, narrow fan-out, isolation, and budget |
| Reproducible automation | Headless/CI runner | Version pin, controlled inputs, machine evidence |
| Parallel write isolation | Worktree or equivalent isolation | Coordination and fallback costs calibrated |
| External-system access | Existing CLI/script or connector | Explicit capability gap and context cost |

Runner projections map product primitives to this table. A product name is not
itself a policy category.

### T5 — Fresh executors and reviewers have honest isolation

Verbose investigation and bounded implementation SHOULD use a scoped fresh
executor so large logs and exploration do not consume the coordinating
context. The executor receives only the task, boundaries, budget, verification,
and stop rule it needs.

Read-only work MUST be technically constrained to read-only tools where the
runner supports that constraint; a briefing-only prohibition is advisory. An
independent reviewer does not inherit the builder's conversational reasoning.
For full input isolation, use the runner's strongest supported isolation mode
and state any automatically loaded repository instructions, status, memory,
plugins, or connectors that remain visible.

### T6 — Parallel and headless execution are opt-in

Parallel execution is opt-in, narrowly scoped, budgeted, and isolated. Writing
workers require a named permission boundary and an isolation plan. A
representative calibration is expected before a novel large fan-out.

Headless and CI execution MUST pin the runner and third-party action versions,
control discovered inputs, emit machine-readable evidence, use least privilege,
and record known limitations. Claims of total input isolation require a tested
runner projection; otherwise the residual auto-loaded context is listed.

Worktrees or equivalent isolation are used only where the collision and rollback
benefit exceeds setup, dependency, platform, and coordination cost. The chosen
tier and fallback are calibration, not universal defaults.

### T7 — Prefer deterministic local tools over connectors

Prefer an existing CLI or a versioned deterministic script over a
context-heavy connector. A connector or MCP server requires an explicit
capability gap, least-privilege scope, and an accounted context/tool-definition
cost. Load it only in the role and project that need it.

The tooling radar MUST revisit the capability gap when runner or external-system
releases change it. Convenience alone does not justify permanent connector
scope.

### T8 — Keep policy and structured data readable

Normative prose belongs in readable Markdown. Structured data such as
frontmatter, configuration, enums, checklists, and records stays flat and
machine-valid. Avoid parallel language copies of normative public policy; this
English file is the single source.

Versioned procedures and enforcement artifacts SHOULD have one maintained
source with adapter-owned bindings rather than copy-pasted, diverging copies.

## Runner projections

A runner projection MUST document:

- the concrete primitive mapped to each kernel capability it supports;
- invocation and configuration syntax;
- lifecycle and permission semantics that were actually tested;
- minimum or pinned versions when relevant;
- auto-loaded context and other isolation limitations;
- evidence emitted by headless, background, and review runs; and
- unsupported capabilities or advisory-only gaps.

Claude hooks, permission modes, workflow behavior, slash commands, headless
flags, and observed limits are therefore Claude projection material. Codex
approval boundaries, sandboxing, goals, and execution controls are Codex
projection material. Snap invocation and limits are Snap projection material.
None is silently generalized to another runner.

## B4E-TOOLING-RADAR

### R1 — Monthly cadence with catch-up and a null result

Run the tooling radar once per calendar month. Anchor it to the first recurring
session-close lifecycle event of the month; a runner projection may also expose
an explicit manual radar command. If the previous recorded run is more than one
calendar month old, the next close performs the missed-run catch-up.

Every run writes terminal evidence. A run with no relevant changes writes an
explicit dated null result so "ran and found nothing" cannot be confused with
"did not run." The projection MUST name the policy check, lifecycle event, or
wrapper that enforces the anchor; until it does, the cadence is advisory.

### R2 — Source registries are adapter-owned

Each supported runner/provider projection MUST own a registry of official
sources, where those sources exist, covering:

- releases and breaking changes;
- models and capabilities; and
- pricing and documented limits.

The registry records an owner and a fallback for a category with no official
feed. Absence of an official source is stated explicitly and is not replaced by
an uncited claim. A binding is not claimed as radar-supported until its registry
entry is complete.

The intended registry includes OpenAI/Codex, Anthropic/Claude, and Snap
projections. This policy defines the requirement but does not claim that those
entries, owners, or fallbacks have already been supplied.

### R3 — One record per relevant feature

Create one radar record for each relevant feature. Keep the schema flat and
include:

1. **What's new:** a short summary plus official source and version or date.
2. **Affected rule or decision:** a concrete policy/rule/decision reference, or
   `none`.
3. **Recommendation:** exactly one of `review`, `adopt`, or `ignore`, with a
   short reason.

A radar record evaluates a candidate; it MUST NOT silently implement or enable
the candidate. Internal work tracking, commercial choices, and raw operational
telemetry are outside the public record schema.

### R4 — Foundation changes reopen decisions

A release that changes the foundation of an existing decision triggers formal
reconsideration. Examples include permission semantics, agent configuration,
lifecycle events, plugin or extension mechanics, model availability, pricing,
or documented limits. The radar record marks the trigger and routes the
decision through its normal architecture/product gate; the radar run itself
does not confirm or revise the decision.

### R5 — Pending registry completion

Completing the official-source entries, owner, and no-feed fallback for the
OpenAI/Codex, Anthropic/Claude, and Snap projections is bounded Phase-3 work.
Until it is done, do not claim complete cross-provider radar support. This is
the same undelivered follow-up recorded in TB-09; this policy wave supplies the
contract, not the registry implementation.
