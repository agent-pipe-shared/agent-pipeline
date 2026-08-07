# NOVA-GMW-1 Critic review 2 (delta, bounded to F1-F3/INV-1..3) — FAIL

Bound base (prior full-review head): `0b83a2e019e8a30e25a7fa2fa319a04faa7945f1`.
Bound head (this delta): `2bc1fc830df383f2def6b8559f86cfbfe49fb217`.
Prior receipt: `specs/sprint-nova-epic/evidence/nova-gmw/critic-review-1-0b83a2e.md` (commit `bb673a9`).
Route requested: `claude-opus-5 at max` (guardrail-tier, MP-07). T1 assurance:
functional-equivalent-read-only; OS isolation not asserted. A live guard
(`guard-lifecycle-ready.mjs`, `GUARD-GATE-STRENGTH-SHELL`) refused one attempted
runtime repro inside the Critic's own read-only dispatch (a fixture needed a file
literally named `critical-human-proof.json`); the Critic did not attempt to route
around it, so Finding 1 rests on static trace, not an executed repro.

## Verdict: FAIL

## Findings

- **Finding 1 (major):** INV-2 is not fully closed. `installedAtMs` (the sole input
  to the read-time defensive ceiling) is recomputed as `nowMs` on EVERY call to
  `installGuardMaintenanceWindow` (`guard-maintenance-window.mjs:433`), with no
  "keep the original install time" logic. `validSubject` places no upper bound on
  `subject.expiresAtMs` beyond finiteness/positivity (`:300`) — the only upper-bound
  enforcement is `prepare()`'s own clamp (`:354`), which a hand-built (non-`prepare()`)
  request bypasses entirely (exactly the input class `handBuiltRequest` in the test
  file already exercises for other cases). Consequence: a PO signs ONE hand-built
  request with `subject.expiresAtMs` far beyond one `MAX_WINDOW_TTL_MS` (e.g. ~100x);
  repeatedly re-invoking the agent-safe `installGuardMaintenanceWindow` with the
  SAME unchanged `{request, proof}` every <4h walks the read-time ceiling
  (`installedAtMs + MAX_WINDOW_TTL_MS`) forward each time, extending the EFFECTIVE
  expiry indefinitely (bounded only by the original signed value) from one signature
  — contradicting INV-2's "no path to renew/extend a window's lifetime from a single
  PO signature" and ADR-0058 Decision point 4's stated `min(signedExpiresAt,
  openedAt + MAX_TTL)` formula, where "openedAt" implies a stable, one-time anchor.
  Not classified as blocker: still bounded above by the literal signed value (INV-1
  intact, no forgery/replay), and requires a signed subject whose `expiresAtMs` was
  never funneled through `prepare()`'s own clamp — a real but non-default
  precondition. GMW09 (the only repeated-install test) uses `ttlSeconds: 120`,
  far below the ceiling, so the ceiling term is never the binding one in that test;
  GMW05 (the only oversized-expiry test) calls `install()` only once. No test
  combines both conditions.

## Deliberately not flagged (cleared)

INV-1 (signed expiry, tamper detection) — traced the full chain including
`po-approval-proof.mjs`'s actual sign/verify mechanics, genuinely closed, GMW04b
covers the direct case. INV-3 (scope re-validation at all three points) — genuinely
closed, GMW11/GMW12 adequate. Scope (only the two named files changed). Test
integrity (no pre-existing assertion weakened). Edge cases (boundary equality
fail-closed throughout). Guardrail/security-file review (no secrets, no new
dependency). Authorship (correct trailers on `2bc1fc8`).

## Trajectory check: consistent (one disclosed gap)

All three named suites executed directly by the Critic against content confirmed
byte-identical to the bound head: `guard-maintenance-window.test.mjs` 13/13,
`guard-gate-strength.test.mjs` 19/19, `guard-testpath.test.mjs` 8/8 — all matching
the correction commit's own claims. A cross-commit regression comparison against
the pre-fix `0b83a2e` formula was reasoned analytically but not executed (would
require checking out old content, foreclosed by the dispatch's write constraint and
this repo's own live guard) — disclosed rather than silently skipped.

Full report text is this file's origin: Elephant-transcribed from the Critic
dispatch's returned result, 2026-08-07.
