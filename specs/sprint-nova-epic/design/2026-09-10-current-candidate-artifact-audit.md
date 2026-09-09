# Current candidate inventory and reader integration audit

This is a technical audit of the named current artifacts at the dispatch's
exact candidate commit/tree against the accepted local candidate requirements.
It is not a historical commit-range review or the separate reader exercise.
The request and receipt must use explicit current-artifact scope and bind all
submitted source bytes. Judge the current implementation, including reachable
entry points, error paths and the full direct contracts below.

## Inventory and public claims

Apply `2026-09-10-capability-current-source-review.md` in full. Audit:

- `docs/product-capability-inventory.json`
- `harness/scripts/check-product-capability-inventory.mjs`
- `harness/scripts/check-product-capability-inventory.test.mjs`
- `README.md`
- `PIPELINE_FLOW.md`
- `docs/operating-model.md`
- `plugins/pipeline-core/docs/operating-model.md`
- `SETUP.md`

Coverage discovery and ownership must agree with the inventory's exact
committed source baseline. Public targets must resolve to actual current
anchors whose claims distinguish delivered, planned and unavailable behavior.
The inventory remains pending with a null digest until the real passing
technical verdict is retained. The final checker authenticates field shape,
not provider execution or the truth of a review. The coordinator must retain
the actual result and its candidate/source coverage separately.

## Reader binding and release integration

Audit the full current contracts of:

- `harness/reader-review-protocol.md`
- `harness/scripts/check-consumer-safe-paths.mjs`
- `harness/scripts/check-doc-contracts.test.mjs`
- `harness/scripts/check-doc-reader-binding.mjs`
- `plugins/pipeline-core/scripts/release-preflight-cli.mjs`
- `plugins/pipeline-core/scripts/release-preflight-cli.test.mjs`
- `docs/push-release-flow.md`
- `plugins/pipeline-core/docs/push-release-flow.md`

The technical checker must enforce the protocol's closed schemas, fixed
document set, real committed source identities, safe paths, size/mode bounds,
ancestor and equality relationships, immutable report references and complete
finding dispositions. Test its actual CLI and integration behavior, not only
schema-shaped fixtures. Invalid/missing/stale records must not become success
at the release entry point. Its assurance remains committed-state equality
and evidence presence; it cannot prove reader identity or judgment quality.
Documentation must describe the delivered invocation and that limitation.

## Compatibility and regression obligations

Audit:

- `plugins/pipeline-core/config/codex-sandbox-compatibility.v2.json`
- `plugins/pipeline-core/lib/codex-sandbox-compatibility.test.mjs`
- `plugins/pipeline-core/hooks/guard-git.test.mjs`

The compatibility pin must identify the actual preflight schema accepted by
the reducer. Read the current reducer and schema as direct contracts. A schema
fixture or stale digest cannot establish compatibility with different bytes.

For `guard-git.test.mjs`, the submitted regression obligation is the seven
tests added in `bdaa374b303dee04b1a6a3311c1b4a76c0c1d748`: judge their real
entry path, expected pathspec behavior and whether they detect the specified
regressions. Existing GG22 implementation and its completed review cycle are
outside this audit. Source required to understand those tests is a direct
contract, not a new general guard-code hunt.

## Evidence and completion boundaries

Use only the provided candidate-bound machine evidence and source references.
Missing historical dispatch records remain missing; mechanical Git metadata
does not attest actual implementer identity. This audit does not establish
live Alfred readiness, runner comparison measurements, installation, push or
release. A passing technical verdict permits the coordinator to proceed with
the specified inventory attestation and the separately required fresh
two-stage reader review; it does not replace those steps.
