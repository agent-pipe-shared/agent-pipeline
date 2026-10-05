---
schema: pipeline.backlog-item.v1
id: pipeline.guard-push-treats-gitleaks-as-a-git-command
type: defect
owner: pipeline
status: open
created: 2026-10-05
source: "Observed live, Alfred session, 2026-10-05."
sprint: alfred
done_when: manual
---

# The push guard treats a gitleaks call as a git command

## Description

A direct `gitleaks detect ...` Bash call is refused by the push guard with
"push command prefix is ambiguous". The refusal looks like a prefix match on
the command name (`git` matches the start of `gitleaks`).

## Triggering situation

Running `gitleaks detect` directly from a Bash call in the 2026-10-05 session.

## Affected artifact

`plugins/pipeline-core/hooks/guard-push.mjs` (command classification).

## Proposal

Match the executable token exactly (`git`, not a string prefix) and add a
regression case that admits `gitleaks detect ...` and still refuses real
ambiguous `git` push forms.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
