---
schema: pipeline.backlog-item.v1
id: pipeline.commit-guards-reject-safe-literal-multiline-messages
type: defect
owner: pipeline
status: open
created: 2026-09-13
due: 2026-09-30
sprint: nova-b
done_when: manual
source: "Direct Nova release-path observation, 2026-09-13: a conventional Git commit with a literal multiline final trailer block was refused by the lifecycle grammar and the Git trailer guard, even though the equivalent repo-internal -F message file was accepted."
---

# Commit guards reject safe literal multiline commit messages

## What happened

The normal Git form for a subject plus body/trailer block was refused before
Git could construct and validate the commit message:

```sh
git commit -m "subject" -m $'body\n\nAI-Assisted: true\nDispatch: stage-0 (elephant)'
```

`guard-lifecycle-ready` rejected the ANSI-C literal as unsupported shell
syntax, while `guard-git` did not reconstruct the final trailer block from
the ordered `-m` values and reported both mandatory trailers missing. A
repo-internal message file passed the same trailer policy through `git commit
-F <message-file>`.

The result is unnecessary operator friction: an agent that has a valid commit
and a complete provenance block must create a temporary file solely to cross a
parser boundary. It also encourages brittle shell pipes or manual terminal
work, neither of which is safer than validating the final Git message.

## Direction

Keep the closed shell grammar and the final-trailer policy, but make their
boundary agree with Git's normal `-m` semantics:

1. Admit only a data-only, literal multiline message representation. Do not
   admit command substitution, backticks, variable expansion, redirects,
   pipelines, or control operators.
2. Reconstruct ordered `-m`/`--message` values exactly as Git does for the
   sole purpose of final-trailer validation; do not weaken GIT-03.
3. Retain `git commit -F <repo-internal-message-file>` as an equally valid
   path, including its unreadable/outside-root refusal.

## Acceptance

- A conventional subject plus literal multiline body/trailer message containing
  exact `AI-Assisted: true` and `Dispatch:` entries is admitted and commits
  normally without a scratch message file.
- The same shape with either required trailer absent is refused by GIT-03.
- Command substitution, backticks, non-`PWD` expansion, redirection, pipes,
  and control operators remain refused by the lifecycle grammar.
- `-F` validation stays fail-closed for unreadable or outside-root files.
- Regression tests cover `guard-command-grammar.mjs`, `guard-git.mjs`, and
  `guard-lifecycle-ready.mjs` from the same emitted command shapes.

## Triage

- **Decision:** accepted for Nova B.
- **Rationale:** This is a repeatable release/commit-path friction point, not
  a request to weaken provenance or shell safety. The current `-F` route is a
  safe workaround, so it does not block the 0.6.2 push candidate.
