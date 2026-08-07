---
schema: pipeline.backlog-item.v1
id: pipeline.dispatch-templates-cite-restructured-operating-model-sections
type: defect
owner: pipeline
status: in_progress
created: 2026-08-07
source: Critic round-4 briefing-violations note, delta re-review of WP2-WP3-partA-rework-3 (specs/sprint-phoenix-epic/evidence/wp2wp3-parta-rework-3-delta-critic-review-138e2e3.md); widened by the Elephant on verification. Recorded, not fixed, because the correct target is a real decision rather than a renumbering.
---

# Both dispatch templates cite `operating-model.md` sections that no longer exist

## Description

`docs/operating-model.md` has been restructured since the dispatch templates
were written. Its `##` headings are now §1 What the model protects, §2 Roles
and boundaries, §3 V3 routing, §4 The lifecycle, §5 Rigor, risk and gates,
§6 Evidence, review and recovery, §7 Project calibration, §8 Operating shapes,
§9 Authority precedence, §10 Glossary. **§2 and §4 carry no subsections at
all** (§3 and §5 are the only sections with `###` children).

Both dispatch templates still cite the old numbering as their stated source of
truth:

- `templates/prompts/critic-review.md:5` — "Source of truth:
  `docs/operating-model.md` §2.4 (Critic contract + report format), §4.2
  (trigger matrix; canonical German trigger wording — authoritative)".
  Neither §2.4 nor §4.2 exists.
- `templates/prompts/critic-review.md:142` — "Dispatch metadata
  (operating-model §2.3 field 6, critic variant)". §2.3 does not exist.
- `templates/prompts/goldfish-task.md:5` and `:7` — "Source of truth:
  `docs/operating-model.md` §2.3 — the canonical briefing field list" and
  "(per operating-model.md §2.3)". §2.3 does not exist.

Where the content actually lives today, verified by reading:

- **Critic contract:** `docs/operating-model.md:45` (the roles table's Critic
  row) and `:233-236` (§6, "The Critic works from paths/refs … The Elephant
  decides whether each finding is fixed, accepted with a reason, or escalated;
  it must not silently discard one"). Split across two sections, neither
  numbered as the templates claim.
- **Rigor/gate material** (what the templates call the "trigger matrix"):
  §5 Rigor, risk and gates (`:164`, with `### Gate discipline and autonomous
  happy path` at `:185`).
- **The six-field briefing list:** **not present in `operating-model.md` at
  all** — `rg -n "briefing|Dispatch metadata|six field"` against that file
  returns one unrelated hit (`:300`). The canonical list currently exists only
  inside `templates/prompts/goldfish-task.md` itself, which therefore cites a
  source of truth for content it is the sole carrier of.

## Triggering situation

The round-4 Critic on `WP2-WP3-partA-rework-3` reported, under briefing
violations: the guardrail reference `docs/operating-model.md §2.4, §4.2`
supplied in its dispatch does not resolve, and it located the substance
itself. Explicitly recorded there as **non-contaminating** — it did not
restrict or steer the Critic's search surface and carried no rationale,
summary, or expected conclusion — and as an Elephant follow-up rather than a
defect of the reviewed package. The Elephant then verified the reference
against the file and found the drift is wider than the one reference the
Critic hit: it affects both templates and, for the briefing field list,
there is no correct target to point at.

## Affected artifact

`templates/prompts/critic-review.md` (`:5`, `:142`),
`templates/prompts/goldfish-task.md` (`:5`, `:7`), and
`docs/operating-model.md` (as the cited-but-restructured target). Every
dispatch built from either template inherits the stale citation, because the
Elephant copies the reference list into the dispatch — which is exactly how
this surfaced.

## Proposal

**Owner: PO.** Two of the three fixes are mechanical; the third is a real
decision, which is why this is recorded rather than fixed in-session.

1. **Mechanical:** repoint the Critic contract reference to §2 (roles table)
   plus §6, and the rigor/gate reference to §5. Both targets verified above.
2. **Mechanical:** decide whether section *numbers* should be cited at all,
   given they have now drifted at least once. Citing stable heading titles
   ("§ Evidence, review and recovery") rather than numbers would make this
   defect class non-recurring; `harness/scripts/check-doc-contracts.mjs`
   validates links and anchors but does not validate prose `§N.M` references,
   so nothing mechanical catches the next drift either.
3. **Decision required — the six-field briefing list has no home.** The
   templates name `operating-model.md` as its source of truth, but the list
   lives only in `goldfish-task.md`. Candidate directions, disclosed rather
   than pre-selected: (a) restore a canonical briefing-field section to
   `docs/operating-model.md` and have the template cite it; (b) declare
   `templates/prompts/goldfish-task.md` itself the canonical carrier and
   delete the outbound source-of-truth claim; (c) move the list to a
   dedicated normative file under `docs/` or `roles/` and have both the
   operating model and the template point at it. Option (a) changes a
   normative document; (b) is the smallest change but demotes the operating
   model's stated role as the normative core; (c) adds a file.

Note that `templates/prompts/*.md` are normative dispatch artifacts governed
by CLAUDE.md's "Dispatch from the template, never freehand" rule — a change
to them affects every future Goldfish and Critic dispatch, so the PO may want
this to run as its own briefed task with a Critic pass rather than as an
in-session edit.

## Triage

- **Decision:** ACCEPTED for implementation. PO decision (APS, 2026-08-07):
  implement, and carry into the Phoenix design so it lands in the
  implementation phase as planned scope.
- **Rationale:** the PO's stated position on the open residuals from the
  WP2-WP3 Part A review was "warum nicht umsetzen bzw. ins design bitte
  aufnehmen von phoenix für implementierungsphase". This one compounds with
  every future dispatch: the Elephant copies the stale reference list out of
  the template into each Goldfish/Critic briefing, which is exactly how it
  surfaced.
- **Assignment (if accepted):** proposal items 1 and 2 (repoint the Critic
  contract reference to §2 + §6 and the rigor/gate reference to §5; decide
  whether to cite stable heading titles instead of drift-prone numbers) are
  mechanical and can go into an ordinary briefed task. Proposal item 3 (where
  the six-field briefing list canonically lives — restore it to
  `operating-model.md`, declare the template its carrier, or move it to a
  dedicated normative file) remains a real decision and is design work. Per
  this item's own closing note, `templates/prompts/*.md` are normative
  dispatch artifacts under CLAUDE.md's "Dispatch from the template, never
  freehand" rule, so the change runs as its own briefed task with a Critic
  pass, not as an in-session edit. To be folded into the Phoenix design for
  the implementation phase together with the two sibling items recorded the
  same day.
- **Design (2026-08-07):** designed as residual R3 in
  `specs/sprint-phoenix-epic/design/part-a-residuals-and-dispatch-template-drift.md` Part II
  (proposal item 3 decided there; the citation inventory found four stale references beyond
  the four recorded here).
- **Date:** 2026-08-07
