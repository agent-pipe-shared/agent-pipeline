---
schema: pipeline.backlog-item.v1
id: pipeline.compact-nudge-cadence-too-aggressive-and-not-configurable
type: idea
owner: pipeline
status: open
created: 2026-08-26
sprint: nightwing
done_when: contains plugins/pipeline-core/hooks/stop-suggest.mjs resolveCompactNudgeThresholds
source: "PO observation (chat), 2026-08-26, during a long Phoenix-merge session"
---

# The `/compact` nudge fires too early/too often and has no repo-side configuration

## Description

During a long session, the runtime's Stop-hook context nudge suggested
`/compact` repeatedly and increasingly urgently at roughly 405k, 483k, and
523k tokens of context — each time immediately after the prior compaction,
meaning the effective usable window between nudges was consumed quickly
relative to the PO's expectation. The PO's request: raise the threshold so
the first nudge comes meaningfully later (PO suggested ~600k as a starting
point) and/or requires a larger minimum gap between nudges (PO suggested
~50k), and make this cadence configurable per-repository rather than fixed.

## What's unclear / needs investigation before implementing

A quick check this session found no reference to `compact` in this
project's own `.claude/settings.json`, and no hook file under
`plugins/pipeline-core/hooks/` producing the nudge text observed
("Stop hook additional context: ... Context Nk — /compact handover
window..."). This suggests the nudge may be a Claude Code CLI core/runtime
behavior rather than something this repository's own Pipeline hooks
currently control — not confirmed either way, just not yet located. Before
implementing a `pipeline.yaml`-configurable cadence (the PO's suggested
config surface), a future session needs to confirm: (a) is this nudge
actually hook-driven from within this plugin (in which case it is directly
configurable here), or (b) is it a Claude Code CLI setting outside this
repository's control (in which case `pipeline.yaml` cannot govern it
directly, and the right fix might be a documented recommendation/support
request to Claude Code itself, or a repo-side workaround like suppressing
the specific hook if one exists).

## Proposal (provisional, pending the investigation above)

If hook-controlled: add a configurable cadence (e.g. minimum context
delta between nudges, and/or a higher first-nudge threshold) under
`pipeline.yaml`, defaulting to something closer to the PO's suggested
~50k minimum gap / ~600k first nudge, while keeping a sane hard ceiling so
a session can never run so long it silently loses handover fidelity.

## Triage

- **Decision:** open, unassigned — filed per PO instruction ("erst mal nur
  backlog", 2026-08-26); not investigated or implemented this session.
