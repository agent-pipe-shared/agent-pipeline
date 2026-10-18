---
schema: pipeline.backlog-item.v1
id: pipeline.read-only-npm-registry-queries-have-no-admitted-route
type: defect
owner: pipeline
status: open
created: 2026-10-19
source: "real greenfield project report 2026-10-19 (PF-24)"
sprint: none
done_when: manual
---

# Read-only npm registry queries have no admitted route

## Description

A read-only research subagent in a consumer project needed version and peer-dependency data
(`npm view <package> peerDependencies`) for version planning before the first dispatch. The
shell guard refused the command, and the agent fell back to HTTP requests against the
registry. No admitted route for read-only package metadata queries is documented.

## Triggering situation

Version planning in phase `implementation`, a background research subagent without a
dispatch record.

## Proposal

Admit a closed, read-only `npm view <package> [field]` form, which installs and executes
nothing, or document the admitted alternative in the agent obligations.

## Acceptance

- `npm view <package> <field>` is admitted with a pin, while `npm install`, `npm exec` and
  lifecycle scripts stay refused; or the documented alternative is named in the generated
  agent obligations.
