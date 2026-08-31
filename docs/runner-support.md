# Nova runner support boundaries

This document states Nova's runner boundaries; it is not a general product
compatibility promise. Every execution or completion claim remains bound to
the exact candidate and its required evidence.

| Runner | Nova boundary | Not claimed |
| --- | --- | --- |
| Codex | The runner-native continuation contract may project and read back one generation-bound native goal. | Background supervision, hidden input channels, automatic unblock or a broader execution capability. |
| Claude Code | The same bounded continuation contract has its own adapter and conformance coverage. | A claim that another runner's evidence proves Claude behavior. |
| Antigravity | Native plugin integration, hook mapping, and standard lifecycle continuation equivalence with Codex and Claude. | Global marketplace publishing or automatic global network discovery (handled via Workspace-local plugins.json). |

Runner evidence and platform evidence are independent. In particular, the
synthetic macOS contract suite does not claim native macOS support for any
runner.
