# Set up Agent-Pipeline

Agent-Pipeline gives an AI-assisted project a repeatable way to move from an
idea to a reviewable change: clarify intent, plan, implement in bounded tasks,
run deterministic checks, review independently, and leave durable evidence.
It is a project operating model, not an application framework.

This guide leads with the routine job: activate the pipeline in each repository
that will use it. Maintaining a shared pipeline source is a separate,
occasional job later in this guide.

Start with the top-level [README](README.md) for the value proposition and
terminology. Read [`PIPELINE_FLOW.md`](PIPELINE_FLOW.md) for the maintained
end-to-end flow; this page only explains installation and adoption.

## Before you start

- Node.js 24 or newer and Git are required for the included scripts.
- Three scanners back the security gates: `gitleaks` (secrets), `osv-scanner`
  (dependency vulnerabilities), and `semgrep` (static analysis). Install them
  before running Verify. **A missing scanner makes its gate report `skipped`,
  not `pass`.** `skipped` means the gate checked nothing for that category —
  it is not a substitute for a passing scan, and a green Verify result built
  on a skipped gate does not mean that category was actually scanned. Run
  `node plugins/pipeline-core/scripts/toolchain-preflight.mjs --root "$PWD"`
  to see every configured tool with its observed version, or a copyable
  platform-appropriate install command for whatever is missing.
- Keep the pipeline source and each governed repository under version control.
- Treat credentials, account mappings, local paths, and private marketplace
  details as machine-local configuration. Do not commit them into the pipeline
  source, a generated projection, or a project calibration.

- **Measured cost boundary.** The project publishes bounded historical Verify
  envelopes, not a time or token promise for your project. Consumer overhead
  across runners is still unmeasured; see [cost and
  measurement](docs/cost-and-measurement.md) before estimating adoption work.

## B. Activate the pipeline in one project repository

Repeat this routine path for every application or service repository. It uses
the public onboarding Driver: bind the supported runner integration, start a
new session in the project root, invoke `/pipeline-core:pipeline-start`, and
follow the returned structured action. Supply only its named human inputs; do
not copy this source repository's `setup.mjs`, generated projections, or
machine-local configuration into the consumer project.

The Driver classifies fresh, existing, legacy, partial, and host-managed roots
before it offers a write. An explicit request to initialize is required for a
fresh seed; an existing project receives a reviewed, additive adoption plan;
partial or malformed roots fail closed. After bootstrap readback, record the
project's one Verify command, calibration, handover, and project-owned policy
choices through the normal reviewed workflow.

For Claude Code, bind the project-scoped `pipeline-core` plugin, then fully
restart the host before the first bootstrap. For Codex, use its approved
marketplace/add commands and begin a new thread after binding or refresh. For
another runner, use only its supported integration and the manual controls
stated in [runtime boundary](docs/runtime-boundary.md). Do not copy Claude
commands or claim its hooks are installed elsewhere.

The resulting Verify receipt and delivery records can be inspected with the
candidate's other evidence. They do not certify compliance or replace a human
decision. [Audit and evidence](docs/audit-and-evidence.md) gives the artifact
boundary; [the detailed consumer procedures](#consumer-onboarding-details)
retain exact commands and migration cases for operators who need them.

### Runner support, stated precisely

The methodology (roles, specifications, evidence, review separation, and
handover) is runner-neutral. The current V3 authority contains registered
routes for Claude, Codex, and Antigravity duties, but a requested route is not
proof that a host used that model, and one runner's evidence does not prove
another's behavior.

Claude Code is the supported full-enforcement runtime: its plugin and hooks can
enforce configured guards and lifecycle checks. On Codex, Antigravity, or
another runtime, use the same methodology only where that host exposes the
needed integration; do not assume Claude hooks, plugin installation, or
automatic guard enforcement exists there. See
[`docs/runtime-boundary.md`](docs/runtime-boundary.md) for the exact boundary
and manual responsibilities, and [`docs/runner-support.md`](docs/runner-support.md)
for the per-runner boundary table.

## Consumer onboarding details {#consumer-onboarding-details}

<a id="consumer-onboarding-details"></a>

Repeat this section for every application or service repository you want to
govern. A governed project does not inherit your local account or credentials;
it commits only its portable calibration and its project rules.

For a fresh or adopting project, the normal route is the guided Greenfield
onboarding Driver, exercised across Claude, Codex, and Antigravity: it
inspects the directory and returns the next structured action, and it owns
the sequence. Follow the returned action as given and replace only its named
human-input placeholders instead of reconstructing a private sequence of
onboarding commands. The digest-bound `apply-portable-seed` command in B.0
below is what that returned action resolves to for an operator invoking it
directly; it is the fallback for an attended step, not the primary
instruction for a first read of this section.

### 0. Let `pipeline-start` classify the consumer root first

Do not copy `setup.mjs` into a consumer project or start a blank directory by
manually creating Git/V3 runtime files. Bind the runner first, then **end that
host process and start a new session in the project root**. A Claude
`/reload-plugins` refresh is not equivalent to the mandatory first binding
restart. In the new session invoke `/pipeline-core:pipeline-start` as the first
project action. Its plugin-owned preflight runs before Git or V3 authority
checks and has these outcomes:

- A fresh empty root, including Codex's `fresh-host-managed` root, stops as
  `F0: onboarding-required`, with no bootstrap
  confirmation. The agent runs the plugin-local read-only `inspect` and `plan`
  operations and reports their public targets/digests.
- Only an explicit user request to create or initialize the project authorizes
  the exact digest-bound plugin-local `project-onboarding-v3.mjs
  apply-portable-seed --plan-sha256 … --activate` action returned by the
  reviewed plan. There is no unbound `apply` compatibility alias.
  For a normal root that transaction initializes Git and the complete V3
  source/runtime seed. For `fresh-host-managed`, it creates only the portable
  authority and `.claude/**`, retaining Codex-owned `.git`/`.codex` controls
  (and `.agents` when present) unchanged. Neither form creates a commit or remote, nor installs
  dependencies or application scaffolding. Rerun `pipeline-start` afterwards;
  its normal V3 readback remains required before a confirmation line.
- An existing project with no Pipeline authority stops as `F0A:
  adoption-required`. Its reviewed plan adds only absent Pipeline-owned targets
  and preserves project files plus valid Git metadata; it is neither a legacy
  migration nor permission to overwrite an existing `.claude`, `.codex`, or
  `.agents` path.
- A V0/V1/V2 authority uses the official migration inspect → plan → explicit
  apply workflow, never the fresh initializer. A partial, invalid, unsafe, or
  malformed root fails closed with no overwrite. A root consisting solely of
  host-owned, non-writable `.git`/`.codex` controls (and `.agents` when
  present) is the
  supported `fresh-host-managed` variant; never delete, overwrite, chmod,
  ignore, or silently bypass those paths.

Codex currently has no SessionStart hook in its manifest. The mandatory
`pipeline-start` invocation is proactive for the user's first request; it is
not an automatic hidden initialization.

### 1. Bind the plugin at project scope (Claude Code)

In the project repository, add the marketplace that hosts your pipeline source
and install the plugin at project scope:

```sh
claude plugin marketplace add agent-pipe-shared/agent-pipeline --scope project
claude plugin install pipeline-core@agent-pipeline --scope project
```

`--scope project` keeps the binding with the repository rather than with one
developer's user profile. `claude plugin marketplace add --help` documents
only `--scope` and `--sparse` for this command — there is no flag or URL
syntax verified to pin it to a specific branch, so it tracks the source
repository's default branch. Confirm the installation with `claude plugin list
--json`. To update a Claude Code binding later, update the marketplace, update
the same project-scoped plugin, then reload the running host session:

```sh
claude plugin marketplace update agent-pipeline
claude plugin update pipeline-core@agent-pipeline --scope project
/reload-plugins
```

After the first project-scoped Claude binding, fully close Claude Code and
start a new Claude session in the project root before invoking
`/pipeline-core:pipeline-start`. Do not substitute `/reload-plugins` for this
first-bind restart. For a non-Claude runtime, do not copy these commands or
claim that its hooks are installed. Use that runtime's supported integration,
then follow the methodology and manual controls described in the
runtime-boundary document.

### 1a. Bind or refresh the plugin in Codex

Codex uses its own marketplace and install commands. Add the approved Git
source once, refresh its snapshot when the approved ref advances, and install
the plugin from the marketplace name declared by that source. `main` is the
only published branch — development happens locally and on feature branches,
and `main` carries releases (ADR-0078 D1) — so pin the marketplace snapshot to
`main` (`--ref` is the same flag already verified in
[`docs/codex-local-plugin-development.md`](docs/codex-local-plugin-development.md)):

```sh
codex plugin marketplace add https://github.com/agent-pipe-shared/agent-pipeline.git --ref main
codex plugin marketplace upgrade agent-pipeline
codex plugin add pipeline-core@agent-pipeline
codex plugin list --marketplace agent-pipeline --json
```

The `stable` *update channel* (as reported by the Pipeline's own freshness
check, not by Codex) resolves separately, to the highest final `vX.Y.Z`
release tag on `main` (ADR-0078 D2) — it was never a branch.

The final command must report exactly one installed and enabled
`pipeline-core@agent-pipeline`. A Git marketplace snapshot is not the running
plugin: after the first binding, fully end the Codex host process and start a
new thread in the project root before invoking `/pipeline-core:pipeline-start`.
For a later refresh, start a new Codex thread as well. Do not hand-edit Codex
marketplace or cache files.

### 1b. Activate a slim private overlay

A slim private overlay contains project configuration and allowlisted inputs,
not a copied setup program or verification harness. Its project root must have:

- a valid `pipeline.user.yaml` with `schema: pipeline.user.v3`;
- `.agent-pipeline/core.lock.json` pinned to the approved Public repository,
  branch, commit, tree, plugin version, and manifest digest; and
- only declared Markdown inputs below `.agent-pipeline/policies/`,
  `guidelines/`, `templates/`, and `extensions/`.

In the new Codex thread, open the overlay root and invoke
`pipeline-core:pipeline-start`. The installed skill resolves its own plugin
root, compares the configured marketplace source with the installed cache, and
runs the read-only private-overlay status bridge. It has three relevant
outcomes:

- `rejected`: stop and repair the reported identity or input boundary;
- `activation-required`: review the sanitized plan digest and explicitly
  authorize the activation step; or
- `activated`: the runtime projection, machine-local PO-profile receipt, and
  authenticated private-input consumption all read back against the same
  candidate.

Activation is never implicit during bootstrap. Do not hand-edit generated
runtime projections, copy a receipt, substitute a project-local `setup.mjs`,
or treat an overlay-local harness as Public-plugin identity evidence. After an
explicit activation, rerun `pipeline-core:pipeline-start`; project calibration,
handover, Verify, and feature-state checks remain separate and may still fail
closed even when the overlay bridge is activated.

### 1c. Declare the Git lifecycle before delivery

An ordinary initial seed deliberately sets `repositoryMode: "local-only"` in
the project calibration at its resolved authority tier (`project/pipeline.json`,
else `.claude/pipeline.json`): onboarding creates a repository but no initial commit,
remote, or credential binding. Make the initial commit before normal work.
When the project is intentionally connected to a shared remote, change the
committed calibration to `repositoryMode: "remote-tracked"`; the session
freshness check then requires an upstream and blocks writes when it is stale or
unknown. `local-only` permits local work only; it never authorizes a push,
publication, or release claim.

For the exact Codex `fresh-host-managed` layout, the seed instead records
`repositoryMode: "host-managed"` and deliberately creates neither Git metadata
nor an initial commit. Codex owns `.git` and `.codex`; retain those controls,
configure a project-specific verification command, and do not make a
push/publication/release claim from this mode until the project has its own
delivery-ready repository lifecycle.

### 2. Complete project calibration after onboarding

For a fresh root, the official initializer already creates the minimal
V3-owned bootstrap calibration and runtime projection. Do not pre-create,
copy over, or hand-edit those generated targets. After the initializer and its
readback, propose project-specific calibration choices to the repository owner
and apply them through the normal reviewed workflow.

For an existing project that is being adopted (not a fresh initializer), copy
and adapt these templates in the project repository:

```sh
cp <pipeline-source>/templates/pipeline.json.example project/pipeline.json
cp <pipeline-source>/templates/CLAUDE.project.md CLAUDE.md
```

(A runner-neutral project — one without a `.claude/` directory — targets
`project/pipeline.json` instead; the calibration is read at its resolved
authority tier, `project/pipeline.json` else `.claude/pipeline.json`.)

`pipeline.json` names the project, its **one** `verify` command, worktree and
branch model, autonomy, stakes, constraints, handover, and rollback procedure.
Make `verify` the one deterministic command every actor and CI job means by
“green” (for example, format → lint → typecheck → tests → build). Keep
`CLAUDE.md` short: it is the stable project map, not a session log. The handover
file is the single source for current state.

Put hard project denies and permission boundaries in committed
`.claude/settings.json` and, where used, `.claude/guard-config.json` — not in
`pipeline.json`. Start conservatively: read and plan first, then grant only the
autonomy your team is prepared to supervise.

### 3. Optional manifest, governance, and ritual extensions

Use [`templates/pipeline.yaml.example`](templates/pipeline.yaml.example) only
when your project directly authors the optional declarative manifest. It can
declare gates, profiles, governance paths, and an optional release tail. Do
not maintain a directly authored manifest alongside a compiler-managed V3
projection; choose the ownership model documented in the template.

For team or company rules, copy the generic examples under
[`governance/examples/`](governance/examples/README.md) into project-owned
paths and point the manifest at them:

- **Guidelines** are advisory design and style principles. A deviation may be
  valid, but it must be named and justified.
- **Policies** are binding controls. Machine-checkable policies can fail a
  gate; human-checkable policies become an explicit review obligation.

The calibration template also shows `ritualExtensions`. They add project-owned
steps such as a changelog sync to named lifecycle points without forking the
core plugin. Keep each extension deterministic, versioned, and safe to run in
the stated lifecycle phase; a failed extension stops that ritual and must be
fixed or deliberately removed.

### 4. Bootstrap the first working session

Open the project in Claude Code and run:

```text
/pipeline-core:pipeline-start
```

The bootstrap is the auditable session entry. It checks the installed ruleset,
the project calibration, current handover, and verify availability before work
begins. For a material feature, it also follows the V3 profile and advisory
rules before writable work. A reminder hook is not a substitute for the
bootstrap itself.

### 5. Optional human-approval key (one-time setup)

Routine implementation, tests, and Critic review remain agent work after the
approved plan. When a project configures a real human decision gate, create
the portable external Ed25519 key once:

```sh
node "$REPO/plugins/pipeline-core/scripts/po-human-approval.mjs" setup --repo-root "$REPO" --directory "$HOME/agent-pipeline-po"
```

The directory stays outside the repository. OpenSSL asks for the passphrase
locally; the agent never receives the key or passphrase. The agent prepares
and refreshes public candidate-bound requests. The regular human action is:

```sh
node "$REPO/plugins/pipeline-core/scripts/po-human-approval.mjs" approve-all --repo-root "$REPO" --directory "$HOME/agent-pipeline-po"
```

Passkey/WebAuthn, IAM/hardware-key adapters, and remote provisional codes are
future adapter work, not 0.5.0 CLI features. A code pasted into the same agent
chat is visible to that agent and cannot replace final local proof for an
irreversible action. See [PO approval](docs/po-human-approval.md).

## A. Maintain a shared pipeline source (occasional)

<!-- capability:setup-and-runtime-projection -->
<!-- anchor:capability-setup-and-runtime-projection -->

Clone or fork this repository into the organisation that will maintain the
shared pipeline. Keep that clone as a versioned product; projects should bind
to it rather than copy its rules into every repository.

### Activate or upgrade the V3 authority

Run these commands **only in a pipeline source checkout that contains
`pipeline.user.yaml`**. They are for an existing V0/V1/V2 authority or a V3
projection that needs explicit reconciliation; they are not a setup command for
an arbitrary application repository.

```sh
node plugins/pipeline-core/scripts/runner-profile-migration-v3.mjs inspect --root "$PWD"
node plugins/pipeline-core/scripts/runner-profile-migration-v3.mjs plan --root "$PWD"
node plugins/pipeline-core/scripts/runner-profile-migration-v3.mjs apply --root "$PWD" --activate
```

The sequence is intentional: `inspect` reads present authority and recoverable
transaction state; `plan` shows V3-owned targets and byte changes for review;
and `apply --activate` is the only write step. It authenticates a fresh plan,
refuses source/target drift, writes runtime targets first, and commits
`pipeline.user.yaml` last. Stop unless `inspect` is `ready` and `plan` is
`ready` or `noop`. Do not hand-edit generated targets or use `setup.mjs --force`
to bypass this boundary.

After activation, run the read-only readback:

```sh
node setup.mjs
```

Success means the V3 source and its owned runtime projections agree without a
write.

### Choose advisor export consent explicitly

Advisory is optional and off until a repository owner records consent. A
missing field or `consent: declined` creates no advisor export, child launch,
or receipt. To review that boundary, run:

```sh
node setup.mjs --configure-advisor-export
```

The prompt records `approved` or `declined` in `pipeline.user.yaml`; it does
not authorize secrets, unrelated paths, raw-answer retention, model
substitution, or a runner fallback. Source and runtime readback remain
authoritative for the selected route; see [runtime boundary](docs/runtime-boundary.md).

### Missing prerequisite guidance

`node setup.mjs` runs the read-only toolchain check after V3 validation. It
reports each configured tool, observed version, blocked claim, and a copyable
platform command. The standalone form remains:

```sh
node plugins/pipeline-core/scripts/toolchain-preflight.mjs --root "$PWD"
```

Review an offered installer command under your host/package-management policy,
then repeat setup or the preflight. npm is never substituted for non-npm
scanners; bounded Semgrep settings prevent ordinary home-directory writes from
being reported as a missing installation.

### Transaction and rollback boundary

The migration records preimages before activation. After an interrupted or
failed activation, the next `inspect`, `plan`, or `apply` attempts safe
recovery; do not delete a pending transaction directory or repair its files by
hand. This is not a general revert: change completed authority in a reviewed
working copy, then run a new inspect → plan → explicit activation cycle and
read it back with `node setup.mjs`.

## C. Bring an existing repository under the pipeline

Do this on a normal change branch and adopt one control at a time:

1. Read the project, identify its existing test/build commands, branch policy,
   sensitive paths, and current documentation location.
2. Bind the plugin (where Claude Code is used) and add the calibration plus a
   lean `CLAUDE.md` from the templates.
3. Create or consolidate the one `verify` command. Run it successfully before
   treating it as the delivery gate.
4. Add a handover file and name it in the calibration. Move current state there
   instead of maintaining several status copies.
5. Add project-specific denies, risk zones, and constraints. Enable governance
   policies only after their paths and checks are real.
6. Pilot the workflow read-mostly: bootstrap, write a small spec, run the
   deterministic checks, and request an independent review. Expand autonomy
   only when the evidence and operating cost are understood.

Migration changes your project’s process, so review those changes like any
other architectural change. Do not paste a pipeline source’s
`pipeline.user.yaml` into an application repository, and do not make a legacy
authority look current by copying generated runtime files.

## Troubleshooting: Codex local agent activity

If Codex agent threads no longer appear after adoption, inspect its persistent
local app-server daemon before changing a plan or treating the incident as a
repository failure:

```sh
node plugins/pipeline-core/scripts/codex-app-server-health.mjs
```

`CAS-READY` is a current daemon-version observation. It does not prove a model
child launched or a host background wakeup. For another `CAS-*` result, the
bounded attended recovery is:

```sh
node plugins/pipeline-core/scripts/codex-app-server-health.mjs --recover
```

It never loops or changes repository state. If it fails, run `codex doctor` in
an attended local Codex session and retain the result in the handover.

## Where to go next

- [README](README.md) — why the pipeline exists and its core capabilities.
- [PIPELINE_FLOW.md](PIPELINE_FLOW.md) — the maintained V3 flow and boundaries.
- [Operating Model](docs/operating-model.md) — normative roles, gates, and
  lifecycle rules.
- [Runtime boundary](docs/runtime-boundary.md) — what is enforced on Claude
  Code and what remains manual elsewhere.
- [Documentation map](docs/README.md) — focused reference links.
