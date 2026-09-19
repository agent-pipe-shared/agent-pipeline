# Design: bounded advisory workflow for the Alfred candidate

Status: initial design draft, not implementation, not Advisor output, and not
PO-approved. Owner: Elephant. Dispatch: ALF-DESIGN-ADVISORY. Date: 2026-09-19.

## 1. Contract and traceability

This design covers the requested sequence: immutable user input -> this fresh
design draft -> required bounded Advisor consultation comparing user input with
the draft -> Elephant disposition and revision -> independent readiness
comparison of the original input, PRD, and Spec -> one final PO package review
-> implementation. A coherent Spec is not evidence that the original input was
covered.

The immutable sources are bound by these SHA-256 digests:

| Source | Digest |
|---|---|
| `specs/sprint-alfred-epic/design/design-advisory-workflow-input.md` | `c0f43c9bfb202296a8a0b811eb1b4332d6db149b42edf9356e4c349a0aa72b13` |
| `specs/sprint-alfred-epic/prd_sprint-alfred-epic.md` | `e65de342bcab3d18b55c4361dedeca1bc27d9dc944b0c52421ff9f0d70e3a413` |
| `specs/sprint-alfred-epic/spec.md` | `0792f02753312e0aee893b45a1111d20f5cc9123ca5e08d668fe440325654e65` |

The implementation candidate observed at dispatch opening was commit
`ca33c60feee3916341652a5c4f45dd0c2765370e` and tree
`7b318d3a3f03a2722dc4ae075109a7125da86af9`. Implementations must rebind all
source digests before consultation, readiness, approval, or transition. These
initial source hashes and Git identifiers are historical draft context, not a
current approval. Bind authority to the governed package content and route policy;
an unrelated commit alone does not invalidate an unchanged reviewed package.

Traceability is a required table in the eventual package: every paragraph of
the input maps to one design section, a planned acceptance check, or an
explicit unresolved choice. The final readiness reviewer receives the original
input, PRD, Spec, this design, and the Advisor disposition—not just a Spec.

## 2. Reusable authority and proposed wiring

The design reuses, without changing their contracts, the following surfaces:

* `plugins/pipeline-core/lib/advisory-coordinator.mjs`: one-question fresh
  routing, native/fresh-consult fallback, runner-preserving route selection,
  sanitized answer/failure receipt, and no raw answer persistence.
* `lib/advisory-lifecycle-v2.mjs` and
  `config/advisory-lifecycle-v2.json`: preflight-only bootstrap, on-demand
  trigger reasons, non-trigger events, reuse key and material-drift rules,
  physical evidence bundle and digest checks.
* `lib/advisory-receipt.mjs` and `scripts/advisory-receipt.schema.json`:
  candidate/question/answer digests, selected adapter, observed identity, and
  redacted failure class.
* `agents/consult-advisor.md` and `skills/advisor-consult/SKILL.md`: fresh,
  read-only, one concrete question; no bootstrap, mutation, gate decision, or
  automatic application.
* `scripts/codex-host-advisor-route.mjs` and its host bridge: Codex host route
  status and typed WSL-unavailable result. The new ordinary consult route is
  the route for this workflow; the old selected-sandbox/App-Server adapter is
  not a prerequisite and must not be silently reintroduced.
* `lib/project-onboarding-v3.mjs`, `hooks/guard-devplan.mjs`,
  `hooks/guard-lifecycle-ready.mjs`, and `scripts/pipeline-state.mjs`: the
  common authority boundary, lifecycle transition blocking, and single PO plan
  approval writer. Existing consumer and historical evidence remain intact.

The new wiring should be split into these implementation packages (each is
independently reviewable and has one owner):

1. **Design package** — add the immutable-input/PRD/Spec/design digest bundle,
   Advisor disposition, exception, and final-package binding to the existing
   design/plan state. No answer transcript is stored.
2. **Authority package** — add one common predicate used by the implementation
   transition and by all runner entrypoints. It must require current candidate,
   input/PRD/Spec/design digests, valid independent readiness evidence,
   completed consultation plus Elephant disposition (or explicit unavailable exception), and the one
   final PO approval. It rejects forged, stale, mismatched, malformed, or
   failed evidence.
3. **Runner package** — route Claude native-when-available then ordinary fresh
   consult fallback; route Codex and Antigravity directly through the ordinary
   fresh consult subagent. The implementation-authority predicate is shared,
   but invocation/negative tests remain runner-specific.
4. **Approval package** — extend the existing project-selected chat/signature
   approval payload so one final approval binds readiness evidence, Advisor
   disposition/exception, and package digests. It must not create an extra
   Advisor or implementation approval in the normal path.
5. **Verification package** — tests for positive and negative authority paths,
   crash/replay/staleness recovery, runner entrypoints, and receipt provenance;
   then Critic-before-Full-Verify repair and final local-candidate
   qualification remain separate requested work.

Exact function boundaries to preserve or introduce:

* `coordinateAdvisory(input, adapters)` remains the only consultation
  coordinator; add no caller that invokes the old forbidden fallback.
* Add a pure `validateAdvisoryWorkflowPackage(package, observed)` boundary in
  pipeline-core (exact module to be selected during implementation) that
  validates closed shapes, digests, candidate binding, receipt provenance,
  readiness evidence, exception scope, and final approval.
* Add a pure `authorizeImplementationTransition(state, package)` boundary used
  by `guard-devplan`, `guard-lifecycle-ready`, and each runner entrypoint.
  Guards may call it; prose/skill text may not substitute for it.
* Add runner adapters that produce typed route evidence, not claims of OS
  isolation or effective-model attestation. Existing receipts remain the
  source for observed identity; absent observation is unavailable/unknown.

The exact filenames for new implementation modules and schemas are an
implementation choice subject to the architecture decision and must be listed
in the implementation Spec before dispatch. They must stay under the existing
pipeline-core/schema ownership; no new top-level directory is warranted.

## 3. Runner enforcement contract

| Runner | Advisor route | Required enforcement and honest assurance |
|---|---|---|
| Claude | Native Advisor when available; then the existing fresh ordinary read-only consult fallback. | Native availability and observed identity are receipt facts. Fallback is a fresh subagent with Read/Grep/Glob only. No claim that the shared helper enforces every Claude host tool. |
| Codex | Ordinary fresh `consult-advisor` route directly for this workflow. | `codex-host-advisor-route.mjs` may report legacy host status, but selected-sandbox/App-Server is not required. WSL/native deferred is typed unavailable, not proof of isolation or a reason to invoke the old route. |
| Antigravity | Ordinary fresh `consult-advisor` route directly. | Runner identity and route are recorded in the receipt; no OS isolation, provider, effective-model, or host enforcement is claimed without observed evidence. |

Every runner must enter the same implementation-authority predicate before a
governed implementation transition. Direct negative tests must prove that each
runner is blocked for missing, forged, stale, mismatched, failed, or replayed
evidence. Runner entrypoint coverage does not imply universal enforcement of
unrelated host tools.

## 4. Advisor demand, receipt, and disposition

The Elephant creates exactly one demand for one concrete design question, with
`pipeline.advisory-demand.v2`, the current candidate commit/tree, question,
reason, and physical evidence references. Allowed trigger reasons are the
existing `architecture-tradeoff`, `decision-ambiguity`, `evidence-conflict`,
`recovery-choice`, or `risk-review`; lifecycle events never trigger it.

The consultation result is either:

* **CONSULTATION-COMPLETE**: a valid `pipeline.advisory-receipt.v1` and consultation record,
  independently bound to the demand, question digest, selected runner/adapter,
  observed identity, candidate, and evidence bundle digest; or
* **UNAVAILABLE-EXCEPTION-CANDIDATE**: a valid failure receipt and failure
  record proving denied dispatch, capacity/unavailability, timeout, invalid
  output, or equivalent typed failure. It is never called Advisor PASS.

The persistent record stores receipt/record digests, disposition, failure class,
and adopted/rejected proposal identifiers. It does not store the raw question,
answer, adapter error, transcript, or unnecessary repository content. The
Elephant may use the answer at runtime to revise the design, but must publish
only bounded proposals and reasons for adoption/rejection.

Reject reuse across a different governed package or demand. Material drift in
question/reason, relevant evidence or route policy requires a new demand and
receipt. An unrelated Git commit does not. Ordinary fresh-subagent consultation
uses observable dispatch/result linkage and honest assurance labels, not a new
cryptographic host-attestation prerequisite. No effective-model or OS-isolation
assertion is inferred. Advice itself is not a design-acceptance verdict.

## 5. One final PO approval

After Advisor disposition (including any exception), Elephant revision, and an
independent readiness comparison against input + PRD + Spec, the final package
is assembled. It includes:

* the three immutable source digests and design digest;
* final Spec/PRD/design traceability and unresolved-choice status;
* independent readiness evidence digest and reviewer provenance;
* completed Advisor consultation and Elephant disposition, or the bounded unavailable exception and its
  failure receipt;
* candidate commit/tree and closed package digest.

The project-selected chat or signature mode authorizes this entire package once.
The approval writer must atomically bind the package digest and evidence, reject
changed governed bytes, record one approval, and make implementation transition
possible only after this readback succeeds. The resulting authority persists for
ordinary subsequent work within that unchanged approved scope. No separate Advisor approval and no
second implementation approval exist in the ordinary path. Host/export consent
and permission boundaries remain those of the existing authority; this design
does not invent a Pipeline approval or bypass a host denial.

If the Advisor genuinely cannot produce a usable result, the package may carry
one explicit, scoped `advisor-unavailable` exception naming the typed failure,
attempts, receipt, and why proceeding without advice is safe for this design.
The final PO approval must bind that exception whenever possible. The exception
authorizes only omission of the Advisor result; it never waives readiness,
candidate binding, final approval, publication, or implementation authority.

## 6. State, crash, replay, and staleness matrix

| Event | Durable state | Required recovery / gate result |
|---|---|---|
| Before demand | `draft`, no receipt | No implementation transition. Reissue only after a concrete trigger. |
| Demand written, process crashes | demand with candidate/evidence digests | Resume may inspect demand; no automatic child/reuse. Continue only with same closed demand or create a new demand after material drift. |
| Advisor consultation complete | receipt + consultation record | Validate linkage independently; Elephant dispositions the advice; raw answer remains runtime-only. |
| Native failure then consult complete | receipt records chosen consult adapter and redacted native failure | Accept only if receipt binds the same demand/question/relevant evidence. |
| All routes fail | failure receipt/record | Remain blocked unless Elephant records bounded unavailable exception and later final PO approval. Never mark PASS. |
| Exception recorded | exception + failure receipt | Only Advisor step is waived; readiness and final PO remain required. |
| Design revised after advice | new design digest and disposition map | Old readiness/approval invalidated; new package must be independently checked. |
| Candidate commit/tree changes | compare governed package content | Preserve unchanged package authority across unrelated or evidence-recording commits; substantive package drift invalidates affected stages. |
| Input/PRD/Spec changes | source digest mismatch | Reject transition; rerun traceability, Advisor if question materially drifts, readiness, and final approval. |
| Final approval reused | persistent approved package binding | Permit continued work within unchanged approved scope; reject foreign-feature/package reuse and stale authority. |
| Partial state write | no complete closed package | Treat as incomplete; recover from last valid record, never infer missing fields. |

Atomicity and storage implementation must use the existing pipeline-state writer
and its lock/readback conventions. The implementation package must specify
which records are append-only, which state is replaced, and the exact
post-crash bytes before any code is dispatched.

## 7. Prebootstrap capability issue and boundaries

The existing lifecycle policy correctly makes bootstrap capability preflight
model-free and prohibits advisor child, model request, question export,
consultation receipt, and budget consumption. The design-stage capability issue
is therefore a typed observation attached to the design package, not an
invocation. It may say available/degraded/unavailable/unknown according to
actual preflight and route evidence. It must never be used as a PASS, launch a
child, or assert effective model/OS isolation.

The common authority boundary is the only implementation transition gate. A
skill paragraph, prompt instruction, or a shared helper without runner-entry
point coverage is insufficient. Claude, Codex, and Antigravity each need actual
invocation-path and negative tests; those tests prove only the covered paths.

## 8. Open product and security choices

These are intentionally unresolved and must be decided before implementation;
this draft does not infer them:

1. Which exact existing state record should hold the package and exception, and
   whether the package is append-only or replaces the active feature record.
2. Whether the final PO ceremony displays the full readiness/receipt metadata or
   only a bounded digest summary, subject to the selected chat/signature mode.
3. What minimum evidence makes an Advisor-unavailable exception safe for this
   particular design question, and whether some trigger reasons prohibit the
   exception entirely.
4. Whether Claude native failure should spend both configured native attempts
   before ordinary consult, or use a shorter design-specific cap; the existing
   coordinator default is two native attempts.
5. Which independently observed host facts, if any, are sufficient for a
   runner-specific assurance claim; absent an explicit proof, the implementation
   must retain the conservative unknown/unavailable result.
6. Exact schema names/versioning and the final list of implementation files,
   after architecture-decision review confirms ownership and compatibility.

## 9. Implementation and review gates

This document is design-only. It does not install, push, invoke an Advisor,
change production/configuration/skills, or claim implementation. Before any
implementation dispatch: resolve the choices above, update the Spec and PRD
references as needed, run independent readiness over original input + PRD +
Spec, obtain the single final PO package approval, and preserve the separate
Critic-before-Full-Verify repair and plugin-update drift work. A Critic/readiness
reviewer must compare this design to all three digested sources; the author
cannot self-approve that comparison.
