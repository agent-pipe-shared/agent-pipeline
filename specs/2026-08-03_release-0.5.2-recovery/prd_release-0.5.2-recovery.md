# PRD — Release 0.5.2 Recovery

## Requirements

### R-052-01 — Push approval absence is fail-closed

The Push Gate must safely reject absent, malformed, or incomplete required
approval records with a stable blocking diagnostic.  It must never throw or
continue to a raw push.

### R-052-02 — Executor-only publication remains enforced

Raw protected publication commands remain blocked even if stale or
non-target-bound evidence exists.  A ready executor authorization must bind
candidate, remote and destination reference.

### R-052-03 — External capability preflight is evidence based

An external GitHub remote is ready only after credential, ref permission,
repository policy and required workflow capability have independently observed
evidence.  Otherwise preflight is typed `blocked`; it never guesses readiness.

### R-052-04 — Effectful entry points preflight before launch

Relevant skills and launchers must validate their required governance,
capability and topology paths before starting a child or mutating state.  A
failed preflight proves no start occurred.

### R-052-05 — Native-hook sandbox failures do not repeat blindly

The first classified native-hook sandbox permission or timeout failure writes a
session- and fingerprint-bound disposition.  Equivalent later attempts do not
re-run the failing sandbox route; they return typed recovery or use an
explicitly supported host boundary.  This rule does not authorize generic
fallback for semantic guard denials or unknown errors.

### R-052-06 — Guard budgets are coherent and bounded

The Codex PreTool adapter budget and each nested guard allocation are increased
and budgeted together.  The outer deadline still bounds the complete hook,
reserving time for typed recovery/override handling.  Tests cover cold but
permitted sequential `apply_patch` checks and a true exhausted-budget result.

### R-052-07 — Release state is consistent

`VERSION`, state documentation and release-state metadata represent the same
0.5.2 candidate state, with a checker that detects semantic version drift.

### R-052-08 — Candidate assurance

The final candidate passes focused tests, Verify, Security and a preflighted
Critic review.  Critic is not launched if its governance paths are absent.
