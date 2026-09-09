# Remaining local candidate review coverage

This inventory preserves recovered scope; it is not a review result or an
authorization to reopen completed packages. The accepted local delta remains
`specs/sprint-nova-epic/design/2026-09-07-local-candidate-delta.md`.

- Native preflight has completed two genuine native Critic rounds, at
  `04e5883b` and `b4818e66`, both FAIL. Their immutable reports are
  `2026-09-09-native-preflight-critic-round-1.json` and
  `2026-09-10-native-preflight-critic-round-2.json`. The final correction is
  directly self-verified under the two-round cap; do not schedule round three
  or turn a self-verification into a Critic PASS. Round two's authorship
  assessment remains not verifiable because stripped dispatch records were
  not supplied; later supplemental records cannot rewrite that observation.
- Migration correction retains its preceding generic independent report in
  `scratch/v3-frontdoor-prior-critic.json`, candidate
  `a695c5e9e5ce6f7fd0d57b906af3dc16c1338a9f`. The attempted correction review
  ended before model initialization at `5b21e726`; it is not a completed round.
  The old report is historical coordinator evidence, not a selected receipt or
  current candidate evidence. Preserve the exact correction lineage and the
  current prohibition on prior verdict prose in the model context.
- Capability completion includes `docs/product-capability-inventory.json`,
  `harness/scripts/check-product-capability-inventory.mjs`, its test, and public
  targets. Completion commits are `b25c8696`, `8f08381f`, `bf376474`; their
  starting parent is `ad8087fe2b0234fb1847e0ee047179350eee65d1`. The complete
  current checker is a direct contract and explicitly required technical
  coverage. Its earlier implementation includes `e32f34c5`, `f1a18d0f`,
  `e7a3f5a4`, and `4a9a40d6`. The inventory remains inactive without its genuine
  required receipt; the retracted generated-obligations question is not a PO
  blocker.
- Reader-binding implementation is the consecutive package
  `f99583bb51d7eb5d3622f3cd44cb5713d77a054b..c3daf1a295a0539ec6db51d0338704b8fa654930`.
  `da4011a3` introduces `harness/scripts/check-doc-reader-binding.mjs`,
  `harness/reader-review-protocol.md`, and tests in
  `harness/scripts/check-doc-contracts.test.mjs`. `c3daf1a2` integrates
  `plugins/pipeline-core/scripts/release-preflight-cli.mjs`, its tests,
  consumer-safe-path checking, and push/release documentation. Reader reports
  at `163d58e0` do not constitute technical review of that implementation.
- Compatibility-schema binding is the one-commit package
  `c8c9ef1ba5124ea1713971a544f1f919775692e7..bb4bc13ebc8ec774c296ae1abcb5737f4a325f88`:
  `plugins/pipeline-core/config/codex-sandbox-compatibility.v2.json` and its
  compatibility test. The reducer and `codex-sandbox-preflight.schema.json`
  are direct contracts. Schema expansion `a7053748` is earlier, not part of
  that pin repair.
- GG22 implementation already exhausted two rounds and was self-verified and
  closed in `2026-09-06-nva-b-gg22fix-1-findings.md`. The separate trailing-slash
  repair `9c274f7b` also has a recorded T1 PASS. Do not reopen either. Only
  seven later permanent tests in `plugins/pipeline-core/hooks/guard-git.test.mjs`
  are new coverage, exact insertion
  `c3daf1a295a0539ec6db51d0338704b8fa654930..bdaa374b303dee04b1a6a3311c1b4a76c0c1d748`.

The original 88-reference consent survives with its preview digest in
`2026-09-09-local-candidate-po-decisions.md`; its original diff base was not
recovered. Do not invent it. The accepted delta already authorizes the named
remaining work. Preserve D.6's missing comparable measurements as an evidence
dependency, then complete inventory activation, fresh reader rounds and
binding, candidate stamp, final checks, and the test handover in their actual
dependency order. No live Alfred readiness, installed-plugin update, push or
release is established by these source records.
