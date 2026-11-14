feat(hooks): remind the main session to work in parallel

C29e T10 (PO tile 2026-11-14, "idea one": extend existing hooks). A new
lib/parallel-reminder.mjs holds one short parallel-by-default line with
its limits. Three existing hooks carry it:

- setup-check (SessionStart startup|resume|clear) emits it as context
  when it has no setup message to give;
- post-compact-reground appends it as the last re-grounding line;
- guard-dispatch-budget adds it on every N-th main-session tool call,
  as additionalContext only, never a permissionDecision (an allow would
  skip the user's permission prompt).

session.parallel_reminder_every in pipeline.user.yaml sets N (integer
0..1000, 0 = off, default 25); the V3 validator and schema accept it,
keep_awake stays required. The counter appends one byte per call next
to the orchestrator marker and is fail-open. The lib joins the
never-liftable kernel paths and the threat model's list, and its suite
is registered in Verify and the inventory. Tests cover the guard every
N calls and with N 0, the compact line, setup-check and the validator.

Not runner-neutral: Codex gets the compact line only, Antigravity none.

AI-Assisted: true
Dispatch: stage-0 (elephant)
