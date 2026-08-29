---
schema: pipeline.backlog-item.v1
id: pipeline.resume-hint-capture-consumes-card-that-failed-schema-validation
type: defect
owner: pipeline
status: closed
created: 2026-08-29
closed_at: 2026-08-29
closure_repository: self
closure_commit: 284eaa78f8791cd5db1843b3afebf8f3ef845a80
closure_evidence: plugins/pipeline-core/scripts/resume-hint.test.mjs
sprint: nova
done_when: contains plugins/pipeline-core/scripts/resume-hint.mjs pipeline.resume-hint-validate-before-consume
source: "Codex/WSL report and the Claude/Windows self-audit report (docs/pipeline-audit-claude-session.md §3.2), both cited by scratch/greenfield-triage-2026-08-29.md finding F12, observed during the 2026-08-29 three-runner greenfield test."
---

# `resume-hint.mjs capture --consume-card` deletes the input card even when validation rejects it

## What happened

`resume-hint.mjs capture` was invoked with `--consume-card` at the mandatory
pre-restart barrier (`plugins/pipeline-core/skills/pipeline-start/SKILL.md`
step 6, the ONE guard-admitted argv shape for that moment). The card failed
schema validation (`RH-CARD-SCHEMA`) and nothing was persisted into
`project/resume-hint.json` — but the card file the agent had just written the
user's material input into was deleted anyway, because it consumed the card
unconditionally rather than only on a successful capture. The material input
that triggered the restart barrier in the first place was lost with no
surviving artifact.

## Where it is

`plugins/pipeline-core/scripts/resume-hint.mjs`, function `main()`:

- `contextCard(cardFile)` (lines 33-41) parses the card and throws
  `new Error("RH-CARD-SCHEMA")` (line 39) when the top-level key shape does
  not match `REQUIRED_CARD_KEYS`/`OPTIONAL_CARD_KEYS`/`VERBATIM_CARD_KEYS`.
- The `capture` branch (lines 95-131) wraps the entire capture body —
  `contextCard(cardFile)` at line 99 through the `captureResumeHint`/intake
  calls — in a `try { … } finally { if (consumeCard) { try { unlinkSync(...) }
  catch … } }` (lines 98, 126-130).

Because `unlinkSync` runs in the `finally` block, it executes **regardless of
whether the `try` block threw**. `contextCard()` throwing `RH-CARD-SCHEMA` at
line 39 propagates straight through the `try`, but the `finally` still fires
and deletes the card at `cardFile` when `--consume-card` was passed — which it
always is, per the SKILL.md-mandated pre-restart argv shape. Validation and
consumption are meant to be sequential (validate, then persist, then only then
delete the input), but the current code makes consumption unconditional on
`--consume-card` being present, not on capture having succeeded.

Confirmed by direct code reading in this repository; not re-executed as a
live repro in this dispatch (see Acceptance for the test that closes that
gap).

## Proposal

Move the `unlinkSync` call so it only runs after a **successful** capture
(after `captureResumeHint` — and the optional intake merge, if present —
returns without throwing), not in an unconditional `finally`. A failed
`contextCard()`/`captureResumeHint()` call must leave the card file exactly
as it was, so the same `--consume-card` invocation (or a corrected one) can
be retried against the still-present card, and so a human/agent inspecting
the failure has the actual rejected bytes to look at rather than nothing.

Introduce a marker, e.g. a comment or constant named
`pipeline.resume-hint-validate-before-consume`, at the point where the fix
reorders validate-then-consume, so this item's `done_when` can bind to it.

## Acceptance

- A test in `plugins/pipeline-core/scripts/resume-hint.test.mjs` (or a new
  sibling) calls `capture --consume-card` with a card file that fails
  `RH-CARD-SCHEMA` and asserts the card file still exists on disk afterward
  and the process reports the schema error.
- The same test then repeats with a schema-valid card and asserts the card
  file is deleted only after a successful capture is observable (e.g. via
  `resume-hint.mjs inspect` reporting `available`).
- No existing passing test regresses (`node plugins/pipeline-core/scripts/resume-hint.test.mjs`
  exits 0).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** Directly confirmed by reading `resume-hint.mjs`'s own
  `finally` block — the destructive-on-failure behavior is not a runner
  misreport, it is the code as written. It is also the root of F13 (the wrong
  fallback transcript was consulted only because the intended, correct
  resume path had just destroyed its own input).
- **Assignment:** `sprint: nova`; blocks the 0.6.0 candidate — a restart is a
  routine event in every session this pipeline runs, and this defect turns a
  routine restart into a silent, unrecoverable loss of the user's own design
  input the moment the card happens to be malformed.
- **Date:** 2026-08-29
