---
schema: pipeline.backlog-item.v1
id: pipeline.codex-read-only-steps-escalate-individually-instead-of-once
type: idea
owner: pipeline
status: open
created: 2026-08-09
source: "Live Codex+Pipeline 0.5.4 greenfield test session, 2026-08-09 (three rollout files) — 98 individually-escalated read-only sandbox approvals measured across the session."
due: 2026-08-23
---

# Every host-bound read-only Codex step escalates individually — a session-scoped read grant would cut most of it

## What happened

Counting `exec_command` calls carrying `sandbox_permissions: require_escalated`
across the three rollout files of one Codex greenfield test session: 98
total (6 + 24 + 68 across the session's three files), each with its own
one-off justification string, for what are almost entirely read-only
diagnostic/inspection actions (reading the onboarding contract, checking the
Verify command, inspecting guard-internal code, etc.).

## Why this is not a same-night code fix

This is primarily **Codex CLI's own sandbox/approval-mode behavior**
(`sandbox_permissions`), not a Pipeline guard hook decision — the
Agent-Pipeline plugin does not control how many times Codex's own harness
asks its operator for escalation on a read-only command. A fix here is more
likely a **documented Codex invocation/configuration recommendation** at
onboarding time (e.g. suggesting a specific Codex sandbox/approval mode for
the project root, if one exists that safely covers read-only work without
approval-mode escalation) than a Pipeline-side code change.

## Direction

Investigate what Codex CLI configuration (sandbox mode, approval policy, or
a scoped read-only grant) would reduce this without loosening what the
Pipeline's OWN guard hooks independently enforce, and if one exists, document
it in the Codex-specific onboarding/bootstrap guidance. If no such Codex-side
setting exists, this may not be actionable from the Pipeline side at all —
say so explicitly rather than leaving it open indefinitely.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
