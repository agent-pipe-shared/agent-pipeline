---
schema: pipeline.backlog-item.v1
id: pipeline.isrealpathedwithinboundary-file-boundary-uncaveated
type: defect
owner: pipeline
status: open
created: 2026-09-06
sprint: nova-b
done_when: manual
tracking: "Nova B -- T1 Critic review of NVA-B-GLRMINORS-1 (PASS, 2 minor findings), F2: the hardening for the transcript-file exact-match invariant (commit 571e67a8) lives only at its sole call site, isApprovedSingleCommandReadArg(). The exported isRealpathedWithinBoundary() primitive itself still admits any <file>/<nonexistent-child> candidate when handed a FILE-typed boundary, and its own doc comment still reasons only in directory-boundary terms -- a future caller reusing this primitive with a FILE boundary would silently reopen the exact shape NVA-B-GLRMINORS-1 just closed, with no warning at the primitive itself."
source: "T1 Critic review (opus, max) of commit 571e67a820cdf6912b02e069c3c2d68c73a0f443, F2."
---

# `isRealpathedWithinBoundary` keeps unsafe FILE-boundary behavior, un-caveated

## The gap

`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`'s exported
`isRealpathedWithinBoundary()` (~line 2035) is a general containment
primitive whose ancestor-walk logic is built for the "not-yet-existing path
under a real DIRECTORY" case. Applied to a FILE-typed boundary, a candidate
shaped `<file>/<nonexistent-child>` climbs the walk back to the file itself
and is reported "inside" — true for any such string.

`NVA-B-GLRMINORS-1` (commit `571e67a8`) fixed this for the ONE current
caller that hands the primitive a FILE boundary
(`isApprovedSingleCommandReadArg()`'s `extraRoots` loop), by checking
identity first and refusing outright when the boundary is a file and the
candidate isn't identical to it — before ever calling into
`isRealpathedWithinBoundary()`. The primitive itself is untouched: still
exported, still admits the unsafe shape, and its own doc comment still
reasons only in directory-boundary terms with no FILE-boundary caveat.

## Why this matters

This is the drift class the ADR (`docs/adr/draft-read-scope-containment-boundary.md`)
was written to close: a containment PRIMITIVE whose actual behavior diverges
from what a caller might reasonably assume from its name and doc comment.
Today's only FILE-boundary call site is guarded; a future caller passing a
FILE boundary to `isRealpathedWithinBoundary()` directly (bypassing the
one guarded site) would silently reopen the exact admission gap
`NVA-B-GLRMINORS-1` just closed, with nothing at the primitive warning them.

## Acceptance criteria

- Either (a) `isRealpathedWithinBoundary()` itself detects a FILE-typed
  boundary and applies the same exact-match discipline internally (moving
  the guard from the caller into the primitive, so every future caller
  inherits it automatically), or (b) the primitive's own doc comment gains
  an explicit caveat naming the FILE-boundary hazard and pointing at the
  one call site that currently guards it, so a future caller is warned
  rather than silently exposed.
- If (a): a regression test at the primitive level (not only at the caller
  level) proves a FILE-typed boundary refuses a nonexistent-child candidate.
- Full existing `guard-lifecycle-ready.test.mjs` suite stays green,
  including the two shapes covered by `NVA-B-GLRMINORS-1`'s own new test.
