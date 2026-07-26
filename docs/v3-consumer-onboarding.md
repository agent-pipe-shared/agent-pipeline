# V3 consumer onboarding and Codex lifecycle V4

This is the supported, preview-first path for a consumer project that has a
valid legacy (`pipeline.user.v0`/`pipeline.user.v1`/V2) `pipeline.user.yaml`
but intentionally has no generated `.claude/**` or `.codex/**` projections.
It uses the Public Core migration authority; do not hand-author runtime files,
an authority lock, or a projection plan.

## Preconditions

- Run the command from a trusted checkout of the released Public Core.
- Supply one real consumer project root containing `pipeline.user.yaml`.
- Keep the project writable only for the final, explicit activation. `inspect`
  and `plan` are read-only.
- Resolve any separately required route/advisory decision before activation.
  A migration preview is not an approval, push, or release authorization.

## Fresh Codex lifecycle V4

`project-onboarding-v3` is the single public owner for fresh Codex
classification and progression. Read the result as
`pipeline.project-onboarding.v4` and supply the real intent:
`onboarding`, `bootstrap`, `session`, or `dispatch`.

### Session entry, consent, and loaded version

The installed plugin exposes a `SessionStart` hint on both runners. In a folder
without Pipeline governance, the first assistant response must briefly explain
that Agent Pipeline provides a structured, verifiable delivery workflow and ask
whether the user wants to install it. It must then stop. Before an affirmative
answer it does not invoke `pipeline-start`, inspect onboarding, initialize Git,
or write project files. In an already governed project, `pipeline-start`
remains mandatory before project work.

Every `pipeline-start` begins by printing the manifest version and absolute
plugin root that it actually loaded. A missing root, a deleted cache path, or a
version/root mismatch is a reload incident, not permission to locate another
cache version heuristically.

| Runner | Linux and macOS | Windows | Update/readback requirement |
| --- | --- | --- | --- |
| Codex CLI | The plugin hook uses `node` and `${PLUGIN_ROOT}`. | The manifest's `commandWindows` uses the same Node entry point and resolved plugin root; no POSIX-only shell syntax is required. | After installing or updating, start a fresh Codex thread (or use the runner's plugin reload action when available), open `/hooks`, and trust the current plugin hook definitions. Reused/resumed threads may retain their old skill snapshot; accept the update only when the `pipeline-start` identity line names the expected version and an existing root. |
| Claude Code | The plugin hook uses `node` and `${CLAUDE_PLUGIN_ROOT}`. | Claude resolves the quoted plugin-root command on Windows; lifecycle commands remain Node argv rather than shell-specific scripts. | Run the project-scoped marketplace/plugin update, then `/reload-plugins`. Accept the update only after a new `pipeline-start` identity line names the expected version and root. |

The lifecycle planner returns an executable plus an argv array. Agents must
render that exact action for the current shell when an operator has to execute
it outside the runner: POSIX quoting for Bash/Zsh, PowerShell quoting for
Windows. The digest and individual argv elements must not be reconstructed,
split, or translated.

```sh
node plugins/pipeline-core/scripts/project-onboarding-v3.mjs inspect --root /absolute/consumer/root --intent onboarding
```

The normal progress sequence is ordered and fail-closed:

| Status | Reviewed next action | What completion proves |
| --- | --- | --- |
| `portable-seed-required` | Read-only `plan`, then the returned digest-bound `apply-portable-seed --activate` command. | The portable V3 source/calibration seed validates. It does not prove Codex runtime or operational readiness. |
| `runtime-initialization-required` | Read-only `plan-runtime`, then the returned digest-bound `initialize-runtime --activate` command. This applies only when Codex does not provide the reserved project runtime mount. | Required generated Codex runtime targets validate and a restart barrier is durable. |
| `restart-required` | Exit the current process and use the returned one-use restart action. | Only a new process with a fresh native, digest-bound effective-runtime readback can clear the barrier. File presence, mtimes, a user assertion, and App-Server health are not substitutes. |
| `kickoff-required` | Collect and validate the project goal, then produce the read-only sanctioned kickoff plan. | The plan proposes initial machine continuity, separate initial PRD/Spec authority, private history, and a human handover projection. |
| `ready` | No onboarding mutation. Continue through the intent-appropriate bootstrap/session/dispatch gate. | Repository capability, current source/runtime/readback, continuity, and every capability required by that intent passed together. |

For the first two write stages, execute the complete `argv` returned by the
plan rather than reconstructing flags:

```sh
node plugins/pipeline-core/scripts/project-onboarding-v3.mjs plan --root /absolute/consumer/root
node plugins/pipeline-core/scripts/project-onboarding-v3.mjs apply-portable-seed --root /absolute/consumer/root --plan-sha256 <digest-from-plan> --activate

node plugins/pipeline-core/scripts/project-onboarding-v3.mjs plan-runtime --root /absolute/consumer/root
node plugins/pipeline-core/scripts/project-onboarding-v3.mjs initialize-runtime --root /absolute/consumer/root --plan-sha256 <digest-from-plan-runtime> --activate
```

Every plan is read-only. Every apply requires explicit activation, authenticates
the exact plan digest and current preimages, and must pass its immediate
readback. A completed replay makes no unintended write. Terminal states such
as `partial`, `invalid`, `unsafe`, capability unavailable, projection drift,
damaged continuity, or an unavailable required App Server are not permission
to skip ahead or edit generated files manually.

### Kickoff apply contract

Supply the validated goal to `kickoff plan` as one argv element. The command
trims and validates 1–8192 bytes of NUL-free UTF-8 text and remains read-only:

```sh
node plugins/pipeline-core/scripts/project-onboarding-v3.mjs kickoff plan --root /absolute/consumer/root --goal '<project goal>'
```

The returned plan contains the exact digest-bound apply `argv`:

```sh
node plugins/pipeline-core/scripts/project-onboarding-v3.mjs kickoff apply --root /absolute/consumer/root --goal '<same validated project goal>' --plan-sha256 <digest-from-kickoff-plan> --activate
```

Execute the returned argument array without splitting or reinterpreting the
goal. Apply validates the goal again, deterministically reconstructs the same
closed plan, verifies the supplied plan SHA-256, and binds both goal and plan
before writing. It never recovers a goal from a digest and uses no cache,
environment variable, or file payload fallback. A matching completed replay is
byte-null; a changed goal, digest, calibration, preimage, or target fails closed.

### Host-managed Codex handoff

The recognized Codex host-managed layout contains only inert host-owned
`.git`, `.codex`, and optional `.agents` controls. Portable seeding preserves
them and never initializes or mutates Git or `.codex/**` inside the workspace
sandbox. When `.codex` is the exact empty read-only Codex control mount,
successful seed readback advances directly to `kickoff-required`, but the
mount alone is not runtime authority. Until host initialization is durably
bound, V3 reports `runtimeProjection: "plugin-managed-unattested"` with
`runtimeReadback: "absent"` and the V4 lifecycle cannot report `ready`. This
does not claim a project-local Codex runtime projection and needs no
runtime-readback restart.

After kickoff, V4 reports `host-repository-init-required` and `pipeline-start`
plans one separate
`codex-host-repository-init.mjs` action. The plan is read-only, binds the exact
portable preimage, and marks the apply as both confirmation-required and
host-bound. Only that exact apply runs outside the workspace sandbox. It
initializes `main` without a commit and moves the private kickoff continuity
receipt into the new Git control path. It never runs the full onboarding
inspector at the host boundary and never writes `.codex/**`.

The successful host apply requires exactly one ordinary project-session
restart so Codex remounts the new repository. Only the exact durable host-init
admission bound to the current root, authority, kickoff artifacts, and private
history promotes the fresh session to `local-valid-writable` plus
`plugin-managed`; it must not request a runtime initialization, native
readback, or second restart. The initializer persists a separate digest marker
for its receipt. A present invalid/drifted receipt, or either half missing
after initialization, maps to terminal `projection-drift` with no repeat-init
action. A different read-only target or any non-empty/colliding reserved path
still fails closed with the typed target/layout diagnostic.

This argv contract is runner- and platform-neutral. Codex uses the host action
only for its reserved-control-mount case; Claude keeps its normal local Git
path. Bash/Zsh on Linux and macOS and PowerShell on Windows render the returned
argv with platform quoting, but never reconstruct its digest or arguments.
Neither path creates a remote, commit, push, merge, tag, publication, or
release claim. Initial main-session scaffold work is allowed after the restart;
dispatch/worktrees and delivery remain blocked until the repository has its
first commit.

The optional-install wording, localization, and broader first-use interaction
tuning remain owned by Issue #25. This hotfix documents the new lifecycle so
that Issue #25 does not tune against the superseded multi-restart flow.

### Candidate and release boundary

This page describes the 0.4.5 lifecycle candidate; it is not a version,
installation, or release assertion. Onboarding inspect/plan/apply operations
do not change `VERSION` or plugin manifests and do not commit, push, tag,
publish, merge, close an Issue, or create a release. Those actions remain
separate, explicitly accepted gates after same-candidate verification and the
operator's live onboarding acceptance.

## Legacy consumer with no projections

First inspect and preview the exact migration:

```sh
node plugins/pipeline-core/scripts/runner-profile-migration-v3.mjs inspect --root /absolute/consumer/root
node plugins/pipeline-core/scripts/runner-profile-migration-v3.mjs plan --root /absolute/consumer/root
```

For an accepted V0/V1/V2 source, the plan deterministically lists the
generated runtime targets plus `pipeline.user.yaml`. It creates no bytes. The
final source is written last in one recoverable transaction so a stale or
interrupted operation cannot present a converted source with old projections.

Only after reviewing the emitted target list and hashes, activate it:

```sh
node plugins/pipeline-core/scripts/runner-profile-migration-v3.mjs apply --root /absolute/consumer/root --activate
```

Before the first write the command emits a sanitized pre-write preview to
standard error. It contains every target path, data class, owner mode, before
and after digest, but no private bytes or absolute project coordinate. The
write is rejected unless `--activate` is present. On completion, rerunning
`plan` is a no-op; interruption recovery remains preview-first and
transaction-bound.

## Typed failure and the Slim Overlay boundary

`invalid-source`, `invalid-baseline`, and `recovery-required` are non-success
states with actionable diagnostics. Repair the named prerequisite or complete
the recovery preview; do not create a baseline, lock, or generated file by
hand.

The Slim Private Overlay activation path is intentionally stricter. It is for
an already V3-valid overlay and requires an authenticated
`.agent-pipeline/core.lock.json` verified against the selected Public Core.
That sealed lock is not a substitute for legacy onboarding and must never be
hand-authored.

When a previously valid Slim Overlay lock is stale after a Public-Core update,
use the Core-owned authority-update flow. It observes the selected Public Core
and installed plugin, accepts only the existing lock's safe topology and source
channel, and derives the replacement lock itself. The preview is read-only and
returns a digest; only the matching explicit activation may write. Any runtime
projection drift is rejected rather than combined silently with the lock update.

```sh
node plugins/pipeline-core/scripts/private-overlay-activation.mjs authority-plan --project-root /absolute/overlay/root --source-plugin-root /absolute/public/plugins/pipeline-core
node plugins/pipeline-core/scripts/private-overlay-activation.mjs authority-activate --project-root /absolute/overlay/root --source-plugin-root /absolute/public/plugins/pipeline-core --expected-plan-sha256 <digest-from-authority-plan>
```

For Codex, use the host-attested wrapper instead of supplying a source root:

```sh
node plugins/pipeline-core/scripts/codex-private-overlay-activation.mjs authority-plan --project-root /absolute/overlay/root
node plugins/pipeline-core/scripts/codex-private-overlay-activation.mjs authority-activate --project-root /absolute/overlay/root --expected-plan-sha256 <digest-from-authority-plan>
```

After a successful activation, rerun `status`, then the normal private-overlay
`plan`/`activate` lifecycle only when it reports projection work. Commit the
overlay's new binding through the overlay's own reviewed workflow; never copy
or edit the lock bytes manually.

## Ownership

`pipeline.user.yaml` is the portable project source. `.claude/**` and
`.codex/**` are regenerable runner projections: Core-owned keys are refreshed
and unrelated user settings are preserved. The migration does not move local
credentials, host settings, caches, or private coordinates into the consumer
repository.

## Neutral project authority migration

Legacy project gates and lifecycle state may still live in
`.claude/pipeline.yaml` and `.claude/pipeline-state.json`. Move that portable
authority to the runner-neutral `project/` layer only through its separate,
preview-first cutover:

```sh
node plugins/pipeline-core/scripts/project-authority-migration.mjs inspect --root /absolute/consumer/root
node plugins/pipeline-core/scripts/project-authority-migration.mjs plan --root /absolute/consumer/root
node plugins/pipeline-core/scripts/project-authority-migration.mjs apply --root /absolute/consumer/root --activate
```

`plan` writes nothing and reports only path/digest metadata. `apply` writes a
sanitized pre-write preview to standard error before it can activate. The
legacy files are retained for the compatibility reader; the neutral files are
the only migration writes. A changed legacy source, changed neutral
destination, mixed authority layer, or pending journal rejects activation.

If an interrupted cutover leaves a journal, do not delete it or hand-copy its
files. First inspect the recorded recovery, then explicitly activate it:

```sh
node plugins/pipeline-core/scripts/project-authority-migration.mjs recover --root /absolute/consumer/root
node plugins/pipeline-core/scripts/project-authority-migration.mjs recover --root /absolute/consumer/root --activate
```

Recovery restores recorded preimages only after its own digest-bound preview;
it never resumes an unreviewed write.
