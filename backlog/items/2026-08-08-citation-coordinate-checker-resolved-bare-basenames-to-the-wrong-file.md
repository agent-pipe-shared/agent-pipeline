---
schema: pipeline.backlog-item.v1
id: pipeline.citation-coordinate-checker-bare-basename
type: defect
owner: pipeline
status: open
created: 2026-08-08
source: "Filed under phase-plan item R3.3 (gate integrity and residual closure). Disclosed inside the R3 design's own verification log (specs/sprint-phoenix-epic/design/part-a-residuals-and-dispatch-template-drift.md §II.8, round-2 rework, F-B) but never filed as its own item, so the finding was reachable only by whoever read that section."
due: 2026-09-07
---

# The R3 coordinate checker resolved bare basenames to the wrong file, five of them silently

## Description

The R3 citation work verified its own coordinates with an ad-hoc checker: for each
cited `path:line`, resolve the file, print the line, compare it against the claim
the citing sentence makes. That method is the reason R3's numbers can be trusted at
all — and it has one defect, which its own verification log measured.

**A coordinate written as a bare basename is resolved by suffix match against the
tracked file list.** Seven of the 52 unique coordinates in Part II are written as
`critic-review.md:<N>`, with the file inherited from the surrounding sentence. Two
tracked files carry that basename:

| Path | Role |
| --- | --- |
| `harness/checklists/critic-review.md` | the checklist |
| `templates/prompts/critic-review.md` | the dispatch template — the intended target |

All seven resolved to the checklist. **Two failed loudly** with
`line-out-of-range`, which is how the defect was noticed at all. **Five returned
unrelated text from the wrong file under status `ok`.**

That asymmetry is the whole point of this item. A checker that resolves the wrong
file and says so is a nuisance; a checker that resolves the wrong file and returns
`ok` manufactures verification evidence. Five coordinates would have been recorded
as machine-verified against a file nobody cited.

They were caught because the two loud failures prompted a second pass: all seven
were re-resolved directly at the pin by a separate script
(`.git/phx-r3-rework-2-tailset.mjs`, output `.git/phx-r3-rework-2-tailset-84876f1.json`).
So the published R3 figures do not rest on the five wrong greens. The defect cost
nothing this time; it was found by luck of collocation, not by design.

**A second silent surface in the same tool.** The checker prints a 240-character
head of the resolved line. A citation whose content sits past that cut is compared
against a truncated string. The same second script covers the five Part II
coordinates in that class — again by hand, again not by the tool.

## What is NOT affected

`harness/scripts/check-doc-contracts.mjs` — the committed documentation gate — does
not have this defect. It resolves link targets relative to the containing file and
never suffix-matches a basename against the tree. This item is about review-evidence
tooling, not about the gate, and should not be read as a finding against it.

## Affected artifact

No committed file. The checker existed only as `.git/phx-r3-*.mjs` scripts for the
duration of the R3 rounds, which is itself part of the finding: a tool that produced
review evidence for a design document was never reviewable, never tested, and is now
only reconstructable from the design's own description of it.

Disclosure: `specs/sprint-phoenix-epic/design/part-a-residuals-and-dispatch-template-drift.md`
§II.8, finding F-B.

## Proposal

**Owner: PO**, for assignment. Three parts, and only the first is urgent.

1. **Ambiguity must fail closed, not pick.** Any coordinate resolver used for review
   evidence resolves a basename to exactly one tracked path or reports
   `ambiguous` — never "the first suffix match". A resolver that guesses cannot be
   distinguished from one that is right, which is the property that makes its
   greens worthless.
2. **If this tool is used again, it is committed.** A checker whose output is quoted
   as verification in a reviewed artifact belongs in `harness/scripts/` with its own
   suite, not in `.git/`. The alternative is what happened here: the evidence
   outlives the instrument that produced it, and no later reader can re-run it.
3. **Truncation is a result, not a display choice.** Printing a head is fine;
   returning `ok` after comparing against a truncated head is the same class of
   defect as (1). Report `truncated` and let the caller decide.

**A cheaper alternative worth considering first:** forbid bare-basename coordinates
in reviewed artifacts outright and require repo-relative paths. That removes the
ambiguity at the source instead of teaching every future tool to detect it, and it
is enforceable by the documentation gate that already exists.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
