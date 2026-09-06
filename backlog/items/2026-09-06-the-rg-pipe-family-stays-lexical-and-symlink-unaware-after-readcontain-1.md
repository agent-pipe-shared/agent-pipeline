---
schema: pipeline.backlog-item.v1
id: pipeline.rg-pipe-lexical-containment-gap
type: defect
owner: pipeline
status: open
created: 2026-09-06
sprint: nova-b
tracking: "Nova B — NVA-B-READCONTAIN-1 restored realpath-aware containment for the single-command read lane, the cat-pipeline lane, and the git-pipeline lane in guard-lifecycle-ready.mjs. It deliberately did not touch guard-command-grammar.mjs's approvedReadPath(), which backs the rg-to-rg/rg-to-head bounded pipeline (isBoundedReadOnlyPipeline) — that function stays purely lexical (resolve()+pathInside(), no existsSync/realpathSync at all), a strictly weaker check than even NVA-B-READCONTAIN-1's own round-1 (direct-symlink-only) fix. Traced and confirmed by the Elephant, 2026-09-06, while filing related gaps found during the same package's closure."
done_when: manual
source: "Elephant, 2026-09-06, code trace of guard-command-grammar.mjs's approvedReadPath()/validateRg()/isBoundedReadOnlyPipeline() against guard-lifecycle-ready.mjs's now-realpath-aware isApprovedSingleCommandReadArg()/isApprovedCatPipelineReadPath(), prompted by an advisor review of NVA-B-READCONTAIN-1's closure."
---

# The `rg`-pipe family stays lexical and symlink-unaware after NVA-B-READCONTAIN-1

## The gap

`guard-command-grammar.mjs`'s `approvedReadPath(value, root, additionalRoots)`
(line ~219) is the containment check behind `validateRg()`, used by BOTH the
single, un-piped `rg` shape (routed instead through
`isApprovedSingleCommandReadArg` in `guard-lifecycle-ready.mjs`, which IS
realpath-fixed — not affected) and the bounded `rg … | rg …` / `rg … | head`
pipeline (`isBoundedReadOnlyPipeline`, still routed through `approvedReadPath`
directly — **not** fixed):

```js
function approvedReadPath(value, root, additionalRoots = []) {
  ...
  const target = resolve(root, value);
  if (pathInside(resolve(root), target)) return true;
  return additionalRoots.some((extra) => {
    try { return pathInside(resolve(extra), target); } catch { return false; }
  });
}
```

This is pure lexical `resolve()` + `pathInside()` — no `existsSync`/
`realpathSync` call anywhere. A symlink planted inside the project root
pointing outside it satisfies this check on the DIRECT shape alone (no `..`
composition needed, unlike the bug NVA-B-READCONTAIN-1's correction rounds
found and fixed for the other three lanes). `guard-lifecycle-ready.mjs`'s own
`isBoundedGitPipeline` (the git-pipeline sibling) already reuses the fixed
`isApprovedSingleCommandReadArg` for its subargs and is NOT affected by this
item — only the `rg`-pipe family is.

`guard-lifecycle-ready.mjs`'s `isOutsideRootBoundedDiagnosticRead()` (the
function that decides which denial CODE to print when this pipeline's
containment fails) does not change this: its own doc comment states plainly
"This never admits anything. Its only consumer picks WHICH refusal is
printed... the first call, with the real roots, is still the one that decides
admission" — that first call is `isBoundedReadOnlyPipeline` →
`approvedReadPath`, unaffected by anything NVA-B-READCONTAIN-1 changed.

## Why this was out of scope for NVA-B-READCONTAIN-1

`guard-lifecycle-ready.mjs`'s own comment above `isApprovedCatPipelineReadPath`
(added by NVA-B-READCONTAIN-1's final correction) states this explicitly:
"`approvedReadPath` is not exported from that file (only `parseGuardCommand`
and `isBoundedReadOnlyPipeline` are), and this dispatch's briefed scope
excludes editing it." This item exists to give that exclusion a durable,
separately-tracked home rather than leaving it as a comment aside only.

## Design constraint for the fix

`guard-lifecycle-ready.mjs` imports FROM `guard-command-grammar.mjs`, never
the reverse (confirmed: `approvedReadPath` is not exported today; only
`parseGuardCommand`/`isBoundedReadOnlyPipeline` are). A realpath-aware
replacement for `approvedReadPath` most naturally belongs IN
`guard-command-grammar.mjs` itself (it has no `existsSync`/`realpathSync`
imports today and would need them), mirroring the `rawReadCandidatePath()` +
`isRealpathedWithinBoundary()` pattern `guard-lifecycle-ready.mjs` already
uses — or the two files share a small new containment-primitives module.
This is a design decision for the dispatch, not settled here.

Also relevant, found in the same trace: the doc comment directly above
`approvedReadPath` (line ~206) currently reads "Every single, non-piped
read-only command this guard family admits elsewhere ... carries NO path
restriction at all" — that was true before NVA-B-READCONTAIN-1 restored
single-command containment and is now stale. Whoever fixes this item should
correct that comment as part of the same change (it directly documents the
function this item is about).

## Related, but a separate item — do not merge

`2026-09-06-a-leading-tilde-path-argument-is-admitted-as-inside-the-project-root.md`
also touches `approvedReadPath` (a leading-`~` argument is admitted there
too, on lexical grounds, with no symlink involved). That item's scope is
narrower (one specific literal-string mismatch, fixable as an early reject)
and is scheduled to land BEFORE this one. This item's scope (full
realpath-awareness for the whole `rg`-pipe family) is the larger of the two
and should land after, informed by whatever shared-home decision the tilde
fix makes for its own cross-file rejection.

## Also folded into this item's scope, 2026-09-06 (found during NVA-B-READCONTAIN-2)

The cat-pipeline family (`isBoundedCatPipeline`) does not receive the two
session-derived exception roots `NVA-B-READCONTAIN-2` added (the session
transcript file, the session memory directory) — reading either through a
`cat <path> | grep ...` shape is refused; only the single-command shape is
admitted. `NVA-B-READCONTAIN-2`'s own commit message names this a
deliberate scope boundary ("would need a three-function signature change
not required by that task's DoD"), disclosed rather than fixed. Both this
gap and the `rg`-pipe realpath gap above are the same shape — a pipeline
lane not receiving a containment discipline or root set the single-command
lane already has — so they belong in one item rather than two.

## Acceptance criteria

- The `rg`-to-`rg`/`rg`-to-`head` bounded pipeline resolves a symlinked
  read target through the same realpath-resolving discipline the other
  three lanes already use — a direct symlink inside the root pointing
  outside it is refused, not admitted.
- A regression test using a real `symlinkSync` fixture (mirroring
  `guard-lifecycle-ready.test.mjs`'s `dotdotThroughSymlinkFixture()`) proves
  it.
- The stale doc comment above `approvedReadPath` is corrected.
- The cat-pipeline family (`isBoundedCatPipeline`) is threaded through to
  accept the same session-derived extra roots the single-command/
  git-pipeline/`&&`-chain lanes already receive, with a regression test
  proving a transcript-file or memory-dir read through a `cat ... | ...`
  shape is admitted the same way the single-command shape already is.
- Full existing regression suites for both touched files stay green.
- This item's resolution (or continued deferral) is recorded in the ADR
  NVA-B-READCONTAIN-1/-2 owe.
