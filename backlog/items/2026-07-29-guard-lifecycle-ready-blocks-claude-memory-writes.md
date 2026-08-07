---
schema: pipeline.backlog-item.v1
id: pipeline.guard-lifecycle-ready-blocks-claude-memory-writes
type: defect
owner: pipeline
status: open
created: 2026-07-29
source: "Sprint Cyborg epic, self-application finding #2 (Elephant self-observation while implementing CYB-2E; PO decision Option B recorded in docs/state.md, session 2026-07-29)"
---

# `guard-lifecycle-ready.mjs` blocks Claude Code's own auto-memory writes in every governed project

## Description

`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` is registered as a
Claude Code `PreToolUse` hook on the `Edit|Write` matcher (`hooks.json`, hook
9, landed via CLAUDE-RUNNER-01c). It is deliberately fail-closed and blocks any
Edit/Write whose target resolves outside the physical project root
(`crossRepositoryMutationBlocked()`, `isProjectWritePath()`). Claude Code's
own persistent, file-based memory system writes to
`~/.claude/projects/<project-hash>/memory/*.md` (outside every project root by
construction — that is the whole point of the feature, memory persists across
sessions and repos). In any Pipeline-governed project, an assistant session
following its own system-prompt instruction to "build up this memory system
over time" will have every such write blocked with the guard's
`crossRepositoryMutationBlocked()` message.

## Triggering situation

Discovered during Sprint Cyborg (feat/sprint-cyborg-claude) while working
through the epic's self-application findings. Confirmed by reading
`guard-lifecycle-ready.mjs` in full and tracing `isProjectWritePath()` against
a real memory-directory target path.

## Affected artifact

`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` (TP-4-protected
wiring lives in `plugins/pipeline-core/hooks/hooks.json`).

## Proposal

Not proposed yet (Option A, deliberately not designed now — see rationale
below). A future proposal would need to answer, verified across Windows,
Linux, WSL, and macOS (this repo's first-class platform set):

1. A stable, documented way for the hook to identify "this is the memory
   directory that belongs to THIS governed project" without reverse-engineering
   Claude Code's internal project-directory naming/hashing scheme from a single
   observed sample. Ideally an authoritative signal (env var, or a Claude Code
   hook-input field) rather than a guessed path-sanitization replica.
2. If no such authoritative signal exists, whether Anthropic exposes one, or
   whether the correct answer is a narrower allow-list keyed off something the
   hook already trusts (e.g. `CLAUDE_PROJECT_DIR`-derived, computed once,
   proven stable across a representative sample on every supported platform).
3. Confirmation that any such exception cannot be generalized into a broader
   escape from the "single physical project root" invariant that is this
   guard's entire reason to exist (it deliberately also blocks writes to other
   repositories, plugin source, and marketplace metadata for the same reason).

**PO decision (2026-07-29, recorded `docs/state.md`): Option B for now** —
document as a known, accepted limitation rather than rush a guess into a
TP-4-protected, deliberately fail-closed security guard. A wrong guess either
fails closed (safe, but does not fix the problem) or, if the underlying naming
scheme is ever misjudged, risks producing a false sense of coverage on the
platforms not actually verified. This item exists so the limitation is not
silently reproduced or forgotten, and so a future dispatch has a starting
point.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** stays open, PO-decision territory; not resolved and not
  resolvable by an agent. One citation in this item's own text could not be
  confirmed and should be re-checked.
- **Rationale (re-verified 2026-08-06 night):** the technical gap is
  confirmed unchanged — `guard-lifecycle-ready.mjs` (1057 lines, read in
  full) contains zero mentions of "memory" anywhere; no carve-out exists. A
  write to `~/.claude/projects/<hash>/memory/*.md` still hits
  `isProjectWritePath()` → `crossRepositoryMutationBlocked()` unconditionally,
  exactly as described (confirmed via this session's own memory-write
  attempts earlier tonight, which the harness routed around the guard
  rather than through it — consistent with, not contradicting, this item).
  **Citation gap found:** this item's Description claims "PO decision
  (2026-07-29, recorded `docs/state.md`): Option B for now," but an
  extensive search of `docs/state.md` (multiple terms: "memory",
  "auto-memory", "memory system", "memory writes", "memory directory",
  "claude-memory-writes", "Option B", "2026-07-29", plus `git log -S
  "claude-memory-writes" -- docs/state.md`) found **no matching record**.
  This does not mean the decision wasn't made — the PO may have decided it
  in a form/wording this search didn't match, or session-only without a
  durable write (which would itself be a P2/§5.1 violation the PO should
  know about) — but it should be re-confirmed and either re-cited precisely
  or re-recorded before being relied on again as "already decided."
  The underlying open design questions (1-3 above) remain unanswered
  either way and are still squarely PO/future-dispatch territory, not
  something to freelance an answer to.
- **Assignment (if accepted):** n/a — no implementation assigned; PO should
  first confirm/re-locate the cited 2026-07-29 decision.
- **Date:** 2026-08-06
