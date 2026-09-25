# Runner support and evidence boundaries

For a repository using Agent-Pipeline, runner integration does not imply that
every host has identical native enforcement or that one runner's test result
proves another runner works. Check the installed runner and the relevant
evidence for the exact candidate before treating execution or completion as
verified. See [SETUP.md](../SETUP.md) for installation and
[runtime-boundary.md](runtime-boundary.md) for guard coverage.

| Runner | Supported boundary | Not claimed |
| --- | --- | --- |
| Codex | The runner-native continuation contract may project and read back one generation-bound native goal. | Background supervision, hidden input channels, automatic unblock or a broader execution capability. |
| Claude Code | The same bounded continuation contract has its own adapter and conformance coverage. | A claim that another runner's evidence proves Claude behavior. |
| Antigravity | Workspace-local native plugin binding, hook mapping, and tested continuation contracts. Confirm the installed host and its hook readback for the actual workspace. | Global marketplace publishing, automatic global network discovery, or proof of live enforcement merely from Codex/Claude tests. A headless implementation return alone is not commit authorship evidence. |

Runner evidence and platform evidence are independent. In particular, the
synthetic macOS contract suite does not claim native macOS support for any
runner.
