---
schema: pipeline.backlog-item.v1
id: pipeline.handover-rotation-extraction-acknowledgment-is-repo-wide-not-section-scoped
type: defect
owner: pipeline
status: closed
created: 2026-08-18
closed_at: 2026-08-19
closure_repository: self
closure_commit: 9ae28dad3f6c9c41833e7d629fa3d1d73872d2a2
closure_evidence: backlog/items/2026-08-18-handover-rotation-extraction-acknowledgment-is-repo-wide-not-section-scoped.md
source: "PO, 2026-08-18, in-session while planning an incremental extraction pass over docs/state.md's oldest sections (ADR-0066 Decision 6/7): the PO read the mechanism's actual behavior back and said 'das macht auch keinen Sinn und sollte angepasst werden' (that doesn't make sense either and should be adjusted)."
---

# `handover-rotate.mjs`'s `--acknowledge-extraction-done` marker is repo-wide and one-time, not scoped to the sections actually reviewed

## Description

ADR-0066 Decision 6 requires a one-time, judgment-heavy extraction pass
(read the accumulated handover history, lift any embedded durable rule
into an ADR/policy/guardrail file) before any section of `docs/state.md`
can be rotated into `docs/state-archive/`, enforced by the script
refusing to run at all until `--acknowledge-extraction-done` has been
passed once. The refusal check
(`isExtractionAcknowledged()`/`assertExtractionAcknowledged()`,
`plugins/pipeline-core/scripts/handover-rotate.mjs`) is a boolean, keyed
only by "has this ever been recorded for this repository" — it does not
record WHICH sections were reviewed. Once the marker is written, the
script no longer gates ANY future rotation on extraction being done for
that specific content: a rotation of sections added long after the
marker was set, and never reviewed by anyone, would go through with no
further check at all.

This defeats the safety goal an incremental, oldest-sections-first
extraction pass is meant to provide: doing a real review of the oldest,
clearly-closed sections and setting the marker to unblock rotating THEM
would silently also authorize rotating every later, unreviewed section
from that point on, with the tool giving no indication anything was
skipped.

## Triggering situation

Planning session, 2026-08-18: proposed doing an incremental extraction
pass (oldest sections first, ~2026-07-30 through ~2026-08-12) rather
than attempting the entire ~8,300-line file's history in one pass, and
dispatching a fork to cross-reference each section against existing
ADRs/guardrails/CLAUDE.md before rotating it. Reading `handover-rotate.mjs`
to confirm this was mechanically safe surfaced the repo-wide, one-time
shape of the marker — confirmed by code inspection
(`isExtractionAcknowledged`/`recordExtractionAcknowledged`,
`handover-rotate.mjs` ~lines 62-99) and cross-checked against ADR-0066's
own text ("checked once per repository via a small marker file it
writes, not re-asked every invocation").

## Affected artifact

`plugins/pipeline-core/scripts/handover-rotate.mjs` (the
acknowledgment-marker check), `plugins/pipeline-core/lib/handover-rotation.mjs`
(if the marker's persisted shape needs to move there), and
[ADR-0066](../../docs/adr/0066-handover-rotation-extraction-archive-hard-size-gate.md)
Decision 6 (needs an amendment or superseding decision, since the
current text explicitly describes the one-time, non-scoped shape as
intentional).

## Proposal

Not yet designed in detail. Direction worth comparing when this is
picked up: change the marker from a boolean to a set of acknowledged
section identifiers (title, or title+content-hash to also catch a
section being edited after acknowledgment but before rotation), and
have `assertExtractionAcknowledged` check that EVERY section named in
the current `--section-heading` list is present in that set — not just
that the marker file exists. A rotation naming a never-acknowledged
section still refuses, exactly as an entirely un-acknowledged repository
does today; only the specific, already-reviewed sections in a given
rotation event are ever unblocked. Needs a look at whether
`rotate-handover-sections.mjs` (the older, heuristic/close-time
mechanism, ADR-0060 candidate 2) has the same gap or a different one —
not investigated here.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** not yet decided — filed to preserve the finding.
- **Rationale:** real design work (touches ADR-0066's own Decision 6
  text, plus the shared marker-file schema); not something to redesign
  inline while mid a different task. Interim mitigation recorded as a
  CLAUDE.md Hard Rule (2026-08-18, same date): treat the marker as
  process discipline, not a technical guarantee — never rotate a batch
  of sections without actually reviewing that specific batch first,
  regardless of whether the repo-wide marker already exists from an
  earlier, narrower pass.
- **Date:** 2026-08-18

## Closure, 2026-08-19 (verified live against current code, not against status text)

Confirmed resolved in code by an independent, code-first verification pass
(Workflow task wdyd7rk9g, 2026-08-19) run in response to a PO directive to
actively check every open backlog item against current code rather than
trusting frontmatter status. The item's own frontmatter/Triage text had not
been updated to reflect the landed fix; this closure catches that drift.

plugins/pipeline-core/scripts/handover-rotate.mjs now implements exactly the fix the item's Proposal called for. `ACK_MARKER_SCHEMA = "pipeline.handover-rotation-extraction-ack.v2"` (line 54); the file's own header comment (lines 30-38, 65-81) states: 'ADR-0066 Decision 6 (the section-scoped extraction gate, schema v2 as of 2026-08-18)... The marker records title + content-hash pairs, not a repo-wide boolean: a section never acknowledged still refuses rotation, and a section edited after acknowledgment but before rotation refuses again too (its hash no longer matches).' Functions `sectionContentHash()`, `readAckMarker()`, `getAcknowledgedSections()` implement this; an old-schema (v1) marker is treated as fully absent, never grandfathered (lines 78-81). This lands via commit cda02208 'fix(handover-rotate): scope the extraction-acknowledgment marker to sections (schema v2)', with a follow-up hardening commit ec18303e adding repository-containment checks. CLAUDE.md itself was also updated (commit c2cd3cd3 'update stale handover-rotation extraction hard rule to schema v2') to describe this same fix. The item's own frontmatter (status: open) and Triage ('not yet decided — filed to preserve the finding') were never updated to reflect that the code-level gap is now closed — this is exactly the kind of drift the task asked me to catch.
