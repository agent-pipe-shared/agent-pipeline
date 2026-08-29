---
schema: pipeline.backlog-item.v1
id: pipeline.heredoc-refusal-teaches-no-substitute
type: defect
owner: pipeline
status: open
created: 2026-08-28
sprint: nightwing
done_when: contains plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs heredocFileRemediation
source: "PO question, 2026-08-28: 'wäre es nicht sinnvoll heredoc gehärtet zuzulassen?' — asked after the Elephant hit the heredoc refusal twice in one session (a `cat >> … << 'CLOSURE'` append and a multi-line commit message), each time paying a detour through a scratch file or the Edit tool. Measured against guard-lifecycle-ready.mjs the same day."
---

# A heredoc refusal names the rule but teaches no substitute, while the sibling shape one screen above teaches its own

## What happens

`cat >> <file> << 'EOF'` is refused with `GUARD-PARSE-UNSUPPORTED`, rejected
element *"a newline character inside the command text"*, and
`{"schema":"pipeline.guard-retry-actions.v1","retryActions":[]}`. No remediation
line is printed. The caller is told the construct is outside the grammar and
nothing about what to use instead.

The substitute is fixed, safe, and always available — the `Write` tool for a new
file, `Edit` for an append — but the refusal never names it, so every session
rediscovers it by trial. Two such detours happened in the session that filed
this item.

## Why this is not the closed sibling item

`2026-08-08-the-grammar-refusal-does-not-say-which-part-of-the-command-failed.md`
is **closed** (`8e2d21ca`, 2026-08-18) and its closure is correct on its own
terms. Two of its three directions landed, and re-measuring them today confirms
both still hold:

- Direction 1 (name the failing element) is live — the refusal above does say
  *"a newline character inside the command text"*, via `deniedElement()`
  (`guard-lifecycle-ready.mjs:345`).
- Direction 2 (a real remediation for the newline case) landed as
  `commitMessageFileRemediation()` (`:1995`) under GRAMMARHINT-1 AC-2.
- The `retryActions: []` on an operator/redirect denial was measured to be
  **intentional, not an omission** — any command reaching that branch contains
  one of `|&<>()`, and `retryActionsForDeniedCommand()` returns `[]` on the
  first such character. Wiring it through would be dead code. That finding is
  sound and is not reopened here.

What that closure did not cover is the *scope* of the remediation it shipped.
`commitMessageFileRemediation()` is deliberately narrow — measured at
`:1996-1999`, it returns `null` unless all three hold: the command starts with
`git commit`, an `-m`/`--message` flag is present, and a literal newline exists.
A heredoc satisfies only the third. It therefore falls through to `null`, and
`retryActionsForDeniedCommand()` independently returns `[]` because the command
contains `<`. **Both paths yield nothing, for two unrelated reasons.**

So the closed item fixed one shape. The heredoc is the second-most-common
multi-line construct an agent reaches for, and it is uncovered.

## What this item is explicitly NOT asking for

**It does not ask to admit heredocs into the closed grammar.** That was the PO's
opening question and the answer is no, on three measured grounds:

1. **It would add no capability, only a second path to an existing one.** File
   creation is `Write`, append is `Edit`, a multi-line commit message is
   `git commit -F`. A guard would have to cover the second path as completely as
   the first, for zero new reach.
2. **An unquoted delimiter executes.** `<<EOF` (as opposed to `<<'EOF'`) applies
   parameter expansion and command substitution to the body, so `$(…)` inside
   what looks like inert data is real execution. A hardened form would have to
   mandate a quoted delimiter — statically checkable, but a rule that can never
   be wrong once.
3. **The parser surface grows out of proportion.** `<<-` tab-stripping, multiple
   heredocs in one command, a delimiter recurring in the body, nesting. The
   safety argument for the closed grammar rests on the current rule being
   trivially decidable ("no newline at all"); every one of those cases is a place
   for it to be subtly wrong.

The friction the PO correctly identified is real. The fix is to make the refusal
teach, not to widen what it admits.

## Direction

Extend the remediation family, following the precedent already in the file
rather than inventing a mechanism:

1. Add a heredoc-shaped sibling to `commitMessageFileRemediation()` — detected
   narrowly by raw text (a `<<` or `<<-` followed by a delimiter token), never by
   re-parsing into the closed grammar, exactly as the existing function is
   documented to do at `:1987-1993`.
2. Emit it as **message text, never as a typed retryAction.** This is not a style
   choice: AC-047-140 admits an entry into `pipeline.guard-retry-actions.v1` only
   when every action is a separate-tool-call, independently admitted *read-only*
   diagnostic, and `denialRetryActions()` (`lib/human-guard-override.mjs`) drops
   any action whose `mutation` is not `false`. A file write is a mutation. The
   existing function documents this same reasoning at `:1977-1984` and it applies
   unchanged.
3. Keep it strictly non-normative: printing a remediation must not change what
   the grammar admits (the existing AC-3). A false negative prints nothing, which
   is never worse than today's silence; a false positive must be impossible.

## Acceptance criteria

- A refused heredoc prints a remediation line naming the `Write`/`Edit` route.
- The verdict for every command shape is byte-identical to today — the guard's
  existing suite passes unchanged, and a new test pins the added line.
- No heredoc becomes admissible. A test asserts the refusal still fires.
- The commit-message remediation is untouched and still fires for its own shape.

## Related

- `2026-08-08-the-grammar-refusal-does-not-say-which-part-of-the-command-failed.md`
  — closed; this is the uncovered remainder of its Direction 2, not a reopening.
- `2026-08-27-shell-grammar-reads-quoted-content-as-shell-syntax.md` and
  `2026-08-27-a-read-only-command-is-refused-for-naming-a-protected-path.md` —
  the same grammar-precision family, both `nightwing`, both open. Those two are
  false positives on safe commands; this one is a correct refusal that teaches
  nothing. Related in area, distinct in kind.
