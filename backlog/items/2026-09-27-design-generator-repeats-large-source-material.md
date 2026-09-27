---
schema: pipeline.backlog-item.v1
id: pipeline.design-generator-repeats-large-source-material
type: workflow-improvement
owner: pipeline
status: open
created: 2026-09-27
source: "Codex/WSL greenfield review B6 and Claude/Windows greenfield review F-06, 2026-09-27; observed large generation output and repeated ask envelopes; exact token cost remains unmetered."
sprint: none
done_when: manual
---

# Design generation should reference large source material instead of repeating it

## Description

The greenfield run produced a 14,871-byte design input plus PRD, Spec,
revised design and traceability files totaling 37,542 bytes. The report says
the original request appeared multiple times and the generator response was
partly truncated. File sizes are verified; the claimed token total and
duplication cost require an actual output trace before optimization. The
independent Claude run reports a roughly 50 KB `intake-generate-plan` response
and repeated multi-kilobyte `pendingAsks` envelopes on `inspect`.

## Triggering situation

The 2026-09-27 Codex Feature intake of a roughly 14-kilobyte user request.

## Affected artifact

Greenfield design generator, its output envelope, design-input source
binding, PRD/Spec/traceability generation and resume context budget.

## Proposal

Measure exact repeated bytes and response truncation on the recorded input.
Keep the original text in one immutable, digest-bound design-input artifact;
refer to stable section IDs and hashes in derived documents where this keeps
them independently reviewable. Return compact metadata and paths by default,
with full content on explicit read. Make routine `inspect` responses compact
after an ask has been shown, while preserving a stable way to retrieve the
full ask and generated target content.

## Acceptance

- A measured before/after run reports emitted bytes, output tokens where
  available, truncation and duplication, with identical requirement coverage.
- A fresh reviewer can still understand the PRD and Spec from their bounded
  references and explicitly available source; no requirement disappears.
- The host response remains below its output budget for the same large input.

## Triage
