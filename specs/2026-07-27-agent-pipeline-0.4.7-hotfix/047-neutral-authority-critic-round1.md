# Independent Critic round 1 — neutral authority correction

Candidate: `f7fedd6164b03c03d220f8d0adbad4ea502ba1ee`

Tree: `09ba1820c91d0af31d62c7ac6959b8de96775db7`

Assurance: `functional-equivalent-read-only; OS isolation not asserted`
Verdict: `FAIL`

The Critic reported four correction requirements:

1. Blocker: candidate State existed in both legacy and neutral locations with
   a non-null machine-local `runtime.sessionCleanup`.
2. Blocker: workflow-writer preflight and Security still trusted direct legacy
   State/manifest paths after neutral authority became selectable.
3. Blocker: the authority/trust-boundary change lacked an updated threat model.
4. Major: the new project-authority subsystem was outside Spec section 2.1
   without a named, justified plan deviation.

The correction delta must remove the operational legacy State change from the
candidate, publish neutral State only with a null cleanup binding, harden both
direct safety consumers with focused regressions, update the threat model, and
record the scope deviation in the plan. A fresh exact-candidate Verify,
Security run, and delta Critic are required.
