# Onboarding and recovery (lazy)

For inherited handoff run `codex-project-runtime-readback-host.mjs --root
"$PWD"`; accept only `pipeline.codex-project-runtime-readback-status.v1`,
status `produced`, then re-inspect V4 from the beginning. Never print tickets,
tokens, source, private paths or credentials. For `host-repository-init-required`
run only the read-only `codex-host-repository-init.mjs plan --root "$PWD"`,
present its digest-bound mutating applyAction for explicit confirmation, execute
once at host boundary, then restart Step 0. Never auto-execute mutation.

When the PO explicitly supplies an existing remote and `refs/heads/<branch>`
for a new target, this takes precedence over `portable-seed-required`: run only
`project-onboarding-v3.mjs adopt-remote plan --root "$PWD" --remote
"{{REMOTE}}" --ref "{{REF}}"`. Accept only
`pipeline.project-onboarding-remote-adoption-plan.v1` status `ready`, present
its exact digest-bound `adopt-remote apply` action, and wait for confirmation.
The plan is the required read-only remote/ref observation; do not seed, run Git
initialization, initialize runtime, create kickoff/cleanup state, migrate
authority, or infer credentials before it. Execute a confirmed apply through
its declared host boundary, then re-inspect V4 and follow the adopted branch's
own typed authority status. Never substitute a remote URL/ref from conversation
text or use a generic checkout command.

Kickoff uses `project-onboarding-v3.mjs kickoff plan --root "$PWD" --goal
"{{GOAL}}"`; goal is short (3–12 words, <=160 UTF-8 bytes), never the PRD.
Apply requires the exact plan digest and `--activate`; never reconstruct or use
remote syntax. Typed statuses `portable-seed-required`,
`runtime-initialization-required`, `runtime-attestation-required`,
`restart-required`, `kickoff-required` and all malformed/unsafe states stop.
