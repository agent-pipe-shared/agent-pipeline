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

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
