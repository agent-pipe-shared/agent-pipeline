# NOVA-GMW-1 correction round 1 — status against critic-review-1-0b83a2e.md

Candidate: `a58e836^..2bc1fc8` (five commits: `a58e836`, `b974dda`, `db88788`, `0b83a2e`,
`2bc1fc8`), worktree `agent-ab84ec0efe49bd94a`. Responds to
`specs/sprint-nova-epic/evidence/nova-gmw/critic-review-1-0b83a2e.md` (FAIL, F1-F6).

All statements below are Elephant-verified directly against the worktree (diff read
in full, three test suites re-run independently in this session), not taken from the
dispatched agent's self-report alone.

## Finding disposition

- **F1 (blocker, unsigned/unMACed expiry) — fixed.** `expiresAtMs` is now inside the
  signed subject (`guard-maintenance-window.mjs:296-300`), computed once and clamped
  in `prepareGuardMaintenanceWindowRequest` (`:351-353`). Editing it in the stored
  record now breaks the subject/intent digest. Verified by reading the diff and by
  `GMW04b` (new) passing.
- **F2 (blocker, unconsumed nonce / unlimited renewal) — fixed.** `installGuardMaintenanceWindow`
  writes the signed `expiresAtMs` through verbatim and never recomputes it
  (`:421-431`); refuses outright if it has already passed. Re-running `install` with
  an identical `{request, proof}` cannot move the effective expiry later — verified
  by reading the diff and by `GMW09`/`GMW10` (new) passing.
- **F3 (major, scope not re-validated) — fixed.** `validScope`/`isLiftableRuleId` now
  re-checked at `install()` (`:385-386`), inside `currentGuardMaintenanceWindow()`
  (`:474-477`), and inside `windowCoversRule()` (`:538`). Verified by reading the diff
  and by `GMW11`/`GMW12` (new) passing.
- **F4 (major, missing real armed-window kernel-refusal integration test) — NOT
  fixed, environmentally blocked.** The false coverage claim in the test file's own
  header IS fixed (it now names the gap honestly instead of claiming coverage that
  doesn't exist — see `guard-maintenance-window.test.mjs:15-25`). The actual
  integration test does not exist: `guard-gate-strength.test.mjs` and
  `guard-testpath.test.mjs` are untouched by any of the five commits (confirmed:
  `git diff b974dda..2bc1fc8 --stat -- <both paths>` shows only db88788's original
  16-line TP-* wiring, nothing from the fix commit). Root cause: this repository's
  own live `guard-testpath.mjs` (TP-2 for `guard-testpath.test.mjs`, TP-6 for
  `guard-gate-strength.test.mjs`) refuses every Edit/Write into these files, and
  `gates.push_approval: "signature"` admits no in-session override — confirmed by
  the dispatched agent across two independent attempts. The exact test content
  needed is held at
  `specs/sprint-nova-epic/evidence/nova-gmw/blocked-test-additions-2bc1fc8.md`
  for application outside a guarded session.
- **F5 (major, suite not registered in verify.mjs) — NOT fixed, same environmental
  block.** `harness/scripts/verify.mjs` is TP-3 protected; the one-line
  `TEST_SUITES` addition is held in the same handoff file. Independently confirmed:
  `node plugins/pipeline-core/lib/guard-maintenance-window.test.mjs` (13/13),
  `node plugins/pipeline-core/hooks/guard-gate-strength.test.mjs` (19/19), and
  `node plugins/pipeline-core/hooks/guard-testpath.test.mjs` (8/8) all pass when run
  directly — but none of this is captured in a sealed `verify.mjs` run, and the new
  suite still is not part of that gate.
- **F6 (minor, undocumented gap) — partially addressed.** The gap now has a proper
  evidence file (this one, plus the handoff file) rather than only a commit-message
  mention. No backlog item filed yet (Elephant follow-up, not in the dispatched
  agent's authority).

## Why F4/F5 are structurally different from F1-F3

This is not a shortcut or a scope-avoidance move: the two remaining gaps are test
additions to files that this repository's own already-live guard configuration
protects, and the very mechanism this dispatch is building (GMW) is not yet merged
into the live-enforcing checkout — it exists only on this worktree branch. There is
today no lift path for this specific edit that does not require either (a) the human
applying it directly outside a Claude Code session, or (b) merging this branch first
(a deliberate, human-attended action per ADR-0058's residual-risk note, not something
to do unilaterally mid-correction-round).

## Independent regression evidence (Elephant-run, this session)

```
guard-maintenance-window: 13 passed, 0 failed
guard-gate-strength: 19 passed, 0 failed
guard-testpath (TP): 8/8 cases passed
```

No sealed full `harness/scripts/verify.mjs` run exists for `2bc1fc8` (F5's own gap
prevents it from being probative for the new suite even if run).
