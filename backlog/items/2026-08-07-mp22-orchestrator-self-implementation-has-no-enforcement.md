---
schema: pipeline.backlog-item.v1
id: pipeline.mp22-orchestrator-self-implementation-has-no-enforcement
type: defect
owner: pipeline
status: open
created: 2026-08-07
due: 2026-08-21
source: "Critic rounds 1 and 2 of the 0.5.3 candidate, 2026-08-07 — both independently found the same class of violation, round 2 with the sharper spec-ref."
---

# MP-22 / EL-01 forbid orchestrator self-implementation and nothing technically prevents it

## Description

MP-22 bans the orchestrator implementing a dispatched task itself —
unconditionally, *"never through self-implementation … never grounds for the
orchestrator to implement it itself"*. EL-01's stage-0 fast path is the only
exception, and it explicitly excludes any architecture, schema, public-API,
**test**, guardrail-hook-CI, dependency or security-surface change.

Two violations landed in one candidate batch on the same day:

- `503fe0d` modified `plugins/pipeline-core/hooks/guard-gate-strength.mjs` —
  the file deciding gate strength — after its dispatch failed to report. It
  carries a `Dispatch:` trailer that does not describe who actually wrote it,
  and shipped with no machine-executed test evidence at commit time.
- `584a598` modified `plugins/pipeline-core/lib/threat-model-approval-request.test.mjs`
  and carries **no** `Dispatch:` trailer at all. A test change, so the stage-0
  exception is unavailable by its own terms.

Both were honestly disclosed in their dispatch records — and disclosure is
exactly what makes the structural point visible: the rule is respected only when
the orchestrator chooses to respect it, and the orchestrator is the party the
rule exists to constrain. Every other load-bearing constraint in this repository
has a technical enforcement layer behind it: push approval has a signature gate,
test paths have `guard-testpath.mjs`, gate strength has `guard-gate-strength.mjs`,
the live plugin root has GS-6. MP-22 has prose.

The failure mode it guards is self-confirmation bias, and the shape it took here
is worth recording precisely, because it is not laziness: in both cases a
dispatch had already been briefed and had failed or fallen short, the
orchestrator had the full context loaded, the remaining work looked small, and
finishing it personally looked like the responsible thing to do. That is what
the rule predicts and why it is unconditional rather than discretionary.

## Triggering situation

Found by both independent Critic rounds against the 0.5.3 candidate on
2026-08-07. Round 1 rated it major on the guardrail file; round 2 additionally
established that the stage-0 exception could not apply to the test-file case,
raising it from "disclosed deviation" to an EL-01 violation with a spec-ref.

## Affected artifact

`policies/model-policy.md` MP-22; `roles/elephant.md` EL-01/EL-16;
`guardrails/git.md` GIT-03 (trailer provenance). No single implementation file
is "the bug" — the gap is the absence of any enforcement artifact.

## Proposal

Not designed here, and deliberately so: a technical enforcement layer for this
rule sits uncomfortably close to a guard that restricts the party that
administers the guards, which is the same self-protection problem GS-6 exists
for and which ADR-0058/ADR-0059 spent a whole sprint making liftable. Candidates,
explicitly not a commitment:

1. **Make the trailer verifiable rather than declarative.** A `Dispatch:` trailer
   currently asserts authorship with nothing behind it. Bind it to the dispatch
   record — a commit claiming a task ID whose record shows `orchestratorCompletion`
   is a detectable inconsistency, checkable in `verify` rather than only by a
   Critic who happens to read both.
2. **Require the absence of a trailer to be explicit.** `584a598` carries no
   trailer at all, which today reads as "unremarkable". A commit touching
   protected paths with no provenance trailer could be refused outright, the
   same way an unsigned push is.
3. **Accept the rule as unenforceable and change what happens when a dispatch
   fails.** Both violations began the same way: a dispatch did not deliver. The
   rule says re-dispatch; the pressure says finish it. A cheap, well-defined
   re-dispatch path for a partially-completed task would remove most of the
   motive without any new guard.
4. Whatever is chosen, note that the detection already works: two independent
   Critic rounds found this without being told to look. The gap is that
   detection happens *after* the commit is in history, where the only remedy is
   disclosure — history rewriting being correctly forbidden.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
