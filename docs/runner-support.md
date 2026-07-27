# Nova runner support boundaries

This document states Nova's runner boundaries; it is not a general product
compatibility promise. Every execution or completion claim remains bound to
the exact candidate and its required evidence.

| Runner | Nova boundary | Not claimed |
| --- | --- | --- |
| Codex | The runner-native continuation contract may project and read back one generation-bound native goal. | Background supervision, hidden input channels, automatic unblock or a broader execution capability. |
| Claude Code | The same bounded continuation contract has its own adapter and conformance coverage. | A claim that another runner's evidence proves Claude behavior. |
| Antigravity | An `alpha-documentation-only` third-runner descriptor identifies Gemini as its model family and fails selection closed. | AGY discovery, installation, authentication, network access, invocation or an advertised execution capability. |

The Antigravity Alpha boundary is deliberately not direct AGY delivery. That
work remains the separately tracked `#69` scope with `sprint:NONE`.

Runner evidence and platform evidence are independent. In particular, the
synthetic macOS contract suite does not claim native macOS support for any
runner.
