---
schema: pipeline.backlog-item.v1
id: pipeline.advertised-git-to-head-pipeline-is-refused
type: defect
owner: pipeline
status: open
created: 2026-10-03
source: "Manual observation, Claude Code session on Windows, 2026-10-03, feat/sprint-alfred at a0d83ce78."
sprint: alfred
done_when: manual
---

# Advertised `git … | head -n N` pipeline is refused as an unapproved operator

## Description

Every guard refusal lists the closed admitted grammar, including "bounded
git-to-head diagnostic pipeline: `git <read-only-subcommand> ... | head -n N`".
The command `git show HEAD:docs/state.md | head -n 200` is nevertheless refused
with `GUARD-OPERATOR-UNAPPROVED` (rejected element: the operator `|`). The
refusal therefore contradicts its own grammar text. The un-piped `git show
HEAD:docs/state.md` is admitted.

This may be a regression of the closed item
`2026-08-29-read-scope-guard-admits-single-command-but-blocks-the-piped-form.md`,
or a parser problem specific to the `<rev>:<path>` argument form. Not yet
measured.

## Triggering situation

Bootstrap reading of `docs/state.md` while native reads were blocked (see
`2026-10-03-claude-windows-guard-refuses-every-in-repo-read.md`).

## Affected artifact

`plugins/pipeline-core/hooks/guard-command-grammar.mjs` and the pipeline
admission in `guard-lifecycle-ready.mjs`. The grammar text emitted in refusals
must match what is actually admitted.

## Proposal

Add a test pairing each grammar example the refusal text advertises with an
actual admission check, so advertised and admitted shapes cannot drift apart.
Then fix the `git … | head` case, including `<rev>:<path>` arguments.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** the original defect (`git <read-only> ... | head`, including `<rev>:<path>`) is fixed and pinned; the 2026-10-18 addendum is partly fixed and partly open (see the measurement below).
- **Rationale:** `plugins/pipeline-core/lib/pins/advertised-git-to-head-pipeline-is-refused.test.mjs` pairs every advertised grammar example with an admission check and drives the real grammar.
- **Assignment (if accepted):**
- **Date:** 2026-10-22.

## Measurement 2026-10-22 of the addendum shapes (current head)

- Admitted now: `rg -o <pattern> <file>`, `ls -la <dir>`, `ls -la`, `rg -n ... | head -n N`.
- Still refused, fix handed over as a patch for the protected grammar file (`hooks/guard-command-grammar.mjs`
  `SEARCH_BOOLEAN`): `rg -c`, `rg --count`, `rg --no-filename` (also `-I`, `-H`, `--with-filename`). `rg -h` is not
  added: in ripgrep it is the help flag.
- Refused on purpose today, needs a guard-owner decision: `git -C <repo> show <rev>:<path> | head -n N`.
  `isBoundedGitPipeline` excludes `-C` as a cross-repository reach, while the un-piped form admits `-C <dir inside the
  roots>`. Also refused, by the AP11 contract of the Windows read pin: `git show <rev>:<path>` combined with any other
  token (`--format=`, `--`, `--stat`), so `git show HEAD:<path> --format= -- | head` stays refused until that contract is
  widened by a decision.
- The refusal text does not name the triggering flag. `plugins/pipeline-core/lib/read-command-diagnosis.mjs` (new, with
  its own suite) names the one flag whose removal makes the grammar admit the command; the call site is a protected guard
  file, handed over as a patch. A value-taking bad flag, two bad flags and a bad operand are deliberately not diagnosed.

Pin additions (same file as above) carry the admitted shapes as green cases and the three open shapes as `todo` cases that
name their patch or decision. Counted result, run alone on 2026-10-22: 54 cases, 48 pass, 0 fail, 0 skipped, 6 todo.

## Observed 2026-10-18: real greenfield project, Claude on WSL (PF-17)

The closed shell grammar admits `git show HEAD:<path> | head -n 3` but refuses
`git -C <repo> show HEAD:<path> --format= -- | head -n 3` as an "unapproved operator". Also
refused in `draft`/`approved`: `rg -o --no-filename ...`, `rg -c "<pattern>" <file>` and
`ls -la <path>` inside the project, while `rg -n ...` passes. The refusal message does not
name the flag or operator that triggered it.
