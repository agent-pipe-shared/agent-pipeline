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
