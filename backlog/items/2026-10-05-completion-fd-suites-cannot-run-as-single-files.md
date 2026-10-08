---
schema: pipeline.backlog-item.v1
id: pipeline.completion-fd-suites-cannot-run-as-single-files
type: defect
owner: pipeline
status: open
created: 2026-10-05
source: "Observed live during the Alfred night run, 2026-10-05/06 (FANOUT-S9 regression check, S2-72 adapter suites)."
sprint: alfred
done_when: manual
---

# Suites with a hard-coded completion descriptor cannot run as single files

## Description

Suites that call `registerTestCaseCompletion({ ..., fd: 3, ... })` (for example
`plugins/pipeline-core/hooks/post-compact-reground.test.mjs:451`) throw `TCC-FD-WRITE`
(`EBADF`) at registration when run as `node <file>` or `node --test <file>`, because only the
Verify runner opens descriptor 3. The whole file then fails before any case runs. On native
Windows, where the full Verify must not run, these suites therefore have no single-file
regression route at all: agents cannot prove "no regression" for a change they make, and A/B
comparisons see "fails identically as a whole file", which proves nothing (S2-72 reported the
Codex and Antigravity adapter suites this way).

## Triggering situation

The FANOUT-S9 regression run of the existing re-ground suite, and the S2-72 facade A/B run.
The failure is identical on the unmodified tree.

## Affected artifact

`plugins/pipeline-core/lib/test-case-completion.mjs` and every suite with a fixed `fd`.

## Proposal

When descriptor 3 is not open (no Verify parent), fall back to a no-op completion recorder
with a one-line stderr note instead of throwing, so the suite runs its cases; Verify keeps the
strict descriptor contract (its parent sets a marker env var). Alternatively provide a
single-suite runner that opens the descriptor. Add a test for both modes.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** fixed in source — closes after the 0.7.0 candidate host checklist (status stays `open` until then).
- **Rationale:** commit(s) `2f0c00932`.
- **Assignment (if accepted):** sprint-alfred-epic close-out batch.
- **Date:** 2026-10-08.
