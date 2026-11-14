---
schema: pipeline.backlog-item.v1
id: pipeline.dispatch-checks-run-outside-the-consumer-verify-command
type: workflow-improvement
owner: pipeline
status: open
created: 2026-11-14
source: "Peer consumer session report 2026-11-14 (toil, K-39 in the candidate 29d notes)"
sprint: alfred
done_when: manual
---

# Dispatch checks run per item but outside the consumer's own verify command

## Description

A consumer's dispatch checks (`*.check.test.mjs`) are run by the host for each item, but the consumer's own verify command (for example `verify:ci`) does not run them. Nothing tells the consumer so: a green verify run can coexist with a red dispatch check, and the consumer only learns about the gap when a dispatch check fails at item time.

## Done when

The briefing or the close names the gap (which checks the host runs that the verify command does not), or a registration route lets the consumer add its dispatch checks to the verify command, and the PO has chosen which.
