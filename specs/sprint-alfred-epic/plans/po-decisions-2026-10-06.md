# PO decisions 2026-10-06 (morning, Claude session, chat)

Recorded the moment they were given. The PO chose each option from a presented list with the Elephant's
recommendation; the chosen option labels are quoted verbatim. Question sources: [`po-open-questions-2026-10-06.md`](po-open-questions-2026-10-06.md).

## Round 1 (blocking the signature and S2/S3)

| ID | Decision (option chosen, verbatim label) | Meaning | Follow-up |
|---|---|---|---|
| Q11 | "Migrieren, bis 10-20 (Recommended)" | Migrate `hardened-private-directory-install-tests` and `gitleaks-repair-ignore-cli-tests` to the case-completion protocol; the tolerated red state (suite-registration exit 2) expires **2026-10-20** (confirmed, no longer "proposed"). | Test-only migration dispatch; registration of both suites in the next signed package. |
| Q12 | "B: fail-closed Marker (Recommended)" | Invert the push classifier: any command with a git word plus `$`, backtick, backslash, `{`, `<<`/`<<<`, parentheses, non-ASCII quotes, or a nested shell invocation in any position is a push candidate and goes to guard-push; shape-specific checks #5/#6 are deleted. Accepted cost: false positives on the Codex route. | Classifier fix dispatch against the existing red pins (GPGL-9/9t2/9t3) plus the negative side now unblocked; backlog item `2026-10-06-push-classifier-deny-list-does-not-converge.md`. |
| Semgrep | "B: Warnung = Hinweis (Recommended)" | `level: warn` partial-parsing entries become degraded coverage with a visible coverage note and keep the results; `error` entries and timeouts stay `scanner_error`. | Test-first then fix dispatch on `plugins/pipeline-core/scripts/security-adapters/semgrep.mjs`; backlog item `2026-10-06-semgrep-partial-parsing-warnings-fail-the-whole-scan.md`. |
| S3 (round 1) | "Ja, wie empfohlen (Recommended)" | S3 Q1–Q13 as the plan recommends; S3 Q11 (`revise` ledger) gets an Elephant spec draft before package 2; the §2.2a layer rule is worded as a lower bound (imports strictly downward is the invariant; no re-layering); `present-plan` admits a `baseline-only` verify command like today's `set-phase`. | Plan edit dispatch for the layer-rule wording and the `baseline-only` note; Critic of S3PLAN8 still pending. |

## Round 2 (push signature, dispatch friction)

| ID | Decision (option chosen, verbatim label) | Meaning | Follow-up |
|---|---|---|---|
| PUSHSIG Q1–Q4 | "Ja, wie empfohlen (Recommended)" | Q1: in `chat` mode a checkpoint push needs a recorded chat clearance; Q2: the pre-push hook also verifies the signature on the protected lane (next item); Q3: up to two housekeeping commits per signed checkpoint accepted; Q4: no checkpoint profile in the signed subject, `push-init` prints a clear line instead. | PUSHSIG implementation per `../design/feature-branch-push-signature-design.md` with these answers. |
| PUSHSIG Q5 | "Hinnehmen, kein Push (Recommended)" | In `signature` mode there is no checkpoint push before an approved plan; no unsigned draft-phase lane. | Same design; remove the unsigned lane once the fix is installed. |
| Bootstrap receipt | "B: Writer exportieren (Recommended)" | Export the receipt writer in the signed guard package and record the receipt from a new SubagentStart hook; the receipt then means "started under the hook". | Guard slice in the S2 lane series; backlog item `2026-10-05-every-dispatch-pays-a-bootstrap-receipt-detour.md`. |
| Advisor ancestor predicate | "Einengen (Recommended)" | Ancestor identity narrowed to `dev`/`ino`/`mode` plus realpath, directory and no-symlink checks; `mtimeNs`/`size`/`nlink` dropped for ancestors; keep the original cause as a non-authoritative field. | Test-first slice, Opus Critic, signed package; backlog item `2026-10-05-advisor-provenance-ancestor-check-fails-on-any-sibling-write.md`. |

Still open after round 2 (next PO round): Q8, Q9/Q10, GL-09 category, insecure common dir, FX5(d), FANOUT Q1–Q7,
HOOKREFRESH Q1–Q7.

## Directive (same morning)

PO, verbatim: "Kann dann Signatur, einbauen, Stempel, konkrete Übergabe für anderen PC commiten, Push auf branch ohne
weitere full verify und critics" — next: sign and apply the staged packages, install, stamp, commit a concrete handover
for the other PC, push the feature branch; no further full Verify and no further Critic rounds before that push.
