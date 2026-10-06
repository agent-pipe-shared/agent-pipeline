---
schema: pipeline.backlog-item.v1
id: pipeline.push-classifier-misses-nested-quotes-and-redirect-before-push
type: defect
owner: pipeline
status: open
created: 2026-10-06
source: "GPGL-8 dispatch report (residual gaps after the expansion and typographic-quote fail-closed checks), 2026-10-06."
sprint: alfred
done_when: manual
---

# The push classifier still misses nested quotes inside a quoted substitution and a redirect before the push word

## Description

After GPGL-8 (`plugins/pipeline-core/lib/git-cmd.mjs`: typographic quotes modelled in the PowerShell reading; check #5
fails closed on a boundary git word followed by unquoted command or parameter substitution; check #6 on a double-quoted
span holding a substitution together with a boundary git word), two shapes are still classified as not-a-push by the
implementor's probe (static probe output, not a captured artifact):

- quotes nested inside a double-quoted command substitution, where an inner pair of double quotes ends the span early
  for the scanner while the shell keeps it open, with a `git push` statement inside the substitution;
- a redirect between `git` and `push` (`git 2>&1 push origin main`), which git accepts but the word-position checks do
  not.

Both sit on the push gate (`guard-push` via the hook matcher `Bash|PowerShell`, and the Codex pretool route, which
relies on this classifier). The GPGL-8 change also routes two benign shapes to the push gate as accepted false
positives: `git diff` with a substituted merge-base, and a heredoc commit message inside a quoted substitution that
contains a boundary git word.

## Triggering situation

GPGL-8 report, open items; GPGL-7 Critic record
`specs/sprint-alfred-epic/evidence/critic-2026-10-05/gpgl-7-fix-verification.md` (the finding class).

## Affected artifact

`plugins/pipeline-core/lib/git-cmd.mjs`, `plugins/pipeline-core/lib/git-cmd.test.mjs`.

## Proposal

Test-only dispatch first (pin both shapes as pushes and the two false positives as the documented accepted
behaviour), then an implementation dispatch: track substitution nesting depth in `scanShell` so inner quotes do not
close the outer span, and drop redirection operators and their targets before the word-position checks. Due before
the 0.7.0 release candidate.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
