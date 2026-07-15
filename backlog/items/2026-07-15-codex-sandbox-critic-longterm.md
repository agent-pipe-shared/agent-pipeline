---
type: defect
status: deferred
created: 2026-07-15
source: bounded Codex sandbox-Critic acceptance and local diagnostics
---

# Resume Codex sandbox-Critic hardening after v0.3

## Problem

The permission-profile preflight protected the public fixture and canaries,
but Codex CLI `0.144.4` emitted only `thread.started` and `turn.started` before
the bounded final review stalled without a verdict. This research remains
valuable but is not the v0.3 normal-review path.

## Preserved scope

The coordinator retains the exact sandbox history, its WIP state, a local
offline bundle, and sanitized trace metadata. Raw diagnostics remain local and
must never enter a public receipt or repository.

## Re-entry triggers

Resume only when at least one condition is evidenced:

1. Codex exposes stable structured lifecycle, retry, and tool telemetry;
2. a separately approved outer OS-isolation adapter is available; or
3. a newer Codex CLI fixes the reproduced post-turn stall and a bounded
   capability probe demonstrates it without another blind retry.

Before any new live run, close the known stdin-backpressure, diagnostic-mode,
and pre-child cause-classification findings in the archived lane. Until then,
make no sandbox, `--bare`, isolation, or Codex-conformance claim.

## Disposition

- Priority: post-v0.3 long-term hardening
- Current v0.3 replacement: normal native-host Critic, explicitly non-isolated
- Remote write or release authority: none
