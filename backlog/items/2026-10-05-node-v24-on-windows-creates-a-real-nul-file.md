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
- `GIT_CONFIG_GLOBAL: "NUL"` (read by git, not opened by Node) is explicitly allowed.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** fixed in source — closes after the 0.7.0 candidate host checklist (status stays `open` until then).
- **Rationale:** commit(s) `866be2139, 12ac0a7af`.
- **Assignment (if accepted):** sprint-alfred-epic close-out batch.
- **Date:** 2026-10-08.
