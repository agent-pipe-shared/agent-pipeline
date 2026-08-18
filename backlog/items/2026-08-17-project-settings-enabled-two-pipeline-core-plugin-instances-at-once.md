---
schema: pipeline.backlog-item.v1
id: pipeline.project-settings-enabled-two-pipeline-core-plugin-instances-at-once
type: defect
owner: pipeline
status: closed
created: 2026-08-17
closed_at: "2026-08-18"
closure_repository: "self"
closure_commit: "f57375ff77263a2df70bbb3201feb361912f07f6"
closure_evidence: "docs/claude-local-plugin-development.md"
source: "Caught live by the PO while verifying the 0.5.5 toolbox-refresh candidate: `/reload-plugins` in this repository's own dev session reported \"Reloaded: 2 plugins\" instead of 1."
---

# This repository's own tracked project settings enabled a stale GitHub-sourced `pipeline-core` alongside the local-development one

## Description

`.claude/settings.json` (tracked, project-scope) declared
`enabledPlugins: { "pipeline-core@agent-pipeline": true }` — the
GitHub-sourced marketplace snapshot, stuck at `0.5.4`. Separately, this
machine's global `~/.claude/settings.json` (user-scope, not tracked)
declared `enabledPlugins: { "pipeline-core@agent-pipeline-local": true }`
— the local-development marketplace this repo's own AFK session actively
rsyncs fresh candidates into. Claude Code merges `enabledPlugins` across
scopes additively rather than letting one scope override the other, so
this repository's own dev sessions were running **two full `pipeline-core`
plugin instances at once**: the fresh local candidate and a stale external
snapshot roughly 13 candidate-versions behind.

## Triggering situation

Visible as `/reload-plugins` reporting "Reloaded: 2 plugins" (expected: 1)
and roughly double the expected hook count (26 instead of ~13). The PO
noticed the "2 plugins" wording and asked for it to be verified; the two
independently-enabled scopes were confirmed by reading
`.claude/settings.json`, `.claude/settings.local.json`, and the global
`~/.claude/settings.json` side by side.

## Affected artifact

`.claude/settings.json` (this repository, tracked) and
`.claude/settings.local.json` (this repository, untracked, local-only).

## Proposal

**REJECTED by Critic review (round 1, FAIL, blocker F1) — see Triage.**
The original proposal (point the tracked `enabledPlugins` at
`pipeline-core@agent-pipeline-local`) is WRONG: per
`docs/claude-local-plugin-development.md`'s own scope model and
[ADR-0001](../../docs/adr/0001-distribution-plugin-marketplace.md) D1,
`agent-pipeline-local` is host-wide `--scope user` state by design ("a
single `agent-pipeline-local` registration serve[s] any checkout on the
host"), never the tracked project-scope binding. The tracked file must
keep resolving under the released selector `pipeline-core@agent-pipeline`
so a fresh clone or CI runner — with no local marketplace ever
registered — still loads the guard-hook set rather than silently loading
nothing while `Bash(git push *)` stays pre-granted.

The actual "2 plugins" symptom is the already-documented interaction of
running project-scope (`agent-pipeline`, this tracked file) and
user-scope (`agent-pipeline-local`, this host's global settings)
*at the same time on the same checkout* —
`docs/claude-local-plugin-development.md` (§"Reaching the released
selector from this checkout") already states this combination "should
not be combined". This repository's own dev/self-application checkout is
exactly the case where both purposes (a self-describing tracked install
AND local-candidate testing) are wanted simultaneously, which the
existing docs don't resolve. Fixing the tracked file cannot fix this —
it needs either a host-local operational choice (e.g. temporarily
suppressing one scope's install while doing local-dev testing on this
checkout) or a documented, explicit exception for the Pipeline's own
self-application repo. **Left open for a PO decision** — not a code fix.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision round 1:** accepted a proposal that turned out wrong — fixed
  live (commit `917f8a1e`), Critic review (self-application, ADR-0015,
  MP-07 guardrail-class) returned **FAIL** (blocker F1: broke the
  self-describing project-scope contract for any checkout without a
  local marketplace registered — a fail-open regression, worse than the
  symptom being fixed). **Reverted** in commit `c4f39ea4`, restoring the
  tracked file to `pipeline-core@agent-pipeline`.
- **Decision round 2:** the tracked-file fix direction is closed —
  correctly reverted, no further tracked-file change is the right answer
  here. The remaining question (how to avoid the duplicate load while
  doing local-dev testing specifically on this checkout) is a host-local
  workflow choice, deferred to the PO. This item stays **open**, not
  closed, until the PO decides how they want to handle it (or decides the
  duplicate load is an acceptable, ignorable side effect of combining
  both purposes on one checkout).
- **Rationale:** self-application governance (ADR-0015) applies to this
  repo's own tooling config the same as to any other guardrail-adjacent
  file; the Critic caught a real, more severe regression than the
  original symptom, and the correct remedy per this repo's own existing
  documentation is a full revert, not a different `enabledPlugins` value.
- **Assignment (if accepted):** this AFK block; final resolution pending
  PO input.
- **Date:** 2026-08-17

### PO decision, 2026-08-17

Option A: a host-local, untracked workaround
(`.claude/settings.local.json` on this machine) rather than any change to
the tracked file. Documenting this combined-purpose case in
`docs/claude-local-plugin-development.md` so it does not have to be
re-derived on the next machine setup. Dispatched (docs only).

### Closure, 2026-08-18

Both halves of Option A confirmed complete during a systematic 0.6.0-release
backlog sweep: `.claude/settings.local.json` on this machine already carried
`"pipeline-core@agent-pipeline": false` (the host-local workaround), and the
documentation half was the one piece still missing — added directly to
`docs/claude-local-plugin-development.md` (new paragraph after "Reaching the
released selector from this checkout", documenting the combined-purpose case
and the exact `settings.local.json` shape). Closing with no further work;
unrelated to the separate duplicate-registration incident fixed live earlier
the same session (two `pipeline-core@agent-pipeline-local` entries at
user+local scope simultaneously — a different combination than this item's
own `agent-pipeline` + `agent-pipeline-local` symptom).
