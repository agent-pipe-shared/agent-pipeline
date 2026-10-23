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
- Four categories back the security gates: secrets (`gitleaks`), dependency
  vulnerabilities (`osv-scanner`), static analysis (`semgrep`), and licenses.
  The license check is a built-in `license-check` control that reads a license
  allowlist and `third-party-licenses.json` from the project; it needs no
  separately installed tool. Install the three scanners before running Verify.
  **A missing scanner makes its gate report `skipped`, not `pass`.** `skipped`
  means the gate checked nothing for that category — it is not a substitute for
  a passing scan, and a green Verify result built on a skipped gate does not
  mean that category was actually scanned. After binding the plugin, the
  [toolchain preflight](#missing-prerequisite-guidance-in-a-consumer-project)
  shows every configured tool with its observed version, or a copyable
  platform-appropriate install command for whatever is missing.
- Keep each governed repository under version control. The pipeline itself is
  obtained from its approved GitHub distribution; do not copy a maintainer
  checkout or its generated files into the governed repository.
- Treat credentials, account mappings, local paths, and private marketplace
  details as machine-local configuration. Do not commit them into the pipeline
  source, a generated projection, or a project calibration.

## A. Activate the pipeline in one project repository

Repeat this routine path for every application or service repository. It uses
the public onboarding
[Driver](docs/README.md#terms-used-across-these-documents). Who does what: the
agent explains the installation, asks for consent, invokes `pipeline-start` and
follows the Driver's returned actions; the human gives the consent, fully
restarts the host and supplies the named inputs. In a folder without Pipeline
governance, the agent first
explains the proposed installation and asks for explicit consent; it stops before
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

The per-runner binding commands and the restart rule are in
[step 0](#0-bind-the-supported-runner-integration-and-fully-restart-its-host).

The resulting Verify receipt and delivery records can be inspected with the
candidate's other evidence. They do not certify compliance or replace a human
decision. [Audit and evidence](docs/audit-and-evidence.md) gives the artifact
boundary; the [consumer onboarding guide](docs/v3-consumer-onboarding.md)
retains the exact commands and the migration cases for operators who need them.

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

<a id="consumer-onboarding-details"></a>

### 0. Bind the supported runner integration and fully restart its host

Bind the integration for the runner that will govern the project. After the
first binding, **fully end that host process and start a new session in the
project root before invoking `pipeline-start` or classifying the root**. A
refresh inside the existing host is insufficient for the first binding. Until
`0.7.0` is released, bind only the approved GitHub-distributed version; a local
[candidate](docs/README.md#terms-used-across-these-documents) is not an
installation source (see the [release status](docs/overview.md)). This applies
to every bind step below. "Approved" means, for Claude Code and Codex, the
version the official marketplace source delivers from its `main` branch (the
published release branch); for Antigravity it is a final release tag of the
official repository, such as `v0.7.0`. Before such a tag exists there is no
approved Antigravity route, because a developer checkout is only for an
explicit pre-release test.

#### Claude Code: project-scoped binding

In the project repository, add the official Agent-Pipeline GitHub marketplace
and install the plugin at project scope:

```sh
claude plugin marketplace add agent-pipe-shared/agent-pipeline --scope project
claude plugin install pipeline-core@agent-pipeline --scope project
```

`--scope project` keeps the binding with the repository rather than with one
developer's user profile. This marketplace binding follows the source
repository's default branch. Confirm the installation with
`claude plugin list --json`. To update a Claude Code binding later, update the
marketplace, update the same project-scoped plugin, then reload the running
host session:

```sh
claude plugin marketplace update agent-pipeline
claude plugin update pipeline-core@agent-pipeline --scope project
/reload-plugins
```

Do not substitute `/reload-plugins` for the first-bind restart described above;
use a full restart before invoking `/pipeline-core:pipeline-start`.

#### Codex: bind or refresh the plugin

Codex uses its own marketplace and install commands. Add the approved Git
source once, refresh its snapshot when the approved ref advances, and install
the plugin from the marketplace name declared by that source. Pin the
marketplace snapshot to `main`, the published release branch:

```sh
codex plugin marketplace add https://github.com/agent-pipe-shared/agent-pipeline.git --ref main
codex plugin marketplace upgrade agent-pipeline
codex plugin add pipeline-core@agent-pipeline
codex plugin list --marketplace agent-pipeline --json
```

The final command must report exactly one installed and enabled
`pipeline-core@agent-pipeline`. A Git marketplace snapshot is not the running
plugin: after the first binding or any later refresh, fully end the Codex
host process and start a new thread in the project root, inspect `/hooks`,
and only then invoke `/pipeline-core:pipeline-start`. A fresh thread in the old
process or a plugin reload alone does not prove that the cached skill snapshot
changed. Do not hand-edit Codex marketplace or cache files. Update channels
(`alpha`, `beta`, `stable`) are described under
[Update channels](#update-channels).

#### Antigravity (Agy)

Antigravity binds through the
[Agy binding procedure](#antigravity-agy-workspace-local-binding),
which follows step 5 so that Claude Code and Codex readers reach step 1
without scrolling past it. Follow that procedure, then continue at step 1.

#### Missing prerequisite guidance in a consumer project

The installed plugin's read-only toolchain preflight reports each configured
tool, observed version, blocked claim and a copyable platform command. In this
guide `<plugin-root>` is the installed Pipeline plugin directory and
`<project-root>` the governed repository root (see the
[command convention](docs/README.md)). From the governed project root, run:

```sh
node "<plugin-root>/scripts/toolchain-preflight.mjs" --root "$PWD"
```

Review any offered installer command under your host/package-management
policy, then repeat the preflight. npm is never substituted for non-npm
scanners; bounded Semgrep settings avoid treating ordinary home-directory
writes as a missing installation.

### 1. After consent, let `pipeline-start` classify the consumer root

The agent runs this step; the human's part is the consent and, for a fresh
root, the explicit request to create or initialize the project.

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
  `.agents` path. The [existing repository checklist](#existing-repository-checklist)
  in step 2 lists the adoption steps.
- A V0/V1/V2 authority uses the official migration inspect → plan → explicit
  apply workflow ([consumer procedure](docs/v3-consumer-onboarding.md#legacy-consumer-with-no-projections)),
  never the fresh initializer. A partial, invalid, unsafe, or
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

<a id="c-bring-an-existing-repository-under-the-pipeline"></a>

#### Existing repository checklist

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

### 3. Declare the Git lifecycle before delivery

An ordinary initial seed deliberately sets `repositoryMode: "local-only"` in
the project calibration: onboarding creates a repository but no initial commit,
remote, or credential binding (the authority-tier note in
[step 2](#2-complete-project-calibration-after-onboarding) says where that
calibration file is read from). Make the initial commit before normal work.
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

If the bootstrap reports `hook-refresh-required`, see
[Troubleshooting](#troubleshooting). In the default `signature` approval mode,
create the [human-approval key](#human-approval-key-one-time-setup) before the
first human decision gate.

### Human-approval key (one-time setup)

**When the key is required.** The human-approval key is required in the
default approval mode, `signature` (the
[approval-strength selector](docs/usage.md#choose-the-human-approval-strength-deliberately)
explains the choice), and not needed under `chat`. The approval mode is a
routine onboarding question: the Driver asks for it (`signature` or `chat`) in
its initial round, alongside the Git author, language and Advisor-consent
inputs; choosing `signature` makes it surface the separate
[trust anchor](docs/README.md#terms-used-across-these-documents) step. Under `signature`, a human decision gate (for example PRD
approval, which [`PIPELINE_FLOW.md`](PIPELINE_FLOW.md) makes mandatory for
rigor 1 or 2 and for high risk, or a push) needs a detached proof, so create
the key once before the first such gate. Under `chat` no key is needed, but
the approval is only an unattested chat attribution. No other onboarding input
(project and author details, project/intake answers, a plan decision) involves
a key, and routine implementation, tests, and Critic review remain agent work
after the approved plan. To create the portable external Ed25519 key:

Run the following commands from the governed project root, first defining
`REPO` as that exact root:

```sh
REPO="$PWD"
```

```sh
node "<plugin-root>/scripts/po-human-approval.mjs" setup --repo-root "$REPO" --directory "$HOME/agent-pipeline-po"
```

The directory stays outside the repository. OpenSSL asks for the passphrase
locally; the agent never receives the key or passphrase. The agent prepares
and refreshes public candidate-bound requests. The regular human action is:

```sh
node "<plugin-root>/scripts/po-human-approval.mjs" approve-all --repo-root "$REPO" --directory "$HOME/agent-pipeline-po"
```

Passkey/WebAuthn, IAM/hardware-key adapters, and remote provisional codes are
future adapter work, not current CLI features. A code pasted into the same agent
chat is visible to that agent and cannot replace final local proof for an
irreversible action. Background for maintainers, not a required step:
[PO approval](docs/po-human-approval.md).

### Antigravity (Agy): workspace-local binding

Bind the plugin with the installer's **Global** topology refresh (the
documented default route; Workspace-Local is the documented alternative, see
*Choosing where to bind* below), then fully restart Agy before the
common [step 1](#1-after-consent-let-pipeline-start-classify-the-consumer-root).
The pinned `v0.7.0` example applies only after that tag is published on the
[official GitHub repository](https://github.com/agent-pipe-shared/agent-pipeline);
what *approved* means is stated in [step 0](#0-bind-the-supported-runner-integration-and-fully-restart-its-host).

After the tag is published, run these commands with your shell in the
**consumer project root**. The clone lives in a durable physical directory
outside the governed project and any temporary or runner cache directory; the
Global choice below is the one that accepts a source outside the project.
Choose a different durable location if `$HOME/.local/share` is unsuitable:

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
selection instead of silently switching sources. Then, when the installer
asks where to install, choose **Global topology refresh** (prompt choice `2`),
the documented default route, as described under *Choosing where to bind*
below. **Workspace-Local** (prompt choice `1`) is the documented alternative:
it registers the plugin directory in the consumer project's
`.agents/plugins.json` as a path relative to the project and refuses a plugin
directory that lies outside the project, so it requires the release clone to
lie inside the workspace. Once a global registration exists the installer
refuses Workspace-Local and has no way back (see below). Keep the clone at the
same path while the plugin is registered. Do not hand-edit Agy registry or plugin files. The
installer may offer a runner-local autonomous tool policy, but that option
grants no plan, release, remote, or human authority.
If its existing runner settings are malformed or linked through an alias, the
optional policy update fails without replacing those bytes. Plugin registration
may already have succeeded; inspect `.agents/plugins.json` and repair the
settings deliberately before retrying that optional step.

To upgrade after a newer final release tag is published, clone that tag into
a **different** durable directory and run its `install-agy.mjs` from each
consumer project root. Choose Approved Plugin Directory and the same
installation choice as before (Global topology refresh by default) again. Read
back the registry the choice writes: for Global, `$HOME/.gemini/config/plugins.json`
must hold exactly one Pipeline entry naming the new generated view; for
Workspace-Local, each project's `.agents/plugins.json` must contain the new
exact plugin path and no previous Pipeline registration. Unrelated entries
remain in both cases. Keep the old checkout until that readback succeeds, then
retire it and fully restart Agy. A developer checkout is only for an explicit
pre-release test.

If the old checkout was already deleted while its registry entry remains,
restore that exact approved plugin directory first and rerun the installer.
The installer refuses an unverifiable, Pipeline-shaped stale path instead of
deleting an entry it cannot prove it owns; do not work around this by editing
the registry by hand.

**Agy's managed plugin directory and import manifest.** Besides the path
registries (`.agents/plugins.json` and the global `plugins.json`), Agy keeps a
managed copy of an imported plugin in its own config directory
(`plugins/agent-pipeline-core`) and lists it in `import_manifest.json`. That
managed copy can be stale while the registered path is current, and a stale
same-version copy can shadow the registered plugin. Keep a **single source**:
one approved plugin directory per scope, and no hand-edited copy beside it. The
refresh command is:

```sh
node "$pipeline_release_dir/plugins/pipeline-core/install-agy.mjs" --refresh
```

It prints the exact plan (sync of the local marketplace copy, the Agy
lifecycle steps, a readback) before it changes anything and asks for
confirmation. `--yes` skips only that question and is accepted only together
with `--refresh`; on its own it is refused with a repair. After the refresh,
**fully restart Agy and read the session lock** (the first
`/pipeline-core:pipeline-start` of the new session reports it). `agy plugin
list` and `plugins.json` are not proof of what is loaded, and neither is the
installer's readback, which is a physical diagnostic only.

**Choosing where to bind.** The interactive installer asks up to two
questions. Everything below is read from `install-agy.mjs` and the topology
code it calls; nothing here is a claim about what Agy itself does.

1. *Plugin source:* `1` Approved Plugin Directory (the default), `2` Local
   Marketplace (refused unless the development marketplace directory exists),
   or `3` Central agy snapshot (global, per-user).
2. *Where to install* (asked only for source `1` or `2`). The documented
   default is `2`, Global topology refresh; `1`, Workspace-Local, is the
   alternative and needs the plugin directory inside the project:
   - `1` **Workspace-Local.** Writes `<project-root>/.agents/plugins.json`: one
     Pipeline entry, the plugin directory as a path relative to the project,
     and no absolute Pipeline entry. The plugin directory must lie inside the
     project. A directory outside it, such as the clone location in the
     procedure above, is refused with `ATR-WORKSPACE-SOURCE-OUTSIDE` and the
     repair "use the global option", which is why Global is the documented
     default. A stale Agy-managed copy or stale global
     hook wiring also makes this choice refuse (`ATR-GLOBAL-SCOPE`); those
     changes are made only by the global choice. The optional autonomous tool policy goes to
     `<project-root>/.agents/settings.json`.
   - `2` **Global topology refresh** (documented default). User-wide, not tied to one project. It
     generates a runner view of the approved source in a per-user Pipeline
     directory and, when Agy has no managed copy or a stale one, runs
     `agy plugin validate` and `agy plugin install` on that view. Afterwards
     the global registry (`$HOME/.gemini/config/plugins.json`) holds exactly
     one Pipeline entry, naming the generated view. Pipeline-owned hook
     commands in already existing global and workspace `hooks.json` and
     `external-hooks.json` files are rewritten to the view (foreign entries
     stay byte-identical; absent files are not created). Any absolute
     Pipeline entry in the project's tracked `.agents/plugins.json` is removed;
     a relative entry stays. The optional autonomous tool policy goes to
     `$HOME/.gemini/antigravity-cli/settings.json`.

   Source `3` skips the second question and is global: it publishes the
   per-user central snapshot, retires the Pipeline entries it owns in the
   project's `.agents/plugins.json`, and refreshes Agy's global copy from the
   snapshot. It does not offer the autonomous tool policy.

Both choices need the `agy` command on the installer's `PATH` at version
1.2.12 or later; the installer refuses before changing anything otherwise
(`ATR-CLI` when `agy` is not found, `ATR-CLI-CAPABILITY` for an older or
unrecognised version). The workspace choice is also refused with
`ATR-OTHER-SCOPE-CONFLICT` while the global registry holds a Pipeline entry for
a different root, which is the case after a global install. The installer has
no mode for going from global back to workspace, and the code does not show
a repair for it (unverified). Choose Workspace-Local only deliberately, with
the source inside the workspace, because the global default cannot be undone
through the installer.

*Refreshing or switching.* To pick up a newer release, rerun the installer
from the new approved directory with the same choice, or use `--refresh`
(global, described above). To move a project from workspace to global, run
the installer again and choose global. After any of these, fully restart Agy
and read the session lock.

*Not verified from the code:* which workspaces Agy loads a global registration
for (the PO's Antigravity run checks this), how Agy treats `.agents/plugins.json` in a project that never ran the
installer, and whether the installer's `--refresh` can be used by a consumer
(its help calls it a developer entry).

**Inert outside opted-in repositories.** A global install acts only in
repositories that opted in. Outside them the hooks are inert: no blocking, no
injected instructions, no writes. The one exception is the destructive-git
protection, which stays active everywhere. A repository that has not yet
decided may still show the optional onboarding hint; it creates no
obligation, and a decline silences it.

**Node.js on the host's PATH.** The pipeline hooks need the Agy host to resolve
`node`; a desktop or service launcher may have a different PATH from an
interactive shell. If launching Agy from this same terminal, check Node.js
immediately before launching it. On macOS/Linux use:

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

### Optional advanced setup

The slim private overlay and update channels below are not part of routine
onboarding; use them only when the project's declared operating model requires
them.

#### Activate a slim private overlay

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

#### Update channels

The Pipeline's update channels resolve separately from a runner's marketplace
snapshot: `alpha` is the current `main` tip, `beta` is the highest
`vX.Y.Z-beta.N` tag on `main`, and `stable` is the highest final `vX.Y.Z`
release tag on `main`. Changing a channel selects a ref for freshness checks;
it does not install a different plugin by itself. See also the update-boundary
paragraph in [`PIPELINE_FLOW.md`](PIPELINE_FLOW.md).

### Troubleshooting

#### Bootstrap reports `hook-refresh-required` (all runners)

A mandatory git hook snapshot in the repository is stale. Run
`node <plugin-root>/scripts/clone-hook-readiness.mjs --root <project-root> --apply`:
it installs missing mandatory hooks and also refreshes stale ones. If a refresh
fails, it reports `HOOK-READINESS-REFRESH-FAILED` and names the command to
repair it, `refresh-mandatory-hooks.mjs --root <project-root>`.

#### Codex: local agent activity

If Codex agent threads no longer appear after adoption, inspect its persistent
local app-server daemon before changing a plan or treating the incident as a
repository failure. Run from the governed project root:

```sh
node "<plugin-root>/scripts/codex-app-server-health.mjs"
```

`CAS-READY` is a current daemon-version observation. It does not prove a model
child launched or a host background wakeup. For another `CAS-*` result, the
bounded attended recovery is:

```sh
node "<plugin-root>/scripts/codex-app-server-health.mjs" --recover
```

It never loops or changes repository state. If it fails, run `codex doctor` in
an attended local Codex session and retain the result in the handover.

### Where to go next

- [README](README.md) — why the pipeline exists and its core capabilities.
- [PIPELINE_FLOW.md](PIPELINE_FLOW.md) — the maintained V3 flow and boundaries.
- [Usage guide](docs/usage.md) — operator-facing commands and routine work.
- [Operating Model](docs/operating-model.md) — normative roles, gates, and
  lifecycle rules.
- [Runtime boundary](docs/runtime-boundary.md) — exact controls, prerequisites,
  and manual responsibilities for each supported runner integration.
- [Documentation map](docs/README.md) — focused reference links.
- [Cost and measurement](docs/cost-and-measurement.md) — there is no time,
  token, or administration-cost estimate for your project yet; the historical
  observations there are transparency material, not an adoption forecast.
- [Uninstall reference](#appendix-uninstall-reference) — releasing a repository
  from the Pipeline again (appendix at the end of this guide).

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

`runner-profile-migration-v3` is one CLI with two audiences. A consumer project
whose Driver reports a legacy V0/V1/V2 authority runs it from the installed
plugin, as in the [consumer procedure](docs/v3-consumer-onboarding.md#legacy-consumer-with-no-projections).
The repository-relative commands below are the maintainer form: run them
**only in a pipeline source checkout that contains `pipeline.user.yaml`**, for
an existing V0/V1/V2 authority or a V3 projection that needs explicit
reconciliation. They are not a setup command for an arbitrary application
repository.

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

Whether the Advisor may receive repository data is decided by the recorded
`advisor_export.consent` (`approved` or `declined`) in `pipeline.user.yaml`;
the onboarding Driver asks for it explicitly, nothing is exported without a
recorded consent, and `declined` creates no advisor
export, child launch, or receipt (see
[Advisor export consent](docs/v3-consumer-onboarding.md#advisor-export-consent)
for a missing field). To review that boundary, run:

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

## Appendix: uninstall reference

### Uninstalling from a repository

A repository that once opted in can be released again. The plugin ships a
journaled, resumable uninstall controller that removes the Pipeline's own
mechanics and keeps everything you wrote. `<plugin-root>` is the installed
Pipeline plugin directory and `<project-root>` the repository root.

1. **Plan** (read-only; changes no byte). It prints one JSON document that
   includes `planSha256` and the list of `conflicts`:

   ```sh
   node "<plugin-root>/scripts/project-uninstall.mjs" plan --root "<project-root>"
   ```

   Resolve every entry in `conflicts` before you continue. A plan with
   conflicts is refused by `apply` and nothing is changed.

2. **Apply** the exact plan you reviewed by passing its digest back:

   ```sh
   node "<plugin-root>/scripts/project-uninstall.mjs" apply --root "<project-root>" --plan-sha256 "<planSha256>" --activate
   ```

3. **Resume** after an interruption with the same flags. Each stage is journaled,
   so the run continues from the last completed stage to the same end state:

   ```sh
   node "<plugin-root>/scripts/project-uninstall.mjs" resume --root "<project-root>" --plan-sha256 "<planSha256>" --activate
   ```

The controller accepts only `--root`, `--plan-sha256` and `--activate`; there
are no archive or retention flags. A refusal is a JSON document with the schema
`pipeline.project-uninstall-error.v1`, a `code`, and exit status 1. Common codes:

- `PU-FOREIGN-HOOK-CONFLICT`: a `pre-commit`, `commit-msg` or `pre-push` hook is
  present that the Pipeline did not install. It is never touched; remove or
  relocate it, then plan again.
- `PU-SHARED-ACTIVE-WORKTREE`: another worktree of the same repository is still
  governed. Release or decline that worktree first.
- `PU-OWNERSHIP-CONFLICT`: a file the Pipeline owns was changed by someone
  else, so the plan carries conflicts and `apply` changes nothing.
- `PU-PLAN`: the digest or `--activate` flag does not match a current plan.
- `PU-CLI`: an unknown verb or flag, a missing `--root`, or a malformed digest.

What `apply` does, in order:

- removes the owned `pre-commit`, `commit-msg` and `pre-push` shims first, so no
  commit or push can reach a hook whose private state is being retired;
- strips only the Pipeline-owned keys from projection files such as
  `.claude/pipeline.json` and `.claude/pipeline.yaml`; unowned bytes stay
  exactly as they were;
- moves retained metadata, including the private hook state, under
  `<git-common-dir>/pipeline-uninstall/<scopeKey>/<planSha256>/retained/`
  instead of deleting it;
- removes the owned Antigravity entries from `.agents/plugins.json`,
  `.agents/hooks.json` and `.agents/external-hooks.json`;
- writes the durable declined scope marker, so the repository is reported as
  declined and not as an unevaluated candidate.

What it keeps: `AGENTS.md`, `CLAUDE.md`, `architecture/`, `docs/`, `specs/`,
`backlog/`, the whole Git history, user-scope stores, and `pipeline.user.yaml`.
Ordinary `git commit` and `git push` keep working throughout.

Re-onboarding later is an ordinary enrollment of the same repository; the
retained records stay intact. Removing the plugin from a runner globally
(Claude Code, Codex or Antigravity) is a separate step in that runner's own
plugin manager. This controller releases one repository only.
