---
schema: pipeline.backlog-item.v1
id: pipeline.dispatch-record-contaminates-every-critic-review
type: defect
owner: pipeline
status: deferred
created: 2026-08-09
source: "Found on 2026-08-09 by the third Critic round of the night (review object 19e3793), which reported it as a briefing violation against its own dispatch and disclosed how it handled it. Verified independently at source by the Elephant before filing: templates/prompts/goldfish-task.md defines the record's shape, and every evidence/dispatch-record-*.json in this checkout carries a `report` field."
due: 2026-09-08
---

# The dispatch record smuggles the implementor's report into every Critic review

## Description

`templates/prompts/critic-review.md` names *dispatch-record evidence* as an admissible
input — it is how a Critic verifies who authored a diff. In this repository that record
is a single JSON file that carries **both** the authorship metadata (`taskId`, `model`,
`rulesetSha`, `dispatcher`, `outcome`, `commit`) **and** the implementor's full
completion report: a multi-kilobyte `report` field with DoD results, deviations, open
items, plus per-phase `log[]` entries of implementor reasoning.

CR-01 and the template's own fail-closed boundary close admissible Critic input against
exactly that category — "implementor explanation", "summaries of intent beyond the
spec", "prior verdict", "completion-report prose". So **pointing any Critic at
`evidence/dispatch-record-*.json` necessarily delivers the forbidden category.** The
reference is admissible; its contents are not; and the two cannot be separated because
they live in one file.

This is not a briefing that went wrong once. It is the documented shape of the artifact,
so it happens on every dispatch that follows the template correctly.

## Triggering situation

Four Critic dispatches on 2026-08-09 (review objects: thirteen enumerated commits on the
protected Critic surface, `e097b27`, `19e3793`) were each handed
`evidence/dispatch-record-*.json` as authorship evidence by the Elephant. The third
round reported it as a briefing violation, disclosed that it opened the file only after
independently reproducing five artifact claims and its own two mutation probes, and
stated that no finding rested on it beyond the authorship metadata.

The uncomfortable part is the contrast: the same briefings refused to paste a single
line of implementor rationale into the dispatch text, which is the isolation the whole
template exists to protect — and shipped the entire report through the one reference
believed to be pure metadata.

## Affected artifact

- `templates/prompts/goldfish-task.md` — field 6 defines the dispatch record and its
  authoritative shape (`taskId`, `model`, `rulesetSha`, `dispatcher`, `outcome`), and
  the *Report-early duty* instructs goldfish to maintain the running report **inside**
  that same file. The collision is written into the template.
- `templates/prompts/critic-review.md` — names dispatch-record evidence as an
  admissible reference without qualifying which part of it is admissible.
- `roles/critic.md` / ADR-0014 — CR-01, the rule being violated.
- Every `evidence/dispatch-record-*.json` produced under the current shape.

## Proposal

Split the artifact so the admissible half can be referenced alone. Two candidate shapes,
both keeping the report-early duty intact:

1. **Two files.** `dispatch-record-<task>.json` keeps authorship metadata only;
   `dispatch-report-<task>.json` holds the report and running log. Critic briefings
   reference the first; the Elephant reads the second. Cheapest to adopt, and the
   separation is visible in a directory listing.
2. **One file, one referenced projection.** Keep a single record, add a generator that
   emits an authorship-only projection for Critic dispatches. Avoids two artifacts
   drifting apart, at the cost of a step that can be skipped.

Whichever is chosen, `templates/prompts/critic-review.md` should name the admissible
artifact **precisely** rather than by directory glob, so a briefing cannot satisfy the
letter of the template while breaching CR-01.

**Interim mitigation, in force from 2026-08-09:** a Critic briefing must not reference
`evidence/dispatch-record-*.json` wholesale. Until the split exists, either omit the
authorship reference and let the Critic use commit trailers — which are the primary
trailer evidence the template already names — or point at a hand-prepared
authorship-only file.

**Worth deciding explicitly:** whether the four reviews already conducted under the
contaminated input need re-running. The third round's own disclosure argues no — it
reproduced its claims independently before opening the file and rested nothing on it
beyond authorship — but that is the reviewer's own account of its own contamination,
which is exactly the kind of self-assessment the isolation exists to make unnecessary.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Defer — real and open, but out of Phoenix's own epic scope
- **Rationale:** Confirmed still present (templates/prompts/goldfish-task.md:132-138 keeps report-early log and authorship metadata in one dispatch-record.json; critic-review.md:55-60 doesn't exclude the report field). This is Pipeline process/template tooling, not part of Sprint Phoenix's own delivered governance-kernel surface (spec.md sections 4-7). Condition to revisit: a general template-hardening session.
- **Assignment (if accepted):** Nova / general pipeline backlog — out of Phoenix's own epic scope
- **Date:** 2026-08-18
