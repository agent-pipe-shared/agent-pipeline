# Set up Agent-Pipeline

Agent-Pipeline gives an AI-assisted project a repeatable way to move from an
idea to a reviewable change: clarify intent, plan, implement in bounded tasks,
run deterministic checks, review independently, and leave durable evidence.
It is a project operating model, not an application framework.

This guide has two jobs:

1. prepare a copy of **this pipeline repository** as your shared source; and
2. activate and calibrate the pipeline in each repository that will use it.

Start with the top-level [README](README.md) for the value proposition and
terminology. Read [`PIPELINE_FLOW.md`](PIPELINE_FLOW.md) for the maintained
end-to-end flow; this page only explains installation and adoption.

## Before you start

- Node.js 24 or newer and Git are required for the included scripts.
- Keep the pipeline source and each governed repository under version control.
- Treat credentials, account mappings, local paths, and private marketplace
  details as machine-local configuration. Do not commit them into the pipeline
  source, a generated projection, or a project calibration.

### Runner support, stated precisely

The methodology (roles, specifications, evidence, review separation, and
handover) is runner-neutral. The current V3 authority contains registered
routes for Claude and Codex duties, but a requested route is not proof that a
host used that model.

Claude Code is the supported full-enforcement runtime: its plugin and hooks can
enforce configured guards and lifecycle checks. On Codex or another runtime,
use the same methodology only where that host exposes the needed integration;
do not assume Claude hooks, plugin installation, or automatic guard enforcement
exists there. See [`docs/runtime-boundary.md`](docs/runtime-boundary.md) for the
exact boundary and manual responsibilities.

### Codex local agent activity troubleshooting

Codex local subagent activity depends on its persistent local app-server daemon.
If agent threads no longer appear, or a session unexpectedly behaves as if no
durable local execution were available, check the daemon before changing a
pipeline plan or treating the incident as a repository failure:

```sh
node plugins/pipeline-core/scripts/codex-app-server-health.mjs
```

`CAS-READY` means the daemon returned a current closed version observation. It
does not prove that a model child was launched or that a host provides a
background wakeup. Any other `CAS-*` result is a local Codex-host incident,
with an exact code and attended operator guidance. The bounded recovery makes
one fixed daemon restart and then requires a new healthy observation:

```sh
node plugins/pipeline-core/scripts/codex-app-server-health.mjs --recover
```

The recovery never loops, launches no model, and does not change repository
state. If it fails, run `codex doctor` in an attended local Codex session and
retain the `CAS-*` result in the handover; do not claim an active worker.

## A. Prepare your pipeline source

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

The sequence is intentional:

1. `inspect` reads the present authority and any recoverable transaction state.
2. `plan` shows the exact V3-owned runtime targets and byte changes. Review it
   before writing anything.
3. `apply --activate` is the only write step. Its CLI invocation creates and
   authenticates a fresh plan, refuses source or target drift from that plan,
   writes the declared runtime targets first, and commits `pipeline.user.yaml`
   last.

Stop unless `inspect` reports `ready` and `plan` reports `ready` or `noop`.
Do not hand-edit generated runtime targets or use
`setup.mjs --force` to bypass this boundary; `--force` cannot authorize a V3
authority write.

After activation, perform a read-only readback:

```sh
node setup.mjs
```

Success means the V3 source and its owned runtime projections agree, and the
command performed no writes.

### Choose advisor export consent explicitly

Advisory is optional at the repository boundary. A missing
`advisor_export` field and `consent: declined` are both valid Advisory-off
states: bootstrap performs no advisor probe, child launch, repository export,
or receipt creation. Existing V3 repositories are never silently opted in.
The read-only `node setup.mjs` check prints the configuration command when
consent is missing or declined but does not write it.

To review the disclosure and record a repository-owner decision, run:

```sh
node setup.mjs --configure-advisor-export
```

The prompt explains that approval exports one advisory question plus the
allowlisted repository candidate material needed by the configured
same-runner advisor. It does not authorize secrets, credentials, unrelated
paths, raw question/answer persistence, or a runner/model substitution. The
prompt defaults to decline and atomically records either `approved` or
`declined` in `pipeline.user.yaml`. Re-run the same command to change that
public-safe repository decision.

With approval, Claude keeps its registered Fable → Opus → same-runner consult
order and Read/Grep/Glob consult tools. Codex uses only the exact selected
`network-open/read-only` Sol transport, whose launch payload is
Read/Grep/Glob/Bash. The checkout remains read-only and coordinator scratch is
the sole writable root. No selected transport, no child, profile drift, wrong
identity, or incomplete stdio/cleanup is a non-success; an unbound host Bash
or consult is never a fallback.

### Missing prerequisite guidance

Normal `node setup.mjs` now runs the same read-only toolchain check after V3
source/runtime validation. It prints every configured tool with its observed
version and returns the manifest security-gate exit code. The standalone form
remains available:

```sh
node plugins/pipeline-core/scripts/toolchain-preflight.mjs --root "$PWD"
```

Each missing configured prerequisite reports the claim that remains blocked,
a copyable platform-appropriate `installCommand`, and
`installAttempted: false`. Installer prerequisites are part of that command:
on Ubuntu a missing `pipx` yields
`sudo apt-get update && sudo apt-get install -y pipx && pipx install semgrep`,
while an available `pipx` yields only `pipx install semgrep`. Go-backed commands
likewise bootstrap Go only when it is absent. npm is never substituted for
these non-npm scanners. System binaries plus the standard per-user
`~/.local/bin` and `~/go/bin` locations are checked without trusting arbitrary
PATH ordering. Semgrep receives bounded temporary settings/log/cache paths so
its normal home-directory writes cannot be misreported as a missing install.
Run a suggested command only after reviewing it under your own host/package-
management policy, then repeat setup or the standalone preflight.

### Transaction and rollback boundary

The migration records preimages before activation. If an activation fails or is
interrupted, the next `inspect`, `plan`, or `apply` attempts recovery from that
record and restores the recorded preimages when safe. Do not delete a pending
transaction directory or repair its files by hand.

That recovery is deliberately narrow: it protects an incomplete transaction; it
does **not** make a completed activation a reversible toggle. To change a
completed authority, restore a reviewed version-controlled source in a separate
working copy or make the corrected source change, then run a new
inspect → plan → explicit activation cycle and read it back with `node setup.mjs`.

## B. Activate the pipeline in one project repository

Repeat this section for every application or service repository you want to
govern. A governed project does not inherit your local account or credentials;
it commits only its portable calibration and its project rules.

### 1. Bind the plugin at project scope (Claude Code)

In the project repository, add the marketplace that hosts your pipeline source
and install the plugin at project scope:

```sh
claude plugin marketplace add <owner>/<pipeline-repo> --scope project
claude plugin install pipeline-core@agent-pipeline --scope project
```

`--scope project` keeps the binding with the repository rather than with one
developer's user profile. Confirm the installation with `claude plugin list
--json`. To update a Claude Code binding later, update the marketplace, update
the same project-scoped plugin, then reload the running host session:

```sh
claude plugin marketplace update agent-pipeline
claude plugin update pipeline-core@agent-pipeline --scope project
/reload-plugins
```

For a non-Claude runtime, do not copy these commands or claim that its hooks
are installed. Use that runtime's supported integration, then follow the
methodology and manual controls described in the runtime-boundary document.

### 1a. Bind or refresh the plugin in Codex

Codex uses its own marketplace and install commands. Add the approved Git
source once, refresh its snapshot when the approved ref advances, and install
the plugin from the marketplace name declared by that source:

```sh
codex plugin marketplace add <owner>/<pipeline-repo> --ref <approved-ref>
codex plugin marketplace upgrade agent-pipeline
codex plugin add pipeline-core@agent-pipeline
codex plugin list --marketplace agent-pipeline --json
```

The final command must report exactly one installed and enabled
`pipeline-core@agent-pipeline`. A Git marketplace snapshot is not the running
plugin: start a new Codex thread after installation or refresh so the host
loads that exact version. Do not hand-edit Codex marketplace or cache files.

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

### 2. Add the small, committed project calibration

Copy and adapt these templates in the project repository:

```sh
cp <pipeline-source>/templates/pipeline.json.example .claude/pipeline.json
cp <pipeline-source>/templates/CLAUDE.project.md CLAUDE.md
```

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

## Where to go next

- [README](README.md) — why the pipeline exists and its core capabilities.
- [PIPELINE_FLOW.md](PIPELINE_FLOW.md) — the maintained V3 flow and boundaries.
- [Operating Model](docs/operating-model.md) — normative roles, gates, and
  lifecycle rules.
- [Runtime boundary](docs/runtime-boundary.md) — what is enforced on Claude
  Code and what remains manual elsewhere.
- [Documentation map](docs/README.md) — focused reference links.
