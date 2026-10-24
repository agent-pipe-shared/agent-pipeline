# G8 design-review provenance — pre-edit source-proof gap

Targeted delivery: blocked. Nothing committed. No production files changed; no clone, patch, native record, binding, identity, key, signature or live model/Critic operation created. Main and P1 complete-v3 candidate remain untouched.

The required outcome is not established by the existing receipt producer. `scripts/design-review-receipt.mjs:createReceiptFromDisk` reads a caller-provided report and finding list, derives digests/time and a runner signal, and writes a receipt. Its `reviewerRole: critic` return label is not dispatch custody. `lib/design-review-receipt.mjs:createDesignReviewReceipt` is pure and accepts caller-supplied reviewer/report inputs. `lib/design-review-receipt-write-guard.mjs` only rejects tool writes containing the receipt schema; it does not authenticate a producer.

Actual current Main routing matters: `pipeline-state.mjs` submit-plan records authored sources; present-plan consumes review receipts at `createDesignApprovalBinding` (line 11544), whose implementation summarizes and checks the chain without independent producer proof. The old design-workflow-package route is explicitly retired at line 11505. A fix only in `design-workflow-package-v2.mjs` would miss this active consumer. The current guidance at line 4304 explicitly says no design course or dispatch is required.

Existing Source contracts do not close the gap:

- `controlled-method-dispatch-observation.mjs` explicitly validates and emits `native:false, independentCriticPass:false`. Treating it as reviewer proof would contradict its contract.
- `model-family-host-store.mjs:createControlledModelFamilyHostDriver` explicitly never launches a host. Its controlled completion is not an independent reviewer execution or report producer.
- `model-family-runtime-host.mjs` defaults its producer ports to typed unqualified/unavailable results. A trustedSources injection alone cannot authenticate independent review.
- Existing Readiness/Advisor host APIs bind those separate duties and their report schemas, not this active design-review-receipt report/candidate/criteria/author relation.
- `onboarding-continuity.mjs:11000` prepares a synthetic method receipt directly; its synthetic model label does not establish independent review.

The missing capability is a Source-owned independent design-review producer/dispatch/custody contract binding the actual report and receipt bytes to exact candidate, Spec, criteria, reviewer duty and author/reviewer separation, followed by active consumer revalidation and replay policy. No such existing port was located in the audited actual APIs. Adding labels, a second hash, a caller-provided PASS, a new ledger/principal or a METHOD observation cannot supply it.

Minimal options requiring a fresh bounded authority decision: (1) identify an existing genuine Source design-review producer and its exact supported receipt binding API, if one exists outside these audited APIs; or (2) authorize the owning producer/dispatch adapter contract and its integration paths, including fixture migration for the active consumer, then resume this same outcome. A fail-closed refusal alone cannot satisfy the required reachable genuine positive path. No bypass implemented.

Machine-written evidence: `source-proof-audit.json`, produced by `node plugins/pipeline-core/scripts/capture-evidence.mjs --out scratch/agent-out/g8-design-review-provenance/source-proof-audit.json --label g8-source-proof-audit -- rg -n 'independentCriticPass|never launches a host|MODEL-FAMILY-NATIVE-PORT-UNQUALIFIED|No design course or dispatch is required|DWP-PRESENT-RETIRED' plugins/pipeline-core/lib/controlled-method-dispatch-observation.mjs plugins/pipeline-core/lib/model-family-host-store.mjs plugins/pipeline-core/lib/model-family-runtime-host.mjs plugins/pipeline-core/scripts/pipeline-state.mjs`; wrapped exit 0. This is read-only audit evidence, not a regression or acceptance PASS.

Verified green: none. Positive/forgery/source/candidate/role/replay behavioral checks, original RED/GREEN, safe consumer checks, resource measurement, and integration remain unrun because the pre-edit proof-gap stop was reached. No new quick command or performance limit invented. Integrated Verify: pending parent. Independent batch review: pending parent. PO acceptance: open.

Preflight returned ready with Goldfish host-boundary test routing, optional model identity unavailable (`MODEL-ROLE-SESSION-IDENTITY-CONFLICT`), and no native attestation. No full bootstrap confirmation or model enforcement claimed. Audit costs include a rejected composed read, unsupported glob read and missing guessed source path, plus one scratch search hook timeout; exact read-only verify-audit recovery returned valid. No rejected action was treated as success.

Incremental export: none (no implementation edits). Own uncommitted outputs only: this report and `source-proof-audit.json` in ignored scratch. No dispatch-record v4 fabricated under the explicit methodological exception.
