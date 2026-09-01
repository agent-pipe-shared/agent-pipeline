---
schema: pipeline.backlog-item.v1
id: pipeline.restricted-store-rationale-field-lacks-adversarial-variant-coverage
type: defect
owner: pipeline
status: open
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
