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

The Codex report adds a related gap: tests are derived by the same agent that writes the code. A test derivation by a separate agent, from the specification alone, belongs to the same decision.

## Decision

PO tile 2026-11-10: after 0.7.0. It is not part of the 0.7.0 scope.

## Done when

The PO decides whether a host-observed red-to-green chain is built and on which runners, and that decision is carried out.
