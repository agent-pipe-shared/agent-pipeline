# Frozen V2 usage receipt compatibility — evidence

The usage adapter already proves its caller-held request against the exact
frozen V2 registry cell before receipt validation. Historical Codex
`gpt-5.6-sol` requests at `xhigh` or `max` now receive a closed compatibility
adapter only after that check. The receipt validator admits that adapter only
for its exact schema and concrete Sol route, then retains structural schema,
whole-file receipt digest, requested/effective identity, dispatch, candidate,
result, resolution-evidence, and usage-event binding checks.

Current direct validation still rejects direct historical Sol. The adapter does
not change current direct selectors, accept unknown adapter objects or
unsupported efforts, or relax the P3B Terra host-evidence rule. V3 project
selection and current V3 usage-metering support remain separate open work.

`scratch/NVA-B-USAGE-COMPATIBILITY-1/usage-compatibility-final.txt` captures:

`node --test plugins/pipeline-core/lib/runner-usage-v1.test.mjs plugins/pipeline-core/lib/route-receipt.test.mjs plugins/pipeline-core/lib/p3b-runner-conformance.test.mjs harness/scripts/check-consumer-safe-paths.test.mjs`

It exits 0 with 37 usage checks, 123 receipt checks, 3 conformance checks, and
9 consumer-path tests passing. Node's aggregate `pass 12` also counts the
three custom-suite wrapper files. U13, U13c, U27, U31–U34, C02, RR99–RR102, and
all other direct checks pass. No provider call, schema/registry change, or live
metering was performed.
