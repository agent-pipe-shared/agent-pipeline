# Onboarding and recovery (lazy)

Preflight status `plugin-refresh-required` is advisory-only: no recovery
action is required. `nextAction` is `{kind: "advisory", ...}` (nothing to
execute); bootstrap continues normally through Step 0-4, and the advisory
(a pending plugin refresh) is noted in the printed confirmation line rather
than withholding it. This covers both the pre-existing loaded/installed
version-mismatch case and the origin/content self-application attestation
(design: bootstrap-origin-allowlist-and-codex-wsl-freshness.md §A.5).

After a required restart, an already seeded repository is evidence that the
onboarding consent has been exercised; resume its ordinary local bootstrap
without re-asking. Stop for a new human input only when no usable project goal
or material design input exists, a configured plan/acceptance gate is reached,
an action is external or irreversible, or a typed hard block has no supplied
safe recovery. Never treat this consent as approval for unrelated adoption,
remote operations, deployment, publication, destructive work, or a scope
change.

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

Resume-Hint card detail (restart, session cut or kickoff): its exact keys are
`intent`, `scope`, `constraints`, and `questions`; each value is a short
distilled statement, never a transcript. Interpret user intent rather than
keywords: an intended restart/session cut captures it; changed scope or
constraints refresh it; canonised or revoked information is discarded. At
bootstrap, `resume-hint.mjs inspect` is passive context only: `absent`,
`challenged-stale`, or `ignored-invalid` never changes readiness, actions,
authority, approval, close state, or exit status. Do not capture raw
transcripts, commands, approvals, lifecycle instructions, host paths, URLs,
credentials, secrets, or private identifiers. The validator rejects those forms
rather than persisting them.

Kickoff uses `project-onboarding-v3.mjs kickoff plan --root "$PWD" --goal
"{{GOAL}}" --language <de|en>`; goal is short (3–12 words, <=160 UTF-8 bytes),
never the PRD.
Apply requires the exact plan digest and `--activate`; never reconstruct or use
remote syntax. Typed statuses `portable-seed-required`,
`runtime-initialization-required`, `runtime-attestation-required`,
`restart-required`, `kickoff-required` and all malformed/unsafe states stop.
