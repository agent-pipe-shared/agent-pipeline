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

- **Decision:** fixed in source — closes after the 0.7.0 candidate host checklist (status stays `open` until then).
- **Rationale:** commit(s) `6b0413700, 6ca4474d3`.
- **Assignment (if accepted):** sprint-alfred-epic close-out batch.
- **Date:** 2026-10-08.

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **HOST-SESSION-NEEDED** — The triage closes the item only after the 0.7.0 candidate host checklist
  The pin (no case is skipped on host limits) is source-level; the checklist step (AC-32) installs the 0.7.0 candidate and issues a real `gitleaks detect` Bash call in an installed host. Install and the host session are PO acts; observed: the call is admitted while real ambiguous git push forms stay refused.
