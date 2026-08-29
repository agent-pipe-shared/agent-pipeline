---
schema: pipeline.backlog-item.v1
id: pipeline.bootstrap-skill-grows-by-budget-raise-instead-of-by-module
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-08
sprint: nightwing
due: 2026-09-05
source: "PO, 2026-08-08, on raising the pipeline-start byte budget 15,000 -> 18,000: optimisation is worth doing, but as an efficiency pass later, when more files still need to become modules — not as a detour inside the 0.5.4 hardening block."
done_when: manual
---

# The bootstrap skill grows by raising its budget, when it should grow by moving content into references

`skills/pipeline-start/SKILL.md` has a byte budget asserted in
`pipeline-start-v3.test.mjs` because it is read at the start of every session:
every byte is paid on every session. The skill already has a `references/`
directory with six lazily-read files, and the budget's whole point is to push
content there rather than into the core.

Twice now the answer to hitting the cap has been to raise the cap
(15,000 → 18,000 on 2026-08-08). Each individual raise was justified and
recorded at the assertion. The pattern is still the wrong direction: a budget
that moves whenever content arrives measures nothing.

## Why this is deliberately not urgent

The PO's framing, and it is the right one: this is an efficiency pass, not a
correctness defect. Nothing is broken, no session fails, no consumer is blocked.
It is worth doing once, properly, at a point where several files are being
modularised together — not as a detour inside a hardening block whose subject is
onboarding deadlocks.

SETUP-3's bootstrap questions are still to land in this same file, so the right
moment is after that content exists, not before: modularising around content that
has not arrived yet would guess at the seams.

## Direction, not a design

1. **Decide the seam rule first**, then apply it — what belongs in a core a
   session always reads, versus a reference it reads only on a specific
   condition. The existing six references were split ad hoc; a stated rule is
   what makes the next split obvious instead of a judgment call.
2. **Sweep more than this one file.** The PO named this explicitly: several
   artifacts are candidates for the same treatment. Doing them together is what
   makes the rule real; doing this one alone repeats the ad hoc split.
3. **Then lower the budget to what the modularised core actually costs**, and
   record that number as measured rather than chosen. A cap set above the current
   size is not a constraint.

## Related

- `2026-08-08-shipped-guidance-sends-agents-to-a-directory-a-gate-refuses.md` —
  the change that triggered the most recent raise.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred — owned by Sprint Nightwing.
- **Rationale:** the PO's own original framing already names this an
  efficiency pass to do once several files are ready for modularisation
  together, not urgent. Matches Sprint Nightwing's confirmed scope
  (product experience / onboarding surface) — the bootstrap skill is
  exactly that surface.
- **Assignment (if accepted):** next available Nightwing slot, bundled with
  any other bootstrap-skill-text work landing in that window (e.g. the
  sibling item on live-rejection-only constraints).
- **Date:** 2026-08-17

- **PO decision (2026-08-28, Alfred design gate):** this Triage is honored and
  the `sprint:` field is corrected to `nightwing`. The field said `alfred`
  only because the 2026-08-27 mass sprint assignment (`6d81b33b`,
  NVA-SPRINTASSIGN-1) set it without reconciling against existing Triage
  prose; the conflict was surfaced to the PO as PRD §9 decision 1. The
  deciding argument beyond the triage itself: this item's entry condition
  (SETUP-3's bootstrap questions landing in the same file first) lies outside
  Alfred, so inside Alfred it would have been the only work package whose
  start condition the epic does not control.
