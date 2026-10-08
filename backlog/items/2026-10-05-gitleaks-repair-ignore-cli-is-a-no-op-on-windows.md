---
schema: pipeline.backlog-item.v1
id: pipeline.gitleaks-repair-ignore-cli-is-a-no-op-on-windows
type: defect
owner: pipeline
status: open
created: 2026-10-05
source: "Observed live on native Windows, Alfred session, 2026-10-05."
sprint: alfred
done_when: manual
---

# gitleaks-repair-ignore CLI is a no-op on Windows

## Description

The CLI entry check in `plugins/pipeline-core/scripts/gitleaks-repair-ignore.mjs`
compares `import.meta.url` with `file://${process.argv[1]}`. On native Windows
`process.argv[1]` is a drive-letter path, so the strings never match. The tool
exits 0 silently and does nothing.

## Triggering situation

Running the tool from the CLI on native Windows during the 2026-10-05 session.

## Affected artifact

`plugins/pipeline-core/scripts/gitleaks-repair-ignore.mjs`.

## Proposal

Use the repository's shared direct-invocation helper `isDirectInvocation`
(`plugins/pipeline-core/lib/entrypoint.mjs`) instead of the string comparison,
and add a test that runs the CLI as a child process and asserts it acts.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** fixed in source — closes after the 0.7.0 candidate host checklist (status stays `open` until then).
- **Rationale:** commit(s) `c30c005d8`.
- **Assignment (if accepted):** sprint-alfred-epic close-out batch.
- **Date:** 2026-10-08.
