---
schema: pipeline.backlog-item.v1
id: pipeline.codex-wsl-required-advisor-has-no-completable-route
type: requirement
owner: pipeline
status: open
created: 2026-09-27
source: "PO observation and Codex/WSL greenfield review on 2026-09-27; independently checked against the installed 0.7 Codex route and the consumer's awaiting-approval readback. See specs/sprint-alfred-epic/evidence/0.7-codex-greenfield-advisor-triage-2026-09-27.md."
sprint: alfred
done_when: manual
---

# A required Advisor must have a completable Codex/WSL route or a governed unavailable outcome

## Description

The PO requires that a missing Advisor never deadlock the delivery path. In a
fresh Codex/WSL Feature project, the installed route returns
`advisory-unavailable-wsl-native-deferred` even after export consent. The
bridge then returns no receipt and no attempt trail, while the required design
package refuses to proceed without them. The project remains in design at
`awaiting-approval` with no implementation authority.
The same run needed an unplanned host-level data-export approval before the
route even disclosed that it could not execute. Repository consent alone did
not make that host action admissible.

## Triggering situation

The 2026-09-27 Codex greenfield run and the installed route's direct
`--profile feature --consent approved` readback. The earlier closed
`2026-08-18-capability-first-advisor-critic-dispatch.md` moved an executable
check earlier; it did not make this WSL host route completable.

## Affected artifact

`codex-host-advisor-route.mjs`, `advisory-host-bridge.mjs`,
`design-advisory-coordinator.mjs`, `advisor-consult/SKILL.md`, Advisor receipt
and attempt-trail contracts, and the design-workflow package validator.

## Proposal

Provide a fresh read-only Codex-host Advisor dispatch with a bounded question,
allowlisted evidence, explicit host admission, and a validated candidate-bound
Advisor receipt. The dispatch must record actual host execution and result;
an agent's self-report cannot mint a receipt. If no host execution is admitted,
produce an honest unavailable receipt and validated route-attempt trail so the
existing explicit PO exception can be reviewed without inventing an answer.
The host's data-export decision remains binding: a denied export cannot be
silently retried through another command or provider. Resolve the exact
meaning of a route-selection attempt in the attempt-trail contract.

## Acceptance

- A real Codex/WSL Feature greenfield run reaches final design-package
  validation and either a valid Advisor answer or a reviewable, governed
  unavailable exception; it does not stop at `DAC-RECEIPT-MISSING`.
- Answered receipts bind candidate, route, bounded question/evidence digests,
  observed host result and answer digest. Missing execution cannot be answered.
- Unavailable receipts and trails state what was actually attempted; no child
  launch, model identity or answer is claimed when none occurred.
- Denied host export produces no model call, no alternate egress and no false
  receipt. If host approval is needed, the user sees its exact purpose before
  prompt construction, once, with a clear alternative when declined.
- The supported runner/platform matrix and skill agree with the tested route.

## Triage
