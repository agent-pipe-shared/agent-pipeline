docs(adr): record ADR-0102, the main session is reminded to work in parallel

Register entry D254 and the ADR index row for the parallel reminder
built in the previous commit: one short line from setup-check, the
post-compact re-grounding and the budget guard every N calls, context
only, N from session.parallel_reminder_every (0 = off, default 25).
States that it is not runner-neutral and that the guard matcher
undercounts.

AI-Assisted: true
Dispatch: stage-0 (elephant)
