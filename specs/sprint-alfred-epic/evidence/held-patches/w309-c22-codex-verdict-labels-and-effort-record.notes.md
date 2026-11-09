# w309 — Verdicts carry candidate and scope, effort is recorded from events (candidate 22)

Delta on the candidate 22 chain (clone base 7b3b59dd9, three commits). Closest accepted criterion: AC-108 (PRD and Spec unchanged). Built by a Goldfish in a clone; delivered as a held patch. Targeted delivery green for CGF-14 and CGF-08/CGF-23; CGF-11 measured only (see below). Batch Critic, Full Verify and PO acceptance stay pending.

## Why

Three findings of the Codex greenfield report: CGF-08 and CGF-23 (architecture verdicts and reports carry no candidate, date, scope, blocking or report-only, current or superseded), CGF-11 (extra PO work), CGF-14 (effort recorded by role heuristic, not from events).

## What it changes (all under plugins/pipeline-core/)

1. CGF-14 effort from events (`scripts/runner-transcript-recovery.mjs`, test beside it)
   - Existing store reused: the read-only transcript export. New top-level key `effort` (schema `pipeline.runner-effort-record.v1`) and exported pure `extractRunnerEffort(runner, records, children)`. No new store, nothing written.
   - Per PO answer (PO message to the record before the next PO message): `promptAt`, `startAt`, `answerEndAt`, `intervalMs`, `models`, `usage` (tokens with cache keys). Per child: its own first-to-last timestamp interval and usage. Each figure is observed or typed null / `{status:"unobserved"}`; a list `unobserved` names what no transcript carries.
   - Measured per runner (from the code and its fixtures, not live): Claude records a human prompt (user row without a tool_result), per-message usage with cache keys, and `message.model`. Codex records `user_message`, `task_started`/`task_complete`, `turn_context` model and `token_count`; per-answer tokens are taken ONLY from `last_token_usage`, a cumulative `total_token_usage` is never diffed (answer usage stays unobserved without it). Antigravity records no PO message and no model: the answer starts at `turn.started` (`startKind: "turn-started"`), usage from `turn.completed`, `model` and `po-prompt-time` listed unobserved. The pipeline phase and a task class are carried by no transcript: unobserved for all three. Children: Claude and Codex list children, Antigravity does not (existing typed reason).
   - Restated pin (QG-04, in place, with a comment): the key-set pin of the export in `runner-transcript-recovery.test.mjs` gained `effort`.
2. CGF-08 / CGF-23 verdict labels (new `lib/architecture-verdict-label.mjs`; wired in `scripts/architecture-boundary-check.mjs`, `lib/architecture-adoption-orientation.mjs`, `lib/close-quality-readback.mjs`)
   - Label (`pipeline.architecture-verdict-label.v1`): source, verdict, candidate commit, observation date, scope, effect (blocking or report-only), currency (current, superseded, unobserved), open report-only classes. Candidate and date are null where not observed; currency is then `unobserved`, never `current`.
   - Boundary check: result gains `verdict` (blocking). `measureArchitecture` lists the over-budget size entries as an open report-only class next to a PASS (ABC12 shows PASS with 2 open entries). The candidate is `git rev-parse HEAD` (injectable `readCandidate`).
   - Orientation: result gains `verdict` (report-only, observation date, adoption scope, no candidate).
   - Close readback row `architecture-fitness`: the row shape and status rules are unchanged; the evidence text now carries the label of the latest recorded observation and lists open report-only classes beside "present".
   - Helpers `closeFitnessVerdictLabel` (superseded on `source-drift`) and `fitnessObservationVerdictLabel` exist and are tested but are not yet called at a runtime site beyond the readback row (see not changed).
3. CGF-11 (measurement only, no code)
   - Already built, left alone: the re-ask refusal (`lib/answered-intake-values.mjs`, keys gitAuthor, language, profile, designAnswers, verifyCommand, wired by `withReaskRefusals`), the attribution-only actor assignment (`lib/pipeline-actor-assignment.mjs`, scopes submit-plan, present-plan, close-feature, push-init), the signing readiness probe, the push clean-tree precheck.
   - Measured gap 1: of every collect-input name the driver asks (featureId, planPath, prdPath, specPath, language, gitAuthorName/Email, profile, projectDescription, textTurnRef, text, answersJson, by, advisorExportConsent), exactly one is outside the re-ask map: `by` (reopen-design recovery actor). It is not in the actor scope set on purpose (it discards an approval), so it stays an ask; a note, not code.
   - Measured gap 2 (not built): guidance strings print `submit-plan --by <name>` and `present-plan --by <name>` (driver lines near the gate chapter and the continuity-drift diagnostic, and `lib/onboarding-continuity.mjs`); those two verbs ARE attribution scopes, so a held actor label could be named there. Not changed, no measured live ask.
   - Hand steps, from the guidance text: agent steps already (append `.gitignore`/`.gitattributes` lines, move extra `architecture/` entries into `scratch/`, all preparation of signed gates); must stay human: the signature in the PO's own terminal, the human-approval mode choice, intake consent, confirming the verify command, installing a plugin update.

## Tests (test-first)

- `scripts/runner-transcript-recovery.test.mjs`: 5 new CGF-14 cases. RED before the edit: 5 failed, 41 passed. GREEN after: 46 of 46.
- `scripts/architecture-boundary-check.test.mjs` ABC12, `lib/close-quality-readback.test.mjs` CGF-23, `lib/architecture-adoption-orientation.test.mjs` CGF-08: each RED before the edit (1 failed each), GREEN after: 12 of 12, 12 of 12, 7 of 7. ABC12 was corrected once after the edit: one assertion checked an internal key on the plain check result (only the public measurement hides it); the assertion now checks the measurement.
- `lib/architecture-verdict-label.test.mjs`: 5 cases, 5 of 5. NEW test file: needs registration in the Verify suite list (`harness/verify-suites.json` is protected and was not touched).
- Neighbour: `lib/pins/codex-own-session-audit-export-missing` 14 of 14.

## Deliberately not changed

- The single architecture projection for preflight, plan and Verify (needs an authority decision: which verdict wins when the boundary check and the recorded fitness observation disagree; also one reader over rigor history plus the boundary result). Reported, not built.
- `closeArchitectureFitnessDisposition` output and the closed feature entry: stored, exact-key validated (`lib/onboarding-continuity.mjs`) and hashed; no key added. Rigor history rows (hashed and recomputed) untouched. The close part (CGF-30) not redone.
- Preflight and the Verify consumers do not print the new labels yet.
- Critic preimage files, guard hooks, protected tests, the files named off limits.

## Neighbour suites (final code, one at a time)

- `scripts/pipeline-start-preflight.test.mjs`: 98 of 99. The first run found a real regression of this patch: AC-245 compares the Elephant and scoped bootstrap envelopes byte for byte and the orientation `verdict.observedAt` carried the wall clock (two runs differed by milliseconds). Fixed at the source in a third commit: the orientation names the date only when the caller supplies a clock, otherwise `observedAt` is typed null (test restated in the orientation suite: two calls are deepEqual). The one remaining failure, "trusted Windows custody leaves bootstrap ready" (status `plugin-refresh-required`), is NOT caused by this patch: the same suite on the sibling clone c22-c1, which does not carry this patch, fails the same single test.
- `scripts/pipeline-start-preflight.continuity-drift` 9/9, `scripts/verify-evidence-producer` 58/58, `lib/architecture-public-greenfield-route` 10/10, pins `greenfield-architecture-entry-names-materialization` 5/5, `security-close-chain-is-hard-per-calibration` 24/24, `acceptance-criteria-are-examined-as-whole-user-journeys` 8/8; orientation 7/7 after the fix.
- Note: the boundary check verdict does carry `observedAt` from the wall clock (injectable `now`); `verify-evidence-producer` stays green, no byte comparison of it was found.

## Not built: CGF-11 actor label in guidance strings

Not built on purpose: no live re-ask was measured, the strings are static pinned text in the driver and in `onboarding-continuity.mjs`, and a held label would turn them into dynamic text across many pinned suites. Candidate for a follow-up slice with its own measurement.

## Not proven
- Real runner transcripts were not used (briefing); field names for Codex `user_message`, `turn_context` and `last_token_usage` come from the existing fixtures and comments, not a live rollout.
- Two suites were started in one tool block once (orientation and readback, RED runs, private temp each); results were not affected.
- No Full Verify, no Critic review.
