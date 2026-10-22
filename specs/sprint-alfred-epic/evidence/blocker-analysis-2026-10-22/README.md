# Blocker analysis of the non-agent clauses, 2026-10-22

Read-only survey (five readers, state of the operator-sitting rehearsal clone) of the 163 open clauses in 130 items that the delivery remeasure (`../delivery-remeasure-2026-10-22/`) assigned to `native-host`, `verify-wsl`, `po-decision` or `po-signature`. The question: is the clause really blocked, and from the WSL host the work happens on?

Per item the result is also appended to the item's own file as "Blocker analysis 2026-10-22" (118 items); the full records are `out2-01.json` to `out2-05.json` here.

## Result

| Status | Clauses | Meaning |
| --- | --- | --- |
| LINUX-RUN | 24 | an agent runs it on this WSL host (serial runner, private TMPDIR) |
| WINDOWS-INTEROP-RUN | 37 | native Windows through interop; large guard suites take hours (D118 measures first) |
| HOST-SESSION-NEEDED | 51 | a real, authenticated or interactive host session; no agent may drive it |
| PO-DECISION | 12 | decided the same day, see D122 to D130 in `../../plans/po-decisions-2026-10-18.md` |
| PO-SIGNATURE | 9 | operator ceremony, listed in Part F of the sitting list |
| DEFERRED | 7 | postponed by a recorded PO decision |
| NOT-BLOCKED | 23 | already done or no longer applicable (to be re-verified before they count) |

## Items without a file under `backlog/items`

The readers named these ids but found no item file with that slug; their rows exist only in the JSON records:
agy-el01-write-authorization-gap, capture-evidence-does-not-normalize-windows-npm-launch, codex-readiness-private-receipt-omits-output-custody, design-package-parent-metadata-false-drift (evidence read from `2026-09-29-unrelated-directory-entry-changes-reject-approved-design-package.md`), domain-scanner-findings-need-reproduction-before-remedy, hgo-dead-owner-audit-lock-permanently-ambiguous-on-windows, implementation-without-dispatch-escapes-review-coverage (D128 is its only record), merge-commit-message-skips-conventional-type-check, project-calibration-retains-new-project-placeholder, project-resource-budget-headroom-is-not-reported, security-scanner-failure-provenance, semgrep-offline-default-version-check.

## Caveats

Reader output is model judgment, not measurement. A NOT-BLOCKED or LINUX-RUN verdict counts for delivery only after the named run or evidence is committed and counted GREEN.
