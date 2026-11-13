fix(guard): admit resume-hint consume/query in draft and name inspect for pipeline-state status

Antigravity greenfield run 3 (R7) was refused GUARD-DEVPLAN-SHELL in a
draft project for `resume-hint.mjs consume` and `pipeline-state.mjs
status`. `consume` and `query` only record or read whether this session
received the resume card (observation, no readiness, authority or
approval effect), and the bootstrap tells the agent to run `consume` when
delivery begins, so exactly `<verb> --root <this root> --session-id <id>`
is now admitted in every lifecycle state; `discard` stays outside.
`pipeline-state.mjs` has no `status` verb: the refusal now says so and
names the read-only `inspect`, and like a help-flag refusal it offers no
signature.

Checkpoint-Intent: candidate 29, AGY run 3 R7
AI-Assisted: true
Dispatch: stage-0 (elephant)
