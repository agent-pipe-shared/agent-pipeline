---
schema: pipeline.backlog-item.v1
id: pipeline.harness-classifier-blocks-authorized-onboarding-action
type: defect
owner: pipeline
status: open
created: 2026-08-08
due: 2026-08-22
source: "Happy-path test of the local 0.5.4 build in a fresh directory, 2026-08-08. Third measured instance of this class; the first two were on the push path."
---

# The harness classifier blocks the one onboarding action the Pipeline just authorized

## What happened

Bootstrap ran to `ready`, inspection was read-only, the plan was produced and the
agent was ready to execute the single mutating step — the exact digest-bound
action the planner had returned, carrying `--plan-sha256` binding it to the plan
just read. The runner's own permission classifier refused it in automatic mode.

The agent could not proceed and offered the PO three routes: run the command
manually with a `!` prefix, change the permission mode, or add a persistent Bash
allowlist entry for the onboarding CLI.

## It is not one step, and it is not consistent

Continued observation of the same run makes the shape clearer, and worse:

- After the seed was executed manually, the **read-only** `plan-runtime` step was
  refused too — while `inspect` and the earlier `plan` had passed moments before.
  So the refusal does not track mutation, and it does not track the command
  family; from the operator's seat it is unpredictable.
- The chain has several more calls. Each one is another prompt, which turns
  onboarding into a click-through.
- After three refusals the runner escalates to *"3 consecutive actions were
  blocked. Please review the transcript before continuing."* A human onboarding a
  project for the first time is thereby told, by the tool, that something is wrong
  with what the agent is doing — while the agent is executing the exact actions
  the Pipeline's own planner returned.

That last point is the real damage. The Pipeline's onboarding path is designed so
that a human can watch a governed sequence unfold and gain confidence in it. The
second gate converts the same sequence into evidence of misbehaviour.

## Why this is the same class as the push-path instances, one layer earlier

The Pipeline had already done the work the second gate exists to do. The action
was planned, digest-bound to a plan the human's agent had just read, additive,
local, and constrained by the guard to an exact argv. The classifier does not know
any of that; it sees `node <path> apply-… --activate` and asks.

The consequence is specific to onboarding and worse than on the push path: this is
the **first** mutating step a new project ever takes. A human evaluating the
Pipeline meets the refusal before they have seen anything work, and the refusal is
not the Pipeline's — which the agent had to explain, correctly but at cost.

## The question the PO raised, recorded rather than answered here

Whether the Pipeline's own CLIs should carry a project-settings allowlist entry so
an agent can execute them without a second prompt.

The argument for is the ADR-0061 argument applied to a machine gate: name the
agent behaviour the second prompt prevents that the guard does not already
prevent. For these commands the guard checks the exact argv positionally against a
closed set, and the action is digest-bound to a plan. It is not obvious there is a
residual behaviour left to prevent.

The argument against is scope: an allowlist entry keyed on the interpreter and a
script path is coarser than the guard's argv check, so it grants more at the
settings layer than the guard grants at the execution layer. That is tolerable
only because the guard runs anyway — which makes the entry a removal of a
redundant prompt rather than a widening, **provided** the guard's check genuinely
covers every argv the allowlist would admit. That provision is the thing to verify
before deciding, not to assume.

## Direction, not a design

1. **Verify the provision.** For each Pipeline CLI proposed for an allowlist,
   establish that the guard admits a closed, positional argv set and refuses
   everything else. Where it does not, that CLI is not a candidate.
2. **Decide the granularity.** The narrowest entry the settings syntax supports,
   not the most convenient one.
3. **Decide who owns the entry.** Shipped with the plugin, written by onboarding,
   or left to the operator — each answers a different question about who is
   trusted to reduce their own prompts.
4. **Count the instances.** This is the third measured case of a
   Pipeline-authorized command refused by the runner's classifier. The first two
   were on the push path and one of them burned a one-time token. A per-command
   fix will keep meeting this; the general shape is worth naming.

## Triggering situation

Fresh directory, local `0.5.4+claude` build, Claude runner, automatic permission
mode, first mutating onboarding step. Not reproducible in this repository, which is
already adopted.

## Related

- `2026-08-07-push-release-flow-unusable-for-third-party-adopters.md` — the same
  class on the push path, with the token-burning ordering fact.
- [ADR-0061](../../docs/adr/0061-uniform-human-approval-ceremony.md) — the test to
  apply: name the agent behaviour the extra step prevents.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
