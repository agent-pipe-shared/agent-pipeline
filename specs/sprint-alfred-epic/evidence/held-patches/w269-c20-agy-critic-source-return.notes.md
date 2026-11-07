# w269: on Antigravity the Critic child's final send_message issues the Source return record; the acknowledgement bridge is no longer the normal route (candidate 20, G20-41, AC-108)

Base: `2de3eecda` (the candidate-20 build chain head, which already carries w268). Built in the slice clone `scratch/agent-out/s-agy`. One held patch (it applies on top of the chain; `apply --check` in the real repository fails until the chain is applied in order).
Closest criterion: AC-108 (PRD and Spec unchanged). PO decision 2026-11-07 "Producer + Bruecke": Claude and Codex first (w268), Antigravity after the M4c measurement (this slice).

STATUS: CHECKPOINT (tool budget). Producer, registration, walk, text and the criterion-bound cases are in the patch (clone commits a2d345b41 and b6d76a748; patch saved at the latter). Two required runs are NOT yet green-confirmed: the Antigravity guard suite (`hooks/antigravity-pretool-guard.test.mjs`, started, still running at hand-back, result unknown) and the WHOLE `session-critic-finalizer.test.mjs` after the refactor (only the four new cases were run after the edit). See "Measured".

## Measured (clone `scratch/agent-out/s-agy`, one suite at a time via the test-in helper)

- RED first, against the original code (before the first production edit): `session-critic-finalizer.test.mjs` 101 tests, 97 pass, 4 fail (the four new G20-41 cases, `TypeError: issueAntigravityCriticReturn is not a function`). Evidence log `scratch/agent-out/w269-red-finalizer.log` (untracked; its header shows the wrapper exit 0 because the helper prints `exit 1` without exiting non-zero; its stdout shows `fail 4`).
- GREEN: finalizer `--name G20-41`: 4/4 (a: issue + bind + finalize `source-issued-origin` + second firing `already-issued` with identical bytes; b: nine silent no-op shapes; c: another runner's packet is never answered; d: type or role named exactly, `critic-helper` is not the Critic).
- GREEN: `scripts/close-path-e2e.test.mjs`: tests 1, pass 1, fail 0, with FOUR walks (claude stop hook, codex stop hook, antigravity through the real PreToolUse hook twice, and the shorter antigravity acknowledgement walk that ends at the admitted `feature-close-prepared`). Run before the last comment-only edit of the file header.
- GREEN: `lib/pins/three-runner-happy-path-with-two-po-approvals.test.mjs` 28 tests, 27 pass, 1 skipped (the E-HOLD case, unchanged).
- GREEN: `lib/guard-maintenance-window-kernel-closure.test.mjs` 1/1 (GMWKC01; no list or threat-model change was needed).
- GREEN: `node --test specs/sprint-alfred-epic/evidence/held-patches/w269-c20-agy-critic-source-return.check.test.mjs` 1/1.
- NOT CONFIRMED: `hooks/antigravity-pretool-guard.test.mjs` (result pending at hand-back); whole `scripts/session-critic-finalizer.test.mjs` unfiltered (expect 101/101); re-run of the walk on the final comment-only state; `hooks/hooks-manifest-shape.test.mjs` and `install-agy.test.mjs` (read: neither pins the matcher string; `install-agy.test.mjs` checks that the shipped matcher still matches the old tool names, which the added `|send_message` keeps true).

Also disclosed: `decodeNativeInvokeArgs` is applied to the `send_message` args although only `invoke_subagent` args were measured JSON-string-encoded (harmless for an object-shaped Message). The e2e walk branch was written after the implementation; the criterion-bound RED cases are the finalizer ones. `plugins/pipeline-core/hooks.json` is a changed file the briefing did not enumerate (the matcher must name `send_message` or the hook never fires).

## What the patch changes

1. PRODUCER (hook). `hooks/antigravity-pretool-guard.mjs`: new export `issueAntigravityCriticReturn(input, attributed)`, called from `runAntigravityPreToolGuard` right after the native-child evaluation. It issues `pipeline.session-critic-source-return.v1` when ALL of these runner-written facts hold, and is a silent no-op otherwise (it never calls `deny`, never changes the allow decision, writes one stderr diagnostic line when it was applicable but issued nothing):
   - the tool call is `send_message`;
   - the payload's own `conversationId` is a child: the host wrote `<brain>/<parent conversationId>/.system_generated/subagents/<conversationId>.json` (`evaluateNativeChildCall` / `bindNativeChild`, unchanged), and the payload's `artifactDirectoryPath` ends in that same conversation id;
   - the descriptor's `typeName` (plugin namespace stripped) or `role` is exactly `critic` (case-insensitive; `critic-helper` is not the Critic). The descriptor is the host's record of the parent's dispatch, not a value in the message;
   - `Recipient` equals the parent conversation id the DESCRIPTOR names (not a value the Message supplies);
   - the Message carries the schema-shaped verdict as its whole text or its last fenced json block (`extractCriticVerdict`, the same extractor the Claude/Codex stop path uses).
   Binding to the packet is unchanged from w268: the ONE packet of runner `antigravity` that is claimed, admitted, inside its review window and has no result; `verdictSha256` is the digest of the returned verdict. The record is created exclusively (`wx`), so the second firing finds it and does nothing (idempotent); zero or several open packets issue nothing.
2. SHARED MODULE. `lib/critic-source-return.mjs`: the control-area half of `issueCriticSourceReturn` is split out and shared; new export `issueCriticSourceReturnFromMessage({ commonDir, runner: "antigravity", text })`. NO new import (the module is a never-liftable kernel path; the Antigravity hook is not, so GMWKC01 needs no list change). `issueCriticSourceReturn` (SubagentStop, Claude/Codex) behaves exactly as before.
3. REGISTRATION. `plugins/pipeline-core/hooks.json`: `send_message` added to the PreToolUse matcher. Without it the hook never sees the Critic's final call. REASONED, NOT MEASURED: the M4c probe registered its own hooks, so that `send_message` passes PreToolUse under the Pipeline's own manifest was not observed.
4. WALK. `scripts/close-path-e2e.test.mjs`: the antigravity identity issues the record by running the real hook as a child process with a fixture PreToolUse payload shaped like the measured one (child conversation id, `artifactDirectoryPath` = `<brain>/<child id>`, `modelName`, `stepIdx`, `toolCall {name: send_message, args {Message, Recipient}}`, `transcriptPath`, `workspacePaths`; a host-written descriptor under the parent's brain directory), twice (the hook fires twice per call), then finalizes `source-issued-origin` and the close is admitted without the acknowledgement. The acknowledgement walk (refusal naming the command, wrong packet refused, still refused, acknowledge, identical close admitted) is kept as its own case for a runner whose send_message issued nothing.
5. TEXT. The honest-limit comment in `lib/pins/three-runner-happy-path-with-two-po-approvals.test.mjs` and `skills/critic-review/SKILL.md` now say that Antigravity issues the record from the Critic child's final `send_message`; the bridge remains for any runner or stop that issued nothing.
6. TESTS (written first, RED against the original code, then GREEN): `scripts/session-critic-finalizer.test.mjs` G20-41 (a)-(d).

## How the child is recognised (no value the calling agent supplies is trusted)

Measured fields (M4c): a child's payload carries its own `conversationId` and an `artifactDirectoryPath` of `<brain>/<its conversationId>`; the host writes the descriptor `{conversationId, subagentDescriptor {typeName, role}, state, spawnStepIndex, workspaceUris}` ~13 s before the child's first hook call; a finished child's state stays ALIVE. The parent never writes the descriptor (the hook already refuses an agent write below the brain directory, `nativeBrainWriteRefusal`). A non-Critic child, a conversation with no descriptor (including the parent itself), a Recipient that is not the descriptor's parent, a message without a schema-shaped verdict and any other tool are a silent no-op.

## Not changed

`lib/path-spelling.mjs` and the separator-sweep sites; the Stop event of Antigravity (whether it fires for a child is UNKNOWN, so nothing is built on it); the acknowledgement bridge itself (kind, verb, close gate); `docs/` (no pin demanded an entry, see "Measured"); the closed `featureCloseAudit` record shape.

## Not proven

A real branch-worktree Critic child (the fixture's `workspacePaths` is `[repo, repo]`, so `resolveNativeChildGovernance` never saw a worktree); a real Antigravity run under the Pipeline's own `hooks.json` (the `send_message` matcher is reasoned); a real Critic message shape beyond the fixture (a verdict returned as the whole message or the last fenced json block is what the skill text asks for); the Windows spelling of a real brain path (the code uses `node:path` only; no Windows run); several Critic rounds of one runner open at once (issue nothing, by design); a Critic child killed or failed before it sends (it issues nothing, the bridge applies).
