# ADR Advisor round-10 vendor integration

The non-writing vendored-canon check found exactly one stale consumer copy:
`plugins/pipeline-core/docs/adr/0047-model-free-advisor-preflight-v2.md`.
The sanctioned generator synchronized that destination from the accepted
repository-root source `docs/adr/0047-model-free-advisor-preflight-v2.md`.
The final generator check confirms that every vendored canon file now
byte-matches its source.

The consumer-path scan run after generation, before any allowance mutation,
passed with zero findings. ADR-0047's complete `Governs:` header names only
paths under `plugins/pipeline-core/`; it contains no source-only prefix.
Accordingly, no Class B consumer allowance was added and
`harness/scripts/check-consumer-safe-paths.mjs` remains unchanged. The final
proof reconstructs the same zero finding result and appends a separate
`harness/scripts/verify.mjs` consumer instruction to confirm the checker still
rejects it.

Machine-written captures are retained under
`scratch/NVA-B-ADR-GOVERNS-VENDOR-10/`: `pre-generation-check.txt`,
`consumer-pre-allowance.txt`, `check-final.txt`, `consumer-test.txt`,
`consumer-gate.txt`, `doc-contracts.txt`, and `generator-final.txt`. The final
proof records ADR-0047's accepted status, its current SHA-256, and its one
historical source-hash delta using the established classifier limited to
normative content before `DE-REFERENCE-BELOW`.

The direct consumer-path suite, consumer gate, documentation-contract gate,
and final generator check passed. No source ADR, runtime, policy, guard,
schema, test, ledger, or consumer-checker behavior changed. Candidate-wide
verification and independent review remain with the parent; no Critic-skip
claim is made.

The terminal source commits supplied for this integration were EXECUTION-10
`e8b823d6f98091c8193b76beb7142d1c4d83a13d`, ASSURANCE-10
`97fab3d48b1267bbc0599a65a8386543eb676b16`, and NATIVE-10
`7232b834d41c7441eadaa3d7057370f50bc5dfe0`.
