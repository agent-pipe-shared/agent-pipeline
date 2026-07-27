# Prepared Goldfish briefing — CLAUDE-RUNNER-01e: close the product-capability-inventory gap left by (c)

> **Status: READY TO DISPATCH.** (a), (b), (d), (c) all landed and verified.
> The aggregate `node harness/scripts/verify.mjs` gate then surfaced exactly
> one new failing check versus the pre-CLAUDE-RUNNER-01 baseline:
> `product-capability-inventory-tests`. Ruleset SHA: `fceab40` on
> `feat/sprint-cyborg-claude` (2026-07-27).
> **Worktree: no** — run directly in the main checkout.

---

You are a **Goldfish** of the Agent-Pipeline: fresh context, exactly ONE task,
"follow the plan exactly". This briefing and the files listed in field 2 are
your ONLY input. You have no memory and use none; do not read handover/state
files or session history — this briefing replaces them.

First output line (compact bootstrap confirmation):

> Bootstrap check passed: ruleset fceab40 loaded · Project agent-pipeline · Calibration .claude/pipeline.json · State briefing CLAUDE-RUNNER-01e/2026-07-27 · Role Goldfish

---

## Briefing CLAUDE-RUNNER-01e: register the new Claude lifecycle-ready hook surface in the product-capability inventory

### 1. Goal

`plugins/pipeline-core/hooks/hooks.json` now registers `guard-lifecycle-ready.mjs`
directly as a third command in its existing `Edit|Write` PreToolUse matcher
(landed by a prior package, commit `b2202ac`). This repo's own
self-application gate, `harness/scripts/check-product-capability-inventory.mjs`
(HAW-A01), requires `docs/product-capability-inventory.json` to exactly cover
every product surface `discoverSurfaces()` finds on disk — and this new hook
registration is a new surface the document does not yet list. Running
`node --test harness/scripts/check-product-capability-inventory.test.mjs`
today fails at HAW-A02 with: "inventory surfaces do not exactly cover the
discovered current product surface."

Close this gap: add the missing surface and assign it to a capability so the
inventory exactly covers discovery again.

**Diagnosis and the exact fix are not for you to re-derive from scratch** —
run `node -e` (or a short script) to compute the diff between
`discoverSurfaces(root)` and the current `docs/product-capability-inventory.json`
`surfaces` array yourself first, to confirm independently you're looking at
the same gap this briefing describes, then apply the fix below (verify it
lands you at zero remaining diff, don't just trust the prose):

1. **Add one new entry to the `surfaces` array** in
   `docs/product-capability-inventory.json`:
   ```json
   {
     "surfaceId": "hook:plugins/pipeline-core/hooks/hooks.json:PreToolUse:Edit|Write:node \"${CLAUDE_PLUGIN_ROOT}/hooks/guard-lifecycle-ready.mjs\"",
     "kind": "hook",
     "path": "plugins/pipeline-core/hooks/hooks.json",
     "member": "PreToolUse:Edit|Write:node \"${CLAUDE_PLUGIN_ROOT}/hooks/guard-lifecycle-ready.mjs\""
   }
   ```
   Insert it in the existing sorted position (the file's own convention —
   between the `guard-devplan.mjs` and `guard-testpath.mjs` `Edit|Write`
   entries for the same `hooks.json` path; `discoverSurfaces()`'s own sort
   order, byte comparison, is the authority if unsure).

2. **Assign the new `surfaceId` to the `claude-hook-safety` capability**
   (`docs/product-capability-inventory.json`, search for
   `"id": "claude-hook-safety"`). This is the correct home — it already
   covers Claude's other `Edit|Write` PreToolUse write guards
   (`guard-devplan.mjs`, `guard-testpath.mjs`, etc.) with the exact same
   runner disposition this new hook needs (`runners: ["claude"]`,
   `runnerDispositions.claude.status: "supported"`,
   `runnerDispositions.codex.status: "unavailable"` — no disposition change
   needed, only the new surfaceId, in the array's sorted position).
   Do NOT create a new capability and do NOT touch the separate
   `codex-host-hook-bridge` capability (it owns the underlying
   `guard:...guard-lifecycle-ready` script surface for the Codex side; that
   surface is unrelated to this new Claude-side hook-wiring surface and is
   out of scope here).

3. Add `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` to that same
   capability's `productionEvidence` array (sorted position; the file's
   existing convention lists each guard's own `.mjs` file there) and
   `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` to its
   `testEvidence` array (sorted position) — both real, existing files, both
   evidence for this specific hook wiring.

4. You MAY also refine the capability's `benefit` prose to name
   lifecycle-readiness enforcement explicitly (current text: "Configured hook
   families enforce command, write-path, plan, test-path, and push
   safeguards.") — optional, your call, keep it a minimal, accurate edit if
   you do.

Do not touch `sourceBaseline`, `criticReview`, or any other capability entry.

### 2. Context files

- `docs/product-capability-inventory.json` — the file you edit. Read the
  `claude-hook-safety` capability entry and its neighboring `surfaces` array
  entries fully before editing, to match the file's exact conventions (key
  order, sorted-array discipline).
- `harness/scripts/check-product-capability-inventory.mjs` — read
  `discoverSurfaces()` and `validateInventory()` fully to understand exactly
  what "exactly cover" and "sorted, duplicate-free" mean (byte/UTF-8 sort via
  `Buffer.compare`, not locale sort).
- `harness/scripts/check-product-capability-inventory.test.mjs` — the test
  you must make pass; read it to understand what each HAW-A0x check requires
  (do not weaken or edit this test file — it is read-only context, not in
  your scope to modify).
- `plugins/pipeline-core/hooks/hooks.json` — confirm the exact registered
  command string you are adding a surface for (must match byte-for-byte).

### 3. DoD checks

- `node --test harness/scripts/check-product-capability-inventory.test.mjs`
  exits 0 (currently exits 1, failing at HAW-A02 with "do not exactly cover").
- `node harness/scripts/check-product-capability-inventory.mjs` (the CLI,
  default `--phase inventory`) prints `PASS` and exits 0.
- Full regression: also run
  `node harness/scripts/verify.mjs` is NOT required of you (a later,
  dedicated aggregate step) — but do re-run
  `node --test plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`
  and confirm its result is unchanged from before your edit (you are touching
  documentation only, not this test file or its subject) — record the
  pass/fail counts you observe, do not need them to be zero-fail (pre-existing
  Windows-environment failures may still be present; just confirm the count
  didn't change from a `git stash`-based before/after comparison of your own
  diff).
- Machine-written test output is your evidence artifact — never prose you
  compose.

### 4. Forbidden

- Scope: modify ONLY `docs/product-capability-inventory.json`. No other file.
- Do NOT modify `harness/scripts/check-product-capability-inventory.mjs` or
  its test file.
- Do NOT modify `plugins/pipeline-core/hooks/hooks.json` or any hook/guard
  `.mjs` file.
- Do NOT touch `sourceBaseline` or `criticReview` fields in the inventory
  document.
- Do NOT create a new capability entry; do NOT modify the
  `codex-host-hook-bridge` capability.
- **Commit discipline:** never `git add -A` / a bare `git commit` — only
  `git commit -- docs/product-capability-inventory.json`.

### 5. Stop conditions

- More than 2 failed attempts at the same problem — report the failure state.
- The task requires touching a file outside field 4's scope — stop and report.
- Any pre-existing test outside your own new/modified assertions starts
  failing and you cannot determine why within budget — stop and report
  immediately.
- Missing access/tool/permission.
- Tool budget reached or clearly about to be exceeded.

### 6. Dispatch metadata

- Ruleset SHA/version: `fceab40` on `feat/sprint-cyborg-claude`.
- Model/effort: Implement-tier / standard. Rationale: this is a mechanical,
  narrowly-scoped documentation-registry entry addition with an exact
  prescribed shape and a deterministic test oracle — not an
  architecture/guardrail/security design decision (the underlying hook
  wiring it documents was already reviewed and landed as its own package).
- Worktree: no — run directly in the main checkout.
- Profile: standard.
- Tool budget: ≤20 tool uses.
- Dispatch record: write `dispatch-record.json` to your own scratchpad
  location (not the repo), fields `taskId: "CLAUDE-RUNNER-01e"`, `model`,
  `rulesetSha`, `dispatcher`, `outcome`.

---

At the end, report back: the diff, the exact test commands you ran and their
exit codes, and confirm the commit SHA you produced (or a clean stop with the
reason, per field 5).
