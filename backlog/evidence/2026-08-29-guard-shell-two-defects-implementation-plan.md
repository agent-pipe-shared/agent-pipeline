# NVA-P1-GUARDSHELL — verified investigation and ready-to-execute plan

Rescued from a dispatch record that lived only in a temporary worktree's ignored
`evidence/` directory and would have been lost when that worktree was pruned.

Covers two items:
- `pipeline.read-scope-guard-admits-single-command-but-blocks-the-piped-form` (defect A)
- `pipeline.scratch-write-exemption-does-not-cover-restart-required` (defect B)

The dispatch spent its entire budget on investigation and made **no code edits**,
stopping at the briefed checkpoint. That was the right call: it found a design
conflict against existing pinned tests that a naive fix would have silently
broken. Both defects are confirmed against source, not inferred from the item text.

Single file for both: `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`
plus its `.test.mjs`. `guard-gate-strength.mjs` and `guard-command-grammar.mjs`
were read for understanding and need no edits.

## Defect A — root cause

`isReadOnlySimpleWords()` (~line 2041), tool-list branch (~line 2078):

```js
if (["ls","rg","grep","cat","head","tail","wc","stat","file"].includes(executable)) {
  return !args.some((arg) => arg === "--files-with-matches" && executable === "grep");
}
```

**No containment check at all.** The file's own comment at lines 103–114 (GF-078
bug 2) already documents this gap. The piped sibling
(`isOutsideRootBoundedDiagnosticRead` / `isBoundedReadOnlyPipeline`) *does* check
containment via `approvedReadPath()` + `additionalRoots`.

### Planned fix

1. Local helper near `isReadOnlySimpleWords`, reusing existing `commandPath()`
   (~2227) and `pathInside()` (~1279):

```js
function isApprovedSingleCommandReadArg(arg, root, extraRoots) {
  const resolved = commandPath(arg, root); // null for flags -> not a path token
  if (resolved === null) return true;
  if (pathInside(root, resolved)) return true;
  return extraRoots.some((extra) => {
    try { return pathInside(resolve(extra), resolved); } catch { return false; }
  });
}
```

2. Third parameter, **default-valued so neither existing call site changes**
   (~2026, ~2117):

```js
function isReadOnlySimpleWords(words, root, extraRoots = BOUNDED_PIPELINE_ADDITIONAL_ROOTS) { … }
```

and the branch becomes:

```js
if (["ls","rg","grep","cat","head","tail","wc","stat","file"].includes(executable)) {
  if (args.some((arg) => arg === "--files-with-matches" && executable === "grep")) return false;
  return args.every((arg) => isApprovedSingleCommandReadArg(arg, root, extraRoots));
}
```

The default parameter satisfies the acceptance bullet about
`BOUNDED_PIPELINE_ADDITIONAL_ROOTS` being honoured identically, for free.

3. Exported sibling of `isOutsideRootBoundedDiagnosticRead` (~2347):

```js
export function isOutsideRootSingleCommandRead(parsed, root) {
  if (!parsed || parsed.parseStatus !== "accepted" || parsed.segments.length !== 1
    || parsed.operators.length !== 0 || parsed.redirects.length !== 0) return false;
  const words = [parsed.segments[0].executable, ...parsed.segments[0].argv];
  if (isReadOnlySimpleWords(words, root)) return false;
  const scopeLifted = words.slice(1)
    .filter((t) => typeof t === "string" && t !== "" && !t.includes("\0"))
    .map((t) => { try { return resolve(root, t); } catch { return null; } })
    .filter((v) => v !== null);
  return isReadOnlySimpleWords(words, root, [...BOUNDED_PIPELINE_ADDITIONAL_ROOTS, ...scopeLifted]);
}
```

Put the literal marker `pipeline.read-scope-single-command-root-check` in a
comment near it — the item's `done_when` checks the file literally contains it.

4. Wire a third leg into `evaluateLifecycleReadyGuard` (~3902–3947), after the
   operators/redirects branch:

```js
else if (isOutsideRootSingleCommandRead(parsed, root)) {
  const code = READ_SCOPE_DENIAL_CODE;
  const reason = `${code}: ${READ_SCOPE_DENIAL_GUIDANCE}`;
  const route = humanOverrideRoute(code, reason, "command", root, toolName, input.tool_input, dependencies);
  if (!route.admitted) return withLifts(lifts, blocked(code, null, [], route.overrideGuidance));
  lifts.push(route.admitted);
}
```

An in-root single read still short-circuits at the earlier fast path (~3886) and
never reaches this branch.

### Conflict A — the guard's own remedy text is pinned by an EXECUTING test

`READ_SCOPE_DENIAL_REMEDY` (~390–394) currently tells operators that a single
un-piped read of any path *"is a shape this guard admits without a
path-location restriction."* The test **"NVA-BL-76: the new remedy is true — each
line is executed, not merely matched"** (~5732–5758) literally runs
`rg -n 'Overall' ${outsideFile}` and asserts exit 0.

The fix makes that claim false and the test fails (exit becomes 2) unless updated:

- Rewrite `READ_SCOPE_DENIAL_REMEDY` and its intro comment to drop the false
  claim — e.g. third bullet becomes "Re-target the read inside the project root:
  the identical bounded pipeline AND the identical single, un-piped read are both
  admitted once every read target resolves inside the project root."
- Update the loop at ~5745–5748 to assert exit 2 with
  `GUARD-READ-SCOPE-OUTSIDE-ROOT`. **Confirm it is RED against the unfixed code
  first** — this loop becomes part of defect A's regression coverage. Update the
  regex assertion at ~5744 for the new wording.
- Test-file comment ~1208–1217 repeats the superseded claim in prose; its
  assertions are unaffected (piped only). Optional polish.
- `guard-lifecycle-ready.mjs` ~1698–1701 (inside `isApprovedCatPipelineReadPath`'s
  comment) also asserts the no-path-restriction claim. Comment-only fix; that
  function must not change functionally — different pipeline family.
- **Verified safe:** `harness/scripts/generate-agent-obligations.mjs`'s
  `PROBE_COMMANDS` table contains no out-of-root literal paths, so no verdict in
  the byte-pinned `agent-obligations.md` changes. Confirmed by direct read.

### New tests for defect A

Near the existing NVA-BL-76 block (~5860), reusing `readScopeFixture()` /
`readScopeRun()`: single un-piped `rg`/`cat`/`head` on the outside fixture refused;
in-root single read still exit 0; a single un-piped read of the plugin's own
installed root stays admitted via `BOUNDED_PIPELINE_ADDITIONAL_ROOTS`.

## Defect B — planned fix

`evaluateAfterGrammarAdmission` (~3593), in the catch block right after the
existing narrow admission (~3636–3639):

```js
const restartLifecycleScratchWrite = restartRequired
  && !restartResumeHintNearMissWrite(input, root)
  && (isIntakeLifecycleScratchWrite(input, root)
    || (toolName === "Bash" && isIntakeLifecycleScratchMkdir((input.tool_input.command ?? input.tool_input.CommandLine), root)));
if (restartLifecycleScratchWrite) return verdict(0);
```

Marker `RESTART_LIFECYCLE_SCRATCH_WRITE` must appear literally — the item's
`done_when` checks for it. Reuses `isIntakeLifecycleScratchWrite` /
`isIntakeLifecycleScratchMkdir` **unmodified**: "is this write inside scratch/"
does not differ by status.

### Conflict B1 — the near-miss diagnostic would be silently swallowed

`NVA-MICRO-1` (~3728–3768) writes `scratch/.resume-hint-input.json` under
restart-required and asserts exit 2 with a specific near-miss hint. Without the
`!restartResumeHintNearMissWrite(...)` exclusion, the new generic scratch lane
admits it — breaking the test **and losing the diagnostic**, so a user would
believe their resume-hint write succeeded when it landed somewhere never read.
`restartResumeHintNearMissWrite()` already returns false for non-write tools, so
calling it unconditionally is safe.

### Conflict B2 — two existing tests pin the OPPOSITE as a lane-scoping proof

Both use restart-required as their "unrelated status" comparator, which stops
being unrelated once the fix lands:

1. **NVA-LCREADONLY-1** (~3438–3510), AC-6 (~3482–3495): asserts
   `mkdir scratch`, `mkdir -p scratch`, `write("scratch/incident-report.md")`,
   `edit("scratch/incident-report.md")` all exit 2. All four become exit 0.
2. **NVA-GF-SCRATCH** (~3572–3636), AC-5 (~3623–3631): asserts
   `write("scratch/design.md")` and `write("scratch/nested/deep/notes.md")` exit 2.
   Both become exit 0.

**Fix for both:** switch the comparator status in those blocks to
`continuity-damaged` (already used elsewhere in the file, no special admission
branch anywhere), rename the local `restartDeps` accordingly, update the comment.
Leave the following `partialDeps`/`partialNested` assertion untouched — partial's
narrower lane genuinely still refuses a nested scratch write.

This is correcting a now-stale assertion, exactly like the remedy-text test — not
weakening a check to make a test pass.

### New tests for defect B

(1) write/edit under `scratch/` and `mkdir -p` a nested scratch dir admitted at
restart-required — confirm RED first; (2) re-run, do not modify, the existing
resume-hint-input and NVA-MICRO-1 tests as the safety net for conflict B1;
(3) a write outside `scratch/` at restart-required stays refused; (4) suite exits 0.

## Verification sequence for the resuming dispatch

1. Write both regression tests FIRST; run the suite; confirm RED against current code.
2. Apply the `guard-lifecycle-ready.mjs` changes (A steps 1–4, B's admission block).
3. Apply the companion test corrections (NVA-BL-76 remedy loop, NVA-LCREADONLY-1
   AC-6, NVA-GF-SCRATCH AC-5).
4. `node --test plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` → exit 0.
5. `node --test harness/scripts/check-consumer-safe-paths.test.mjs` → exit 0.
6. Grep the diff for machine-specific absolute paths.
7. Commit both files with the trailer block.
