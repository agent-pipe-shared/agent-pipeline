---
schema: pipeline.backlog-item.v1
id: pipeline.partial-lifecycle-blocks-read-only-diagnosis-and-tmp-fallback
type: defect
owner: pipeline
status: open
created: 2026-08-17
source: "Second, independent Codex happy-path test (PO, project 'Rune_Test1_Codex_055_50' / 'ruinen-browsergame', 2026-08-17), relayed as an AI-authored forensic report and independently re-verified against this checkout's own current source and the raw rollout transcripts before being filed."
---

# A stuck `partial` lifecycle blocks read-only diagnosis and even a `/tmp` fallback write, leaving no way to persist an incident report

## Description

Once a session's lifecycle state is stuck at `partial` (see the related
kickoff-promotion-recovery item this incident also hit), `GUARD-LIFECYCLE-NOT-READY`
(`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs:1895-1962`, allowlist
at ~1333-1431) blocks far more than mutating/risky actions: a plain `mkdir
scratch`, `git config user.name` (session-local, not global), and a
read-only local transcript-parsing `node -e` call were all refused live
during this incident (confirmed against the raw transcript: refusals at
several points, all `GUARD-LIFECYCLE-NOT-READY`). The only carve-outs during
`partial` are identity-based (an exact recovery-CLI argv shape), not
risk-based — there is no read-only/diagnosis lane.

Worse: when the agent tried a `/tmp` fallback to at least persist an
incident report somewhere, that was ALSO refused, with
`GUARD-CROSS-REPO-MUTATION: A governed consumer session may write only
inside its own physical project root.` So a session stuck at `partial` has
**no route at all** to persist a report of its own stuck state — not inside
the project root (blocked by `partial`), not outside it (blocked as
cross-repo mutation).

## Affected artifact

`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` — the `partial`-state
handling and its allowlist (~1333-1431, ~1895-1962).

## Proposal

Not designed here. Direction: a narrow, explicitly-scoped "diagnosis lane"
admitted during `partial` regardless of the identity-based allowlist —
read-only commands (`git status`, `git rev-parse`, `git config --get`,
reading files already inside the project root) and a small set of
pipeline-owned write targets (a fixed incident-report path, scratch
directory creation) — without opening the guard back up to general project
mutation. Explicitly NOT a general `node -e` or arbitrary write escape
hatch; the scope should stay narrow enough that it cannot be used to route
around the `partial` block itself.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, current scope — confirmed live, real, no existing
  workaround (both the in-root and the cross-repo `/tmp` route are blocked).
- **Rationale:** independently re-verified against this checkout's own
  current source and the raw transcript before filing; not trusted from the
  relayed report alone.
- **Assignment (if accepted):** goldfish-deep, guardrail-tier (MP-07), plus
  Critic review before considered done.
- **Date:** 2026-08-17
