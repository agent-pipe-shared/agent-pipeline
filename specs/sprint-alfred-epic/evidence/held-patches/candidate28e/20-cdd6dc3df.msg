feat(security): admit a reviewed public identifier for gitleaks generic-api-key

Codex test run 2026-11-12: gitleaks rule generic-api-key flagged a public
storage-key name of the application (a dotted namespace with a version
segment). The sanctioned ignore route accepted only a domain or a
published hex key, so there was no way to record the reviewed finding and
the close stayed blocked. PO decision 2026-11-13 ("Beides"): add a
closed public-identifier class next to the digest-only close evidence.

- security-adapters/gitleaks-reproduction-gate.mjs: `publicIdentifierShape`
  (2 to 8 segments joined by ".", "_" or "-", each a lowercase word of 2
  to 32 letters or a short version number, at least one word, at most 64
  characters); `reviewedValueClass` takes the rule and returns
  "public-identifier" for generic-api-key only, when `git grep -F` finds
  the value quoted verbatim in a tracked file outside the Pipeline's own
  records (specs, audit-bundles, evidence, project, .claude, scratch,
  architecture, docs, .gitleaksignore); every caller passes the rule;
  the refusal text names the new class
- gitleaks-repair-ignore.mjs: passes --rule; a public identifier needs
  the same written --reason as a published key, printed for the chat
  confirmation and the close report; usage text updated

Tests: gitleaks-reproduction-gate.test.mjs (a quoted identifier in
tracked source: class admitted, gate reproduced and verified, the value
never in the gate; refused for another rule, an untracked source, a
copy only in the Pipeline's records, no rule given, and for a single
word, upper case, random or digit-led segments, an over-long value, a
path and digits only), 8/8; the gitleaks CLI, value-binding, adapter
and pin suites 65/65. The --reason requirement in the repair CLI has no
test of its own, as for the published key before.

AI-Assisted: true
Dispatch: stage-0 (elephant)
