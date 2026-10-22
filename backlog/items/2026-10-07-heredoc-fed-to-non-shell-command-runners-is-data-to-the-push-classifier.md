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

## Merged from `2026-10-07-vim-es-and-busybox-heredoc-runners-are-data-to-the-push-classifier` (created 2026-10-07; merged 2026-10-22)

*Carried over verbatim from the item closed as a duplicate of this one. What is unique to it: vi/vim/ex in ex mode (-e, -es, -E) fed a heredoc with '!git push', and busybox shell applets (busybox sh / ash); measured repro commandIsGitPush("vim -es <<EOF\n!git push origin main\nEOF") -> false (Critic Q12 delta 1, F-E); tracking ids Q12-T9 / Q12-F7.*

**Front matter of the merged item, verbatim (status/ledger fields of the original):**

```yaml
schema: pipeline.backlog-item.v1
id: pipeline.vim-es-and-busybox-heredoc-runners-are-data-to-the-push-classifier
type: defect
owner: pipeline
status: open
created: 2026-10-07
source: "Critic Q12 delta 1, finding F-E (specs/sprint-alfred-epic/evidence/critic-2026-10-07/q12-delta1.md)"
sprint: alfred
done_when: manual
due: 2026-10-20
```

#### Description

Decision AF closed the list of command runners whose heredoc input is classified like a shell's. `vi`/`vim -es`
(ex mode reading commands from stdin, where `!git push …` runs a shell command) and `busybox` applets (`busybox sh`,
`busybox ash`) are not on that list, so `vim -es <<EOF` ⏎ `!git push origin main` ⏎ `EOF` is not a push candidate.
The classifier header names the gap in a comment only.

#### Triggering situation

Critic Q12 delta 1 measured `commandIsGitPush("vim -es <<EOF\n!git push origin main\nEOF")` → false.

#### Affected artifact

`plugins/pipeline-core/lib/git-cmd.mjs` (heredoc receiver list), `plugins/pipeline-core/lib/git-cmd.test.mjs`.

#### Proposal

Extend the AF receiver list with `vi`/`vim`/`ex` in silent/ex mode (`-e`, `-es`, `-E`) and `busybox <shell-applet>`;
test-only pins first, then the fix. Owner: pipeline; due 2026-10-20.

#### Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted.
- **Rationale:** same class as decision AF; a documented gap without an owner is a QG-06 finding.
- **Assignment (if accepted):** Q12 lane, with the delta-1 pins (Q12-T9) and fix (Q12-F7).
- **Date:** 2026-10-07
