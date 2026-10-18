---
schema: pipeline.backlog-item.v1
id: pipeline.critic-round-cap-and-delta-scope-are-not-enforced
type: defect
owner: pipeline
status: open
created: 2026-10-07
source: "Live observation, Agent-Pipeline Claude/Windows session 2026-10-06/07 (Alfred design revision 5, workstream R7); PO statement 2026-10-07: running more than one follow-up Critic is fatal and a recurring defect; follow-ups must be diff Critics only."
sprint: alfred
done_when: manual
---

# The Critic round cap (QG-13) and the delta-only follow-up scope are not enforced, and the Elephant keeps exceeding them

## Description

`guardrails/quality-gates.md` QG-13 (PO decision 2026-08-18 #5) allows one
initial Critic round plus one re-review round per package; after that the
Elephant self-verifies. `templates/prompts/critic-review.md` item 5 (Phase-2.6
bounded re-review) limits every follow-up to the exact range from the
previously reviewed commit to the correction candidate, its fixes and direct
regressions, with no new hunt over unchanged areas.

In the night run of 2026-10-06/07 the Elephant dispatched four Critic rounds
on the same R7 design amendment (Opus at max each time) and planned a fifth
"bundled" round. Several follow-ups re-read the whole amendment instead of the
delta, so each round surfaced new findings in already-cleared text and the
loop did not converge. The rule was only in prose; nothing counted rounds,
nothing bound a follow-up to the delta range, and nothing refused a third
dispatch. The PO reports this as a recurring defect, not a one-off.

Cost: four max-effort Critic dispatches, a correction goldfish per round, and
a design text that changed direction three times under review pressure
(R7-6 configured path → location rule → pin → probe).

## Acceptance

- The Critic dispatch path records the round number per package and refuses
  a third Critic dispatch for the same package with a typed code that names
  Elephant self-verification (or an explicit PO decision) as the next step.
- A follow-up dispatch must bind `base` = the previously reviewed commit and
  `head` = the correction candidate; a follow-up without that range, or with a
  range wider than the delta, is refused before launch.
- The Elephant role contract and the coordinator next-action text say
  "follow-up = delta Critic only, at most one" where they offer a Critic
  dispatch.

## Observed 2026-10-18: AGY greenfield, rigor 2 ran with zero Critic reviews (T3)

Source: PO-supplied forensic analysis of the Antigravity greenfield run on WSL
(`scratch/pipeline-analyse-greenfield_agy_20261026.md`, improvement 3),
installed `pipeline-core` 0.6.2.

- All eight dispatch records declared `riskClass: "low"` and an all-false diff matrix, and
  applied row T3 (rigor 2). T3 makes a Critic required, yet no Critic ran and the feature
  closed. The PO later found, while playing, a product defect that an independent review
  would likely have caught.
- Re-check against 0.7.0 (2026-10-18):
  - Path-derived triggers are enforced. `classifyCriticChangedPaths` /
    `criticDecisionPathFinding` (`lib/critic-skip-decision.mjs`) run in the native host
    finalizer, the AGY final return and `dispatch-authorship-verify.mjs`.
  - A required Critic without evidence is report-only. `check-critic-skip-coverage.mjs`
    detects it, and `dispatch-authorship-verify.mjs` returns `critic-evidence-pending`,
    but `close-feature` (`scripts/pipeline-state.mjs`) does not read per-dispatch
    `criticRequired` records and closes regardless.
  - `rigorLevel` and `riskClass` in the trigger are self-declared. They are checked only
    for internal consistency, never against the calibrated project rigor.

Added acceptance (0.7.0, major: a quality gate that does not hold in a user repository):

- `close-feature` refuses with a typed code while any dispatch record of the feature
  carries `criticRequired` without matching Critic evidence, and names the Critic dispatch
  as the repair.
- A dispatch record whose trigger declares a lower `rigorLevel` than the calibrated
  project rigor is refused at write time.
- A pin drives both refusals in a fixture user repository.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted for the next local 0.7.0 candidate (PO 2026-10-07:
  the whole remaining open scope goes into that candidate).
- **Rationale:** recurring, costly, and the rule already exists; only the
  enforcement is missing.
- **Assignment (if accepted):** Alfred implementation, guard/dispatch slice.
- **Date:** 2026-10-07
