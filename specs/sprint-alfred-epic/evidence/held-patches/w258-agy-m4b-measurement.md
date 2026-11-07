# Antigravity M4b measurement: findings that bind the native Goldfish route (2026-11-07)

Source: the PO-run measurement session 894735b5 in the probe repository (results-m4b.md and hook-events.jsonl in the probe repository's
probe-log/, outside this repository). Model of the measuring session: gemini-4-argon-medium.

## Measured

1. `Workspace: "branch"` AND `Workspace: "share"` in a Git workspace both create a REAL `git worktree` of the same repository at
   `<home>/.gemini/antigravity-cli/worktrees/<parentConversationId>/subagent-<Role>-<TypeName>-<hash>` on a NEW branch
   `subagent-<Role>-<TypeName>-<hash>` cut from the parent's current committed HEAD. Its `.git` is a file pointing to
   `<repo>/.git/worktrees/<name>`. No `.jetski-dircopy`. (Outside Git: `branch` falls back to a directory copy, `share` refuses with
   "share workspace not supported for VCS type Unknown".)
2. Uncommitted changes of the parent tree are NOT in the child worktree (it starts at committed HEAD).
3. A child's commit lands at once in the shared object database: `git cat-file -t <sha>` in the main repository prints `commit`; the
   child branch is visible in `git branch -a` / `git log --all` with no fetch. Nothing is merged, copied or patched back automatically;
   the parent receives only a text message (`<SYSTEM_MESSAGE>` with the child's send_message text).
4. Two code-writing children started in one step with `Workspace: "branch"` got separate worktrees and branches, committed overlapping
   in time, no index.lock conflict, no interleaved hook lines.
5. A child's hook payload `workspacePaths` is `[<its worktree>, <the parent repository>]` — the worktree FIRST. In the probe both
   directories carried `.agents/hooks.json`, so every hook fired TWICE per child tool call (once per workspace). Whether a
   Pipeline install (global hooks) fires once is not measured.
6. The descriptor `<brain>/<parent>/.system_generated/subagents/<child>.json` keeps `"state":"SUBAGENT_STATE_ALIVE"` after the child
   finished its task (it stays alive for further send_message work). Live running/idle is visible only through
   `manage_subagents` (`Action: "list"`: `state` running with `stateDetail` <tool>, or idle). A killed or failed child's state is not
   measured.
7. EPHEMERAL_MESSAGE (the PreInvocation hook's injected context) is NOT kept in the model context after the model call it was injected
   for; the hook fired before nearly every model call (8 times in 5 turns), each time a new ephemeral copy. (This run used the installed
   plugin WITHOUT the G20-33 fix.)

## Consequences for the w255 code (lib/agy-native-goldfish.mjs), fixed by w258

- `AGY-NATIVE-CODE-WRITER-ALIVE` counted descriptors in state ALIVE; finished children stay ALIVE, so after the first code-writing child
  every later one in the session would have been refused for good.
- `PROTECTED_HOST_PATH` matched `/.gemini/antigravity-cli/` as a whole, including `worktrees/`: every write a `branch` child makes in its
  own worktree would have been refused as AGY-NATIVE-BRAIN-WRITE.
- The shared-tree serialization is replaced by measured isolation: code writers use `Workspace: "branch"`, parallel allowed.
- The child's guard root: `workspacePaths[0]` is the child worktree outside the project. With the old adapter a child in a real
  worktree was allowed everything, including a push of main (measured by the w258 Goldfish); w258 governs it as the registered
  repository and confines its writes to its own worktree.

## Still open (PO measurement task scratch/agy-subagent-measurement-m4c.md)

M10 modelName spelling, M11 killed/failed child state, M12 descriptor timing, M13 parent artifactDirectoryPath, M14 a hook at a child's
end; single vs double hook firing with the installed (global) Pipeline hooks; a real branch child committing and the Elephant taking it
over through `agy-native-integrate.mjs` and the host-commit recovery.
