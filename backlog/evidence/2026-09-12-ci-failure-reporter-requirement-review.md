# CI failure reporter — requirement review

Date: 2026-09-12
Assurance: `functional-equivalent-read-only`; OS isolation was not asserted.
Requirement: `docs/adr/0084-ci-failure-reporter-public-log-boundary.md`

## Historical verdict before the accepted repair

The reporter reviewed at that time did not satisfy the draft requirement.

### Blockers

1. `redactText()` recognizes only four credential patterns and the reporter
   emits every other bounded raw log line. It does not positively classify
   values, so generic passwords/tokens, absolute host paths, email/user names
   and arbitrary private output can reach a public CI log. This violates
   AC1–AC7, especially AC4, AC5 and AC7.
2. The top-level exception handler emits raw `error.message`. An internal
   reporting failure can therefore disclose the very values AC1 and AC9 require
   it to withhold.

### Major

The suite covers the four current blocklist shapes and private-key bodies, but
not default denial, absolute paths, personal identifiers, generic secret
shapes or the unexpected-error path.

## Accepted existing behavior

The Critic confirmed CI reachability, per-suite/global bounds, visible
truncation, tail-recovery edge cases, visible ordinary degradation, and the
current non-gating exit behavior described by draft AC10.

No candidate-bound implementation evidence was claimed for this historical
review. The PO subsequently accepted AC5 and AC10 in ADR-0084; the repaired
candidate requires a fresh exact-candidate review.

No native Codex sandbox or App-Server readiness under WSL was used or claimed.
