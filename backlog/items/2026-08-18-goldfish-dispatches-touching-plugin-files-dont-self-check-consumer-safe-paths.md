---
schema: pipeline.backlog-item.v1
id: pipeline.goldfish-dispatches-touching-plugin-files-dont-self-check-consumer-safe-paths
type: defect
owner: pipeline
status: open
created: 2026-08-18
source: "Recurred twice in one overnight AFK block: NVA-A1214-SUCCESS-1 and NVA-RETRYECON-1 each independently introduced a doc comment naming a Pipeline-source-only path (harness/, specs/sprint-nova-epic/) inside a plugins/pipeline-core/ file, only caught by the next Full Verify run, never by the dispatch's own DoD checks."
---

# Goldfish dispatches that touch `plugins/pipeline-core/**` don't self-check `check-consumer-safe-paths.test.mjs`

## Description

Twice in one overnight block, a goldfish dispatch (`NVA-A1214-SUCCESS-1`,
`NVA-RETRYECON-1`) wrote a doc comment inside a `plugins/pipeline-core/`
file that named a literal Pipeline-source-only path (`harness/...`,
`specs/sprint-nova-epic/...`) — a real regression against
`harness/scripts/check-consumer-safe-paths.test.mjs`'s AC-11 check, since
that plugin file ships to consumer projects where those paths don't exist.
Neither dispatch's own DoD checks caught it; both were only caught by a
separate, later, dedicated Full Verify run — costing an extra Elephant
round-trip each time.

## Why it matters

This is a cheap, deterministic, already-existing check
(`node --test harness/scripts/check-consumer-safe-paths.test.mjs`, sub-
second) that any dispatch touching `plugins/pipeline-core/**` could run
itself before declaring done, the same way dispatches already run their
own target test suite. Two occurrences in one night is enough to call it a
recurring class, not a one-off.

## Affected artifact

`templates/prompts/goldfish-task.md` (the DoD-checks field template) and/or
`templates/prompts/agent-obligations.md` (the generated obligations file
every dispatch reads) — wherever the standard "run your target suite"
instruction lives is the natural place to add a conditional: if the
dispatch touches any file under `plugins/pipeline-core/`, also run
`check-consumer-safe-paths.test.mjs` before the final report.

## Proposal

Not designed here. Two candidate shapes for whoever picks this up:

1. Add a standing line to the goldfish-task template's DoD-checks section:
   "if this dispatch touches any file under `plugins/pipeline-core/`, also
   run `node --test harness/scripts/check-consumer-safe-paths.test.mjs`
   before the final report" — cheap, but relies on every future briefing
   author remembering to leave it in (or it becoming a permanent template
   line, which grows the template).
2. A pre-commit or dispatch-record-write-time hook that runs this specific
   check automatically whenever staged changes touch `plugins/pipeline-core/`
   — more robust (doesn't depend on a briefing instruction being followed),
   but is new guard-hook machinery, not a template edit, and needs its own
   design/review pass given it would run inside every dispatch's commit
   path.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, implemented (Proposal option 1: the cheap
  template-line addition, not the new hook machinery of option 2 — a
  deterministic, sub-second, already-existing check is worth requiring
  by template line now; the more robust always-enforced hook is a
  separate future item if the template line still proves forgettable).
- **Rationale:** two occurrences in one night already cost two extra
  Elephant round-trips; `templates/prompts/goldfish-task.md`'s DoD-checks
  section (§3) is the exact place this repository's own dispatch
  discipline already lives, and it is copied verbatim into every
  dispatch, so a standing line there reaches every future
  `plugins/pipeline-core/`-touching dispatch without new machinery.
- **Assignment:** done — `templates/prompts/goldfish-task.md`, DoD-checks
  §3, added a standing conditional line requiring
  `node --test harness/scripts/check-consumer-safe-paths.test.mjs`
  whenever a dispatch touches any `plugins/pipeline-core/` file.
- **Date:** 2026-08-18
