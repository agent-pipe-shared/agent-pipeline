# 0.7 Greenfield remediation and local-candidate plan

This design addendum applies the 2026-09-27 Codex/WSL, Claude/Windows, and
Antigravity greenfield findings to the next local 0.7 candidate. The active
Alfred PRD and Spec remain the product contract; current backlog item files
carry each finding's precise source, limits, and acceptance. The 24 items
created on 2026-09-27 are the working intake set, not proof that every reported
symptom is a product defect. Live readback or a focused fixture must distinguish
reproduced behavior from a reporter's inference before an item is closed.

## Candidate rule

Use one frozen source commit for candidate-bound checks and evidence. Record
the installed plugin version separately for each host. A local source fix does
not establish that the already running Codex, Claude, or Agy plugin includes
it. Agy's earlier run loaded 0.6.2 and cannot attest a 0.7 signature gate.
No publication or install is inferred from a clean source checkout.

## Slices and ownership

Each slice owns distinct files during implementation; shared contracts and
tests are coordinated before parallel edits. The IDs below refer to
`backlog/items/2026-09-27-*.md`. Item status changes require their own
acceptance evidence and backlog reconciliation.

| Slice | Findings | Implementation boundary | Candidate evidence |
| --- | --- | --- | --- |
| A — Advisor host route | `codex-wsl-required-advisor-has-no-completable-route`, `advisor-prompt-is-emitted-before-host-route-admission` | Advisor route, bridge, receipt/attempt contracts, design coordinator and package. Admit repository consent and host export before constructing a prompt. Use the already PO-directed ordinary fresh consult route when it can be host-observed. Otherwise return an honest unavailable record and existing PO-exception route; no invented answer or child start. | Null-call denied-export fixture, answered host-observed receipt, unavailable package validation, Codex/WSL live replay. |
| B — lifecycle and read security | `powershell-bypasses-onboarding-read-boundary`, `claude-bootstrap-action-rejected-by-guard`, `scratch-must-remain-writable-across-lifecycle-states`, `repeated-lifecycle-denials-are-not-counted`, `hgo-patch-preflight-before-signature`, `installed-design-trailer-example-is-rejected-by-git-guard`, `reopened-approved-plan-blocks-po-acknowledgement`, `git-apply-bypasses-draft-source-guard` | PowerShell and POSIX guard lanes, real returned-action argv, contained scratch, refusal telemetry, HGO preflight, generated obligations, reopened-plan acknowledgement, and `git apply` parity. Keep each protected write and human authority bound. | Synthetic outside-root and phase sweep on both shells, exact emitted-action admission, all-state scratch containment, refusal count, patch dry-run before signature, reopened-plan acknowledgement and fresh signed approval, denied unsigned protected `git apply`. |
| C — onboarding integrity | `restart-barrier-can-precede-verbatim-intake-capture`, `onboarding-spec-marker-has-no-preapproval-reconcile`, `greenfield-approval-policy-applies-after-intake-transition`, `fresh-preflight-hides-onboarding-action`, `greenfield-handover-claims-absent-supersession-marker` | Intake checkpoint, typed actions and repair, onboarding preflight and handover. Preserve original input bytes before a restart; apply answered preferences in the phase that returns their action. | Exact multi-kilobyte restart replay, phase-admitted preference and marker repair, honest preflight/handover readback on Codex and Claude. |
| D — design usability and architecture | `zero-open-design-questions-force-fabricated-answer`, `design-bootstrap-verify-state-contradicts-deferred-contract`, `architecture-materialization-requires-premature-code`, `architecture-fitness-model-repeats-module-fields`, `architecture-design-errors-omit-field-paths`, `design-generator-repeats-large-source-material` | Design-question disposition, deferred Verify state, architecture materialization, generator output and validation. A zero-question answer must be affirmative and bound; unavailable Verify never becomes pass. | Closed-schema edge fixtures, generation without invented answers or premature code, field-local error diagnostics, measured output-size reduction. |
| E — release evidence and host readiness | `browser-preflight-misses-missing-host-library`, `agy-greenfield-run-used-stale-plugin`, `bounded-reader-terminal-binding` | Browser host preflight, version-correct Agy run, source Reader protocol/checker/release binding. Keep raw and sanitized reader-report provenance distinct. | Missing-library fixture and live Agy replay; final Reader terminal correction bound without a fifth review or a fabricated unchanged-state record; candidate-bound release Verify and preflight. |

Initial parallel ownership is: A owns `scripts/codex-host-advisor-route.mjs`,
`scripts/advisory-host-bridge.mjs` and the advisory receipt/attempt and design
package libraries; B owns `hooks/guard-lifecycle-ready.mjs`, its fixtures and
`lib/onboarding-argv-shapes.mjs`; D owns architecture design/generation and
fitness-model files; E owns `harness/reader-review-protocol.md`, the Reader
checker, its fixtures, and browser preflight. Those four code areas can be
developed concurrently after approval. C's onboarding action producer shares
argv and intake contracts with B, so its edits follow a reviewed interface
handoff instead of racing the same files. B's scratch/HGO improvements follow
its PowerShell security fix because they touch overlapping guard paths.
The reopened-plan acknowledgement fix owns `scripts/pipeline-state.mjs` and
its focused tests. It is a short prerequisite repair before ordinary plan
approval and the parallel implementation slices. If the gate requires a
protected-source maintenance window, prepare the exact file/scope inventory,
obtain the existing human proof, close the window after the repair, and
read back the state; content acceptance alone does not lift the guard.

## Sequence and acceptance

1. Repair the reopened-plan acknowledgement defect with a focused regression
   and protected-write proof, then reconcile the current PRD/Spec digest and
   obtain sanctioned plan/phase authority before other implementation writes.
   Keep design artifacts and contained scratch available while that gate is
   pending. Exact protected repairs use the existing typed PO signature route.
2. Implement A and B first because they are delivery deadlock/security slices.
   C and D may proceed in parallel where owned files do not overlap. E's
   browser fix may proceed independently; its Agy/Reader acceptance follows
   the integrated source candidate.
3. Require focused tests and source/host readbacks that match each finding's
   scope. A closed fixture does not substitute for the stated live three-runner
   check. Keep unresolved or unverified items open, with candidate impact
   explicit.
4. Freeze a local candidate only after the owned slices integrate, the
   canonical backlog state and ADR reconciliation pass, a fresh Critic and
   release-mode Verify are candidate-bound, security and Reader outcomes are
   truthful, and release preflight is green. Present that exact candidate and
   install instructions to the PO; installed-host acceptance remains a
   separate readback.

## Existing PO decisions and next decisions

The PO already directed the ordinary fresh, read-only Advisor consult in
`evidence/po-decision-queue.md` and `design/design-advisory-workflow.md`.
ADR-0041's WSL suspension belongs to the older selected-sandbox transport;
the ordinary host route needs its own truthful assurance, not a silent bypass
of export permission. A final route-unavailable exception still needs the
existing explicit PO decision. The documentation owner has also fixed the
Reader course at four two-stage rounds plus one terminal correction, with no
fifth reader. Plan approval, exact protected-file signatures, and final
candidate installation remain separate human acts.

## Reader terminal-binding design constraint

The ordinary no-edit v1 Reader binding remains valid. A separate terminal
record must distinguish the fourth reviewed document state from the final
editorially corrected state. It binds four ordered rounds, all eight committed
reports, each round's reviewed commit/tree/document and input digests, every
finding's structured disposition, the owner's terminal-course decision, and
the final correction commits. The checker must reject an unlisted fifth
committed round and any covered-document or input drift after final closure.
The fourth public phase-one report is a disclosed path-normalized copy of the
raw report retained in private scratch, not a byte-identical original; the
record must say so and must not promote the private raw bytes into public
evidence. The protocol itself is a hashed input. Its change between the
fourth review and this new terminal contract must be explicitly bound as a
policy transition; it cannot be silently treated as unchanged. The checker
can validate bytes and ancestry, not actual reader identity or semantic
quality. A fifth reader is prohibited by the owner's decision.
