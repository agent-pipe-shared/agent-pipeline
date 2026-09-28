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

## Prepared host composition (2026-09-28)

Virtual aggregate
`563fbe7b923e8d1f05073a814dba5022149885085f5cc7b02a3f6c1c342ad89e`
now includes the explicit duty/pre-content host callback and input disposition,
Readiness caller migration and registered Advisor process-root extension.
Nine actual managed Node protocol cases and eight physical namespace cases pass.
All 61 source preimages/revisions and six worker postimages match; 53 syntax
checks and Git dry application pass.

The combined exact graph also passes two managed process cases using the
registered Advisor root: approved sends exactly one `turn/start`; refusal after
MCP sends none. Both independently verify closed ownership and actual shutdown.
Stable graph/import/metadata bindings and metadata-only actual event transcripts
are in `scratch/codex-advisor-host-namespace-composition-evidence.md` and JSON.

These fixtures execute Node protocol scripts, not Codex or a model. Registration
is controller-local and purpose is absent from the generic intent. The future
productive store must bind the exact Advisor namespace. Real export observation,
ordinary sealed adapter/store/transaction, raw-output/complete-stdio custody,
registered isolation adoption and actual installed replay remain outstanding.
No answered Advisor receipt, formal stamp or item closure is claimed.

## Further source preparation (2026-09-28)

The output-custody patch passes twelve focused cases, including nine actual
managed Node protocol processes. Fatal streaming UTF8, strict duplicate-key
parsing, LF-complete framing and genuine stdin/stdout/stderr events determine
completeness. Original serialized report JSON, final outer frame and canonical
parsed report have distinct digests; durable observations contain metadata only.
The versioned Advisor record v2 separately checks that custody against an actual
private host result. Its controlled managed-host case and invalid custody/digest
mutations pass; historical record v1 remains unchanged.

A production-shaped private store independently derives canonical Git topology,
uses an existing GUID without mint/migration and verifies the exact registered
Advisor namespace and process ownership. Ten cases pass, including real Git,
managed Node ownership, immutable publication and bounded receipt reads. The
required pure GUID getter has seven new regression cases plus two existing
identity cases passing through a proposed canonical test registration.

The store is asynchronous and is not a drop-in dependency for the earlier
synchronous binding verifier. Its current fixtures bind v1, with synthetic
session/model controls. Sealed v2 adoption and live transaction consumers must
be wired explicitly. A controlled fresh identity/namespace composition fails
on shared parent 0755 versus private 0700; the distinct open item is
`pipeline.codex-advisor-shared-namespace-rejects-fresh-repository-identity`.
The generic journal read-growth bound is tracked with the evidence-read item.

Evidence: `scratch/codex-host-output-custody-evidence.md`,
`scratch/codex-advisor-host-record-custody-evidence.md`,
`scratch/codex-advisor-production-store-design.md` and
`scratch/existing-repository-identity-registration-evidence.md`.
These are prepared contracts and controlled process evidence. No productive
Advisor execution, source application, release stamp or new signature occurred.

The asynchronous independent binding counterpart now passes ten cases/subtests
using the actual prepared private store, Git identity and a closed managed Node
fixture. Both store reads are awaited, inputs are snapshotted before the first
await and each returned record is immediately copied; physical evidence/Git/
executable bindings are rechecked. Promise rejection, returned-record drift and
caller mutation refuse or preserve the admitted snapshot as specified.
`scratch/codex-advisor-binding-async-evidence.md` records seventeen stable inputs.
This verifier still binds v1 and does not establish sealed live host authority,
v2 custody adoption or a timeout for a hanging store dependency. Live callers
must await and require `result.ok === true`.

Current virtual aggregate
`cb817e20e9eff56b4c3f6dce0f307e7200b89d38c09159ccac66251d81a799db`
now includes output custody/helper/test registration and the Journal/identity
corrections:67 files,59 successful syntax checks, Git dry application, all
preimages/revisions and twelve independent postimages match. Two actual managed
Node cases on that exact graph pass after genuine sanctioned fixture identity
mint creates shared0755. Approved/refused submit one/zero turns; both observe
complete pipes and independently closed ownership. Source/runtime hashes remain
stable. Evidence: `scratch/codex-custody-namespace-composition-evidence.json`.
This does not integrate the separate ordinary store/recipe/binding or create a
productive Advisor receipt. Formal gates and installed replay remain pending.

Further registered host-context preparation passes nine controlled cases with
twenty stable inputs and Git dry application. It reuses the exact existing
bridge route function via a one-line export, independently reads Git/topology,
existing GUID, route and physical executable twice, and returns metadata only.
The positive executable resolver is an explicitly controlled fixture; the
default PATH-independent resolver is source-audited, with no operator HOME
probe or real Codex invocation. Capability/readiness/consent/export authority
are not established. Evidence: `scratch/codex-advisor-host-context-evidence.md`.

Durable custody preparation separately executes one managed Node host and a
fresh process reader over immutable metadata. The v2 in-memory actual-result
requirement cannot be filled from a receipt itself after restart. A complete
versioned v3 contract and sealed private reader/writer integration remain
necessary; the current durable prototype is not a complete record validator.
Inspection also identifies its preexecution context's required answer/duty-
receipt digests as premature for an unknown real answer. The future version
must separate request coordinates from postexecution bindings, without guessed
digests or a fake actual host result. This is a prototype integration finding,
not a demonstrated installed failure. Evidence and constraints:
`scratch/codex-advisor-durable-custody-design.md`.
