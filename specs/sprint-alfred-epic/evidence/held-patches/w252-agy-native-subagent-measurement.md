# Antigravity native subagent measurement (candidate 20, G20-8 B)

PO 2026-11-07: G20-8 decided as **B** (real native Goldfish subagents under Antigravity). The PO ran the measurement task
`scratch/agy-subagent-measurement-task.md` in a separate agy session against a pipeline-free probe repository and returned
`probe-log/results.md`, `probe-log/README.md` and `probe-log/hook-events.jsonl` (outside this repository; paths below use `<HOME>`).
All nine measurements are reported as observed. This file records what the B design may rely on and what is still open.

## Measured facts the design may rely on

- M1 tool: `invoke_subagent` with required `TypeName`, `Role`, `Prompt`; optional `Model` (`inherit|flash_lite|flash|pro`) and
  `Workspace` (`inherit|branch|share`, description only, no enum). Companion tools `define_subagent`, `manage_subagents`
  (`list|kill|kill_all`), `send_message`. The pipeline-core agent types (`goldfish-implementor`, `goldfish-deep`,
  `goldfish-mechanic`, `critic`, `plan-verifier`, `readiness-reviewer`, `consult-advisor`, `afk-claude-worker`) are listed as
  valid `TypeName` values when the plugin is loaded globally; built-ins are `self`, `research` (read-only sandbox, no network),
  `image-generator`.
- M2/M7: a subagent with `Workspace: inherit` writes the real file system, runs shell commands and can `git commit` with the
  repository's configured identity. Every subagent tool call fires the same `PreToolUse` hook as the parent.
- M3 hook payload, exactly eight keys: `artifactDirectoryPath`, `conversationId`, `lastUserInput`, `modelName`, `stepIdx`,
  `toolCall {name,args}`, `transcriptPath`, `workspacePaths`. A child has its own `conversationId`; there is NO parent field.
  Indicators only: `lastUserInput: ""` and an unknown `conversationId`.
- Host-written parent binding (read in this session, not in results.md): the parent's
  `<HOME>/.gemini/antigravity-cli/brain/<parentId>/.system_generated/subagents/<childId>.json` holds
  `{conversationId, subagentDescriptor {typeName, role}, state ("SUBAGENT_STATE_ALIVE"), spawnStepIndex, workspaceUris}`.
  This is the attestation source for "this hook call comes from a child of session P with type T": the guard resolves the
  child id from the payload and finds exactly one parent descriptor naming it. The descriptor carries no model.
- M5: the subagent runs in the background in parallel; its completion message is stored under the parent's
  `.system_generated/messages/<messageId>.json` (`undelivered/`, `read.json`) and is delivered within the SAME parent turn at the
  next model invocation as a `<SYSTEM_MESSAGE>`. No turn end needed.
- M6: two subagents started in one step run overlapping; hook lines stay separate (own pid, own conversationId).
- M8 model: requested alias is in the parent's `toolCall.args.Model`; the resolved model is in every child payload's
  `modelName` (`inherit` -> parent model, `flash_lite` -> a flash-lite model, `flash` and `pro` -> the SAME flash-tiered model).
  Consequence: `pro` is not a design-tier route on this host build; the dispatch model check must read `modelName`, never trust
  the alias.
- M9: a `PreToolUse` hook answering `{"decision":"deny","reason":...}` with exit 0 blocks the child's call; the child sees
  `tool call denied by pre-tool hook: <reason>` verbatim. The pipeline guard union therefore governs native children unchanged.

## Not yet measured (follow-up M4b, needs a git workspace)

The probe session's workspace was an empty, non-git directory; the probe repository was only reached through absolute paths.
So `Workspace: branch` produced an empty directory under `<HOME>/.gemini/antigravity-cli/worktrees/<parentId>/subagent-...`
(marker file `.jetski-dircopy`), and `Workspace: share` failed with `share workspace not supported for VCS type Unknown`.
Whether `branch`/`share` give a code-writing Goldfish a real isolated git checkout (worktree or copy, which base commit, how
results return) is OPEN. Until measured, B dispatches code writers with `Workspace: inherit` serialized through the shared tree
(the existing shared-tree rule), and only read-only roles in parallel.

## Design consequences for G20-8 B

1. Dispatch: `invoke_subagent` with `TypeName` = the pipeline agent type, `Prompt` = the goldfish-task.md briefing,
   `Model` from the dispatch selection; record the parent's `stepIdx` and the returned `conversationId`.
2. Attestation: in the child's hooks, bind `conversationId` to the parent descriptor file (type + spawn step), and the
   actually resolved `modelName` to the selected model; refuse a mismatch with a typed, self-describing code.
3. Hand-back: the completion message arrives in-turn; the briefing's hand-back block stays the evidence carrier.
4. Isolation: M4b decides whether parallel code writers are possible on Antigravity.
