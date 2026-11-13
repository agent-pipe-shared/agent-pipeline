docs(adr): ADR-0097 admits the configured verify as a maintenance check

Glossover's calibration registers no verifyImpact ids; its only check
is the top-level verify command, and a .ts test has no .test check form.
ADR-0097 now names a maintenance-only check form `verify:configured`:
the binding generator runs it once for the red observation (an agent
command, no hook time limit), its receipt suite is `configured-verify`,
and green after the delivery is the feature's own close Verify, since a
full Verify can outlast a hook.

AI-Assisted: true
Dispatch: stage-0 (elephant)
