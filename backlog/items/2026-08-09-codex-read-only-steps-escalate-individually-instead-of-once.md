---
schema: pipeline.backlog-item.v1
id: pipeline.codex-read-only-steps-escalate-individually-instead-of-once
type: idea
owner: pipeline
status: closed
created: 2026-08-09
source: "Live Codex+Pipeline 0.5.4 greenfield test session, 2026-08-09 (three rollout files) — 98 individually-escalated read-only sandbox approvals measured across the session."
due: 2026-08-23
closed_at: 2026-08-12
closure_repository: self
closure_commit: 181b7730
closure_evidence: "backlog/items/2026-08-09-codex-read-only-steps-escalate-individually-instead-of-once.md#triage (this item's own Triage section, bounded investigation NVA-BL-71)"
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

- **Decision:** Option A first (one bounded investigation into a Codex CLI
  sandbox/approval-mode setting) — if it yields nothing quick/cheap, close
  per Option B rather than leave it open. PO's own framing: the sandbox
  approval-mode surface is a large problem outside what a same-session fix
  can realistically move, so do not over-invest chasing it.
- **Rationale:** PO, 2026-08-12: "so wie empfohlen, wenn A nichts schnelles
  billiges liefert einfach B und schließen da sandbox ein riesen problem
  ist."
- **Assignment (if accepted):** one bounded investigation pass queued this
  session; close immediately after if nothing cheap is found.
- **Date:** 2026-08-12

## Investigation result (NVA-BL-71, bounded pass, 2026-08-12)

- This repo carries no existing notes, config, or documentation about a Codex
  CLI setting (`sandbox_permissions`, `sandbox_mode`, `approval_policy`, or
  equivalent) that would grant a session-scoped read-only exemption from
  per-call escalation. A repo-wide search turned up no prior investigation
  output beyond this item itself and `2026-07-19-codex-sandbox-critic-longterm.md`
  (an unrelated Sentinel-baseline placeholder, no content on this topic).
- The relevant setting, if any, lives entirely in Codex CLI's own external
  configuration (its config file / CLI flags), outside this repo's control
  and outside what a bounded, repo-scoped pass without live network/Codex-doc
  access can verify or safely recommend. Codex's approval-mode surface
  (e.g. loosening from "always escalate" toward an "on-failure" or "never"
  policy) is a security-relevant knob on Codex's own side — recommending a
  specific value in onboarding without being able to verify current Codex CLI
  behavior/documentation would be exactly the kind of unverified, potentially
  weakening guidance this investigation was scoped to avoid.
- No quick/cheap, verifiably-safe doc addition exists to make from inside
  this repo. Per the pre-recorded Triage decision (PO, 2026-08-12): closing
  now rather than leaving open, consistent with "sandbox ein riesen problem
  ist" — a large problem area outside what a bounded pass can move.
- **Disposition:** closed, not actionable from the Pipeline side within
  bounded scope. If Codex CLI's own documentation is later reviewed with
  proper access/tooling and a safe setting is confirmed, re-open as a new
  backlog item rather than reopening this one.
