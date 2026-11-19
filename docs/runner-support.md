# Runner support and evidence boundaries

For a repository using Agent-Pipeline, runner integration does not imply that
every host has identical native enforcement or that one runner's test result
proves another runner works. Check the installed runner and the relevant
evidence for the exact candidate before treating execution or completion as
verified. See [SETUP.md](../SETUP.md) for installation and
[runtime-boundary.md](runtime-boundary.md) for guard coverage.

One supported runner is sufficient for a user repository. Install, bootstrap,
and confirm model routing only for the runner actually in use; no account,
installation, or model-catalogue access for the other two is required. Model
routes that this runner cannot use remain explicitly unavailable; their
absence does not make the other runners a bootstrap prerequisite.

| Runner | Supported boundary | Not claimed |
| --- | --- | --- |
| Codex | The runner-native continuation contract may project and read back one generation-bound native goal. | Background supervision, hidden input channels, automatic unblock or a broader execution capability. |
| Claude Code | The same bounded continuation contract has its own adapter and conformance coverage. | A claim that another runner's evidence proves Claude behavior. |
| Antigravity | Workspace-local native plugin binding, hook mapping, and tested continuation contracts. Confirm the installed host and its hook readback for the actual workspace. | Global marketplace publishing, automatic global network discovery, or proof of live enforcement merely from Codex/Claude tests. A headless implementation return alone is not commit authorship evidence. |

Runner evidence and platform evidence are independent. In particular, the
synthetic macOS contract suite does not claim native macOS support for any
runner.

## What differs along the feature path

The path in [usage](usage.md#from-an-idea-to-the-implementation-phase) is the
same on every runner. Only these rows differ, each taken from the plugin's
[happy-path guide](../plugins/pipeline-core/skills/pipeline-start/references/happy-path.md#what-differs-per-runner-only-rows-with-a-source),
which is the source and lists the rest:

| Topic | Claude Code | Codex | Antigravity |
| --- | --- | --- | --- |
| Starting a dispatched worker | the `Agent` tool with the role's agent type | `spawn_agent` after a preparation step (Codex runs no pre-tool hook for it) | `invoke_subagent` after a preparation step for read-only roles |
| Design review observation | the hooks record the reviewing model, and a receipt without that observation is refused at the presentation | the receipt says `unobserved` and is presented | the receipt says `unobserved` and is presented |
| Escalation prompts | no source in the guide | Codex mounts `.git` read-only, so every lifecycle write is escalated; your recorded onboarding consent covers the agent steps up to presenting the design, and the design approval, the push, the release and any guard override are never covered | no source in the guide |
| Close entry | `finish-feature.mjs --one-shot` | `finish-feature.mjs --one-shot` | `finish-feature.mjs --one-shot` |
| Push second gate | the host's classifier (a settings entry) | the runner's own prompt, not measured | the runner's own prompt, not measured |

A row that is missing here has no source; ask instead of assuming. The
Codex sandbox may not be able to start a `node` installed under a version
manager; the start preflight reports `NODE-SANDBOX-UNREACHABLE` with its one-time
remedy, and the onboarding Driver runs its own interpreter for the actions it
spawns.

## Antigravity managed plugin directory and global install contract

Agy keeps a managed copy of an imported plugin in its config directory and
lists it in an import manifest, alongside the path registries. Keep a single
source per scope; a stale managed copy can shadow the registered plugin. The
developer command `install-agy.mjs --refresh` prints its plan, asks for
confirmation (`--yes` only together with `--refresh`), remediates through Agy's
own lifecycle and reads the result back. Restart Agy and read the session lock
for proof; `agy plugin list`, `plugins.json` and the readback are not proof of
what is loaded.

A global install is inert outside opted-in repositories: hooks neither block,
inject instructions nor write there. The exception is the destructive-git
protection, which stays on everywhere.

## Claude Desktop app

Local Desktop sessions on a Windows path share settings, user-scope plugins,
hooks and skills with the CLI. The pipeline's end-to-end behaviour there is not
yet verified; the open acceptance check is tracked in
`backlog/items/2026-10-07-desktop-app-support-is-unverified.md`.

- **Desktop WSL sessions load no plugins, so no pipeline guard runs. Do not use them for a governed repository.**
- Desktop does not load PowerShell profiles; only user/system environment variables or settings `env` apply.
- PO/human commands (signing, `!`-prefixed commands) run in the integrated or an external terminal.
