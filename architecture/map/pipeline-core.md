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
  - plugins/pipeline-core/lib/design-advisor-course-store.mjs
  - plugins/pipeline-core/lib/design-advisory-coordinator-v2.mjs
  - plugins/pipeline-core/lib/design-workflow-package-v2.mjs
  - plugins/pipeline-core/lib/native-initial-advisor-execution.mjs
  - plugins/pipeline-core/lib/readiness-advisor-context-v2.mjs
  - plugins/pipeline-core/lib/runner-readiness-request.mjs
  - plugins/pipeline-core/lib/project-uninstall-workspace.mjs
  - plugins/pipeline-core/scripts/runner-design-readiness-bootstrap.mjs
  - plugins/pipeline-core/scripts/codex-design-readiness-bootstrap.mjs
  - plugins/pipeline-core/lib/design-readiness-host-evidence.mjs
  - plugins/pipeline-core/schemas/pipeline.security-scanner-diagnostics.v1.json
  - plugins/pipeline-core/lib/security-scanner-diagnostics-publication.mjs
  - plugins/pipeline-core/lib/security-scanner-diagnostics.mjs
  - plugins/pipeline-core/install-agy.mjs
  - plugins/pipeline-core/scripts/pipeline-start-preflight.mjs
  - plugins/pipeline-core/scripts/check-private-identifiers.mjs
  - plugins/pipeline-core/scripts/ruleset-freshness.mjs
  - plugins/pipeline-core/scripts/pipeline-update-channel.mjs
  - plugins/pipeline-core/scripts/onboarding-init.mjs
  - plugins/pipeline-core/hooks/guard-push.mjs
  - plugins/pipeline-core/lib/checkpoint-push-audit.mjs
  - plugins/pipeline-core/lib/architecture-entry-readiness.mjs
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
  - plugins/pipeline-core/scripts/check-protected-delta.mjs
  - plugins/pipeline-core/lib/architecture-effective-decisions.mjs
  - plugins/pipeline-core/lib/architecture-decision-continuity.mjs
  - plugins/pipeline-core/lib/architecture-decision-waiver-store.mjs
  - plugins/pipeline-core/lib/organization-architecture-source.mjs
  - plugins/pipeline-core/lib/organization-architecture-source-store.mjs
  - plugins/pipeline-core/scripts/architecture-inherited-sources.mjs
  - plugins/pipeline-core/scripts/architecture-effective-decisions.mjs
  - plugins/pipeline-core/scripts/finish-feature.mjs
  - plugins/pipeline-core/lib/execution-plane-contract.mjs
  - plugins/pipeline-core/scripts/execution-plane-launch.mjs
  - plugins/pipeline-core/lib/critic-course-admission.mjs
  - plugins/pipeline-core/scripts/critic-dispatch-preflight.mjs
  - plugins/pipeline-core/scripts/session-critic-finalizer.mjs
  - plugins/pipeline-core/lib/critic-session-model-route.mjs
  - plugins/pipeline-core/scripts/codex-critic-session-route.mjs
  - plugins/pipeline-core/scripts/verify-evidence-producer.mjs
  - plugins/pipeline-core/scripts/check-critic-bound-verify.mjs
  - plugins/pipeline-core/lib/critic-verify-lifecycle.mjs
  - plugins/pipeline-core/lib/critic-verify-readiness.mjs
  - plugins/pipeline-core/scripts/close-coordinator.mjs
  - plugins/pipeline-core/scripts/design-advisory-admission.mjs
  - plugins/pipeline-core/scripts/design-advisory-coordinator.mjs
  - plugins/pipeline-core/lib/design-advisory-transaction.mjs
  - plugins/pipeline-core/lib/design-workflow-package.mjs
  - plugins/pipeline-core/lib/advisory-attempt-trail.mjs
  - plugins/pipeline-core/lib/model-role-session.mjs
  - plugins/pipeline-core/lib/model-role-route-source.mjs
  - plugins/pipeline-core/lib/model-role-host-session.mjs
  - plugins/pipeline-core/lib/model-role-host-observations.mjs
  - plugins/pipeline-core/lib/model-role-host-identity.mjs
  - plugins/pipeline-core/lib/model-role-approved-policy.mjs
  - plugins/pipeline-core/lib/model-role-v3-baseline.mjs
  - plugins/pipeline-core/lib/verify-suite-append-policy.mjs
  - plugins/pipeline-core/scripts/model-role-bootstrap.mjs
  - plugins/pipeline-core/scripts/model-role-dispatch-select.mjs
  - plugins/pipeline-core/lib/model-role-host-store.mjs
  - plugins/pipeline-core/lib/model-role-dispatch.mjs
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
  - plugins/pipeline-core/hooks/native-goldfish-host.mjs
  - plugins/pipeline-core/lib/native-goldfish-host-return.mjs
  - plugins/pipeline-core/lib/native-goldfish-host-state.mjs
  - plugins/pipeline-core/lib/native-goldfish-host-observation.mjs
  - plugins/pipeline-core/lib/native-goldfish-host-finalizer.mjs
  - plugins/pipeline-core/lib/goldfish-commit-command-flow.mjs
  - plugins/pipeline-core/scripts/goldfish-commit-command-flow.mjs
  - plugins/pipeline-core/scripts/agy-undelivered-record.mjs
  - plugins/pipeline-core/scripts/agy-host-observed-finalize.mjs
  - plugins/pipeline-core/scripts/goldfish-antigravity-live-host.mjs
  - plugins/pipeline-core/scripts/elephant-agy-implementation-dispatch.mjs
  - plugins/pipeline-core/scripts/elephant-implementation-dispatch.mjs
  - plugins/pipeline-core/lib/governance-scope.mjs
  - plugins/pipeline-core/scripts/project-activation.mjs
  - plugins/pipeline-core/lib/project-uninstall-contract.mjs
  - plugins/pipeline-core/lib/project-uninstall.mjs
  - plugins/pipeline-core/lib/runtime-projection-removal.mjs
  - plugins/pipeline-core/lib/antigravity-topology-refresh-host.mjs
allowedDependencies:
  - schemas
authorityEffects:
  - read-write-workspace
  - execute-node-scripts
verificationEntryPoints:
  - plugins/pipeline-core/lib/security-scanner-diagnostics.test.mjs
  - plugins/pipeline-core/lib/advisory-route-selection.test.mjs
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
  - plugins/pipeline-core/lib/architecture-decision-continuity.test.mjs
  - plugins/pipeline-core/lib/architecture-decision-waiver-store.test.mjs
  - plugins/pipeline-core/lib/organization-architecture-source.test.mjs
  - plugins/pipeline-core/lib/organization-architecture-source-store.test.mjs
  - plugins/pipeline-core/scripts/architecture-inherited-sources.test.mjs
  - plugins/pipeline-core/scripts/finish-feature.test.mjs
  - plugins/pipeline-core/lib/execution-plane-contract-real.test.mjs
  - plugins/pipeline-core/scripts/execution-plane-launch.test.mjs
  - plugins/pipeline-core/lib/critic-course-admission.test.mjs
  - plugins/pipeline-core/scripts/critic-dispatch-preflight.test.mjs
  - plugins/pipeline-core/scripts/session-critic-finalizer.test.mjs
  - plugins/pipeline-core/scripts/codex-critic-session-route.test.mjs
  - plugins/pipeline-core/scripts/verify-evidence-producer.test.mjs
  - plugins/pipeline-core/lib/critic-verify-lifecycle.test.mjs
  - plugins/pipeline-core/scripts/close-coordinator-audit-lifecycle.test.mjs
  - plugins/pipeline-core/scripts/design-advisory-admission.test.mjs
  - plugins/pipeline-core/lib/design-advisory-coordinator.test.mjs
  - plugins/pipeline-core/lib/design-advisory-transaction.test.mjs
  - plugins/pipeline-core/lib/design-workflow-package.test.mjs
  - plugins/pipeline-core/lib/model-role-session.test.mjs
  - plugins/pipeline-core/lib/model-role-host-session.test.mjs
  - plugins/pipeline-core/lib/model-role-host-observations.test.mjs
  - plugins/pipeline-core/lib/model-role-host-identity.test.mjs
  - plugins/pipeline-core/lib/model-role-approved-policy.test.mjs
  - plugins/pipeline-core/lib/model-role-v3-baseline.test.mjs
  - plugins/pipeline-core/lib/verify-suite-append-policy.test.mjs
  - plugins/pipeline-core/scripts/model-role-bootstrap.test.mjs
  - plugins/pipeline-core/scripts/model-role-dispatch-select.test.mjs
  - plugins/pipeline-core/lib/model-role-host-store.test.mjs
  - plugins/pipeline-core/lib/model-role-dispatch.test.mjs
  - plugins/pipeline-core/lib/dispatch-record.test.mjs
  - plugins/pipeline-core/scripts/check-critic-skip-coverage.test.mjs
  - plugins/pipeline-core/scripts/dispatch-record-write.test.mjs
  - plugins/pipeline-core/lib/pipeline-commit.test.mjs
  - plugins/pipeline-core/scripts/pipeline-commit.test.mjs
  - plugins/pipeline-core/lib/main-session-route.test.mjs
  - plugins/pipeline-core/lib/agy-final-return.test.mjs
  - plugins/pipeline-core/lib/agy-host-commit-admission.test.mjs
  - plugins/pipeline-core/lib/agy-host-commit-execution.test.mjs
  - plugins/pipeline-core/lib/native-goldfish-host-return.test.mjs
  - plugins/pipeline-core/lib/native-goldfish-host-state.test.mjs
  - plugins/pipeline-core/lib/native-goldfish-host-finalizer.test.mjs
  - plugins/pipeline-core/lib/native-goldfish-host-commit-execution.test.mjs
  - plugins/pipeline-core/scripts/goldfish-commit-command-flow.test.mjs
  - plugins/pipeline-core/lib/portable-agy-authorship-export.test.mjs
  - plugins/pipeline-core/scripts/portable-agy-authorship-export.test.mjs
  - plugins/pipeline-core/lib/portable-critic-export.test.mjs
  - plugins/pipeline-core/scripts/portable-critic-export.test.mjs
  - plugins/pipeline-core/scripts/goldfish-antigravity-live-host.test.mjs
  - plugins/pipeline-core/scripts/elephant-agy-implementation-dispatch.test.mjs
  - plugins/pipeline-core/scripts/elephant-implementation-dispatch.test.mjs
  - plugins/pipeline-core/scripts/antigravity-topology-integration.test.mjs
  - plugins/pipeline-core/lib/antigravity-topology-refresh-host.test.mjs
  - plugins/pipeline-core/scripts/browser-evidence-preflight.test.mjs
  - plugins/pipeline-core/lib/codex-advisor-execution.test.mjs
  - plugins/pipeline-core/hooks/codex-compact-session-output.test.mjs
  - plugins/pipeline-core/lib/critic-route-v3.test.mjs
  - plugins/pipeline-core/lib/design-advisor-course-store.test.mjs
  - plugins/pipeline-core/lib/design-advisor-course.test.mjs
  - plugins/pipeline-core/lib/design-advisor-provenance.test.mjs
  - plugins/pipeline-core/lib/design-advisory-coordinator-v2.test.mjs
  - plugins/pipeline-core/lib/design-workflow-package-v2.test.mjs
  - plugins/pipeline-core/scripts/design-workflow-signing-default.test.mjs
  - plugins/pipeline-core/lib/governance-onboarding.test.mjs
  - plugins/pipeline-core/lib/governance-scope.test.mjs
  - plugins/pipeline-core/hooks/hook-governance-scope.test.mjs
  - plugins/pipeline-core/lib/human-guard-override-capability-scan.test.mjs
  - plugins/pipeline-core/hooks/lifecycle-denial-loop-guard.test.mjs
  - plugins/pipeline-core/lib/lifecycle-denial-loop.test.mjs
  - plugins/pipeline-core/lib/onboarding-first-restart-intake.test.mjs
  - plugins/pipeline-core/lib/physical-scratch-boundary.test.mjs
  - plugins/pipeline-core/scripts/project-activation.test.mjs
  - plugins/pipeline-core/scripts/project-reset-git-hooks.test.mjs
  - plugins/pipeline-core/lib/project-uninstall-contract.test.mjs
  - plugins/pipeline-core/lib/project-uninstall.test.mjs
  - plugins/pipeline-core/lib/runtime-projection-removal.test.mjs
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
- `plugins/pipeline-core/install-agy.mjs`: Registers one operator-selected physical plugin source in a consumer workspace while preserving unrelated registrations. Source selection fails explicitly when an unavailable local development marketplace is chosen; the installer checks the physical manifest and registry binding, not GitHub or release authenticity. Before mutating the managed copy, it verifies that the selected source can provide the required Git attestation; a verified first workspace refresh writes the installed receipt for the matching managed copy. Its separately confirmed optional autonomous settings update preserves unrelated keys and refuses malformed bytes, file aliases and parent aliases without replacing the existing settings file.
- `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs`: Runtime bootstrap and preflight inspection. The shared Claude/Codex/Antigravity entry reports architecture adoption and distinguishes a missing physical map index from a present but not-yet-validated one. A missing map offers a read-only map-first proposal even when a durable disposition already exists; it does not re-approve that disposition or block bootstrap. Agy attestation failures include the host installation recovery action for a receipt-less managed copy. It also exposes one compact project-wide effective-ADR digest/status for all three runners; legacy ambiguity remains visible without blocking bootstrap, and task-module applicability is explicitly unresolved there. Implementation-entry validation remains a separate authority gate.
- `plugins/pipeline-core/scripts/check-private-identifiers.mjs`: Checks newly staged text and scrubbed paths for locally derived private identifier patterns before a commit. The generated pre-commit hook invokes it without printing matching values; it does not rewrite historical Git objects.
- `plugins/pipeline-core/scripts/ruleset-freshness.mjs`: Resolves update availability from the selected channel: Alpha follows main, Beta follows the highest prerelease tag on main, and Stable follows the highest final tag on main. Missing or off-main tags are typed unknown observations.
- `plugins/pipeline-core/scripts/pipeline-update-channel.mjs`: Reads and writes the portable Alpha/Beta/Stable selection. A legacy alpha-ref field remains readable for migration, while new writes to that retired field are rejected.
- `plugins/pipeline-core/scripts/onboarding-init.mjs`: Drives first-use onboarding across runners. A portable-seed mutation that rolls back or returns an unexpected status stops with a typed outcome instead of retrying the same plan until the step cap.
- `plugins/pipeline-core/hooks/guard-push.mjs`: Applies the candidate-bound push policy. Final candidate pushes require a current architecture map for declared executable and schema contracts; the explicit checkpoint lane records typed map debt before attempting the push.
- `plugins/pipeline-core/lib/checkpoint-push-audit.mjs`: Appends exact checkpoint-attempt records to the private Git common directory and reads unresolved architecture-map debt. An attempted push can leave debt even when network delivery fails; a later descendant map update makes it eligible for planning re-evaluation.
- `plugins/pipeline-core/lib/architecture-entry-readiness.mjs`: At the next planning boundary, consumes checkpoint map debt before the ordinary adoption-deferral projection. Unresolved or unreadable debt returns a typed repair action; a later map update and navigation-currency pass clear it.
- `plugins/pipeline-core/hooks/antigravity-start-hint.mjs`: Only in a governed, Git-initialized workspace, writes a private per-session bootstrap lock using the same validated native identity that the Antigravity pretool guard reads, including `conversationId`. Invalid or path-shaped identities cannot arm a lock or form filesystem paths; an ungoverned or uninitialized workspace receives only an onboarding hint.
- `plugins/pipeline-core/hooks/antigravity-pretool-guard.mjs`: Resolves Agy's native session identity from the hook payload, without borrowing an inherited Codex environment ID, and refuses implementation tools while that session's private bootstrap lock is present. Passive reads remain available for recovery.
- `plugins/pipeline-core/scripts/enforcement-conformance-cli.mjs`: Reads the exact candidate-bound A1 conformance record, but does not qualify a claimed native PASS without independent measurement verification. The current CLI has no native producer and reports `native-measurement-not-verified` for an otherwise matching claim.
- `plugins/pipeline-core/scripts/goldfish-antigravity-host.mjs`: Provider-free E3 fake-executable dispatch boundary. Its production gate now consults the A1 CLI's independent native qualification; matching JSON fields, digests and candidate alone cannot open it. Offline fixtures may inject a qualified gate only to test downstream packet/receipt behavior, never to claim a real runner measurement.
- `plugins/pipeline-core/lib/antigravity-execution-host.mjs`: The bounded Agy child-process boundary checks the candidate-bound packet before launch, passes all CLI options before the final `--print=<text>` argument, and parses bounded JSON/stream results without treating exit zero alone as delivery.
- `plugins/pipeline-core/lib/role-dispatch-preflight.mjs`: The common all-runner admission returns a closed, ordered list of independent static or candidate-input/destination findings before any launcher or model call. Rejected preparation `field`/`findings` entries identify required inputs by bounded index rather than disclosing their path names; prepared packets are still internal caller data. Candidate-binding/deadline checks remain fail-closed.
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`: Enforces the implementation-phase transition after session readiness: the active plan's scoped adoption disposition and planning fitness are checked separately. A valid deferral does not manufacture a physical map or a fitness PASS; a missing navigation index reaches the real evaluator as a blocking finding unless a governed exception applies.
- `plugins/pipeline-core/scripts/module-inventory.mjs`: Architecture map bundle loading, validation, and module resolution. Absolute paths are resolved against the consuming map's concept-file root, not the installed plugin checkout; mixed roots, missing source paths and equally specific owners remain unresolved instead of selecting arbitrary authority.
- `plugins/pipeline-core/scripts/generate-architecture-overview.mjs`: Offline, deterministic HTML overview generated from the governed map; its default check detects stale output, and `--write` refreshes it for the consuming repository.
- `plugins/pipeline-core/scripts/architecture-remedy.mjs`: Architecture finding analysis and conformant remedy generation.
- `plugins/pipeline-core/scripts/architecture-fitness.mjs`: Architecture fitness evaluator and baseline ratchet store. At the planning boundary, each blocking finding calls the remedy comparator and carries its conformant/nonconformant options in `outcomes[].evidence.remedyComparisons`; later candidate checks do not turn a proposed remedy into a PASS.
- `plugins/pipeline-core/scripts/architecture-adoption.mjs`: Architecture adoption demand, proposal generator, and state management. The read-only proposal retains an existing valid disposition and offers no repeat decision options while outlining missing map work.
- `plugins/pipeline-core/scripts/architecture-baseline.mjs`: Architecture significance assessment and living ADR inventory compiler. The compiled inventory now carries an explicit source-validation projection; when historical records remain unresolved it reports `inventory-only` and no effective decision IDs or self-declared active waivers. Inventory status labels alone grant no implementation authority.
- `plugins/pipeline-core/lib/architecture-effective-decisions.mjs`: Read-only AC-19 source projection prerequisite. It admits only schema- and byte-digest-valid decision sidecars, excludes proposed/superseded records, checks supersession, and returns typed unresolved findings for malformed pairs or unverified waivers. Accepted v2 module sidecars name sorted OKF module IDs explicitly and become effective only for those IDs after physical-map validation, per the PO's 2026-09-27 decision. Historical Markdown and unscoped v1 module decisions remain visible warnings without inferred authority. A matching projection digest is not itself proof that two native runner sessions consumed the decisions; task-path resolution, productive bootstrap wiring and inherited-authority binding remain separate.
- `plugins/pipeline-core/lib/organization-architecture-source.mjs`: #9-owned admission boundary for a signed, fresh organization/team ADR reference set. It validates exact source shape, applicability IDs, supersession and an independently supplied trust anchor before returning bounded references.
- `plugins/pipeline-core/lib/organization-architecture-source-store.mjs`: Read-only physical #9 source loader. It distinguishes no configured registry from a present but unauthenticated one, verifies the registry against the project's independently configured PO trust anchor, and reads separately signed source bytes only from the private Git common-directory store. Missing mandatory authority blocks; missing optional guidance remains visible. The AC-19 continuity reader consumes this result.
- `plugins/pipeline-core/scripts/architecture-inherited-sources.mjs`: Human-attended prepare/apply/inspect CLI for the exact PO-signed registry, with a previous-byte-digest CAS and readback. It does not create organization/team source signatures or waive inherited authority.
- `plugins/pipeline-core/lib/architecture-decision-continuity.mjs`: AC-19's new read-only composition of physically validated project ADRs with #9's configured inherited references. Its digest binds source revisions for parity; a same-ID authority conflict blocks unless an exact, PO-signed, scoped and unexpired waiver names the inherited decision. Shared bootstrap and implementation-entry readers now consume it; a fresh two-runner parity receipt and semantic Critic review remain open.
- `plugins/pipeline-core/lib/architecture-decision-waiver-store.mjs`: Read-only, PO-signed project exception source. An exact waiver can name the original inherited decision digest and governed module; expiry and unsigned mutation cannot silently authorize a deviation. A waiver never resolves two conflicting inherited authorities, and semantic conformance still belongs to review.
- `plugins/pipeline-core/scripts/architecture-effective-decisions.mjs`: Read-only exact-root CLI for the source projection. It accepts either an explicit governed module area or one normalized task path, resolving the latter through the current OKF ownership map before selecting decisions; unowned or ambiguous paths are typed errors. It returns a typed nonzero unresolved result without mutating the ADR estate or claiming runner-session parity. The implementation-entry reader also projects the active plan's owned paths to module decision readbacks, retaining unowned paths and historical ambiguity as visible diagnostics rather than inventing authority or blocking a valid architecture deferral. The sanctioned design-to-implementation transition displays a compact summary of those scoped decisions after a successful State change, so agents can inspect the applicable records before writing code.
- `plugins/pipeline-core/scripts/finish-feature.mjs`: Explicit feature-close driver over the durable coordinator; interrupted runs require an exact lifecycle ID to resume. A lost final process response can be resolved read-only against the closed State, coordinator and audit references without a duplicate close; this never implies release authorization.
- `plugins/pipeline-core/lib/execution-plane-contract.mjs`: Preserves `succeeded-unverified` after a real worker return; a separate exact-result, exact-output verifier receipt is required before a state can become `verified`.
- `plugins/pipeline-core/scripts/execution-plane-launch.mjs`: Runs the bounded real-child fixture path; host readback of workspace bytes and the supervisor change manifest supplies the success verifier evidence before scheduling completion.
- `plugins/pipeline-core/lib/critic-course-admission.mjs`: Derives the Critic review round and correction budget from registered, immutable candidate evidence and the exact Git range; caller-supplied counters cannot grant admission.
- `plugins/pipeline-core/scripts/critic-dispatch-preflight.mjs`: Reads the candidate's retained Critic course before a new review is launched and rejects stale parents or exhausted courses.
- `plugins/pipeline-core/scripts/session-critic-finalizer.mjs`: Admits and persists an exact claimed Critic packet before a fresh session starts, then finalizes only that existing admission after a validated return.
- `plugins/pipeline-core/scripts/codex-critic-session-route.mjs`: Resolves both direct Codex high-risk Critic hosts from valid V3 duty authority plus an optional trusted current-session role receipt. Missing or malformed optional selection retains the V3 route; a selected model changes the bound source digest so selected/native packet readback detects receipt drift. A native selection prepared elsewhere must use this exact route; its producer is not supplied by this resolver.
- `plugins/pipeline-core/scripts/verify-evidence-producer.mjs`: Produces exact-candidate Verify evidence. An explicitly Critic-bound full `candidate` or `release` run checks the consumed review packet before replacing prior evidence, then records the private Critic/Verify lifecycle readback; same-candidate reruns must revalidate that prior evidence and review. It may carry a consumed review to a later candidate only across an exact Git range of immutable, feature-package-registered evidence-only commits; a source-changing commit is never carried. An unbound `candidate` run remains diagnostic and is not final review admission.
- `plugins/pipeline-core/lib/critic-verify-lifecycle.mjs`: On readback, rederives the lifecycle identity and independently checks its Critic fields against the consumed private packet and its Verify fields against exact passing candidate evidence. The v2 carry-forward receipt also rederives its reviewed-to-target Git range and manifest binding, so a shaped private receipt or later edit cannot turn an unbound diagnostic Verify into a reviewed qualification.
- `plugins/pipeline-core/lib/critic-verify-readiness.mjs`: A read-only candidate consumer recognizes only exact green Verify evidence whose private Critic/Verify lifecycle revalidates against the consumed review packet. Diagnostic Verify remains visible but cannot clear the final-candidate wait.
- `plugins/pipeline-core/scripts/check-critic-bound-verify.mjs`: Checks the current physical Git checkout and canonical Verify evidence through that consumer, returning a typed, non-authorizing result for installed local-candidate readiness. The readiness reader checks the producer's public `verifyRun.status`, not an internal `terminalStatus` input field; the real-Git candidate fixture proves a green carried review is admitted and a later source commit is rejected.
- `plugins/pipeline-core/scripts/check-protected-delta.mjs`: Compares a candidate Git diff with the shipped protected baseline. An unreadable baseline yields `unavailable` and never a misleading `pass`, even when no protected path can be classified.
- `plugins/pipeline-core/scripts/close-coordinator.mjs`: Its feature-close preparation and replay require that revalidated Critic/Verify lifecycle alongside the audit bundle; a forged or unavailable consumed packet refuses closure before a new bundle or State transition.
- `plugins/pipeline-core/scripts/design-advisory-admission.mjs`: Its read-only inspect rechecks the current exact human decision for a stored Advisor-unavailable exception, then binds the same public bytes to the immutable private transaction and source receipt. An earlier write-time approval claim alone cannot make later inspection pass. For an answered Claude consult fallback, the admission retains `nativeAvailable: true` when the native route was tried and failed; it does not misclassify the successful adapter as native. A v2 private transaction also binds the host-observed native-then-consult attempt trail byte-for-byte. That local trail is not provider attestation or a final PO approval, and the unavailable pre-approval package path remains open.
- `plugins/pipeline-core/scripts/design-advisory-coordinator.mjs` and `lib/design-advisory-coordinator-v2.mjs`: The productive default is the durable five-source initial Advisor course. The historical transaction/attempt-trail route is explicitly selected with `--legacy-v1`; it is diagnostic context, not current final-package approval. Codex retains independently observed answered or failed host evidence. Claude/Agy currently retain a proved zero-child unavailable initial course through `native-initial-advisor-execution.mjs`; this does not assert a genuine answered native initial call. Substantive successors require a parent-bound owner decision, reject decision reuse, and remain bounded by the course cap.
- `plugins/pipeline-core/lib/design-workflow-package.mjs`: Fail-closed validator and physical repository reader for the proposed single-final-approval package. It binds exact source/evidence bytes, regular non-symlink file identity, candidate identity before and after the read, fresh independent readiness, Advisor receipt/disposition and exhausted-route trail; duplicate JSON keys, aliases, symlinks and oversized inputs fail. It returns a bounded PO-review projection that exposes the complete source inventory, readiness findings/choices and Advisor disposition/exception while explicitly remaining pending approval and non-authorizing. Integration with the one `approve-plan` authority write and implementation boundary is still absent.
- `plugins/pipeline-core/scripts/critic-packet-preflight.mjs`: The private consumed-receipt reader compares the receipt record to the consumed journal state before downstream Verify or portable export can treat it as review evidence; a changed receipt file alone cannot mint a new verdict. This local readback does not replace independent Critic execution.
- `plugins/pipeline-core/lib/portable-agy-authorship-export.mjs`: Prepares a redacted Agy authorship subject only after the local Git-backed verifier reaches PASS with independently read private host and Critic evidence. Its clone reader checks physical committed export bytes, the authored Git commit/parent/tree/paths and a detached PO proof against the trust anchor already committed before that Agy commit. When a public v4 record is present, it additionally binds the exact physical and committed record bytes to the signed record digest and checks model, effort, route policy and report consistency; both authorship and repository-wide Critic coverage consume that portable readback. It does not claim provider model attestation, sign a proof, publish the export or replace a real provider-backed qualification run.
- `plugins/pipeline-core/lib/portable-critic-export.mjs`: Derives a redacted export subject only from one consumed, candidate-bound private Critic packet, then binds its signer-visible request and clone-side detached-signature validation to the committed plan, Spec and trust anchor. The pure contract cannot mint a passed review from caller prose, publish a file, authenticate a caller-chosen anchor or activate the final inventory gate.
- `plugins/pipeline-core/scripts/portable-critic-export.mjs`: Against a clean immutable candidate, derives the private Critic export request, rechecks it immediately before signing, and publishes only a detached-proof-verified canonical export at the fixed evidence path. It reuses the exclusive inode-checked publication primitive and never signs, activates an inventory, pushes or releases by itself. The final inventory checker consumes the committed export only in its narrow post-review activation transition.
- `plugins/pipeline-core/scripts/portable-agy-authorship-export.mjs`: Prepares an exclusive local PO signing request only after that local PASS. Its read-only `check` mode rederives the request for the human signer immediately before signing; a shaped request alone is insufficient. After detached-proof verification against the committed parent trust anchor, it publishes the exact redacted export exclusively. Publication is inode-checked and does not commit the export, perform the human signing ceremony or turn host observation into provider attestation.
- `plugins/pipeline-core/lib/model-role-session.mjs`: Pure functional-role selection, exact dispatch binding and one-session non-authorizing mapping readback for host-owned receipts. The readback includes previous and selected exact model IDs, policy identities, selected compatibility-evidence digest, bootstrap candidate and selected receipt digest; the first mapping or a changed mapping needs one acknowledgement bound to that exact displayed receipt, even when the model name is unchanged. Bootstrap selection and subsequent admission both require the caller's entire declared configured route set; a missing or extra role is refused. An unchanged later-session mapping needs no repeat acknowledgement. Compact cannot mix reused and freshly selected routes. Pure Codex `model/list`, Antigravity `agy models`, Anthropic API page and Claude Code `modelUsage` parsers admit only complete, well-formed observations; API-credential availability remains expressly distinct from Claude Code host availability, and no parser infers roles from display names. The caller must authenticate the configured set, catalogue producer and acknowledgement event; no provider discovery, policy approval, or trusted storage is supplied by this module.
- `plugins/pipeline-core/lib/model-role-route-source.mjs`, `model-role-host-observations.mjs`, `model-role-host-identity.mjs`, `model-role-approved-policy.mjs`, `model-role-v3-baseline.mjs`, `model-role-host-session.mjs`, `model-role-host-store.mjs`, `model-role-dispatch.mjs`, `scripts/model-role-bootstrap.mjs` and `scripts/model-role-dispatch-select.mjs`: Project V3 tasks onto PO-approved functional roles, leaving V3-unavailable routes visible but nonlaunchable. A session observes only its installed runner's complete active route set; other runners need not be installed or authenticated. Repeated Claude aliases are deduplicated, while API-only Claude availability and incomplete observations fail closed for admission of a new exact model. Session identity reads the runner's native Codex/Claude environment or an Agy host hook key, never an invented bootstrap ID. A signed exact-model policy binds the full task source and every active role/effort slot of the installed runner to an explicit PO proof and trust anchor; it need not approve absent runners, and later ordinary commits do not revoke it. The PO-approved concrete V3 IDs also form a narrowly scoped initial baseline once the installed host observes the exact ID and effort; a floating alias or newly discovered ID cannot enter through that exception. The private session store pins the authority source and rechecks either the signed policy against the trust anchor or the exact V3 baseline against the current governed registry on each read. The attended current-runner bootstrap command composes identity, policy or V3 baseline, observations, one exact human confirmation and private session publication; a later unchanged mapping reuses the prior readback without a second prompt. The normal pipeline-start skill now calls it, and the Agy hook surfaces its exact session locator ephemerally. A pre-packet selector reads the private store afresh and emits only an admitted selected model or an explicit legacy-V3 result for the current task and runner. Missing or corrupt optional model-role state or derived role source produces a visible diagnostic and V3 fallback without admitting the corrupt receipt; only an invalid underlying V3 source or a V3-unavailable task remains nonlaunchable. The productive Agy implementation route consumes the store when that session has published a role receipt; historical sessions remain on their V3 selector. The normal Codex Critic packet producer now selects before sealing and binds the admitted receipt into its route digest. The shared fresh-session Critic finalizer checks Codex/Claude model and effort against the selected task before packet creation. Other direct packet producers, independent trigger/risk classification, and installed-host bootstrap still need proof or wiring, so this is not yet active all-runner model resolution.
- `plugins/pipeline-core/lib/claude-model-host-observation.mjs`: Optional isolated, repository-free, tool-free Claude Code alias probe. A successful JSON result with exactly one `modelUsage` ID yields a local host-observed model fact, not provider attestation or a complete account catalogue. Authentication failure and ambiguous usage remain unavailable; this preparatory helper is not wired into session bootstrap or route approval.
- `plugins/pipeline-core/lib/anthropic-model-catalogue-host.mjs`: Bounded, paginated `GET /v1/models` observer with credential-redacted results and no repository payload. Its output proves only availability to the supplied Anthropic API credential, not the installed Claude Code OAuth account or role compatibility. It is not wired into bootstrap or policy approval.
- `plugins/pipeline-core/scripts/session-critic-finalizer.mjs`, `codex-critic-host.mjs` and `critic-packet-preflight.mjs`: The shared fresh-session Critic selects a qualified exact model before sealing the packet, carries its host readback and receipt digests in the private session binding, and rejects a mismatch with the sealed route. Finalization compares the returned review with that prelaunch model binding without selecting again or comparing it to the superseded V3 model ID. Missing, throwing or malformed optional model-role selection retains an independently valid V3 Critic route without claiming a new model; a valid new selection does not mutate an already sealed packet. A broken V3 source is a separate authority failure, not an optional-selection fallback.
- `plugins/pipeline-core/scripts/advisory-host-bridge.mjs` and `lib/advisory-coordinator.mjs`: The host-managed Codex Advisor resolves its independently valid V3 duty before optional session-role selection; the selected route digest binds its child source and missing optional selection keeps V3. For Claude, native Opus remains unchanged; after native failure only, the host reads the current private session's separate Frontier fallback, reconstructs a `pipeline.advisory-demand.v3` without persisting the session ID, and binds the selected model/effort and readback digests through consultation reuse, child payload and receipt. A missing or defective optional selection reconstructs ordinary V2 demand and retains the registered V3 consult route. The coordinator rejects v3 selection/demand/receipt drift before an adapter; observed provider/model/effort must still match the selected route.
- `plugins/pipeline-core/lib/model-role-route-source.mjs`: Explicit PO task-to-role projection against the committed V3 route cells, including the newly registered pure-read duty. It rejects a missing, extra or conflicting route instead of silently omitting it; a runner-scoped view feeds bootstrap while the complete source stays bound by policy. Selector names never infer roles.
- `plugins/pipeline-core/lib/verify-suite-append-policy.mjs`: Pure B2-ii transition check. A protected declarative Verify registration may append new unique entries, but cannot remove or change earlier suite coverage; the harness checks the actual postimage and committed TP-13-era history.
- `plugins/pipeline-core/lib/dispatch-record.mjs`: Closed v3/v4 evidence contract and shared durable-report validation. V4 accepts a bounded multiline report matching the Agy Final Return envelope; private host paths, CR and NUL are rejected before the host commit path can use the return.
- `plugins/pipeline-core/lib/critic-disposition-addendum.mjs`: Validates an exact record-byte, task, dispatch candidate, review candidate and evidence-digest binding for an immutable Critic-required v4 record, whether non-authoring or authored. Coverage also requires a passed, consumed, task-bound private Critic packet referencing the same Git blob bytes; the addendum alone cannot prove review.
- `plugins/pipeline-core/scripts/dispatch-record-write.mjs`: Exclusively publishes validated v4 dispatch records and host-only Critic addenda after physical record/evidence readback; a Critic addendum cannot overwrite or mutate its source record and does not by itself attest a passed review. Its distinct host-observed Agy entry invokes independent private receipt, consent, result and Git readback before writing an authored v4 record; the public JSON/object entries still reject that model claim.
- `plugins/pipeline-core/lib/pipeline-commit.mjs`: Structured staged-only commit *preview* with a proposed canonical Dispatch trailer derived from a physical record; Git subprocesses ignore ambient repository/index overrides. Execution fails closed because a caller-selected record cannot prove the live dispatch. The productive Agy implementation uses the separate host-owned post-return commit and exclusive v4 publication path.
- `plugins/pipeline-core/scripts/pipeline-commit.mjs`: Closed argv entry point for the non-authorizing structured preview; rejects caller-supplied attribution and shell-multiline values. `--execute` reports `PC-HOST-CONTEXT` until a host-bound route exists.
- `plugins/pipeline-core/lib/main-session-route.mjs`: Reconciles a host-observed main-session model with registered routing. A future functional-role cell needs a matching host-held receipt; the current V3 exact-ID routes remain unchanged.
- `plugins/pipeline-core/lib/agy-final-return.mjs`: Defines Agy's schema-constrained implementation return and independently validates the exact dispatch, candidate, outcome, durable v4-compatible report and changed paths. A changed path must round-trip through the v4 authorship reader as the same literal path. Its closed role mapping preserves either `goldfish-implementor` or `goldfish-mechanic` from the sealed packet through precommit validation, private host receipt and public v4 record; an unknown or changed role fails closed. Its preflight checks the static v4 shape and independently derived path triggers before a possible host commit; the post-commit draft also checks the internal model witness against session, consent, route, result digest and host-readback commit/parent/tree/path set without publishing. These object-level checks do not attest witness provenance or authorship by themselves.
- `plugins/pipeline-core/lib/agy-host-observed-receipt.mjs`: Builds and validates the proposed local Agy host-receipt subject against exact authored-record bytes, internal model witness, consent scope, result-file identity and read-back Git commit. A valid object is not provenance: no private physical store, independent result/consent readback, writer admission or portable export is supplied by this contract alone.
- `plugins/pipeline-core/lib/agy-host-observed-store.mjs`: Exclusively writes bounded Agy host-receipt bytes under a caller-supplied physical Git common directory and reopens them without following target aliases; changed record bytes, duplicate JSON keys and mismatched receipt fields fail readback. The store returns `not-yet-independently-verified`: it does not authenticate the caller's common-directory source or independently validate consent, result and Git history, so its contents alone cannot authorize an authored v4 PASS.
- `plugins/pipeline-core/lib/agy-host-observed-local-readback.mjs`: Derives the physical private store from the primary repository, then reopens the descriptor, signed consent, exact result file and Git commit/parent/tree/paths before reporting a local host-observed binding. A fresh clone without the private receipt remains unverifiable. The distinct host-only writer and the Git-backed authorship reader call this verifier; it creates neither portable nor provider-attested authority.
- `plugins/pipeline-core/lib/agy-host-commit-admission.mjs`: Captures a clean Git baseline before Agy runs and admits only a host-observed diff that exactly matches the validated final return and consent paths, including the clean-filtered Git blob IDs at admission; it does not stage or commit. Before a completed-undelivered record, its physical-root Git observation refuses a changed or unreadable HEAD instead of declaring no commit.
- `plugins/pipeline-core/lib/agy-host-commit-execution.mjs`: Requires the host's prior post-return admission, rechecks its path/blob binding, stages only that Agy diff, refuses staged blob drift, executes normal Git commit hooks, and checks the authored commit's parent, tree, paths and exact message. Its exact `Agy-Host-Observed: v1` trailer only routes a clone with missing private evidence to `UNVERIFIABLE`; it never proves authorship. A final HEAD recheck catches a competing commit during readback; full post-return transaction isolation still belongs to the later host coordinator. A timeout or a changed/unreadable HEAD after a failed process response stays recovery-required instead of being called no-delivery. This host-only step does not publish a v4 dispatch record or claim delivery.
- `plugins/pipeline-core/hooks/native-goldfish-host.mjs` and `plugins/pipeline-core/lib/native-goldfish-host-finalizer.mjs`: The explicitly marked Claude Task and Codex `spawn_agent` routes bind runner-native start/return events to private prelaunch state, validate the exact final and model/session identity, admit only the returned diff against the allowed paths, perform a normal-hook Host-Commit, persist a private observation, then publish the authored v4 record last. Failures do not claim authorship; missing private evidence in a fresh clone remains `UNVERIFIABLE` until a separately approved signed export exists. Host observation is not provider attestation.
- `plugins/pipeline-core/lib/native-goldfish-host-return.mjs`, `native-goldfish-host-state.mjs`, and `native-goldfish-host-observation.mjs`: Closed contracts for the exact prompt binding, Claude PostToolUse / Codex SubagentStart-Stop correlation, and local-only receipt readback. A Codex pending start is consumed once by its exact association, and an unstarted entry expires after the bounded start window so stale state cannot poison later work. Ambiguous Codex fan-out cannot be correlated and receives no host commit; the hooks do not claim provider-signed model identity.
- `plugins/pipeline-core/lib/goldfish-commit-command-flow.mjs` and `plugins/pipeline-core/scripts/goldfish-commit-command-flow.mjs`: Read-only legacy Goldfish fallback that renders two separately executable, exact-path Git argv commands with escaped message values and checked final-trailer shape. It neither executes Git nor claims that caller-provided task identity is host-authenticated. Marked native-host tasks must not use it.
- `plugins/pipeline-core/scripts/agy-undelivered-record.mjs`: Publishes distinct exclusive v4 non-authoring observations: completed-undelivered has no result digest or report; interrupted-before-Final uses `stopped-without-commit` with a bounded host-authored report, attempt identifier, sanitized reason and mandatory Critic review. Both recheck the writer receipt against the exact serialized record bytes and target. Neither attributes a commit or delivered child result.
- `plugins/pipeline-core/scripts/agy-host-observed-finalize.mjs`: Rechecks the sealed live-host admission, current consent and exact result bytes; then executes the normal-hook Host-Commit, persists a private host-observation receipt and invokes the independent-readback host-only v4 writer in that order. Any post-commit failure returns a typed recovery state with the observed commit OID, never a no-commit claim.
- `plugins/pipeline-core/scripts/goldfish-antigravity-live-host.mjs`: Loads attended consent, runs the schema-bound Agy session, rechecks consent after return, rereads the exact host-written result bytes and observed model through a bounded descriptor, then applies Git-diff admission. The internal admission carries the report text only from that verified readback and preflights the complete authored v4 shape with a conservative, path-derived Critic-required decision before any host commit; the outer receipt omits the report. Result readback binds the exact Final Return outcome even for `failed`/`blocked`, so a delivered non-success result is held for recovery rather than falsely called undelivered. A completed call without a delivered Final Return publishes a completed-undelivered v4 record only after model and unchanged-HEAD checks. A process observed as started and fully closed before any transport result or Final Return instead publishes a distinct Critic-required `stopped-without-commit` v4 host observation only after unchanged-HEAD readback; its model remains unknown unless actually observed. A transport result followed by failure, an unclosed or malformed stream, contradictory Final Return, changed HEAD or failed publication stays recovery-required. The call count alone does not prove a process started or provider execution. An admitted successful final is passed only internally to the Host-Commit finalizer.
- `plugins/pipeline-core/scripts/elephant-agy-implementation-dispatch.mjs`: The productive route selects an admitted model from the current Agy session's private host store before sealing scope and consent; its route digest binds that session receipt and the original V3 route policy. An absent or defective optional store retains the exact V3 route with a typed diagnostic; it cannot authorize a replacement model, and consent is checked against the route actually sealed. The sealed outer receipt preserves recovery states and reports only `host-observed-model`, not provider attestation. A terminal host claim with a missing/mismatched model or a missing, nonintegral or zero model-call count becomes recovery-required before the outer route can announce it. The real sealed host's validated final reaches the Host-Commit finalizer before any authored success receipt; an unexpected host exception or launched-but-nonfinal result stays recovery-required with a static code and no private diagnostic text.
- `plugins/pipeline-core/scripts/elephant-implementation-dispatch.mjs`: The public Elephant selector invokes only the sealed Antigravity route and never silently falls back. A selected route exception, invalid response, or nonfinal response after a model call is reported as recovery-required, not as a safe rejection or retry.

## Verification
- `node --test plugins/pipeline-core/lib/advisory-lifecycle-v2.test.mjs plugins/pipeline-core/lib/advisory-coordinator.test.mjs plugins/pipeline-core/lib/advisory-receipt.test.mjs`
- `node --test plugins/pipeline-core/scripts/advisory-host-bridge.test.mjs`
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
- `node plugins/pipeline-core/lib/model-role-host-session.test.mjs`
- `node plugins/pipeline-core/lib/model-role-host-observations.test.mjs`
- `node plugins/pipeline-core/lib/model-role-host-identity.test.mjs`
- `node plugins/pipeline-core/lib/model-role-approved-policy.test.mjs`
- `node plugins/pipeline-core/scripts/model-role-bootstrap.test.mjs`
- `node plugins/pipeline-core/scripts/model-role-dispatch-select.test.mjs`
- `node plugins/pipeline-core/lib/model-role-host-store.test.mjs`
- `node plugins/pipeline-core/lib/model-role-dispatch.test.mjs`
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

## Alfred governance and lifecycle registration

Enrollment retirement preserves byte-exact archived generations and advances
monotone transaction phases through the real onboarding, consent, runtime and
plan-state owner APIs. Explicit local Git creation requires attended digest
confirmation and preserves foreign scopes. Nine project/plugin schema mirrors
and the coordinator belong to the never-liftable kernel; protected writer/guard
integration and native qualification require their own final Source evidence.

The public governance scope gates hook entrypoints before project authority is consulted. Project activation follows the admitted lifecycle action. Uninstall validates retirement scope and removes only exact owned runtime projections; topology refresh binds physical project and current runtime readback. These contracts preserve signature and private-state boundaries.

## Scanner diagnostic sidecar

The Semgrep adapter observes only its existing child. The security producer
reuses canonical evidence-root and executable/candidate bindings. The closed
diagnostics helper exposes no verdict authority; safe Linux publication requires
procfs-anchored owned directories and trusted same-UID cooperating publishers.
Unsupported publication and unavailable local-rule provenance remain explicit.
The exclusive staging inode stays held through rename/readback/fsync; leftover
staging is busy, not automatically reclaimed. No rename-CAS or hostile-UID
isolation is claimed. The global ADR draft records PO-approved implementation
and defers formal numbering/accepted status under ADR-0069.

## Initial Advisor, Readiness and retirement custody

The v2 package reconstructs the initial Advisor course and current structured
disposition before preparing Readiness. The distinct supplemental runtime
context is untrusted input, not a sixth normative source. Codex and native
Readiness readers bind the actual submitted request against the private host
receipt; later material disposition changes invalidate that binding. Local
receipts do not attest a provider or effective model. Final approval and the
protected main writer require their own delivered, candidate-bound evidence.

Governance common Git config remains the current decision authority. Only an
explicit sanctioned decision publishes the separate private positive witness;
it can preserve an unverifiable-active diagnosis after control damage, never
grant active or declined state. Older unreadable decisions without independent
provenance require explicit recovery. Observation never writes a migration.
Uninstall removes exact manifest-proved workspace elements and rechecks resume
postconditions; edited hook or plugin metadata is an ownership conflict.
