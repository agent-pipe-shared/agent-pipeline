# Native slicing delivery observation — 2026-09-08

## Scope and source basis

This is a sanitized status receipt for the native slicing adapters. It records
only bounded configuration and lifecycle facts; it contains no session ID,
state hash, private host path, prompt, or transcript content.

- Claude advisory wiring is recorded at commit
  `2dab5966ee827b390c99546738628a29adf49308`. The configured
  `Task|Agent|Workflow|TodoWrite` registration invokes `guard-slicing.mjs`.
- Codex source registration is `spawn_agent|update_plan` on `PreToolUse`, plus
  `SubagentStart` and `SubagentStop`, all through `codex-slicing-hint.mjs`.
- Antigravity source registration observes `invoke_subagent` at `PreToolUse`
  and delivers a due advisory at `PreInvocation` through
  `antigravity-slicing-hint.mjs`.
- The checked observation found installed/source equality for the Codex hook
  configuration, Codex slicing adapter, and native slicing module.

The source references are
`plugins/pipeline-core/hooks/hooks.json`,
`plugins/pipeline-core/hooks/codex-hooks.json`,
`plugins/pipeline-core/hooks.json`, and
`plugins/pipeline-core/hooks/native-slicing.mjs`. The source suite
`plugins/pipeline-core/hooks/guard-slicing.test.mjs` exercises registration,
deduplication, fan-out reset, malformed input, and storage failure. That suite
is fixture evidence, not live host-delivery evidence.

## Corrected lifecycle conclusion

The original bounded-state reading could not bind its record to the parent.
The follow-up derived the state-file key from the supplied parent session value
after the adapter's runner prefix and JSON hashing step. That derivation matched
the existing bounded record. One active-child entry therefore proves that a
parent `SubagentStart` lifecycle observation persisted.

This correction supersedes only the earlier parent-binding conclusion. It does
not convert lifecycle persistence into a proof of a `PreToolUse`
`spawn_agent` observation, a due advisory, or model-visible
`additionalContext` delivery. The observed state had no serial-run or
plan-batch evidence that would support any of those claims.

## Status

| Claim | Status | Evidence boundary |
| --- | --- | --- |
| Claude advisory registration | configured | checked-in hook configuration and wiring commit |
| Codex native adapter registration | configured | checked-in Codex hook configuration |
| Antigravity native adapter registration | configured | checked-in Antigravity hook configuration |
| Codex installed/source equality | observed | sanitized bounded observation |
| Parent Codex `SubagentStart` persistence | observed | corrected parent-state-key derivation |
| Codex `PreToolUse` observation | unproven | no bounded event receipt |
| Codex model-visible nudge delivery | unproven | no model-delivery receipt |
| Antigravity model-visible nudge delivery | unproven | no live receipt in this observation |

Correction provenance is retained in the task's sanitized follow-up material;
the public conclusion above intentionally excludes its identifiers and raw
runtime content.
