---
schema: pipeline.backlog-item.v1
id: pipeline.template-scripts-for-human-terminal-actions
type: idea
owner: pipeline
status: open
created: 2026-08-29
sprint: nova
tracking: "Nova B -- design idea, not scoped."
source: "PO inline observation (2026-08-29, 3-runner greenfield synthesis): Antigravity was the only runner to move quickly through the first 2 phases, in part because it built its OWN scripts to confirm the PRD faster. PO suggests: pre-built template scripts (that runners lightly rewrite, with clear placeholders) for fixed gates/installs/anything the human must run in a terminal, so what needs filling in is always clear."
---

# Idea: template scripts for fixed human-terminal actions, pointing at drivers/hooks, that runners lightly rewrite instead of composing from scratch

## What the PO is asking for

Across all three greenfield runs, composing correct, copy-paste-safe terminal commands for
the human (gate satisfaction, key/install steps, signing ceremonies) was a repeated source of
friction (line-wrap breakage, quoting mismatches, wrong-runner defaults). Antigravity did
comparatively well partly because it built its own helper scripts on the fly. The PO's idea:
ship PRE-BUILT template scripts for these fixed, recurring human-terminal actions -- pointing
at the actual drivers/hooks -- that a runner lightly rewrites (filling in clearly-marked
placeholders) rather than composing a command string from scratch each time. Could also echo
what is being signed/executed for transparency.

## Why this is an idea, not a scoped item

No concrete design exists yet: which actions get templates, where they live, how a runner
discovers and fills them in, how this relates to the already-existing `copy-safe-command.mjs`
renderer and the various "universal command renderer" work already done. Needs a design pass
before it can be scoped into acceptance criteria.

## Related

- `2026-08-18-universal-human-command-renderer.md` (closed) -- the existing renderer this
  idea would either extend or wrap.
- Item 19 (`codex-pretool-guard.mjs` quoting) and the copy-paste line-wrap items -- adjacent
  friction this idea aims to reduce structurally rather than fix case by case.

## Triage

- **Decision:** deferred, Nova B
- **Rationale:** genuine design idea with real supporting evidence (Antigravity's comparative
  outperformance), but not yet scoped.
- **Date:** 2026-08-29
