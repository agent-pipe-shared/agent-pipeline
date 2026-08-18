---
schema: pipeline.backlog-item.v1
id: pipeline.triage-verdict-text-can-contaminate-a-backlog-item-as-a-later-spec-reference
type: defect
owner: pipeline
status: open
created: 2026-08-18
source: "Incremental handover-rotation extraction pass (ADR-0066 Decision 6/7), 2026-08-18, second rotation batch (2026-08-08 Nova GF-054 block). Finding surfaced by a read-only research fork."
---

# A prior Critic verdict written into a backlog item's own Triage section can contaminate that item when it is later handed to a Critic as a spec/reference

## Description

`docs/state.md`'s 2026-08-08 Nova GF-054 entry records a concrete incident:
a backlog item's Triage section had an earlier Critic verdict written into
it, and that item was later used as a reference/spec input to a subsequent
Critic dispatch — meaning the later Critic could read a prior verdict about
the very thing it was independently supposed to judge. In the observed
incident the Critic itself caught this ("circular measuring stick"),
stopped, and re-derived its finding independently from a pre-triage
revision of the item instead — but the text explicitly frames the failure
as the dispatcher's, not something to rely on the Critic catching every
time.

This is adjacent to, but distinct from, the already-codified hunt-list/
expectation-framing contamination rule
(`templates/prompts/critic-review.md` §2, and this session's own
`feedback-critic-dispatch-hunt-list-contamination` memory) — that rule
covers the DISPATCH BRIEFING text; this finding is about a REFERENCED
ARTIFACT (a backlog item) carrying prior-verdict content that biases a
later, unrelated review reading it as background.

## Triggering situation

Incremental extraction pass over `docs/state.md`'s second rotation batch
before that content is archived (ADR-0066 Decision 6/7). Checked
`templates/prompts/critic-review.md`, `guardrails/`, `CLAUDE.md`, and
`roles/critic.md` for this specific risk — found no match beyond the
adjacent hunt-list rule.

## Affected artifact

`templates/prompts/critic-review.md` (candidate location for a rule about
what a Critic should do if a referenced artifact contains a prior verdict),
possibly `backlog/README.md` (guidance on keeping a Triage section free of
review-verdict language that could later read as a spec claim).

## Proposal

Not yet designed in detail. Likely direction: either (a) a dispatch-side
rule — never hand a Critic a backlog item whose Triage contains a prior
Critic verdict without first stripping/summarizing it, or (b) a
Critic-side rule — explicitly instructed to disregard any verdict-shaped
language in a referenced artifact and derive findings independently
(closer to what already happened in the observed incident, just made
explicit rather than relying on the Critic to notice on its own).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** not yet decided — filed to preserve the finding.
- **Rationale:** real but narrow risk (only matters when a backlog item
  with embedded verdict text is later used as Critic-dispatch background);
  the one observed incident was caught, not landed as a bad outcome — worth
  a considered fix, not an inline patch.
- **Date:** 2026-08-18

### PO-decision implementation, 2026-08-18 (wave 3, dispatch NVA-W3-13)

PO decision (2026-08-18, decision #19): **A** — a dispatch-side stripping
rule (option (a) from the Proposal above), not a Critic-side disregard
instruction (option (b)).

Implemented:

- `plugins/pipeline-core/lib/backlog-dispatch-reference.mjs` — pure-function
  helper `stripBacklogVerdictProse(body)` / `stripBacklogItemForDispatch(rawText)`
  that removes everything from the earliest verdict-shaped heading onward
  (`## Triage`, `## Closure`, `## PO-decision implementation`, matched
  case-insensitively at any heading level) and replaces it with a fixed,
  self-explaining fence comment (`BACKLOG_STRIP_FENCE`), pointing back at
  this item. Frontmatter and all spec-shaped sections (Description,
  Triggering situation, Affected artifact, Proposal) are preserved verbatim.
  An item with no verdict-shaped heading yet (not triaged) is returned
  unchanged.
- `plugins/pipeline-core/scripts/backlog-item-strip-for-dispatch.mjs` — CLI
  wrapper: `node ... --item <path> --out <path>` (or stdout), for the
  Elephant to run before naming a backlog item's path in a dispatch.
- Unit tests: `plugins/pipeline-core/lib/backlog-dispatch-reference.test.mjs`
  (9 cases — untriaged passthrough, Triage stripped, an appended
  Closure/PO-decision-implementation section after Triage also stripped
  because the earliest match wins, heading-level/case matching, non-string
  input rejected, frontmatter preserved, purity/non-mutation, malformed
  frontmatter rejected) and
  `plugins/pipeline-core/scripts/backlog-item-strip-for-dispatch.test.mjs`
  (3 cases — CLI strips and writes `--out`, missing `--item` rejected,
  unknown flag rejected). All 12 tests pass:
  `node --test plugins/pipeline-core/lib/backlog-dispatch-reference.test.mjs
  plugins/pipeline-core/scripts/backlog-item-strip-for-dispatch.test.mjs`
  (exit 0). `harness/scripts/check-consumer-safe-paths.test.mjs` also passes
  (9/9) since these new files touch `plugins/pipeline-core/`.
- Dispatch-construction rule wired into both templates that build a
  dispatch citing a backlog item as a spec/context reference:
  `templates/prompts/critic-review.md` (§ usage item 2, the admissible-
  reference rules) and `templates/prompts/goldfish-task.md` (field 2,
  Context files) — both now require the stripped copy's path, never the
  raw item path, when the cited artifact is `backlog/items/*.md`.
  `backlog/README.md`'s Triage rules section gained a matching pointer
  (new rule 6).

Deviation (smallest reasonable judgment call, per this dispatch's field 5):
the item's own Affected-artifact list named `templates/prompts/critic-
review.md` as the primary candidate location and `backlog/README.md` as a
possible secondary one; this implementation also wires the identical rule
into `templates/prompts/goldfish-task.md`, because the Description
explicitly frames the risk as contaminating "a downstream Critic **or
Goldfish**" — a Goldfish reading a backlog item's Triage as spec content is
the same failure shape, and the two templates are the only two places a
dispatch is constructed from (`CLAUDE.md`: "Dispatch from the template,
never freehand").

Status: **left as `status: open`**, not moved to `closed`. This dispatch's
own DoD explicitly permits deferring the status flip when unsure; closing a
backlog item through this repository's sanctioned path additionally updates
`backlog/STATUS.md`, `backlog/index.json`, and appends a hash-chained event
to `backlog/transitions.ndjson` (observed on a recent closed item, commit
`f8e8ff14`) — a distinct, higher-risk ledger operation this dispatch's scope
(implement the PO-decided direction) does not cover, and getting the
hash-chain/index update wrong is not something to risk inside an
already-green, narrowly-scoped implementation dispatch. The Elephant of the
next Pipeline session can run the sanctioned ledger writer
(`plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs` or the
matching skill) to formally close this item, citing this section and commit
as closure evidence.
