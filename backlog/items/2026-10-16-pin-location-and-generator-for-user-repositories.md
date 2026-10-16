---
schema: pipeline.backlog-item.v1
id: pipeline.pin-location-and-generator-for-user-repositories
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-16
source: "PO decision 2026-10-16 (Alfred night session): criterion-bound regression tests become canon for 0.7.0 as documentation only; the product surface below is deferred because it needs design scope."
done_when: manual
---

# User repositories cannot configure where pins live or how they run

## Description

QG-04 in `guardrails/quality-gates.md` and the QUALIFY module in
`templates/prompts/goldfish-task.md` now describe criterion-bound regression
tests ("pins"), and `docs/adr/draft-criterion-bound-regression-pins.md`
records the decision. The rule says "the project's documented pin location",
but only this repository documents one (`plugins/pipeline-core/lib/pins/`,
run with `node --test`). A user repository with its own test framework has no
calibration field for its pin directory or test command. The briefing
generators that produced the Alfred pin waves are session-local scratch
scripts, not versioned plugin code, so other runners and users cannot
reproduce them.

## Proposal

1. Add an optional calibration field for the pin location and the command that
   runs one pin, with a validator and a sensible absent-field behavior.
2. Ship a read-only plugin script that renders a QUALIFY briefing section for
   one backlog item and criterion locator, using that field.
3. Keep it runner-neutral (Claude, Codex, Antigravity) and platform-neutral
   (Windows, Linux, WSL, macOS).

## Acceptance

- A user repository can declare its pin location and test command, and the
  validator rejects malformed values.
- The renderer produces a QUALIFY section for a given item that names the
  configured pin path and command, and refuses an item without a criterion
  locator.
- With no field configured, the renderer reports a typed unconfigured result
  instead of guessing a path.

## Triage

Deferred after 0.7.0 by PO decision 2026-10-16: new product surface that would
reopen the Alfred design.
