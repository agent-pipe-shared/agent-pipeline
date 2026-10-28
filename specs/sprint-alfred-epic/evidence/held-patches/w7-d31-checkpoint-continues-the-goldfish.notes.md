# D31/D32: a budget checkpoint does not stop the Goldfish while a grant remains (W7-D31-CHECKPOINT-CONTINUES-THE-GOLDFISH-C1-20261027)

Candidate: 7787d504e9586a8a9c44182c338326ca44094420. Status: targeted delivery green (after one budget grant, continued once). Critic, Full Verify, native qualification and PO acceptance stay parent-owned and pending.

## Cause and change
Before: the SubagentStop hook (`hooks/native-goldfish-host.mjs`) never blocked; a `checkpoint` return ended the child (finalizer lines 302-306 return `checkpoint-recorded` / `NGHF-CHECKPOINT-RESERVATION-LIVE`, unchanged).
Now (patch, 2 files): new exported `nativeGoldfishCheckpointBlock({commonDir,input,runner,result})` in the hook. It returns `{decision:"block",reason}` only for runner claude + SubagentStop + `checkpoint-recorded` + `stop_hook_active !== true` + valid `agent_id` + a verifying grant record with an unspent grant. One block per recorded grant, counted in `grants/<agentId>.continued` beside the grant record. The direct-invocation block prints the JSON on stdout and exits 0; every fault reads as no block. The old "never blocks" comment is rewritten to the narrowed rule. The finalizer is unchanged (NGHF17/18 assertions stay true); the slice row and reservation are untouched (cancel stays the Elephant's only option, `slice-queue cancel --started --class budget`). Codex path unchanged.

## Where the grant lives (PO sets the headroom here)
`<git common dir>/agent-pipeline/dispatch-budget/grants/<agentId>.json` (digest-chained, `lib/dispatch-budget-core.mjs` `appendGrant`/`describeGrantRecord`; `extra` per entry, max 40; orchestrator writes it via `grantWorkingCalls` in `hooks/guard-dispatch-budget.mjs`). `native-goldfish-host-state.mjs` has no grant code. The headroom figure is a PO decision and is not touched. Design choice to confirm: number of continuation blocks = number of recorded grants.

## RED / GREEN
Cases NGHF20-NGHF25 added to `lib/native-goldfish-host-finalizer.test.mjs` (hook spawned as a real process; no hook-level test file existed). RED against the unchanged hook: NGHF20 failed (`SyntaxError: Unexpected end of JSON input`, empty stdout; log `scratch/agent-out/w7cb/red.*.log`, run stops at the first failure so NGHF21-25 were not individually reached). GREEN in clone: finalizer `tests 27, pass 27, fail 0`; native-goldfish-host-state `tests 58, pass 58, fail 0`. Baseline clone2 (unchanged): finalizer 21/21, state 58/58. Failing-name sets: empty in both; the only difference is the six new passing cases. Caveat: NGHF21-24 assert absence of output, so they would also pass if the hook exited early at its governance gate; NGHF20 (block JSON) and NGHF22 (stderr message) prove the hook runs. NGHF25 uses the pending-state snapshot as proxy for "slice stays started" (fixture is not item-governed). Apply check at the candidate in clone2: exit 0.

## NOT done
Grant headroom figure (PO); native qualification on a real background Goldfish (confirm Claude Code honours the SubagentStop block decision for a background subagent); independent Critic; Full Verify.

## Proposed commit message
feat(goldfish): a budget checkpoint does not stop the Goldfish while a grant remains; the slice stays started and the Elephant may only cancel (D31/D32)

## Operator flow
Apply the patch, `git add -u` limited to `plugins/pipeline-core/hooks/native-goldfish-host.mjs` and `plugins/pipeline-core/lib/native-goldfish-host-finalizer.test.mjs`, `--no-verify` commit, stamp, install. Protected-path classification: neither file matches TP-1..TP-13; nothing under plugins/ was edited in the repository (clone only).
