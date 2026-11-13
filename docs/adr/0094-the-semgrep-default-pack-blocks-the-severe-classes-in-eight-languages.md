# ADR-0094: The Semgrep default pack blocks the severe classes in eight languages

> Agent-Pipeline · Sprint Alfred · 2026-11-12

**Status:** accepted (2026-11-12, PO tile, register D244). Built in candidate 28e. Not yet run on a real Java, .NET, Python, Go, PHP, Ruby or Kotlin code base.

**Context source (PO tile, 2026-11-12):** the PO chose the recommended option for the shallow scanner configuration: an own offline Semgrep rule pack for Java, C#, Go, Python, PHP, Ruby, Kotlin and JavaScript/TypeScript (SQL and command injection, path traversal, deserialization, weak cryptography, disabled TLS verification, SSRF, XXE), the severe classes at ERROR so they block, each rule with a test that fires and one that stays quiet. A second tile (ADR-0093) limits the block to what the feature introduced.

## Context

The default pack (`plugins/pipeline-core/security/semgrep/pipeline.yml`) had eleven rules, nine of them for JavaScript/TypeScript; only the two secret rules (PEM private key, provider-shaped secret) were ERROR. Under `security.thresholds.block_on` (default critical and high; Semgrep ERROR maps to high) no code finding in any language could ever block a close. The consumer stacks the Pipeline governs (Java and .NET bank teams among them) got no code check at all.

The pack runs offline (`--metrics=off`, no registry rules), so every rule is written and pinned in this repository.

## Decision

1. **Rule ids are `pipeline-<language>-<class>`.** Languages: `java`, `csharp`, `python`, `go`, `js` (JavaScript and TypeScript), `kotlin`, `php`, `ruby`. The eleven older rules keep their ids and severities.
2. **Class and severity:**

   | Class | Severity | Blocks under the default `block_on` |
   |---|---|---|
   | `sql-injection` | ERROR | yes |
   | `command-injection` | ERROR | yes |
   | `insecure-deserialization` | ERROR | yes |
   | `tls-verification-disabled` | ERROR | yes |
   | `xxe` | ERROR | yes |
   | `path-traversal` | ERROR | yes |
   | `ssrf` | ERROR | yes |
   | `weak-crypto` | WARNING | no (listed) |

   Not shipped: Go deserialization and XXE (the standard library has no unsafe default to match), JavaScript command injection (the existing `pipeline-default-child-process-shell-string` stays WARNING). 61 new rules, 72 in the file.
3. **Two rule shapes.** SQL and command injection match the shape of the call itself: a query call whose SQL text is concatenated or formatted from a non-literal value, a shell started with a non-literal command line; they need no request source, so a value from anywhere counts. Path traversal and SSRF are taint rules from a request source (framework parameter, query, body, header) to the sink, because building paths and URLs from configuration is ordinary; their sources skip parameters that cannot carry a path or a host name (numbers, flags, UUID/Guid, dates, `CancellationToken`). The other classes match an unsafe API or setting directly.
4. **Path traversal fires at the file access, not where a path is built,** and a containment check cleans the value: the normalized or real path tested with `startsWith`/`StartsWith`/`HasPrefix`/`start_with?`/`is_relative_to`/`commonpath`. In PHP a value used after an `if` whose condition tests it counts as checked, because Semgrep's side-effect sanitizer fails on `$real === false || !str_starts_with(...)`.
5. **Hardening counts where it is written:** XXE and Java deserialization rules accept hardening in the same method or constructor (feature flags, `ACCESS_EXTERNAL_DTD ""`, `IS_SUPPORTING_EXTERNAL_ENTITIES` false, an `ObjectInputFilter`).
6. **Test code is not gated.** Each new ERROR rule excludes test-shaped paths: the directories `test/`, `tests/`, `spec/`, `__tests__/`, `*.Tests/`, `*.UnitTests/` and the file names `*Test`/`*Tests`/`*IT` (Java, Kotlin, C#, PHP), `*_test.go`, `test_*.py`, `*_test.py`, `*_spec.rb`, `*_test.rb`, `*.test.*`, `*.spec.*`. Semgrep itself already skips `test/`, `tests/` and `*_test.go`; the rest is excluded only by the pack. Excludes anchor to the scanned root, so a project that itself lives under a `tests/` directory keeps every rule. `weak-crypto` has no exclude.
7. **Proof per rule:** `config/security/semgrep-pack-fixtures/<language>/hits.*` must make every rule fire at its class's severity, `quiet.*` must stay silent (it carries the false-positive probes: containment checks, typed ids, hardened parsers, HTTP client options in plain arrays), and test-shaped copies must give no ERROR finding while weak-crypto proves they were scanned (`semgrep-default-rules.test.mjs`). `semgrep-baseline.test.mjs` runs the real close chain with the shipped pack.

## Consequences

A feature that adds a string-built query, a shell call with request input, an unchecked file access, an outgoing request to a request-supplied URL, a parser without XXE hardening, unsafe deserialization or a disabled certificate check now stops its close in any of the eight languages. With ADR-0093 only the findings the feature introduced block; older ones are listed.

Known limits:

- **The false-positive rate on real code is unmeasured.** The pack was tuned on fixtures and on this repository (4,566 files, mostly JavaScript; three `pipeline-js-weak-crypto` findings for the SHA-1 WebSocket accept key that RFC 6455 requires). The first rate on Java, .NET or Python code comes from a consumer or greenfield run.
- Taint is intraprocedural (OSS Semgrep): a source in one method and the sink in another is not followed, and a containment check in a helper method is not seen.
- The evidence names at most the first 50 rule ids of the pack (`MAX_RULE_IDS` in `security-scan.mjs`) and the count; the printed line says `(+22 more)`. The pack's digest binds the whole file.
- Scanning this repository takes 26.8 s instead of 23.0 s.
- A secret found by the two older Semgrep ERROR rules that predates the feature no longer blocks through Semgrep (ADR-0093); gitleaks still blocks it.
- Semgrep OSS 1.170 on Linux (WSL2) only; not run on native Windows.

## Affected contracts

ADR-0093 (only feature-introduced Semgrep findings block). ADR-0092 (semgrep is a required tool). The evidence envelope and the `block_on` mapping are unchanged.
