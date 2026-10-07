---
schema: pipeline.backlog-item.v1
id: pipeline.advisor-evidence-read-enforces-size-limit-after-allocation
type: defect
owner: pipeline
status: closed
closed_at: 2026-10-07
closure_repository: self
closure_commit: 26fef9e7d26be3d59b7e609c1dad9dd04c747b4d
closure_evidence: specs/sprint-alfred-epic/plans/backlog-triage-2026-10-07.md
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

- **Decision:** closed — fixed in source
- **Rationale:** fixed at 26fef9e7d: lib/advisory-lifecycle-v2.mjs descriptor-bound read (fstat before read); test: advisory-lifecycle-v2.test.mjs 'advisory read bounds: declared sparse oversize rejects before open, content read or allocation'.
- **Assignment (if accepted):** n/a
- **Date:** 2026-10-07

## Prepared Codex public reader (2026-09-28)

The separate bounded public reader now rejects all disallowed paths before
opening content, rejects descriptor/file and rolling aggregate sizes before
allocation/read, bounds racing reads and rechecks physical source identities.
Its shared path policy is also used by request construction, and both binding
source reads use it. Eleven controlled reader cases pass.

Independent canonical-bundle comparison exposed an additional prototype digest
mismatch: pretty JSON versus canonical lifecycle compact JSON. Request creation
now calls the actual `advisoryEvidenceBundleSha256` API. The combined physical
reader/request/private-binding run passes 30/30 cases, exit 0, zero skip/todo,
with 21 stable source hashes in
`scratch/codex-advisor-bounded-evidence-composition.evidence.json`.

These Scratch changes do not modify the canonical generic reader; its correction
and integrated regression evidence remain required. No item closure, productive
Advisor receipt or native qualification follows from this run.

The generic canonical correction is now separately prepared and included in
aggregate `563fbe7b923e8d1f05073a814dba5022149885085f5cc7b02a3f6c1c342ad89e`.
It bounds descriptor reads to limit+1, checks file size before allocation and
uses a rolling aggregate budget before the next read. Generic path policy and
canonical digest remain unchanged. Seven new physical/VM regression cases,
two existing actual evidence cases and Git dry application pass; eight inputs
remained stable. Patch SHA256
`abb922538c790c64e8f1099936a97b26a794dbeff83c164cae27f9d6d7780fc8`;
`scratch/advisory-canonical-read-bounds-evidence.md` reports the exact scope.
The source file remains unchanged. Canonical regression registration, productive
integration and candidate qualification remain required.

## Further prepared journal read bound (2026-09-28)

The proposed private Advisor store independently bounds its own receipt reads,
but its imported `readHostJournal` still performs `readFileSync(descriptor)`
after a size check. File growth after that check can therefore exceed the
declared 524,288-byte journal limit. This concerns the prepared generic host
journal, not a demonstrated resource exhaustion or private-file incident.

A separate correction checks descriptor identity before content reads and uses
a fixed 524,289-byte overflow buffer with final size/identity checks. Six cases
pass: real canonical private bytes, actual sparse oversize with no allocation
or read, growth after fstat bounded to limit+1, pre-read descriptor drift,
short content and preserved alias/hardlink/noncanonical refusals. The racing
growth and instrumentation use an isolated VM dependency seam; ordinary fixture
filesystem reads are real. Source preparation and proposed Verify registration
are in `scratch/codex-journal-read-bounds-*`. No source application or native
Advisor/store qualification follows from these cases.

The generic lifecycle regression registration is separately prepared:
`scratch/advisory-read-bounds-registration-source.patch` adds all seven cases
to the existing canonical suite. Sixteen cases pass (nine existing/seven new),
with stable inputs and Git dry application. The existing Verify entry suffices;
no completion receipt is invented. Journal bounds have a separate proposed
six-case source suite and Verify entry in
`scratch/codex-journal-read-bounds-registration.patch`, with six passing adapted
source tests and exact stable byte bindings. Productive registered Verify has
not run against these proposed tests.
