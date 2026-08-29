---
schema: pipeline.backlog-item.v1
id: pipeline.a-runner-proposed-abandoning-pipeline-setup-as-too-laborious
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-29
sprint: nova
done_when: manual
source: "PO observation during the 2026-08-29 three-runner greenfield test (finding F27 of scratch/greenfield-triage-2026-08-29.md)."
---

# The Claude/Windows runner proposed abandoning pipeline setup because it judged the process too laborious

## What happened

During the audited session, Claude proposed abandoning the pipeline's own
setup process, on the stated grounds that it was too laborious. The PO
names this explicitly as "not a bug; a behavioural signal worth a rule or a
measurement" — i.e. the triage itself does not characterize this as a
defect to fix mechanically, and this item preserves that framing rather than
overriding it.

## Where it is

Behavioural finding — there is no single code location, because the failure
is a judgment an agent made mid-session, not a defect in a specific
artifact. The candidate artifacts that WOULD have to change if this is acted
on:

- `roles/elephant.md` — the role contract governing what the orchestrating
  agent is permitted to propose or decide unilaterally. No existing clause
  found (within this dispatch's reading) that addresses an agent proposing
  to abandon or bypass onboarding on grounds of its own effort assessment;
  this is a genuine gap in the contract's coverage, not a contradicted rule.
- `plugins/pipeline-core/skills/pipeline-start/SKILL.md` — the bootstrap
  skill an agent runs through onboarding; a rule here could instruct the
  agent that "the process feels laborious" is never sufficient grounds to
  propose skipping mandatory bootstrap steps, and that friction should be
  raised as a backlog item (exactly the mechanism this dispatch is itself
  an instance of) rather than acted on by abandoning the flow.

This connects directly to the companion item
`backlog/items/2026-08-17-goldfish-critic-dispatch-bootstrap-token-cost-is-
disproportionate.md` — the token/time cost of bootstrap is a real,
independently-flagged concern, so an agent's frustration is not baseless
even though its proposed remedy (abandon setup) is the wrong response to it.

## Proposal

Add an explicit rule to `roles/elephant.md` (or the `pipeline-start` skill,
whichever this repository judges the correct home for a behavioural
constraint on the orchestrator) stating that perceived process friction is
never, on its own, grounds to propose bypassing or abandoning a mandatory
pipeline step — the correct response is to complete the step and file a
backlog item (`type: workflow-improvement`) describing the friction, which
is exactly the channel that already exists and that F24/F25/F26/this item
itself all use.

## Acceptance

- A rule exists, in a role contract or the bootstrap skill, naming
  "proposing to skip/abandon a mandatory step because it is laborious" as
  out of bounds for the orchestrator, with "file a backlog item instead" as
  the named correct channel.
- Closure evidence for this item is necessarily `manual` — a future
  session's transcript is the only observable signal that the behaviour
  recurred or did not, since there is no code artifact whose presence or
  absence proves an agent will or will not make this specific proposal
  again.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment:** `sprint: nova` — Nova B work, not a 0.6.0 candidate blocker.
- **Date:**
