---
schema: pipeline.backlog-item.v1
id: pipeline.unified-runner-launcher-for-empty-folders
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-16
source: "PO decision #21, 2026-10-16: the unified empty-folder launcher pattern for every runner is a backlog item after 0.7.0 (Antigravity first now)."
sprint: none
done_when: manual
---

# Unified empty-folder launcher pattern for every runner

## Description

An empty folder has no workspace install of the Pipeline, so a runner opened
there cannot start governed onboarding by itself. The PO decided on 2026-10-16
that every supported runner (Claude, Codex, Antigravity) follows one launcher
pattern for this case. The launcher points at the plugin's availability, the
user answers "yes, install in this repo", the workspace install runs, and the
runner restarts with a note that the original input must be re-entered. The new
session then runs the whole onboarding, including git, in one block. Antigravity
is implemented first; the unified pattern for the other runners lands after 0.7.0.

## Proposal

Define one runner-neutral launcher contract covering the five steps above, then
adapt it per runner, starting with Antigravity and following with Claude and
Codex. Each adapter reuses the same prompt wording and the same restart note.

## Acceptance

- When a supported runner is opened in an empty folder, the launcher shall point at the Pipeline's availability and offer "yes, install in this repo".
- When the user accepts, the launcher shall perform the workspace install in that folder before any onboarding step.
- When the install completes, the runner shall restart and shall tell the user that the original input must be re-entered.
- When the restarted session receives input, it shall run the whole onboarding, including git, in one block.
- The launcher contract shall be identical for Claude, Codex and Antigravity in step order and user-visible wording, differing only in the runner-specific mechanics.
- If the user declines the install, the launcher shall make no workspace change.

## Open questions for the PO

- None recorded; the release-order statement (Antigravity first now, other runners after 0.7.0) is taken from the decision as given.

Source: PO decision #21, 2026-10-16
