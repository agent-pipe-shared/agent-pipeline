# PF-59 held patch: the public handover update owns only a marked block (D160)

Patch: `pf59-handover-marked-block.patch` (git diff against repository HEAD `2086a410f`, two files).
Source: consumer report 05 finding PF-59 (minor, 0.7.0), PO decision D160 (Q23 (a)), criterion AC-142.
Held because `plugins/pipeline-core/lib/onboarding-continuity.mjs` is a NEVER_LIFTABLE kernel path.
Apply in the C29 bundled sitting as item 13, after item 12 (`pf64-pf69-checkpoint-text.patch`).

## Behaviour (D160)

The explicit public handover update (`updatePublicHandoverDuty`, and the inspect that decides current/stale)
owns only a marked generated block inside `## Next action`:

```
## Next action

**Lifecycle phase:** feature `x` · phase `design`

<!-- pipeline:next-action:begin -->
...generated body...
<!-- pipeline:next-action:end -->

...project prose, kept byte for byte...
```

- Exactly one begin and one end marker (begin first): only that span is rewritten.
- No marker, and the body (ignoring the Lifecycle phase marker line and blank lines) is exactly a known generated
  rendering (any `NEXT_ACTION_BODY_BY_STATUS` value, the inactive text, the kickoff or promotion initial body, the
  two fallback renderings): replaced wholly as legacy, now wrapped in the markers.
- No marker, any other prose: the marked block is inserted and the prose stays below it.
- Any other marker shape (begin without end, two begins, end first, stray end): refused as `unavailable` with a reason,
  file unchanged. Markers outside `## Next action` are not counted. The alias refusal and every other refusal are kept.

## Design decision to confirm (deviation, see below)

`replaceNextActionSection` and the default `syncStateMdNextAction` keep their old whole-section replacement. Five
existing cases pin it (onboarding-continuity OBC192, OBC193, OBC201; windows greenfield pin: the two V-13 cases
"replaceNextActionSection swaps only that section" and "syncStateMdNextAction rewrites a stale docs/state.md").
Block ownership is a new option `syncStateMdNextAction(dir, state, { ownBlock: true })`, passed by
`inspectPublicHandoverDuty` and `updatePublicHandoverDuty` only. `scripts/pipeline-state.mjs` `syncNextActionDocs`
(non-Git legacy fixtures) is unchanged and therefore still replaces the whole section. A first draft that changed
`replaceNextActionSection` itself turned those five cases red; it was discarded, not the tests changed.
`nextActionSection`'s return value is unchanged (the inactive body only moved into a constant).

## Preimage SHA-256 (repository HEAD 2086a410f)

- `plugins/pipeline-core/lib/onboarding-continuity.mjs`: `5735a27fabf6e91969362bb57d30bcbae44e7627f890244f5a72862ce52c415b`
- `plugins/pipeline-core/lib/public-handover-duty.test.mjs`: `c0e8e506b15961ce82d694dccbd646ae0e1a0011f7d4c4f51a05d3c88d00f646`

## Tests (real clone of HEAD, no symlinked tree)

- RED before any production edit: `public-handover-duty.test.mjs` 11 tests, 5 pass, 6 fail (PHD002 changed, PHD007 to PHD011 new).
- GREEN after: `public-handover-duty.test.mjs` 11/11 (exit 0).
- `lib/onboarding-continuity.test.mjs`: 308 tests, 307 pass, 1 fail; identical to HEAD. Only failure OBC264, as at HEAD
  (first line `KickoffError: author the generated PRD and Spec before binding their bytes`).
- `plugins/pipeline-core/scripts/pipeline-state-inspect.test.mjs` (the briefing's `scripts/` path is the plugin scripts dir): 26/26, same as HEAD.
- `lib/pins/claude-windows-greenfield-lifecycle-not-walkable.test.mjs`: 42 tests, 28 pass, 13 fail, 1 skipped; identical to HEAD.
  The 13 failures are all the V-10 cases (first line `AssertionError ... DBG-GENERATED-BRIEFING-REQUIRED`), pre-existing.
- `harness/scripts/check-consumer-safe-paths.test.mjs`: 9/9.

## PHD002 change and justification

Line 44 `assert.ok(!first.includes("Old lifecycle text"))` is replaced by `assert.ok(first.includes("Old lifecycle text."))`
plus an assertion that the text sits after the end marker. Under D160 an unmarked section whose body is not a known generated
rendering is project prose and is kept below the generated block; "Old lifecycle text." is such prose. Every other
assertion of PHD002 is unchanged. No other existing case was touched.

## Stack check

Fresh clone of HEAD, `git apply` in order: r2-preready-ref-git, r2-hgo-request-seeding, r2-route-effort,
r2-windows-session-locks, r2-critic-txn-owner-recovery, r2-identity-actor-reuse, g33-damaged-state-recovery,
p0-session-cleanup-lock-recovery, pf61-subagent-handback-commit, pf65-orientation-bound, c29-bundle-fixture-followup,
pf64-pf69-checkpoint-text, then this patch: all 13 apply (check and apply exit 0). The stacked suites were not re-run.

## Overlap

No textual overlap with the twelve earlier patches (all apply). The test file is not touched by them either.

## Proposed commit message

```
fix(handover): the public update owns only a marked Next action block

The explicit public handover update replaced the whole Next action
section, so a project's own text and push checklist there were lost.
It now owns only a block between pipeline:next-action markers; an
unmarked section that is exactly a known generated rendering is
replaced as legacy, any other prose is kept below the block, and
malformed markers are refused as unavailable. PF-59, D160.

AI-Assisted: true
Dispatch: administrative (elephant)
```
