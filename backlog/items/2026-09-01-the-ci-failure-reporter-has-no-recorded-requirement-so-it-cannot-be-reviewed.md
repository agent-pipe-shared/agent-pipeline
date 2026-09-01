---
schema: pipeline.backlog-item.v1
id: pipeline.ci-failure-reporter-has-no-recorded-requirement
type: defect
owner: pipeline
status: open
created: 2026-09-01
sprint: nova-b
tracking: "Nova B — print-verify-failures.mjs decides what a failing CI run writes into a public log, and no artifact anywhere states what it is required to do. A Critic dispatch against it is refused by its own fail-closed boundary for want of a spec."
done_when: manual
source: "Found on 2026-09-01 while constructing the Critic rounds for the day's wave: the round covering this component could not be dispatched."
---

# The CI failure reporter has no recorded requirement, so it cannot be reviewed

## What is missing

`harness/scripts/print-verify-failures.mjs` and its suite were built on
2026-09-01 in response to a live problem: `verify.mjs` deliberately keeps suite
output private, so a red CI run carried only a `diagnosticDigest` and no way to
attribute the failure. The reporter was wired into `.github/workflows/verify.yml`
as an `if: failure()` step and immediately paid for itself, attributing three
failing suites to one cause.

It works. What does not exist is any statement of what it is *required* to do —
no ADR, no spec, no backlog item, no requirement recorded anywhere. The commits
are `4d5df21c`, `b904c01d`, `8fbb4ed7`, `a5d26a72`, `58fe2d4b`, `c84d2f44`,
`57fefcf2`.

## Why that is not merely untidy

The component performs **redaction**. It decides what a failing run writes into
a log that is public. Both implementing dispatches deliberately left
`criticSkip` unset and recommended a review for exactly that reason: a gap in
redaction leaks real secrets, and the failure is silent and irreversible once a
CI log is published.

So this is the one component in the day's wave whose review is least optional —
and it is the one that cannot be dispatched. `templates/prompts/critic-review.md`
is fail-closed on its reference boundary: a Critic given a missing or ambiguous
spec must report `Briefing violation` and stop, without substantive review. That
is correct behaviour, not an obstacle to route around, and the Elephant must not
manufacture a spec after the fact merely to unblock a dispatch — a requirement
written to match code that already exists reviews nothing.

Its own redaction logic has already shown it can be wrong in a way that is
invisible: the PEM patterns were written with literal `-----` delimiters, which
`gitleaks` then flagged against the file's own source, and they were rewritten
as `-{5}`. That was caught by an unrelated scanner, not by review.

## What is actually owed

A recorded requirement, written from the problem rather than from the code, that
at minimum states: what classes of value must never reach the log (credential
shapes, tokens, absolute host paths, private identifiers); what the reporter is
allowed to emit on a failure; what it must do when it cannot classify a value —
whether it withholds or emits; and whether a redaction failure is itself a CI
failure or a silent degradation.

Only then is a review of the implementation meaningful, because only then is
there something to review it against.

## Acceptance criteria

- A requirement for the reporter exists as a durable artifact, written from the
  problem and not reverse-engineered from the implementation.
- It states the withhold-versus-emit behaviour for an unclassifiable value
  explicitly, since that is the decision a public log makes irreversible.
- A Critic round against the seven commits above is then dispatched and its
  findings dispositioned.
- Until that happens, the component's review status is recorded as outstanding
  rather than skipped — it is neither reviewed nor exempt.
