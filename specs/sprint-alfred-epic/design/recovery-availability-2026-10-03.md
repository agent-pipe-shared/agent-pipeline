# Recovery availability when a session cannot repair itself

Status: proposed design input for the Alfred implementation duty; no implementation or PO approval is implied.

## Source material and provenance

**Latest user requirement, recorded separately and verbatim:**

> dann mach das bitte heile und sorge dafür dass das nicht generell passieren kann. Es muss immer eine möglichkeit geben per maintaince window oder wie auch immer zu reparieren

**Earlier recovered runtime summary (context only):** a dead session binding had already been removed by the existing exact descriptor cleanup at `2026-10-03T11:54:07.316Z`; the active feature was preserved. This summarizes a prior recovery and does not replace or narrow the user's new general requirement.

## Latest Toolbox handover: sanitized source evidence

The following is a **handover narrative**, not verified live tool output and not an assertion that a source fix is installed:

| Evidence field | Sanitized handover content | Boundary |
| --- | --- | --- |
| Environment | Windows 11, Claude, plugin `0.7.0+claude.20261003105506.1bd1d7bf` | Reported, not independently read back. |
| Trigger and repository | Hard PC crash during Verify-evidence push preparation; 11 commits; reported clean Git state at HEAD `e564138` | Handover account only. |
| Partial recovery | Statuses `cleanup_recovery_unavailable` / `orphan-recovery-unavailable`; one exact descriptor `session-5bdb4b51a8858f63efd80f50`; owner unavailable | No process liveness or receipt validity inferred. |
| Human actions | Retain-only; PO orphan-release attempt returned CAS conflict | No release or mutation claimed. |
| Evidence completeness | Digests shortened; no complete argv or raw JSON | Cannot decide truncated receipt versus authentic-but-stale receipt. |
| Other reported items | R1 Glob `scratch/*` versus `ls`; R2 absent `windows-acl` phase; R3 stale pre-push evidence per build treated as optional versus mandatory; R4 hard 80-second budget; R5 missing vendored skill links; B2 legacy unowned runtime temporary data and scan skipped above eight entries | Reported findings only. R2/R3 specifics expressly unconfirmed. |

Resolve P1 first. Address minor items only after source confirmation; R2/R3 require real evidence before any defect or fix is claimed. No host paths, actor names or additional opaque identifiers are retained here.

## P1 design boundary: unavailable legacy owner after hard crash

Source inspection distinguishes two descriptor shapes. The current V2 creator stores `ownerRuntime: null` when process-start identity is unavailable because `localProcessStartIdentity` currently implements Linux only; inspection reports V2 null as `unavailable`. Legacy V1 has the field absent and reports `unobserved`. Neither status means `not-live`, and neither supports retroactive reboot inference. The handover has no raw descriptor JSON, so its descriptor schema remains unknown. Design new native owner observation separately from signed legacy custody.

An exact CAS conflict requires bounded sanitized status/schema/digest readback and matching compare flags before classification. Do not presume truncation or authentic staleness. After affected sessions end, a separately signed, attended legacy-custody transaction binds repository/target, observed bytes or explicit absence, classification/schema, exact digests/comparison, session-ended confirmation, action/disposition, expiry and CAS precondition. Its matrix is:

| Receipt observation | Permitted signed disposition |
| --- | --- |
| Valid and matching | Preserve exact bytes and metadata. Replay an existing action only when actual full replay preconditions verify; otherwise use new explicit signed custody authority. |
| Valid but conflicting or stale | Archive/quarantine exact bytes under a signed disposition binding compared digests and conflict; the old receipt grants no authority. |
| Absent | Bind exact absence and CAS precondition; never fabricate bytes. New explicit signed custody authority may proceed where other prerequisites hold. |
| Malformed or explicitly invalid, with bounded readable bytes | Archive/quarantine only exact observed bytes under a signed disposition binding digest and independent comparison/classification; the old receipt grants no authority. |
| Unreadable, symlinked, or physically ambiguous | Return typed unavailable with the concrete read/identity prerequisite; do not mutate or guess. |

Archive preserves original receipt bytes and records a separate disposition;
it never deletes/rewrites history, asserts unsupported `not-live`, or changes
State, `activeFeature`, proofs, history or resources. Missing/invalid human
signer proof is separate from receipt status and prevents every mutation.

Required recovery consumer instructions must be signed and include exact
inputs, supported command/host prerequisites, bounded sanitized readback,
affected-session-ended confirmation, receipt class, preservation
destination/digest, authorization subject, CAS precondition and stop
conditions. Unknown owner is not automatic release. Missing proof,
unreadable/ambiguous bytes or CAS drift returns typed unavailable and
preserves every observed byte.

Add P1 tests for: V2 null is `unavailable`, V1 absent is `unobserved`, and neither becomes `not-live`; supported native observation and no retroactive reboot inference; and every receipt disposition in the matrix. Require matching schema/digest/CAS flags, actual replay preconditions, explicit signed custody otherwise, exact-byte archive/readback with no authority from archived receipts, and missing/invalid signer proof as a separate refusal. Preserve State, active feature, proofs, history and resources byte-for-byte. Cover wrong repository, drift, concurrent writer, symlink target and interruption. Then collect source evidence before closing R1–R5 or B2; do not claim R2/R3 until underlying paths and requirements are verified.

## Existing contracts and proposed boundary

ADR-0082 covers one intrinsic, evidence-preserving continuity repair. ADR-0058 covers a signed TTL window for GS-6/TP-* with an explicit non-liftable kernel. ADR-0059 offers exact HGO authorization for actions HGO can classify and an external operator handoff for actions outside its adapter. `repair-map.mjs` dynamically extracts HGO eligibility codes and adds lifecycle and kernel structural cases, but is not a universal inventory of bootstrap, planner and writer refusal paths. The signed quality package APIs bind approved package application/commit operations; they do not provide general repair of an unavailable or defective verifier.

The design has three levels:

| Level | Use | Authority and evidence |
| --- | --- | --- |
| A. Intrinsic known-shape recovery | A specific corruption has a closed diagnosis and deterministic repair, as with ADR-0082. | Existing or future narrow planner; immutable preimage, bounded postimage, lock/CAS, exact readback. |
| B. In-session maintenance | The current runner and relevant verifier are trustworthy and a guard supports the exact repair. | Existing GMW/HGO only within current scope; current repository/plugin identity, valid proof, unexpired TTL, exact path/action. |
| C. Attended external source/install repair | Bootstrap, lifecycle, kernel or verifier failure prevents safe use of A/B. | **New proposal:** separately installed known-good verifier outside affected runner/tree, attended operator and required human proof; no authority imported from the broken runtime. |

Level C uses a pinned standalone Node CLI artifact containing Node built-ins only, with no imports from target source or plugin. An attended operator selects the artifact identity and public signer anchor from a known-good version/channel outside the broken runner; target-supplied trust is never authoritative. The CLI establishes physical repository identity and installed plugin identity itself. Its supported target layouts are native Windows, Linux and macOS layouts that the existing resolver can verify; WSL is bound as a distinct physical root. A platform without verified resolver evidence returns typed unavailable.

The allowlist is exact, bounded Pipeline executable/code/test paths only. Portable Pipeline State, runtime-private evidence, approval proofs, trust anchors and unrelated plugin configuration are excluded and remain for their sanctioned recovery writers after code repair. Immutable preimages and a closed proof-bound manifest are stored in an owner-private independent recovery root; private preimage content is never published. The proof uses the repository's configured detached human Ed25519 ceremony; no model signs. Lost key or trust material returns typed unavailable with attended key re-establishment as prerequisite.

A reviewer sees repository and plugin identity, paths, preimage digests, diff digest, intended operation and expiry before authorization. The independent verifier validates proof, source identity, path allowlist, target resolution, symlink status, current preimages and lock ownership before each file replacement. A live or ambiguous lock owner blocks apply; age never establishes death. Multi-file work is a journaled prefix of per-file atomic replacements, not a claim of multi-file atomicity. Resume proceeds forward only while every applied postimage and remaining preimage still matches the journal; intervening changes stop the run and are preserved. Ready requires exact readback of every manifest file. A post-replacement correction is a new authorized forward transaction.

An interruption before replacement can resume from the same bound journal or safely abandon its own temporary files. An interruption after replacement preserves committed bytes and resumes readback/audit or issues a separately authorized forward-correction proposal. No automatic rollback rewrites a possibly newer writer. If a live owner holds the target lock, application stops and names the owner; age is never evidence that a live or ambiguous owner is dead. Symlinks, repository mismatch, plugin mismatch, source drift, diff expansion or proof failure stop before replacement.

## Existing versus new mechanisms

Existing: exact descriptor cleanup; ADR-0082's continuity planner/writer; GMW's prepare/install/status/close contract; HGO's eligibility, preview and exact-action capability; signed quality-package verification/application; current repair-map generation. These continue to govern their current scopes.

New proposal: an external verifier independent of the current runner, a source/install repair plan and proof subject, a transaction journal/CAS writer, crash-resume and forward-correction flow, refusal-coverage inventory, and machine-readable `unavailable`/handoff results. No current API listed above supplies these combined guarantees. The proposal does not change ADR-0058's in-session non-liftable kernel and does not allow the current verifier to rewrite itself.

## Universal refusal coverage

Before implementation, enumerate real refusal-producing predicates across bootstrap, inspection, guards, planners, maintenance proof/status checks and writers. Each row is derived by exercising its producer and recording the observed typed result, path/phase and predicate that emitted it. The inventory must detect additions or changes by comparing the producer's complete reachable refusal outcomes with dispositions; matching guessed source-code names alone is insufficient. Every new refusal path registers observed positive and negative fixtures plus its declared recovery/handoff. A CI static inventory/wiring check fails on an unregistered producer; runtime unknowns receive an explicit attended external diagnostic handoff. For each registered result, one and only one primary route is returned:

* exact intrinsic known-shape recovery;
* valid, scoped in-session HGO/GMW authorization;
* an executable attended external repair handoff; or
* typed `unavailable` with the missing prerequisite and the next concrete operator action.

Terminal `nobody`, a guessed `ready`, fallback to the possibly broken verifier, broad guard disablement, lifecycle-state discard and invented proof are forbidden. The protocol cannot recover lost secrets, missing evidence or bytes that were never preserved. It must retain corrupt bytes and invalidate only authority that depends on unverifiable material.

## Acceptance matrix for implementation

| Surface or case | Required result |
| --- | --- |
| Bootstrap cannot verify installed plugin | Read-only inspection offers Level C with exact repo/plugin identity prerequisites; it never trusts self-reported readiness. |
| Inspection of recognized ADR-0082 shape | Level A plan binds all inputs and exact postimage; ambiguous shape returns typed unavailable or operator route. |
| Guard denial with valid HGO/GMW scope | Existing route only; exact target and proof rechecked. Kernel remains outside GMW. |
| Unclassified guard or lifecycle/kernel refusal | External handoff or typed unavailable with concrete prerequisite; never `nobody`. |
| Planner input drift / wrong repository | Refuse before mutation; preserve preimage; identify mismatch. |
| Writer sees symlink, path escape or wrong plugin identity | Refuse; no target traversal or writes. |
| Expired maintenance proof | Reject; no renewal inferred and no authority from stored status. |
| Invalid signer / untrusted key / malformed proof | Reject before staging or replacement. |
| Active or ambiguous lock owner | Refuse and report owner classification; age alone cannot reclaim. |
| Source or working-tree drift after review | CAS fails; candidate is discarded only if owned; current bytes remain untouched. |
| Interrupted staging or apply | Resume from authenticated journal and exact phase readback, or safely abandon pre-replacement owned temp files. |
| Interrupted after replacement | Preserve committed bytes, verify exact readback and audit; corrective change is a new authorized forward transaction. |
| Lost key, secret, source trust or irreplaceable evidence | Typed unavailable identifies missing prerequisite; no guessed proof or reconstructed bytes. |

This matrix is necessary but not sufficient: final coverage requires the full producer-derived refusal inventory described above.

## Proposed defaults and evidence gates

The design choices are resolved as follows: pinned standalone Node CLI with built-ins only; operator-selected artifact identity and signer anchor from a known-good external version/channel; native Windows/Linux/macOS and separately bound WSL only where the existing resolver is verified; detached human Ed25519 authorization; exact executable/code/test path allowlist; owner-private immutable preimages and manifest; live/ambiguous lock refusal; journaled per-file atomic prefix with CAS and forward-only resume; producer-derived fixture registration plus CI inventory/wiring enforcement.

Implementation must provide host evidence for each supported layout, prove independent artifact identity and signer selection, exercise interrupted apply and drift, and demonstrate the inventory check against added and unregistered refusal producers. Missing proof, key, source trust or irreplaceable bytes remain typed unavailable with the concrete attended prerequisite; this does not reopen design choices or authorize fabricated evidence.

## Implementation duty

Candidate owner: independently governed V3 implementation duty, Luna 6 / high. Native route attestation is not claimed. The design does not edit production code, canon policy, state, PRD or acceptance specs. Implementation, threat-model review, independent Critic, required verification, PO decision and any release evidence remain outstanding.
