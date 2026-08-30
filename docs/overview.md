# Overview

The current overview lives in the top-level [README](../README.md): it explains
the roles, the value of independent review and evidence, and why the pipeline
scales from an individual developer to a governed team.

## 0.6.0 candidate at a glance

`0.6.0` is a local candidate, not a published release. Its Nova outcome is one
guided Greenfield route: from an empty project directory, the runner follows
only public Driver actions through onboarding, plan approval, verify setup, and
the first implementation file. Human data stays explicit: a runner replaces
only the placeholders named by the returned action, and the first trust anchor
can use an existing key or create a new one.

The automated end-to-end contract covers Claude, Codex, and Antigravity.
Phoenix's result is a boundary, not a marketing claim: missing, stale,
malformed, or candidate-mismatched evidence remains a failure, and the
candidate is not published until its release evidence and three independent
live Greenfield runs are complete. See [What's new in
0.6.0](whats-new-0.6.0.md) for the precise candidate status.

For the normative workflow, use [`../PIPELINE_FLOW.md`](../PIPELINE_FLOW.md)
and [`operating-model.md`](operating-model.md). For installation and adoption,
use [`../SETUP.md`](../SETUP.md).
