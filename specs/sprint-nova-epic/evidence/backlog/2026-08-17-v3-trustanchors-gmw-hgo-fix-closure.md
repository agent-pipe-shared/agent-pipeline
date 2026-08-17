# Closure evidence: v3 `trustAnchors` read-gap in GMW and HGO signed admission

Backlog items:
- `backlog/items/2026-08-16-gmw-install-never-recognizes-its-own-window-under-v3-multi-anchor-schema.md`
- `backlog/items/2026-08-17-hgo-signed-admission-had-the-same-v3-trustanchor-gap-as-gmw.md`

Both items are the same defect class (a call site reading only the legacy
singular `policy.trustAnchor` field, permanently `null` once
`project/critical-human-proof.json` carries the v3 `trustAnchors` array) at
two different denial-override ceremonies — Guard Maintenance Window and
Human-Guard-Override signed admission. Closed together because the fix
shape, the fail-closed judgment call, and the review history are identical.

## GMW timeline

- `e31f0233` — `NVA-GMWFIX-1`: read path corrected to the v3 array, but
  imported the "absent/empty set accepts any well-formed key" posture from
  the four `CRITICAL_ACTION_KINDS` ceremonies — wrong for GMW, which LIFTS
  guard protection rather than gating a single ceremony.
- Round-1 Critic review (`88e314fa..e31f0233`): verdict **FAIL**. F1
  (blocker): the widened any-key acceptance, undisclosed and unratified for
  GMW's risk class. F2/F3 (major): docstring/ADR-0058 and the commit message
  both asserted a guarantee the code no longer held. F4 (minor): dispatch
  record outcome vocabulary imprecise for a truncated-then-Elephant-finished
  run.
- `04a663d9` — `NVA-GMWFIX-2`: GMW fails closed on an absent/empty v3
  `trustAnchors` set at all three sites (read-path resolution, CLI
  default-authority branch, a new install-internal defense-in-depth check),
  while still correctly reading a populated v3 set. New regression tests
  GMW28 (rewritten, asserts the corrected fail-closed behavior) and GMW32
  (defense-in-depth fires even when only a caller-supplied `trustPolicy` is
  empty). Docs/ADR-0058/threat-model independently re-read post-fix, found
  still accurate.
- Round-2 Critic review (`637f50a1..04a663d9`, bounded delta, prior report
  supplied as evidence): verdict **PASS**. F1-F4 independently re-traced
  against the fixed code, all confirmed RESOLVED. One new major finding
  (N1): the dispatch record itself was never finalized
  (`outcome: "in-progress"`) — fixed directly (evidence-only, gitignored, no
  source change), plus a second related gap found and fixed the same way
  (missing `effort` field, same defect present in two sibling records this
  block, all three independently re-verified `PASS` via
  `dispatch-authorship-verify.mjs`).
- `node plugins/pipeline-core/lib/guard-maintenance-window.test.mjs` → 34/34,
  independently re-run against the current checkout, 2026-08-17.

## HGO timeline

- `954e12da` (dispatched `NVA-HGOFIX-1`, isolated worktree) —
  `authorizeHumanGuardOverrideBySignature()` corrected to mirror GMW's
  already-fixed fail-closed pattern exactly: a non-empty v3 `trustAnchors`
  set wins when present, an absent/empty v3 set falls through to the legacy
  singular field, and a genuinely empty result hard-fails
  (`HGO-TRUST-ANCHOR-MISSING`) rather than adopting the any-well-formed-key
  posture — explicitly briefed against that posture from the start, since
  HGO is a broader arbitrary-denial-override ceremony, same risk class as
  GMW.
- Merged onto `main` as `989cb236` after independent re-verification of a
  clean, conflict-free merge (the worktree's branch point was stale by four
  unrelated commits, confirmed non-conflicting) and a full re-run of the
  affected suite.
- Critic review (first pass, `954e12da`, dispatched 2026-08-17): verdict
  **PASS**. All four resolution cases (v3 populated / v3 empty / legacy
  singular / nothing configured) confirmed test-pinned; independently
  re-derived from the code that `resolvedTrustAnchors` cannot reach
  verification empty (the `fail()` path demonstrably throws, plus an
  explicit belt-and-suspenders length check); confirmed no
  `--authority`-style caller bypass exists in the CLI. One minor finding
  (F1, not blocking): the commit's own dispatch-record evidence is a
  reconstruction (the worktree copy was lost before the Elephant checked
  for it), disclosed in-record; the Critic re-verified code and tests
  directly rather than trusting the record, so the PASS does not rest on
  it. Cross-referenced as a new occurrence of
  `backlog/items/2026-08-09-the-dispatch-record-does-not-bind-to-the-commit-it-vouches-for.md`
  rather than filed separately.
- `node --test plugins/pipeline-core/lib/human-guard-override.test.mjs` →
  38/38 (excluding 5 pre-existing, unrelated `HGO-EXTERNAL-MARKETPLACE`
  failures from a host-environment gap, confirmed pre-existing and
  independent of this fix), independently re-run against the current
  checkout, 2026-08-17.

## Independent Elephant re-confirmation, 2026-08-17

Both fixes are present in the current checkout's source, both target
suites re-run clean as recorded above, both Critic reviews concluded with
an unambiguous PASS verdict with no unresolved blocking or major finding.
