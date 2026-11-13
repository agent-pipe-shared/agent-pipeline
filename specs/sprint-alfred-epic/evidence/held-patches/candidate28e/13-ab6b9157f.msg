feat(security): ship a Semgrep pack per language whose severe classes block

PO tiles 2026-11-12 (candidate 28e). The plugin's default Semgrep pack now
covers Java, C#, Kotlin, Python, Go, PHP, Ruby and JavaScript/TypeScript
next to the web/Node pack: SQL injection, command injection, insecure
deserialization, TLS verification switched off, XXE, path traversal and
SSRF are ERROR (blocking under the default block_on, and under ADR-0093
only when the feature introduced the finding); weak cryptography is
WARNING. Go has no deserialization or XXE rule; JS/TS keeps its command
rule in the web/Node pack (WARNING, unchanged).

- 61 rules, ids pipeline-<lang>-<class>; request-to-sink classes in taint
  mode with framework sources and basename-style sanitizers; a URL that
  starts with a literal scheme, host and "/" does not count as SSRF
- test code (test/, tests/, spec/, *Test.java, *Tests.cs, *_test.go,
  test_*.py, *.spec.* and the like) is excluded from every ERROR rule; the
  exclude list is written out per rule because Semgrep's rule parser does
  not resolve YAML anchors
- Go handlers are bound untyped (Semgrep OSS does not match typed Go
  receivers), gin through the handler signature
- fixtures: semgrep-pack-fixtures/<lang>/hits.* fires every rule of the
  language, quiet.* holds one look-alike per class and fires nothing
- semgrep-default-rules.test.mjs reads the language ids from the YAML,
  checks them against the class table, scans all fixtures in one spawn
  (severity per class, nothing on quiet files) and proves the test-path
  exclude on test-shaped copies of the firing fixtures; 172/172
- security-scan.test.mjs: the provenance pin lists the first 50 ids and
  the count of 72, and the printed line says "(+22 more)"
- file header and the C28 block comment state the new blocking stance

Measured: the whole plugin tree (4,566 files) 23.0 s with the old pack,
26.8 s with the new one; outside the fixtures the new rules report only
three WARNING SHA-1 uses (WebSocket accept keys, RFC 6455).

AI-Assisted: true
Dispatch: stage-0 (elephant)
