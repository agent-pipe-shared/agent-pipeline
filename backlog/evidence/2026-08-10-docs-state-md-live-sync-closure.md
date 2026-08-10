# Closure evidence: docs/state.md live-sync mechanism

- **Item:** `2026-08-09-docs-state-md-next-action-text-is-a-static-snapshot-with-no-live-sync.md`
- **Decision:** option 1 from the item's own "Why this needs a dedicated
  design pass" section — regenerate the "Next action" text on every relevant
  `pipeline-state.mjs` command — chosen by the PO, 2026-08-10.
- **Fix commits:** `1b9ca12e52d07b1db0d36656645b9ee5e6a904e6` (GF-090, part 1)
  adds `nextActionSection(state)` (a pure renderer, reusing `derivePlanLifecycle`
  for state classification), `replaceNextActionSection(markdown, sectionText)`
  (a fail-closed splice touching only the "## Next action" span, returning
  `null` rather than guessing when no exact heading is found), and
  `syncStateMdNextAction(dir, state)` (the best-effort file rewrite built on
  both) to `plugins/pipeline-core/lib/onboarding-continuity.mjs`, with 14 new
  unit tests in `onboarding-continuity.test.mjs` covering draft,
  awaiting-approval, approved, implementing, no-active-feature, and
  unclassifiable states. `049ab1a8bc5224345cae2e8a48ced0ebe2c030e5` (GF-090,
  part 2) wires all seven state-changing commands in
  `plugins/pipeline-core/scripts/pipeline-state.mjs` (`set-feature`,
  `set-phase`, `submit-plan`, `reopen-design`, `approve-plan`, `revoke-plan`,
  `close-feature`) to call the sync AFTER their own state write already
  succeeded, wrapped in its own try/catch so a docs-sync defect can never
  surface as a command failure.
- **Independent verification (Elephant, this session):** both commits'
  diffs read directly (`git show 1b9ca12e`, `git show 049ab1a8`) — confirmed
  the renderer fails loudly on an unhandled lifecycle status (lookup table,
  not a switch, so a missing entry falls through to an explicit "no
  rendered text yet, treat machine state as authoritative" message rather
  than silently producing wrong text), confirmed the splice never touches
  any section other than "## Next action", and confirmed every one of the
  seven call sites is placed strictly after its own state write's success
  path, never before an error return. GF-090's own manual end-to-end
  transcript (in its dispatch record) drives a real
  `set-feature → submit-plan → approve-plan → set-phase → reopen-design`
  sequence and shows the rendered text tracking every transition correctly,
  full circle back to the submit-plan text after `reopen-design`.
  `node plugins/pipeline-core/lib/onboarding-continuity.test.mjs` → 149/149.
  `node harness/scripts/pipeline-state.test.mjs` (the existing, TP-5-protected
  suite, run only — never edited) → 314/314, no regression. Full
  `node harness/scripts/verify.mjs` → 267/267 suites, exit 0, bound exactly
  to commit `049ab1a8`.
- **Known, disclosed gap (not silently dropped):** integration-level
  automated regression coverage for the seven call sites inside the
  protected `harness/scripts/pipeline-state.test.mjs` (TP-5) is deferred
  pending a signed maintenance window — substituted with full unit coverage
  of the pure functions plus the manual end-to-end transcript above. Also
  disclosed: `discard-feature` (a plausible eighth call site, similar effect
  to `close-feature`) was not wired, out of the seven named in this item's
  own Direction section — left as a documented follow-up, not silently
  assumed covered. A project whose calibration configures a
  `docs/state.md`-alternate handover path is likewise out of this
  mechanism's scope, disclosed in-code rather than silently ignored.
