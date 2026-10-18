---
schema: pipeline.backlog-item.v1
id: pipeline.git-03-forbids-provider-trailers-the-runner-environment-demands
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-18
source: "real greenfield project report 2026-10-18 (PF-08)"
sprint: none
done_when: manual
---

# GIT-03 forbids provider trailers that the runner environment demands

## Description

GIT-03 rejects provider `Co-Authored-By` trailers and session URLs in commit messages. The
runner environment instructs the agent to add exactly those lines to commits. The two
instructions conflict; it is not a pure Pipeline defect. In the project, the Pipeline rule won.

## Triggering situation

First commit in a real greenfield project. Sources: `guardrails/git.md`,
`templates/prompts/agent-obligations.md`.

## Proposal

State the precedence in the agent-obligations text (the Pipeline rule wins over runner-injected
commit instructions) and consider a refusal message that names the conflicting source.

## Acceptance

- The obligations text names the conflict and the winning rule.
- The GIT-03 refusal message points to that text.
