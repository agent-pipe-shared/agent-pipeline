# Current candidate inventory and reader integration audit

The initial technical audit reviews the named current artifacts at the
dispatch's exact candidate commit/tree against the accepted local candidate
requirements. Its request and receipt use explicit current-artifact scope and
bind all submitted source bytes. Judge the current implementation, including
reachable entry points, error paths and the full direct contracts below.
This is separate from the reader exercise.

After that initial audit, QG-13 correction reviews use only the immediately
previous reviewed commit through the new candidate, fixes in that diff and
their direct regressions. The source lists below define retained initial
coverage, not instructions to repeat a full audit in each follow-up. Use
native `reviewBase` with `reviewMode: "full"` for an exact-range follow-up;
never submit another current-artifact scope to reopen unchanged cleared areas.
The coordinator preserves actual results, receipt/source bindings, source
equality and the continuous finding-disposition lineage; the fresh reviewer
receives no prior verdict prose or findings. Apply the inventory spec's
explicit actual-PASS criterion and lineage requirements without claiming that
a later diff receipt itself contains the original eight-source coverage.

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

## Inventory-delta rollback

If a newly assigned surface, source baseline or review state is found to be
wrong before publication, revert the inventory-only commit, restore the last
attested inventory bytes and rerun the suite-registration and final inventory
checks. If later source changes make that prior baseline incomplete, keep the
inventory at `required-before-publication` with a null receipt, correct the
surface assignment or baseline in a new commit and obtain a new independent
delta review. Never retain an old receipt digest across changed inventory
bytes, and never weaken or remove a discovered product surface merely to make
the inventory checker pass.
