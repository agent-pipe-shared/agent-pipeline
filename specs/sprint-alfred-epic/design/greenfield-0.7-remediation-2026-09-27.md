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
| B — lifecycle and read security | `powershell-bypasses-onboarding-read-boundary`, `claude-bootstrap-action-rejected-by-guard`, `scratch-must-remain-writable-across-lifecycle-states`, `repeated-lifecycle-denials-are-not-counted`, `hgo-patch-preflight-before-signature`, `installed-design-trailer-example-is-rejected-by-git-guard`, `reopened-approved-plan-blocks-po-acknowledgement`, `git-apply-bypasses-draft-source-guard`; `design-workflow-signing-request-schema-drift` and `historical-plan-cancellation-blocks-current-withdrawal` (2026-09-28) | PowerShell and POSIX guard lanes, real returned-action argv, contained scratch, refusal telemetry, HGO preflight, generated obligations, reopened-plan acknowledgement, and `git apply` parity. Keep each protected write and human authority bound. Read the closed DWP request's nested digest without weakening the default package validator; retain bounded strict cancellation history across successive submissions. | Synthetic outside-root and phase sweep on both shells, exact emitted-action admission, all-state scratch containment, refusal count, patch dry-run before signature, reopened-plan acknowledgement and fresh signed approval, denied unsigned protected `git apply`; default-validator signing transport and one attended confirmation with malformed/stale negative controls; successive cancellation, exact zero-write replay, malformed/history bounds and unchanged earlier receipts. |
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

## 2026-09-28 candidate scope extension: activation, topology and uninstall

Integrate the three active items `pipeline.agy-imported-plugin-snapshot-shadows-registered-plugin`, `pipeline.pipeline-hooks-act-in-repositories-that-never-opted-in`, and `pipeline.no-uninstall-path-for-a-repository-that-once-opted-in` in the next local candidate alongside all existing slices. Git conventions/publication rules are opted-in-only by explicit PO decision. Outside enrollment retain only destructive Git protection and the initial hint; persistent refusal suppresses the hint.

Add five implementation boundaries: central activation/enrollment/decline; all-hook early consumers and destructive/process split; observed Agy topology plus source-owned convergent refresh; journaled ownership-derived content-preserving uninstall; cross-runner qualification/registration. Freeze activation APIs first, then parallelize hook consumers, Agy observer and uninstall over disjoint files. Agy productive topology depends on isolated CLI precedence facts. One integrator merges shared kernel/harness/docs surfaces, preserving all prior0.7 registrations.

Never treat retained AGENTS/architecture/specs as activation. Uninstall keeps them, removes only mechanics with proven ownership, writes durable decline before private-state retirement, and checks live executable references rather than all textual mentions. Shared worktrees and foreign keys/hooks require explicit safe classification. New enrollment cannot inherit historical plan approval.

The complete binding requirements, ownership and acceptance follow directly in this canonical source. The additional-scope file is a preparation mirror; readiness and final approval do not depend on an unlisted sixth authority file.
## Normative requirements

Independent targeted source executions now reproduce seven ungoverned hook
effects, all three broken Git shims after canonical reset, and a controlled
commit-msg failure after removal of its install-time library path. The durable
[diagnostic report](../../../backlog/evidence/2026-09-28-activation-uninstall-targeted-verification.md)
records the actual terminals and limitations. Isolated Agy 1.2.12 install/list/uninstall and distinct-agent discovery now confirm a complete managed copy under `config/plugins/<manifest-name>`: it stays visible during global/workspace registry collisions; after removal, the global registry source becomes visible. These metadata-only observations do not establish a fresh real session's executing path. Native runner payload delivery and real cache pruning remain unverified.

### R1 — One activation authority, separate from discovery

Every Pipeline hook, nested guard, start/resume skill entry and lifecycle side-effect producer obtains the same read-only, bounded activation observation before its Pipeline behavior. The result identifies a physical repository/worktree scope and an explicit state: `active`, `inactive`, `declined`, or `unverifiable-active`. The final closed schema and writer are frozen in slice S1 before consumers change.

`active` requires actual sanctioned enrollment provenance (or a strictly validated legacy enrollment with a documented migration). Directory names and arbitrary markers do not grant authority. `AGENTS.md`, `CLAUDE.md`, architecture/maps, specs, backlog, handovers, a plugin installation or a path registry are insufficient individually or together. Retained documents are content. A malformed active enrollment is a governed diagnostic, never a blanket disarm. Absence of enrollment must not itself trigger repair, bootstrap, or denial of unrelated work.

Durable `declined` takes precedence over retained generated authority/projections and content. Its record must survive removal/archive of `.git/agent-pipeline`; a per-repository Git-local config record is the proposed storage for Git repositories. Define common-repository versus worktree semantics explicitly; do not let a linked-worktree exit erase another worktree's enrollment or shared hooks. Non-Git decline needs a separate bounded host-local record keyed to independently observed physical root, with no automatic write during ordinary hooks. Neither design may mint identity, keys or consent as a side effect of observation.

The initial hint records an explicit human answer through its sanctioned action. A recorded `no` is persistent; restart/compact does not prompt again. Explicit opt-in reverses decline and follows existing onboarding authority. The writer cannot merely interpret a retained documentation pointer as renewed consent. Proven enrollment migration must preserve current active governance rather than silently relaxing it.

### R2 — Inert means no Pipeline effects

For `inactive`/`declined`: do not block ordinary reads/writes, tools, subagents, Git commits or ordinary pushes; do not inject lifecycle/setup/recovery instructions; do not write scratch lifecycle, budgets, slicing, usage, restart locks, private HGO requests/audit keys or HOME state; do not emit routine stderr noise. This check precedes wrapper input-hardening, role enforcement, consent-write and telemetry code. It must also be reached when a project root is absent or unsupported, without inventing enrollment.

The destructive Git rule set stays effective outside activation. Its denial must not bootstrap a Pipeline audit/key store in a foreign repository. Exactly classify destructive protections separately from process conventions; preserve all applicable force/ref-deletion/destructive protections. Trailers (GIT-03), publication executor, role models, Critic rules, lifecycle and tooling hardening are active-scope behaviors. The opt-in hint is permitted only before a durable decline. Active positive controls prove the new predicate is not a universal bypass.

### R3 — Agy observes and converges the effective topology

Use one bounded read-only topology observer for installer/preflight/refresh. Inventory managed/imported copies, import metadata, global registry, workspace registry, and Pipeline-specific external hook wiring. Report physical path, manifest version, content identity and observation class without exporting unrelated config or credentials. Read/parse ambiguity is `unverifiable`, not `single-current`.

Source fixtures prove parsing/conflicts; isolated actual CLI observations establish supported install/import/uninstall syntax and precedence; a fresh real session independently observes its executed source and guards. Keep those evidence classes separate. No global uninstall, config mutation or HOME experiment is authorized by this preparation. A convergent host-owned refresh plan is derived from observed topology and approved source; unrelated registrations/keys remain unchanged. One effective Pipeline source per chosen scope is the target, but workspace-only support and retirement of a managed/global source require S1–S6 evidence and an explicit concrete remediation plan. Global discovery is not repository opt-in.

### R4 — Unregister removes mechanics while preserving content

Provide a distinct digest-bound `project-uninstall plan|apply` lifecycle, deriving footprint from authority resolution, runtime-projection owned keys, actual hook records and workspace registrations. Do not invoke reset with renamed labels. Default preservation covers all source, docs including edited/unchanged AGENTS and maps, ADRs, specs/design packages, backlog, handovers, evidence and Git history. Any optional deletion of unchanged seeded content requires its own explicit selected plan option; never sweep `docs/`, `specs/`, `.agents/` or a container by name.

Classify exact owned whole-file mechanics, owned keys, preserved content, foreign/modified ownership and never-touched user-scope stores. Strip only proven Pipeline-owned keys and preserve all unrelated bytes. Foreign or modified hooks/keys are reported and left intact; missing ownership is not permission to delete. Account for `core.hooksPath`, linked worktrees and shared private state before admitting apply.

Ordered transaction: verify frozen plan/ownership/affected bytes; remove owned Git shims through their sanctioned remove routes before their implementations; strip owned keys and whole-file runtime mechanics; remove owned workspace bindings/consent; persist decline; archive/remove admissible private mechanics last. The transaction journal and recovery authority survive that last stage. Every fault boundary has resumable readback and no per-step approval chain. The lifecycle authorization applies to this exact plan; it does not authorize unrelated cleanup.

No retained **executable** Pipeline binding may reference a removed implementation. Retained docs may mention the plugin or its prior history. Thus an assertion that *no file contains a plugin path* is incompatible with preservation and must not be the uninstall oracle. Readback instead inventories live hooks, configured executable projections and registry keys. Ordinary Git commit/push, build and project tests remain usable. Re-onboarding preserves retained records and does not regain old plan approval or reuse consumed consent as new authority.

## Architecture alignment

Read `architecture/map/pipeline-core.md` and `governance.md`: runtime enforcement belongs to pipeline-core, policy prose cannot substitute for hooks, and harness owns orchestration. ADR-0063 keeps temporary proposals here and durable citations in tracked evidence; consumer content/layout must be preserved. ADR-0067 keeps all three runners independent and distinguishes interactive enforcement from execution-plane authority. ADR-0062 prevents claimed host execution from synthetic fixtures or fallback metadata. The directory/activation changes do not add a model route, global lifecycle capability, delegation, or release authority. Final implementation may need a narrow ADR addendum for explicit activation and uninstall transaction semantics; this draft does not claim the existing ADRs already authorize arbitrary global cleanup.

## Slices, disjoint ownership and dependencies

Paths below are proposed new surfaces unless already present. Before dispatch, the integrator checks the actual aggregate for collisions. The S1–S5 identifiers below add to the original A–E slices above; they do not replace their requirements. A single owner handles each shared file; workers do not reset others' edits.

| Slice | Exclusive files/responsibility | Dependency and handoff |
| --- | --- | --- |
| S0 — Agy capability/topology evidence | New `scratch/agy-topology-spike-*` controlled disposable fixtures and resulting sanitized evidence proposal; no operator config mutation | Parallel with S1. Establish S1–S6 facts before selecting productive Agy remediation; source contract does not assume precedence. |
| S1 — Activation authority | New `lib/governance-scope.mjs`, its fixtures/tests, proposed `scripts/project-activation.mjs` and tests, activation schema/mirror, sanctioned onboarding enrollment integration in `lib/project-onboarding-v3.mjs` | Freeze read-only API/storage/scope/legacy migration first. Own onboarding shared file exclusively; uninstall writer consumes API, never writes it independently. |
| S2 — Hook consumers and process split | All three runner hook wrappers/start hints, shared lifecycle/role/budget/slicing/resume/native-host guards, `guard-git` and `guard-push`, corresponding hook tests | After S1 API. Own complete hook files to avoid racing existing security repair owners. Merge the full 0.7 proposed postimages before adding early scope checks. Preserve destructive union. |
| S3 — Agy source convergence | New `lib/antigravity-plugin-topology.mjs` and tests; `install-agy.mjs`/tests; `scripts/installed-plugin-attestation-host.mjs`; Agy branch of `pipeline-start-preflight.mjs`/tests; host-owned refresh planner | After S0 facts. Observer may develop from sanitized fixtures in parallel; mutation plan stays held until actual CLI topology is verified. S3 alone edits preflight; S1/S2 supply activation API without touching it. |
| S4 — Content-preserving uninstall | New uninstall lib/CLI/tests; narrow factored footprint derivation from `scripts/project-reset.mjs` with reset parity tests; Git hook installer remove APIs/tests; workspace projection key-removal helper | After S1 contract; S3 provides read-only topology/owned workspace binding removal API. S4 owns Git installers and runtime-projection removal implementation; S1 owns onboarding. Reset behavior cannot silently become uninstall. |
| S5 — Qualification and registration | Wiring-enumerated ungoverned/declined probe suite; uninstall cross-runner transaction suite; harness registration; kernel closure/doc entries; five-source addenda/architecture entry points/setup guides | Receives frozen source manifests from S1–S4. One integrator owns shared harness/kernel/docs surfaces and preserves existing full0.7 registrations. Candidate freeze then source checks and installed-host acceptance separately. |

S0 and S1 can start independently. S2 and S4 run in parallel after S1 interfaces freeze because hook consumers versus lifecycle/installer writers are distinct. S3's observation implementation can proceed independently using fixtures; its productive refresh must await S0. S5 integrates, not overwrite-selects overlapping historic postimages. Existing Advisor, lifecycle-security and release work remain required.

## Acceptance matrix

| Check | Required evidence / rejection |
| --- | --- |
| Activation | Actual sanctioned active enrollment; inactive fresh Git/non-Git; declined across new sessions/compact; alias/root drift and malformed active record; legacy enrolled migration; AGENTS/maps-only and retained-docs-after-uninstall remain inactive/declined. |
| Hook matrix | Enumerate current Claude/Codex/Agy wiring automatically. Ungoverned/declined ordinary tools, Critic-named foreign subagent, inline code, commit without Pipeline trailers and ordinary push have no Pipeline effects. No working-tree/private/HOME writes; no routine diagnostics. Active controls still enforce. |
| Destructive exception | Force/ref deletion and destructive workspace Git protections reject in all scope states. Their rejection does not mint Pipeline private keys/audit files outside enrollment. No exemption permits destructive Git merely because decline exists. |
| Agy topology | Disposable S1–S6 actual CLI facts; parsing/error fixtures; duplicate/stale/import/global/workspace conflicts and foreign-hook preservation; convergent second run; fresh loaded-path/content/version readback. Never promote 0.6.2 report or mutable lock to 0.7 evidence. |
| Uninstall | Onboard each runner, install three owned Git hooks, create/edit content, plan/apply/readback: kept file digests identical, mechanics unregistered, decline survives, ordinary Git local commit/push and project tests work. Reject aliases/drift/foreign ownership without partial destructive cleanup. |
| Crash and shared scope | Fault every journal phase, including after shim removal and before private archive; resume without lost authority. Linked worktree/shared hooks remain untouched when another active worktree depends on them; ambiguous shared removal yields explicit bounded conflict. |
| Upgrade/remove cache | Remove disposable installed-plugin cache after hook install: reproduce B2 or disprove with actual hook readback; chosen version update/removal route keeps Git operational with explicit mechanism. No stale path silently turns a commit into broken Node execution. |
| Re-enrollment | Explicit opt-in clears decline through writer, preserves retained docs/packages/handovers and starts current onboarding; historical approval is not new plan authority. |
| Full candidate | Merge all prior0.7 scope plus these slices; registrations and schema mirrors; focused acceptance, Critic then release Verify, frozen source commit and install handoff. Installed three-runner result belongs to that exact candidate and actual loaded content identity. |


### Frozen activation design decisions

Use synchronous `observeGovernanceScope({rootDir})` and a closed four-state observation. Enforcement applies to `active` and `unverifiable-active`; only `inactive` permits the initial hint. Git decisions use a physical registered-worktree root SHA subsection in Git common config and bind both root and common-directory device/inode identity. A common-repository boolean cannot decline sibling worktrees. Non-Git decisions use a host-constructor-sealed OS-user local state namespace, root-bound records, private 0700/0600 permissions or the canonical Windows DACL; hook payloads cannot select that store. Observation writes nothing.

The writer has digest/preimage-bound `plan`/`apply` with an in-process brand and consumes an explicit enroll/decline decision; it grants no PO or implementation approval. Compatibility accepts the canonical current onboarding-consent record, byte-current owned V3 source/projection pair, or the bounded older schema-valid manifest plus typed calibration adapter. Documents and arbitrary marker unions never qualify. Valid enrollment intent with projection drift, or corruption in the dedicated enrollment store, remains `unverifiable-active`; durable decline wins. Prove authentic onboarding rendering parity and rollback before asserting integration acceptance.

## Signing transport and historical withdrawal: Slice B acceptance

Both new items remain owned by Slice B. The exact PO-signed four-file repair is committed in historical source `3b05a045e4acfd4e2d3393b6a0c015a799c2bee6`; it is a limited author-write authorization, not this package's ordinary PO approval. Canonical source tests passed 5 signing cases and 27 cancellation cases. Preserve those bytes when merging prior0.7 proposals. Three postimages matched exactly; the apply tool removed one extra final newline from the cancellation test only. No test or logic was removed.

The signer accepts `approvalIntent.sha256` only for the closed canonical DWP schema and preserves complete current package validation, disclosure, one attended confirmation and key access ordering. Wrong nested digests, extra alias keys, malformed and stale packages fail before signing. The positive complete-package test must disclose whether its readiness authority is synthetic; it cannot stand in for native Codex execution.

Cancellation retains exact v1 historical receipts and adds a closed v2 receipt chain for a different current submission. Bound both receipt count and UTF-8 size; enforce same-feature identity, unique submission digests and ordered timestamps. Only exact replay of the latest completed withdrawal is zero-write. Wrong/replayed historic submissions, malformed receipts and capacity exhaustion fail without state mutation. Test the canonical writer's lock/CAS/readback over successive submissions, not only the pure helper. An installed old decoder must not silently consume v2; source/installed compatibility remains a separate controlled refresh requirement.

### Completeness and remaining engineering work

The requirements, exclusive ownership, sequence and acceptance above are binding parts of this canonical design and therefore included in the five-source package. The separately tracked additional-scope file is a preparation mirror, not a sixth required authority source. S1 legacy adapter implementation, derived binding ownership, shared-worktree removal admission, actual Agy loaded-source readback and cache lifecycle qualification are bounded implementation/evidence tasks governed by the stated contracts, not undecided product alternatives or additional routine PO gates. Existing A–E scope and the one final package decision remain required.
