---
schema: pipeline.backlog-item.v1
id: pipeline.p-ac-11-lifecycleevents-still-has-no-owner-or-expiry
type: defect
owner: pipeline
status: open
created: 2026-08-17
source: "Delta Critic re-review of the P-AC-11 fix range (289287e7, c7eb2297), finding F-A (blocker), 2026-08-17."
due: 2026-09-15
---

# P-AC-11's `lifecycleEvents` dimension still has no owner or expiry anywhere in the repository

## Description

`backlog/items/2026-08-16-p-ac-11-four-dimensions-declared-but-inert.md` gave
three of the four declared-but-inert P-AC-11 dimensions
(`previewRequired`/`retention`/`conflictPolicy`) an owner and a due date, but
explicitly carved `lifecycleEvents` out of its own scope, twice: the filing
commit's own message ("the `lifecycleEvents` deferral rested on a premise the
Critic falsified, so that one is tracked as F2 rather than here") and the item
body's Triggering-situation table ("tracked as Critic finding F2, not by this
item").

`c7eb2297` then closed F2 — the false "disjoint vocabularies" justification was
replaced with an accurate one — but closing F2 only fixed the *reason given* for
leaving `lifecycleEvents` unenforced. It did not give the *deferral itself* an
owner or an expiry. The replacement source comment
(`organization-policy.mjs`, at the `LIFECYCLE_EVENTS` declaration) says exactly
this: "`lifecycleEvents` therefore stays declared-but-unenforced here... until a
dispatch with that authority defines the mapping (**tracked as a checklist gap,
not resolved by this comment**)" — naming the gap without filing the record that
closes it. A repo-wide search for `lifecycleEvents` under `backlog/` still
returns only the one item that explicitly disclaims covering it.

A delta Critic re-review of the fix range caught this as its own finding
(F-A, rated **blocker**, same citation the original F3 finding used):
`governance/examples/policies/checklist.md` item 8 requires a named owner and
an expiry for any deliberately deferred gap and makes a NOT MET item blocking
by its own definition; `guardrails/quality-gates.md` QG-06 says a known gap
named only in a source comment, with no due date, is a finding, not a
mitigation. **This item is that missing record.**

## Triggering situation

`lifecycleEvents` is validated and merge-tested (`organization-policy.mjs`) but
consumed by nothing: `external-reference-adapter.mjs` has no code path that
reads it to gate or shape a decision. Four of its six closed values
(`completed`, `superseded`, `abandoned`, `retained`) are verbatim identical to
`feature-package-topology.mjs`'s `FEATURE_STATES`, and a carrier
(`binding.identity`) is available before the first external call — so, unlike
`previewRequired`/`retention`/`conflictPolicy`, this dimension is not blocked on
something that does not exist yet. It is blocked on a genuine product-policy
question this repository has not answered: what should a policy naming only
`proposed`/`active` mean for a write observed while the epic itself is in a
non-shared build-phase state such as `draft` or `implementing`? Enforcing the
overlap without answering that risks reproducing F1's exact defect one level up
(an unrepresentable-value trap), which is why `PHX-WP-PAC11-FIX` declined to
invent an answer.

## Affected artifact

`plugins/pipeline-core/lib/organization-policy.mjs` (`LIFECYCLE_EVENTS`
declaration and comment); `plugins/pipeline-core/lib/external-reference-adapter.mjs`
(the intended, currently absent, consumer); acceptance criterion `P-AC-11`
(`specs/sprint-phoenix-epic/acceptance.md:604-607`), which stays `partial` for
this reason among others.

## Proposal

The same three-way shape the sibling item already uses for the other three
dimensions, and that `H-AC-11`/`PX0-AC-13` used elsewhere in this epic — a
PO/design call, not an implementation task:

- **Build it:** decide what a `proposed`/`active`-only policy should mean for a
  write observed in a non-shared build-phase epic state, then wire
  `lifecycleEvents` into the same decision path `ownedSections` uses.
- **Satisfied by construction:** if the four-of-six overlap is judged
  sufficient as-is (e.g. the two epic-only values are simply never reachable in
  a governed external write's lifetime), amend the criterion or its evidence to
  say so explicitly rather than leaving the dimension declared-but-silent.
- **Drop the dimension:** if no version of the mapping is judged worth
  building, remove `lifecycleEvents` from `documentClasses` rather than leaving
  a permanently inert key.

## Triage (filled in by the Elephant of the next Pipeline session)

PO decided via `AskUserQuestion` on 2026-08-17, in response to the standing "everything from
Phoenix must be closed" directive: **build it.** Wire `lifecycleEvents` into the write-decision
path in `external-reference-adapter.mjs`, reusing the four-of-six overlap with
`feature-package-topology.mjs`'s `FEATURE_STATES` this session already confirmed. The one open
implementation-detail question this build still needs an answer to — what a policy naming only
`proposed`/`active` should mean for a write observed while the epic itself is in a non-shared
build-phase state such as `draft`/`implementing` — is delegated to the dispatch as a bounded,
disclosed judgment call (goldfish-deep, design latitude explicitly granted for this one mapping
decision only), not re-escalated to the PO: it is a narrow implementation-detail choice within an
already-approved build, not a fresh architecture question.

- **Decision:** Build it.
- **Rationale:** Genuinely buildable (unlike `retention`/`conflictPolicy`) — carrier
  (`binding.identity`) available before the first external call, four of six values already
  share a vocabulary with an existing enforced dimension (`ownedSections`'s sibling pattern).
- **Assignment (if accepted):** `pipeline`, next Goldfish dispatch cycle (bounded mapping-choice
  latitude granted per above).
- **Date:** 2026-08-17.
