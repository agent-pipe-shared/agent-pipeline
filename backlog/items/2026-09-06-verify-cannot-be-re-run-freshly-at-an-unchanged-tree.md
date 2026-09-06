---
schema: pipeline.backlog-item.v1
id: pipeline.verify-cannot-rerun-fresh-at-unchanged-tree
type: defect
owner: pipeline
status: open
created: 2026-09-06
sprint: nova-b
done_when: manual
tracking: "Nova B -- there is no way to force a fresh full verify run at an unchanged tree. candidateIdentity() keys on HEAD^{tree} and, with allowCrossCandidateReuse false (verify.mjs's real call shape), every suite's prior receipt is reused. Consequence: repeat-run evidence at an unchanged HEAD is vacuous -- it re-reports cached results, so it can never surface a race, a flake, or an environment-dependent failure. Every 'ran it twice, green both times' claim made at an unchanged HEAD in this repository proves nothing."
source: "NVA-B-VERIFYLANE-1 dispatch, 2026-09-06: found while trying to satisfy a briefed race-evidence DoD ('run the full gate at least 3 times, all runs must agree'). The dispatch correctly stopped rather than produce evidence it had determined was meaningless."
---

# Verify cannot be re-run freshly at an unchanged tree, so repeat-run evidence is vacuous

## The gap

`harness/scripts/verify.mjs:82-83` derives the candidate identity from
`HEAD^{tree}`. `plugins/pipeline-core/lib/verify-resume.mjs:145` reuses a
prior receipt whenever the candidate matches exactly and
`allowCrossCandidateReuse` is false — which is `verify.mjs`'s real,
unmodified call shape.

So a second full run at an unchanged working tree does not re-execute the
suites. It replays their receipts. The run reports green because the
previous run was green, not because anything ran.

`verify-resume.mjs:125` already names a `--no-reuse` escape as an open
ADR-0065 Decision-8 item. It is not implemented.

## Why this matters beyond one task

Repeat runs are the standard way to look for a race, a flake, or an
environment-dependent failure. In this repository that method currently
cannot work at an unchanged tree, and nothing tells the person running it
that their evidence is empty — the output looks like a normal green run.

This was found while trying to satisfy a race-evidence requirement for a
change to `verify-journal.mjs`'s serial lane. Had that requirement been
followed literally, the change would have shipped with three identical
cached greens presented as proof that no race was introduced.

The workaround available today is to make a throwaway tree-changing commit
before each repeat run, which is both easy to forget and easy to get wrong
(a commit that changes no tracked bytes does not change the tree).

## Constraint

`harness/scripts/verify.mjs` is TP-3 protected. Adding a `--no-reuse` flag
there needs a PO Ed25519 signature ceremony (ADR-0059), the same shape as
the Block D/E ceremonies of 2026-09-06. Whether the flag belongs in
`verify.mjs` or can be threaded entirely through
`plugins/pipeline-core/lib/verify-resume.mjs` (not TP-3) is itself part of
the design question and should be answered before a ceremony is seeded.

## Acceptance criteria

- A supported way exists to force a full, genuinely re-executed verify run
  at an unchanged tree, without hand-crafted throwaway commits.
- Its evidence artifact makes the distinction visible: a reader can tell a
  fresh run from a reused-receipt run without reading the code.
- The existing reuse behaviour is unchanged by default — this adds an
  explicit escape, it does not turn reuse off.
- If the mechanism can live wholly outside `verify.mjs`, it does, and the
  TP-3 ceremony is avoided; if it cannot, the ceremony scope is stated
  before it is seeded.
