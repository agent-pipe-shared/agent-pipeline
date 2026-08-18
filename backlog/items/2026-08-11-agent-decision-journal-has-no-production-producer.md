---
schema: pipeline.backlog-item.v1
id: pipeline.agent-decision-journal-no-production-producer
type: requirement
owner: pipeline
status: closed
created: 2026-08-11
source: "Converged on during Sprint Phoenix Class B scoping (docs/state.md, 2026-08-11 checkpoint, 'PO said keep going' and following sections; specs/sprint-phoenix-epic/design/class-b-multi-dispatch-plan.md, 'The unifying finding'). PO decision confirmed 2026-08-11 (direct mobile question, 'Journal-Gap'): plan this as its own initiative."
---

# `agent-decision-journal.mjs` has zero production callers — no Elephant/Goldfish/Critic session ever writes one of its events

## Description

`plugins/pipeline-core/lib/agent-decision-journal.mjs` exports validators for three event shapes (`validateAgentDecisionEvent`, `validateCommandOfferEvent`, `validateLegacyImportObservationEvent`) and one shared constant — no constructor or builder anywhere in the module. Its two production importers (`external-command-offer.mjs`, `governance-event-store.mjs`) both call it only to validate a caller-supplied payload, never to build one. A repo-wide grep for `kind.*command-offer` outside test files returns zero results.

**No code path in this repository, during real operation, ever constructs and appends one of these events.** The schema, validator, and storage layers are built, tested, and green — 40+ tests across the family — but there is no bridge from where the decisions these schemas describe actually happen (an Elephant/Goldfish/Critic session choosing an option, offering a command, importing a legacy record) to this repository's own code. That activity happens at the chat-harness level, outside the repository entirely.

## Triggering situation

Found piecemeal across four Sprint Phoenix acceptance criteria, each independently confirming "no production caller" against real source before this session connected them into one cause:

- **A-AC-05** (`agent-decision-journal-tests`, PHX-WP-AAC05, 2026-08-1x): "CONFIRMED ABSENT (repo-wide search) that any code path emits a selection/escalation/fallback event at all."
- **H-AC-08** (`agent-decision-journal-tests`, PHX-WP-HAC08): "CONFIRMED ABSENT (repo-wide search) that any code path imports/migrates a legacy record at all."
- **A-AC-01** (2026-08-11, this session): same finding, generalized — no constructor exists anywhere in the module, confirmed by reading every exported name.
- **R-AC-08** (2026-08-11, this session): traced `recoverability`/`requiredCleanup` to the correct file (corrected an earlier wrong file pointer), found the vocabulary for "cleanup occurred" already exists (`requiredCleanup.status`: pending/completed/verified) but no production code ever constructs a `command-offer` event to carry it.

Full writeup: `specs/sprint-phoenix-epic/design/class-b-multi-dispatch-plan.md`, section "The unifying finding: one root cause behind at least four criteria."

## Affected artifact

`plugins/pipeline-core/lib/agent-decision-journal.mjs` (the schema/validator layer, unchanged); the acceptance criteria this blocks: Sprint Phoenix `A-AC-01`, `A-AC-05`, `H-AC-08`, `R-AC-08` (`specs/sprint-phoenix-epic/acceptance.md`). Related, same shape: `L-AC-01` (no lifecycle-event producer at all — `plugins/pipeline-core/lib/control-execution-exchange.mjs`'s `createControlExecutionExchange` has zero production callers either, confirmed same session).

## Proposal

Not a code proposal — the real question is architectural and precedes any implementation: **should this repository grow a real integration point between live agent sessions (this conversation, a Goldfish dispatch, a Critic review) and its own governance/journal/lifecycle event stores, and if so, where does that integration point live and who builds it first?**

Candidate starting points named but not scoped to briefing-readiness (`class-b-multi-dispatch-plan.md` has the detail):

- Wire `createControlExecutionExchange`'s (L-AC-01) first production caller — covers 5 of L-AC-01's 9 EARS trigger words at once, but "first caller for a function with zero callers" means deciding whether this repo's dispatch mechanism (today: the chat harness issuing `Agent()`-style calls, not repo-internal code) should grow an in-repo call site at all.
- Pick one narrow, well-chosen decision point (e.g. a single Goldfish-dispatch outcome, or one command-offer path already partially wired) and build its one real producer first, to prove the integration shape before generalizing — likely closes more than one of the four criteria at once since they share the same missing primitive.

Either way this is real, multi-session design-then-build work — not a single dispatch, and not started here.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** PO decision, 2026-08-11 (direct question, "Journal-Gap"): plan as its own initiative. Sizing and sequencing not yet done — that is the next session's Elephant work, starting from the candidate starting points above and `class-b-multi-dispatch-plan.md`'s existing scoping.
- **Assignment (if accepted):** unassigned — needs a scoping/design pass before it can be sequenced into a phase.
- **Date:** 2026-08-11

## Scoping pass done — 2026-08-16

The design pass this Triage asked for is written:
`specs/sprint-phoenix-epic/design/agent-decision-journal-production-producer.md`.
It is a decision document, not a build; no code changed.

Two results change how this item should be sequenced, and both correct
statements made in the Description above rather than merely adding to them:

1. **The architectural question is narrower than it looked.** The premise "that
   activity happens at the chat-harness level, outside the repository entirely"
   holds for *orchestration* — which agent is dispatched, with which briefing —
   and that finding for L-AC-01 stands unchanged. It does **not** hold for the
   journal: guard and gate decisions (refusing a command, handing a human a
   copy-only command, admitting an override, consuming an approval) run inside
   this repository's own code during real agent operation. So the integration
   point does not have to be created, only tapped, and this item does not
   require deciding whether to grow an in-repo orchestration layer.
2. **One producer does not close four criteria.** This item groups A-AC-01,
   A-AC-05, H-AC-08 and R-AC-08 under one root cause, which is right as a
   diagnosis and misleading as a plan: the module validates three *independent*
   event kinds. `command-offer` serves R-AC-08; `agent-decision` serves A-AC-01
   and A-AC-05; `legacy-import-observation` serves H-AC-08. A producer for one
   produces none of the others.

Sequencing that follows, per the design doc: build the `command-offer` producer
at the guard hand-off seam first (best-evidenced, smallest, and the transition
state machine in `external-command-offer.mjs` is already complete and tested);
then run the `agent-decision` scoping step against the continuity
course-decision machinery; and put **H-AC-08 to the PO as a probable acceptance
amendment rather than a build** — the product performs no legacy import at all,
and building a caller to satisfy a criterion is the anti-pattern `cc43a182`
already reverted once in this epic.

This item stays `open`: the first producer is scoped but not built.

## Triage — closed 2026-08-18

- **Decision:** closed — resolved.
- **Rationale:** All three named event-kind producers are resolved: `command-offer` via `plugins/pipeline-core/lib/guard-handoff-offer.mjs`, wired into `plugins/pipeline-core/lib/human-guard-override.mjs:1198-1210` (real production path); `agent-decision` via `plugins/pipeline-core/lib/advisory-decision-event.mjs`, wired into `plugins/pipeline-core/scripts/advisory-host-bridge.mjs:547` (real production path); `legacy-import-observation` deliberately not built per PO Amendment 2026-08-17 recorded in `specs/sprint-phoenix-epic/acceptance.md:256-276` H-AC-08 ('satisfied by construction, not by a live import path').
- **Date:** 2026-08-18
