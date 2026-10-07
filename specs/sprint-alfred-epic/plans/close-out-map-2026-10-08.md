# Close-out map 2026-10-08 (CLOSE-MAP-1) - PARTIAL

Status: partial. The tool budget was reached before fix SHAs and regression tests were resolved. Item files were
located for all twelve slugs. Findings that hold for every row:

- Each item file has `status: open` and `done_when: manual`; none carries a Triage or closure section naming a fix SHA.
  The item bodies cite only patch, aggregate or evidence-file digests (not commit SHAs).
- `backlog-reconciliation-2026-10-07.md` lists all twelve as class c ("close-out not run", fix "in source per the
  triage"), with no SHA. `backlog-triage-2026-10-07.md` section 1 names none of these twelve with a SHA (it does for
  other entries).
- `git log --grep` on slug words and on `retirement`, `governance-scope`, `protected-baseline`, `HGO`, `async`,
  `rename` returned only backlog-intake commits (for example 15c85695e, 97d03bf26, 90fcb6bd0, 35773101b, c20502aae
  are intake/registration commits, not fixes). No fix commit could be attributed to any of the twelve.
- Because `done_when: manual` is set on all twelve, a passing test alone never satisfies Acceptance; the
  "needs beyond test" column states the item-specific part where the item text showed it.

Verdict `unresolved` below means: not one of the three allowed values because the fix SHA and test were not found
within budget. The next step is a per-item `git log -S<distinctive symbol>` search, then the test lookup.

| Slug | Item file | Fix SHA | Regression test + `--test-name-pattern` | Beyond a passing test | Verdict |
|---|---|---|---|---|---|
| codex-advisor-shared-namespace | backlog/items/2026-09-28-codex-advisor-shared-namespace-rejects-fresh-repository-identity.md | not found | not resolved | Item says Readiness hardening patch is not yet in productive source | unresolved (readiness patch reported unlanded) |
| onboarding-home-override-machine-plane | backlog/items/2026-09-28-onboarding-home-override-does-not-bind-machine-plane.md | not found | not resolved | manual done_when; item cites a patch digest | unresolved (no fix commit attributed) |
| stale-hgo-capability-shadows | backlog/items/2026-09-28-stale-hgo-capability-shadows-current-authorization.md | not found | not resolved | manual done_when | unresolved (no fix commit attributed) |
| first-enrollment-retirement-before-consent | backlog/items/2026-09-29-first-enrollment-enters-retirement-before-consent.md | not found | not resolved | manual done_when; item cites several evidence digests | unresolved (no fix commit attributed) |
| git-hook-runtime-snapshot-protected-baseline | backlog/items/2026-09-29-git-hook-runtime-snapshot-omits-protected-baseline-catalog.md | not found | not resolved | manual done_when; likely installed-hook check | unresolved (no fix commit attributed) |
| governance-scope-readonly-host-git-control | backlog/items/2026-09-29-governance-scope-rejects-readonly-host-git-control.md | not found | not resolved | manual done_when | unresolved (no fix commit attributed) |
| native-patch-rename-protected-markers | backlog/items/2026-09-29-native-patch-rename-drops-protected-content-markers.md | not found | not resolved | not read | unresolved (item not read) |
| nongit-retirement-reader | backlog/items/2026-09-29-nongit-retirement-reader-calls-inaccessible-controller-helper.md | not found | not resolved | Item stays open until the fixed candidate's combined acceptance; remaining failures must be reconciled from new receipts | needs-work (acceptance demands combined candidate run) |
| onboarding-test-runner-async-pass | backlog/items/2026-09-29-onboarding-test-runner-reports-async-pass-before-settlement.md | not found | not resolved | not read | unresolved (item not read) |
| protected-baseline-discarded-idle-state | backlog/items/2026-09-29-protected-baseline-rejects-canonical-discarded-idle-state.md | not found | not resolved | manual done_when | unresolved (no fix commit attributed) |
| retirement-reader-masks-unsafe-layout | backlog/items/2026-09-29-retirement-reader-masks-typed-unsafe-layout-inspection.md | not found | not resolved | not read | unresolved (item not read) |
| semgrep-default-version-check | backlog/items/2026-09-29-semgrep-default-version-check-blocks-offline-local-rules-scan.md | not found | not resolved | manual done_when; scanner-defaults commits (92d1b7118, f7213cc2a) are a related lead only, unconfirmed | unresolved (related commits unconfirmed) |
