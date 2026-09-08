# Overview

Agent-Pipeline is for controlled, agent-assisted software delivery where a team
needs a reviewable record beyond a chat history. It turns an intent into a
bounded change, deterministic evidence, independent review, and a preserved
decision. Candidate-bound receipts and validated packages can support an audit
trail; they do not certify compliance or replace an auditor.

## The release line: 0.6.2

`0.6.2` is the current release. It combines a completed, integrated Phoenix
foundation with the Nova increment released in that version.

| Product strand | What it contributes in this release | Status |
| --- | --- | --- |
| Phoenix | Durable delivery governance: explicit human decisions, candidate-bound evidence, deterministic gates before review, safe external-action boundaries, and recoverable public records. | Integrated foundation |
| Nova | Runner-aware execution and guided adoption: public Driver actions, resumable onboarding context, a real verify setup, and scoped parallel delivery. | Active; the listed subset is released in `0.6.2` |

The release's Greenfield route is covered for Claude, Codex, and Antigravity:
from an empty directory through public onboarding actions, plan approval and a
real verify command to the first implementation step. A runner follows the
returned Driver action and fills only its named human placeholders. That makes
the next step discoverable instead of relying on an agent remembering internal
commands.

Runner integrations are intentionally described by their evidence. A common
methodology does not mean that every host has identical native hooks, sandbox
isolation, model identity, or platform coverage. Missing, stale, malformed, or
candidate-mismatched evidence stays a typed non-success.

## What is still a roadmap item

Nova B remains active. It contains the next usability and operations work, such
as easier plan amendments and formal close, clearer runner-specific approval
and verify guidance, delivery-loop observability, and additional
platform-specific evidence. Those items do not reduce the controls that are
already integrated through Phoenix, and this overview does not present them as
completed.

For the product entry point, use the top-level [README](../README.md). For
the normal next documents, use the [documentation map](README.md):
[Usage](usage.md) gives the routine journey, while [enforcement](enforcement.md),
[audit and evidence](audit-and-evidence.md), [security controls](security-controls.md),
[cost and measurement](cost-and-measurement.md), and [parallel work](parallel-work.md)
provide the relevant reference boundaries. [Operating Model](operating-model.md)
is the normative process contract.
