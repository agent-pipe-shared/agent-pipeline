# Legacy package validation and typed lifecycle denial

Dispatch: ALFRED-DESIGN-COMPAT-DIAG-20261009. Diagnostic only; no implementation, test assertion, installed cache or live authority changes. Independent review and PO acceptance remain pending. Nothing committed.

## Measured evidence

Machine capture: `design-legacy-lifecycle-diagnosis.txt` in this directory.

Command: `node plugins/pipeline-core/scripts/capture-evidence.mjs --out specs/sprint-alfred-epic/evidence/wsl-intake-2026-10-09/design-legacy-lifecycle-diagnosis.txt --label ALFRED-DESIGN-COMPAT-DIAG-20261009 -- node scratch/design-compat-diag-run.mjs`.

Diagnostic process exit 0 means the observations completed and immutable input hashes matched. It does not mark the expected RED suites green. Each suite has TAP and a separate FD3 completion record.

| Observation | Reached behavior | Result |
| --- | --- | --- |
| Anchored v8 boundary, parked strong state validator | All 12 cases; C4 denies exit 2, then fails exact-code assertion | 11 pass / 1 fail, suite exit 1 |
| Anchored v7 fixture, parked schema-lite | Approval-request fixture setup assertion at original line 211 | DWP2-PACKAGE-SCHEMA; control and target not reached; exit 1 |
| Same anchored v7 test, real live schema-lite and parked strong state/writer | Control and target, both Edit and Bash admission assertions | 3 tests pass, exit 0 |
| Same C4 tampered fixture, direct real boundary API | Binding-sha comparison | DAA-DESIGN-APPROVAL-BINDING-DRIFT |
| Same C4, strong lifecycle projection | Current approval invalid; implementation unauthorized | nextAction reopen-design; full hook exit 2 |

The earlier named baseline capture `design-boundary-postimage-r2.txt` reports boundary 11/13 and new route E2E 13/13. This dispatch reran the two boundary files separately to distinguish the v7 setup failure from C4's reached assertion. It did not rerun the already-green route E2E. Source and anchored test hashes are recorded in the new machine capture. Scratch instrumentation only emits observations; original assertions are retained. Comparator validation uses the real live validator on the very same package value that the parked validator receives, rather than a hand-authored substitute. Fixture instances across separate runs have generated keys/candidates; byte equality across those instances is not claimed.

## Exact schema failure

The anchored package has `advisor.status = unavailable`, `runner = claude`, `route.model = null`, `route.effort = null`, `hostReceipt = null`, and `receipt = null`. The actual parked validator result is:

`$.advisor: oneOf matched 2 branches; expected exactly one`

Keyword: `oneOf`. Both branches contain only `$ref`, respectively `#/$defs/answeredAdvisor` and `#/$defs/unavailableAdvisor`. Parked schema-lite adds oneOf enforcement but retains a validator that ignores `$ref`; therefore both branches produce zero errors for the same unavailable Advisor value. Live schema-lite ignores oneOf and reports `{valid:true, errors:[]}`. Neither result establishes that the fixture is malformed under the intended schema.

An independent branch probe applying the referenced definitions shows the answered branch rejects null model (type string), null effort (enum), null hostReceipt (type object), and the unavailable-only `failureEvidence` and `proposedException` keys (additionalProperties false). The unavailable branch, under the parked partial interpreter, still rejects its legitimate `receipt = null` with `$.receipt: oneOf matched 2 branches; expected exactly one`: the null branch accepts, while its evidenceFile `$ref` branch is again ignored. Resolving only the outer Advisor reference is therefore insufficient.

## Smallest source repair contract

Extend schema-lite to resolve the local references used by these existing schemas before evaluating branch matches. Carry the original root schema through recursive properties/items/oneOf calls; resolve bounded local `#/$defs/...` JSON pointers consistently, including nested receipt unions. Reject unresolved or unsupported references explicitly. Preserve exactly-one oneOf semantics, additionalProperties checks and existing validation behavior. Avoid mutating a shared schema or persisting expanded schema artifacts. A scoped caller-side reference expansion can be considered only if it covers every nested reference and preserves the same refusal semantics; the shared interpreter fix avoids maintaining a second interpretation.

No legacy package or anchored v7 fixture rewrite is required by the measured failure. Preserve the portable approved-package rereader, exact approved digest, source digests, exception binding and signature/trust-anchor checks. Do not replace the strong validator with the live comparator as a shipping fix. Do not suppress DWP2-PACKAGE-SCHEMA, ignore oneOf, or accept every branch. Positive and negative reference/oneOf pins belong in a separately authorized test-first package; then rerun both existing v7 lane assertions with the repaired interpreter and strong writer.

## C4 safety and typed ordering contract

The parked `validCurrentPlanApproval` calls `validDesignApprovalPair`; its checked binding digest must equal the stored approval digest. C4 remains shape-valid but changes `reviewReceipts[0].sha256` to 64 `b` characters. The complete stored envelope consequently fails validation. `derivePlanLifecycle` reports `{ok:false, code:PLAN-LIFECYCLE-IMPLEMENTATION-UNAUTHORIZED, status:awaiting-approval, phase:implementation, nextAction:reopen-design, submissionCurrent:true, approvalCurrent:false}`. The full hook denies before its normal designAdvisoryAdmission branch. Its existing denial explicitly requires reopening design before editing. There is no measured admission vulnerability.

The direct real designAdvisoryAdmission API correctly reports DAA-DESIGN-APPROVAL-BINDING-DRIFT on the same tampered fixture. The immutable hook C4 assertion demands that typed code in stderr. The missing integration is diagnostic classification of an already-denied envelope; weakening the envelope validator or reconciling the assertion to any generic refusal is unnecessary.

Preserve lifecycle validation first and its blocking/warning policy. For this specific v8 binding mismatch, attach the existing typed binding-drift reason to the lifecycle denial and retain the explicit `reopen-design --by <human attribution>` prerequisite before review, presentation and approval. Never use a successful boundary diagnostic to turn a lifecycle denial into admission. Share the narrow classifier where Edit/Write and shell policy paths would otherwise diverge; do not duplicate an authority decision. Keep mixed-null and other malformed envelopes denied. The generic DAA remediation currently suggests re-presentation alone for binding drift; its typed recovery must not omit reopening when implementation authority is invalid.

Validation for the implementation package: existing C4 exact code passes with exit 2; legitimate C1/C2 admissions remain green; mixed-state C7 remains refused; direct boundary still returns its typed code; both relative and absolute in-root hook paths deny the tampered binding and name reopening; shell lane remains denied with the same prerequisite. Preserve the strong validator test pins and rerun the already-green 13 route E2E cases after the source repair.

## Limits and deviations

One scratch instrumentation setup error placed an import before a copied test's shebang. It was corrected once by removing that copied shebang before inserting diagnostic imports; the final capture reran successfully. This was a setup failure, not a reached product assertion. The first context read omitted the required escalation flag; subsequent shell calls used require_escalated. No protected refusal was bypassed. No native provenance or authorship is claimed for inherited graph changes. Owned outputs were never read as task inputs. Verify of the proposed source fixes, independent review and PO acceptance remain pending.
