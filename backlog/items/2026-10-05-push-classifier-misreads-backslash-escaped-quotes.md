---
schema: pipeline.backlog-item.v1
id: pipeline.push-classifier-misreads-backslash-escaped-quotes
type: defect
owner: pipeline
status: open
created: 2026-10-05
source: "Found by the GPGL-2 dispatch (code reading plus a regression case), Alfred session, 2026-10-05."
sprint: alfred
done_when: manual
---

# The push classifier misreads backslash-escaped quotes

## Description

`plugins/pipeline-core/lib/git-cmd.mjs` (`stripQuotedSegments`, `hasUnterminatedQuote`,
`tokenizeArgv`) treats a backslash-escaped quote outside quotes as a quote delimiter. In a POSIX
shell an escaped quote is a literal character, so text between two escaped quotes is executed,
while the classifier strips it as a "quoted span". A real `git push` placed there is not
classified as a push by `commandIsGitPush`, which `guard-push.mjs` and `codex-pretool-guard.mjs`
both use. Security class: guard bypass by quoting (fail-open in the push classifier).

Mitigations present today: the Claude lifecycle guard's closed shell grammar refuses composed
commands (`;`, `&&` beyond the admitted shapes), so the plain Claude route is covered by a second
layer; the Codex route relies on the classifier. Not measured live on Codex.

A second, unverified shape from the same reading: a quoted executable name (`"git"`) followed by
an unknown option before `push` may also evade the direct-push branch.

## Triggering situation

GPGL-2 removed a false-positive (`git` inside `--no-git`) and regression case GL-B13 in
`hooks/guard-push-gitleaks-prefix.test.mjs` turned red: it had been refused only through that
false positive, which masked this hole.

## Affected artifact

`plugins/pipeline-core/lib/git-cmd.mjs`; consumers `hooks/guard-push.mjs`,
`hooks/codex-pretool-guard.mjs`.

## Proposal

Fail closed: a command containing a backslash-escaped quote outside single quotes and a `git`
word at an executable boundary is classified a push (or: real escaped-quote parsing). Pin GL-B13,
the plain `echo`-wrapped shape and the quoted-executable shape as refused. Security Critic route.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** fixed in source — closes after the 0.7.0 candidate host checklist (status stays `open` until then).
- **Rationale:** commit(s) `6b0413700, a2857ac3a`.
- **Assignment (if accepted):** sprint-alfred-epic close-out batch.
- **Date:** 2026-10-08.
