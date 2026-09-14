# Agent-Pipeline optional runtime adapter

This file is a pointer, not a second ruleset.

At an actual session start or runtime re-entry, invoke
`pipeline-core:pipeline-start`. It is the required methodological entry and
loads the calibrated runtime authorities. Do not repeat it for an ordinary new
task, user message, tool result, commit, test, PO response, or active-goal
continuation within the same ready session.

Authorities: runtime manifest `.claude/pipeline.yaml` and Operating Model
`docs/operating-model.md`. Follow their re-entry rule.

For Codex and other non-Claude runtimes this is methodology-only. It claims no
Claude hooks, foreign tool or agent integration, model binding, or global host
enforcement.

## Architecture Map & Navigation Bundle (AC-23)

The architecture of this repository is navigated through the machine-readable OKF v0.1 map bundle at [architecture/map/index.md](architecture/map/index.md).

Fresh sessions and task briefings follow the strict 6-step re-entry reading order (Doctrine §3.2):
1. `AGENTS.md` — entry point, conventions, and architecture map pointer
2. `architecture/map/index.md` — root map and inventory index
3. Concept files of the modules touched by the task (`architecture/map/<module>.md`)
4. Compiled decision summary (`project/architecture-decisions.compiled.json` or ADRs)
5. Lifecycle state / bootstrap (`pipeline-core:pipeline-start`)
6. Owned implementation surface
