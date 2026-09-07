# Native slicing delivery evidence

Task `NVA-B-NATIVE-SLICING-1` adds nonblocking native advisory delivery for
Codex and Antigravity under ADR-0080. Fixture coverage is in
`plugins/pipeline-core/hooks/guard-slicing.test.mjs` (GS31–GS34): it executes
the registered Codex and Antigravity entrypoints, verifies their documented
context-output shapes, and covers serial threshold, fan-out reset, retry,
malformed-input, and storage-failure behavior.

This is fixture evidence only. The parent owns the separate live runner probe
described in ADR-0080's implementation addendum; no model call or transcript
was captured by this dispatch.

## Native manifest matcher addendum (NVA-B-NATIVE-MANIFEST-1)

`SubagentStart` and `SubagentStop` now declare the explicit empty-string
matcher supported by the Codex native hook contract. This preserves their
match-all lifecycle behavior while satisfying the repository manifest-shape
contract; commands, timeouts, event names, safety registrations, and the
capability inventory remain unchanged.

Machine evidence: `scratch/NVA-B-NATIVE-MANIFEST-1/verify.txt`, captured by
`node plugins/pipeline-core/scripts/capture-evidence.mjs --out scratch/NVA-B-NATIVE-MANIFEST-1/verify.txt --label native-manifest-matchers -- node --test plugins/pipeline-core/hooks/hooks-manifest-shape.test.mjs plugins/pipeline-core/hooks/guard-slicing.test.mjs harness/scripts/check-consumer-safe-paths.test.mjs` (exit 0; 58 tests passed).
