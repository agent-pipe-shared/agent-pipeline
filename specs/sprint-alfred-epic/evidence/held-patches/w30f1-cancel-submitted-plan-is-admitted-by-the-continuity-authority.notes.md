# w30f1 — a State entry the continuity producer does not admit is refused with a typed reason and a route (candidate 30f, dispatch C30F-G1)

Applies after the 30e chain (it is the delta `20793081f..HEAD` of a slice clone started from that chain and edits `onboarding-continuity.mjs`, which the chain also edits). Against the repository before the 30e chain it does
not apply; against the 30e chain clone `git apply --check` is exit 0. Criterion binding: AC-108 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## What it changes

- `lib/onboarding-continuity.mjs`: the entry condition is split out of the combined check in `continuityObserveSharedStateWrite`. The repository-digest and the producer-incidence conditions keep the old bare reason. An entry outside
  `continuitySharedStateEntries` now fails with the same code `SDC-AUTHORITY-UNAVAILABLE` and a typed `reason` (the third argument of `fail`, so `describeStateAuthorityRefusal` prints it as `(SDC-AUTHORITY-UNAVAILABLE: <reason>)`, not as an untyped cause):
  `<entry> is not admitted; nothing written. Repair: <route>. Admitted: reopen-design, seal-plan-approval, set-gate-estimate, revoke-plan, set-phase`. The admitted list is derived from the closed set, never a second copy.
  The route is a closed literal per entry: `state.cancel-submitted-plan` names `pipeline-state.mjs reopen-design --by <name>` (an admitted entry: it records an invalidation of the bound submission, returns the design to draft and leaves the
  continuity object alone); every other entry names `node <plugin-root>/scripts/session-cleanup.mjs plan-recovery --repo <root>`, the repair the module already prints for an owning execution. The text stays inside the 240 characters
  `describeStateAuthorityRefusal` prints (the longest entry, `state.set-phase-with-calibration`, has about 3 to spare; the test compares the full text, so a longer text fails it).
- `scripts/pipeline-state-revocation.test.mjs`: one new case on the real CLI in a catalogue project (approved-course fixture, reopened design, registry initialised with the real observer ports): `cancel-mixed-plan-state` and
  `cancel-submitted-plan` are refused with the typed reason (no `untyped` cause), the admitted list and their route, and the State bytes are unchanged before and after (the submission is still bound); a control shows the admitted
  `reopen-design` passes the entry check.

## Why no entry was admitted (per entry)

`continuityVerifySharedStateWrite` requires the cleanup identity (it contains `revision` and the whole `continuity` object) to be equal before and after the write. The five admitted writers do not pass `allowContinuityAdvance`
and leave that object alone. The four others change it or are not modelled:

- `state.cancel-submitted-plan`, `state.cancel-mixed-plan-state`: the writers pass `allowContinuityAdvance` and move `continuity.revision` and `continuity.resume` (`plan-spec-state-v2.mjs`). By the code (read, not reproduced), admitting them
  would pass the observation and then fail the verification (`SDC-AUTHORITY-CAS`, identity changed) after the writer ran. Making them work needs a change to that identity check, which the briefing forbids (CAS checks, snapshot checks,
  witness handling). This is the briefing's last stop condition (the generic checks cannot be shown sufficient for a writer that changes continuity-bound state), so the outcome is `checkpoint` with the refusal part delivered.
- `state.set-feature`: replaces the whole continuity object. Same cause.
- `state.set-phase-with-calibration`: also writes the calibration companion through `afterValidation`; the continuity observation does not model that effect.

So the Codex report's defect (a submitted plan that cannot be withdrawn) is answered by the route, not by admission: `reopen-design --by <name>`.

## Checks

- RED before the production edit: the new case failed on the original code with `cause: untyped KickoffError: continuity State entry not admitted` for `state.cancel-mixed-plan-state`. GREEN after.
- `pipeline-state-revocation.test.mjs` 3 of 3; the other targeted suites are in the dispatch report.

## Not changed / not proven

- Not proven: that no entry can ever be admitted. The catalogue fixture used here (the approved-course fixture, State in the legacy `.claude/` path) cannot drive an entry past the entry check to a successful observation: the later
  neutral-State check refuses, and the new case pins that with a control (`reopen-design`, an admitted entry, is refused with `continuity historical authority requires owning lifecycle transition`, not with `not admitted`).
  I found no existing test that drives any of the five admitted entries to success either (no test names `observeSharedStateWrite` or a `state.` entry). A neutral-State catalogue fixture was not built. No entry was admitted without a test.
- `state.set-feature` and `state.set-phase-with-calibration` are not driven by a test: `set-feature` refuses on active continuity before its writer, and a State without continuity cannot initialise the registry in this fixture.
  Their refusal uses the same single code path as the two tested ones.
- Not proven on a live neutral-State catalogue project that `reopen-design --by <name>` clears the Codex case; it is an admitted entry and the plan lifecycle code (`reopenPlanDesign`) invalidates a valid submission without touching
  `continuity`, but the greenfield run decides. Not proven either that `session-cleanup.mjs plan-recovery` repairs a refused `cancel-mixed-plan-state`, `set-feature` or `set-phase-with-calibration`: it is the repair the module prints for an owning execution,
  named here because no better route exists for those three. For `set-phase-with-calibration` a route may be to calibrate the verify command separately and then run plain `set-phase`; not checked.
- The CAS, snapshot and baseline checks, the witness handling and the five admitted entries are unchanged. `pipeline-state.mjs` and `session-authority-registry.mjs` are unchanged. The full Verify was not made.
