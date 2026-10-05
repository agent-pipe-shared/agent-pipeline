---
schema: pipeline.backlog-item.v1
id: pipeline.guard-push-refuses-a-read-only-git-grep-no-index-as-ambiguous-push-target
type: defect
owner: pipeline
status: open
created: 2026-10-05
source: "Live observation 2026-10-05 (Alfred session): ALFRED-BACKLOG-20261005 defect 10."
sprint: alfred
done_when: manual
---

# guard-push refuses a read-only `git grep --no-index` with "push target is not unambiguous"

## Description

A read-only `git grep --no-index ... -- <scratch json file>` was refused by guard-push with "push target is not unambiguous". The command neither pushes nor writes; the refusal is a false positive that blocks a legitimate diagnostic read and spends budget.

## Triggering situation

Reproduction shape: run `git grep --no-index <pattern> -- <path to a scratch JSON file>` in a session with the push guard active. Exact trigger (the `--no-index` flag, the `--` separator, or the path shape) is not isolated yet.

## Affected artifact

`plugins/pipeline-core/hooks/guard-push.mjs` (push-target classification of git subcommands).

## Proposal

Classify `git grep` (all flag combinations) as non-push before target parsing; add a regression test with the exact refused shape. Isolate which token triggers the refusal first.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
