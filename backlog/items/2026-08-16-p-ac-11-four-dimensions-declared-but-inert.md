---
schema: pipeline.backlog-item.v1
id: pipeline.p-ac-11-four-dimensions-declared-but-inert
type: defect
owner: pipeline
status: open
created: 2026-08-16
source: "Independent Critic review of 0d3d9bcc..8be6c308, finding F3 (blocker), 2026-08-16. Full report: specs/sprint-phoenix-epic/evidence/pac11-critic-review-8be6c308.md."
due: 2026-09-15
---

# Four P-AC-11 policy dimensions are declarable but inert, with no owner and no expiry

## Description

Commit `9352331d` gave a `documentClasses` entry five new P-AC-11 scoping
dimensions, and `8be6c308` wired exactly one of them (`ownedSections`) to a real
permission decision. The other four — `lifecycleEvents`, `previewRequired`,
`retention`, `conflictPolicy` — ship validated, merge-tested and **consumed by
nothing**. A pack declaring them changes no behaviour anywhere.

The Critic rated this a **blocker** under
`governance/examples/policies/checklist.md:37-39` item 8, which requires a named
owner and an expiry for a deliberately deferred gap and makes any NOT MET item
blocking by its own definition, and under `guardrails/quality-gates.md` QG-06
("a known gap with a TODO comment and no due date is a finding, not a
mitigation"). At the time of the finding the deferral was recorded only in a
commit body and a source comment; a repo-wide search for the four names returned
only the two changed modules and their two test files — no backlog item, no docs
entry, no register entry. **This item is that missing record**; filing it is what
gives the deferral an owner and a date.

Honest caveat, recorded rather than argued away: the Critic noted that
`checklist.md` describes itself as generic fixture content, and ticked it as in
force because `.claude/pipeline.yaml:117-119` resolves it as this project's
`policies_path`. Whether that fixture genuinely binds this repository under
self-application (ADR-0015/ADR-0030) is a separate question this item does not
decide — the substance stands either way.

## Triggering situation

`PHX-WP-PAC11-ENFORCE` ran investigation-first and reported, per dimension,
whether a genuine enforcement point exists. Its verdicts, and their status after
independent review:

| dimension | verdict | Critic's independent check |
|---|---|---|
| `ownedSections` | enforceable — implemented | confirmed; separately defective, see the F1 item below |
| `previewRequired` | no enforcement point | **confirmed correct** — `preview()` runs unconditionally on every governed path (`external-reference-adapter.mjs:83`), so there is nothing for the flag to gate |
| `conflictPolicy` | no enforcement point | **confirmed correct** — `:82` returns `status: "conflict"` unconditionally; neither closed value changes admit/deny without a new reconciliation path |
| `retention` | no enforcement point | **confirmed correct** — `identity.retention` ∈ `[active, retain, archive]` (`:29`) has zero overlap with the policy's three categorical commitments |
| `lifecycleEvents` | no enforcement point | **refuted** — four of six values are verbatim identical to `FEATURE_STATES`, and a carrier is available before the first external call; tracked as Critic finding F2, not by this item |

So three of the four are genuinely blocked on something that does not exist yet,
and one was blocked on a mistaken premise.

## Affected artifact

`plugins/pipeline-core/lib/organization-policy.mjs` (declares all five);
`plugins/pipeline-core/lib/external-reference-adapter.mjs` (consumes one);
acceptance criterion `P-AC-11` (`specs/sprint-phoenix-epic/acceptance.md:604-607`),
which stays `partial` for exactly this reason.

## Proposal

Not one fix — the three confirmed-inert dimensions each need a different thing to
exist first, and none of those things is in scope for a policy-model change:

- **`previewRequired`** needs a structurally optional preview path. The adapter is
  a preview-first controller by design (its own header comment), so making preview
  skippable is a change to that design, not a wiring task. Plausibly the honest
  disposition is that this dimension is satisfied *by construction* — preview is
  always required — and the criterion should say so rather than the schema
  pretending it is configurable.
- **`conflictPolicy`** needs a second, softer conflict path that the two closed
  values could genuinely distinguish. Today there is one path and it always blocks.
- **`retention`** is categorical-over-time, not a property of a single write
  decision. Its consumer is more likely a retention/lifecycle sweep than the write
  planner, and no such sweep exists.

Each of the three should be resolved as either "build the thing it needs",
"amend the criterion to state it is satisfied by construction", or "amend the
criterion to drop the dimension" — the same three-way shape already used for
`H-AC-11` and `PX0-AC-13` in this epic. That is a PO/design call per dimension,
not an implementation task.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
