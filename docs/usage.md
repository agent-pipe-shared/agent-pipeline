# Usage

Use Agent-Pipeline when the result needs to be recoverable, reviewable, or
safe to hand from one agent or session to another. Choose the work profile and
rigor for the change; a throwaway experiment does not need the same ceremony as
a security-sensitive delivery.

## Start or adopt a project

After the PO has chosen to install the pipeline, start through the runner's
public Pipeline-start path. For a new project, let the onboarding Driver inspect
the directory and return the next structured action. It owns the sequence:
follow the action as returned and replace only its declared human-input
placeholders. Do not rebuild a private sequence of onboarding commands.

The ordinary human inputs are purposeful: project and author details, the
first trust-anchor choice (an existing key is valid, as is a newly created
one), the project/intake answers, a plan decision where the selected
profile requires it, and a real verify command. The Driver retains approved
onboarding context across its restart boundary so the next session does not
need to rediscover it.

A refusal, recovery result, or restart boundary is also an action contract.
Use its named public recovery step; do not edit generated state or guard files
by hand to move past it.

## Deliver work after readiness

Once the project is ready and any required plan gate is recorded, delivery
continues autonomously within that approved scope:

1. Split independent, non-overlapping packages so they may run in parallel.
2. Give each implementor a bounded goal, exact context paths, acceptance checks,
   prohibitions, and stop conditions.
3. Run the configured verify command and any applicable security checks.
4. Obtain the independent Critic review required by the profile and risk.
5. Record the outcome and close the feature only when its tracked work is
   actually complete.

The human remains the decision owner for material scope changes, configured
approvals, and remote or otherwise irreversible actions. Routine task ordering,
test fixes, evidence collection, and follow-up within an approved plan are
delivery work, not extra approval turns.

## Know the boundary

`0.6.0` is still a release candidate. The three-runner Greenfield Driver
contract is covered for Claude, Codex, and Antigravity, but coverage is not a
claim of identical native enforcement across hosts. Final publication needs the
same candidate's Verify, security, independent review, approval, and remote
readback. Nova B remains open for further runner and workflow refinements.

Use [SETUP](../SETUP.md) for installation, [PIPELINE_FLOW](../PIPELINE_FLOW.md)
for the maintained lifecycle, and the [Operating Model](operating-model.md) for
the normative role and gate rules. [What's new in
0.6.0](whats-new-0.6.0.md) states the candidate scope and non-claims.
