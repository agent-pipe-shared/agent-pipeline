---
schema: pipeline.backlog-item.v1
id: pipeline.node-v24-on-windows-creates-a-real-nul-file
type: defect
owner: pipeline
status: open
created: 2026-10-05
source: "Live measurement with a probe, Agent-Pipeline Claude/Windows session 2026-10-05 (Node v24.19.0, win32)."
sprint: alfred
done_when: manual
---

# Node v24 on Windows creates a real `NUL` file

## Description

Measured with a probe: on Node v24.19.0 win32, `openSync("NUL", "w")` creates a real file
`NUL` in the current working directory; `os.devNull` (`\\.\nul`) does not. About 117 test
files used the literal as completion sink, so every native single-file run left a `NUL`
file in the repository root (Verify dirty).

Fixed for 115 files in commits e63b14efa, c6ff00c8f, 385e421a0, e82c64a81, 425bd046e,
b399351bf, c9ddd1854, 25a449c30; the protected `guard-testpath.test.mjs` follows via the
signed package.

## Acceptance

- No `"NUL"` literal as a Node open target anywhere: a ratchet scan in an existing
  registered test or a registered new one.
- Git null-device values (`GIT_CONFIG_GLOBAL` and similar, read by git, not opened by Node) use
  `GIT_NULL_DEVICE` (`/dev/null`) from `lib/git-null-device.mjs`, never the `"NUL"` literal, which
  Git for Windows 2.56 rejects (item `pipeline.git-for-windows-2-56-rejects-git-config-global-nul`).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** fixed in source — closes after the 0.7.0 candidate host checklist (status stays `open` until then).
- **Rationale:** commit(s) `866be2139, 12ac0a7af`.
- **Assignment (if accepted):** sprint-alfred-epic close-out batch.
- **Date:** 2026-10-08.
- **Counted evidence (2026-10-22, Linux host, head of the h2 clone):** acceptance 1 is the live ratchet in
  `plugins/pipeline-core/lib/pins/node-v24-on-windows-creates-a-real-nul-file.test.mjs` (14 cases, 14 pass, 0 fail,
  0 skip; `node --test`). Acceptance 2 is enforced by the R7-1a ratchets in `plugins/pipeline-core/lib/worktree-lifecycle.test.mjs`
  (production and fixture trees of `lib/`, `scripts/`, `hooks/`: no `NUL` literal beside a git null-device key;
  single-source ratchet for `GIT_NULL_DEVICE`; 81/81 checks pass, run as `node plugins/pipeline-core/lib/worktree-lifecycle.test.mjs`)
  and by the real-git cases in `plugins/pipeline-core/lib/git-null-device-sites.test.mjs` (8 cases, 8 pass, 0 fail, 0 skip).
  The pin now also asserts that these enforcers exist. Not verified here: a native Windows run on Node v24 (the
  open-target cases that matter on win32 ran on Linux only).

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **WINDOWS-INTEROP-RUN** — A native Windows single-file run must leave no real NUL file in the repository root
  Run lib/pins/node-v24-on-windows-creates-a-real-nul-file.test.mjs and one other sink-using test file with Windows node (confirm `node --version` is v24 on the Windows side) in a /mnt/d clone via cmd.exe, then check `git status`/dir for a root-level NUL file. Minutes, not hours.
