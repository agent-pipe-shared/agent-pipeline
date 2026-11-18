# w316 (C31-B6): the Antigravity child model notice names its repair; the design-review reference matches the route

Criterion binding: AC-112 is the closest existing accepted criterion; the PRD and Spec are unchanged.

## What

- `plugins/pipeline-core/lib/agy-native-goldfish.mjs`: the `AGY-NATIVE-CHILD-MODEL-NOTICE` sentence now ends with the two named repairs
  (inherit or no Model: re-issue with `Model: "flash"`; flash: the host resolved the alias to the session model, nothing to repair, the
  observation is in `modelCheck`). The check, the families and the verdict shape are unchanged.
- `references/design-course.md`: a three-row table (Claude, Codex, Antigravity) of the step between a returned design review and
  `design-review-receipt.mjs create`.
- `references/antigravity-native-dispatch.md`: one sentence pointing at that table.
- Tests (restated nowhere, two NEW cases in the existing registered pin file
  `lib/pins/antigravity-native-goldfish-dispatch-needs-consent-and-has-no-parent-binding.test.mjs`): the notice for
  `gemini-4-hydrogen-tiered-high` carries `Model: "flash"` and `modelCheck.status` is `mismatch`; a tier match still has no notice; the
  reference table exists and the named commands exist as subcommands of `design-review-receipt.mjs`. Both were RED before the edits.

## Why (verified in code)

- `design-review-receipt.mjs` has exactly two subcommands, `create` and `export-report` (the usage refusal names only these).
  `export-report` reads a host observation that only a Claude `readiness-reviewer` dispatch records (its own refusal says so).
- Neither reference text contained a design-review `finalize` step before `create`; the only `finalize` for Antigravity is
  `scripts/agy-host-observed-finalize.mjs`, which completes a Goldfish Final Return, not a design review. No Antigravity step turns a returned
  review into the report: the text is written to the report file as returned and `create --report` follows; the receipt says `unobserved`.
  The Codex row restates the same existing reference sentence ("no observation route yet"); a Codex-specific readiness host exists
  (`codex-design-readiness-host.mjs`) and was deliberately not described.

## Open question for the consumer session (NOT resolved by code)

The dispatch guard refuses `inherit` or an omitted Model for a Goldfish (`DISPATCH-MODEL-MISSING`), yet the consumer saw the notice.
Which happened is not measured: did the parent call pass `inherit` and bypass the guard, or `flash` with the host resolving the alias to a
non-flash name (for example a model whose name has no flash/pro family, such as the `-tiered-high` form, which is always a mismatch)?
Please report the exact `Model` argument of the parent `invoke_subagent` call and the child `modelName`.

## Not changed

No gate, record shape, digest, signature or stored status. `tierOf` families untouched. The generated Antigravity next step still names no
`Model` (lane L10b). The config difference (`runner-mappings.json` flash-high vs `pipeline.user.yaml` flash-medium) was not followed.

## Not proven

The Critic is suspended by the PO for candidates of this repository and no Full Verify ran: tests only (the pin file, 21 of 21 green).
The patch is a delta on the base clone of candidate 31 and applies only after it; apply it to the real checkout after that base.
