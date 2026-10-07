---
schema: pipeline.backlog-item.v1
id: pipeline.a-read-only-probe-can-dump-the-process-environment-into-a-transcript
type: defect
owner: pipeline
status: open
created: 2026-10-07
source: "Q12 Critic round 1 disclosure, specs/sprint-alfred-epic/evidence/critic-2026-10-07/q12-round1.md; toil T46"
sprint: alfred
done_when: manual
due: 2026-10-20
---

# A read-only probe can dump the process environment into a transcript

## Description

During a review, a Critic ran a command-classifier control case (`"/usr/bin/env" <<EOF …`) as a real shell command
instead of passing it as a string to the classifier. `env` printed the whole process environment, including a messaging
token and session identifiers, into the agent's tool output (a local transcript). No guard refused it, because the command
is read-only and outside the push/write classes.

## Triggering situation

Q12 Critic round 1, 2026-10-07 (disclosed by the Critic itself; values not reproduced).

## Affected artifact

`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` (closed shell grammar / read-only diagnostic admission),
`templates/prompts/critic-review.md`, `templates/prompts/agent-obligations.md`.

## Proposal

Test-first: the guard refuses commands whose effect is to print the environment (`env`, `printenv`, `set` without
arguments, `export -p`, `Get-ChildItem env:`, `$env:` dumps, `/proc/self/environ` reads) for agent sessions, with a typed
code and no override route; the Critic and Goldfish templates state that command strings under test are passed as data to
the function under test and never executed. Owner: pipeline; due before the 0.7.0 release candidate.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
