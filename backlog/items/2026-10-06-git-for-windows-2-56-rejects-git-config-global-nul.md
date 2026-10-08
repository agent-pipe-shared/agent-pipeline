---
schema: pipeline.backlog-item.v1
id: pipeline.git-for-windows-2-56-rejects-git-config-global-nul
type: defect
owner: pipeline
status: open
created: 2026-10-06
source: "Claude/Windows session 2026-10-06: preflight pipeline-governance-unverifiable / GS-GIT-UNAVAILABLE; measured by the PO with a direct discoverRepository call and a value matrix."
sprint: alfred
done_when: manual
---

# Git for Windows 2.56.0 rejects `GIT_CONFIG_GLOBAL=NUL`, which every hardened git spawn uses

## Description

Hardened git spawns set `GIT_CONFIG_GLOBAL` to `"NUL"` on win32 (`plugins/pipeline-core/lib/worktree-lifecycle.mjs`
`gitEnvironment`, and the same `win32 ? "NUL"` literal in about ten further source files: afk-git-adapter,
afk-transaction-host, afk-claude-host, close-coordinator, local-worker-supervisor, neutral-range-plan,
po-gate-authority, …). Git for Windows 2.56.0.windows.1 (UCRT build) fails every such call with
`fatal: unable to access 'NUL': Invalid argument`. Repository discovery fails, the governance-scope reader reports
`GS-GIT-UNAVAILABLE`, the preflight returns `pipeline-governance-unverifiable` with `nextAction: null`, and the guard
stays in pre-ready lockdown for the whole session.

Measured value matrix (git spawned from Node, `GIT_CONFIG_NOSYSTEM=1`, Git 2.56.0.windows.1):
`"NUL"` → 128; `os.devNull` (`\\.\nul`) → 128; `"nul"` → 0; `"/dev/null"` → 0.
Upstream: regression git-for-windows/git#6449, fixed by #6450 in Git for Windows v2.56.0(2). Updating to
2.56.0.windows.2 cleared the session on 2026-10-06.

## Triggering situation

Second-PC session 2026-10-06; diagnosis notes in the session's scratch folder (not tracked).

## Affected artifact

All `GIT_CONFIG_GLOBAL` assignments with a win32 `"NUL"` branch; the acceptance line of
`backlog/items/2026-10-05-node-v24-on-windows-creates-a-real-nul-file.md` that explicitly allows
`GIT_CONFIG_GLOBAL: "NUL"`.

## Proposal

One shared constant for the null device handed to git child processes: `"/dev/null"` on every platform (Git for Windows
maps it itself, in both the MSVCRT and the UCRT builds; the same file already passes `-c core.hooksPath=/dev/null` on
win32). Replace every `win32 ? "NUL"` site; never use `os.devNull` for git (fails as well); never hand the constant to a
Node file open (Node would create `D:\dev\null`). Regression test that spawns real git with the constant; a ratchet
scan against a reintroduced `"NUL"` git value. Update the acceptance line of the Node-v24 NUL item. Protected sites go
through the next signed package.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** fixed in source — closes after the 0.7.0 candidate host checklist (status stays `open` until then).
- **Rationale:** commit(s) `12ac0a7af, 2532a96fe`.
- **Assignment (if accepted):** sprint-alfred-epic close-out batch.
- **Date:** 2026-10-08.
