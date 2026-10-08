---
schema: pipeline.backlog-item.v1
id: pipeline.model-role-bootstrap-is-always-unavailable-on-native-windows
type: defect
owner: pipeline
status: open
created: 2026-10-08
source: "Live bootstrap, Agent-Pipeline Claude/Windows session 2026-10-08 (installed 0.7.0+claude.20261005202045.7170ed20, win32); cause read from source, not yet reproduced by a test."
sprint: alfred
done_when: manual
---

# Model-role bootstrap is always unavailable on native Windows

## Description

`scripts/model-role-bootstrap.mjs --repo-root <root> --runner claude` returned
`{"ok":false,"code":"MODEL-FAMILY-GIT-COMMON-DIR-UNAVAILABLE","status":"unavailable","fallbackForbidden":true}`
on a healthy native Windows checkout, with both forward-slash and backslash `--repo-root`
spellings. The bootstrap then has to fall back to the existing V3 route every session.

Cause, read from `plugins/pipeline-core/lib/model-family-runtime-host.mjs`
(`directoryPathChain`, used by `readActivation`): the chain is built POSIX-style. It
starts at `sep`, drops the first character with `path.slice(1)`, and re-joins the
segments from `sep`. For `D:\Dev\agent-pipeline-share\.git` this yields
`\:\Dev\agent-pipeline-share\.git`, so `chain.at(-1) !== commonDir` always holds and
the function returns `MODEL-FAMILY-GIT-COMMON-DIR-UNAVAILABLE` before any activation is
read. A drive root (and a UNC root) is never a valid chain start on win32.

## Acceptance

- `directoryPathChain` starts from the platform root (`path.parse(path).root`) and its
  last element equals the input on win32 drive paths, and on POSIX paths unchanged.
- A registered test covers a win32 drive-letter path (via `path.win32`) and a POSIX
  path, and fails on the current implementation (test-only dispatch first, QG-04).
- A native Windows bootstrap reports `inactive` or the real activation instead of
  `MODEL-FAMILY-GIT-COMMON-DIR-UNAVAILABLE`.
- Check the same module for other POSIX-only path assumptions (`realpathSync` casing
  on Windows in `safeExistingPath`).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
