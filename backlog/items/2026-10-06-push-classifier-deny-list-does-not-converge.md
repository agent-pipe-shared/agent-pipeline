---
schema: pipeline.backlog-item.v1
id: pipeline.push-classifier-deny-list-does-not-converge
type: defect
owner: pipeline
status: open
created: 2026-10-06
source: "GPGL-8 Opus Critic round, 2026-10-06 (specs/sprint-alfred-epic/evidence/critic-2026-10-05/gpgl-8.md), fifth consecutive round with new bypasses."
sprint: alfred
done_when: manual
---

# The push classifier's deny-list of hidden-push shapes does not converge

## Description

`commandIsGitPush` in `plugins/pipeline-core/lib/git-cmd.mjs` decides whether a shell text reaches the push gate
(`guard-push` on the Claude Bash/PowerShell route; the Codex pretool route relies on it alone). Each fix round has added
detection for the shapes the previous Critic traced, and each following round found new ones. After GPGL-8
(`7b0bb402a`) the Critic traced, statically: check #5 bypassed by an escaped command terminator or escaped backtick
(F1); bare parameter expansion, bash locale quoting `$"…"` and PowerShell grouping `("push")` evading the expansion
check (F2); a substitution inside an unquoted here-document body treated as data (F3); the loosening branches of the
new checks untested (F4, QG-11); open-gap notes stale and undated (F5).

## Triggering situation

GPGL-5/6/7/8 Critic records in `specs/sprint-alfred-epic/evidence/critic-2026-10-05/`
(`gpgl-5-6-delta.md`, `gpgl-7-fix-verification.md`, `gpgl-8.md`).

## Affected artifact

`plugins/pipeline-core/lib/git-cmd.mjs`, `plugins/pipeline-core/lib/git-cmd.test.mjs`; consumers
`plugins/pipeline-core/hooks/guard-push.mjs`, `plugins/pipeline-core/hooks/codex-pretool-guard.mjs`.

## Proposal

PO question Q12 (`specs/sprint-alfred-epic/plans/0.7-execution-order.md`): invert to an allowlist of plain commands —
any text with a git word at an executable boundary that also contains `$`, a backtick, a backslash, `<<`, parentheses
or a non-ASCII quote character is a push candidate routed to guard-push (which refuses every non-exact push form) — and
delete the shape-specific checks. Pin the Critic's traced shapes as RED tests first (test-only dispatch). Supersedes
the narrower items `2026-10-06-push-classifier-does-not-model-powershell-backtick-escapes.md` and
`2026-10-06-push-classifier-misses-nested-quotes-and-redirect-before-push.md` if (B) is chosen. Due before the 0.7.0
release candidate.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** fixed in source — closes after the 0.7.0 candidate host checklist (status stays `open` until then).
- **Rationale:** commit(s) `d9b4bf031, 49d6f928d`.
- **Assignment (if accepted):** sprint-alfred-epic close-out batch.
- **Date:** 2026-10-08.

## Merged from `2026-10-06-push-classifier-does-not-model-powershell-backtick-escapes` (created 2026-10-06; merged 2026-10-22)

*Carried over verbatim from the item closed as a duplicate of this one. What is unique to it: From the PowerShell item: PowerShell-lane shapes to pin as push cases (backtick escape of next character, here-strings @".."@ / @'..'@, $(...) inside double quotes). From the nested-quotes item: pin quotes nested in a double-quoted command substitution, a redirect between git and push (git 2>&1 push origin main), and the two documented accepted false positives (git diff with a substituted merge-base; heredoc commit message in a quoted substitution containing a boundary git word). The canonical's pin list names only the GPGL-8 F1-F5 shapes, so these should be added to its acceptance.*

**Front matter of the merged item, verbatim (status/ledger fields of the original):**

```yaml
schema: pipeline.backlog-item.v1
id: pipeline.push-classifier-does-not-model-powershell-backtick-escapes
type: defect
owner: pipeline
status: open
created: 2026-10-06
source: "GPGL-7 dispatch report (residual gap after the PowerShell literal-backslash reading), 2026-10-06."
sprint: alfred
done_when: manual
```

#### Description

GPGL-7 added a third reading to `scanShell` in `plugins/pipeline-core/lib/git-cmd.mjs` in which a backslash is always
literal, so PowerShell-executed pushes behind a backslash-terminated path or a `\"` are classified as pushes (Critic
finding F1 in `specs/sprint-alfred-epic/evidence/critic-2026-10-05/gpgl-5-6-delta.md`). PowerShell's own escape
character is the backtick, which this reading does not model, nor here-strings (`@"..."@`, `@'...'@`) or `$(...)`
subexpressions inside double quotes. A shape such as a double-quoted string closed early by a backtick-escaped quote,
followed by a statement that runs `git push`, is likely still classified as not-a-push on the PowerShell route
(static analysis by the implementor; not probed). `guard-push` is wired to the PowerShell tool (`hooks.json` matcher
`Bash|PowerShell`), so the gap is on a live gate lane. Modelling the backtick in every reading would over-detect POSIX
command substitution in double quotes, so it needs its own reading.

#### Triggering situation

GPGL-7 (PowerShell literal-backslash reading), open item in its report.

#### Affected artifact

`plugins/pipeline-core/lib/git-cmd.mjs`, `plugins/pipeline-core/lib/git-cmd.test.mjs`.

#### Proposal

Extend the PowerShell reading: backtick escapes the next character (outside single quotes), here-strings are one span,
`$(...)` inside double quotes is scanned as a nested command; pin the shapes as push cases; keep the fail-closed rule
(any reading a push → push). Alternatively, on the PowerShell tool lane fail closed whenever a backtick, here-string
marker or `$(` co-occurs with a git word at an executable boundary. Due before the 0.7.0 release candidate.

#### Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** fixed in source — closes after the 0.7.0 candidate host checklist (status stays `open` until then).
- **Rationale:** commit(s) `c9b9d0101, d9b4bf031`.
- **Assignment (if accepted):** sprint-alfred-epic close-out batch.
- **Date:** 2026-10-08.

## Merged from `2026-10-06-push-classifier-misses-nested-quotes-and-redirect-before-push` (created 2026-10-06; merged 2026-10-22)

*Carried over verbatim from the item closed as a duplicate of this one. What is unique to it: From the PowerShell item: PowerShell-lane shapes to pin as push cases (backtick escape of next character, here-strings @".."@ / @'..'@, $(...) inside double quotes). From the nested-quotes item: pin quotes nested in a double-quoted command substitution, a redirect between git and push (git 2>&1 push origin main), and the two documented accepted false positives (git diff with a substituted merge-base; heredoc commit message in a quoted substitution containing a boundary git word). The canonical's pin list names only the GPGL-8 F1-F5 shapes, so these should be added to its acceptance.*

**Front matter of the merged item, verbatim (status/ledger fields of the original):**

```yaml
schema: pipeline.backlog-item.v1
id: pipeline.push-classifier-misses-nested-quotes-and-redirect-before-push
type: defect
owner: pipeline
status: open
created: 2026-10-06
source: "GPGL-8 dispatch report (residual gaps after the expansion and typographic-quote fail-closed checks), 2026-10-06."
sprint: alfred
done_when: manual
```

#### Description

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

#### Triggering situation

GPGL-8 report, open items; GPGL-7 Critic record
`specs/sprint-alfred-epic/evidence/critic-2026-10-05/gpgl-7-fix-verification.md` (the finding class).

#### Affected artifact

`plugins/pipeline-core/lib/git-cmd.mjs`, `plugins/pipeline-core/lib/git-cmd.test.mjs`.

#### Proposal

Test-only dispatch first (pin both shapes as pushes and the two false positives as the documented accepted
behaviour), then an implementation dispatch: track substitution nesting depth in `scanShell` so inner quotes do not
close the outer span, and drop redirection operators and their targets before the word-position checks. Due before
the 0.7.0 release candidate.

#### Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** fixed in source — closes after the 0.7.0 candidate host checklist (status stays `open` until then).
- **Rationale:** commit(s) `7b0bb402a, 49d6f928d`.
- **Assignment (if accepted):** sprint-alfred-epic close-out batch.
- **Date:** 2026-10-08.
