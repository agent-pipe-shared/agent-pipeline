docs(adr): record ADR-0094, the Semgrep default pack blocks the severe classes in eight languages

The PO tile of 2026-11-12 (register D244): an own offline rule pack for
Java, C#, Python, Go, JavaScript/TypeScript, Kotlin, PHP and Ruby, the
severe classes at ERROR so they block, each rule with a firing and a
quiet fixture.

The ADR states the class/severity table, the two rule shapes (structural
SQL/command injection, request-sourced taint for path traversal and
SSRF), the containment sanitizers, the hardening forms, the test-path
excludes next to Semgrep's own ignore list, and the known limits: the
false-positive rate on real Java/.NET code is unmeasured, taint is
intraprocedural, the evidence names only the first 50 rule ids, an older
secret found by Semgrep no longer blocks through Semgrep (gitleaks still
does), not run on native Windows.

Register line in docs/state.md, index row, observation-governance entry;
ADR-0093 points at it. check-adr-consistency: 94 files green;
observation governance valid.

AI-Assisted: true
Dispatch: stage-0 (elephant)
