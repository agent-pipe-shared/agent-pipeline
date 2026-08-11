---
schema: pipeline.backlog-item.v1
id: pipeline.guard-lifecycle-ready-blocks-claude-memory-writes
type: defect
owner: pipeline
status: closed
created: 2026-07-29
closed_at: 2026-08-11
closure_repository: self
closure_commit: a32e1b99ba3abc71165014227064bba261064f14
closure_evidence: specs/sprint-nova-epic/evidence/backlog/2026-08-11-pareto-triage-report.md
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

- **Decision:** Closed (2026-08-11) — fixed. Supersedes the 2026-08-06 note
  below, which was correct as of its own date but predates the PO's
  2026-08-08 Option A reversal recorded further down in this file.
- **Rationale:** `guard-lifecycle-ready.mjs` now implements exactly the
  design the 2026-08-08 PO decision specifies —
  `claudeSessionMemoryDirectory()`/`isClaudeSessionMemoryWritePath()`
  (MEMPATH-1), deriving the memory directory from `transcript_path` per the
  "derived path, never a prefix" boundary above, with a doc comment
  explicitly citing this backlog item (`closure_commit`
  `a32e1b99ba3abc71165014227064bba261064f14`). The 2026-07-29 citation gap
  noted below is now moot — superseded by the later, explicit, in-session
  PO decision.
- **Assignment:** N/A — already closed.
- **Date:** 2026-08-11.

**2026-08-06 note (superseded, kept for history):**

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

## PO decision, 2026-08-08 — Option A, and the signal the 2026-07-29 triage said was missing

The PO reversed the 2026-07-29 holding position: *"ich finde das sind die
standard claude pfade und bei codex gibt es vllt was ähnliches. Ich will die CLI
UX schon erhalten. Das sollten wir erlauben oder?"* The write is admitted. What
follows is the boundary the implementation must hold, and the finding that makes
open question 1 answerable rather than a guess.

### Open question 1 has an authoritative answer, and it is not the hashing scheme

The 2026-07-29 proposal asked for "a stable, documented way for the hook to
identify the memory directory that belongs to THIS governed project without
reverse-engineering Claude Code's internal project-directory naming/hashing
scheme", and treated its absence as the reason to defer.

The signal exists and is already in the guard's hands. `guard-lifecycle-ready.mjs`
parses the complete hook-input object (`:1360`) and passes it around as `input`;
the payload carries `transcript_path`. The transcript file lives in the same
directory as this project's memory directory, so `dirname(transcript_path)` is
the project directory **as the CLI itself reports it** — no naming scheme is
reconstructed, no sample is generalized. `<dirname(transcript_path)>/memory/` is
then exactly this project's memory directory.

`transcript_path` currently appears nowhere in `plugins/pipeline-core` (zero
matches across the plugin). It is unused, not unavailable.

**Verification status, stated honestly:** the shape was confirmed against one
live session's own values on one platform, not across the four first-class
platforms the original proposal demanded. This converts the question from
unknowable to checkable; it does not discharge it. The implementing dispatch
owns that check, and a platform where the relationship does not hold is a stop
condition, not something to paper over.

### The boundary: derived path, never a prefix

Admit writes under `<dirname(transcript_path)>/memory/**` only.

Do **not** admit `~/.claude/**` as a prefix. That directory also holds
`settings.json`, `agents/`, and `plugins/`, and the local marketplace sits
adjacent to it. An agent able to write `settings.json` edits its own
permissions, which is not a UX concession but the exit from the guard. The
carve-out is defined by the shape the CLI reports, not by a home-relative
prefix — this is also what keeps it from generalizing into the broader escape
that open question 3 warns against.

### What must not be folded in

The session scratchpad produces the identical denial code and is a **separate**
decision (`2026-08-07-session-scratchpad-is-unwritable-under-the-cross-repo-guard.md`).
`GUARD-CROSS-REPO-MUTATION` is unliftable by ADR-0059 Decision 5, and that item's
candidate 2 — an in-repository `scratch/`, already half-built — is the stronger
answer there. Solving both with one carve-out would widen this one past its
justification.

### Runner parity is owed, not optional

ADR-0057 R1 forbids shipping a runner-specific capability one-sided. The
implementing dispatch establishes, as an inventory rather than an assumption,
which runner-owned paths each CLI actually writes during a normal session, and
either opens the Codex counterpart or records explicitly that none exists. No
path enters the allowlist on the strength of a guess about what a CLI "probably
needs".

### Assignment

A `goldfish-deep` dispatch, sequenced after the runner-aware restart work
releases `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`. It carries the
platform check above as a DoD item and the prefix prohibition as a hard scope
boundary.
