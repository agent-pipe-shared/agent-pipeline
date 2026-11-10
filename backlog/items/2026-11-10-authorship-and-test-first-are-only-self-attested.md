---
schema: pipeline.backlog-item.v1
id: pipeline.authorship-and-test-first-are-only-self-attested
type: workflow-improvement
owner: pipeline
status: open
created: 2026-11-10
source: Codex greenfield report, point R5 (P1); PO tile 2026-11-10 places it after 0.7.0
sprint: alfred
done_when: manual
---

# Authorship and test-first order are only self-attested

## Description

The records name who wrote a change and state that a test failed before it passed, but the agent that did the work is the one saying so. The records already label this as self-attested, so nothing claims more than it knows. A host-observed chain from a failing test to a passing one would be a new capability.

The same limit applies to `lane.independent: true` in the Critic review lineage. The compiler writes it for every consumed session-mode round. It says that the round is its own Critic run with its own lane, derived from the hosting session and the round's packet. It does not say that the host isolated that run. An auditor index has to read it that way until isolation is observed.

## Decision

PO tile 2026-11-10: after 0.7.0. It is not part of the 0.7.0 scope.

## Done when

The PO decides whether a host-observed red-to-green chain is built and on which runners, and that decision is carried out.
