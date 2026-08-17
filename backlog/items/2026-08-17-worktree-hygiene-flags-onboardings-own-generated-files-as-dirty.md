---
schema: pipeline.backlog-item.v1
id: pipeline.worktree-hygiene-flags-onboardings-own-generated-files-as-dirty
type: defect
owner: pipeline
status: open
created: 2026-08-17
source: "Second, independent Codex happy-path test (PO, project 'Rune_Test1_Codex_055_50' / 'ruinen-browsergame', 2026-08-17), relayed as an AI-authored forensic report and independently re-verified against this checkout's own current source and the raw rollout transcripts before being filed."
---

# Worktree hygiene reports `current-worktree-dirty` purely because of files the onboarding flow itself just generated

## Description

`plugins/pipeline-core/lib/worktree-lifecycle.mjs:1436` flags
`current-worktree-dirty` from a raw `git status --porcelain`, with no
allowlist for files the pipeline's own onboarding flow generates as part of
its normal, expected first run (`.claude/pipeline.json`,
`.claude/settings.json`, `pipeline.user.yaml`, `specs/**`, resume-hint,
etc.). Confirmed live: the hygiene receipt in the raw transcript fails on
exactly this onboarding scaffolding, not on anything actually risky — counts
in the receipt showed zero active session manifests, zero non-canonical
worktrees, zero pipeline residue; the sole reported reason was
`current-worktree-dirty`.

**Caveat, confirmed during verification:** hygiene is a separate diagnostic
check, not a session-blocking gate (`lifecycle-ready-enforcement.test.mjs:90`)
— so this does not itself stop a session, but it does produce a
misleading/alarming false-positive result for the single most common case
(a project's first run, right after onboarding).

## Affected artifact

`plugins/pipeline-core/lib/worktree-lifecycle.mjs` (~1436, the raw
`git status --porcelain` check with no generated-file allowlist).

## Proposal

Not designed here. Direction: classify unversioned/modified paths into at
least "expected pipeline-generated" vs. "genuinely user/foreign dirty"
before reporting — e.g. an allowlist of the onboarding flow's own known
output paths (`.claude/**`, `pipeline.user.yaml`, `project/**`,
resume-hint's own path), so the hygiene result distinguishes a clean-except-
for-our-own-scaffolding state from an actually dirty one.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, current scope — confirmed live false-positive
  behavior in current source; low severity (non-blocking diagnostic) but a
  cheap, well-scoped fix.
- **Rationale:** independently re-verified against this checkout's own
  current source and the raw transcript before filing; not trusted from the
  relayed report alone.
- **Assignment (if accepted):** goldfish-implementor (non-guardrail lib
  code, no in-task design latitude beyond the allowlist itself), plus
  Critic review before considered done.
- **Date:** 2026-08-17
