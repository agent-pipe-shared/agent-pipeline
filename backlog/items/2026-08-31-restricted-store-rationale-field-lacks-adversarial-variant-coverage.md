---
schema: pipeline.backlog-item.v1
id: pipeline.restricted-store-rationale-field-lacks-adversarial-variant-coverage
type: defect
owner: pipeline
status: closed
closed_at: 2026-09-03
closure_repository: self
closure_commit: 3a6ceaf7d2fe14f71fa0230bb7a089ec7db02c9f
closure_evidence: backlog/evidence/2026-09-02-nva-b-rstore-1-after.txt
created: "2026-08-31"
sprint: nova-b
done_when: "contains plugins/pipeline-core/lib/human-decision-attribution.test.mjs Unicode-confusable"
source: "Exhaustive privacy sweep Critic review, F3 (minor), specs/sprint-phoenix-epic/evidence/privacy-sweep-critic-review-4defe09e.md"
due: "2026-10-31"
---

# Restricted-store `rationale` field lacks adversarial variant test coverage

## Description

`specs/sprint-phoenix-epic/design/privacy-review.md` §4 bullet 2 requires
nested, encoded, Unicode-confusable, multiline, oversized, malformed,
external-content and error-path variants to be covered by the restricted-store
fixture. `plugins/pipeline-core/lib/human-decision-attribution.test.mjs` has 11
tests covering closed shape, closed value sets, oversized/non-scalar rationale,
key-reference pattern, digest form, bucket alignment and the R-2 no-correlator
proof, but does NOT cover Unicode-confusable, encoded, nested, multiline or
external-content variants against the 4096-character free-text `rationale`
field (`MAX_RATIONALE_LENGTH = 4096`, `human-decision-attribution.mjs:42`).

## Triggering situation

Independent Critic review of the exhaustive privacy sweep, finding F3 (minor),
`specs/sprint-phoenix-epic/evidence/privacy-sweep-critic-review-4defe09e.md`.
Risk was assessed as limited by the Critic rather than as a blocker: the field
is restricted-profile-only by kernel enforcement, and
`isUnicodeScalarString` (`human-decision-attribution.mjs:49-62`) already
rejects lone surrogates. Those two mitigations do not substitute for the
adversarial fixture coverage §4 bullet 2 requires; they bound the exposure
while the coverage gap stays open.

## Affected artifact

- `plugins/pipeline-core/lib/human-decision-attribution.test.mjs` — missing
  Unicode-confusable, encoded, nested, multiline and external-content variant
  tests against `rationale`.
- `plugins/pipeline-core/lib/human-decision-attribution.mjs` — the field and
  its two existing mitigations (`MAX_RATIONALE_LENGTH`, `isUnicodeScalarString`).
- `specs/sprint-phoenix-epic/design/privacy-review.md` §4 bullet 2 — the
  contract this item closes.

## Proposal

Add the five missing variant categories (Unicode-confusable, encoded, nested,
multiline, external-content) as adversarial test cases against `rationale` in
`human-decision-attribution.test.mjs`, alongside a malformed and an
error-path variant if not already implied by the existing oversized/non-scalar
tests. Owner: Elephant/next Phoenix restricted-store work package. Due
2026-10-31 — a documented risk needs both an owner and a dated expiry, which
is precisely what this finding was filed to establish.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** {{accepted | deferred | rejected | merged-into-<filename>}}
- **Rationale:** {{mandatory for rejected/deferred; optional for accepted}}
- **Assignment (if accepted):** {{phase/release}}
- **Date:**

## Triage, 2026-09-03 — closed, and a note on why it stayed open a day too long

The five variant categories were already covered by `b0f1dafc`
(`NVA-B-RATIONALEVAR`, 2026-09-01), which satisfied this item's own
`done_when` predicate. The item nevertheless still read `status: open` with an
empty Triage block, and a dispatch was briefed against it on that basis on
2026-09-02. The dispatch verified the premise against primary source before
touching anything, found the work already done, and salvaged the one genuine
remaining gap instead: no test passed a non-string `rationale`, so the
`typeof payload.rationale !== "string"` arm of the `HDA-RATIONALE` check
(`human-decision-attribution.mjs:78`) was unreached. `3a6ceaf7` closes it —
distinct from the existing "non-scalar" case, which rejects an ill-formed
*string* and never reaches that arm.

The dispatcher's own error is recorded here rather than left implicit: the
item file was read, but `git log` over the affected path was not, which
CLAUDE.md requires before briefing a dispatch on an inherited "still open"
claim. One command would have shown `b0f1dafc`.

This is a live, measured instance of
`pipeline.resolved-backlog-items-can-keep-status-open-indefinitely` — the cost
is no longer hypothetical: a stale `open` status spent a full dispatch.
