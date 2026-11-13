# Onboarding and recovery (lazy)

## Pre-ready preflight statuses

Status `hook-provisioning-required` or `hook-refresh-required` (Elephant only)
carries a mutating `nextAction`: `clone-hook-readiness.mjs --root <root> --apply`
or `refresh-mandatory-hooks.mjs --root <root>`. Elephant executes that exact
action once, then reruns the identical preflight and continues only on `ready`;
a missing or failed action stops bootstrap. Goldfish and Critic never execute it.

Status `plugin-attestation-required` is a closed hard recovery, never the
soft `plugin-refresh-required` advisory. For Codex, accept it only with
`nextAction.schema: pipeline.installed-plugin-attestation-setup-action.v1`,
`kind: host-postinstall`, `executionBoundary: host`, `mutation: true`,
`requiresPoApproval: false`, executable `node`, and expected result schema
`pipeline.installed-plugin-attestation-host-result.v1` with status `written`.
Elephant executes that exact action once at the declared host boundary without
asking the PO, accepts only its exact expected result, then reruns the identical
`pipeline-start-preflight.mjs` command. Continue only when that fresh readback is
`ready`; a missing, malformed or failed action, another
`plugin-attestation-required`, or any other non-ready status stops bootstrap.
Goldfish and Critic never perform this mutation and remain blocked for Elephant
recovery. Never reconstruct the argv or add a source path from conversation.

## One onboarding consent, not a chain of prompts

Private Critic export requires a separate, project-bound consent decision before
candidate-bearing child creation. Load `references/critic-export.md` when
preparing it; never infer host approval from a saved consent or model label.

When the user has directly agreed to use Agent Pipeline for this repository,
consent authorizes the bounded local onboarding happy path: read-only plans
and readbacks, portable authority seed, any plan-disclosed local Git init,
runtime init, restart-barrier prep, the first kickoff artifacts, and after the
promotion mandatory-hook activation (plus the runner's own refresh step). State
the bounded effects once, then execute each returned digest-bound action and
readback without re-asking per digest. `requiresConfirmation` describes the
action's safety shape, not a second PO chat gate.

A local Git init result carrying a `collect-input` action for the repository's
commit author (`project-onboarding-v3.mjs`'s `applyProjectOnboardingV3`,
neither `user.name` nor `user.email` resolves locally or globally) is a
blocking question, same tier as the kickoff goal/profile/language questions —
never a diagnostic to notice and act on later, never a default or invented
value. Ask the PO once now for both, hold the answered values, and apply them
via `git config user.name "<name>"` / `git config user.email "<email>"` in
THIS repository's local config only, immediately before the first commit,
never sooner — never `--global`, never an untyped value.

**Before this consent exists:** never create a deliverable file — reading,
explaining, answering are fine, artifacts are not, even in the turn you say
you will wait for a yes. Never volunteer whether the Pipeline fits the task;
that call is the human's — if asked, state cost/benefit neutrally, not a
recommendation.

## Required tools: install together, or record a deferral

`docs/toolchain.md` of the plugin (generated from `lib/toolchain-registry.mjs`)
lists every tool the Pipeline needs. After the consent is recorded, and at a
later start while one is still open, read the `scanner-*` findings of
`environmentReadiness` whose `repair.toolClass` is `required` (and
`signing-toolchain` on the machine where the PO signs). For each open one that
is not `repair.deferred`, show the human the tool, its purpose and the route for
their platform from the section `repair.installDoc` names, and ask once: install
now, or later. **Install now:** the human runs the route in their own terminal
(in Claude with the `!` prefix); you never run an installer and never use `sudo`.
Then rerun the readiness report. **Later:** run
`node <plugin-root>/scripts/toolchain-defer.mjs --tool <id> --answer "<their answer, word for word>"`
and tell them what stays blocked: a project calibrated critical refuses the
missing scanner at plan approval and at the close. A deferral is never a pass,
so a deferred finding is not asked about again but stays named. A finding of
status `unknown` (the check could not look, for example from a sandbox) is no
reason to install anything: rerun the report in the human's own terminal.

## Host boundary and copy commands for a human

Treat
`executionBoundary: "host-authorized-wsl"` as mandatory: submit the exact
returned action directly at that boundary, including every Git
observation, keeping that routing authoritative. For Codex, never retry
in the Codex workspace sandbox first, and never probe both sandbox and
host views. Runner-owned structured `executable`/`argv` actions are
primary; a human copy-only rendering must use a tested native Bash/zsh,
PowerShell or cmd.exe renderer with explicit safe continuation, never a
visually wrapped long command. When a tool result already carries such a
pre-rendered field — for example `launch.copyCommand` in
`project-onboarding-v3.mjs`'s `restartCopyCommands`, whose `posix`/
`powershell`/`cmd` arrays are each a line already bounded under
`COPY_COMMAND_MAX_COLUMNS` — relay it VERBATIM, line for line, from that
same tool result. Never hand-reconstruct the command from memory of a
prior turn, even for an identical earlier restart action: re-read it.

## Advisory and restart

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
change. The consent's scope is one list (`lib/onboarding-consent-scope.mjs`),
named in the question the user answered and stored in the consent record
(`scripts/onboarding-consent-mark.mjs`, schema v2: scope and the user's answer
as a bounded quote); the design approval, push, release and any human-guard
override stay outside it.

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
and the sanitisation prohibitions are documented in `references/resume-hint.md`
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

## Windows custody prerequisite

When start preflight reports `windows-authority-unavailable`, present every
`windowsAuthorityReadiness.causes` entry before onboarding or dispatch. Its
`pathClass`, `reason`, and `nextAction` identify the exact directory to review,
including a SID based single directory ACL preview where applicable. The
operator may instead relocate the project into a private user profile path.
No action in this diagnostic writes an ACL. Rerun preflight after a reviewed
repair; a WSL fixture cannot certify native Windows custody.

The onboarding driver narrows the rights of a `project/` folder it has just
created itself. A folder that existed before it stays untouched. The driver
then checks the folder in the first question round. When its rights are still
inherited from above the repository, `pendingAsks` carries a
`windowsPrivateStateRights` step with the commands. Show it with the other
questions. The human runs it, the agent never does.

## Antigravity restart after the repository was created

Driver outcome `runner-restart-required` means this onboarding created the
project's Git repository. Antigravity only recognizes a repository that existed
when the session started, so the first code worker would be refused. Run a held
consent record action, tell the human the restart in `restart.humanAction`, and
stop. The questions come after the restart, and the same driver command continues
from the state on disk.
