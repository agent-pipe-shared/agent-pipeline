Provenance: candidate commit `11e0b54c4b96aad2fc5492da1d4171bb9585a367`; candidate tree `3bff1f63cc0f4dd303a59514c7c6f5762b550f5b`; requested route `functional-equivalent-read-only`; effective identity `unknown`; assurance `functional-equivalent-read-only; OS isolation not asserted`.

Requested route: functional-equivalent-read-only; effective model identity: unknown.
Assurance: `functional-equivalent-read-only; OS isolation not asserted`. Report persistence was unavailable; no write or mutating command was invoked.

Candidate: `11e0b54c4b96aad2fc5492da1d4171bb9585a367` (`3bff1f63cc0f4dd303a59514c7c6f5762b550f5b`).

## Findings

No findings.

## Deliberately not flagged

- The occurrence key now includes source, line, normalized ID, and ordinal occurrence; the new fixture proves only one same-line duplicate is suppressed.
- CLI output now visibly reports the accepted immutable-snapshot exclusion count.
- The E1 plan now documents a concrete revert-and-revalidate rollback path, satisfying checklist item 4.
- No direct regression in callers, test integrity, dependency/security exposure, or governance checklist items 1–3 and 5–8.
- No undocumented architecture-guideline deviation.

## Trajectory check

**not verifiable** for the original E1 focused validator and `git diff --check`: their referenced dispatch record was not supplied. The supplied `verify evidence (evidence/verify-latest.json)` does exactly bind this candidate and tree to `node harness/scripts/verify.mjs`, exit 0, including doc-contract tests and check.

## Briefing violations observed

None.

## Verdict

**PASS** — the three prior findings are resolved in this correction delta.

```json
{"findings":[],"deliberately_not_flagged":["occurrence-specific exclusion","visible CLI exclusion count","documented rollback path"],"trajectory_verdict":"not verifiable","trajectory_evidence":"verify-latest.json binds candidate/tree and exit 0; focused-validator and git-diff-check dispatch evidence absent","briefing_violations":[],"pass":true}
```
