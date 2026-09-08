# Antigravity cached-token common projection — evidence

`commonProjection` now maps Antigravity's admitted native `cached_tokens`
field to `common.cachedInputTokens`. The observed metric preserves
`sourceField: "cached_tokens"`; it does not create billing, model identity, or
a value for an omitted source field. Codex remains on `cached_input_tokens` and
the independent Claude cache metrics remain unchanged.

The direct cache regressions retain U31 and add explicit checks for a nonzero
native counter, explicit zero, omission, raw `usage` bytes, the complete native
event hash, and rejection of the Codex-only cache field in an Antigravity event.
The test summary and `process.exitCode` now run after U31–U34, so a cache
assertion failure determines the process result.

The first scoped capture at
`scratch/NVA-B-AGY-USAGE-CACHE-1/usage-cache-final.txt` retained U13 and U27
as aggregate receipt failures while U31–U34 and all consumer-path checks
passed. The later frozen-V2 compatibility repair restored the legitimate Sol
receipt path without changing cache behavior. Its terminal green capture is
`scratch/NVA-B-USAGE-COMPATIBILITY-1/usage-compatibility-final.txt` for:

`node --test plugins/pipeline-core/lib/runner-usage-v1.test.mjs plugins/pipeline-core/lib/route-receipt.test.mjs plugins/pipeline-core/lib/p3b-runner-conformance.test.mjs harness/scripts/check-consumer-safe-paths.test.mjs`

It exits 0: 37 usage checks, 123 receipt checks, 3 conformance checks, and 9
consumer-path tests pass. Node's aggregate `pass 12` also counts the three
custom-suite wrapper files. This establishes the cache repair together with the
separate compatibility repair; it does not claim that current V3 project
selection is a live usage-metering authority.
