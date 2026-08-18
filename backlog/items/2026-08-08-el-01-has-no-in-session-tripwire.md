---
schema: pipeline.backlog-item.v1
id: pipeline.el-01-has-no-in-session-tripwire
type: defect
owner: pipeline
status: open
created: 2026-08-08
source: "Critic finding F-A, Phoenix gate-integrity delta re-review round 2, 2026-08-08: the orchestrator-authored commit e7f6e96 was caught after the fact, not at write time."
due: 2026-09-07
---

# EL-01 is enforced by review after the fact, never at the moment of the write

## Description

EL-01 forbids the Elephant from writing production code outside a narrowly
defined stage-0 fast path. Its stated check is authorship verification at close:
commit trailers and dispatch records are inspected once the commits already
exist. There is no mechanism that refuses the write itself, which means the rule
can only ever be *observed* to have been broken, never *prevented*.

This is a different shape from the repository's other hard rules. Force-push,
history rewrite and protected-branch deletion are enforced by the guard union at
the moment of the attempt; EL-01, which protects the separation between the agent
that builds and the agent that judges, is enforced by a reviewer noticing later.
The asymmetry is not obviously deliberate.

## Triggering situation

Commit `e7f6e96` (2026-08-08) changed
`plugins/pipeline-core/lib/backlog-state.test.mjs` from the orchestrator session
with no `Dispatch:` trailer and no dispatch record. EL-01's exception is
rigor-0 fast-path only, excludes test changes outright, and excludes any task
with a risk flag set; the active feature is `rigor 2 · risk high`, so the fast
path was categorically unavailable. Nothing in the session objected. The delta
re-review's Critic found it afterwards and raised it as a major finding, and by
then the commit was immutable: history is not rewritten in this repository, and a
`git revert` would itself have been a second orchestrator-authored source commit.
The violation could be disclosed, not repaired.

## Affected artifact

- `roles/elephant.md` EL-01 (the exception at `:35`) and EL-16 — the rules with
  no write-time enforcement.
- `plugins/pipeline-core/hooks/` — where a write-time guard would live, alongside
  the existing git and lifecycle guards.
- The active-feature state (`activeFeature`, rigor and risk class) — already
  machine-readable, which is what makes a tripwire feasible at all.

## Proposal

A `PreToolUse` guard on `Edit`/`Write` that refuses an orchestrator-session write
to a source path while a risk-flagged feature is active, and that names the
sanctioned route in its refusal rather than merely blocking. The inputs it needs
already exist: the active feature's rigor and risk class come from continuity
state, and "source path" is definable as the complement of EL-01's own permitted
set (specs, plans, briefings, gate decisions, register/ADR entries, handover
updates, `backlog/items/`).

Two design questions that should not be settled inside this item:

1. **How the guard distinguishes an Elephant session from a Goldfish one.** A
   dispatched subagent must keep writing freely; the carrier that separates them
   needs to be one the guard can trust rather than one a prompt can assert.
2. **Whether refusal or disclosure is the right outcome.** A hard refusal is
   consistent with the other guards; a forced-disclosure mode — the write
   proceeds but the commit cannot be made without a recorded EL-01 exception —
   preserves the fast path without letting an undisclosed instance through.

Acceptance test: a deliberate orchestrator-session write to a source path under a
risk-flagged feature is refused or forced into disclosure, demonstrated by break
and restore rather than asserted.

## Triage — reviewed 2026-08-18

- **Decision:** Confirmed still open, exactly as described. Not resolving here.
- **Rationale:** Re-checked 2026-08-18: no `PreToolUse` guard on `Edit`/`Write` enforces EL-01 at write time in either Phoenix's or Nova's `hooks/hooks.json` / `hooks/` directory — the rule is still enforced only by after-the-fact review. The item's own Proposal section poses two named design questions with real tradeoffs (how the guard trusts an Elephant-vs-Goldfish session identity; refusal vs. forced-disclosure as the enforcement shape) and explicitly defers both to a future decision rather than this item.
- **Assignment (if accepted):** PO must pick the enforcement shape (refuse vs. forced-disclosure) and the session-identity signal before a dispatch can be briefed.
- **Date:** 2026-08-18

### PO Decision — 2026-08-18

- **Decision:** Refuse (hard block), consistent with the repository's other guards. Session-identity signal (Elephant recommendation, adopted): trust the presence of an active, matching dispatch record for the current tool-call context (a live `TASK_ID`/`dispatch-record.json` entry for a dispatched Goldfish) rather than a self-asserted role string in a prompt — a write is permitted only when it can be tied to an actually-open dispatch record.
- **Rationale:** Refuse matches the enforcement shape of force-push/history-rewrite/protected-branch guards already in this repo. A dispatch record is existing, already machine-checked infrastructure (used throughout this session's own Triage), not a new trust surface a prompt could forge.
- **Assignment:** Dispatch-ready — brief a Goldfish (guard-kernel tier, xhigh) to design and land the `PreToolUse` guard on `Edit`/`Write`, with the break-and-restore acceptance test the item's Proposal names.
- **Date:** 2026-08-18

## Triage — updated 2026-08-19

- **Decision:** stays open — partial progress landed, real blocker remains.
- **Rationale:** The EL-01 write-time tripwire guard file landed (commit `27b4867d`), matching this item's own Proposal. Its `hooks.json` registration step is explicitly blocked by TP-4 per the commit's own message — needs the SAME TP-4-scoped HGO ceremony as the sibling onboarding-consent-lock item to complete wiring. Not closeable until that ceremony runs.
- **Date:** 2026-08-19
