---
schema: pipeline.backlog-item.v1
id: pipeline.scanner-diagnostics-keep-no-finding-provenance-before-suppression
type: defect
owner: pipeline
status: open
created: 2026-10-21
source: "PO decision D77 2026-10-21 (AC-249 Oct 10 suffix deferred), specs/sprint-alfred-epic/plans/po-decisions-2026-10-18.md"
sprint: none
done_when: manual
---

# Scanner diagnostics keep no per-finding provenance before a repair or suppression (target 0.7.x)

## Description

Target: 0.7.x (PO decision D77, 2026-10-21). The security-scanner diagnostic record
(`plugins/pipeline-core/lib/security-scanner-diagnostics.mjs`, closed schema
`pipeline.security-scanner-diagnostics.v1`) keeps executable, rules and candidate digests, exit,
signal and elapsed time, but no rule id, finding location or sanitized finding evidence. When a
finding is later repaired (for example `scripts/gitleaks-repair-ignore.mjs`) or suppressed, nothing
records what was actually switched off.

The Oct 10 suffix of the original item `security-scanner-failure-provenance` (AC-249; its body is
private, its meaning sentence is in
`specs/sprint-alfred-epic/evidence/checkpoint-2026-10-12/portable-original-requirements.json`)
asks for exactly this. AC-249 is judged for 0.7.0 without the suffix and the release note names it.

## Acceptance

- Confirm the exact fields against the private suffix text first.
- A bounded, sanitized per-finding projection (rule id, file:line location, redacted key evidence)
  is retained before any repair or suppression, in the diagnostic-only schema (version bump or ADR
  amendment), with its builder and readers.
- Redaction has negative tests: no secret value reaches the record.
- Verdict independence holds; an unavailable scanner stays unavailable and never becomes PASS.
