# D183 recon: a generated briefing reaches the dispatch by file reference

Status: read-only recon by the Elephant, 2026-10-29, after the install of `192703ba5`. No code changed. Decision D183 (PO, option a): the prompt carries the generator marker plus `pipeline-briefing-file: <repo-relative path> sha256=<digest>`; `guard-dispatch.mjs` reads the file, verifies the digest against the generator marker and hands the Goldfish exactly those bytes; Codex and Antigravity need their own carrier check. Item: `backlog/items/2026-10-26-briefing-dispatch-needs-hand-retyping.md`.

## What the guard does with the prompt today

`hooks/guard-dispatch.mjs` extracts `dispatch.prompt` once per dispatch (direct `Task`/`Agent`, Workflow scripts through `extractWorkflowDispatches`, Antigravity `Subagents`, Codex `spawn_agent` message) and then passes the same string to about a dozen consumers: the briefing route record (`evaluateBriefingRoute`, `record`), the write-scope overlap check, the second-writer check, `generatedBriefingAdmission(prompt, ..., { requireGenerated: true })` (line ~911), `parseNativeGoldfishBriefing`, `prepareGovernedItemQueue` (line ~925) and the native host preparation. So there is ONE natural seam: right after the dispatches are extracted and before the first consumer, replace each pointer prompt by the file text in memory. Every later check then judges the real briefing and none of them needs to learn the pointer form.

## The part that cannot be settled by reading

The Goldfish must RECEIVE the file bytes. The guard can read and verify them, but a PreToolUse hook only changes what the child receives if the runner accepts a hook-supplied replacement of the tool input (`hookSpecificOutput.updatedInput` for Claude Code). Nothing in this plugin uses it today (`guard-dispatch-budget.mjs` uses `additionalContext` only), so it is unproven on this runner for the `Agent` tool, and for `Task`, `Workflow` scripts, Codex `spawn_agent` and Antigravity `invoke_subagent` it is a separate question each. Three outcomes decide the shape of the patch:

1. `updatedInput` is honoured for `Agent` on Claude: the pointer prompt is rewritten to the verified file text; the Elephant dispatches a ten-line prompt; the child sees the full briefing. This is option a as decided.
2. It is NOT honoured: the guard can still verify and admit the pointer (the file is the evidence), but the child receives only the pointer, so the briefing would have to tell the child to read the file first. The native host binding (`<!-- pipeline-native-goldfish-host-commit:v3 ... -->`) is parsed from the prompt by the SubagentStart/PostToolUse side, so the pointer prompt would have to carry the binding block too, which is most of the retyping the item wants to remove. Then option b of the item (a verify-prompt route) is the honest fallback.
3. Honoured on Claude only: Codex and Antigravity keep the full-text carrier and the pointer is Claude-only until their carrier check exists (the decision already says they need their own).

## Cheapest proof before any kernel patch

A throwaway PreToolUse hook is a kernel-adjacent act, so the probe should not edit `guard-dispatch.mjs`. A scratch hook script registered only in a scratch project (or through a session-local hooks override) that answers an `Agent` dispatch with `updatedInput` containing a changed prompt, followed by a read-only dispatch whose first output line echoes the prompt it received, answers outcome 1 versus 2 in one dispatch. That is a PO-attended live check (the runner must load the hook), not a unit test.

## Patch shape if outcome 1

- New pure module `lib/briefing-file-reference.mjs` (not a protected path): `parseBriefingFileReference(prompt)` and `loadReferencedBriefing({ root, prompt, readFile })` with refusals `DBG-REF-PATH` (repository-relative, under `scratch/`, no `..`, regular file, size bound), `DBG-REF-DIGEST` (file text must verify through `verifyGeneratedBriefing` and its digest must equal the pointer digest) and `DBG-REF-AMBIGUOUS` (pointer plus inline text in one prompt).
- `hooks/guard-dispatch.mjs` (protected kernel path, Guard Maintenance Window): one call at the seam above, plus emitting `updatedInput` for the rewritten prompt.
- The generator's printed `dispatchCall` (already in `buildDispatchBriefing`, commit `dd1fd7373`) switches its prompt line from "the `text` field verbatim" to the pointer line when the route is available.
- Cases: pointer admitted and expanded; wrong digest refused; path outside `scratch/` refused; modified file refused after generation; inline text unchanged; Workflow/Codex/Antigravity prompts with a pointer refused with a typed code until their carrier check exists.

## Row

`pipeline.briefing-dispatch-needs-hand-retyping` stays at 25 until the live probe answers outcome 1 or 2 and the chosen route is built and applied.
