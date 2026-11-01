# w43 — the close renews a frozen candidate and exempts its own hex digests from the secret scan (16a close hotfix)

Found by the first two real consumer closes, both blocked at the same gate (`final-verify-green`, which needs a green Security scan on the
frozen candidate):

1. The close commit itself brings scanner hits: the audit bundle holds byte copies of evidence full of bare SHA-256 strings and the State file
   holds the hash-chained ledger digests; gitleaks reads them as `generic-api-key` / `sentry-access-token` (24 hits in one consumer, 15 in the
   other). Writing an ignore afterwards is a new commit, hence a new candidate, hence the freeze and everything after it start again.
2. There was no way back after `candidate-frozen`: the phase table only leads to `final-verify-green`, the journal writer forbids replacing the
   candidate, and the next transition fails `CLOSE-CANDIDATE-DRIFT`. A consumer that fixes findings after the freeze (dependency updates) could
   not reach the close.

## Change

- Re-freeze (`close-coordinator.mjs`, `publication-close-journal.mjs`): `plan-transition --phase candidate-frozen` is admitted again while the
  phase is `candidate-frozen`, like the existing `cleanup-complete` self-transition. The plan refuses (`CLOSE-REFREEZE`) when HEAD is already
  the frozen candidate, when the new candidate does not descend from it, and when the diff touches what earlier phases bound: the State file,
  `specs/<feature>/`, `audit-bundles/<feature>/`. The changed paths enter the effect's observed digest. The journal records the renewal as one
  more `candidate-frozen` effect (history keeps every freeze); the replay check, the CAS and the effects-order validation are unchanged for
  every other phase. The final Verify/Security evidence must then name the new candidate (a test pins that the earlier candidate is refused).
- gitleaks (`.gitleaks.toml` and its byte mirror `config/security/gitleaks-default.toml`): one rule-scoped allowlist per rule
  (`sentry-access-token`, `generic-api-key`) with `condition = "AND"` and `regexTarget = "secret"`: path is
  `audit-bundles/<feature>/<40..64 hex>/...` or the State file AND the matched secret is a bare hex digest of 40..64 characters. A real key in
  the same files, the same digest anywhere else and every other rule stay armed (test with the real binary, with controls). The scanner-config
  pin test is restated: the two stanzas are sanctioned byte-for-byte, once per rule, and removed before the existing checks.
- `skills/close-feature/SKILL.md`: the two evidence shapes (`tracked-close-finalized`, `final-verify-green`), the empty-input convention for
  missing telemetry/retrospective artefacts, the re-freeze route, and the per-finding ignore routes (gitleaks `.gitleaksignore`, dependency
  findings through the project's `osv-scanner.toml` `[[IgnoredVulns]]` with `id`, `ignoreUntil`, `reason`) before the freeze.

## Not proven here

- The osv ignore route is documented from the scanner's own configuration format; no test in this patch exercises osv-scanner (no network).
- Whether findings that are NOT bare hex digests (for example a project's public key in source) can be suppressed on a consumer depends on
  that consumer's `.gitleaksignore` route and the trusted-tool admission of its gitleaks binary (a Windows consumer's binary was refused);
  this patch does not change that admission.
- Early scanning before the freeze and a recorded ignore list with expiry in the close evidence stay for 0.7.1.
