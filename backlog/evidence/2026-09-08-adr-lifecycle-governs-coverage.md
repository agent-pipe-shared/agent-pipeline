# Lifecycle ADR Governs coverage

This slice advances the stated accepted-ADR inventory from 19 to 22 of 75 by
adding bounded declarations to ADR-0027, ADR-0028 and ADR-0029. It does not
create a reconciliation record, candidate receipt, or completeness claim for
the remaining 53 accepted ADRs.

## ADR-0027 — Gate philosophy

- `guard-devplan.mjs` and `guard-push.mjs` are the two enforcing hook entry
  points the accepted decision names.
- `guard-devplan-policy.mjs` is the shared current owner of the Dev-Plan
  verdict used by both write and shell lanes.
- `hooks.json` binds the hook entry points to the runtime event surface.
- `manifest.mjs` reads the declared `blocking|warn|off` gate calibration that
  each hook evaluates.
- `guard-devplan.test.mjs` and `guard-push.test.mjs` directly exercise the two
  enforcing gate contracts.

`guard-git.mjs` is deliberately omitted: it supplies independent destructive
Git denials rather than either of ADR-0027's two human gates. The more focused
push release/ledger/attestation suites are also omitted because they test later
separate contracts rather than this gate-philosophy decision.

## ADR-0028 — Manifest approach

- `yaml-lite.mjs`, `schema-lite.mjs`, and
  `pipeline-manifest.schema.json` provide the accepted parse, structural
  validation, and schema authority.
- `manifest.mjs` is the runtime reader and semantic validator.
- `setup.mjs` is the compiler-managed authoring path introduced by the Phase-2
  amendment.
- `project-authority.mjs` resolves the current neutral and legacy runtime
  targets used by the compiler and readers.
- `plugins/pipeline-core/agents/**` is the narrow, nonempty tracked directory
  that the accepted distribution decision assigns to the plugin. The proof
  accepts this one owned-directory glob and verifies every match is tracked and
  nonempty.
- `setup.test.mjs`, `yaml-lite.test.mjs`, `schema-lite.test.mjs`, and
  `project-authority.test.mjs` directly exercise the compiler, strict parser,
  schema validator, and resolved-target contracts.

`agent-model-registry.test.mjs` reads the real agent files but tests model
metadata rather than the distribution decision, so it remains outside this
header. The old direct `.claude/` wording is retained in the decision body and
handled through the current resolver, rather than declared as a stale file
path.

## ADR-0029 — File handoffs and status

- `pipeline-state.mjs` is the current CLI-only State writer; it replaces the
  historical `harness/scripts/pipeline-state.mjs` reference in the accepted
  wording.
- `project-authority.mjs` resolves the State's neutral and legacy locations.
- `guard-devplan.mjs`, `guard-push.mjs`, and `stop-suggest.mjs` are the three
  current read-only State/manifest consumers described by the decision.
- `templates/dev-plan.md` is the tracked template for the declared plan-artifact
  location.
- `pipeline-state.test.mjs`, `guard-devplan.test.mjs`, `guard-push.test.mjs`,
  and `stop-suggest.test.mjs` directly test the State writer and the three
  State/manifest readers named above.

The runtime State, evidence receipts, and feature-specific plan artifacts are
per-project data, not source-repository implementation paths. They therefore
remain outside this source-header declaration.

The parser, exact-tracked-path, duplicate/wildcard, and header-stripped
`HEAD`-body checks passed through
`node scratch/NVA-B-ADR-GOVERNS-LIFECYCLE-3/check.mjs` (exit 0). The sanitized
terminal capture is
`scratch/NVA-B-ADR-GOVERNS-LIFECYCLE-3/governs-parser-and-body-check-correction-final.txt`.
