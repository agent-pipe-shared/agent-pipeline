---
schema: pipeline.backlog-item.v1
id: pipeline.consumer-must-allowlist-every-runner-lane
type: workflow-improvement
owner: pipeline
status: closed
closed_at: 2026-09-11
closure_repository: self
closure_commit: d0857abbedb6f86d3e57436cd443f5878ff1eded
closure_evidence: backlog/evidence/2026-09-11-consumer-runner-permission-onboarding.md
created: 2026-08-28
sprint: nova-b
tracking: "Nova B — onboarding should write the permission entries a consumer needs, instead of leaving a second blocking layer undocumented"
source: "Consumer project HA, incident report S56 finding B4 (2026-08-28, Windows, Claude runner)."
done_when: manual
---

# Onboarding leaves the runner's own permission layer to the consumer

## What was measured

The consumer's `.claude/settings.json` allow entry covers exactly one invocation form:

```json
"Bash(node \"D:\\Dev\\agent-pipeline-local-marketplace\\plugins\\pipeline-core\\scripts\\*)"
```

Not covered: the **PowerShell lane**, which has no entry at all, and the **same paths
written with forward slashes**. The consequence is nondeterminism, not a clean refusal:
identical invocations sometimes run and sometimes are refused by the runner's own
auto-mode classifier. In one session
`project-onboarding-v3.mjs inspect --intent session` went through on the PowerShell lane
and was refused twice twenty minutes later.

This is a second blocking layer, independent of the Pipeline's own guards. It is what
turned a guard deadlock into a total stop — with the Bash lane guard-refused and the
PowerShell lane classifier-refused, the session had no way to act at all.

## Why this belongs to onboarding

A consumer needs these entries for the Pipeline to run autonomously at all, and nothing in
the onboarding flow mentions them. Leaving it to the project means every consumer
rediscovers it, and rediscovers it as intermittent failures rather than as a missing
setting.

## Direction

Onboarding writes the allow entries for every runner lane and path spelling it actually
uses — or ships a verified template and names it as a required step. Path spelling matters
on Windows specifically: the same file reached via backslashes and forward slashes must
both be covered.

Note the boundary: these entries are the RUNNER's permission surface, not a Pipeline
guard. Widening them does not widen any Pipeline gate, and the Pipeline's own guards keep
applying unchanged.

## Acceptance criteria

- A freshly onboarded project can invoke every pipeline script the flow itself hands it,
  on every lane that flow uses, without a per-project manual edit.
- Path spellings that differ only in separator are both covered on Windows.
- The onboarding output states plainly that this layer exists and what was written.

## Related

- `2026-08-28-the-readiness-guard-blocks-the-recovery-command-it-names.md` — the deadlock
  this gap makes unrecoverable.

## Closure — 2026-09-11

Commit `d0857abb` makes onboarding own the complete runner permission
projection, including the Bash/PowerShell and separator variants it uses,
while treating host-managed Codex permissions explicitly as not applicable.
Ready validation, safe partial repair and fail-closed malformed-settings
handling passed focused tests and an independent correction Critic. See the
closure evidence.
