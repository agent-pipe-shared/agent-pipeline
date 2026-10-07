---
schema: pipeline.backlog-item.v1
id: pipeline.heredoc-fed-to-non-shell-command-runners-is-data-to-the-push-classifier
type: defect
owner: pipeline
status: open
created: 2026-10-07
source: "Critic finding F5 (minor, QG-06), Q12 round 1, specs/sprint-alfred-epic/evidence/critic-2026-10-07/q12-round1.md"
sprint: alfred
done_when: manual
due: 2026-10-20
---

# A heredoc fed to a non-shell command runner is data to the push classifier

## Description

PO decision X (`specs/sprint-alfred-epic/plans/po-decisions-2026-10-07.md`) makes `<<` a fail-closed marker only when a
shell or interpreter receives the heredoc. Commands that run their input as commands without being a shell — `xargs`,
`at`, `ed`, `sqlite3`, `php`, `lua`, `awk -f -` — therefore receive the body as data: `xargs git <<EOF` followed by
`push origin main` runs a real push that `commandIsGitPush` (`plugins/pipeline-core/lib/git-cmd.mjs`) does not route to
guard-push. The gap is documented only in the function's header comment.

## Triggering situation

Q12 Critic round 1, 2026-10-07, finding F5.

## Affected artifact

`plugins/pipeline-core/lib/git-cmd.mjs` (`hasShellHeredocReceiver`, receiver list), `plugins/pipeline-core/lib/git-cmd.test.mjs`.

## Proposal

Ask the PO whether decision X's receiver list extends to command runners (`xargs`, `at`, `ed`, `sqlite3`, `php`, `lua`,
`awk -f`), then pin and fix test-first. Owner: pipeline; due before the 0.7.0 release candidate.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted (PO decision AF, `specs/sprint-alfred-epic/plans/po-decisions-2026-10-07.md`).
- **Rationale:** a command runner fed a heredoc executes it; treating it as data leaves a push path unrouted to guard-push.
- **Assignment (if accepted):** Q12-T5 (test-only pins), then the classifier fix; 0.7.0 candidate.
- **Date:** 2026-10-07
