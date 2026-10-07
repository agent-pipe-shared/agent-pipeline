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

## Claude Desktop app

Local Desktop sessions on a Windows path share settings, user-scope plugins,
hooks and skills with the CLI. The pipeline's end-to-end behaviour there is not
yet verified; the open acceptance check is tracked in
`backlog/items/2026-10-07-desktop-app-support-is-unverified.md`.

- **Desktop WSL sessions load no plugins, so no pipeline guard runs. Do not use them for a governed repository.**
- Desktop does not load PowerShell profiles; only user/system environment variables or settings `env` apply.
- PO/human commands (signing, `!`-prefixed commands) run in the integrated or an external terminal.
