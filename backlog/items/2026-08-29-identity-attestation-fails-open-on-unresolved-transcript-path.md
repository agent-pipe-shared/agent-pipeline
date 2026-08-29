---
schema: pipeline.backlog-item.v1
id: pipeline.identity-attestation-fails-open-on-unresolved-transcript-path
type: defect
owner: pipeline
status: closed
created: 2026-08-29
closed_at: 2026-08-29
closure_repository: self
closure_commit: 683b8fcc51ec0c32aff82e830717627f520ff401
closure_evidence: plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs
sprint: nova
done_when: contains plugins/pipeline-core/hooks/guard-dispatch-budget.mjs pipeline.identity-attestation-fail-closed-fallback
source: "Claude/Windows self-audit report (docs/pipeline-audit-claude-session.md, section 3.1), observed during the 2026-08-29 three-runner greenfield test; this is the only one of the three runs that actually shipped code."
---

# A per-write identity attestation failed OPEN 17 times on the one run that shipped code

## What happened

The bootstrap-receipt gate (`evaluateBootstrapReceiptGate`, guarding Edit/Write/
NotebookEdit against dispatched subagents that never ran their bootstrap
preflight) resolved its caller's identity as `"unresolved"` seventeen times
across the run that produced the audit, with `reason:
"transcript-path-missing-or-relative"` every time. Each occurrence was logged as
`fail-open-unresolved-identity` and the tool call was admitted — not refused.

This directly contradicts GL-09 ("authority-bearing gates fail closed, including
on an unexpected runtime fault"), and the contradiction is sharpened by the fact
that other guards in the very same session failed closed correctly when they
hit their own unresolvable conditions. The inconsistency — not simply "one guard
fails open" — is the finding: fail-closed is the house rule everywhere else this
audit looked.

## Where it is

`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`,
`evaluateBootstrapReceiptGate()` (around lines 3525–3540):

```
const identity = (dependencies.subagentIdentityFn ?? subagentIdentity)(input, dependencies);
if (identity.kind === "orchestrator") return null;
...
if (identity.kind === "unresolved") {
  recordBootstrapObservation(commonDir, {
    ...identity, decision: "fail-open-unresolved-identity", toolName, at: nowFn(),
  }, dependencies);
  return null;   // <-- admits the tool call
}
```

`identity` comes from `subagentIdentity()`, imported from
`plugins/pipeline-core/hooks/guard-dispatch-budget.mjs` (line 67 import, function
at line 163). Its very first branch (lines 164–167):

```
const transcriptPath = input?.transcript_path;
if (typeof transcriptPath !== "string" || transcriptPath.trim() === "" || !isAbsolute(transcriptPath)) {
  return { kind: "unresolved", reason: "transcript-path-missing-or-relative" };
}
```

is exactly the code path the audit's 17 occurrences hit: whenever the Claude
Code runtime's PreToolUse payload does not carry a usable absolute
`transcript_path` (observed live on the Windows runner, per the audit), the
gate cannot tell orchestrator from subagent, treats that as "cannot resolve,"
and allows the write through with only a log entry as evidence it happened.

The function's own doc comment (directly above `evaluateBootstrapReceiptGate`)
states the design intent explicitly: "Fails open... on every branch this gate
cannot resolve, exactly like guard-dispatch-budget.mjs's own model: a guard
that fails closed on its own confusion would halt every dispatch in the
repository." That is a real tradeoff (an unconditional fail-closed here would
indeed block the orchestrator itself, since `subagentIdentity` cannot always
distinguish orchestrator-with-a-quirky-payload from subagent-with-no-receipt),
but the code comment records a decision, not a proof that this specific
authority-bearing gate should be the exception to GL-09 rather than a guard
whose confusion needs a narrower fallback.

## Proposal

Narrow the fail-open branch instead of removing it outright (an unconditional
fail-closed risks exactly the "halts every dispatch" failure the code comment
warns about). Two candidate directions, either or both:

1. **Distinguish "no transcript_path field at all" (plausibly the orchestrator
   itself, since only subagents run under `subagents/agent-*.jsonl`) from "a
   transcript_path that IS present but relative/malformed"** (which is never a
   legitimate orchestrator shape and should fail closed, or at minimum escalate
   to a louder, typed denial rather than a log line).
2. **Cap the fail-open rate.** If `fail-open-unresolved-identity` fires more
   than N times in one session (17 in the audited run), that is itself a signal
   the environment is systematically failing to supply `transcript_path` —
   escalate to a blocking denial after the threshold rather than silently
   admitting every subsequent write too.

## Acceptance

- A test demonstrates that a PreToolUse payload with `transcript_path` present
  but relative (not merely absent) is refused, or at minimum produces a denial
  rather than a silent admission plus log line.
- A repeated-fail-open threshold is enforced by a test: N consecutive
  `fail-open-unresolved-identity` observations for the same session escalate to
  a blocking denial.
- The fix does not regress the existing guarantee that a genuinely-orchestrator
  PreToolUse payload (per `guard-dispatch-budget.test.mjs`'s existing fixtures)
  is never blocked.
- The Windows-runtime `transcript_path` shape that triggered this 17 times in
  the audited run is captured as a fixture (from the audit's own report, since
  no raw payload was preserved in this repository) so the fix's test is
  evidence-grounded rather than a guessed shape.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** GL-09 states fail-closed as the house rule for authority-bearing
  gates; this run's own audit observed 17 live occurrences of the opposite
  behavior in the only run that shipped code, while sibling guards in the same
  session failed closed correctly on their own unresolvable conditions in the
  same run. The inconsistency, not merely the fail-open branch's existence, is
  what makes this a defect rather than an accepted tradeoff.
- **Assignment:** `sprint: nova`; blocks the 0.6.0 candidate per the triage's S
  group. Depends conceptually on F01 (guard-layer bypass) being fixed first —
  an attestation gate that fails open is a second, independent way past the
  same layer F01 already shows can be walked around.
- **Date:** 2026-08-29
