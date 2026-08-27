---
schema: pipeline.backlog-item.v1
id: pipeline.no-sanctioned-dispatch-trailer-form-exists-for-direct-elephant-design-commits
type: defect
owner: pipeline
status: open
created: 2026-08-27
sprint: alfred
source: "Flagged independently by both 2026-08-27 design-review Critics (round 1A finding F1, round 1B finding F10; reports under specs/sprint-alfred-epic/evidence/critic/); scope question resolved against docs/operating-model.md §3.3 in the round-1 response."
---

# No sanctioned `Dispatch:` trailer form exists for direct Elephant design-phase commits

## The gap

`templates/prompts/agent-obligations.md` §6 (generated; GIT-03) requires
exactly one `Dispatch:` trailer per commit and defines exactly two forms:

- `Dispatch: <TASK_ID> (goldfish)` — requires a terminal dispatch record
  whose `report.changedFiles` covers the commit. Direct Elephant work has no
  dispatch record, so this form is unusable.
- `Dispatch: stage-0 (elephant)` — bound to `docs/operating-model.md` §3.3,
  whose five criteria (≤2 files, ≤~25 diff lines, no architecture/schema
  change, trivially revertable, no risk flag) describe a narrow EL-01
  *implementation* exception. A design package of hundreds of lines
  flagrantly fails them; stamping it `stage-0` would be an inaccurate
  attribution.

Design-phase document authoring is ordinary Elephant duty (EL-01 restricts
production code, not design documents), so every such commit is forced into
the "neither form" state that §6 itself declares "unbound to any evidence"
and that `dispatch-authorship-verify` reports `UNVERIFIABLE`, never a pass.
Measured: all recent direct-Elephant commits on this branch carry only
`AI-Assisted: true`.

## Why it matters

The rule's stated purpose — "Declaring costs one line; silence does not buy
one" — is defeated for an entire legitimate work class: honest authorship
declaration is *impossible* in the sanctioned vocabulary, so the verifier
cannot distinguish disclosed Elephant design authoring from genuinely
unattributed work. Current mitigation is a hand-written sidecar
(`specs/sprint-alfred-epic/evidence/design-authoring-record.json`), which
the verifier does not consume.

## Proposal (not designed here)

Extend the generated §6 vocabulary (source:
`harness/scripts/generate-agent-obligations.mjs` and the rules it derives
from) with a third form for dispatch-free Elephant work outside stage-0 —
e.g. `Dispatch: design-phase (elephant)` scoped to `guard-devplan`'s
draft-exempt prefixes — and teach
`plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs` to verify it
(phase check against state, path check against the exempt prefixes).
Alfred context: a natural B3 rules-as-code-sweep addendum; until decided,
the recorded practice stays `AI-Assisted: true` only plus the
authoring-record sidecar.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
