# 0.7 greenfield design traceability

This is the traceability source for the final Alfred design-workflow package.
The original design-workflow instructions are recorded in
`design-advisory-workflow-input.md`. The later Codex, Claude, and Antigravity
greenfield observations are recorded in their review reports and the 24
`backlog/items/2026-09-27-*.md` files. The current PRD and Spec remain the
product contract; `greenfield-0.7-remediation-2026-09-27.md` is the design
addendum. This document maps input and observations to planned checks. It is
not an Advisor disposition, a readiness result, or an approval.

## Original workflow input

| Input requirement | Design location | Planned acceptance |
| --- | --- | --- |
| Preserve the input, draft design, obtain Advisor improvements, disposition and revision, then independently compare the input, PRD and Spec before one final PO review | `design-advisory-workflow.md` §§1–3 and `greenfield-0.7-remediation-2026-09-27.md` Candidate rule and sequence | Package validator binds five distinct current sources; receipt and host readiness bind the same candidate; final approval is one package-bound decision. |
| Elephant owns design decisions; Spec coherence alone does not prove input coverage | `design-advisory-workflow.md` §§1, 3 and this table | Advisor suggestions receive explicit disposition; readiness compares all five sources and reports unresolved coverage. |
| Claude uses native Advisor then ordinary fresh consult fallback; Codex and Antigravity use ordinary fresh consult | `design-advisory-workflow.md` §§2–3 and remediation slice A | Runner-specific route tests and host-observed receipt; no claim of OS or model attestation without evidence. |
| Host/export consent is separate; no extra routine approval | `design-advisory-workflow.md` §§2–3 and remediation slice A | Denied-export fixture emits no prompt or child; successful route records host admission and one final PO decision. |
| Missing, forged, stale or failed evidence blocks implementation at shared and runner entrypoints | `design-advisory-workflow.md` §§2–3 and remediation candidate rule | Negative package/transition tests and live Codex, Claude, Antigravity entrypoint readbacks. |
| Truly unavailable Advisor may use an explicit package-bound PO exception; readiness still applies | `design-advisory-workflow.md` §3 and remediation slice A | No-child unavailable receipt plus route-selection record validates without a fabricated attempt; exception remains proposed until final PO approval. |
| Integrate Critic-before-Full-Verify, plugin drift and final local-candidate qualification; do not infer install | Remediation candidate rule and sequence | Frozen candidate, installed-version readback, independent Critic, release Verify, preflight and PO installation handoff. |

## 2026-09-27 greenfield intake

Every item below remains open until its own acceptance evidence is recorded.
The slice letters refer to the table in the design addendum.

| Slice | Backlog findings | Planned acceptance |
| --- | --- | --- |
| A | `codex-wsl-required-advisor-has-no-completable-route`; `advisor-prompt-is-emitted-before-host-route-admission` | Host-observed ordinary route or truthful unavailable/exception package; no export or prompt before admission. |
| B | `powershell-bypasses-onboarding-read-boundary`; `claude-bootstrap-action-rejected-by-guard`; `scratch-must-remain-writable-across-lifecycle-states`; `repeated-lifecycle-denials-are-not-counted` | Cross-shell boundary tests, exact action replay, contained scratch state sweep, refusal telemetry. |
| B | `hgo-patch-preflight-before-signature`; `installed-design-trailer-example-is-rejected-by-git-guard`; `reopened-approved-plan-blocks-po-acknowledgement`; `git-apply-bypasses-draft-source-guard` | Exact patch preflight, generated trailer guard replay, signed acknowledgement and submission replay, denied unsigned mutating `git apply`. |
| C | `restart-barrier-can-precede-verbatim-intake-capture`; `onboarding-spec-marker-has-no-preapproval-reconcile`; `greenfield-approval-policy-applies-after-intake-transition`; `fresh-preflight-hides-onboarding-action`; `greenfield-handover-claims-absent-supersession-marker` | Byte-exact intake replay, phase-admitted marker and preference repair, onboarding action/readback, honest handover on fresh hosts. |
| D | `zero-open-design-questions-force-fabricated-answer`; `design-bootstrap-verify-state-contradicts-deferred-contract`; `architecture-materialization-requires-premature-code`; `architecture-fitness-model-repeats-module-fields`; `architecture-design-errors-omit-field-paths`; `design-generator-repeats-large-source-material` | Closed-schema and deferred-Verify fixtures, greenfield generation before code, compact model and local diagnostics, measured output. |
| E | `browser-preflight-misses-missing-host-library`; `agy-greenfield-run-used-stale-plugin`; `bounded-reader-terminal-binding` | Missing-library host fixture, installed-version Agy replay, terminal Reader binding without a fifth review. |

No reported symptom is accepted solely because a report asserts it. Each
source fix needs its own test or readback; the source commit and installed
plugin version must be recorded separately in final release evidence.
