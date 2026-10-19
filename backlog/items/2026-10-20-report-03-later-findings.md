---
schema: pipeline.backlog-item.v1
id: pipeline.report-03-later-findings
type: improvement
owner: pipeline
status: open
created: 2026-10-20
source: "PO report scratch/pipeline-feedback-03.md, findings PF-30, PF-35, PF-37, PF-38, PF-39, PF-43; deferred per D56"
sprint: none
done_when: manual
---

# Report 03: findings deferred after 0.7.0

Each entry stays open after this candidate (D56). The report holds the full reproduction.

- **PF-30, budget and continuation.** Two item packages (8-13 paths) reached the 80 % budget
  checkpoint before any DoD check ran. No documented route continues the same item with a
  fresh budget bound to the state reached; whether a second binding for the same `--item` with
  a new dispatch id is intended is undocumented. Part of the budget goes to orientation and
  refused search flags. (PF-53 (1) asks for the same route.)
- **PF-35, mechanic tier.** One `goldfish-mechanic` dispatch with a new scaffold test refused
  test authorship and `architecture: true`; an equally cut one before it did the work.
  `dispatch-briefing.mjs binding` admits both and sets
  `criticDecision.trigger.diff.architecture: true` even for one line. Expected: one consistent
  rule, and no blanket architecture flag.
- **PF-37, stopped worktree.** A Goldfish without its own isolation cannot read a stopped
  dispatch's worktree under `.claude/worktrees/<id>` (`GUARD-READ-TARGET`,
  `GUARD-READ-COMMAND-UNSUPPORTED`), so every correction needs a fresh worktree and a
  reinstall.
- **PF-38, GIT-03 in a worktree.** `git -C <worktree> commit -F <main>/scratch/<msg>` is
  refused (`GIT-03-UNREADABLE-MESSAGE-FILE`, then marker and dispatch missing) although the
  file carries both trailers; the guard takes the worktree as project root.
- **PF-39, git apply.** `git apply <scratch>/<file>.patch` is refused
  `GUARD-TESTPATH-SHELL-FAULT` ("unbound patch targets"); the classifier does not read the
  targets from the patch, and no override route exists.
- **PF-43, old host commits.** `readOrchestratorCommitIntegratedSlices` needs both
  `Dispatch: <slice> (goldfish)` and `Commit-Act: orchestrator`; earlier host commits carry
  only `Dispatch`, and no migration route is documented.
