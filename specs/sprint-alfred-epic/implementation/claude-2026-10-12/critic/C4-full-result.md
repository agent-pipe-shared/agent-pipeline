# Critic C4 FULL: result (persisted by the Elephant)

The Critic could not persist its notes (`DISPATCH-BUDGET-CRITIC-NOTES-UNAVAILABLE: critic-notes-partial-held`);
the Elephant records the returned report. Route: requested `claude-sonnet-5-5 at high`; observed
`claude-sonnet-5-5`. Lane: functional-equivalent-read-only. Review object: `0c8416ca5`, `9b0890d5c`, `d12af9232`,
`7d8c5a49d`, `72dbaffef`, `fbe0b5ea5`, `2a5bd9fea` ([briefing](C4-full.md)). The checkpoint fired at counted call
28 of 35.

**Status: PARTIAL review, pass/fail withheld. Four minor findings passed the evidence gate; no blocker or major.**

## Findings (neutral registry for any correction)

| ID | AC | Gap | Evidence |
|---|---|---|---|
| C4-F1 | AC-219 | The pin has no case for a caller without a home override and none for an invalid selected plane; the header (line 8) claims A3 covers the no-override default, but A3 only exercises the explicit override. | `lib/pins/onboarding-home-override-does-not-bind-machine-plane.test.mjs:8`, `:93-109`, `:34-43` |
| C4-F2 | AC-251 | The scratch-cleanup assertion cannot fail: the fake `spawnFn` creates no file, so deleting `cleanupScratch` keeps the test green; the commit message claims cleanup is bound. | `lib/pins/semgrep-offline-default-version-check.test.mjs:102-108`; `scripts/security-adapters/semgrep.mjs` `runScan` |
| C4-F3 | AC-273 | The real-kernel examiners L-1/L-2 are skipped on win32 and have never run; no owner or date is recorded for the Linux run (QG-06). | `lib/pins/worktree-process-start-parser-misreads-spaced-comm.test.mjs:41-43`, `:187-239` |
| C4-F4 | AC-218 | Test 6 is named for the reader's physical root but only compares the observed scope root with the fixture; root and authority binding rest on a source-text regex. Bullet 4 (23 callbacks) has no examiner in this pin. | `lib/pins/nongit-retirement-reader-calls-inaccessible-controller-helper.test.mjs:108-116`, `:129-136` |

## Examined and found in order (summary)

- Category 1: AC-218 tests 1-5, AC-229, AC-250, AC-251 env/argv/ERROR, AC-252, AC-273 S-1..S-4 and AC-219 A1-A3 match the production code read.
- Categories 2 (stat level), 4, 5, 8, 10, 11: one new test file per commit, no deletion, no production change, clean trailers (`Commit-Act: orchestrator` on all seven), no new dependency, English.

## Trajectory: not verifiable

No mechanical run artifact; one claim/evidence inconsistency (C4-F2, "scratch cleanup bound" in `7d8c5a49d`).

## Not reached

Category 3 (registration of the seven pins in `harness/verify-suites.json`); spec Detailed Implementation rows;
`guardrails/quality-gates.md`, `guardrails/security.md`, `roles/goldfish.md`, `project/pipeline.json`; unread
production paths in `governance-scope.mjs`, `scripts/governance-scope-diagnose.mjs`, `security-scan.mjs`
(`runSecurityScan`, CLI main), `worktree-lifecycle.mjs` (cleanup, intent, owner runtime),
`project-onboarding-v3.mjs` (lib and script), `lib/machine-plane.mjs`.

## Disposition

One Correction Goldfish owns C4-F1..F4 (pin-only changes). Per the PO budget rule (one FULL plus at most one DIFF),
at most one DIFF round follows, then Elephant self-verification. C4-F3 needs the WSL Node run (PO decision K7).
