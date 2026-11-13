fix(security): admit the public-identifier class only for a finding in a Pipeline record

Review of the class added for the Codex test run: "the value stands
quoted in tracked source" is just as true of a word-shaped passphrase
hard-coded in the source, which the class would then have let a reason
wave through. The observed finding was in a Pipeline record (the close
evidence that copied the briefing), flagged after the source had been
scanned clean.

- security-adapters/gitleaks-reproduction-gate.mjs: reviewedValueClass
  takes the finding's path; "public-identifier" applies only to a path
  under specs/<feature>/evidence/ or audit-bundles/ (no dot-dot); a
  finding in source keeps the existing route (fix the code); the gate
  check and the repair CLI pass the path; the refusal text says so

Tests: gitleaks-reproduction-gate.test.mjs (a record finding admitted; a
finding in source, no path, a dot-dot path refused), 8/8.

AI-Assisted: true
Dispatch: stage-0 (elephant)
