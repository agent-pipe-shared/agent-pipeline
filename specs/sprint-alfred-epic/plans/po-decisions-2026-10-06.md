# PO decisions 2026-10-06 (morning, Claude session, chat)

Recorded the moment they were given. The PO chose each option from a presented list with the Elephant's
recommendation; the chosen option labels are quoted verbatim. Question sources: [`po-open-questions-2026-10-06.md`](po-open-questions-2026-10-06.md).

## Round 1 (blocking the signature and S2/S3)

| ID | Decision (option chosen, verbatim label) | Meaning | Follow-up |
|---|---|---|---|
| Q11 | "Migrieren, bis 10-20 (Recommended)" | Migrate `hardened-private-directory-install-tests` and `gitleaks-repair-ignore-cli-tests` to the case-completion protocol; the tolerated red state (suite-registration exit 2) expires **2026-10-20** (confirmed, no longer "proposed"). | Test-only migration dispatch; registration of both suites in the next signed package. |
| Q12 | "B: fail-closed Marker (Recommended)" | Invert the push classifier: any command with a git word plus `$`, backtick, backslash, `{`, `<<`/`<<<`, parentheses, non-ASCII quotes, or a nested shell invocation in any position is a push candidate and goes to guard-push; shape-specific checks #5/#6 are deleted. Accepted cost: false positives on the Codex route. | Classifier fix dispatch against the existing red pins (GPGL-9/9t2/9t3) plus the negative side now unblocked; backlog item `2026-10-06-push-classifier-deny-list-does-not-converge.md`. |
| Semgrep | "B: Warnung = Hinweis (Recommended)" | `level: warn` partial-parsing entries become degraded coverage with a visible coverage note and keep the results; `error` entries and timeouts stay `scanner_error`. | Test-first then fix dispatch on `plugins/pipeline-core/scripts/security-adapters/semgrep.mjs`; backlog item `2026-10-06-semgrep-partial-parsing-warnings-fail-the-whole-scan.md`. |
| S3 | "Ja, wie empfohlen (Recommended)" | S3 Q1–Q13 as the plan recommends; S3 Q11 (`revise` ledger) gets an Elephant spec draft before package 2; the §2.2a layer rule is worded as a lower bound (imports strictly downward is the invariant; no re-layering); `present-plan` admits a `baseline-only` verify command like today's `set-phase`. | Plan edit dispatch for the layer-rule wording and the `baseline-only` note; Critic of S3PLAN8 still pending. |
