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
  `lib/critical-action-approval-request.mjs`, `lib/document-hooks.mjs`,
  `lib/entrypoint.mjs`, `lib/feature-package-topology.mjs`,
  `lib/gate-estimate.mjs`, `lib/git-cmd.mjs`,
  `lib/human-guard-override.mjs`, `lib/human-role-labels.mjs`,
  `lib/machine-plane.mjs`, `lib/manifest.mjs`, `lib/onboarding-continuity.mjs`,
  `lib/plan-spec-state-v2.mjs`, `lib/po-gate-authority.mjs`,
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
  `lib/session-cleanup-recovery.mjs`, `lib/source-observation.mjs`,
  `lib/windows-private-state.mjs`, `lib/worktree-lifecycle.mjs`,
  `lib/yaml-lite.mjs`, `scripts/codex-app-server-health.mjs`,
  `scripts/continuity-status.mjs`, `scripts/pipeline-state.mjs`,
  `scripts/po-gate-profile-repair.mjs`, `scripts/project-onboarding-v3.mjs`,
  `scripts/publication-close-journal.mjs`, and
  `scripts/v3-bootstrap-authority.mjs`. A second closure gap (VFX2-GMW,
  `sprint_phoenix` merge, 2026-08-26) added: `lib/agent-decision-journal.mjs`,
  `lib/authority-revision-proof.mjs`, `lib/control-execution-exchange.mjs`,
  `lib/control-execution-lifecycle-event.mjs`,
  `lib/decision-reference-dual-evaluation.mjs`, `lib/external-push-ledger.mjs`,
  `lib/governance-event-store.mjs`, `lib/governance-event.mjs`,
  `lib/guard-authority-ledger-intake.mjs`, `lib/guard-handoff-offer.mjs`,
  `lib/human-decision-attribution.mjs`, `lib/human-governance-decision.mjs`,
  `lib/human-governance-ledger.mjs`, `lib/human-role-exception-decision.mjs`,
  `lib/lifecycle-governance-events.mjs`, `lib/onboarding-consent-marker.mjs`,
  `lib/threat-model-approval-request.mjs`, and `lib/threat-model.mjs`. A third
  closure gap (NVA-KERNELDYN-1, 2026-08-27 — `pre-push-hook-install.mjs`'s
  dynamic `import()` edges, resolved via a declared table rather than the
  static scanner, plus two unrelated pre-existing gaps GMWKC01 found already
  open) added: `hooks/guard-dispatch-budget.mjs`,
  `lib/plan-authority-staging-guard.mjs`, `lib/security-completeness-gate.mjs`,
  `lib/security-evidence-evaluator.mjs`, `lib/verify-evidence-path.mjs`, and
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
  `lib/trusted-tool-resolution.mjs`, `scripts/pipeline-start-preflight.mjs`,
  `scripts/pipeline-update-channel.mjs`, `scripts/po-approval-request.mjs`,
  `scripts/po-human-approval.mjs` (the script the human uses to sign),
  `scripts/push-gate-satisfiability.mjs`, `scripts/push-prepare.mjs`,
  `scripts/ruleset-freshness.mjs`, and `scripts/ruleset-update-policy.mjs`. A
  seventh gap (NVA-V25-DRIVERKERNEL, 2026-08-29) is a different shape than the
  six above: the closure walk only follows edges FROM a kernel file outward,
  so a module that instead IMPORTS a kernel module is structurally invisible
  to it. `scripts/push-init.mjs` imports `scripts/push-gate-satisfiability.mjs`
  and `scripts/push-prepare.mjs` (both already kernel) directly, and its own
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
  `scripts/check-protected-path-integrity.mjs`. An unrelated pre-existing gap
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
- The window record's cryptographic integrity and its TTL.
- The audit visibility of an open or recently-closed window (the bootstrap
  warning).

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
