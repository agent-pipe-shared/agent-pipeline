# W7 D183 briefing file reference: checkpoint (slice 1 of 2), notes

Status: CHECKPOINT. The RED cases and the new pure module are in the patch; the production edits in the kernel file and the generator are NOT yet written. Nothing is committed (host commits). Candidate `4a04bedb7509fcd66b50cefa1441abc4c6fb099a`.

## Design (verified against the clone at the candidate)

- ONE expansion seam: `plugins/pipeline-core/hooks/guard-dispatch.mjs`, in the entrypoint block right after the `dispatches` array is built (the if/else chain ending near line 821) and BEFORE `const codexV2Marker` (line ~823). Every later consumer (briefing route record line ~870, planAdmittedBriefingRoutes ~883, second-writer ~901, write-scope overlap ~905, `generatedBriefingAdmission(..., requireGenerated)` ~911, `parseNativeGoldfishBriefing` ~924/942, `prepareGovernedItemQueue` ~925, `prepareNativeGoldfishHostState` ~1064, which reads `input.tool_input.prompt`) then judges the real briefing in memory.
- At the seam: for each dispatch whose prompt carries a pointer (`carriesBriefingFilePointer`): if `transport !== "direct"` or the tool is not Task/Agent, or a Workflow `script` string contains a line-start `pipeline-briefing-file:`, refuse `DBG-REF-CARRIER` (stderr `BLOCKED (guard-dispatch): DBG-REF-CARRIER: ...`, exit 2). Otherwise `loadReferencedBriefing({ root: routeRoot-equivalent, prompt })`; on `ok:false` refuse with its code; on success set BOTH `dispatch.prompt` and `toolInput.prompt` (the same object as `input.tool_input`) to the file text and remember `expandedInput = { ...toolInput }`.
- Output: just before the final `process.exit(0)` (line ~1102), when a pointer was expanded, write with `writeSync(1, JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", updatedInput: expandedInput } }))` (synchronous so the exit cannot truncate it). Warnings stay on stderr unchanged. The guard writes no stdout today.
- Pointer digest = sha256 of the whole file text (the same value the generator already returns as `sha256`); the marker digest (sha256 of the body) is verified separately by `verifyGeneratedBriefing`. A pointer prompt is exactly: marker line, pointer line `pipeline-briefing-file: <path> sha256=<64 hex>`.
- Generator (not yet done): `buildDispatchBriefing` in `scripts/dispatch-briefing.mjs` (~line 986) adds `dispatchCall.promptPointer = renderPointerPrompt({ text: rendered.text, path: options.out })` when `--out` is given; existing fields stay. The Elephant uses `promptPointer` for a Claude Agent dispatch; `prompt` (full text) remains for Codex/Antigravity/Workflow. `renderPointerPrompt` is already in the new module.

## Other PreToolUse hooks on the same call (hooks.json read)

On `Task|Agent`: guard-dispatch (matcher `Task|Agent|Workflow`), guard-slicing (advisory nudge), guard-dispatch-budget (counting, `additionalContext` only), worktree-count check. None of them emits `updatedInput` today, so guard-dispatch is the only answerer of updatedInput: no conflict found. NOT PROVEN live: (a) whether the runtime merges `additionalContext` from the other hooks with this hook's `updatedInput`, (b) whether the PostToolUse `native-goldfish-host.mjs` (matcher `Task|Agent`) sees the original pointer prompt or the updated input; the pending state is prepared in PreToolUse from the expanded `input`, so it should not depend on it. The probe ran one hook only. This needs a PO-attended live check after install.

## Done in this slice (patch `w7-d183-briefing-file-reference.patch`, 2 files)

- New `plugins/pipeline-core/lib/briefing-file-reference.mjs`: `carriesBriefingFilePointer`, `parseBriefingFileReference`, `loadReferencedBriefing`, `renderPointerPrompt`; codes DBG-REF-PATH (relative, under scratch/, no `..`, regular file, <=262144 bytes, read errors), DBG-REF-DIGEST, DBG-REF-AMBIGUOUS.
- `guard-dispatch.test.mjs`: six cases GD75..GD80 added (corpus count 75 -> 81), using `generatedItemFixture()`, `generatedDispatch()`, `sharedRefusalFixture()` and the real generator.

## RED (against candidate production code, clone, log `scratch/agent-out/w7d183/red.guard-dispatch.test.mjs.log`)

Exit 1. Failing: pointer admitted+expanded; wrong digest / modified file; path outside scratch / `..` / absolute / missing; pointer plus inline text; Workflow+Codex+Antigravity carrier. Passing as expected: the inline full text unchanged case. (The reporter prints each case with its id shifted by one in the title prefix; the case ids in the source are GD75..GD80.)

## NOT done (remaining for slice 2)

1. Production edits in `guard-dispatch.mjs` (seam, DBG-REF-CARRIER, updatedInput output; import `writeSync`).
2. Generator `promptPointer` (+ a case in `dispatch-briefing.test.mjs`: printed pointer, its digest equals the file's sha256; the existing `/verbatim/` assertion stays).
3. GREEN run, whole-suite runs of the touched suites in clone and clone2 with failing-name comparison, `generate-architecture-overview.mjs --check` (the new module may need a map/inventory entry: do only what it demands), the revert proof, apply check in clone2 (`git apply --check`), driver cleanup (delete the clones). The Antigravity case in GD80 may need its payload adjusted (model check runs before the seam).
4. The pure module has no direct unit cases yet beyond the hook-level ones.

## Operator flow (after slice 2)

`guard-dispatch.mjs` is a never-liftable kernel path: the PO applies the patch under a Guard Maintenance Window (apply-diff, `git add -u` with a path limit plus the new file, commit as the PO under the window, stamp, install), then runs a live check of the pointer dispatch. An independent Critic review stays a parent-owned batch gate.

Proposed commit message: "feat(dispatch): accept a pointer to the generated briefing file and hand the Goldfish exactly the verified file bytes"

Driver: `scratch/agent-out/w7d183/driver.mjs` (modes setup, run, patch, check, revert, cleanup); the clones `clone` and `clone2` still exist there for slice 2 and must be deleted with `cleanup` at the end.

## Slice 2a (production seam in the dispatch guard)

Changed in `plugins/pipeline-core/hooks/guard-dispatch.mjs` (clone, via anchored scratch script; +29/-2 lines):
- import line: `writeSync` added to the `node:fs` import; new import of `carriesBriefingFilePointer`, `loadReferencedBriefing` from `../lib/briefing-file-reference.mjs`.
- Seam right before `const codexV2Marker`: for each dispatch whose prompt carries a pointer (or when a Workflow script carries a `pipeline-briefing-file: <path> sha256=` text), refuse `DBG-REF-CARRIER` (stderr `BLOCKED (guard-dispatch): DBG-REF-CARRIER: ...`, exit 2) when transport is not `direct`, the tool is not Task/Agent, or the Workflow script carries a pointer; else `loadReferencedBriefing` with the same root expression the guard uses for `routeRoot`; refuse with the module code on `ok:false`; on success set `dispatch.prompt` and `toolInput.prompt` to the file text and keep `expandedInput = { ...toolInput }`.
- Output: before the final `process.exit(0)` of the admitted path, `writeSync(1, JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", updatedInput: expandedInput } }))` when a pointer was expanded.

Deviation from the design text: the Workflow check matches `pipeline-briefing-file: \S+ sha256=` anywhere in the raw script, not only at a line start, because a pointer inside a JS string literal is written with an escaped newline and never sits at a real line start in the script text.

Test change (justified, D183): GD80 Antigravity payload `Model: "sonnet"` changed to `Model: "flash"`. The Antigravity model check (DISPATCH-MODEL-UNROUTED) runs before the seam, so the case was refused for the model, not for the carrier; the payload now reaches the seam. The assertion (exit 2, DBG-REF-CARRIER) is unchanged, nothing weakened.

RED to GREEN: log `g1.guard-dispatch.test.mjs.log` (first run after the seam): 80 of 81 green, only GD80 red for the model reason above; log `g2.guard-dispatch.test.mjs.log`: `ℹ tests 81 / ℹ pass 81 / ℹ fail 0`, exit 0. GD75..GD79 green in g1 already (the reporter prints ids shifted by one).
Baseline clone2 (plain candidate), log `base2.guard-dispatch.test.mjs.log`: `ℹ tests 75 / ℹ pass 75 / ℹ fail 0`, exit 0. Failing-name sets: clone none, clone2 none.
Patch regenerated with driver `patch` (3 files, 171 insertions, 2 deletions, 15902 bytes); driver `check` (apply on the plain candidate): `apply-check exit 0`. The patch is written directly into the held-patch path by the driver (no separate install step).

NOT done: generator `promptPointer` and its case in `dispatch-briefing.test.mjs`; `generate-architecture-overview.mjs --check` and any map entry the new module demands; the revert proof; driver `cleanup`; the live PO check of updatedInput merging (see above).

Continuation card: done = pure module, six cases GD75..GD80, guard seam, output; remaining = generator slice, architecture check, revert proof (`driver revert`), cleanup; next step = slice 2b in the same clones, starting with `scripts/dispatch-briefing.mjs` (`buildDispatchBriefing`) plus a case in `dispatch-briefing.test.mjs` (the driver PROD list and the allowed-files list in the patch need those two files then).
