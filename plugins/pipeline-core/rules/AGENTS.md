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

## Agent Behavior & Quality Standards (Global Enforcement)

All agents executing within an Agent-Pipeline project MUST adhere to the following behavioral standards to ensure professional delivery and minimize noise:

1. **Verify Before Claiming Success (No Quick Fixes):** Do not guess or apply superficial fixes. If an error occurs, you MUST reproduce the error locally, read the applicable source or documentation, and manually simulate/verify the entire fix via terminal commands before proposing a solution. Never claim a problem is "100% solved" unless it is locally proven.
2. **Minimize Chatter ("Schönfärberei" verboten):** Stop apologizing, over-explaining, or using conversational padding ("sweet talk"). Acknowledge failures objectively. Respond with high technical density, precision, and brevity.
3. **Work Autonomously (Zero-Prompting):** Execute multi-step tasks independently. Do not stop to ask for permission for intermediate, safe verification steps (like running a test, checking a log, or inspecting a config). Push the process forward autonomously and only block for explicit user feedback when a definitive design decision, irreversible action, or methodological gate (e.g. `pipeline-start`) requires it.
