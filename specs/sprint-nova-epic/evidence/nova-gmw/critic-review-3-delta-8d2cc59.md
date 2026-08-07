# NOVA-GMW-1 Critic review 3 (delta, bounded to Finding 1/INV-2) — PASS

Bound base (prior delta-review head): `d28d4d7`.
Bound head (this delta): `8d2cc59fc278914fb11dbb752bfe01456be7888b`.
Prior receipt: `specs/sprint-nova-epic/evidence/nova-gmw/critic-review-2-delta-2bc1fc8.md` (commit `3b2d0b0`).
Route requested: `claude-opus-5 at max` (guardrail-tier, MP-07). T1 assurance:
functional-equivalent-read-only; OS isolation not asserted.

## Verdict: PASS

INV-2 is genuinely closed: no blocker or major finding survives against it.

## Findings

None.

## Evidence built by the Critic

Traced the exact code path in `guard-maintenance-window.mjs` (proof
verification → already-expired check → new
`expiresAtMs > nowMs + MAX_WINDOW_TTL_MS` check, `GMW-EXPIRY-TOO-FAR` →
`installedAtMs = nowMs` → the sole `writeAtomic(paths.window, ...)` call) and
confirmed no branch reaches the write without passing the new check; confirmed
the only production caller (`scripts/guard-maintenance-window.mjs`) has no
`nowMs` override. Ran the shipped suite directly (14/14) and built an
independent boundary repro (exact-ceiling-equality admitted, one ms over
refused with `GMW-EXPIRY-TOO-FAR`, and the worst-case ~100x-oversized
hand-built request refused at every premature attempt, succeeding only at its
earliest legitimate instant with a reinstall two hours later producing an
identical, never-later effective expiry) -- 3/3 passed, corroborating the fix
at its mathematically tightest points.

## Deliberately not flagged (cleared)

Invariant fidelity (traced in full, not just read), scope (exactly the two
named files), test integrity (GMW05 strengthened not weakened; GMW09-12
untouched; new GMW13 adds coverage), edge cases (boundary equality verified by
execution), guardrail anchors (ADR-0058 point 4 formula still literally
implemented), security surface (independent repro), QG-06 (no new
documented-not-fixed gap), authorship (correct trailers on `8d2cc59`).

## Trajectory check: consistent

Shipped suite 14/14 matches the commit's claim. Independent repro 3/3.
Sealed evidence artifact's `commit`/`tree` fields match the bound head exactly;
the artifact itself lives in a later follow-up commit (`b846727`) rather than
inside `8d2cc59` -- traced and confirmed as an unremarkable two-step pattern
(a commit cannot contain its own Verify output), not a discrepancy.

## Disclosed, not a finding

The Critic hit this repository's own live `guard-lifecycle-ready.mjs` guard
three times while building independent evidence (shell-grammar rejections, a
content-based rejection for a fixture that would have been named
`critical-human-proof.json`, a cross-repo-mutation rejection). It redesigned
each repro rather than working around the guard's evident intent.

## Closing note

This closes the GMW guardrail-tier review chain for NOVA-GMW-1: three
correction rounds (F1-F3, F4-F5, Finding 1), each independently Critic- and
Elephant-verified. Remaining before this can be considered fully delivered:
the PO's own end-to-end signing test with a real trust anchor, and the
deliberate, human-attended merge of the worktree branch into the live-
enforcing checkout -- both explicitly out of scope for any dispatched agent.

Full report text is this file's origin: Elephant-transcribed from the Critic
dispatch's returned result, 2026-08-07.
