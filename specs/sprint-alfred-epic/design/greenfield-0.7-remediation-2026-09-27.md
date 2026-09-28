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
| A — Advisor host route | `codex-wsl-required-advisor-has-no-completable-route`, `advisor-prompt-is-emitted-before-host-route-admission`; the two 2026-09-28 Advisor items | Advisor route, bridge, receipt/attempt contracts, design coordinator and package. Admit repository consent and host export before constructing a prompt. Complete the host-observed ordinary answered route, enforce one consultation cycle per design course, and preserve initial advice through final revision. Keep honest unavailable evidence and the existing PO-exception branch. | Null-call denied-export fixture, answered coordinator-to-package path after design revision, durable course limit across restarts, unavailable package validation, Codex/WSL live replay. |
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
The earlier reopened-plan acknowledgement recovery is complete. On
2026-09-28 the sanctioned writer reopened design and submitted the current
PRD/Spec digests; it did not approve the plan or enter implementation. No
further change to `scripts/pipeline-state.mjs` is a prerequisite for presenting
this package. The newly captured inspect diagnostic correction belongs to
slice B after final package approval.

The separately completed Codex host-readiness repair was an exact,
PO-signed Pipeline Author Repair, committed as
`8b5dcf4fbe4fc39f914118885d642fc0952d9210`. Its signatures authorized only
the listed repair actions so independent evidence could be produced. They
did not approve the feature plan, any remaining implementation slice, or an
Advisor exception. All remaining product changes wait for the single final
package decision. Content acceptance and a protected-write proof must never
be interpreted as that ordinary implementation approval.

## Sequence and acceptance

1. Bind the completed, separately authorized repair evidence and the current
   submitted PRD/Spec digests. Obtain independent readiness and the single
   complete-package PO approval before any remaining implementation writes.
   Design artifacts and contained scratch remain available while that gate is
   pending. A future exceptional maintenance repair needs its own exact PO
   authority and cannot establish ordinary feature implementation authority.
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

## Preservation boundary

Preserve existing consumer work and historical evidence. Changes are confined
to reviewed Pipeline source paths and owned isolated fixtures; greenfield
consumer repositories are read-only evidence sources unless the PO separately
authorizes a consumer change. Do not reset consumer worktrees, replace their
input, delete their reports, overwrite an earlier receipt, or rewrite review,
audit, transition-ledger or Git history to make qualification pass. Keep failed
and superseded observations with their original candidate and source hashes;
publish successor evidence separately.

Acceptance records the baseline and successor commits, proves retained Git
ancestry, compares the actual changed-path inventory with the authorized
slice inventory, and reads back source/report digests. Any later consumer
write requires a before/after inventory for that exact authorized scope.
Isolated fixtures cannot attest preservation of a real consumer worktree.
Historical tests and receipts remain provenance and cannot become current
candidate PASS records merely by relabeling them.

### Source freeze and receipt publication order

Commit the complete five-source design before producing candidate-bound
Advisor and readiness evidence. Those observations are published afterward,
then independently read and validated by the complete-package builder and
final presentation writer against that frozen candidate. Publishing a local
receipt does not require another source commit before presentation. The
containing design must not be required to embed the hash of a receipt that
itself binds that design's containing commit; that would be circular. Historical
receipt citations in these documents remain historical observations.

The independent five-source comparison evaluates coverage, consistency,
preservation, proposal disposition and unresolved design choices. The
package validator separately enforces actual current Advisor and readiness
execution provenance; a document statement cannot satisfy those checks. A
fully described proposed Advisor-only exception is a final PO decision,
not an undecided design choice or a readiness waiver. Presentation still
requires current canonical failure evidence and a valid independent
ready-for-po-review receipt. An undeclared material design alternative or
missing disposition remains blocking. The answered-path acceptance remains
mandatory for the delivered implementation even when the current design
package proposes proceeding after a genuine unavailable observation.

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

## Design-workflow authority for the 0.7 package

This section makes the workflow contract reviewable within this design source.
`design-advisory-workflow.md` remains the detailed historical draft; a final
five-source readiness review must not depend on an unlisted sixth file to find
these requirements. The governed sequence is: preserve the original input
bytes and digest; dispatch a fresh initial design; ask one concrete Advisor
question against the input and draft; record typed route evidence; let the
Elephant adopt or reject each bounded proposal with a reason and revise the
design; obtain a fresh independent comparison of the original input, PRD,
Spec, final design, and traceability; then present one complete digest-bound
package for the single ordinary PO approval before implementation. Coherence
with the Spec alone cannot establish input coverage. A materially changed
input, PRD, Spec, design, route policy, or disposition invalidates the affected
evidence and requires a fresh comparison before presentation.

The readiness host observes a new, independent session with no inherited
coordinator context and records the actual read-only isolation and terminal
facts. Codex's tool-free structured host route supplies the complete bounded
five-source bundle with inherited and external tools disabled. It keeps
authentication outside model-readable scratch, uses thread-bound admission
readbacks, and registers any standalone child for shutdown and crash recovery.
Its receipt never borrows the assurance of the older selected-sandbox route.
Model-authored assertions cannot establish these host facts.

E1 remains the first authorized foundation act. The final package approval
permits E1 without depending on its not-yet-created output; dependent WPs wait
for the committed, valid freeze. An already valid pinned baseline freeze may
satisfy that later predicate. This distinction removes a circular gate and
adds no extra ordinary human approval.

Claude tries its native Advisor route when available, then the governed fresh
read-only consult fallback after a typed native failure. Codex and Antigravity
use the ordinary fresh consult route. The host must admit repository consent,
export permission, and route capability before constructing or transmitting
the question; denied admission produces no prompt or child. An answered route
needs an observed dispatch/result/receipt binding to the exact demand,
candidate, question digest, evidence bundle, selected adapter and observed
identity. A model name or local result is not provider, effective-model, or OS
attestation. A failed host route is recorded with its phase, typed reason and
whether a child started. The selected-sandbox route is not a prerequisite for
the ordinary workflow. The Codex/WSL route must either complete with these
observations or produce a truthful unavailable result, never an invented PASS.

The package validator must require closed, current source digests, an executed
Advisor demand and answer/disposition with initial-to-final revision provenance,
or the canonical typed unavailable
receipt with a proposed exception, independent
readiness evidence, candidate binding and the final approval readback. The
common implementation-authority predicate and each Claude, Codex and
Antigravity entrypoint must reject missing, forged, stale, mismatched, failed
or replayed evidence. A package builder may assemble a draft before approval;
it cannot mark implementation authority true. Negative tests must invoke the
actual covered transitions and entrypoints, not only a pure validator. These
tests establish the covered routes, not universal host-tool enforcement.

An Advisor-unavailable candidate contains a package-bound failure receipt and
route-selection record. Executed routes bind their demand/evidence digests,
each applicable normal and governed fallback attempt, phase, typed failure
and child-start fact. A capability failure before launch instead uses the
canonical no-child route-selection contract: exact candidate, design-question
digest, runner, failure code and unavailable receipt digest, with zero
attempts and no child. Its null evidence-bundle digest is explicit; it proves
neither export admission nor a constructed or executed consultation. The
current package validator independently checks that typed contract and only
permits a proposed `route-unavailable` exception. Do not relabel the no-child
record as a failed invocation, an answered demand, or an exhausted fallback
chain. An applicable executed fallback cannot be skipped or fabricated. The
Elephant records why proceeding without advice is safe.
The exception remains proposed until the final PO decision; it waives only the
Advisor answer. It cannot supply readiness, an Advisor PASS, implementation
authority, a publication permission or approval of an incomplete package.

### One consultation cycle and initial-to-final provenance

Slice A must enforce one Advisor consultation cycle per explicitly identified
design course. Finite registry-approved fallback attempts belong to that same
cycle. Persist the course identity and spent budget independently of dispatch
IDs, candidate commits and public evidence projections. A restart, packaging
commit, incorporation of advice or readiness correction cannot replenish it.
A materially new substantive question requires an explicit owner decision
opening a new course with the previous course and reason recorded; ordinary
corrections introduce no additional human approval. A crash with an uncertain
execution outcome requires host recovery, not another automatic invocation.

The initial consultation binds immutable committed input, PRD, Spec, draft
design and traceability, its concrete question, route policy and actual
evidence bundle. Coordinator, host and verifier must construct the same
canonical initial question. Preserve the genuine initial receipt and its
candidate; never rewrite it to name the future revised candidate. The host
binds the actual answer and bounded proposals after execution, without asking
for an unknown answer hash before launch. Disposition covers each actual
proposal exactly once with an adoption, rejection or deferral and rationale;
zero usable proposals means an empty disposition, not invented advice.

The final package verifies the initial consultation independently and binds
its disposition through an ordered, hash-bound revision chain to the final
five committed sources. Verify source blobs, Git ancestry and the final
physical bytes. Fresh independent readiness and the one final PO decision
bind the final candidate. They do not require the initial consultation to
have observed a design that was revised in response to that consultation.
Historical legacy receipts retain their actual version and cannot acquire
missing initial provenance by relabeling. Version any changed package
contract explicitly and retain honest diagnostic access to older packages.

Acceptance must exercise an actual managed coordinator-to-host-to-package
answered fixture with an output unknown before execution, then adopt a real
returned proposal and commit the revised design. The original receipt must
remain unchanged and the final package must validate without another Advisor
cycle. Cover restart/concurrent reservation, new-dispatch and packaging reuse,
wrong question, forged disposition or revision ancestry, uncertain crash,
bounded fallback exhaustion, denied export with zero prompt, and equivalent
chat/signature authority. A genuine live Codex answered run remains separate
from these fixtures. An unavailable exception alone cannot satisfy the
answered-route or course-limit acceptance.

These corrections are planned implementation, not existing guarantees. The
current source has bounded individual attempts but no design-course limit;
its raw-design question producer also differs from the final-source package
question validator. Both confirmed source findings are open backlog items.

### Historical Advisor result and Elephant disposition

The canonical coordinator for historical candidate
`08ef241a3b06b1db6a8eed722d08e7db1024836e` returned
`unavailable-pending-final-approval`, with code
`ordinary-consult-host-callback-unavailable`. Its exported advisory receipt is
`evidence/design-advisor-5e9c10a4afbd391f26a9a290b85e6ef994a7d053838dee2398e6610b5caa9f74.receipt.json`,
SHA256 `5d1524abb9f30085d1a5dc3770d7cb64a56e5803c9b8a3c9d55825862cd87aa9`;
the route-selection record is
`evidence/design-advisor-5e9c10a4afbd391f26a9a290b85e6ef994a7d053838dee2398e6610b5caa9f74.route-selection.json`,
SHA256 `3342ecb17c734258a73485e7ad17b12963178a16d440aaf65f03ca0fca4ea815`.
The record binds that candidate and the earlier design digest
`911137207fecf3172760f923a95738f18911c246e68382502039f47f7a6554fb`.
It is historical evidence, not a receipt for these revised source bytes.

No child started, no invocation attempt or answer was recorded, and zero
usable Advisor proposals were returned. The proposal-disposition list is
therefore empty (`[]`); no recommendation was adopted or rejected and this
revision invents no advice-driven change. Elephant disposition is to retain
the unavailable result and propose the input's explicit Advisor-only
exception in the final PO package. The current work may reconcile design and
obtain independent readiness because it grants no ordinary implementation or
publication authority. The PO may accept or reject the proposed exception in
the single final package decision; it remains unaccepted now.

The null evidence-bundle digest and absent invocation attempt trail remain
visible limitations. Before presentation, export a fresh canonical no-child
record for the revised candidate/design or obtain a usable governed Advisor
result; validate its exact applicable bindings in the package. Historical
receipt references cannot substitute for that new binding. The actual native
readiness receipt `evidence/design-readiness-08ef241a-20260928a.json`, SHA256
`2145305cef32223b27030446e22cc88f7de51f47d63804bab256e61ea2896920`,
remains `not-ready`. These revisions clarify its three findings; a fresh
independent comparison must decide readiness before final presentation.

The sanctioned plan approval is the **one ordinary final PO decision** for the
complete package. The project-selected chat or signature ceremony binds its
closed digest, Advisor outcome or exception, readiness receipt and current
source bytes, then writes and reads back the approved state atomically. An
Advisor exception should be included in that same decision whenever possible.
Earlier PRD/Spec intake acknowledgement and exact protected-file HGO signatures
are separate continuity and write-authorization facts; neither is an extra
routine Advisor or implementation decision, nor may either substitute for the
final package decision. The current source must be checked for an
approval/admission cycle before this path is activated.

The agent performs `submit-plan` and complete-package `present-plan`
autonomously. Neither mechanical step requires a separate PO permission,
content acknowledgement or signature. Remove the current extra submission
acknowledgement gate and misleading human-confirmation flags while retaining
genuine onboarding/profile authority and current-source validation. Submission
and presentation never approve implementation. The happy path has exactly
one human design-to-implementation approval, after the Advisor cycle,
disposition/corrections and independent readiness. Test the actual writer and
returned actions in both chat and signature modes without a pre-submission
content acknowledgement; final package approval remains mandatory.

0.7 integration acceptance also owns the Critic-before-Full-Verify repair,
plugin-update drift repair, and chat/signature consistency repair named in the
original input. A candidate test must reject release Verify when a fresh
candidate-bound Critic is absent or failed, and rerun when the candidate
changes. Installed plugin identity is read back per runner; source HEAD alone
does not attest installation. The same complete-package digest and authority
predicate must behave consistently in chat and signature modes, including
Advisor exception handling and replay/staleness rejection. Release Verify,
Reader closure, security checks and the local install handoff remain bound to
the frozen candidate; no install or publication is inferred from source tests.

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
