# Failure cases F1–F6 (lazy)

Typed failures remain fail-closed: unavailable, stale, malformed, drifted,
blocked, decision-pending, host/OS limitation and permission denial each expose
an actionable next route. A project-policy denial uses a narrower recovery
action or one universal PO emergency plan; override admission is never operation
success. Re-run the identical operation and its normal effect/readback contract.

F6 observation governance is mandatory in the Public source checkout:
`node harness/scripts/check-observation-governance.mjs` runs before confirmation.
A failing result permits read-only diagnosis only; repair the governed artifact
through its reviewed recovery path and restart bootstrap. Never treat a skipped
governance check, human override admission, or recovery-plan creation as
operation success.

## F6 — observation/document governance drift

In the Agent-Pipeline Public source checkout, a non-zero
`node harness/scripts/check-observation-governance.mjs` result is case **F6**.
It blocks writing, dispatch, confirmation, automatic observation/backlog
promotion and deletion. Report the exact finding, perform read-only diagnosis,
correct the governed artifact through the reviewed recovery path, rerun the
checker, and restart the bootstrap. Do not weaken the checker, bypass it with a
Human-override capability, or infer that a moved lazy reference preserved a
required core contract without checker coverage.
