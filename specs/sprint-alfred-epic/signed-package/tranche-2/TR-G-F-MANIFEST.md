# TR-G-F manifest: dispatch-budget guard fix for T49 and T37 (tranche-2 post-image, guard code, class G)

Dispatch: TR-G-F-20261009. Fixes the RED pins delivered by TR-G-T2 (see `TR-G-MANIFEST.md`). Only a post-image is
produced here; the live hook is never edited by an agent.

## Target

- Install target: `plugins/pipeline-core/hooks/guard-dispatch-budget.mjs` (a protected guard file; the post-image is
  delivered as a signed-package artifact and is installed by the ceremony, never written by an agent to the live path).
- Post-image: `specs/sprint-alfred-epic/signed-package/tranche-2/hooks/guard-dispatch-budget.mjs`
- Post-image sha256: `bad0bd5db55cbc362074f640e77d33dc9c2540a3bc915a0fb4c4fe2142b23d79` (84256 bytes, LF).
- Live file it replaces: sha256 `61e8fc35463a9103336a7730a547680a7c18ab5779ca19ae14c0091c5e2d9cea` (79351 bytes, LF).
- Test post-image it is verified against (read only, unchanged): `hooks/guard-dispatch-budget.test.mjs`, sha256
  `33411458451a7dabd4c067f6b7e94601739ccdd0f7e5fc2e27b6a1325a1b817d` (121431 bytes), the one named in `TR-G-MANIFEST.md`.

The post-image is the live file with 8 anchored edits (each anchor occurs exactly once in the live file; the build
script asserts it and refuses a CRLF input). No other line is changed. The post-image uses the live file's relative
imports, so it works only when installed at the target path above.

## Changes

1. **T49, closing act.** New `isCommitFlowProducerCommand(command, pluginRoot)`; `isClosingAct(input, rootDir, agentType,
   dependencies)` now also answers true for a Bash call that is exactly one `node <script> <args>` (also `node.exe`)
   whose script token (double-quoted, single-quoted or bare) equals `<plugin root>/scripts/goldfish-commit-command-flow.mjs`
   after `\` to `/` normalisation (lower-cased on win32 only), and whose arguments contain none of `; & | < > ` $ ( )`
   or a line break. The plugin root is `resolveAgentPluginRoot(rootDir, dependencies)`, the same resolver the maxTurns
   read and the budget-contract lookup use. `advanceCounter` passes its `dependencies` through. The shared core is
   untouched: a closing act is still counted and the allowance still ends after five counted attempts, so the producer
   can neither renew nor extend it.
2. **T37, text.** `invalidBudgetInputBlocked` hands the reason `DBB-PENDING-BINDING-MISSING` to a new
   `pendingBindingMissingBlocked`: same `DISPATCH-BUDGET-INPUT-INVALID` code and the literal reason, but it says no
   budget was bound to this child, that no counter was written, that there is nothing to repair, and names the action:
   re-dispatch the task as its own Dispatch call. The "persisted counter was left unchanged ... trusted host path"
   sentence is gone for this reason only; every other invalid-input reason keeps its text. Both call sites of the
   reason (the resolve miss and the consume-race miss) run only while the counter file is absent, and the consume-race
   path removes the counter it just created, so the new statement is true at both.
3. **Exhaustion text.** `blocked()` now also lists the producer among the permitted closing acts (appended after the
   numbered list; the "(1) (2) (3)" and Critic "(4)" numbering is unchanged).
4. **Comments.** A header block "TR-G-F behaviour" and the doc comment of `isClosingAct`.

## Chosen T37 cure and why

Cure: **refuse with a message that names the re-dispatch action** (not per-dispatch binding).

- Binding the second child would mean the pending binding is no longer consumed by the first child of the role, or
  is keyed per child. Both contradict pins that stay green: "the first authenticated child call consumes its pending
  binding" (test line 576) and T37 (b) "each pending record is consumed by its own child". Both also require a change
  to `lib/dispatch-budget-binding.mjs` (`consumePendingDispatchBudgetBinding` unlinks the record when no bindings
  remain), outside the one guard file this slice may deliver.
- A bound second child would also have to inherit a cap nobody briefed for it. The refusal keeps the rule that a
  child's cap is the cap its own launch recorded, and it fails closed with an actionable text instead of silently.
- It is the smaller change: one refusal text, no new state, no new admission.

## Verification (WSL, foreground; placeholder spelling)

Build (writes the post-image and the two scratch copies; prints the shas above):

```
node scratch/dispatch-wip/TR-G-F/build.mjs
```

Run (scratch test copy against the scratch guard copy):

```
wsl.exe -e bash -lc "cd <repo-root-under-/mnt>; node plugins/pipeline-core/scripts/capture-evidence.mjs --out evidence/TR-G-F-20261009/green.txt --label TR-G-F -- node --test --test-reporter=spec scratch/dispatch-wip/TR-G-F/guard-dispatch-budget.test.mjs"
```

Wrapped exit code 1 (the known 10 s runner timeouts, below). Artifact: `evidence/TR-G-F-20261009/green.txt` (92 tests, 87 pass,
5 fail). Predecessor red state for comparison: `evidence/TR-G-T2-20261009/red.txt` (92 tests, 86 pass, 6 fail).

Scratch-only relocations (the scratch files sit under `scratch/dispatch-wip/TR-G-F/`, outside the plugin tree; build
scripts and copies are not committed): in the guard copy, every `"../lib/` import re-pointed at the live
`plugins/pipeline-core/lib/`, and the module-relative plugin root `new URL("..", import.meta.url)` re-pointed at the
live `plugins/pipeline-core/` (so a case that runs without an injected plugin root resolves agents from the same place
as the live hook); in the test copy, only `"../lib/governance-scope.mjs"` re-pointed. Nothing else differs. Scratch guard
copy sha256 `e0fb78707d4b8bb4552dfc86d0a8171720e058f7f18cc7439c8ac04caf01b18a`; scratch test copy sha256
`9fc727a47df470dc8e0cd58a01037d3b7322ba6b5f346874afd6b5db34ad3c1f`. The test copy's guard anchor
(`./guard-dispatch-budget.mjs`) is left as is, so it loads the scratch guard copy next to it.

## Per-pin result

| Pin | Before (TR-G-T2) | After (this post-image) |
|---|---|---|
| T49 (a) producer is an admitted closing act after the cap, still counted | RED | GREEN |
| T49 (b) nothing but the named closing acts is admitted (5 refusals stay refusals) | GREEN | GREEN |
| T49 (c) the producer cannot renew the allowance (5 pass, 6th refused, count 11) | RED | GREEN |
| T37 (a) second same-role child under one parent tool id: refusal names re-dispatch | RED | GREEN |
| T37 (b) distinct parent tool ids each resolve their own binding | GREEN | GREEN |
| T57 this guard's own denial shows the budget charge | GREEN | GREEN |
| T34 a governance state change takes effect on the next call (cache invariant) | GREEN | GREEN |

Pre-existing cases, compared with `evidence/TR-G-T2-20261009/red.txt`:

- The three 10 s runner timeouts (orchestrating-session-never-limited, orchestrator-sink-bounded, implementor-cap-40)
  are red as before.
- "a preflight-bound base cap of 20 denies the twenty-first authenticated child work call" is a runner timeout
  (10013 ms, child status null) in the full run and again alone (`evidence/TR-G-F-20261009/rerun-timing.txt`). It is NOT
  caused by this change: the same case run against the UNMODIFIED live guard in the same session times out the same way
  (10016 ms, `evidence/TR-G-F-20261009/control-live-timing.txt`). It passed in the TR-G-T2 run, so it sits at the 10 s bound and
  moved with host load. The same load class as the three accepted timeouts.
- R7-11a (timing-sensitive concurrency case) is red in this run (assertion "the holder released its exact lock inode")
  and red alone; green in the control against the live guard (one sample), green in the TR-G-T2 copy run, red in the
  TR-G-T baseline. The change touches neither the counter lock nor the counter path; reported either way, not claimed
  as unaffected beyond that reading.
- No other pre-existing case changed.

## Boundaries of this evidence

- Verified on WSL (Linux) with the Claude hook shape only. The win32 branch of the script-path comparison (backslash
  normalisation, case folding) is exercised by no case here and is unverified on native Windows; macOS is unverified.
- The producer is admitted only in the spelling `node "<plugin root>/scripts/goldfish-commit-command-flow.mjs" <args>`
  with the absolute plugin root the guard resolves. A relative spelling, an extra node option before the script, or
  parentheses/`$`/redirects in the arguments stay refused.
- This guard is one of the union. Whether `guard-lifecycle-ready` and the other guards admit that same producer call is
  not decided by this post-image and was not checked here.

## Not done here

- The tranche `README.md` is not edited by this dispatch.
- Installing the post-image at the target path is a signed-package step for the PO ceremony, not part of this commit.
- T34 (cache) is not in this slice; its invariant pin stays green.
- Adjacent oddity left untouched: the existing git closing-verb check tests only the start of the command, so a chained
  `git add ... && <other command>` is admitted by this guard (the other guards of the union own that question).
- Independent Critic review (class G, Opus): pending.
