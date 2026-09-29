# Set up Agent-Pipeline

Agent-Pipeline gives an AI-assisted project a repeatable way to move from an
idea to a reviewable change: clarify intent, plan, implement in bounded tasks,
run deterministic checks, review independently, and leave durable evidence.
It is a project operating model, not an application framework.

This guide leads with the routine job: activate the pipeline in each repository
that will use it. Maintaining a shared pipeline source is a separate,
occasional job later in this guide.

Start with the top-level [README](README.md) for the value proposition and
terminology, continue with this setup guide, then read the operator-facing
[`PIPELINE_FLOW.md`](PIPELINE_FLOW.md) before the operator-facing
[`docs/usage.md`](docs/usage.md).

## Before you start

<!-- capability:plugin-distribution-and-publication -->
<a id="capability-plugin-distribution-and-publication"></a>

- Node.js 24 or newer and Git are required for the included scripts.
- Three scanners back the security gates: `gitleaks` (secrets), `osv-scanner`
  (dependency vulnerabilities), and `semgrep` (static analysis). Install them
  before running Verify. **A missing scanner makes its gate report `skipped`,
  not `pass`.** `skipped` means the gate checked nothing for that category —
  it is not a substitute for a passing scan, and a green Verify result built
  on a skipped gate does not mean that category was actually scanned. Run
  `node "<absolute-plugin-root>/scripts/toolchain-preflight.mjs" --root "$PWD"`
  to see every configured tool with its observed version, or a copyable
  platform-appropriate install command for whatever is missing. After binding
  the plugin, replace `<absolute-plugin-root>` with its installed directory
  and run this from the governed project root.
- Keep each governed repository under version control. The pipeline itself is
  obtained from its approved GitHub distribution; do not copy a maintainer
  checkout or its generated files into the governed repository.
- Treat credentials, account mappings, local paths, and private marketplace
  details as machine-local configuration. Do not commit them into the pipeline
  source, a generated projection, or a project calibration.

- **Measurement boundary.** There is no time, token, or administration-cost
  estimate for your project yet. The historical observations in [measurement
  guidance](docs/cost-and-measurement.md) are transparency material, not an
  adoption forecast.

## A. Activate the pipeline in one project repository

Repeat this routine path for every application or service repository. It uses
the public onboarding Driver. In a folder without Pipeline governance, first
explain the proposed installation and ask for explicit consent; stop before
installing, invoking `pipeline-start`, or writing project files until the user
agrees. Then bind the supported runner integration, start a new session in the
project root, invoke `/pipeline-core:pipeline-start`, and follow its returned
structured action. An already-governed project may enter through bootstrap
directly. Supply only named human inputs; do not copy this source repository's
`setup.mjs`, generated projections, or machine-local configuration into the
consumer project.

The Driver classifies fresh, existing, legacy, partial, and host-managed roots
before it offers a write. An explicit request to initialize is required for a
fresh seed; an existing project receives a reviewed, additive adoption plan;
partial or malformed roots fail closed. After bootstrap readback, record the
project's one Verify command, calibration, handover, and project-owned policy
choices through the normal reviewed workflow.

For Claude Code, bind the project-scoped `pipeline-core` plugin, then fully
restart the host before the first bootstrap. For Codex, use its approved
marketplace/add commands, fully end the Codex host process, then start a new
thread after binding or refresh. For another runner, use only its supported
integration and the manual controls
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

**One installed runner is enough for a consuming repository.** Bootstrap and
confirm the model mapping for that runner only. The other integrations,
accounts, and model catalogues are optional; their absence must not block
onboarding or ordinary work with the installed runner. Cross-runner evidence
is needed only for a claim that explicitly covers those other runners.

Supported runner integrations can enforce configured guards and lifecycle
checks when their adapter is installed and project prerequisites are met. Use
the runner's supported integration and follow its setup path. See
[`docs/runtime-boundary.md`](docs/runtime-boundary.md) for exact controls,
prerequisites, and manual responsibilities.

## Consumer onboarding details

<a id="consumer-onboarding-details"></a>

### 0. Bind the supported runner integration and fully restart its host

Bind the integration for the runner that will govern the project. After the
first binding, **fully end that host process and start a new session in the
project root before invoking `pipeline-start` or classifying the root**. A
refresh inside the existing host is insufficient for the first binding.

#### Claude Code: project-scoped binding

In the project repository, add the official Agent-Pipeline GitHub marketplace
and install the plugin at project scope:

```sh
claude plugin marketplace add agent-pipe-shared/agent-pipeline --scope project
claude plugin install pipeline-core@agent-pipeline --scope project
```

`--scope project` keeps the binding with the repository rather than with one
developer's user profile. The installed CLI's `claude plugin marketplace add
--help` does not document a `--ref` option for pinning a Git branch; this
marketplace binding therefore follows the source repository's default branch.
Confirm the installation with `claude plugin list
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

#### Codex: bind or refresh the plugin

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

The Pipeline's update channels resolve separately from Codex's marketplace
snapshot: `alpha` is the current `main` tip, `beta` is the highest
`vX.Y.Z-beta.N` tag on `main`, and `stable` is the highest final `vX.Y.Z`
release tag on `main`. Changing a channel selects a ref for freshness checks;
it does not install a different plugin by itself.

The final command must report exactly one installed and enabled
`pipeline-core@agent-pipeline`. A Git marketplace snapshot is not the running
plugin: after the first binding or any later refresh, fully end the Codex
host process and start a new thread in the project root before invoking
`/pipeline-core:pipeline-start`. A fresh thread in the old process or a plugin
reload alone does not prove that the cached skill snapshot changed. Do not hand-edit Codex
marketplace or cache files.

#### Antigravity (Agy): workspace-local binding

Bind the plugin in the consumer workspace, then fully restart Agy before the
common step 1 below. The [step-0 Antigravity details](#antigravity-installation-details-for-step-0)
cover the published-tag installer, upgrade readback, and host Node check.

### 1. After consent, let `pipeline-start` classify the consumer root

Do not copy `setup.mjs` into a consumer project or start a blank directory by
manually creating Git/V3 runtime files. After completing the binding and full
host restart in step 0, invoke `/pipeline-core:pipeline-start` as the first
project action in the new session. Its plugin-owned preflight runs before Git
or V3 authority checks and has these outcomes:

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
  present) is the supported `fresh-host-managed` variant; never delete,
  overwrite, chmod, ignore, or silently bypass those paths.

This step only classifies and, when you explicitly approve a seed, creates the
portable starting state. It does **not** finish onboarding. After this
classification, Codex users continue at the [Fresh Codex lifecycle V4
section](docs/v3-consumer-onboarding.md#fresh-codex-lifecycle-v4). Claude and
Antigravity users follow their installed Driver's returned runtime/restart,
intake, and binding action rather than repeating runner installation. Stop at
each requested confirmation. Treat the project as ready only when a fresh
`pipeline-start` readback explicitly says so.

The Codex `SessionStart` registration provides an onboarding hint. The
mandatory `pipeline-start` invocation remains proactive for the user's first
request; the hint does not perform automatic hidden initialization.

### 2. Complete project calibration after onboarding

For a fresh root, the official initializer already creates the minimal
V3-owned bootstrap calibration and runtime projection. Do not pre-create,
copy over, or hand-edit those generated targets. After the initializer and its
readback, propose project-specific calibration choices to the repository owner
and apply them through the normal reviewed workflow.

For an existing project, follow the reviewed, additive adoption plan. Use
the installed plugin's `templates/pipeline.json.example` and
`templates/CLAUDE.project.md` as references. Create only absent targets; merge the needed
calibration and guidance into existing files while preserving project settings
and instructions. Never copy a template over an existing `CLAUDE.md` or
calibration file.

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

### 3. Declare the Git lifecycle before delivery

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

### 4. Optional manifest, governance, and ritual extensions

<!-- capability:starter-templates -->
<a id="capability-starter-templates"></a>

Starter templates are optional examples for a consuming project to copy and
adapt deliberately. Copying a template does not install a plugin, activate a
guard or create approval authority; choose one configuration owner before
adopting it.
Review every copied path and command against the consuming repository before
running it. Keep project-specific identities, destinations and verification
commands explicit rather than inheriting the examples as production defaults.

<!-- capability:generated-agent-obligations -->
<a id="capability-generated-agent-obligations"></a>

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

### 5. Enter routine working sessions

After the Driver completes an authorized seed or adoption action, invoke
`pipeline-start` again as directed. In each later working session, open the
project root with the runner integration bound in step 0, then invoke:

```text
/pipeline-core:pipeline-start
```

The bootstrap is the auditable session entry. It checks the installed ruleset,
the project calibration, current handover, and verify availability before work
begins. For a material feature, it also follows the V3 profile and advisory
rules before writable work. A reminder hook is not a substitute for the
bootstrap itself.

<a id="c-bring-an-existing-repository-under-the-pipeline"></a>

### Existing repository checklist

The same Driver path applies to an existing repository. Adopt one control at a
time on a normal change branch:

1. Identify the existing test/build commands, branch policy, sensitive paths,
   and current documentation location.
2. Bind the supported runner integration and add calibration plus project
   guidance through the additive adoption plan, preserving existing settings
   and instructions.
3. Create or consolidate the one `verify` command and run it successfully
   before treating it as the delivery gate.
4. Name one handover file in calibration and move current state there instead
   of maintaining competing status copies.
5. Add project-specific denies, risk zones, and constraints. Enable governance
   policies only after their paths and checks are real.
6. Pilot the workflow read-mostly with a small spec, deterministic checks, and
   independent review. Expand autonomy only when its evidence and operating
   cost are understood.

Migration changes the project's process, so review it like any architectural
change. Do not paste a pipeline source's `pipeline.user.yaml` into an
application repository or make a legacy authority look current by copying
generated runtime files.

### Missing prerequisite guidance in a consumer project

The installed plugin's read-only toolchain preflight reports each configured
tool, observed version, blocked claim and a copyable platform command. From
the governed project root, run:

```sh
node "<absolute-plugin-root>/scripts/toolchain-preflight.mjs" --root "$PWD"
```

Replace `<absolute-plugin-root>` with the installed Pipeline plugin directory.
Review any offered installer command under your host/package-management
policy, then repeat the preflight. npm is never substituted for non-npm
scanners; bounded Semgrep settings avoid treating ordinary home-directory
writes as a missing installation.

## Where to go next

- [README](README.md) — why the pipeline exists and its core capabilities.
- [PIPELINE_FLOW.md](PIPELINE_FLOW.md) — the maintained V3 flow and boundaries.
- [Usage guide](docs/usage.md) — operator-facing commands and routine work.
- [Operating Model](docs/operating-model.md) — normative roles, gates, and
  lifecycle rules.
- [Runtime boundary](docs/runtime-boundary.md) — exact controls, prerequisites,
  and manual responsibilities for each supported runner integration.
- [Documentation map](docs/README.md) — focused reference links.

## Optional advanced setup

These additions are not part of routine onboarding. Use them only when the
project’s declared operating model requires them.

### Human-approval key (one-time setup)

Routine onboarding does not require a key: project and author details,
project/intake answers, and any required plan decision are sufficient. Routine
implementation, tests, and Critic review remain agent work after the approved
plan. Create the portable external Ed25519 key once only when a project
configures a real human decision gate that uses the signature path. The
[onboarding guide](docs/usage.md#start-or-adopt-a-project) distinguishes this
optional setup from ordinary onboarding:

Run the following commands from the governed project root, first defining
`REPO` as that exact root:

```sh
REPO="$PWD"
```

```sh
node "<absolute-plugin-root>/scripts/po-human-approval.mjs" setup --repo-root "$REPO" --directory "$HOME/agent-pipeline-po"
```

The directory stays outside the repository. OpenSSL asks for the passphrase
locally; the agent never receives the key or passphrase. The agent prepares
and refreshes public candidate-bound requests. The regular human action is:

```sh
node "<absolute-plugin-root>/scripts/po-human-approval.mjs" approve-all --repo-root "$REPO" --directory "$HOME/agent-pipeline-po"
```

Passkey/WebAuthn, IAM/hardware-key adapters, and remote provisional codes are
future adapter work, not current CLI features. A code pasted into the same agent
chat is visible to that agent and cannot replace final local proof for an
irreversible action. See [PO approval](docs/po-human-approval.md).

### Activate a slim private overlay

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

## Troubleshooting: Codex local agent activity

If Codex agent threads no longer appear after adoption, inspect its persistent
local app-server daemon before changing a plan or treating the incident as a
repository failure. Replace `<absolute-plugin-root>` with the installed
Pipeline plugin directory and run from the governed project root:

```sh
node "<absolute-plugin-root>/scripts/codex-app-server-health.mjs"
```

`CAS-READY` is a current daemon-version observation. It does not prove a model
child launched or a host background wakeup. For another `CAS-*` result, the
bounded attended recovery is:

```sh
node "<absolute-plugin-root>/scripts/codex-app-server-health.mjs" --recover
```

It never loops or changes repository state. If it fails, run `codex doctor` in
an attended local Codex session and retain the result in the handover.

## B. Maintain a shared pipeline source (occasional)

> Maintainer path, not consumer onboarding. A project using Agent-Pipeline
> installs the released plugin from its official GitHub distribution and does
> not run these source-maintenance commands.

<!-- capability:setup-and-runtime-projection -->
<a id="capability-setup-and-runtime-projection"></a>

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

### Transaction and rollback boundary

The migration records preimages before activation. After an interrupted or
failed activation, the next `inspect`, `plan`, or `apply` attempts safe
recovery; do not delete a pending transaction directory or repair its files by
hand. This is not a general revert: change completed authority in a reviewed
working copy, then run a new inspect → plan → explicit activation cycle and
read it back with `node setup.mjs`.

## Antigravity installation details for step 0

Before `v0.7.0` is published, use the installation instructions at the
already-approved release tag in the
[official GitHub repository](https://github.com/agent-pipe-shared/agent-pipeline).
Do not use an unpublished `v0.7.0` tag or treat a local developer checkout as
a released plugin. The pinned example below applies only after that tag
actually exists; it is not a pre-release installation command.

After the `v0.7.0` release tag is published on the official GitHub repository,
run these commands with your shell in the **consumer project root**. The tag
must be available on GitHub before this released-version example can be used.
The clone lives in a durable physical directory outside the governed project
and any temporary or runner cache directory. Choose a different durable
location if `$HOME/.local/share` is unsuitable:

```sh
mkdir -p "$HOME/.local/share"
pipeline_release_tag="v0.7.0"
pipeline_source_url="https://github.com/agent-pipe-shared/agent-pipeline.git"
pipeline_release_dir="$HOME/.local/share/agent-pipeline-$pipeline_release_tag"
git clone --branch "$pipeline_release_tag" --depth 1 \
  "$pipeline_source_url" "$pipeline_release_dir"
git -C "$pipeline_release_dir" switch -c pipeline-release-v0.7.0
git -C "$pipeline_release_dir" remote get-url origin
git -C "$pipeline_release_dir" describe --tags --exact-match
```

On Windows, use PowerShell from the consumer project root. The following
directory is durable and outside the project; choose another durable path if
`$env:LOCALAPPDATA` is unsuitable:

```powershell
$pipelineReleaseTag = 'v0.7.0'
$pipelineSourceUrl = 'https://github.com/agent-pipe-shared/agent-pipeline.git'
$pipelineReleaseDir = Join-Path $env:LOCALAPPDATA "AgentPipeline\agent-pipeline-$pipelineReleaseTag"
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $pipelineReleaseDir) | Out-Null
git clone --branch $pipelineReleaseTag --depth 1 $pipelineSourceUrl $pipelineReleaseDir
git -C $pipelineReleaseDir switch -c pipeline-release-v0.7.0
git -C $pipelineReleaseDir remote get-url origin
git -C $pipelineReleaseDir describe --tags --exact-match
```

Confirm the two Git readbacks show the official URL above and `v0.7.0` before
running the installer from the same consumer project root. The local branch is
required because cloning a tag otherwise leaves a detached HEAD, which the
plugin's clean-source observer refuses; creating the branch does not move the
checked-out release commit. The installer validates physical plugin files and
the registry binding; it does not independently authenticate the GitHub source
or a release signature. Treat those readbacks and your approved release channel
as operator checks, not as proof supplied by the installer.

```sh
node "$pipeline_release_dir/plugins/pipeline-core/install-agy.mjs"
```

On Windows, run the same installer from the consumer project root with:

```powershell
node (Join-Path $pipelineReleaseDir 'plugins/pipeline-core/install-agy.mjs')
```

At the first prompt choose **Approved Plugin Directory** (the default). Choose
**Local Marketplace** only for an explicitly validated pre-release developer
copy; if that development copy is unavailable, the installer refuses the
selection instead of silently switching sources. Then choose
**Workspace-Local** when the installer asks where to bind
the plugin. The installer registers that exact physical plugin directory in
the consumer project's `.agents/plugins.json`; keep the clone at the same path
while it is registered. Do not hand-edit Agy registry or plugin files. The
installer may offer a runner-local autonomous tool policy, but that option
grants no plan, release, remote, or human authority.
If its existing runner settings are malformed or linked through an alias, the
optional policy update fails without replacing those bytes. Plugin registration
may already have succeeded; inspect `.agents/plugins.json` and repair the
settings deliberately before retrying that optional step.

To upgrade after a newer final release tag is published, clone that tag into
a **different** durable directory and run its `install-agy.mjs` from each
consumer project root. Choose Approved Plugin Directory and Workspace-Local
again. Read back each project's `.agents/plugins.json`: it must contain the
new exact plugin path and no previous Pipeline registration, while unrelated
entries remain. Keep the old checkout until that readback succeeds, then
retire it and fully restart Agy. A developer checkout is only for an explicit
pre-release test.

If the old checkout was already deleted while its registry entry remains,
restore that exact approved plugin directory first and rerun the installer.
The installer refuses an unverifiable, Pipeline-shaped stale path instead of
deleting an entry it cannot prove it owns; do not work around this by editing
the registry by hand.

If launching Agy from this same terminal, check Node.js immediately before
launching it. On macOS/Linux use:

```sh
command -v node
```

On Windows, use PowerShell or Command Prompt:

```powershell
where.exe node
```

For a desktop or service launch, either shell result does **not** prove the Agy
host's PATH. Inspect that launcher/service environment and confirm that Agy's
own command tool can resolve and run `node --version` in a new session. If
that readback is unavailable or denied, treat hook readiness as unknown;
correct the host environment and fully restart Agy before relying on hooks.
Then open a new workspace session in the project root and invoke
`/pipeline-core:pipeline-start` as the first Pipeline action. Do not use an
unattended permission-bypass mode as an installation or recovery shortcut.
