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
