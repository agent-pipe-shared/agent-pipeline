---
schema: pipeline.backlog-item.v1
id: pipeline.relative-commit-message-file-unreadable-from-a-worktree
type: defect
owner: pipeline
status: open
created: 2026-08-28
sprint: nova
tracking: "NOW / Nova A — blocks the Pipeline's own worktree-isolated dispatch pattern; fix dispatched as NVA-B-GUARDF in the same session it was found"
source: "Observed live during the NVA-GF-* Workflow round, 2026-08-28, run wf_b6a26661-b19. Not relayed and not inferred: two sibling dispatches in the same run hit the identical denial, one recovered and one did not."
---

# `git commit -F <relative-path>` cannot succeed from inside a worktree, and the refusal blames the wrong thing

## What was measured

`guard-git.mjs:542` resolves its project root as
`process.env.CLAUDE_PROJECT_DIR || process.cwd()`. In a worktree-isolated
subagent those two disagree: `CLAUDE_PROJECT_DIR` holds the MAIN checkout while
the process cwd is the worktree. The `readFile` callback handed to
`commitMessageFindings` (same file, ~line 1143) then does
`resolve(projectDir, path)` and containment-checks against that same root, so a
message file written inside the worktree is looked for in the main checkout.

Agent `adca3d9c1993a149e`, cwd `<repo>/.claude/worktrees/wf_b6a26661-b19-4`, ran:

```
git commit -F scratch/commit-msg.txt
```

and was refused with `GIT-03-UNREADABLE-MESSAGE-FILE`, reporting ENOENT for
`<repo>/scratch/commit-msg.txt` — while the file existed, 381 bytes, in the
worktree's own `scratch/`. It returned an empty result with its finished work
left staged and uncommitted.

A sibling in the same run, agent `a644d3590cbbd5bfa`, hit the identical denial
and recovered by retrying with an absolute path:

```
commit -F scratch/commit-msg-nva-gf-prepush.txt                      -> BLOCKED
commit -F <repo>/.claude/worktrees/wf_b6a26661-b19-2/scratch/...txt  -> OK
```

Same guard, same run, same message shape. One agent guessed the workaround, the
other lost its run. That difference is luck, not contract.

## Why this is worse than one blocked command

The closed shell grammar refuses a newline inside `git commit -m`, so `-F` is
the only route to a multi-line commit message. The two rules together make a
correct commit unreachable from a worktree unless the agent happens to reach for
an absolute path. Every worktree-isolated dispatch in this repository is exposed,
which is the pattern the Pipeline itself uses to fan out Goldfish work.

The diagnostic makes it harder still: an ENOENT is reported as a GIT-03
correlation-data violation, complete with "there is no override for this rule.
Rewrite the message." The message was fine. Nothing about the text was the
problem, and the stated remedy cannot fix it.

## Direction

Resolve the message file against the invoking command's cwd, and take the
containment boundary from that cwd's own repository root (`git rev-parse
--show-toplevel`, which inside a worktree correctly yields the worktree). That
keeps the existing rule intact — a `-F ../../elsewhere` outside the project is
still not followed — while making a worktree its own project rather than a
subdirectory of another one.

Do NOT widen the boundary to "anything under the main root": that would admit a
sibling worktree's files and every other directory beneath it.

## Acceptance criteria

- A message file named by a path relative to a worktree is read from that
  worktree, and the commit succeeds.
- A message file outside the invoking repository root is still refused.
- The main-checkout case is unchanged, pinned by its own test.
- Test fixtures carry the absolute path form alongside the relative one.

## Related

- `2026-08-28-po-facing-commands-are-not-uniformly-rendered-break-safe.md` — same
  family: a command handed to someone who then cannot execute it as given.
- `templates/prompts/goldfish-task.md` instructs `git add -- <paths> && git
  commit -- <paths>` as one call, which the closed grammar also refuses. Found in
  the same review; the canon tells agents to do something the guard blocks.
