---
type: Governed Module
id: pipeline-core
responsibility: Core agent pipeline engine, hooks, lifecycle management, guards, and CLI scripts.
nonResponsibilities:
  - Test harness orchestration outside plugins
  - Root schemas store
  - Sprint backlog ledger tracking
ownedPaths:
  - plugins/pipeline-core/**
publicContracts:
  - plugins/pipeline-core/install-agy.mjs
  - plugins/pipeline-core/scripts/pipeline-start-preflight.mjs
  - plugins/pipeline-core/hooks/antigravity-start-hint.mjs
  - plugins/pipeline-core/hooks/antigravity-pretool-guard.mjs
  - plugins/pipeline-core/scripts/enforcement-conformance-cli.mjs
  - plugins/pipeline-core/scripts/goldfish-antigravity-host.mjs
  - plugins/pipeline-core/lib/antigravity-execution-host.mjs
  - plugins/pipeline-core/lib/role-dispatch-preflight.mjs
  - plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs
  - plugins/pipeline-core/scripts/module-inventory.mjs
  - plugins/pipeline-core/scripts/generate-architecture-overview.mjs
  - plugins/pipeline-core/scripts/architecture-remedy.mjs
  - plugins/pipeline-core/scripts/architecture-fitness.mjs
  - plugins/pipeline-core/scripts/architecture-adoption.mjs
  - plugins/pipeline-core/scripts/architecture-baseline.mjs
  - plugins/pipeline-core/lib/architecture-effective-decisions.mjs
  - plugins/pipeline-core/scripts/architecture-effective-decisions.mjs
  - plugins/pipeline-core/scripts/finish-feature.mjs
  - plugins/pipeline-core/lib/execution-plane-contract.mjs
  - plugins/pipeline-core/scripts/execution-plane-launch.mjs
  - plugins/pipeline-core/lib/critic-course-admission.mjs
  - plugins/pipeline-core/scripts/critic-dispatch-preflight.mjs
  - plugins/pipeline-core/scripts/session-critic-finalizer.mjs
  - plugins/pipeline-core/lib/model-role-session.mjs
  - plugins/pipeline-core/lib/dispatch-record.mjs
  - plugins/pipeline-core/lib/critic-disposition-addendum.mjs
  - plugins/pipeline-core/scripts/dispatch-record-write.mjs
  - plugins/pipeline-core/lib/pipeline-commit.mjs
  - plugins/pipeline-core/scripts/pipeline-commit.mjs
  - plugins/pipeline-core/lib/main-session-route.mjs
  - plugins/pipeline-core/lib/agy-final-return.mjs
  - plugins/pipeline-core/lib/agy-host-observed-receipt.mjs
  - plugins/pipeline-core/lib/agy-host-observed-store.mjs
  - plugins/pipeline-core/lib/agy-host-observed-local-readback.mjs
  - plugins/pipeline-core/lib/portable-agy-authorship-export.mjs
  - plugins/pipeline-core/scripts/portable-agy-authorship-export.mjs
  - plugins/pipeline-core/lib/portable-critic-export.mjs
  - plugins/pipeline-core/scripts/portable-critic-export.mjs
  - plugins/pipeline-core/lib/agy-host-commit-admission.mjs
  - plugins/pipeline-core/lib/agy-host-commit-execution.mjs
  - plugins/pipeline-core/scripts/agy-undelivered-record.mjs
  - plugins/pipeline-core/scripts/agy-host-observed-finalize.mjs
  - plugins/pipeline-core/scripts/goldfish-antigravity-live-host.mjs
  - plugins/pipeline-core/scripts/elephant-agy-implementation-dispatch.mjs
  - plugins/pipeline-core/scripts/elephant-implementation-dispatch.mjs
allowedDependencies:
  - schemas
authorityEffects:
  - read-write-workspace
  - execute-node-scripts
verificationEntryPoints:
  - plugins/pipeline-core/install-agy.test.mjs
  - plugins/pipeline-core/scripts/module-inventory.test.mjs
  - plugins/pipeline-core/hooks/antigravity-start-hint.test.mjs
  - plugins/pipeline-core/hooks/antigravity-pretool-guard.test.mjs
  - plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs
  - plugins/pipeline-core/scripts/enforcement-conformance.test.mjs
  - plugins/pipeline-core/scripts/goldfish-antigravity-host.test.mjs
  - plugins/pipeline-core/lib/antigravity-execution-host.test.mjs
  - plugins/pipeline-core/lib/dispatch-policy.test.mjs
  - plugins/pipeline-core/scripts/architecture-remedy.test.mjs
  - plugins/pipeline-core/scripts/architecture-fitness.test.mjs
  - plugins/pipeline-core/scripts/architecture-adoption.test.mjs
  - plugins/pipeline-core/scripts/architecture-baseline.test.mjs
  - plugins/pipeline-core/lib/architecture-effective-decisions.test.mjs
  - plugins/pipeline-core/scripts/finish-feature.test.mjs
  - plugins/pipeline-core/lib/execution-plane-contract-real.test.mjs
  - plugins/pipeline-core/scripts/execution-plane-launch.test.mjs
  - plugins/pipeline-core/lib/critic-course-admission.test.mjs
  - plugins/pipeline-core/scripts/critic-dispatch-preflight.test.mjs
  - plugins/pipeline-core/scripts/session-critic-finalizer.test.mjs
  - plugins/pipeline-core/lib/model-role-session.test.mjs
  - plugins/pipeline-core/lib/dispatch-record.test.mjs
  - plugins/pipeline-core/scripts/check-critic-skip-coverage.test.mjs
  - plugins/pipeline-core/scripts/dispatch-record-write.test.mjs
  - plugins/pipeline-core/lib/pipeline-commit.test.mjs
  - plugins/pipeline-core/scripts/pipeline-commit.test.mjs
  - plugins/pipeline-core/lib/main-session-route.test.mjs
  - plugins/pipeline-core/lib/agy-final-return.test.mjs
  - plugins/pipeline-core/lib/agy-host-commit-admission.test.mjs
  - plugins/pipeline-core/lib/agy-host-commit-execution.test.mjs
  - plugins/pipeline-core/lib/portable-agy-authorship-export.test.mjs
  - plugins/pipeline-core/scripts/portable-agy-authorship-export.test.mjs
  - plugins/pipeline-core/lib/portable-critic-export.test.mjs
  - plugins/pipeline-core/scripts/portable-critic-export.test.mjs
  - plugins/pipeline-core/scripts/goldfish-antigravity-live-host.test.mjs
  - plugins/pipeline-core/scripts/elephant-agy-implementation-dispatch.test.mjs
  - plugins/pipeline-core/scripts/elephant-implementation-dispatch.test.mjs
adrReferences:
  - ADR-0062
  - ADR-0063
  - ADR-0099
---

# Module: pipeline-core

## Declared module dependencies
- [schemas](schemas.md): Runtime contracts and receipts are validated against canonical schemas.

## Responsibility
Core agent pipeline engine, hooks, lifecycle management, guards, and CLI scripts.

## Public Contracts
- `plugins/pipeline-core/install-agy.mjs`: Registers one operator-selected physical plugin source in a consumer workspace while preserving unrelated registrations. Source selection fails explicitly when an unavailable local development marketplace is chosen; the installer checks the physical manifest and registry binding, not GitHub or release authenticity. Its separately confirmed optional autonomous settings update preserves unrelated keys and refuses malformed bytes, file aliases and parent aliases without replacing the existing settings file.
- `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs`: Runtime bootstrap and preflight inspection. The shared Claude/Codex/Antigravity entry reports architecture adoption and distinguishes a missing physical map index from a present but not-yet-validated one. A missing map offers a read-only map-first proposal even when a durable disposition already exists; it does not re-approve that disposition or block bootstrap. It also exposes one compact project-wide effective-ADR digest/status for all three runners; legacy ambiguity remains visible without blocking bootstrap, and task-module applicability is explicitly unresolved there. Implementation-entry validation remains a separate authority gate.
- `plugins/pipeline-core/hooks/antigravity-start-hint.mjs`: Only in a governed, Git-initialized workspace, writes a private per-session bootstrap lock using the same validated native identity that the Antigravity pretool guard reads, including `conversationId`. Invalid or path-shaped identities cannot arm a lock or form filesystem paths; an ungoverned or uninitialized workspace receives only an onboarding hint.
- `plugins/pipeline-core/hooks/antigravity-pretool-guard.mjs`: Resolves Agy's native session identity from the hook payload, without borrowing an inherited Codex environment ID, and refuses implementation tools while that session's private bootstrap lock is present. Passive reads remain available for recovery.
- `plugins/pipeline-core/scripts/enforcement-conformance-cli.mjs`: Reads the exact candidate-bound A1 conformance record, but does not qualify a claimed native PASS without independent measurement verification. The current CLI has no native producer and reports `native-measurement-not-verified` for an otherwise matching claim.
- `plugins/pipeline-core/scripts/goldfish-antigravity-host.mjs`: Provider-free E3 fake-executable dispatch boundary. Its production gate now consults the A1 CLI's independent native qualification; matching JSON fields, digests and candidate alone cannot open it. Offline fixtures may inject a qualified gate only to test downstream packet/receipt behavior, never to claim a real runner measurement.
- `plugins/pipeline-core/lib/antigravity-execution-host.mjs`: The bounded Agy child-process boundary checks the candidate-bound packet before launch, passes all CLI options before the final `--print=<text>` argument, and parses bounded JSON/stream results without treating exit zero alone as delivery.
- `plugins/pipeline-core/lib/role-dispatch-preflight.mjs`: The common all-runner admission returns a closed, ordered list of independent static or candidate-input/destination findings before any launcher or model call. Rejected preparation `field`/`findings` entries identify required inputs by bounded index rather than disclosing their path names; prepared packets are still internal caller data. Candidate-binding/deadline checks remain fail-closed.
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`: Enforces the implementation-phase transition after session readiness: the active plan's scoped adoption disposition and planning fitness are checked separately. A valid deferral does not manufacture a physical map or a fitness PASS; a missing navigation index reaches the real evaluator as a blocking finding unless a governed exception applies.
- `plugins/pipeline-core/scripts/module-inventory.mjs`: Architecture map bundle loading, validation, and module resolution.
- `plugins/pipeline-core/scripts/generate-architecture-overview.mjs`: Offline, deterministic HTML overview generated from the governed map; its default check detects stale output, and `--write` refreshes it for the consuming repository.
- `plugins/pipeline-core/scripts/architecture-remedy.mjs`: Architecture finding analysis and conformant remedy generation.
- `plugins/pipeline-core/scripts/architecture-fitness.mjs`: Architecture fitness evaluator and baseline ratchet store. At the planning boundary, each blocking finding calls the remedy comparator and carries its conformant/nonconformant options in `outcomes[].evidence.remedyComparisons`; later candidate checks do not turn a proposed remedy into a PASS.
- `plugins/pipeline-core/scripts/architecture-adoption.mjs`: Architecture adoption demand, proposal generator, and state management. The read-only proposal retains an existing valid disposition and offers no repeat decision options while outlining missing map work.
- `plugins/pipeline-core/scripts/architecture-baseline.mjs`: Architecture significance assessment and living ADR inventory compiler. The compiled inventory now carries an explicit source-validation projection; when historical records remain unresolved it reports `inventory-only` and no effective decision IDs or self-declared active waivers. Inventory status labels alone grant no implementation authority.
- `plugins/pipeline-core/lib/architecture-effective-decisions.mjs`: Read-only AC-19 source projection prerequisite. It admits only schema- and byte-digest-valid decision sidecars, excludes proposed/superseded records, checks supersession, and returns typed unresolved findings for legacy Markdown, malformed pairs, unbound module scope, or unverified waivers. A matching projection digest is not itself proof that two native runner sessions consumed the decisions; productive bootstrap wiring and inherited-authority binding remain separate.
- `plugins/pipeline-core/scripts/architecture-effective-decisions.mjs`: Read-only exact-root CLI for the source projection, returning a typed nonzero unresolved result without mutating the ADR estate or claiming runner-session parity.
- `plugins/pipeline-core/scripts/finish-feature.mjs`: Explicit feature-close driver over the durable coordinator; interrupted runs require an exact lifecycle ID to resume. A lost final process response can be resolved read-only against the closed State, coordinator and audit references without a duplicate close; this never implies release authorization.
- `plugins/pipeline-core/lib/execution-plane-contract.mjs`: Preserves `succeeded-unverified` after a real worker return; a separate exact-result, exact-output verifier receipt is required before a state can become `verified`.
- `plugins/pipeline-core/scripts/execution-plane-launch.mjs`: Runs the bounded real-child fixture path; host readback of workspace bytes and the supervisor change manifest supplies the success verifier evidence before scheduling completion.
- `plugins/pipeline-core/lib/critic-course-admission.mjs`: Derives the Critic review round and correction budget from registered, immutable candidate evidence and the exact Git range; caller-supplied counters cannot grant admission.
- `plugins/pipeline-core/scripts/critic-dispatch-preflight.mjs`: Reads the candidate's retained Critic course before a new review is launched and rejects stale parents or exhausted courses.
- `plugins/pipeline-core/scripts/session-critic-finalizer.mjs`: Admits and persists an exact claimed Critic packet before a fresh session starts, then finalizes only that existing admission after a validated return.
- `plugins/pipeline-core/scripts/critic-packet-preflight.mjs`: The private consumed-receipt reader compares the receipt record to the consumed journal state before downstream Verify or portable export can treat it as review evidence; a changed receipt file alone cannot mint a new verdict. This local readback does not replace independent Critic execution.
- `plugins/pipeline-core/lib/portable-agy-authorship-export.mjs`: Prepares a redacted Agy authorship subject only after the local Git-backed verifier reaches PASS with independently read private host and Critic evidence. Its clone reader checks physical committed export bytes, the authored Git commit/parent/tree/paths and a detached PO proof against the trust anchor already committed before that Agy commit. When a public v4 record is present, it additionally binds the exact physical and committed record bytes to the signed record digest and checks model, effort, route policy and report consistency; both authorship and repository-wide Critic coverage consume that portable readback. It does not claim provider model attestation, sign a proof, publish the export or replace a real provider-backed qualification run.
- `plugins/pipeline-core/lib/portable-critic-export.mjs`: Derives a redacted export subject only from one consumed, candidate-bound private Critic packet, then binds its signer-visible request and clone-side detached-signature validation to the committed plan, Spec and trust anchor. The pure contract cannot mint a passed review from caller prose, publish a file, authenticate a caller-chosen anchor or activate the final inventory gate.
- `plugins/pipeline-core/scripts/portable-critic-export.mjs`: Against a clean immutable candidate, derives the private Critic export request, rechecks it immediately before signing, and publishes only a detached-proof-verified canonical export at the fixed evidence path. It reuses the exclusive inode-checked publication primitive and never signs, activates an inventory, pushes or releases by itself. The final inventory checker consumes the committed export only in its narrow post-review activation transition.
- `plugins/pipeline-core/scripts/portable-agy-authorship-export.mjs`: Prepares an exclusive local PO signing request only after that local PASS. Its read-only `check` mode rederives the request for the human signer immediately before signing; a shaped request alone is insufficient. After detached-proof verification against the committed parent trust anchor, it publishes the exact redacted export exclusively. Publication is inode-checked and does not commit the export, perform the human signing ceremony or turn host observation into provider attestation.
- `plugins/pipeline-core/lib/model-role-session.mjs`: Pure functional-role selection, exact dispatch binding and one-session non-authorizing mapping readback for host-owned receipts. The readback includes previous and selected exact model IDs, policy identities, selected compatibility-evidence digest, bootstrap candidate and selected receipt digest; the first mapping or a changed mapping needs one acknowledgement bound to that exact displayed receipt, even when the model name is unchanged. Bootstrap selection and subsequent admission both require the caller's entire declared configured route set; a missing or extra role is refused. An unchanged later-session mapping needs no repeat acknowledgement. Compact cannot mix reused and freshly selected routes. The caller must authenticate the configured set and the acknowledgement event; no provider discovery, policy approval, or trusted storage is supplied by this module.
- `plugins/pipeline-core/lib/dispatch-record.mjs`: Closed v3/v4 evidence contract and shared durable-report validation. V4 accepts a bounded multiline report matching the Agy Final Return envelope; private host paths, CR and NUL are rejected before the host commit path can use the return.
- `plugins/pipeline-core/lib/critic-disposition-addendum.mjs`: Validates an exact record-byte, task, dispatch candidate, review candidate and evidence-digest binding for an immutable Critic-required v4 record, whether non-authoring or authored. Coverage also requires a passed, consumed, task-bound private Critic packet referencing the same Git blob bytes; the addendum alone cannot prove review.
- `plugins/pipeline-core/scripts/dispatch-record-write.mjs`: Exclusively publishes validated v4 dispatch records and host-only Critic addenda after physical record/evidence readback; a Critic addendum cannot overwrite or mutate its source record and does not by itself attest a passed review. Its distinct host-observed Agy entry invokes independent private receipt, consent, result and Git readback before writing an authored v4 record; the public JSON/object entries still reject that model claim.
- `plugins/pipeline-core/lib/pipeline-commit.mjs`: Structured staged-only commit preview and normal-hook execution with canonical Dispatch trailer derived from a physical record; Git subprocesses ignore ambient repository/index overrides. After the commit it re-reads parent, tree, paths and message against the preview, reporting recovery rather than success if a hook changed the result. Record provenance from a live host remains a separate requirement.
- `plugins/pipeline-core/scripts/pipeline-commit.mjs`: Closed argv entry point for the structured commit; rejects caller-supplied attribution and shell-multiline values. A post-commit recovery receipt exits nonzero and exception diagnostics are reduced to static codes.
- `plugins/pipeline-core/lib/main-session-route.mjs`: Reconciles a host-observed main-session model with registered routing. A future functional-role cell needs a matching host-held receipt; the current V3 exact-ID routes remain unchanged.
- `plugins/pipeline-core/lib/agy-final-return.mjs`: Defines Agy's schema-constrained implementation return and independently validates the exact dispatch, candidate, outcome, durable v4-compatible report and changed paths. A changed path must round-trip through the v4 authorship reader as the same literal path. Its closed role mapping preserves either `goldfish-implementor` or `goldfish-mechanic` from the sealed packet through precommit validation, private host receipt and public v4 record; an unknown or changed role fails closed. Its preflight checks the static v4 shape and independently derived path triggers before a possible host commit; the post-commit draft also checks the internal model witness against session, consent, route, result digest and host-readback commit/parent/tree/path set without publishing. These object-level checks do not attest witness provenance or authorship by themselves.
- `plugins/pipeline-core/lib/agy-host-observed-receipt.mjs`: Builds and validates the proposed local Agy host-receipt subject against exact authored-record bytes, internal model witness, consent scope, result-file identity and read-back Git commit. A valid object is not provenance: no private physical store, independent result/consent readback, writer admission or portable export is supplied by this contract alone.
- `plugins/pipeline-core/lib/agy-host-observed-store.mjs`: Exclusively writes bounded Agy host-receipt bytes under a caller-supplied physical Git common directory and reopens them without following target aliases; changed record bytes, duplicate JSON keys and mismatched receipt fields fail readback. The store returns `not-yet-independently-verified`: it does not authenticate the caller's common-directory source or independently validate consent, result and Git history, so its contents alone cannot authorize an authored v4 PASS.
- `plugins/pipeline-core/lib/agy-host-observed-local-readback.mjs`: Derives the physical private store from the primary repository, then reopens the descriptor, signed consent, exact result file and Git commit/parent/tree/paths before reporting a local host-observed binding. A fresh clone without the private receipt remains unverifiable. The distinct host-only writer and the Git-backed authorship reader call this verifier; it creates neither portable nor provider-attested authority.
- `plugins/pipeline-core/lib/agy-host-commit-admission.mjs`: Captures a clean Git baseline before Agy runs and admits only a host-observed diff that exactly matches the validated final return and consent paths, including the clean-filtered Git blob IDs at admission; it does not stage or commit. Before a completed-undelivered record, its physical-root Git observation refuses a changed or unreadable HEAD instead of declaring no commit.
- `plugins/pipeline-core/lib/agy-host-commit-execution.mjs`: Requires the host's prior post-return admission, rechecks its path/blob binding, stages only that Agy diff, refuses staged blob drift, executes normal Git commit hooks, and checks the authored commit's parent, tree, paths and exact message. Its exact `Agy-Host-Observed: v1` trailer only routes a clone with missing private evidence to `UNVERIFIABLE`; it never proves authorship. A final HEAD recheck catches a competing commit during readback; full post-return transaction isolation still belongs to the later host coordinator. A timeout or a changed/unreadable HEAD after a failed process response stays recovery-required instead of being called no-delivery. This host-only step does not publish a v4 dispatch record or claim delivery.
- `plugins/pipeline-core/scripts/agy-undelivered-record.mjs`: Publishes distinct exclusive v4 non-authoring observations: completed-undelivered has no result digest or report; interrupted-before-Final uses `stopped-without-commit` with a bounded host-authored report, attempt identifier, sanitized reason and mandatory Critic review. Both recheck the writer receipt against the exact serialized record bytes and target. Neither attributes a commit or delivered child result.
- `plugins/pipeline-core/scripts/agy-host-observed-finalize.mjs`: Rechecks the sealed live-host admission, current consent and exact result bytes; then executes the normal-hook Host-Commit, persists a private host-observation receipt and invokes the independent-readback host-only v4 writer in that order. Any post-commit failure returns a typed recovery state with the observed commit OID, never a no-commit claim.
- `plugins/pipeline-core/scripts/goldfish-antigravity-live-host.mjs`: Loads attended consent, runs the schema-bound Agy session, rechecks consent after return, rereads the exact host-written result bytes and observed model through a bounded descriptor, then applies Git-diff admission. The internal admission carries the report text only from that verified readback and preflights the complete authored v4 shape with a conservative, path-derived Critic-required decision before any host commit; the outer receipt omits the report. Result readback binds the exact Final Return outcome even for `failed`/`blocked`, so a delivered non-success result is held for recovery rather than falsely called undelivered. A completed call without a delivered Final Return publishes a completed-undelivered v4 record only after model and unchanged-HEAD checks. A process observed as started and fully closed before any transport result or Final Return instead publishes a distinct Critic-required `stopped-without-commit` v4 host observation only after unchanged-HEAD readback; its model remains unknown unless actually observed. A transport result followed by failure, an unclosed or malformed stream, contradictory Final Return, changed HEAD or failed publication stays recovery-required. The call count alone does not prove a process started or provider execution. An admitted successful final is passed only internally to the Host-Commit finalizer.
- `plugins/pipeline-core/scripts/elephant-agy-implementation-dispatch.mjs`: The sealed outer receipt preserves recovery states and reports only `host-observed-model`, not provider attestation. A terminal host claim with a missing/mismatched model or a missing, nonintegral or zero model-call count becomes recovery-required before the outer route can announce it. The real sealed host's validated final reaches the Host-Commit finalizer before any authored success receipt; an unexpected host exception or launched-but-nonfinal result stays recovery-required with a static code and no private diagnostic text.
- `plugins/pipeline-core/scripts/elephant-implementation-dispatch.mjs`: The public Elephant selector invokes only the sealed Antigravity route and never silently falls back. A selected route exception, invalid response, or nonfinal response after a model call is reported as recovery-required, not as a safe rejection or retry.

## Verification
- `node --test plugins/pipeline-core/install-agy.test.mjs`
- `node --test plugins/pipeline-core/scripts/module-inventory.test.mjs`
- `node --test plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`
- `node --test plugins/pipeline-core/scripts/enforcement-conformance.test.mjs`
- `node --test plugins/pipeline-core/scripts/goldfish-antigravity-host.test.mjs`
- `node --test plugins/pipeline-core/scripts/architecture-remedy.test.mjs`
- `node --test plugins/pipeline-core/scripts/architecture-fitness.test.mjs`
- `node --test plugins/pipeline-core/scripts/architecture-adoption.test.mjs`
- `node --test plugins/pipeline-core/scripts/architecture-baseline.test.mjs`
- `node plugins/pipeline-core/lib/architecture-effective-decisions.test.mjs`
- `node plugins/pipeline-core/scripts/finish-feature.test.mjs`
- `node plugins/pipeline-core/lib/execution-plane-contract-real.test.mjs`
- `node plugins/pipeline-core/scripts/execution-plane-launch.test.mjs`
- `node --test plugins/pipeline-core/lib/critic-course-admission.test.mjs`
- `node --test plugins/pipeline-core/scripts/critic-dispatch-preflight.test.mjs`
- `node --test plugins/pipeline-core/scripts/session-critic-finalizer.test.mjs`
- `node plugins/pipeline-core/lib/model-role-session.test.mjs`
- `node plugins/pipeline-core/lib/dispatch-record.test.mjs`
- `node --test plugins/pipeline-core/scripts/check-critic-skip-coverage.test.mjs`
- `node plugins/pipeline-core/scripts/dispatch-record-write.test.mjs`
- `node --test plugins/pipeline-core/lib/pipeline-commit.test.mjs plugins/pipeline-core/scripts/pipeline-commit.test.mjs`
- `node plugins/pipeline-core/lib/main-session-route.test.mjs`
- `node plugins/pipeline-core/lib/agy-final-return.test.mjs`
- `node plugins/pipeline-core/lib/agy-host-commit-admission.test.mjs`
- `node plugins/pipeline-core/lib/agy-host-commit-execution.test.mjs`
- `node --test plugins/pipeline-core/scripts/goldfish-antigravity-live-host.test.mjs`
- `node plugins/pipeline-core/scripts/elephant-agy-implementation-dispatch.test.mjs`
- `node plugins/pipeline-core/scripts/elephant-implementation-dispatch.test.mjs`
