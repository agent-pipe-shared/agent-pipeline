---
schema: pipeline.backlog-item.v1
id: pipeline.elephant-writes-production-code-directly-without-a-goldfish-dispatch
type: defect
owner: pipeline
status: open
created: 2026-08-09
source: "Live observation of the PO's private Claude+Pipeline 0.5.4 happy-path test run (fifth local candidate), 2026-08-09 (sanitized, no PO-identifying data)."
due: 2026-08-16
---

# The Elephant wrote a project's production code directly, with no Goldfish dispatch at any point in the session

## What happened

In the observed Claude+Pipeline happy-path run, the deliverable's script,
markup, and style files were all written directly by the main (Elephant)
agent turn via `Write` tool calls. The session transcript shows no `Agent`/
`Task` tool invocation anywhere — the only two matches for a Goldfish
reference in the whole transcript are the static, harness-injected
agent-listing and skill-listing metadata (which always name the available
subagent types), not an actual dispatch. This is a direct violation of this
Pipeline's own operating model: implementation is Goldfish's job; the
Elephant orchestrates, briefs, and reviews evidence, but does not author
production code itself (`docs/operating-model.md` §2, this repo's own
`CLAUDE.md` "Dispatch from the template, never freehand" rule, ADR-0015
self-application).

Unlike the guardrail/security-diff self-application review this repo
enforces on itself, a consumer project's ordinary implementation work
currently has no equivalent automated, technical check that would have
caught this at the time it happened — it surfaced only because the PO
happened to notice it live.

## Direction

Not yet root-caused why the bootstrap/kickoff flow let the Elephant proceed
straight to direct implementation instead of dispatching Goldfish for the
first real implementation step. Two angles worth investigating together:

1. Whether the shipped skill guidance states the dispatch requirement
   clearly and forcefully enough at exactly the point a fresh kickoff
   reaches its first implementation step (as opposed to stating it
   elsewhere and trusting recall).
2. Whether any technical signal (e.g. a check on whether the current
   `activeFeature`/phase has had at least one dispatch recorded before
   production-file writes accumulate) could make this class of drift
   detectable without turning every Elephant `Write` call into a blocked
   action — the Elephant legitimately writes non-production artifacts
   (docs, backlog items, specs) directly throughout this repo's own
   sessions, so any check would need to distinguish those from an actual
   consumer project's deliverable code.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
