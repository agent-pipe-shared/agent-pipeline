---
schema: pipeline.backlog-item.v1
id: pipeline.post-compact-reground-carries-no-state-md-narrative
type: defect
owner: pipeline
status: closed
closed_at: "2026-08-19"
closure_repository: self
closure_commit: a035723503ea62562c95fad80976fc375cad2f19
closure_evidence: backlog/items/2026-08-19-post-compact-reground-carries-no-state-md-narrative.md
created: 2026-08-19
source: "PO question this session (2026-08-19 afternoon): why did the Elephant not know its own state after /compact. Diagnosed live by reading plugins/pipeline-core/hooks/post-compact-reground.mjs directly, not inferred."
---

# post-compact-reground.mjs carries no docs/state.md narrative, only a thin JSON continuity pointer

## Description

`post-compact-reground.mjs`'s `resolveRegroundProjection()` builds its
entire post-compact context from `project/pipeline-state.json`'s
`continuity` object only: `featureId`, `phase`, `revision`, `queueHead`,
`blocker`, `authority` digests, `nextAction`. It never reads
`docs/state.md` at all. This is deliberate (token-budget discipline,
per `references/workflow-dispatch.md`'s "Compact... does not trigger a
second full Elephant bootstrap" and `bootstrap-payload-budget.mjs`'s
10-15k unit target), and is the intended fix for the *opposite* problem
already closed as `pipeline.compaction-stable-bootstrap-lease` (stopping
compact from forcing a wasteful full re-bootstrap).

The gap: `docs/state.md`'s own free-text paragraphs (CLAUDE.md's
declared canonical handover, "wins on conflict with anything below")
can carry narrative state the structured continuity JSON has no field
for at all — e.g. a dispatched Critic review's round number, FAIL
findings and their disposition, an orphaned/lost dispatch. Neither the
structured projection nor the LLM-generated `/compact` summary is
guaranteed to carry this forward: the projection has no field for it by
design, and the summary may reasonably omit content it judges "already
persisted to state.md" without accounting for the fact that nothing
else in the post-compact context will actually re-surface it.

## Triggering situation

This session (2026-08-19): after `/compact`, the Elephant proceeded on a
stale understanding of the Nova A 0.6.0 candidate's status (believed the
final Critic gate had not started) while `docs/state.md` actually
recorded a first Critic round (FAIL, 4 findings, dispositioned) and a
second round dispatched but never returned (orphaned, ~4h old, no
report, no live agent). Only discovered by directly reading
`docs/state.md` mid-session, not via the compact re-grounding hook or
the conversation summary.

## Affected artifact

`plugins/pipeline-core/hooks/post-compact-reground.mjs` (Claude),
`plugins/pipeline-core/hooks/codex-session-start-hint.mjs`'s
`compactStdout()` (Codex, reuses the same exported logic per
`pipeline.compaction-stable-bootstrap-lease`'s closure) — both would
need the same fix, and `docs/state.md` itself (currently has no
machine-readable "most recent N paragraphs" boundary a hook could cite
cheaply).

## Proposal

Three options at increasing enforcement strength, not mutually
exclusive:

1. **Soft (prompt-level):** strengthen the injected re-grounding message
   with an explicit "read docs/state.md now" instruction. Cheapest, but
   relies on compliance the same way the general session-bootstrap Hard
   Rule already does — and this session shows compliance alone isn't
   reliable once the LLM's own conversation summary reasonably (not
   erroneously) omits the same content for a different reason.
2. **Mechanical (recommended starting point):** have the hook itself
   read a bounded slice of `docs/state.md` (e.g. the most recent
   "paragraph block" since the last `## <date>` or `**Last updated:**`
   marker, capped to a fixed byte budget matching the existing
   `bootstrapPayloadMeasurement`/`boundedPayload` discipline) and embed
   it verbatim in the injected re-grounding message. No reliance on
   compliance; stays inside the existing token-budget architecture
   rather than reintroducing a full bootstrap.
3. **Hard (technical enforcement):** a PreToolUse guard (in the
   `guard-lifecycle-ready.mjs` family, which already tracks session
   readiness state) that blocks any mutating tool call following a
   compact SessionStart until at least one `Read` of `docs/state.md` has
   occurred in the session. Strongest guarantee; needs new guard logic,
   a session-scoped "has read state.md since last compact" marker, and
   tests. Real but bounded implementation cost given this guard family
   already exists.

Open question for whichever option lands: what counts as "the recent
narrative slice" of `docs/state.md` in a machine-parseable way — the
file has no structured section boundary today beyond ad hoc `**Date:**`
lines and the "Archived history" table's date ranges.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, Option 2 (mechanical). PO chose the mechanical
  enforcement level explicitly, with two hard requirements: the excerpt
  must cover the live-open-state section generously (not just the newest
  crumb), and the emitted message must always tell the reader to read
  `docs/state.md` directly when in doubt, before risking duplicate work.
- **Rationale:** matches the item's own recommended starting point;
  compliance-only (Option 1) already failed once this same session, and
  Option 3 (a technical read-gate) was not requested and would add real
  new guard-family scope beyond what the PO asked for.
- **Assignment:** `NVA-COMPACTSTATE-1` (goldfish-deep, worktree-isolated).
- **Date:** 2026-08-19

## Closure, 2026-08-19

`NVA-COMPACTSTATE-1` landed in two commits (`fb57c6b4` feature, `a0357235`
tests, cherry-picked to trunk, independently re-verified — not trusted from
the dispatch's own result text). `post-compact-reground.mjs` gained
`extractLiveStateNarrative()`/`loadStateNarrativeExcerptSafe()` (pure
boundary detection: top-of-file to the `## Archived history` heading) and
`bootstrap-payload-budget.mjs` gained `boundedNarrativeExcerpt()`
(paragraph-granular, oldest-first truncation with an explicit
machine-checkable marker, reusing the existing budget/measurement schema
rather than a second concept). Both PO requirements verified directly: the
excerpt covers the full live-open-state section up to the archive boundary
(not just the newest paragraph), and the bilingual "read docs/state.md
directly if in doubt" instruction is always appended in both `en`/`de`
branches. `codex-session-start-hint.mjs`'s `compactStdout()` picks this up
for free through the shared `decideOutput()` export (one-line `{ rootDir }`
pass-through). 27/27 `post-compact-reground.test.mjs` (24 pre-existing + 3
new), 27/27 `codex-session-start-hint.test.mjs`, 9/9
`check-consumer-safe-paths.test.mjs`, all independently re-run on trunk.
**Item closed.**
