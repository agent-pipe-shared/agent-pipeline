---
schema: pipeline.backlog-item.v1
id: pipeline.bootstrap-and-kickoff-teach-their-own-constraints-only-by-live-rejection
type: defect
owner: pipeline
status: open
created: 2026-08-09
sprint: nightwing
source: "Turn-efficiency root-cause analysis of the PO's private Claude+Pipeline 0.5.4 happy-path test run, 2026-08-09 (sanitized, no PO-identifying data)."
due: 2026-08-16
done_when: contains harness/session-bootstrap.md closed shell grammar
---

# Several bootstrap/kickoff constraints are learned only by hitting a live guard rejection, not from the loaded skill text

## What happened

The 2026-08-09 Claude test run's bootstrap (P1) and kickoff/PRD (P2) phases
together cost ~17 minutes and 8 guard-level errors before any implementation
started, none of them a real design decision — each is a constraint that
already exists in code or an already-fixed sibling artifact, just not stated
in the skill text the agent loads before acting:

1. **Closed shell grammar learned by three live rejections**
   (`GUARD-PARSE-UNSUPPORTED`/`GUARD-OPERATOR-UNAPPROVED` on ordinary
   idioms like `... | head`, `2>&1 |`) before the agent adapted. The
   constraint is real and correctly enforced; it just isn't stated up front
   in the bootstrap skill text the way `templates/prompts/goldfish-task.md`
   already states it for dispatched agents (`agent-obligations.md`).
2. **`kickoff promote plan|apply --profile <epic|feature>`'s exact syntax**
   exists only as `grep`-able source/test fixtures, not in the loaded skill
   text — cost 5 tool calls to reconstruct.
3. **Two different, undocumented guard-drift repairs in a row** for the same
   PRD-authoring step: `PO-GATE-PRD-LANGUAGE-MISMATCH` (the tooling that
   wrote the PRD didn't reconcile its language with the project's configured
   one), then a second, differently-coded `projection-drift` refusal
   immediately after the first repair. Both needed a plan/apply-repair round
   trip through `po-gate-profile-repair.mjs`, a script the kickoff skill
   text never names.
4. **`AskUserQuestion` schema violation**: the agent authored a single-option
   confirmation question, which the tool's own validator rejects (needs ≥2
   options) — an agent-authoring habit, not a Pipeline defect, but cheap to
   forestall in skill guidance.
5. **The harness auto-mode classifier's refusal surface is broader than
   documented**: `docs/push-release-flow.md` names it as a `git push`/
   `git restore` risk; this run also hit it on a bare `Read` of
   `guard-human-override.mjs`, twice, escalating the agent into a full
   sub-agent dispatch the PO then rejected as overkill.
6. **`push-approval.md`'s own "state, don't ask" rule wasn't applied in
   practice**: two `AskUserQuestion` calls (signature-vs-chat mode; "how
   should the push happen") re-asked something `pipeline.user.yaml` already
   answers, costing ~6 minutes of pure human-response latency for answers
   that changed nothing.

## Direction

Not one fix — a pattern to close across the bootstrap/kickoff skill text:
state each of the above up front (grammar constraint, exact kickoff-promote
syntax, the two known PRD-authoring guard drifts and their repair script,
the classifier's actual refusal surface, the state-vs-ask rule) rather than
letting an agent discover them by being refused or by re-deriving them from
source. None of these need new code — they are documentation-completeness
gaps in already-correct enforcement. Item 4 (the `AskUserQuestion` schema
violation) is the one exception: a lint/guidance note rather than a doc gap.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred — owned by Sprint Nightwing.
- **Rationale:** matches Sprint Nightwing's confirmed scope exactly —
  onboarding/documentation-completeness gaps in the bootstrap and kickoff
  skill text (`docs/adr/0043-post-go-live-sprint-model.md`'s 2026-08-17
  amendment). None of the six causes are code defects; all are
  documentation gaps around already-correct enforcement, matching Nightwing
  issue `#61` closely.
- **Assignment (if accepted):** next available Nightwing slot.
- **Date:** 2026-08-17
