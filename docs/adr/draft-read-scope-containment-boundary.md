# ADR-{{NNNN}}: The read-scope containment boundary for Bash commands

> Agent-Pipeline · Sprint Nova-B · as of 2026-09-06

**Status:** proposed — records an already-implemented PO decision; numbered
only at acceptance of this ADR's text per
[ADR-0069](0069-adr-numbers-are-allocated-at-acceptance.md) Decision 2. Until
then this file is `docs/adr/draft-read-scope-containment-boundary.md`.

**Basis:**
`backlog/items/2026-09-01-read-containment-was-removed-a-day-after-it-was-added-with-no-recorded-decision.md`
(open — this ADR is that item's acceptance criterion 1) and
`backlog/items/2026-08-29-read-scope-guard-admits-single-command-but-blocks-the-piped-form.md`
(closed, but whose remedy this ADR's restoration re-establishes).

## Context

`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` governs which Bash
commands a session may run. A project-root containment check for the
read-only lane (`rg`/`grep`/`cat`/`head`/`tail`/`wc`/`stat`/`file`/`git`
read-only subcommands, single-command and several bounded pipeline shapes)
was added 2026-08-29 (`9639d91e`, closing
`2026-08-29-read-scope-guard-admits-single-command-but-blocks-the-piped-form.md`)
and removed wholesale one day later (`c8c7f449`, `NVA-GF-GREENFIELD-READONLY-1`)
to meet a real, narrow need — an agent reading its own dispatch transcripts
and runner output, which live outside the repository by construction — by
opening the entire read-only lane rather than widening it precisely. The
trade-off was recorded in exactly one place: that commit's own three-line
message. No ADR, no `docs/state.md` entry, no threat-model pointer.

This surfaced 2026-09-01 as a `check-backlog-done-predicate.mjs` REGRESSION:
the 2026-08-29 item's closure claimed a remedy the codebase no longer held.

**PO decision, 2026-09-06 (Triage section of the 2026-09-01 item): re-narrow.**
Restore project-root containment on the read-only Bash lane, admitting an
explicit, resolved (never pattern-matched) set of external read roots,
rather than the blanket removal `c8c7f449` made.

## Decision

Read-only Bash commands are contained to the project root, plus a small,
explicitly enumerated set of additional roots, each derived by realpath
from a value this repository's own code controls:

1. **The plugin's own installed root** (`BOUNDED_PIPELINE_ADDITIONAL_ROOTS`)
   — pre-existing, restored unchanged.
2. **This session's own transcript file** — `input.transcript_path`, exactly
   as the CLI's PreToolUse hook payload supplies it, realpathed, admitted as
   an EXACT single-file match.
3. **This session's own `memory/` directory** —
   `dirname(transcript_path)/memory/`, via `claudeSessionMemoryDirectory()`
   (MEMPATH-1, the identical pattern already established for the write
   side), reused directly rather than re-derived a second way.

**Deliberately excluded from the enumerated set:** the `/tmp` task-output
directory a dispatched subagent's own output lands in. Its location is not
carried in any PreToolUse hook field; admitting it would mean
pattern-matching Claude Code's own tmp-layout naming scheme (uid,
encoded-cwd, session id, `tasks/`) rather than resolving a value this
repository's own code is handed. That legitimate need is left to the Read
tool or the signature-override ceremony instead — a real, accepted scope
limit, not an oversight.

Landed as two dispatches:

- **`NVA-B-READCONTAIN-1`** (commits `cbc30756`, `bc00a861`, `177bf884`):
  restored the pre-`c8c7f449` mechanism verbatim, with no new exception
  roots, so the restoration itself was independently reviewable before any
  widening. Went through two T1 Critic rounds (the two-round cap) fixing a
  stale citation and a symlink-containment bypass across two escalating
  correction rounds — full detail:
  `backlog/evidence/2026-09-06-nva-b-readcontain-1-findings.md`.
- **`NVA-B-READCONTAIN-2`** (commits `e183632f`, `3cbb7d2a`): added exactly
  the two new roots above. T1 Critic: PASS, two minor findings — full
  detail: `backlog/evidence/2026-09-06-nva-b-readcontain-2-findings.md`.

Both flow through the same realpath-safe containment primitives
(`isRealpathedWithinBoundary`/`rawReadCandidatePath`) — no lexical-only
shortcut for either restoration or widening.

## Current scope-gap inventory (as of 2026-09-06, all disclosed and tracked)

This restoration does not close every read-scope gap that exists or has
been found since. Recorded here so a future reader sees the complete,
honest boundary rather than assuming the lane is now uniformly hardened:

- **The `rg`-to-`rg`/`rg`-to-`head` bounded pipeline stays fully lexical**
  (`guard-command-grammar.mjs`'s `approvedReadPath`) — no `realpathSync` at
  all, a strictly weaker check than even `NVA-B-READCONTAIN-1`'s own
  round-1 fix, and it does not receive the two new session-derived roots
  either. Tracked:
  `2026-09-06-the-rg-pipe-family-stays-lexical-and-symlink-unaware-after-readcontain-1.md`.
- **The cat-pipeline family** (`isBoundedCatPipeline`) also does not
  receive the two new session-derived roots — reading the transcript or
  memory directory through a `cat <path> | grep ...` shape is refused;
  only the single-command shape is admitted. Disclosed in
  `NVA-B-READCONTAIN-2`'s own commit message as a deliberate scope
  boundary (would need a three-function signature change not required by
  that task's DoD). Folded into the rg-pipe item below (same shape: a
  pipeline lane not receiving a root set or discipline the single-command
  lane already has).
- **grep-pipe carries no location containment at all**, in either the
  pre-removal, removed, or restored state — `NVA-BL-76` never scoped it in.
- **A leading-`~` argument was admitted as inside the project root** (a
  literal-string mismatch, not a symlink shape) until fixed by
  `NVA-B-TILDEFIX-1` (commits `afc6af70`/`c88c4f1f`/`aa389a17`, T1 Critic
  PASS) — findings and residual minors:
  `backlog/evidence/2026-09-06-nva-b-tildefix-1-findings.md`,
  `2026-09-06-commandpath-and-two-lane-tests-still-carry-the-untreated-tilde-construction.md`.
- **Two edge shapes land on a technically-wrong denial code** (a trailing
  `2>/dev/null` or `&&`-chained outside-root read reports
  `GUARD-REDIRECT-UNAPPROVED`/`GUARD-OPERATOR-UNAPPROVED` rather than the
  true-reason `GUARD-READ-SCOPE-OUTSIDE-ROOT`) — still refused, not a
  containment bypass. Tracked:
  `2026-09-06-suppressed-and-chained-outside-root-reads-land-on-the-wrong-denial-code.md`.
- **Closed, 2026-09-06 (`NVA-B-GLRMINORS-1`, commit `571e67a8`):** the
  transcript-file exception's "EXACT single-file match... never a
  directory-prefix admission" invariant is now enforced structurally at
  `isApprovedSingleCommandReadArg()` (identity check first, then refuse
  outright for any non-identical candidate under a FILE-typed boundary)
  rather than relying on the OS's own `ENOTDIR` at read time. T1 Critic
  PASS with two minor follow-ups: the exported `isRealpathedWithinBoundary`
  primitive itself keeps its unguarded FILE-boundary behavior, un-caveated,
  for any future caller that reuses it that way (tracked:
  `2026-09-06-isrealpathedwithinboundary-keeps-unsafe-file-boundary-behavior-uncaveated.md`);
  this document and `guardrails/security.md` SEC-11 needed the "still owed"
  language corrected (this edit).
  Full history: `2026-09-06-the-exact-transcript-file-exception-admits-a-nonexistent-child-path.md`.
- **The WRITE lane's `isPathWithinRealpathedRoot` may share the READ lane's
  `..`-through-symlink bypass shape** `NVA-B-READCONTAIN-1` found and
  fixed — unverified, depends on host-tool internals (Claude Code's own
  Edit/Write implementation) this repository cannot inspect. Tracked:
  `2026-09-06-the-write-lane-symlink-containment-check-may-share-the-read-lanes-dotdot-bypass.md`.
- **`backlog-item-strip-for-dispatch.mjs` does not strip a `## Resolution`
  section**, a process gap found while building one of this restoration's
  own Critic dispatches (unrelated to the guard itself, but discovered in
  the same work). Tracked:
  `2026-09-06-backlog-item-strip-for-dispatch-does-not-remove-a-resolution-section.md`.
- **This restoration is correct in source but was NOT live-enforced for
  this session while the work was landing.** This session's own enforcing
  guard resolved to a separately-installed marketplace copy of
  `guard-lifecycle-ready.mjs`, six commits and roughly two days stale,
  predating this whole restoration entirely — confirmed by a T1 Critic's
  live reachability probe (a synthetic marker path, never a real
  credential) during `NVA-B-TILDEFIX-1`'s review. This is a deployment/
  install-sync gap, not a defect in the restoration itself, but it means
  any claim that the restored containment is "live" needs this caveat
  until an operator resyncs the installed copy. Tracked:
  `2026-09-06-the-installed-plugin-copy-enforcing-this-session-predates-todays-guard-fixes.md`.

## What this decision does NOT do

- It does not claim the read-only Bash lane is now bypass-proof — the
  inventory above lists what remains open, on purpose, rather than
  implying completeness.
- It does not change anything about the WRITE lane's containment
  (`isPathWithinRealpathedRoot`, `isProjectWritePath`,
  `isClaudeSessionMemoryWritePath`, `isMachinePlaneWritePath`) — read and
  write remain governed by separate, independently-evolving mechanisms
  that happen to share primitives.
- It does not solve the `/tmp` task-output read need — that stays routed
  through the Read tool or the signature-override ceremony, a conscious
  exclusion (Decision, above), not a gap to close later under this ADR.

## Consequences

**Positive:** the 2026-08-29 item's remedy is real again IN SOURCE — the
`GUARD-READ-SCOPE-OUTSIDE-ROOT` refusal, the reachability-lift
classification, and the bounded-additional-roots mechanism all match what
that item's closure originally claimed, so
`check-backlog-done-predicate.mjs` no longer reports it as a REGRESSION.
Whether it is enforced for a GIVEN session depends on that session's
installed plugin copy being current — see the scope-gap inventory's final
entry above; this decision does not, by itself, make the restoration live
everywhere it is claimed to hold. The
legitimate transcript/memory read need is met without reopening the whole
lane, closing the exact failure mode `c8c7f449` introduced. The decision
and its current honest boundary are now recorded where EL-04 requires: this
ADR, a register entry in `docs/state.md`, and a pointer from
`guardrails/security.md` (SEC-11) as the nearest existing threat-model-scope
document — no dedicated Bash-guard threat-model file existed to point from;
this ADR and SEC-11 are that pointer until/unless one is created.

**Negative:** the enumerated-roots design means every future legitimate
read need outside the project root requires its own resolved-root
addition (a small, reviewable diff) rather than a general relaxation —
by design, this is the cost the PO's "re-narrow" decision accepts
explicitly, in exchange for never again silently reopening the whole lane.

## Alternatives considered

- **Accept and document** (the 2026-09-01 item's other named direction):
  keep the open read lane from `c8c7f449`, and record that reads are not
  writes, the guard is not the security boundary for reads, and the real
  boundary is the host process's own permissions. Rejected by PO decision,
  2026-09-06 — not because the reasoning is wrong in the abstract, but
  because the PO chose the narrower, resolved-roots design over accepting
  the wide-open state.
- **A single module-level constant for the session-derived roots**
  (matching `BOUNDED_PIPELINE_ADDITIONAL_ROOTS`'s existing shape). Rejected
  during `NVA-B-READCONTAIN-2`'s implementation: both new roots vary per
  invocation with the PreToolUse hook's own `input`, so caching them at
  module load (a one-time, process-lifetime constant) would either go
  stale across sessions sharing a process or require an explicit
  invalidation mechanism that does not otherwise exist in this file;
  computing them once per Bash call inside `evaluateLifecycleReadyGuardCore`
  is the pattern actually implemented.

## Follow-up

- PO acceptance of this ADR's text (number and index-row assignment happen
  at acceptance per ADR-0069 D2).
- Close `2026-09-01-read-containment-was-removed-a-day-after-it-was-added-with-no-recorded-decision.md`
  and re-verify/close `2026-08-29-read-scope-guard-admits-single-command-but-blocks-the-piped-form.md`
  once this ADR is accepted (both reference this file as their acceptance-
  criterion evidence).
- Each item in the scope-gap inventory above is tracked and scheduled
  independently; this ADR does not gate their resolution, only records
  that they exist and are known.
