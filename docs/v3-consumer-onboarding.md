# V3 consumer onboarding and Codex lifecycle V4

This guide covers fresh Codex lifecycle V4 onboarding and preview-first
migration of a consumer project with a valid legacy
(`pipeline.user.v0`/`pipeline.user.v1`/V2) `pipeline.user.yaml` and no generated
`.claude/**` or `.codex/**` projections. Migration uses the Public Core
authority; do not hand-author runtime files, an authority lock, or a
projection plan.

## Preconditions

- Resolve `<plugin-root>` to the installed directory of the approved
  GitHub-distributed Public Core; do not use a maintainer checkout.
- Supply one real consumer project root, written `<project-root>` below.
  Legacy migration additionally requires its existing `pipeline.user.yaml`.
- For legacy migration, keep the project writable only for the final, explicit
  activation. `inspect` and `plan` are read-only.

## After installation consent, bind the runner integration

In an ungoverned folder, ask for and receive explicit installation consent
before installing, invoking `pipeline-start`, or writing project files. The
install, update, and restart commands for Claude Code, Codex, and Antigravity
(Agy) are maintained in one place,
[SETUP step 0](../SETUP.md#0-bind-the-supported-runner-integration-and-fully-restart-its-host);
this guide does not repeat them. After binding and the restart, invoke
`/pipeline-core:pipeline-start` as the first Pipeline action: its preflight
supplies the exact onboarding action for the observed project state. Do not
repeat the Codex lifecycle V4 steps below for Antigravity; follow the installed
Agy [Driver](README.md#terms-used-across-these-documents)'s returned
classification action.

For Claude Code the plugin hook uses `node` and `${CLAUDE_PLUGIN_ROOT}`; Claude
resolves the quoted plugin-root command on Windows, and lifecycle commands
remain Node argv rather than shell-specific scripts. Update as in SETUP step 0.
Accept the update only after a new `pipeline-start` identity line names
the expected version and root.

## Fresh Codex lifecycle V4

`project-onboarding-v3` is the single public owner for fresh Codex
classification and progression. Read the result as
`pipeline.project-onboarding.v4` and supply the real intent:
`onboarding`, `bootstrap`, `session`, or `dispatch`.

### Session entry, consent, and loaded version

The installed integration exposes a session-entry hint where the runner host
supports it; the three runner integrations do not have identical host hooks.
The next two paragraphs describe the agent's behavior; the human only answers
the consent question. In a folder without Pipeline governance, the first assistant
response must briefly explain
that Agent-Pipeline provides a structured, verifiable delivery workflow and ask
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
| Codex CLI | The plugin hook uses `node` and `${PLUGIN_ROOT}`. | The manifest's `commandWindows` uses the same Node entry point and resolved plugin root; no POSIX-only shell syntax is required. | Install, update, and restart as in [SETUP step 0](../SETUP.md#0-bind-the-supported-runner-integration-and-fully-restart-its-host). Accept the update only when the `pipeline-start` identity line names the expected version and an existing root. |

The lifecycle planner returns an executable plus an argv array. Agents must
render that exact action for the current shell when an operator has to execute
it outside the runner: POSIX quoting for Bash/Zsh, PowerShell quoting for
Windows. The digest and individual argv elements must not be reconstructed,
split, or translated.

```sh
node <plugin-root>/scripts/project-onboarding-v3.mjs inspect --root <project-root> --intent onboarding
```

The normal progress sequence is ordered and fail-closed:

`F0: onboarding-required` and `F0A: adoption-required` in [SETUP](../SETUP.md)
classify the **repository root** before this progress sequence starts; they
are not statuses in the table. An F0 fresh root begins with
`portable-seed-required`. After the approved seed, run `pipeline-start` again
and follow the next returned runtime/restart/intake status. An F0A existing
root follows its additive adoption plan first and enters this sequence only
at the status its new authority actually returns; do not apply a fresh seed
over existing project files.

| Status | Reviewed next action | What completion proves |
| --- | --- | --- |
| `portable-seed-required` | Read-only `plan`, then the returned digest-bound `apply-portable-seed --activate` command. | The portable V3 source/calibration seed validates. It does not prove Codex runtime or operational readiness. |
| `runtime-initialization-required` | Read-only `plan-runtime`, then the returned digest-bound `initialize-runtime --activate` command. This applies only when Codex does not provide the reserved project runtime mount. | Required generated Codex runtime targets validate and a restart barrier is durable. |
| `restart-required` | Exit the current process and use the returned one-use restart action. | Only a new process with a fresh native, digest-bound effective-runtime readback can clear the barrier. File presence, mtimes, a user assertion, and App-Server health are not substitutes. |
| `intake-required` | Follow the returned consent/capture action to record the project brief and required local identity fields. | The private intake checkpoint contains consent and the captured material input; it is not yet a generated specification. |
| `intake-design-questions-required` | Answer the one bundled question round, correct wrong answers before generation when needed, then run the returned read-only generation plan and its digest-bound apply. | The complete input is durable and staging generation is bound to its digest. |
| `bootstrap-binding-required` | Review the generated PRD/Spec, add the requested acknowledgement, then run the returned bind plan/apply. | The generated package becomes the initial project authority only after its own validation and binding readback. |
| `kickoff-required` | Continue a repository already recognized as using the earlier kickoff sequence; collect and validate the project goal, then produce the read-only sanctioned kickoff plan (see the [kickoff apply contract](#kickoff-apply-contract) under *Recovery and exceptional migrations*). | The compatibility plan proposes initial machine continuity, separate initial PRD/Spec authority, private history, and a human handover projection. |
| `host-repository-init-required` | For a Codex host-managed root with valid continuity, follow the exact host-repository-init plan and confirmed action described below. It can follow either the fresh binding path or the earlier kickoff route; it is not a second kickoff. | The host initializes local Git without a commit. A fresh readback is still required, and dispatch remains blocked until the first commit. |
| `continuity-damaged` | Run the exact read-only `plan-repair`. A supported bounded repair requires a separate digest-bound confirmation; an unsupported result stops with no next action. | Only the recognized active-turn resume mismatch or an established PO-bound pre-continuity state is repairable. Kickoff history is never rewritten. |
| `ready` | No onboarding mutation. Continue through the intent-appropriate bootstrap/session/dispatch gate. | Repository capability, current source/runtime/readback, continuity, and every capability required by that intent passed together. |

For the first two write stages, execute the complete `argv` returned by the
plan rather than reconstructing flags:

```sh
node <plugin-root>/scripts/project-onboarding-v3.mjs plan --root <project-root>
node <plugin-root>/scripts/project-onboarding-v3.mjs apply-portable-seed --root <project-root> --plan-sha256 <digest-from-plan> --activate

node <plugin-root>/scripts/project-onboarding-v3.mjs plan-runtime --root <project-root>
node <plugin-root>/scripts/project-onboarding-v3.mjs initialize-runtime --root <project-root> --plan-sha256 <digest-from-plan-runtime> --activate
```

Every plan is read-only. Every apply requires explicit activation, authenticates
the exact plan digest and current preimages, and must pass its immediate
readback. A completed replay makes no unintended write. Terminal states such
as `partial`, `invalid`, `unsafe`, capability unavailable, projection drift,
damaged continuity, or an unavailable required App Server are not permission
to skip ahead or edit generated files manually.

Before intake staging is generated, a mistaken design answer can be replaced
without deleting or hand-editing the checkpoint. Re-submit the complete answer
array through the separately named command:

```sh
node <plugin-root>/scripts/project-onboarding-v3.mjs intake-design-questions-replace --root <project-root> --answers-json '<complete JSON array>' --activate
```

The ordinary `intake-design-questions-apply` remains idempotent and refuses
changed content. Replacement increments the checkpoint revision and is refused
after staging has been generated or bound; later corrections use the normal
specification-amendment path.

### Host-managed Codex handoff

Codex may present host-owned `.git` and `.codex` controls that the project
workspace cannot write. The portable seed preserves those controls. Once
continuity is valid, whether via fresh binding or the earlier kickoff route,
`pipeline-start` may report `host-repository-init-required` and return
one reviewed, confirmation-required `codex-host-repository-init.mjs` action.
Run only the exact returned argument array at the host boundary; do not create
or repair `.git` or `.codex` by hand. The action initializes local `main`
without a commit and preserves the host controls. A partial or changed target
stops with a diagnostic rather than becoming a fresh onboarding request.

After a successful host apply, fully restart the ordinary project session
**once** so Codex remounts the new repository, then run `pipeline-start`
again. A successful fresh readback advances the project without asking for a
second runtime-readback restart. A `projection-drift` or target/layout
diagnostic is a stop, not permission to rerun initialization with new
arguments. Initial main-session scaffold work can begin after the restart;
dispatch, worktrees and delivery remain blocked until the repository has its
first commit. This path creates no remote, push, merge, tag or release claim.

The exact private transaction, crash-recovery and host-control checks are
documented in the [Codex onboarding threat model](codex-onboarding-threat-model.md).

### Candidate and release boundary

The lifecycle procedures here do not assert a particular installed version or
release status. Onboarding inspect/plan/apply operations
do not change `VERSION` or plugin manifests and do not commit, push, tag,
publish, merge, close an Issue, or create a release. Those actions remain
separate, explicitly accepted gates after same-candidate verification and the
operator's live onboarding acceptance.

### Advisor export consent

Advisor and Critic export consent is not an onboarding precondition; see
[private review export](usage.md#private-review-export). Whether the Advisor may
receive repository data depends on the recorded `advisor_export.consent`
(`approved` or `declined`), which the onboarding Driver asks for explicitly;
this guide does not state a default for a missing field. Do not run a
consultation merely to activate or bootstrap.

## Legacy consumer with no projections

This is the consumer procedure for a legacy root, run from the installed
plugin. The same CLI run inside a pipeline source checkout is the maintainer
form described in
[SETUP section B](../SETUP.md#activate-or-upgrade-the-v3-authority).

First inspect and preview the exact migration:

```sh
node <plugin-root>/scripts/runner-profile-migration-v3.mjs inspect --root <project-root>
node <plugin-root>/scripts/runner-profile-migration-v3.mjs plan --root <project-root>
```

For an accepted V0/V1/V2 source, the plan deterministically lists the
generated runtime targets plus `pipeline.user.yaml`. It creates no bytes. The
final source is written last in one recoverable transaction so a stale or
interrupted operation cannot present a converted source with old projections.

Only after reviewing the emitted target list and hashes, activate it:

```sh
node <plugin-root>/scripts/runner-profile-migration-v3.mjs apply --root <project-root> --activate
```

Before the first write the command emits a sanitized pre-write preview to
standard error. It contains every target path, data class, owner mode, before
and after digest, but no private bytes or absolute project coordinate. The
write is rejected unless `--activate` is present. On completion, rerunning
`plan` is a no-op; interruption recovery remains preview-first and
transaction-bound.

## Recovery and exceptional migrations

If inspection returns a typed failure, stop the normal onboarding sequence.
Use only the named, preview-first recovery action. The separate
[onboarding recovery reference](onboarding-recovery.md) covers Slim Overlay
authority updates, neutral authority migration, and externally archived
worktree recovery; these are not routine steps after `ready`.

### Kickoff apply contract

This belongs to the earlier compatibility route (the `kickoff-required` row
above), not to the V4 path. Supply the validated goal to `kickoff plan` as one
argv element. The command trims and validates 1–8192 bytes of NUL-free UTF-8
text and remains read-only:

```sh
node <plugin-root>/scripts/project-onboarding-v3.mjs kickoff plan --root <project-root> --goal '<project goal>'
```

The returned plan contains the exact digest-bound apply `argv`:

```sh
node <plugin-root>/scripts/project-onboarding-v3.mjs kickoff apply --root <project-root> --goal '<same validated project goal>' --plan-sha256 <digest-from-kickoff-plan> --activate
```

Execute the returned argument array without splitting or reinterpreting the
goal. Apply validates the goal again, deterministically reconstructs the same
closed plan, verifies the supplied plan SHA-256, and binds both goal and plan
before writing. It never recovers a goal from a digest and uses no cache,
environment variable, or file payload fallback. A matching completed replay is
byte-null; a changed goal, digest, calibration, preimage, or target fails closed.

## Claude Code permission readback reference

Claude Code's own command permission layer is separate from Pipeline guards.
Fresh runtime initialization writes `.claude/settings.json` with the exact
`Bash(node "<plugin-scripts>/*")` and
`PowerShell(node "<plugin-scripts>/*")` entries needed for Pipeline commands.
For a path whose forward-slash and backslash forms differ, both spellings are
included. This runner setting allows the command to reach the Pipeline; it does
not weaken or bypass any lifecycle, Git, push, plan, or path guard.

Every V4 lifecycle result exposes the readback as `runnerPermissions`:

- `target` names `.claude/settings.json`.
- `status` is `pending-runtime-initialization`, `current`, `drifted`,
  `unavailable`, `not-observed`, or `not-applicable`.
- `lanes` lists the covered command lanes (`Bash` and `PowerShell`).
- `exactEntries` lists the entries onboarding requires and has verified when
  the status is `current`.

A fresh Claude project needs no separate manual permission edit: continue the
returned runtime-initialization action and require the later readback to report
`current`. If an otherwise-ready existing consumer has only part of the exact
set, inspection reports `projection-drift` and returns a digest-bound merge
action. That action preserves unrelated settings and existing allow entries;
run the returned command unchanged and require the next inspection to read back
`current`. A host-managed Codex project does not use this project-owned Claude
permission layer, so its result explicitly reports `not-applicable` with empty
lanes and entries.
