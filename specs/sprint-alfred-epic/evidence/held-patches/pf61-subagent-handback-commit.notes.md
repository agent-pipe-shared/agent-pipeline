# Held patch: pf61-subagent-handback-commit (PF-61, AC-142)

Slice W4-PF61-SUBAGENT-HANDBACK-C3-20261026 (continuation of C2). Patch: `pf61-subagent-handback-commit.patch`
(19507 bytes, sha256 `250bbf471767d865e7a2640a9ae24c3ec4f1bdddfacc051bbc09b5c86e72cf3b`). Built in a real shared clone
(never a symlinked tree) at repository HEAD `27dac4ed784952fe2a55ad209acfc7658680a7ac`, which already contains the pin-file
repair commit `f09687003`; the patch is the plain clone diff against that HEAD.

## Problem

The current Claude runtime ends a background child with a tool call `SubagentHandback` whose input is
`{"message": "<contract>"}`. SubagentStop then has no usable `last_assistant_message`, `observeClaudeSubagentStop` validates
only that field, so the host commit never happens, and the refusal message goes to stderr, which SubagentStop never surfaces.

## Change (touches two files)

- `plugins/pipeline-core/lib/native-goldfish-host-finalizer.mjs`
  - When `last_assistant_message` is absent or does not validate, read the child's own transcript
    `<transcript_path without .jsonl>/subagents/agent-<agent_id>.jsonl` and take the message of the LAST `SubagentHandback`
    tool_use of the LAST assistant record. It is validated by the same `validateNativeGoldfishFinal` against the same binding.
  - A valid `last_assistant_message` keeps working unchanged.
  - Diagnostic: when a marked Goldfish's stop read a transcript (or found it unsafe) and the completion did not succeed, a
    small `stop-failure-<hash>.json` (schema `pipeline.native-goldfish-host-stop-failure.v1`: dispatchId, toolUseId, status,
    code, commit, observedAt) is written under `<git common dir>/agent-pipeline/run/native-goldfish-host-commit/` next to the
    pending state. A later success removes it. Faults while writing are swallowed; the hook stays non-blocking.
- `plugins/pipeline-core/lib/pins/claude-background-goldfish-is-host-committed-at-subagent-stop.test.mjs`
  - the stop-hook helper accepts a transcript fixture; new cases (viii)-(xii) mirror the real runtime (handback commit once,
    invalid/foreign handback refused, earlier handback followed by a later record refused, unparsable/oversized/symlinked or
    escaping transcript refused, diagnostic named). No existing case was weakened.

## Preimages (SHA-256 at HEAD `27dac4ed`)

- `plugins/pipeline-core/lib/native-goldfish-host-finalizer.mjs`: `055950327a9dfa0ce0825f0f2160dccc1afaf156618c50934885f8d239eda608`
- `plugins/pipeline-core/lib/pins/claude-background-goldfish-is-host-committed-at-subagent-stop.test.mjs`: `16fa44b75f27eb28c07ccdd6bae8d2e6dec4a260bdd85b61a16a247e86d3a2fe`

## Results (in the clone; driver `scratch/agent-out/w4-pf61/driver.mjs`, outputs beside it)

- Before (unmodified finalizer, new cases added): new cases RED 0 pass / 5 fail; whole pin 12 tests, 7 pass, 5 fail.
- After: new cases 5/5 pass; whole pin 12/12; `native-goldfish-host-finalizer.test.mjs` +
  `native-goldfish-host-finalizer-regression.test.mjs` + `native-goldfish-host-return.test.mjs` 24/24 (24/24 before too,
  including NGHF08). No `hooks/native-goldfish-host*.test.mjs` file exists to run.
- `git apply --check` against repository HEAD: exit 0.
- Fix rounds: one (an earlier handback followed by a later assistant record initially produced no diagnostic; a readable
  transcript without a final handback now marks the stop as transcript-based).

## Safety

Only the LAST `SubagentHandback` of the child's own last assistant record is read; no other record is accepted. Same validator
and binding as any final. Read is bounded to 8 MiB, refuses a symlink (lstat + O_NOFOLLOW), refuses any path whose real location
differs from the exact `subagents/agent-<id>.jsonl` place, fails closed on a corrupt line, and `agent_id` containing a path
separator is refused.

## Known limitation

A stop with neither a valid message nor a readable transcript/handback leaves no persisted diagnostic, because NGHF08 pins that
a plain refusal writes nothing to the Git directory. Only stops that actually read a transcript persist one.

## Overlap

Finalizer only. `p0-session-cleanup-lock-recovery.patch` touches `native-goldfish-host-state.mjs`, not these files. The
diagnostic directory reuses the existing `native-goldfish-host-commit` run directory without changing the state module.

## Proposed commit message

```
fix(native-goldfish): host-commit a background Goldfish whose contract arrives as a SubagentHandback

SubagentStop carries no usable last_assistant_message for a SubagentHandback child, so the
contract was never validated and no host commit happened. Read the child's own last
SubagentHandback from its bounded, non-symlink transcript beside the meta file, validate it
with the same validator and binding, and persist a named stop-failure diagnostic next to the
pending state when a transcript-based completion fails. PF-61, AC-142.
```
