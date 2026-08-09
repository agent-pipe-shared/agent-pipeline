---
schema: pipeline.backlog-item.v1
id: pipeline.fresh-repo-onboarding-never-asks-for-git-identity
type: defect
owner: pipeline
status: open
created: 2026-08-09
source: "Turn-efficiency root-cause analysis of the PO's private Claude+Pipeline 0.5.4 happy-path test run, 2026-08-09 (sanitized, no PO-identifying data)."
due: 2026-08-16
---

# Onboarding initializes a brand-new `.git` without ever provisioning `user.name`/`user.email`, so the first commit fails instead

## What happened

In the 2026-08-09 Claude test run, onboarding initialized a fresh repository
(`git init` as part of the bootstrap/kickoff flow) but never checked or asked
for git author identity. The first implementation commit failed with git's
own "Please tell me who you are" error; the agent then had to stop mid-task,
diagnose it, and either set local config or fall back to a global one — a
detour that a repo-creation-time check would have avoided entirely.

## Direction

At the point onboarding first runs `git init` for a brand-new repository
(`project-onboarding-v3.mjs`, `initialize-runtime` / `kickoff apply` step),
check for a usable `user.name`/`user.email` (local or global git config).
If neither resolves, ask once at that point rather than discovering the gap
at first-commit time. Low risk, one-time check, no guard/security surface.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
