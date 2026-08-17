# Progress evidence: unregistered-suite detector (candidate 1 of a two-part item)

Backlog items (both stay `open` — this covers only their candidate-1 detector
work; candidate 3, the actual TP-3 suite registration, is unchanged):
- `backlog/items/2026-08-07-unregistered-suite-is-red-and-invisible-to-verify.md`
- `backlog/items/2026-08-08-a-hardening-round-cannot-register-the-suites-it-writes.md`

## Timeline

- `eda26a52` (dispatched `NVA-SUITEREG-1`) — new script
  `plugins/pipeline-core/scripts/check-suite-registration.mjs` (enumerates
  `**/*.test.mjs`, compares against `verify.mjs`'s registration list, an
  explicit named opt-out for deliberate exclusions) plus its test suite
  (11 synthetic-input tests). Real-repo run: 334 enumerated, 261 registered,
  92 unaccounted (1 known-expected, 6 known false positives from
  SCOPED_VERIFY_SUITES/WINDOWS_ASSURANCE_VERIFY_SUITES, 85 genuinely
  unaccounted needing later triage).
- Round-1 Critic review: verdict **FAIL**. F1 (major, disqualifying): the
  module header claimed the parser fails closed on every unrecognized
  `file:` value shape, but the regex-only extraction (`JOIN_CALL_RE`) only
  matched the literal `file: join(...)` text pattern — any other shape was
  silently skipped with no diagnostic, and a `join(...)` call mixing one
  quoted with one unquoted/variable segment silently reconstructed a
  truncated path instead of failing. F2 (minor): the dispatch record's own
  report had an arithmetic error (92-1-6 reported as 86, actually 85).
- Separately, the Elephant's own full-Verify re-run after `eda26a52` landed
  found a third issue: the new file's own source comments cite
  `harness/scripts/verify.mjs`'s layout, violating
  `harness/scripts/check-consumer-safe-paths.mjs`'s source-only-path rule
  (no allowlist entry existed yet).
- `62554374` + `a783fb25` (dispatched `NVA-SUITEREG-2`) — fixed all three:
  the allowlist entry (`62554374`), and F1 via a depth-aware character scan
  (`extractFileKeyValues`) plus a quote/bracket-aware argument splitter
  (`splitTopLevelArgs`) that fails closed (throws
  `PARSE-TEST-SUITES-UNRECOGNIZED-SHAPE`) on every previously-silent shape,
  with 4 new regression tests (`a783fb25`). F2 addressed as an additive
  addendum to `evidence/dispatch-record-NVA-SUITEREG-1.json`'s log array
  (historical `report` field left untouched), per the briefing's explicit
  instruction. The original goldfish-deep dispatch's own transcript ended
  mid self-check before writing its final report fields into
  `evidence/dispatch-record-NVA-SUITEREG-2.json`; the Elephant completed
  that record from git history plus independent re-verification.
- Round-2 Critic delta review (`62554374^..a783fb25`, bounded, prior F1/F2
  registry supplied as neutral evidence): verdict **PASS**. F1 and the
  consumer-safe-paths issue confirmed genuinely resolved by hand-tracing the
  algorithm and independently re-running the new parser against the real
  `harness/scripts/verify.mjs` alongside a faithful reconstruction of the
  old parser: `{"newCount":261,"oldCount":261,"identical":true}`, confirming
  the "byte-identical output" claim empirically rather than by trusting it.
  One new minor finding (dispatch-record test-count claim said "2 new
  regression tests," actually 4 — the shipped coverage exceeds what was
  claimed, not the reverse) — corrected as an additive addendum to
  `evidence/dispatch-record-NVA-SUITEREG-2.json`'s log array, same pattern
  as the F2 fix; no effect on the shipped code's correctness.
- `node plugins/pipeline-core/scripts/check-suite-registration.test.mjs` →
  15/15, independently re-run against the current checkout, 2026-08-17.
- `node harness/scripts/verify.mjs` (bound to `3f9332ee`, `binding: exact`,
  269 suites) → only the two known pre-existing baseline failures
  (`human-guard-override-tests`, `backlog-state-check`), unrelated to this
  work; `consumer-safe-paths-tests` and `backlog-ledger-reconciliation-tests`
  both clean.

## What this closes and what it does not

This evidence covers ONLY candidate 1 (the detector script) of both backlog
items above. Candidate 3 — actually registering
`codex-isolated-critic-protected-preimage.test.mjs`, and the other 84
genuinely-unaccounted suites the detector's live run now names, inside
`harness/scripts/verify.mjs` (TP-3, requiring a signature or
maintenance-window ceremony per this repository's `signature`-mode push
approval) — is UNCHANGED. Both backlog items stay `status: open` until that
half lands.

## Independent Elephant re-confirmation, 2026-08-17

The detector's fixes are present in the current checkout's source
(`62554374`, `a783fb25` on `feat/sprint-nova-codex-v046`), the target suite
re-runs clean as recorded above, and the round-2 Critic review concluded
with an unambiguous PASS verdict with no unresolved blocking or major
finding.
