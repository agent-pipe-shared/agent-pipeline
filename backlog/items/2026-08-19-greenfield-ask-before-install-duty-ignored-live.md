---
schema: pipeline.backlog-item.v1
id: pipeline.greenfield-ask-before-install-duty-ignored-live
type: defect
owner: pipeline
status: open
created: 2026-08-19
source: "PO, live, 2026-08-19: full session transcript from a fresh Claude Code v2.1.235 greenfield session in a separate, ungoverned test repo (~/src/Rune_Test1_Claude_060_53). Quoted directly by the PO with the exact terminal output."
---

# Greenfield ask-before-install duty is ignored despite strict wording reaching the agent's context

## Description

`plugins/pipeline-core/hooks/codex-session-start-hint.mjs` (despite its
`codex-` filename prefix, this hook fired for a Claude Code session too —
runner-neutral in practice) emits, for an ungoverned folder, both:

- a short `systemMessage` (line 117): "Agent Pipeline is available as an
  optional project workflow, but it is not active in this folder. Ask the
  user whether they want to install it before running any Pipeline
  command."
- a much stricter `hookSpecificOutput.additionalContext` block (lines
  121-128) that IS correctly wired to reach the agent's context (confirmed
  by reading `main()`, lines 165-179): "On the user's first request,
  briefly explain that Agent Pipeline adds a structured, verifiable
  delivery workflow, then ask whether it should be installed for this
  repository." / "End that turn and wait." / "Before an explicit
  affirmative answer, do not invoke pipeline-core:pipeline-start, inspect
  or plan onboarding, initialize Git, or **change project files**."

Despite this, in the live transcript the PO supplied: the user's first
request was "baue mir dieses Browser-Game" (build me this browser game,
with a full attached design document). The agent went straight to
`Write(index.html)` and `Write(styles.css)` — a direct violation of "do not
... change project files" and "End that turn and wait" — without ever
asking about Pipeline installation. Only after the PO explicitly
interrupted and asked "warum hast du das ignoriert?" (why did you ignore
that?) did the agent surface the question, self-diagnosing that it had read
the instruction as scoped to "before triggering a pipeline-core command"
specifically, not "before any file-changing work."

**This is not (only) a wording-strength problem** -- the actual delivered
instruction is already about as explicit as prose gets ("do not... change
project files", "End that turn and wait"). The gap is that a concrete,
detailed, competing user task request (a full attached game design
document) apparently outweighed a SessionStart-injected `additionalContext`
instruction in practice, for this model/session. Prose-only compliance was
not sufficient.

## Proposal

Two independent angles, likely both warranted:

1. **Reword for zero ambiguity anyway** — even though the instruction is
   already strict, tighten "before running any Pipeline command" (the
   visible short message) so it cannot be misread as scoping to
   pipeline-core commands specifically; make the short message itself say
   "before any project work," matching the stricter context block.
2. **Back it with a technical guard, not prose alone** (the stronger fix,
   matching this repo's own general design philosophy of guard-enforced
   rules over prose-only ones): a PreToolUse check that blocks the first
   mutating tool call (Write/Edit/a Git-initializing Bash command) in an
   ungoverned folder where the Pipeline plugin is installed, unless a
   session-scoped "consent asked and answered" marker is already recorded
   -- forcing the ask-and-wait step structurally rather than trusting
   instruction-following alone.

## Triage

Not yet triaged.
