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

## Controlled Codex CLI measurement (2026-09-28)

The prepared summary option was measured against a controlled 14,030-byte
Unicode/CRLF request using six actual CLI main calls. Full-plan output is
47,815 UTF-8 bytes; summary output is 2,153 bytes, a reduction of 45,662 bytes
(95.50%). The escaped request occupies 42,789 output bytes across three copies
in the full response and none in the summary. The explicit returned full-plan
action reproduces the full response byte-for-byte. All six calls return exit 0
with empty stderr.

The coordinator's proposed generation action adds `--summary`; a direct CLI
call without that flag retains the legacy full response. Generated artifacts
remain byte-identical to the baseline, including the original request once in
each of design-input, PRD and Spec (45,481 total artifact bytes). This verifies
unchanged coverage bytes for the controlled input, not independent semantic
review. Stored duplication and routine `pendingAsks` compaction remain open.
Native token counts, host output budget and host/display truncation are unknown.

Exact commands, stdout hashes and artifact digests are recorded in
`scratch/generator-output-measurement-report.md` and its evidence JSON. The run
binds aggregate patch `da45198b2fabf5a5ab36defc1518865ca9cfde8e86a657029d865fa70de69337`
and assembly source commit `35d2a7d2e6c9d60bf272a9ac38db817759b8e107`.
This is preparation evidence; source integration, host-budget acceptance and
candidate qualification remain pending. The item stays open.
