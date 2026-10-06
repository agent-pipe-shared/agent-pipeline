---
schema: pipeline.backlog-item.v1
id: pipeline.preflight-hides-the-git-error-behind-gs-git-unavailable
type: defect
owner: pipeline
status: open
created: 2026-10-06
source: "Claude/Windows session 2026-10-06: about 40 guarded tool calls spent before the cause (Git 2.56 NUL regression) was found through a PO-run diagnostic command."
sprint: alfred
done_when: manual
---

# The preflight hides the git error behind `GS-GIT-UNAVAILABLE`, and pre-ready lockdown blocks every diagnosis

## Description

`lib/governance-scope.mjs` catches the `discoverRepository` error and throws `GS-GIT-UNAVAILABLE` with a
`topologyDiagnostic` (reason, gitCode, …), but the preflight JSON carries only the bare diagnostic code — not the git
message (`unable to access 'NUL': Invalid argument`). In the resulting pre-ready state the guard refuses
`git config`, `git worktree list`, `stat`, `find` under `.git`, directory Grep/Glob and any ad-hoc `node -e`, so the
session cannot find the cause itself; only a PO-run `!` command could. A remote PO cannot be expected to know the probe.

## Triggering situation

2026-10-06 second-PC session; the earlier session on the same PC was described by the PO as "blocked".

## Affected artifact

`plugins/pipeline-core/lib/governance-scope.mjs` (error surfacing), `scripts/pipeline-start-preflight.mjs` (status
envelope), pre-ready guard grammar (`lib/guard/*`).

## Proposal

Surface a bounded, path-redacted `cause` (git exit code plus the first stderr line) and the `topologyDiagnostic` in
the `pipeline-governance-unverifiable` envelope, plus a typed read-only `nextAction` that runs the same hardened git
probe and prints its result. Keep it non-authoritative (diagnosis only, no admission change).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
