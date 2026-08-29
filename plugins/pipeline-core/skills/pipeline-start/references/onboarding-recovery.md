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

Resume-Hint card shape, capture-trigger interpretation, bootstrap passivity
and the sanitisation prohibitions are documented inline in `SKILL.md` §6
(the exact keys, their shapes, and the validator's rejection rules) — not
duplicated here to avoid the two descriptions drifting apart.

Kickoff uses `project-onboarding-v3.mjs kickoff plan --root "$PWD" --goal
"{{GOAL}}" --language <de|en>`; goal is short (3–12 words, <=160 UTF-8 bytes),
never the PRD.
Apply requires the exact plan digest and `--activate`; never reconstruct or use
remote syntax. Typed statuses `portable-seed-required`,
`runtime-initialization-required`, `runtime-attestation-required`,
`restart-required`, `kickoff-required` and all malformed/unsafe states stop.

When `project-onboarding-v3.mjs` itself returns a `legacy_source` diagnostic
(root has a pre-V3 pipeline authority; its own `repair` field literally reads
"use runner-profile-migration-v3 inspect, plan, then apply --activate"), or
when a project's V3 migration state needs direct inspection outside the
ordinary onboarding flow, run the same migration CLI
`project-onboarding-v3.mjs` calls internally
(`inspectRunnerProfileMigrationV3`/`planRunnerProfileMigrationV3`/
`applyRunnerProfileMigrationV3` in `../lib/runner-profile-migration-v3.mjs`)
directly: `runner-profile-migration-v3.mjs inspect --root "$PWD"`, then
`plan --root "$PWD" [--initialize-missing-runtime]` to preview the change set,
then `apply --root "$PWD" --activate` only once the plan is accepted (add
`--initialize-missing-runtime` there too if the plan required it). This is the
documented recovery path for that diagnostic, not a separate mechanism.

For a direct, standalone readiness check of V3 bootstrap authority outside the
ordinary `project-onboarding-v3.mjs` flow — e.g. diagnosing why bootstrap is
not `ready` — run the read-only
`v3-bootstrap-authority.mjs --root "$PWD" [--runner claude|codex]`; it never
mutates, only inspects and reports the same typed JSON (`status`,
`diagnostics[].repair`) that `project-onboarding-v3.mjs` consumes internally
via `validateV3BootstrapAuthority`.
