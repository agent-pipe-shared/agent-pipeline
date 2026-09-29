# Guard Maintenance Window threat model

Status: normative security input for the Nova baseline. Sibling document to
`docs/human-guard-override-threat-model.md` (the "HGO" single-tool-call
attended override) — a structurally different mechanism, not a variant of it,
so it gets its own threat model rather than a shoehorned section. See
[ADR-0058](adr/0058-guard-maintenance-window.md) for the decision this
document supports.

## Purpose and security boundary

A Guard Maintenance Window (GMW) is a bounded-duration, PO-signed record that
a small, closed set of self-protecting guard rules (GS-6, the live plugin
root; TP-*, configured protected test paths) must honor as an alternative
"allow" path, in addition to their existing unconditional deny. It does not
grant ambient authority over anything else: not push, not publication, not the
files that decide a gate's own strength (GS-1, GS-2, GS-3, GS-4, GS-5, GS-7),
not `.git`/`.codex`, not secrets.

The trusted computing base is: the loaded `pipeline-core` manifest and its
guard scripts, the GMW library and CLI, the physical repository and Git
common-directory identity, the committed trust anchor
(`project/critical-human-proof.json`), and the PO who reviews a prepared
request's digest and signs it on a device the agent does not control.

The model does not treat an agent instruction, an environment variable, a
free-form guard prefix, or possession of a request digest as PO authority —
identical to HGO's own boundary.

## Checkpoint-push lane boundary

The opt-in feature-branch checkpoint lane is documented in
[`specs/sprint-nova-epic/implementation/feature-checkpoint-push-policy.md`](../specs/sprint-nova-epic/implementation/feature-checkpoint-push-policy.md).
It is a separate, lower-rigor backup path, not a Guard Maintenance Window
capability and not a signature or release authorization. Its eligibility
boundary is deliberately narrow: a valid
`pipeline.push-destination-policy.v1`, an explicit same-ref source and
destination inside the configured `refs/heads/feat/` namespace, a clean
candidate, and exactly one bounded `Checkpoint-Intent` trailer. The guard
rechecks that binding and writes a local attempted-delivery audit before the
network action; audit failure blocks the action.

All other destinations and malformed or absent policies remain on the existing
strict publication path. The checkpoint lane does not bypass publication,
release, security, Verify, Critic, marketplace, approval, or signature gates
when a feature branch is later promoted. The linked policy artifact records
the operational detail. The machine-readable Git-boundary model at
[`specs/sprint-nova-epic/implementation/git-boundary-threat-model.json`](../specs/sprint-nova-epic/implementation/git-boundary-threat-model.json)
is the current policy revision for this lane: it records the
`feature-checkpoint-push` boundary, the authority-confusion and unrecorded-
delivery threats, and the exact-ref and pre-network-audit mitigations. A
detached threat-model approval request must bind that revision and the exact
delivery candidate before the policy can be treated as approved for a protected
action; the model alone is never an approval.
disablement/rollback and names an owner plus expiry for every deferred risk.

## What makes this different from HGO, and why that matters here

HGO's activation step, once a request is planned, is an ordinary command a
ready agent session can run itself; what makes it a real gate in `signature`
mode is that it is *never admitted at all* there (`guard-testpath.mjs`,
`overrideAdmitted`). GMW has no equivalent step to admit or refuse: the
guard's allow path is "a validly-signed, unexpired, correctly-bound window
record exists," full stop — there is nothing for an in-session command to
arm. This is the central property this whole design depends on; every threat
below assumes it holds and is written to catch a change that would break it.

## Protected assets

- The unconditional-deny behavior of GS-1 through GS-5 and GS-7 — never
  reachable through this mechanism, regardless of what a signed payload
  claims to name.
- The never-liftable kernel: `hooks/guard-gate-strength.mjs`, the GMW
  verifier module, `hooks/hooks.json`, `lib/tool-write-target.mjs`,
  `hooks/guard-command-grammar.mjs`, `hooks/guard-lifecycle-ready.mjs`,
  `lib/guard-devplan-policy.mjs`, `project/critical-human-proof.json` (the
  trust anchor), and
  `lib/critical-human-proof-policy.mjs`/`lib/po-approval-proof.mjs` (the two
  modules that verify a window and every push/deploy/publication/
  release-preflight proof). The kernel must be closed under import, not just
  these entries' own bytes — a valid window could otherwise reach the same
  code through one first-party import hop, exactly the recursive hole this
  list exists to close. NVA-A7FIX-2 replaced the hand-walked, twice-incomplete
  version of that closure with a test-enforced one
  (`guard-maintenance-window-kernel-closure.test.mjs`, GMWKC01): every path
  below is imported, directly or transitively, by one of the entries above,
  and the test fails on any future edit that adds an import without extending
  this list to match. All paths are repo-relative under
  `plugins/pipeline-core/`, listed in the SAME order as
  `NEVER_LIFTABLE_KERNEL_PATHS` (`lib/guard-maintenance-window.mjs`) so the
  two can be diffed at a glance
  (`pipeline.gwm-kernel-doc-enumeration-diverges-from-the-code-array`,
  2026-08-25 -- 13 entries were previously present in the code array with no
  mention here): `lib/chat-gate-ceremony.mjs`,
  `lib/codex-host-layout.mjs`,
  `lib/codex-onboarding-app-server.mjs`,
  `lib/codex-onboarding-capabilities.mjs`, `lib/codex-onboarding-runtime.mjs`,
  `lib/continuity-host-adapter.mjs`, `lib/continuity-state.mjs`,
  `lib/continuity-status.mjs`, `lib/critic-export-policy.mjs`,
  `lib/commit-message-policy.mjs`,
  `lib/critic-route-v3.mjs`,
  `lib/critic-skip-decision.mjs`,
  `lib/critical-action-approval-request.mjs`, `lib/document-hooks.mjs`,
  `lib/dispatch-record.mjs`,
  `lib/entrypoint.mjs`, `lib/feature-package-topology.mjs`,
  `lib/gate-estimate.mjs`, `lib/git-cmd.mjs`,
  `lib/human-guard-override.mjs`, `lib/human-role-labels.mjs`,
  `lib/machine-plane.mjs`, `lib/manifest.mjs`, `lib/onboarding-continuity.mjs`,
  `lib/plan-spec-state-v2.mjs`, `lib/po-key-directory.mjs`,
  `lib/po-gate-authority.mjs`,
  `lib/po-gate-profile-publisher.mjs`, `lib/private-boundary.mjs`,
  `lib/project-authority.mjs`,
  `lib/project-onboarding-ready-gate.mjs`, `lib/project-onboarding-v3.mjs`,
  `lib/protected-test-paths.mjs`, `lib/publication-authority.mjs`,
  `lib/publication-bundle.mjs`, `lib/publication-bundle-v2.mjs`,
  `lib/publication-capability-preflight.mjs`, `lib/rebase-authority.mjs`,
  `lib/recovery-preview-attestation.mjs`,
  `lib/repository-path-identity.mjs`, `lib/review-economy.mjs`,
  `lib/runner-native-continuation.mjs`,
  `lib/runner-profile-migration-v2.mjs`,
  `lib/runner-profile-migration-v3.mjs`, `lib/runner-profiles-v2.mjs`,
  `lib/runner-profiles-v3.mjs`, `lib/runtime-projection-v2.mjs`,
  `lib/runtime-projection-v3.mjs`, `lib/schema-lite.mjs`,
  `lib/signed-quality-package.mjs`,
  `lib/session-cleanup-recovery.mjs`, `lib/source-observation.mjs`,
  `lib/successful-spawn.mjs`, `lib/windows-private-state.mjs`,
  `lib/worktree-lifecycle.mjs`,
  `lib/yaml-lite.mjs`, `scripts/codex-app-server-health.mjs`,
  `scripts/continuity-status.mjs`, `scripts/pipeline-state.mjs`,
  `scripts/po-gate-profile-repair.mjs`, `scripts/project-onboarding-v3.mjs`,
  `scripts/settings-allowlist-merge.mjs`,
  `scripts/publication-close-journal.mjs`, and
  `scripts/v3-bootstrap-authority.mjs`. A second closure gap (VFX2-GMW,
  `sprint_phoenix` merge, 2026-08-26) added: `lib/agent-decision-journal.mjs`,
  `lib/authority-revision-proof.mjs`, `lib/control-execution-exchange.mjs`,
  `lib/control-execution-lifecycle-event.mjs`,
  `lib/decision-reference-dual-evaluation.mjs`, `lib/external-push-ledger.mjs`,
  `lib/governance-action-artifact.mjs`, `lib/governance-action-events.mjs`,
  `lib/governance-gate-action.mjs`,
  `lib/governance-recovery-reconciliation-action.mjs`,
  `lib/governance-event-store.mjs`,
  `lib/governance-event.mjs`,
  `lib/guard-authority-ledger-intake.mjs`, `lib/guard-handoff-offer.mjs`,
  `lib/human-decision-attribution.mjs`, `lib/human-governance-decision.mjs`,
  `lib/human-governance-ledger.mjs`, `lib/human-role-exception-decision.mjs`,
  `lib/lifecycle-governance-events.mjs`, `lib/onboarding-consent-marker.mjs`,
  `lib/threat-model-approval-request.mjs`, and `lib/threat-model.mjs`. A third
  closure gap (NVA-KERNELDYN-1, 2026-08-27 — `pre-push-hook-install.mjs`'s
  dynamic `import()` edges, resolved via a declared table rather than the
  static scanner, plus two unrelated pre-existing gaps GMWKC01 found already
  open) added: `hooks/guard-dispatch-budget.mjs`,
  followed by `lib/dispatch-budget-core.mjs` in the 2026-09-11 closure refresh;
  the original group continues with `lib/plan-authority-staging-guard.mjs`,
  `lib/security-completeness-gate.mjs`,
  `lib/security-evidence-evaluator.mjs`, `lib/verify-evidence-path.mjs`,
  `lib/checkpoint-push-audit.mjs`, and
  `scripts/pre-push-hook-install.mjs`. A fourth closure gap (NVA-KERNELDOC-1,
  2026-08-27) added: `lib/onboarding-staging-authoring.mjs`, imported by both
  `guard-gate-strength.mjs` (GS-15) and `guard-lifecycle-ready.mjs` — it holds
  the shared predicate that decides when the GS-15 refusal stands down for the
  bootstrap-binding design-package authoring admission, so a window covering
  it would let an edit widen that stand-down. A fifth (NVA-INTAKEARGV-1,
  2026-08-27) added: `lib/onboarding-argv-shapes.mjs`, reached from
  `guard-lifecycle-ready.mjs` through both `project-onboarding-v3.mjs` modules —
  it holds the single declaration of the argv shape the guard admits for every
  mutating onboarding command, so a window covering it would let one edit widen
  that admission for all five commands at once. A sixth closure gap
  (NVA-V22-KERNELCLOSURE, 2026-08-28 — a comment-parsing false positive that
  had been crashing the walk before it reached these edges was fixed in
  `f7bfa43e`, and the closure test then reported this whole family, reached
  from `guard-lifecycle-ready.mjs` and both `project-onboarding-v3.mjs`
  modules above, in one pass) added: `hooks/staleness-check.mjs`,
  `lib/bootstrap-payload-budget.mjs`, `lib/codex-host-plugin-list.mjs`,
  `lib/copy-safe-command.mjs`, `lib/public-core-observation.mjs`,
  `lib/public-core-origin-allowlist.mjs`, `lib/ruleset-source.mjs`,
  `lib/self-application-attestation-gate.mjs`,
  followed in the 2026-09-11 closure refresh by
  `lib/installed-plugin-attestation.mjs`, `lib/provenance-attestation.mjs`,
  `lib/provenance-envelope.mjs`; the original group continues with
  `lib/trusted-tool-resolution.mjs`,
  `lib/verify-selection.mjs`, `scripts/pipeline-start-preflight.mjs`,
  followed in that same refresh by
  `scripts/installed-plugin-attestation-host.mjs`; then
  `scripts/pipeline-update-channel.mjs`, `scripts/po-approval-request.mjs`,
  `scripts/po-human-approval.mjs` (the script the human uses to sign),
  `scripts/dispatch-authorship-verify.mjs` (the dynamically loaded authored-commit check),
  `scripts/portable-agy-authorship-export.mjs` and
  `scripts/portable-critic-export.mjs` (its child-process proof checks),
  plus their non-liftable first-party dependencies:
  `lib/architecture-effective-decisions.mjs`,
  `lib/architecture-decision-continuity.mjs`,
  `lib/architecture-decision-waiver-store.mjs`,
  `lib/organization-architecture-source.mjs`,
  `lib/organization-architecture-source-store.mjs`,
  `lib/native-goldfish-host-observation.mjs`,
  `lib/native-goldfish-host-return.mjs`,
  `lib/native-goldfish-host-state.mjs`,
  `lib/agent-model-registry.mjs`,
  `lib/agy-host-commit-admission.mjs`,
  `lib/agy-host-observed-local-readback.mjs`,
  `lib/agy-host-observed-receipt.mjs`,
  `lib/agy-host-observed-store.mjs`,
  `lib/agy-final-return.mjs`,
  `lib/agy-session-authority.mjs`,
  `lib/agy-session-dispatch.mjs`,
  `lib/antigravity-execution-host.mjs`,
  `lib/critic-disposition-addendum.mjs`,
  `lib/portable-agy-authorship-export.mjs`,
  `lib/portable-critic-export.mjs`, and
  `lib/role-dispatch-preflight.mjs`,
  `scripts/push-gate-satisfiability.mjs`, `scripts/push-prepare.mjs`,
  `scripts/ruleset-freshness.mjs`, and `scripts/ruleset-update-policy.mjs`. A
  seventh gap (NVA-V25-DRIVERKERNEL, 2026-08-29) is a different shape than the
  six above: the closure walk only follows edges FROM a kernel file outward,
  so a module that instead IMPORTS a kernel module is structurally invisible
  to it. `scripts/push-init.mjs` imports `scripts/push-gate-satisfiability.mjs`,
  `scripts/push-prepare.mjs`, and `lib/push-destination-policy.mjs` (all kernel)
  directly, and its own
  code constructs the `signatureCommand` object handed to the PO as the exact
  text of the human-attended push-authorization signature command — the same
  class of artifact `scripts/po-human-approval.mjs` produces. An eighth gap
  (NVA-V26-SIGNINGIMPORTERS, 2026-08-29), the same importer-not-import-target
  shape as the seventh: `scripts/signing-ceremony.mjs` and
  `scripts/po-approval-gate.mjs` both statically import and directly invoke
  `scripts/po-human-approval.mjs`'s `runHumanApproval` (already kernel above)
  — signing-ceremony.mjs's own header states its passphrase prompt "behave[s]
  identically to running po-human-approval.mjs sign-intent directly". A
  corrupted copy of either could substitute or alter what the human is asked
  to confirm/sign, or misreport the outcome, without any other kernel file
  needing to change. Closing this pulled in one further edge —
  `scripts/guard-maintenance-window.mjs`, the CLI wrapper
  signing-ceremony.mjs imports to orchestrate the maintenance-window ceremony
  end to end, whose own first-party imports were already all kernel. A class
  sweep for the same shape elsewhere in the plugin found one more:
  `scripts/guard-human-override.mjs`, the CLI wrapper around
  `lib/human-guard-override.mjs` (already kernel above) that statically
  imports and directly invokes that library's authorize/authorize-by-signature/
  plan functions to arm a Human Guard Override capability — the same
  relationship applied to the HGO ceremony instead of the GMW/push ceremony.
  Added: `scripts/guard-human-override.mjs`,
  `scripts/guard-maintenance-window.mjs`, `scripts/po-approval-gate.mjs`, and
  `scripts/signing-ceremony.mjs`. A ninth gap (NVA-CF-GMWKC-RETRY, 2026-08-29),
  reached transitively: `scripts/project-onboarding-v3.mjs` (already kernel above)
  statically imports `scripts/pre-commit-hook-install.mjs`, which was not yet
  listed. That file's own dynamic `import()` edges (declared in
  `DYNAMIC_IMPORT_EDGES`, since its target directories are install-time-bound
  paths, not literal specifiers the static scanner can read) name
  `scripts/check-protected-path-integrity.mjs`, also not yet listed -- its own
  static imports (`guard-gate-strength.mjs`, `protected-test-paths.mjs`,
  `entrypoint.mjs`) are all already kernel above, so no further hops are needed.
  Added: `scripts/pre-commit-hook-install.mjs` and
  `scripts/commit-msg-hook-install.mjs` and
  `scripts/check-protected-path-integrity.mjs`. The commit-msg installer is
  reached from the same onboarding kernel and dynamically imports the shared
  commit-message policy plus project-authority resolver through install-time
  paths declared in the closure test. An unrelated pre-existing gap
  GMWKC01 found already open at this dispatch's base commit --
  `lib/onboarding-continuity.mjs` and `lib/project-onboarding-v3.mjs` (both
  already kernel above) already imported `lib/onboarding-language-correction.mjs`
  before this dispatch touched anything -- was closed alongside: added
  `lib/onboarding-language-correction.mjs`. A tenth gap (NVA-B-KERNELEDGE,
  2026-09-01): commit `54fb5006` gave `scripts/pre-commit-hook-install.mjs`
  (already kernel above) a fourth dynamic `import()` call site resolving to
  `lib/handover-rotation.mjs` (declared in `DYNAMIC_IMPORT_EDGES`, since
  `PLUGIN_LIB_DIR` is an install-time-bound path, not a literal specifier the
  static scanner can read), used to read the handover-file configuration ahead
  of the commit-size check. Its own only first-party import,
  `lib/project-authority.mjs`, is already kernel above, so no further hops are
  needed. Added: `lib/handover-rotation.mjs`.
- Consumer Verify adds `lib/consumer-baseline-verify.mjs` and `lib/consumer-verify.mjs`, imported by the kernel evidence
  producer, and `scripts/consumer-verify-check.mjs`, the generated adapter's
  dynamic import target. The producer supplies that dispatcher's fixed URL from
  the executing plugin. Both first-party modules are never liftable; the closure
  suite binds the declared dynamic edge to the exported URL and continues to
  reject unclassified dynamic imports. The generated consumer adapter is checked
  byte-for-byte before evidence production; it is not an author-repository asset.
- The 2026-09-12 Nova B closure refresh adds
  `lib/dispatch-budget-binding.mjs`, `lib/dispatch-policy.mjs`,
  `lib/governance-hgo-consumption-action.mjs`, and
  `lib/governance-hgo-consumption-source.mjs`. Already-kernel dispatch-budget
  and HGO enforcement modules import these delegates, so a maintenance window
  cannot rewrite the delegated decision or its durable evidence.
- The 2026-09-18 Nova B candidate promotion and evidence closure adds
  `scripts/capture-evidence.mjs` and `lib/release-promotion-envelope.mjs`.
  `guard-lifecycle-ready.mjs` imports `capture-evidence.mjs` and
  `push-prepare.mjs` imports `release-promotion-envelope.mjs`, so neither
  evidence capture nor candidate release promotion can be altered via a
  maintenance window.
- The 2026-09-20 Alfred candidate architecture adoption, design advisory, and rigor closure adds:
  `lib/advisory-receipt.mjs`, `lib/architecture-adoption-authority.mjs`,
  `lib/architecture-adoption-orientation.mjs`, `lib/architecture-design.mjs`,
  `lib/architecture-map-scaffold.mjs`, `lib/critic-diagnostic-evidence.mjs`,
  `lib/critic-diagnostic-packet.mjs`, `lib/design-advisory-admission.mjs`,
  `lib/design-advisory-enforcement.mjs`, `lib/design-advisory-final-approval.mjs`,
  `lib/design-advisory-transaction.mjs`, `lib/governance-authority-resolver.mjs`,
  `lib/protected-baseline.mjs`, `scripts/architecture-adoption.mjs`,
  `scripts/architecture-fitness.mjs`, `scripts/architecture-remedy.mjs`,
  `scripts/check-clone-provisioning.mjs`, `scripts/generate-architecture-overview.mjs`,
  `scripts/governance-authority.mjs`, `scripts/module-inventory.mjs`, and
  `scripts/rigor-floor.mjs`.
  Guards (`guard-lifecycle-ready.mjs`, `guard-devplan-policy.mjs`, etc.) import these
  delegates to enforce architecture compliance, advisor admission, and rigor floor gates.
- The 2026-09-21 Alfred candidate close audit and critic verification lifecycle closure adds:
  `lib/architecture-entry-readiness.mjs`, `lib/audit-bundle.mjs`,
  `lib/critic-packet-governance.mjs`, `lib/critic-review-lineage.mjs`,
  `lib/critic-verify-lifecycle.mjs`, `lib/feature-close-audit-receipt.mjs`,
  `lib/governance-review-action.mjs`, `lib/organization-policy.mjs`,
  `lib/requirement-traceability.mjs`, `scripts/check-critic-skip-coverage.mjs`,
  `scripts/critic-dispatch-preflight.mjs`, `scripts/critic-packet-preflight.mjs`, and
  `scripts/session-critic-finalizer.mjs`. The finalizer's model-route selection
  is also protected: `scripts/model-role-dispatch-select.mjs` and its
  Antigravity bootstrap target `scripts/model-role-bootstrap.mjs`.
  The intake and Critic admission dependencies reached from those kernel paths
  also remain protected: `lib/onboarding-initial-answers-state.mjs`,
  `lib/onboarding-initial-answers-transaction.mjs`,
  `lib/onboarding-later-language.mjs`, and `lib/critic-course-admission.mjs`.
  Guards and close coordination import these modules to enforce verified feature close audit and critic lifecycle readback.
- The 2026-09-27 design-workflow, model-role and readiness closure adds:
  `lib/design-workflow-package.mjs`, `lib/design-workflow-approval.mjs`,
  `lib/advisory-attempt-trail.mjs`, `lib/model-role-host-session.mjs`,
  `lib/model-role-host-identity.mjs`, `lib/model-role-host-store.mjs`,
  `lib/model-role-route-source.mjs`, `lib/model-role-approved-policy.mjs`,
  `lib/model-role-host-observations.mjs`, `lib/model-role-v3-baseline.mjs`,
  `lib/model-role-session.mjs`, `lib/model-role-dispatch.mjs`,
  `lib/antigravity-model-host-observation.mjs`,
  `lib/claude-model-host-observation.mjs`,
  `lib/codex-model-host-observation.mjs`,
  `lib/design-readiness-host-evidence.mjs`,
  `lib/physical-scratch-boundary.mjs`, `lib/lifecycle-denial-loop.mjs`, `lib/advisory-route-selection.mjs`, `lib/codex-host-output-custody.mjs`,
  `lib/codex-readiness-host-record.mjs`, `lib/codex-host-process-journal.mjs`, `lib/codex-host-process-launcher.mjs`, `lib/codex-host-process-exec-worker.mjs`, `lib/codex-host-process-supervisor.mjs`, `lib/codex-readiness-ownership-verifier.mjs`, `lib/codex-design-readiness-host-store.mjs`, `lib/codex-readiness-finalization.mjs`, `lib/codex-isolated-structured-host.mjs`, `lib/codex-tool-free-design-readiness.mjs`, `lib/design-readiness-hashes.mjs`, `scripts/codex-design-readiness-host.mjs`, `scripts/codex-design-readiness-bootstrap.mjs`, `scripts/tool-identity.mjs`, `lib/advisory-lifecycle-v2.mjs`,
  `lib/sandboxed-readonly-duty.mjs`, `lib/codex-sandbox-compatibility.mjs`,
  `lib/design-readiness-runner-host-store.mjs`,
  `scripts/codex-sandbox-select.mjs`, and `lib/sandbox-failure.mjs`.
  They are imported by protected design approval, readiness, or model-route
  entry points and therefore must remain inside the same transitive kernel.
- The window record's cryptographic integrity and its TTL.
- The audit visibility of an open or recently-closed window (the bootstrap
  warning).

- The genuine initial Advisor/course and versioned final-package authority closure adds `lib/advisory-receipt-assurance.mjs`, `lib/codex-advisor-admission.mjs`, `lib/codex-advisor-execution.mjs`, `lib/codex-advisor-host-record.mjs`, `lib/codex-advisor-host-store.mjs`, `lib/codex-advisor-request.mjs`, `lib/design-advisor-course-store.mjs`, `lib/design-advisor-course.mjs`, `lib/design-advisor-provenance.mjs`, `lib/design-advisory-coordinator-v2.mjs`, `lib/design-advisory-coordinator.mjs`, `lib/design-workflow-package-v2.mjs`, `schemas/pipeline.design-workflow-package.v2.json`, `scripts/codex-design-advisor-bootstrap.mjs`, `scripts/codex-design-advisor-host.mjs`. The schema token names the imported plugin-local resource; the root schema remains a required equivalent product mirror.

- Alfred extends the never-liftable kernel to public governance scope,
  lifecycle denial recovery, activation, design advisory and retirement authority,
  including `lib/native-initial-advisor-execution.mjs`,
  `lib/readiness-advisor-context-v2.mjs`, `lib/runner-readiness-request.mjs`,
  and `lib/project-uninstall-workspace.mjs`. These dependencies carry initial
  Advisor custody, Readiness input validation and retirement ownership checks;
  an open maintenance window must not permit their replacement.
  The canonical closure includes their first-party dependencies and generated
  Git hook snapshot admission observer. Its four emitted dynamic imports are
  declared individually: three Node builtins count toward call-site parity;
  `lib/governance-scope.mjs` is the first-party edge. Missing or stale declarations
  remain blocking findings. The additive paths, in kernel-array order, are:
  `hooks/git-dangerous-policy.mjs`,
  `hooks/hook-governance-admission.mjs`,
  `lib/advisory-coordinator.mjs`,
  `lib/advisory-decision-event.mjs`,
  `lib/antigravity-json-spans.mjs`,
  `lib/antigravity-plugin-topology.mjs`,
  `lib/antigravity-topology-refresh-host.mjs`,
  `lib/git-hook-footprint.mjs`,
  `lib/git-hook-runtime-snapshot.mjs`,
  `lib/git-hook-snapshot-admission.mjs`,
  `lib/governance-scope.mjs`,
  `lib/project-pipeline-footprint.mjs`,
  `lib/project-uninstall-contract.mjs`,
  `lib/project-uninstall.fixture.mjs`,
  `lib/project-uninstall.mjs`,
  `lib/runtime-projection-removal.mjs`,
  `schemas/pipeline.governance-scope.v1.json`,
  `schemas/project-uninstall-journal.schema.json`,
  `schemas/project-uninstall-plan.schema.json`,
  `schemas/project-uninstall-request.schema.json`,
  `scripts/advisory-host-bridge.mjs`,
  `scripts/browser-evidence-preflight.mjs`,
  `scripts/check-artifact-topology.mjs`,
  `scripts/codex-advisory-app-server.mjs`,
  `scripts/codex-host-advisor-route.mjs`,
  `scripts/codex-sandbox-preflight.mjs`,
  `scripts/codex-sandbox-runtime.mjs`,
  `scripts/design-advisory-admission.mjs`,
  `scripts/design-advisory-coordinator.mjs`,
  `scripts/host-advisor-workspace.mjs`,
  `scripts/project-activation.mjs`,
  `scripts/project-uninstall.mjs`,
  `scripts/sandboxed-readonly-host-bridge.mjs`.

### Supplementary completion-policy closure

The named supplementary completion contract protects
`harness/scripts/verify-case-completion-augmentation.mjs`,
`harness/scripts/verify-case-completion-augmentation.test.mjs`, and
`harness/config/verify-case-completion-augmentations.v1.json` as never liftable
project kernel roots. The shared validator only fills absent completion policy
on an exact existing declarative suite name and file. Their first-party closure
also protects `lib/verify-case-completion-receipt.mjs`,
`harness/scripts/check-verify-suite-registration.mjs`, and
`lib/test-case-completion.mjs`. Existing policies,
unknown targets, unsafe paths and malformed physical or candidate JSON are
refused. Static and runtime consumers use the same loader; real FD completion
still verifies the full declared case set and every disposition.

Source delivery of these roots does not establish protected Verify integration,
full Verify, Critic review or native runtime qualification. Those require their
own final bindings and execution evidence.

### Enrollment retirement closure

`lib/enrollment-retirement-coordinator.mjs` is never liftable. Its existing
onboarding, consent, runtime and plan-state owner APIs retain their protection.
The nine schema mirrors are protected separately at both anchors. A `./schemas/`
token below names the project-root resource; a full plugin path names its mirror:

- `./schemas/pipeline.enrollment-retirement-archive.v1.json` and `plugins/pipeline-core/schemas/pipeline.enrollment-retirement-archive.v1.json`
- `./schemas/pipeline.enrollment-retirement-coordinator.v1.json` and `plugins/pipeline-core/schemas/pipeline.enrollment-retirement-coordinator.v1.json`
- `./schemas/pipeline.enrollment-retirement-result.v1.json` and `plugins/pipeline-core/schemas/pipeline.enrollment-retirement-result.v1.json`
- `./schemas/pipeline.enrollment-retirement-inspection.v1.json` and `plugins/pipeline-core/schemas/pipeline.enrollment-retirement-inspection.v1.json`
- `./schemas/pipeline.plan-invalidation.v1.json` and `plugins/pipeline-core/schemas/pipeline.plan-invalidation.v1.json`
- `./schemas/pipeline.enrollment-git-creation-plan.v1.json` and `plugins/pipeline-core/schemas/pipeline.enrollment-git-creation-plan.v1.json`
- `./schemas/pipeline.enrollment-git-creation-barrier.v1.json` and `plugins/pipeline-core/schemas/pipeline.enrollment-git-creation-barrier.v1.json`
- `./schemas/pipeline.enrollment-git-removal-barrier.v1.json` and `plugins/pipeline-core/schemas/pipeline.enrollment-git-removal-barrier.v1.json`
- `./schemas/pipeline.enrollment-git-creation.v1.json` and `plugins/pipeline-core/schemas/pipeline.enrollment-git-creation.v1.json`

The shared registration proposal supplies full inherited-FD completion policies
for three new suites. The existing runtime suite now uses full inherited-FD
completion coverage for all 24 callbacks, with stable IDs COR001–COR024 and a
65536-byte budget. Its existing completion entry is required, and its policy is
bound to the existing builtin Verify row in the inert consumer proposal.
Protected Verify, writer and guard proposals remain inert until admitted and
bound to final Source verification.

## Threats and controls

| Threat | Control |
| --- | --- |
| An agent arms a window itself, or is instructed/injected into arming one | There is no arming step. A window's validity is derived fresh from a signed proof on every guarded call; nothing the agent can run creates or strengthens that proof. |
| A window is used to widen scope beyond GS-6/TP-* | The verifier accepts only rule IDs from the closed set `{GS-6, TP-*}`; any other named rule ID makes the whole window invalid, not partially honored. |
| A GS-6 window covers the code that verifies GS-6 windows (recursive hole) | A hardcoded kernel path list is checked BEFORE any window lookup; kernel paths deny unconditionally regardless of an armed window's scope or claims. |
| A window's effect outlives its TTL (e.g. a config file keeps changed bytes) | Out of reach structurally: GS-1..GS-5/GS-7 (the files whose *bytes* persisting matters) are never in the liftable set, so there is nothing this mechanism can leave behind after expiry except ordinary product-code commits, which are already subject to Verify/Critic/push-approval like any other commit. |
| A malformed or absent expiry is treated as "never expires" | Validity requires a *finite* parsed expiry strictly greater than now; an unparseable or missing timestamp is invalid, inverting the known failure polarity found elsewhere in this codebase (`human-guard-override.mjs`'s `expired = new Date(x).getTime() <= nowMs`, where `NaN <= nowMs` is `false`). |
| A signed window is replayed later, or against a different repository | The signed subject binds a fresh nonce and the physical repository/common-dir identity (not a path string), reusing the existing `topology()` discipline; a proof signed for one physical repository does not verify against another, and a consumed/expired nonce is not reusable. |
| A signed window claims an unbounded or excessive TTL | The verifier clamps effective expiry to `min(signedExpiresAt, openedAt + MAX_TTL)` with a fixed, short `MAX_TTL`; a longer signed value is silently capped, never honored in full. |
| Tampering with the stored window record (edited TTL, scope, or signature) | The record's signature is re-verified against the trust anchor on every read, not cached as a boolean; any byte change invalidates it exactly as tampering with a push-approval proof would. |
| The window is used to plant a change that a later session trusts as "already reviewed" | GMW confers edit permission only. It carries no Verify/Critic/publication authority of any kind — a change made under a window is an ordinary uncommitted-then-committed diff, subject to every downstream gate (Verify, Critic, push-approval) exactly as if GS-6 had never fired. |
| A stale or currently-open window goes unnoticed across sessions | The SessionStart bootstrap check re-derives validity through the same verifier the guards call (never a self-declared status field) and warns — loudly if currently valid, once informationally if expired-but-present — without blocking startup. |
| A same-session worktree/separate-checkout trick bypasses GS-6 without any window or human step at all | Not closed by new guard code in this iteration (see ADR-0058 Follow-up); closed today by discipline — this repository's own delivery convention already requires a human/PO action before a guard-code change becomes live in the enforcing copy, and this feature's own implementation follows that convention. Recorded as a residual risk, not claimed as solved. |
| The trust anchor itself is rewritten to forge future windows | `project/critical-human-proof.json` is GS-2 protected today and is additionally part of the GMW kernel — never in a liftable scope, so no window can ever make its own anchor mutable. |

## Residual risks

Risk owner: Agent-Pipeline maintainers. Review deadline: before any expansion
of the liftable scope beyond GS-6/TP-*, and before this mechanism is reused
for `deploy`/`publication`.

- A process already acting as the same operating-system owner as the PO's
  signing device is a boundary this design does not defend against, identical
  to every other detached-signature primitive in this repository.
- The worktree/separate-checkout bypass path noted above is real and
  unmitigated by guard code; it is mitigated only by the same operational
  discipline this repository already relies on for every other guard-code
  change. A dedicated guard closing it is tracked as follow-up work, not
  claimed here.
- The bootstrap tree-hash comparison (ADR-0058 point 6) states a fact
  ("the plugin root changed during this window") without judging whether that
  change was reviewed; a human still has to look.
