---
schema: pipeline.backlog-item.v1
id: pipeline.restart-barrier-can-precede-verbatim-intake-capture
type: defect
owner: pipeline
status: closed
closed_at: 2026-10-07
closure_repository: self
closure_commit: 26fef9e7d26be3d59b7e609c1dad9dd04c747b4d
closure_evidence: specs/sprint-alfred-epic/plans/backlog-triage-2026-10-07.md
created: 2026-09-27
source: "Codex/WSL greenfield review B5, 2026-09-27: a restart card summarized the original input while the intake checkpoint's materialInput was reported empty."
sprint: none
done_when: manual
---

# A restart barrier can be reached before the verbatim user input is captured

## Description

The greenfield run reports that a 14,110-byte original request was absent
from `materialInput` when Codex restarted. The next session recovered it from
the earlier transcript and then used `intake-capture-apply`. The current
consumer design input proves eventual capture, but does not independently
prove why the pre-restart checkpoint was empty. This is a recurrence candidate
after earlier closed restart/consumption items, so a live boundary test is
required before selecting a fix.

## Triggering situation

The 2026-09-27 Codex greenfield restart before design-input generation.

## Affected artifact

`resume-hint.mjs`, `onboarding-continuity.mjs` intake capture, Codex
SessionStart hint, and onboarding restart-barrier actions.

## Proposal

Reproduce the exact route from first user request through the returned
restart barrier and inspect the checkpoint before restarting. If the barrier
can precede a verified verbatim chunk, make capture a precondition or return
one typed in-session capture action. Preserve the original bytes once, with
digest readback; a summary remains orientation only.

## Acceptance

- A real Codex restart test begins with a multi-kilobyte user request and
  proves the exact material chunk exists before the first restart barrier.
- The resumed session reads the same digest without transcript hunting or
  duplicate user questions.
- If the reported sequence cannot be reproduced, record the actual root
  cause and distinguish user/agent action order from storage failure.

## Triage

- **Decision:** closed — fixed in source
- **Rationale:** fixed at 26fef9e7d: lib/onboarding-continuity.mjs / project-onboarding-v3.mjs first-restart intake gating; test: onboarding-first-restart-intake.test.mjs 'proposed first runtime restart withholds plan and direct apply until explicit original-input capture'.
- **Assignment (if accepted):** n/a
- **Date:** 2026-10-07

## Canonical boundary reproduction and prepared Codex correction (2026-09-28)

A controlled 14,110-byte Unicode/CRLF request reproduces the missing boundary:
portable seed and runtime apply publish the first restart barrier with an
absent intake checkpoint. A second canonical fixture proves that the existing
explicit consent/capture CLI stores the exact bytes, deduplicates retry and
surfaces them after ticket consumption through identified SessionStart. This
confirms an ordering/precondition gap; it does not establish the historical
private runner's precise chat sequence or a storage failure.

The prepared Codex-only first-intake condition returns existing explicit
consent/capture actions before fresh runtime/restart actions. Recorded consent
is reused. Runtime plan digests bind verified checkpoint and ordered material
identities; a last reobservation refuses changes before barrier publication.
Corrupt or unavailable evidence withholds the action. Seven proposed registered
tests pass, plus two Codex marker coordinator fixtures using the corrected
ordering. No resume-hint call that invents affirmative consent was added.

Evidence and hashes: `scratch/first-restart-intake-preparation-evidence.json`.
The exact behavior and limits are in
`scratch/first-restart-intake-integration-contract.md`. Legacy fixture alignment
has a prepared patch; all 180 project-onboarding cases pass in four shards with
selected proposed modules. Unselected dependencies and subprocesses remain
canonical. Full canonical Verify, coherent skill/operating-model wording,
productive integration and actual native Codex restart remain pending.
The API cannot prove chat-turn identity from an arbitrary existing chunk, and
its final recheck is not an atomic transaction with every intake writer. The
real acceptance test must compare the externally known original request digest
before and after restart. This item remains open; no new signature was requested.

The fixture review exposed a second path in the proposed correction: the
historical manual kickoff planner admitted the generic `intake-required`
observation and could mint continuity before first capture. A targeted fixture
failed on the exact returned kickoff schema, then passed after the prepared
plan/apply entry points both withheld the nested `capture-required` condition.
The seven-case result includes this planner/direct-apply refusal and the actual
readiness gate's closed observation-envelope validation. This is preparation
evidence, not a claim that the productive source has been corrected.
