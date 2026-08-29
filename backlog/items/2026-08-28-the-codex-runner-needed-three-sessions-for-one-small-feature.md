---
schema: pipeline.backlog-item.v1
id: pipeline.codex-runner-needed-three-sessions-for-one-small-feature
type: workflow-improvement
owner: pipeline
status: closed
created: 2026-08-28
closed_at: 2026-08-29
closure_repository: self
closure_commit: 2f3940b63a3009822c6d4b109337c6dfd0ea3ac4
closure_evidence: backlog/items/2026-08-28-the-codex-runner-needed-three-sessions-for-one-small-feature.md
sprint: nova
done_when: manual
tracking: "Nova B — PO asked for this to be examined in detail"
source: "Codex/WSL greenfield run, 2026-08-28 (docs/pipeline-session-analysis-2026-08-28.md), plus the PO's own observation that this runner needed three sessions and the most detours."
---

# The Codex run needed three sessions and hit the 5h limit for a trivial feature — the worst pipeline-management result of the three

## The PO's observation

> Am schlimmsten lief das codex pipeline mgt mit so vielen umwegen, 3 sessions
> etc. Das muss detailliert geprüft werden.

Corroborated by the run's own numbers: ~9–10 hours calendar time, of which
~2.5–4 hours active agent work, and **~56% of the effort in pure pipeline
administration**. The 5h token limit was exceeded. The happy path did not
complete in one session.

## What the run itself names as causes

1. Five separate command-transfer failures in HGO/PO steps, each costing a retry
   and several costing a fresh signature intent.
2. A state-transition cascade where "jede kleine Korrektur an Konfiguration,
   Evidence oder Kandidat zu einem neuen Hash und einer neuen menschlichen
   Interaktion" led.
3. Scanner configuration repaired mid-run, including a gate-strength override.
4. Multiple restarts, each adding forensic load.

## Why this needs its own investigation rather than folding into the others

The individual causes are filed separately (copy-safe rendering, scanner
bootstrap, the guided init). What is not yet understood is why **this runner
specifically** accumulated them into three sessions when Claude completed the
same brief end to end. Candidate explanations, none verified:

- the host-authorized-WSL execution boundary adds a routing step per command;
- Codex's own sandbox/approval model interacts badly with the closed grammar;
- restart/resume costs more context re-establishment on this runner.

## Direction

Read the Codex session transcripts as forensic material — the
`transcript-forensics` reference exists for exactly this — and produce a per-turn
accounting of where the three sessions went. Only then decide what is a Codex
adapter defect versus a general flow defect already covered elsewhere.

## Acceptance criteria

- A turn-level accounting of the three sessions, naming which losses are
  Codex-specific and which are the general items.
- Any Codex-specific defect filed separately with its own reproduction.

## PO decision, 2026-08-29 — discard

**Decision:** discarded rather than investigated. The item's source document
(`docs/pipeline-session-analysis-2026-08-28.md`) is missing from this
checkout, so the forensic turn-level accounting the Acceptance criteria ask
for cannot be produced. The PO chose to drop the item rather than supply the
document. If the underlying friction recurs, it should be re-filed fresh
against live evidence rather than reopening this item.
