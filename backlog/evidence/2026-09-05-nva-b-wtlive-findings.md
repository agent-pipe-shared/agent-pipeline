# NVA-B-WTLIVE-1 — findings registry, round 1

Independent T1 Critic review (opus, max) of commits `1ebf80d5`, `bb8347e4`
(the second later reverted as `d818dcf1`). Three findings.

## F1 (major)

The unattended bootstrap sweep's registered-worktree branch enumerated and
could `git worktree remove` any registered worktree repository-wide, not
scoped to worktrees the Pipeline itself provisions.

## F2 (minor)

A combined try/catch's doc comment claimed a fault-isolation property
(a failure in one branch cannot mask the other's completed work) that the
code did not implement.

## F3 (minor)

`resolveMainWorktreePath` misidentifies the main worktree when the sweep
runs from inside a linked worktree, currently harmless only by two
accidental safety nets rather than by the check its own doc comment claims.
