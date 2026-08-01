# Nova B61 Rune happy-path remediation plan

## Purpose

Address the successful Rune happy-path observations before any Nova acceptance
claim: durable design intake, explicit profile choice, comprehensible long-term
specification layout, and proportionate visual flow documentation.

## Scope and acceptance

1. Before initial kickoff planning, the Coordinator asks for both the goal and
   an explicit `epic`, `feature`, or `mini` profile. It may not infer that
   choice from the request size or select a default silently.
2. The generated `specs/kickoff-*` artifacts remain transaction-safe temporary
   anchors only. Material design work is promoted in the same planning flow to
   `specs/YYYY-MM-DD_short-topic/` with `prd_short-topic.md`, `spec.md`, and
   `design-input.md`.
3. `design-input.md` stores a sanitised, faithful structured extraction rather
   than a raw chat transcript. PRD and Spec reference it and trace its material
   sections to requirements and technical decisions.
4. Material design input yields a substantive PRD and Spec. Where the input
   describes a flow, transition, branching, or handoff, the relevant document
   contains a validated Mermaid diagram; unrelated work does not receive a
   decorative diagram.
5. A restart, session cut, or Compact after material input continues to use the
   existing bounded Resume-Hint capture/readback rule.
6. The named package is prepared before it becomes active authority and is
   bound exactly once by the existing digest-bound kickoff-promotion transaction.
   Creating richer documentation must not invoke repair, generic continuity CAS,
   manifest repair, or a SHA-rebinding cascade. A later material authority
   change follows the normal reviewed rebind lifecycle instead.

## Verification

- Run `node plugins/pipeline-core/skills/pipeline-start/pipeline-start-v3.test.mjs`.
- Run the affected onboarding/continuity regression tests and the repository
  Verify chain.
- Independently review the final candidate with the standard Critic gate.

## Privacy and compatibility

The evidence artifact is a bounded repository document. It must not contain
credentials, host paths, private identifiers, raw commands, URLs, or an
unfiltered conversation transcript. Existing kickoff transaction schemas and
their immutable `kickoff-*` anchors are retained; promotion is the compatible
long-term naming transition. The source-evidence file is immutable after it is
referenced; changed input becomes a new version through ordinary planning,
rather than a rewrite that creates hash drift.

## Rollback

The behavioural standard and its regression assertions are rolled back by
reverting the single remediation commit. No migration, external service, or
published API is introduced. Existing project state remains readable because
the implementation retains the current kickoff transaction and uses the
already sanctioned promotion operation for the durable package.
