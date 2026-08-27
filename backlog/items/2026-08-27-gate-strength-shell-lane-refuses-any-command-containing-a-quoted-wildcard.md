---
schema: pipeline.backlog-item.v1
id: pipeline.gate-strength-shell-lane-refuses-any-command-containing-a-quoted-wildcard
type: defect
owner: pipeline
status: open
created: 2026-08-27
source: "Live observation, 2026-08-27: a cat >> heredoc appending to a gitignored scratch note was refused with GUARD-GATE-STRENGTH-SHELL. Independently reproduced in the same session by a diagnostic command whose text happened to contain a quoted asterisk."
---

# The gate-strength shell lane refuses any command containing the literal `*` in quotes, whatever the command actually targets

## Description

`guard-lifecycle-ready.mjs`'s `gateStrengthShellRefusal()` derives its match
needles from every entry's basename in `GATE_STRENGTH_PATHS`
(`guard-gate-strength.mjs`). One entry's path is
`project/.onboarding-staging/*` (a wildcard glob describing a directory of
staging files) — whose `basename()` is the single character `*`. Because the
classifier matches on the needle appearing anywhere in the command text
(`haystack.includes(needle)`-shaped, per the guard's own documented
rationale), **any shell command whose text contains a quoted `*` character
for any reason at all** is refused with `GUARD-GATE-STRENGTH-SHELL: This
command names *, a file whose contents decide how strong a gate is.` — even
when the command touches no file under `project/.onboarding-staging/` and no
gate-strength artifact whatsoever.

## The instance

On 2026-08-27, a `cat >> …` heredoc appending to a gitignored scratch note
was refused this way. The command touched no gate-strength file; the text
merely contained a quoted asterisk as a hook-matcher literal being
documented in the note. Independently reproduced in the same session: a
`rg`-based diagnostic command whose text happened to contain a quoted
asterisk (searching for a literal `*` character across backlog items) hit
the identical refusal, again touching no gate-strength file.

## Why this is not the file-substring-matching class already fixed elsewhere

This is not the same shape as the (closed) defect where a filename like
`fakesecrets.yaml` or `pipeline.yaml.bak` substring-matched a *real*
protected filename. There, the needle was a meaningful multi-character
filename and the false positive was a naming coincidence. Here, the needle
that produces every false positive is a single wildcard glob character with
no meaning as a literal filename at all — the false-positive surface is not
"a file that happens to resemble a protected name" but "any command whose
text contains this one common shell/regex/glob character in a quoted
context, for a completely unrelated reason."

## The guard's own account of the shape

The denial text states the mechanism and its own limits directly: the match
is on the file NAME appearing in the command, not on a detected read or
write, so the rule "cannot tell a read from a write inside an arbitrary
shell command" and refuses both. It also states there is **deliberately no
override for this shell lane** — not even the audited human-guard-override
ceremony that exists for other refusal classes. The only stated workaround
is to use Edit/Write instead of a shell command for in-repo file changes —
which covers only file mutation, not a command that legitimately needs to
name the literal character for an unrelated purpose (documenting a hook
matcher, searching for the character itself, etc.).

## Why the blast radius just grew

A match-all hook matcher (a bare `*` matcher pattern) was introduced into
this repository's own documentation in the same block of work that produced
this observation. Documenting, discussing, or searching for such a pattern
in normal shell commands is now measurably more likely to collide with this
refusal than before — the false-positive surface and the reason to write
commands that trip it grew in the same session.

## Triggering situation

Live observation, 2026-08-27, during backlog-item filing work: a heredoc
append to a gitignored scratch note was refused; a later `rg` diagnostic
searching for the literal character reproduced it independently.

## Affected artifact

- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`
  (`gateStrengthShellRefusal()`)
- `plugins/pipeline-core/hooks/guard-gate-strength.mjs`
  (`GATE_STRENGTH_PATHS`, the `project/.onboarding-staging/*` entry whose
  basename is `*`)

## Not proposed here

This item records the gap, not a fix. Whatever a narrower classifier would
look like — requiring a path separator before the needle, excluding
single-character wildcard-glob needles from the shell-lane match set,
something else — trades a name-matching classifier's simplicity against its
false-positive rate, and that trade-off is a design question, not a triage
one.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
