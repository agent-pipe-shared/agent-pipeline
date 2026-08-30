---
schema: pipeline.backlog-item.v1
id: pipeline.claude-code-has-no-mechanical-resume-hint-delivery-hook
type: defect
owner: pipeline
status: open
created: 2026-08-29
sprint: nova-b
tracking: "Nova B -- new hooks.json entry needed (TP-4 protected, PO signature ceremony), larger scope than the Codex-side fix; not this candidate."
source: "Found while root-causing 2026-08-29-codex-restart-context-loss-needs-a-different-approach-not-harder-enforcement.md (point 5 of its root-cause note)."
---

# Claude Code has no mechanical SessionStart hook delivering the resume-hint card into context -- only Codex does

## What was found

While tracing why Codex loses resume-hint context across a restart, found that
`hooks/codex-session-start-hint.mjs` is the ONLY hook in this codebase that
mechanically injects text into a session's context unbidden on
`startup|resume|clear` (via `hookSpecificOutput.additionalContext`). It is
wired into `codex-hooks.json` but has no equivalent in the Claude-side
`hooks.json` -- that file's nine wired hooks are staleness-check,
push-gate, test-path guard, dev-plan gate, staleness-check (SessionStart,
advisory), stop-suggest, post-compact-reground (SessionStart, `compact`
matcher ONLY -- not `startup|resume|clear`), setup-check, and the
dispatch-budget guard. None of them read or surface `project/resume-hint.json`
or the onboarding intake checkpoint's `materialInput`/`values`.

This means Claude Code's own MUST-DO consumption step (SKILL.md step 6: "at
the start of the next session... the agent MUST read
`project/resume-hint.json`'s content... and incorporate it") relies entirely
on the agent voluntarily running `resume-hint.mjs inspect` and reading its
output -- exactly the "the agent should read this" pattern the PO's own
framing (in the item this was found from) said doesn't reliably hold, just
observed here for a DIFFERENT runner than the one the PO was complaining
about. Claude Code sessions in this project may simply have been getting
lucky (or the skill-prompted instruction genuinely holds up better for
Claude than Codex, which is itself a real, useful data point once measured
rather than assumed).

## Direction

Not scoped yet -- needs a design decision (PO) on whether to:
1. Add a Claude-side SessionStart hook mirroring `codex-session-start-hint.mjs`
   (same mechanism, ported), or
2. Fold the two into one runner-neutral hook file both `hooks.json` and
   `codex-hooks.json` wire (less duplication, but changes both TP-4-protected
   files), or
3. Leave Claude's manual-instruction path as-is if a live comparison shows it
   actually holds up (needs evidence, not assumption, before choosing this).

Any of the three needs a `hooks.json` and/or `codex-hooks.json` edit, both
TP-4 protected -- a PO override ceremony either way, separate from and larger
than the Codex-side `codex-session-start-hint.mjs` content fix.

## Acceptance criteria

- A PO decision on which of the 3 directions (or another) to take.
- Whatever is chosen, proven via the same unit-test-contract standard as the
  Codex-side fix (the hook's actual stdout content, not a prose claim).

## Triage

- **Decision:** accepted, Nova B (design decision + TP-4 ceremony needed;
  not a same-candidate fix)
- **Rationale:** real gap, but larger scope and lower urgency than the
  Codex-specific fix the PO explicitly elevated live.
- **Date:** 2026-08-29

## Related

- `2026-08-29-codex-restart-context-loss-needs-a-different-approach-not-harder-enforcement.md`
  (open, Nova A) -- the item this was found while root-causing.
