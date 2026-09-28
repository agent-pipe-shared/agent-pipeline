---
schema: pipeline.backlog-item.v1
id: pipeline.advisor-evidence-read-enforces-size-limit-after-allocation
type: defect
owner: pipeline
status: open
created: 2026-09-28
source: "Independent read-only source audit of canonical advisory-lifecycle-v2.mjs and Scratch Codex Advisor binding, source 98e752a9. Physical reads are unbounded before declared limits; no large or private operator file was read."
sprint: none
done_when: manual
---

# Bound Advisor evidence reads before allocating file content

## Description

`readPhysicalAdvisoryEvidence` opens and identifies a physical single-link file,
then uses `readFileSync(descriptor)` without first rejecting a size beyond its
262,144-byte reference limit. Only after allocation and identity readback does
it reject oversized content. `buildAdvisoryEvidenceBundle` also constructs all
references before validating the 1,048,576-byte aggregate limit. Declared limits
therefore bound accepted evidence, but do not bound the preceding read/allocation.

The prepared Codex binding uses this canonical builder before its request
validator. Its conservative public path policy is evaluated only after physical
reads; a path rejected by that policy can be read before rejection. No model
export, private-content leak, actual resource exhaustion or production incident
is established by this source audit. Existing alias checks remain present.

## Affected artifact

`plugins/pipeline-core/lib/advisory-lifecycle-v2.mjs` physical evidence reader
and bundle builder; proposed ordinary Codex Advisor binding and caller ordering.

## Proposal

Reject declared file sizes before allocation and use a bounded descriptor read
with one overflow byte and identity rechecks. Track the aggregate budget before
each next read. For the Codex public-evidence route, apply its admissible path
policy before opening content. Preserve exact UTF8/BOM/CRLF bytes and the
existing canonical evidence-envelope digest.

## Acceptance

- Oversized reference and aggregate input is rejected before an unbounded
  read/allocation; racing growth cannot exceed a bounded read buffer.
- Codex-disallowed public evidence paths are refused before content reads.
- Physical-root, alias, single-link and descriptor/path identity checks remain.
- Valid bounded Unicode/CRLF evidence retains the canonical digest, and invalid
  UTF8, source drift, aliases and overflow are covered with controlled fixtures.
- No real private file, model invocation or PO signature is required to verify
  the defect or its correction. Native integration remains separately tested.

## Evidence

Independent audit and bounded reader preparation are being recorded under
`scratch/codex-advisor-composition-risk-audit.md` and
`scratch/codex-advisor-public-evidence-*`. This item records the confirmed
source ordering defect; no integrated correction or closure is claimed.

## Triage
