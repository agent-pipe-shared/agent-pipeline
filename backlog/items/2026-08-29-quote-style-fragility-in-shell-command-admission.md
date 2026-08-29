---
schema: pipeline.backlog-item.v1
id: pipeline.quote-style-fragility-in-shell-command-admission
type: defect
owner: pipeline
status: closed
created: 2026-08-29
closed_at: 2026-08-29
closure_repository: self
closure_evidence: backlog/items/2026-08-29-quote-style-fragility-in-shell-command-admission.md
sprint: nova
done_when: manual
source: "Claude/Windows self-audit sections 2 and 10.13 from the 2026-08-29 three-runner greenfield test (finding F24 of scratch/greenfield-triage-2026-08-29.md)."
---

# An identical JSON payload is admitted single-quoted and refused backslash-escaped, with no parse-error code distinguishing the two

## What happened

The audited session sent the same JSON payload as a command argument twice:
once with `\"`-escaped double quotes (the form many callers reach for by
habit, and the form some tool layers emit automatically when composing a
command string), and once single-quoted. The single-quoted form was
admitted; the `\"`-escaped form was refused as `GUARD-LIFECYCLE-NOT-READY`
with a message that gives no indication the cause was quoting style rather
than an actual readiness/lifecycle problem. The session burned a full
retry cycle rediscovering, by trial, that the fix was a quoting change and
not a lifecycle-state fix.

## Where it is

Investigated `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` (the
`GUARD-LIFECYCLE-NOT-READY` code family — occurrences at lines 84, 179, 449,
452, 545, 3139, 3226, 3276, 3292, 3310, and the terminal `blocked(...)` call
at line 3714) and could not locate the specific quote-tokenization branch
this finding describes. `GUARD-LIFECYCLE-NOT-READY` in the code as read is
the generic "session lifecycle is not ready for this tool call" denial, not
a shell-parse-error code — which is itself consistent with the finding:
whatever misparsed the `\"`-escaped JSON evidently fell through to this
generic lifecycle denial rather than surfacing as its own diagnosable parse
error, but the exact tokenization function responsible for treating the two
quote styles differently was not identified within this dispatch's
investigation budget. This is recorded as a located-but-unconfirmed
mechanism, not a guessed one: the mismatch between the finding's described
symptom (a JSON-argument quoting difference) and the observed denial code
(a generic readiness code, not a parse-error code) is itself worth a fresh
session's targeted repro before design work starts.

## Proposal

1. Reproduce the exact pair of commands (same JSON payload, `\"`-escaped vs.
   single-quoted) against a live `restart-required`-or-similar session and
   capture both denials verbatim, to confirm which guard and which internal
   function actually diverges on quote style.
2. Once located: either (a) make the guard's own command-text tokenizer
   treat the two quote styles equivalently wherever POSIX shell semantics
   make them equivalent, or (b) if true equivalence is not decidable without
   widening the admitted grammar, emit a distinguishing error code/message
   for "this looks like a quoting-style mismatch" rather than the generic
   not-ready denial, so the caller is pointed at quoting rather than at
   lifecycle state.
3. Do not widen the closed shell grammar to admit new constructs as a side
   effect of this fix — the fix is about diagnosing an existing admission
   asymmetry, not adding capability.

## Acceptance

- A test reproduces the asymmetry (or, if step 1 above finds no asymmetry
  reproducible today, the item is retriaged with that negative result
  recorded rather than left open indefinitely).
- Once confirmed: the two equivalent-payload, different-quoting-style
  commands either both succeed or both fail with a message that correctly
  names quoting as the cause, verified by a test pinning both denial/success
  outcomes.
- No previously-refused command becomes admitted as an unintended side
  effect — the existing `guard-lifecycle-ready.test.mjs` suite passes
  unchanged aside from the new coverage.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** discarded
- **Rationale:** PO decision, 2026-08-29, during the Topic 8 defer-design/
  unclear sweep: static reading found no asymmetry and the live-repro
  investigation this item's own Acceptance criteria require was not
  considered worth the dispatch. Dropped rather than pursued.
- **Assignment:** `sprint: nova` — closed, no further work.
- **Date:** 2026-08-29
