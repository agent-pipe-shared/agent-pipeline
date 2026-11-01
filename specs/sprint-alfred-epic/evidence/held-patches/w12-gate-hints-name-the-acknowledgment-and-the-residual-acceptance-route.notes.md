# Held patch: two gate hints (N28, N29 part 1)

Built by the Elephant (small-fix exception, held patch in a scratch clone, tree untouched) on `c70a7c4e4`. Items
`backlog/items/2026-10-30-handover-size-guard-omits-the-extraction-acknowledgment.md` (N28) and
`backlog/items/2026-10-30-residual-acceptance-route-is-not-named-at-the-push-gate.md` (N29, part 1 only). Both items re-read before the work:
still open (the denial text did not name the acknowledgment step; `criticBoundVerifyRemedy` did not name the residual acceptance).

## What changes

- `plugins/pipeline-core/hooks/guard-handover-size.mjs`: the `HANDOVER-ROTATION-REQUIRED` denial now also says that the rotation script refuses a
  section that is not yet acknowledged (`HANDOVER-EXTRACTION-NOT-ACKNOWLEDGED`, ADR-0066 Decision 7) and names the step: read the section for durable rules
  with no home yet, run the same script with `--acknowledge-extraction-done --section-heading "<block heading>"` (deliberate review work, not a
  formality), then rotate. Text only; the size arithmetic and the net-decrease admission are untouched.
- `plugins/pipeline-core/scripts/push-prepare.mjs`, `criticBoundVerifyRemedy`: the single-line remedy ends with the route for a FAIL with only minor
  findings: `pipeline-state.mjs approve-residual-acceptance --by <name> --critic-packet <packet-id>`, `--reason-class uncorrectable-past-authorship` for
  an uncorrectable major (D227), a blocker is never accepted, see the close-feature skill. Still one line, still `${PIPELINE_PLUGIN_ROOT}`-relative.
- Tests: `hooks/guard-handover-size.test.mjs` (+2 assertions on the denial text), `scripts/push-prepare.test.mjs` (+2 assertions in the existing
  concrete-route remedy case; no case added or weakened).

## Not done (stays open)

N29 part 2, an `authorizeCriticalResidualCommand` builder with the same copy-safe line forms as the push one, is a larger change and stays in the item.

## Evidence (targeted, in the scratch clone)

`guard-handover-size.test.mjs` green; `push-prepare.test.mjs` 88/88, `push-init.test.mjs` and `push-gate-satisfiability.test.mjs` green (167 in the
three-file run); `check-verify-case-completion.test.mjs` 32/32 (no pinned count moves: the size guard test and the push-prepare test are not top-level
assertion counted). `git apply --check` on `08d6fec39` passes. Not done: Full Verify, batch Critic, native Windows, a revert proof.
