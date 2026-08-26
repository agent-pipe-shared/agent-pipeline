---
schema: pipeline.backlog-item.v1
id: pipeline.concurrent-session-prevention-supersedes-a-ac-01
type: requirement
owner: pipeline
status: closed
created: 2026-08-18
source: "PO ruling, Sprint Phoenix closure sweep, 2026-08-18: A-AC-01's remaining ordering-seam gap (main-session-route.mjs needing a Claude host adapter for pipelineMainSessionRoute) is struck rather than built, because the clean fix for the underlying risk is preventing two sessions from ever operating concurrently against the same repository root (same or different runner) in the first place — see specs/sprint-phoenix-epic/acceptance.md A-AC-01's 2026-08-18 amendment."
closed_at: "2026-08-18"
closure_repository: "self"
closure_commit: "18e5516cf14a9a02fca8cd9bdb6c6ddb1fcf4d78"
closure_evidence: "backlog/items/2026-08-18-concurrent-session-prevention-supersedes-a-ac-01s-remaining-gap.md"
---

# Harden concurrent-session prevention beyond a warning

## Description

`observeConcurrentSessionWarning` (`plugins/pipeline-core/scripts/pipeline-start-preflight.mjs`,
commit `645de988`, PHX-WP-AAC01-MULTISESSION) already detects when another
live-owned session is registered against the same repository root and
surfaces a typed, non-blocking warning at bootstrap. It never blocks and
never affects `status`/`nextAction`.

The PO's 2026-08-18 ruling on A-AC-01's remaining ordering-seam gap treats
this warning as a stepping stone, not the destination: the actual chaos risk
two sessions (same or different runner) editing the same repository root
concurrently create is better closed by preventing the situation outright
than by journaling an ordering record around it after the fact. A-AC-01's
own remaining gap (a Claude host adapter for `pipelineMainSessionRoute`)
is superseded by this — once concurrent same-root sessions cannot happen at
all, there is nothing left for that ordering seam to protect against.

## Triggering situation

PO ruling during the Sprint Phoenix closure sweep, 2026-08-18 (chat, this
session) — see `specs/sprint-phoenix-epic/acceptance.md` A-AC-01's amendment
for the full reasoning and citation.

## Affected artifact

`plugins/pipeline-core/scripts/pipeline-start-preflight.mjs`
(`observeConcurrentSessionWarning`); any future session-lifecycle guard that
would need to move this from advisory to blocking.

## Proposal

Design and build an actual prevention mechanism (not just a warning) for two
sessions operating concurrently against the same repository root, regardless
of whether they share a runner. Out of scope for Sprint Phoenix. No target
sprint named yet by the PO — the next Pipeline session's Elephant should
propose one at triage, or ask the PO to name one, before this item is
assigned.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**

### PO Decision — 2026-08-18

- **Decision:** Option C — no dedicated concurrent-session-prevention mechanism is built; the existing advisory `observeConcurrentSessionWarning` is judged sufficient. The PO additionally notes this concern is already tracked/assigned elsewhere.
- **Rationale:** PO's direct choice.
- **Assignment:** Closed.
- **Date:** 2026-08-18
