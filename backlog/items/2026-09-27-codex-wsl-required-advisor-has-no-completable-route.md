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

## Ordinary Codex contract preparation (2026-09-28)

Read-only reconciliation confirms the current source already reads physical
repository consent and produces the Codex no-child outcome before prompt
construction/dispatch preparation. An admitted callback still deliberately
reports `ordinary-consult-host-callback-unavailable`; the ordinary answer path
remains open. The older Scratch integration handoff predates those source fixes.

New Scratch proposals separate a bounded Advisor-specific request/recipe and
strict model answer from a metadata-only private host record, exclusive store
and independent physical-source/Git reconstruction. Twelve request/schema
cases and twelve record/store cases pass. Six binding cases/subtests use real
Git/current evidence and an actual registered closed Node fixture process;
session/model-control fields are synthetic, with no Advisor/model call.
Verification found and corrected strict-parser null-prototype incompatibility.

`scratch/codex-advisor-ordinary-integration-contract.md` names exact interfaces,
digests, execution records and remaining ordered work. Current registered
Advisor isolation and live host admission/route resolution, sealed execution,
transaction wiring, actual consult attempt/receipt and installed replay remain
pending. These proposals are separate from the current 0.7 aggregate; neither
a Readiness receipt nor a synthetic process test qualifies as Advisor PASS.
The item remains open; no new signature was requested.

The next model-free admission seam also passes 15 cases: physical bounded
repository consent, metadata-only host decision, final readiness/route/candidate/
consent rechecks, missing/refused/denied outcomes and deadline/AbortSignal handling.
Late callback results do not continue to prompt construction. This proves lazy
factory ordering, not external host authority. Noncooperative callback side effects
or blocking synchronous work cannot be forcibly stopped by a Promise deadline.

Independent binding now passes seven cases/subtests including a separately
selected host executable: the private journal cannot choose the expected binary.
All host selection and capability dependencies still need sealed live wiring;
the actual Node fixture remains synthetic Advisor/session evidence.

The concrete execution composition audit identifies three further integration
requirements in the proposed generic host: a sealed admission recheck immediately
before `turn/start` (the current API has no hook), an explicitly registered
Advisor process namespace (the current journal accepts only Readiness), and
honest input/stdio custody observations (parsed report plus bytecounts cannot
prove raw-output completeness). These are recorded with actual API/field mappings
in `scratch/codex-advisor-execution-composition-design.md`; no executable wrapper
or fake proof hides the gaps. Host startup before content is distinguished from
an actual submitted consult attempt.

The independent component audit also confirmed physical evidence allocation
before size limits and public path refusal after content reads. The canonical
reader defect has its own open item,
`pipeline.advisor-evidence-read-enforces-size-limit-after-allocation`; preparation
of a bounded public reader does not close either this ordinary-route item or
the generic canonical defect.
