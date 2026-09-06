---
schema: pipeline.backlog-item.v1
id: pipeline.transcript-root-child-path-admission
type: defect
owner: pipeline
status: open
created: 2026-09-06
sprint: nova-b
tracking: "Nova B — T1 Critic review of NVA-B-READCONTAIN-2 (PASS, 2 minor findings). F1: the transcript-file exception root's own doc comment claims 'admitted as an EXACT single-file match only -- never a directory-prefix admission', but isRealpathedWithinBoundary's ancestor-walk admits a candidate shaped <transcriptFile>/<child> anyway, since the walk climbs from the nonexistent child back up to the file itself (which equals the boundary). Not exploitable today (a real file has no children; the shell read fails ENOTDIR) but the code does not hold the invariant the comment asserts, and no test covers this shape."
done_when: manual
source: "T1 Critic review of NVA-B-READCONTAIN-2 (opus, max), finding F1, backlog/evidence/2026-09-06-nva-b-readcontain-2-findings.md."
---

# The exact-transcript-file exception admits a nonexistent child path

## The gap

`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`'s
`claudeSessionTranscriptFilePath()`/`sessionReadScopeRoots()` (added by
`NVA-B-READCONTAIN-2`, commit `e183632f`) push the realpathed transcript
FILE into the same `extraRoots` array `isRealpathedWithinBoundary()` also
uses for DIRECTORY roots (`BOUNDED_PIPELINE_ADDITIONAL_ROOTS`, the memory
directory). `isRealpathedWithinBoundary`'s ancestor-walk logic — designed
for the legitimate "not-yet-existing path under a real directory" case —
does not distinguish a file boundary from a directory boundary: for a
candidate `<transcriptFile>/<child>`, `pathInside(transcriptFile,
<transcriptFile>/<child>)` is lexically true, the walk finds `<child>`
doesn't exist, climbs to `dirname()` = `transcriptFile` itself (which
equals the boundary), and the loop exits reporting "inside."

This means the guard's own admission decision does not match the
"EXACT single-file match" invariant its doc comment (and the originating
task's acceptance criterion 1) claims. It is not exploitable today: a
regular file has no children at the OS level, so the actual shell command
(`cat`, `rg`, etc.) fails with a real `ENOTDIR` and reads nothing. But the
guard is not the one closing that gap — the OS is, incidentally.

## Why this matters even though it isn't exploitable today

This repository's read-scope containment has already gone through two
separate multi-round Critic sagas (`NVA-B-READCONTAIN-1`'s F2/F4) because a
containment PRIMITIVE quietly diverged from what its own comment claimed.
This is the same shape at smaller scale: a doc comment asserting an
invariant the code does not structurally hold, saved only by an incidental
OS behavior a future refactor (or a future caller reusing
`sessionReadScopeRoots()`'s roots array for something else) could silently
lose.

## Acceptance criteria

- Either: (a) the containment check is hardened so a candidate under a
  FILE-typed boundary is refused unless it is byte-identical to the
  boundary (an explicit `statSync`/exact-match check, not reliant on the
  ancestor-walk's incidental behavior for files), or (b) the doc comment is
  corrected to state the weaker, actually-true invariant and explain why it
  is still safe (real-OS `ENOTDIR`), with a due date if (a) is deferred
  (QG-06 — a documented risk without a due date is a finding, not a
  mitigation).
- A regression test covers the `<transcriptFile>/<child>` shape explicitly,
  proving the actual current (or hardened) behavior — this shape had zero
  test coverage before this item.
- Full existing regression suite stays green.
