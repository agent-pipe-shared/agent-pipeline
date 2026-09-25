# Overview

Agent-Pipeline is for controlled, agent-assisted software delivery where a team
needs a reviewable record beyond a chat history. It turns an intent into a
bounded change, deterministic evidence, independent review, and a preserved
decision. Candidate-bound receipts and validated packages can support an audit
trail; they do not certify compliance or replace an auditor.

## The next release line: 0.7.0

`0.7.0` names the next distributed Alfred architecture scope. Until that
version is released, an application repository continues to use its approved
GitHub-distributed plugin version; a maintainer candidate is not an
installation recommendation, production-availability claim, or proof that
release gates passed. The scope adds a staged adoption route for existing
repositories, a machine-readable architecture map, baseline and fitness
checks, and typed architecture impact at feature close. Begin with the
read-only [adoption status and proposal](usage.md#assess-architecture-adoption-in-an-existing-project)
in the repository you intend to govern.

| Product strand | What it contributes to this release scope | Status |
| --- | --- | --- |
| Phoenix | Durable delivery governance: explicit human decisions, candidate-bound evidence, deterministic gates before review, safe external-action boundaries, and recoverable public records. | Integrated foundation |
| Nova | Runner-aware execution and guided adoption: public Driver actions, resumable onboarding context, a real verify setup, and scoped parallel delivery. | Nova A/B implementation is present in the repository; final 0.7 candidate-bound issue-criteria acceptance remains pending. |

The documented Greenfield route is covered for Claude, Codex, and Antigravity:
from an empty directory through public onboarding actions, plan approval and a
real verify command to the first implementation step. A runner follows the
returned Driver action and fills only its named human placeholders. That makes
the next step discoverable instead of relying on an agent remembering internal
commands.

Runner integrations are intentionally described by their evidence. A common
methodology does not mean that every host has identical native hooks, sandbox
isolation, model identity, or platform coverage. Missing, stale, malformed, or
candidate-mismatched evidence stays a typed non-success.

## What is not yet qualified for 0.7

Closing a Nova backlog item records that its delivery work was handled; it is
not a substitute for checking every issue acceptance criterion against the
final integrated 0.7 tree. Nova A/B source includes runner and workflow
capabilities, but the current candidate still needs criterion-level evidence,
full Verify, security checks, independent review, and any applicable human
acceptance. Host-dependent behavior also needs readback from the runner that
actually executes it. This overview therefore does not claim a released or
fully accepted Nova B package, nor does it demote the integrated implementation
back to a future roadmap promise.

For the product entry point, use the top-level [README](../README.md). For
the normal next documents, use the [documentation map](README.md):
[Usage](usage.md) gives the routine journey, while [enforcement](enforcement.md),
[audit and evidence](audit-and-evidence.md), [security controls](security-controls.md),
[cost and measurement](cost-and-measurement.md), and [parallel work](parallel-work.md)
provide the relevant reference boundaries. [Operating Model](operating-model.md)
is the normative process contract.
