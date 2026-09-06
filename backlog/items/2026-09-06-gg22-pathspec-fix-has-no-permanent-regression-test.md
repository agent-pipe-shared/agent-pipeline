---
schema: pipeline.backlog-item.v1
id: pipeline.gg22-pathspec-fix-lacks-permanent-test
type: defect
owner: pipeline
status: open
created: 2026-09-06
sprint: nova-b
tracking: "Nova B — NVA-B-GG22FIX-1 (commit fe2d7afe) fixed the GG-22 shared-index deadlock, but plugins/pipeline-core/hooks/guard-git.test.mjs is TP-1 protected with no in-session override route, so the dispatch could not add a permanent regression test there. The fix was proven RED-then-GREEN via an ephemeral scratch/ reproduction script instead, which is not committed and does not guard against a future regression of this exact scoping logic."
done_when: manual
source: "NVA-B-GG22FIX-1's own dispatch report, 2026-09-06: 'Persisting GG22-9/10/11 into guard-git.test.mjs needs a new step in apply-pending-protected-edits.mjs (mirroring stepGuardGit22) -- an attended-operator action outside this dispatch's scope.'"
---

# The GG-22 pathspec-scoping fix has no permanent regression test

## The gap

`NVA-B-GG22FIX-1` (commit `fe2d7afe`) fixed a measured, reproducible
deadlock in GG-22 (`plugins/pipeline-core/hooks/guard-git.mjs`'s
status-flip-debt check reading the whole shared git index instead of the
refused commit's own `--` pathspec). The fix itself is landed, verified
green (232/232 existing `guard-git.test.mjs` cases unaffected, independently
re-run by the Elephant), and traced correct by hand. But no NEW permanent
test exists for the specific pathspec-scoping behavior this fix adds,
because `guard-git.test.mjs` is TP-1 protected and the dispatch had no
in-session route to edit it — it proved the fix via a throwaway
`scratch/gg22-pathspec-repro.mjs` script instead (gitignored, not
committed, disappears the moment `scratch/` is cleaned).

`harness/scripts/apply-pending-protected-edits.mjs` already has a
precedent step for exactly this file (`stepGuardGit22`, registered at
~line 1510 as `key: "guard-git-22"`) — that step already added an earlier
round's GG22-7/GG22-8 fixture tests the same way. This item needs a NEW,
similarly-shaped step (or an extension of the existing one) covering the
pathspec-scoping fix's own cases, run by an attended operator outside any
agent session (`apply-pending-protected-edits.mjs`'s own stated sanctioned
route).

## Acceptance criteria

- A new step (or extended existing step) in `apply-pending-protected-edits.mjs`
  adds permanent test coverage to `guard-git.test.mjs` for: (1) a
  pathspec'd status-flip-debt commit naming only allowed paths is admitted
  (previously would have been refused by an unrelated staged file); (2) a
  pathspec'd commit naming a disallowed path is still refused; (3) a bare
  commit (no pathspec) against the staged index is unaffected — matches the
  existing GG22-3 behavior, just confirming no regression.
- An attended operator runs the apply step; the resulting test additions
  are committed normally afterward (not itself a TP-1 edit once landed via
  the sanctioned route).
- `node --test plugins/pipeline-core/hooks/guard-git.test.mjs` passes with
  the new cases included.
- Coverage additionally includes the `-i`/`--include` admission-widening
  case and the `../`-traversal case `NVA-B-GG22FIX-2` (commit `c6ef3425`)
  fixed, plus the trailing-slash directory-pathspec case tracked at
  `2026-09-06-gg22-pathspec-normalization-false-blocks-a-trailing-slash-directory-pathspec.md`
  — not only the original round-1 pathspec-scoping cases this item was
  first filed for.

## Also noted (2026-09-06, T1 Critic closing round for NVA-B-GG22FIX-2, F3)

The RED/GREEN reproduction evidence for BOTH correction rounds
(`backlog/evidence/2026-09-06-nva-b-gg22fix-{1,2}-{red,green}.txt`) cites a
harness script (`scratch/gg22fix-*-repro.mjs`) that is itself gitignored —
the tracked artifacts show identical `PASS` lines for RED and GREEN modes,
differing only in a `[mode=...]`/`guard=...` trailer, so a reader without
the harness cannot tell "bug reproduced" from "bug absent" from the tracked
artifact alone. This is the same durability class as this package's
already-fixed F5 (round 1's citation of gitignored paths), recurring in
round 2's own new evidence. Once this item's permanent test lands in
`guard-git.test.mjs` via the attended-operator route, the committed test
IS the durable, self-interpretable proof and this note is moot; tracked
here only so it is not lost before then.
