# ADR-0058: a signed, time-boxed maintenance window lets the PO lift a narrow set of self-protecting guard rules, with no in-session activation step

> Agent-Pipeline · Sprint Nova · as of 2026-08-07

**Status:** accepted (2026-08-07, PO instruction, chat) — *"bitte baue einen fix der
dafür sorgt, dass generell dieser Blocker durch mich liftbar ist für die Arbeit an
der Pipeline durch die Pipeline... ein Mechanismus den du nicht selber auslösen
kannst aber der es mir ermöglicht auch für einen Zeitraum solche guards alle zu
liften... eine Prüfung und Warnung [beim bootstrap] wenn etwas nicht wieder
aktiviert wurde (kein fail! aber Warnung)"*. **Refines** [ADR-0056](0056-push-approval-mode.md);
**extends** the "Attended Human guard override" system described in
`docs/human-guard-override-threat-model.md`.

**Governs:** plugins/pipeline-core/hooks/guard-gate-strength.mjs, plugins/pipeline-core/hooks/guard-testpath.mjs, plugins/pipeline-core/lib/human-guard-override.mjs, plugins/pipeline-core/lib/po-approval-proof.mjs, plugins/pipeline-core/lib/tool-write-target.mjs, plugins/pipeline-core/hooks/guard-command-grammar.mjs, plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs, plugins/pipeline-core/hooks/hooks.json, docs/human-guard-override-threat-model.md, docs/po-approval-proof-contract.md

## Context

`guard-gate-strength.mjs` Rule GS-6 unconditionally refuses every Edit/Write to
the "live plugin root" — the copy of `plugins/pipeline-core` that is *currently
enforcing the guards in this session*. It has no override path of any kind: it
does not call the existing v2 "Human Guard Override" (HGO) capability system at
all, unlike its sibling rules. This is deliberate, and the file's own header
records why: a real, dated incident showed that with nothing technically
stopping it, a past session edited `pipeline.user.yaml` to weaken the push gate
on its own authority — proof that "an agent that can weaken its own gate has no
gate." `guard-testpath.mjs`'s TP-* rules do reach the HGO system, but only when
`gates.push_approval` is `"chat"`; in `"signature"` mode (this repository's
actual configured value) even TP-* has no usable in-session override, because
HGO's own activation step is an ordinary command a ready session can simply run
itself — admitting it in `signature` mode would make the refusal theatre
(`guard-testpath.mjs`, the `overrideAdmitted` comment block).

Because of GS-6, this session — running as the very plugin whose code lives
under `plugins/pipeline-core/` — cannot make a single Edit/Write anywhere in
that tree, including small, fully-specified bugfixes. This has now happened
repeatedly (`backlog/items/2026-08-07-release-preflight-cli-base-commit-not-peeled.md`,
`backlog/items/2026-08-07-gs6-blocks-inert-plugin-metadata-in-self-hosted-sessions.md`)
and is a real, recurring block on the Pipeline's own self-application
(ADR-0015). The documented escape hatch — "the PO edits this file directly,
outside an agent session" — works, but costs a full manual round trip for
every single fix and leaves no audit trail of what was lifted, when, or why.

An independent advisory consult (fresh-context review of `guard-gate-strength.mjs`,
`guard-testpath.mjs`, `lib/human-guard-override.mjs`, `docs/po-approval-proof-contract.md`,
and `docs/human-guard-override-threat-model.md`, 2026-08-07) confirmed the shape
below is sound under specific conditions and flagged concrete failure modes
that the Decision section incorporates directly: a recursive-verifier hole (the
window's own verifying code must itself stay permanently un-liftable), effects
that outlive the window (a lifted config file keeps its new bytes after
expiry), a known fail-open pattern for a malformed expiry timestamp elsewhere
in this codebase (`human-guard-override.mjs`), and the risk of a broad
"lift everything" default being strictly more dangerous than a narrow one.

## Decision

A new, separate mechanism — the **Guard Maintenance Window** (GMW) — lets the
PO, and only the PO, temporarily lift a closed, explicit set of guard rules for
a bounded time, using the same detached-Ed25519 "PO approval proof" primitive
already established for push approval (ADR-0056, `lib/po-approval-proof.mjs`,
`docs/po-approval-proof-contract.md`). The agent can `prepare` a digest-bound
request; it structurally cannot produce a valid proof for it, exactly as it
cannot today for a push in `signature` mode.

1. **No in-session activation step.** Presence of a valid, unexpired,
   correctly-bound signed window record *is* the window — there is no separate
   "arm" command for the agent to run, confused into running, or be instructed
   to run. This closes the exact failure mode HGO's `chat`-mode branch
   documents as disqualifying (`guard-testpath.mjs` `overrideAdmitted` block):
   an activation step that is "an ordinary command a ready session can run" is
   not a human gate. The PO's entire manual action is: inspect the prepared
   request's digest, sign it externally (their own already-established flow,
   `docs/po-approval-proof-contract.md`), and hand back the proof — after
   which an agent-safe `install` step (verify-and-place only, cannot succeed
   without a genuine signature) makes it visible to the guards.

2. **Narrow, closed liftable universe — GS-6 and TP-\* only.** GS-1 through
   GS-5 and GS-7 (`pipeline.user.yaml`, `project/critical-human-proof.json`,
   `project/pipeline.yaml`, the `guard-config.json` variants) decide a gate's
   *strength* — they are the dial itself, not code the Pipeline needs to
   dogfood-fix. They stay permanently non-liftable by this mechanism, exactly
   as today: PO edits them directly, outside a session. Only GS-6 (the live
   plugin root, minus the kernel below) and TP-* (configured test paths) are
   ever eligible for a window. A signed request naming any other rule ID is
   rejected before verification is even attempted.

3. **A hardcoded, permanently non-liftable kernel, closed under import and
   test-enforced.** Guard scripts are re-read on every invocation, so a window
   covering the file that verifies windows would let the first edit disable
   its own expiry check. `guard-gate-strength.mjs`, the new window-verifier
   module, `hooks/hooks.json`, `lib/tool-write-target.mjs`,
   `hooks/guard-command-grammar.mjs`, `hooks/guard-lifecycle-ready.mjs`, the
   file carrying the trust anchor (`project/critical-human-proof.json`,
   already GS-2), and `lib/critical-human-proof-policy.mjs`/
   `lib/po-approval-proof.mjs` (the two modules that verify a window and every
   push/deploy/publication/release-preflight proof) are excluded from every
   window's effective scope regardless of what a signed payload claims —
   checked before any window lookup happens at all, not merely by convention.
   The kernel must also be closed under first-party IMPORT, not just these
   entries' own bytes, or a window could reach the same code through one
   import hop. NVA-A7FIX-2 replaced a hand-walked version of that closure
   (twice found incomplete by Critic review) with a static invariant test,
   `guard-maintenance-window-kernel-closure.test.mjs`, that fails on any
   future edit adding an import to a kernel file without extending
   `NEVER_LIFTABLE_KERNEL_PATHS` to match; the full, current, test-enforced
   enumeration is listed in `docs/guard-maintenance-window-threat-model.md`'s
   "Protected assets" section rather than duplicated a third time here.

**Correction, 2026-08-10 (found by a round-2 Critic review of a design that proposes growing this
kernel).** Decision 3 enumerates the kernel by name and has never been amended since — this ADR is
the decision authority for that list (`plugins/pipeline-core/lib/self-application-attestation-gate.mjs:45-47`
already treats "whether the kernel list should grow" as "one ADR-0058 decision"), so a design that
proposes a new member without amending this ADR leaves the authoritative record silently incomplete
the moment the code change lands. Stated as a standing process, so this does not need rediscovering
per future module: **a `NEVER_LIFTABLE_KERNEL_PATHS` addition is a decision of this ADR, recorded
here as a dated correction at the time the addition is proposed** — never merely a code-review
outcome on the file that hosts the array. The correction names the new module, the capability-
bearing artifact it computes that makes it kernel-eligible (Decision 3's own test: would a window
covering this file let the first edit disable the very check that gates it), and the design or
dispatch that raised it.

**First application of that process.** `specs/sprint-phoenix-epic/design/gmw-hgo-evidence-intake-
into-the-human-ledger.md` §15.1.6 (iv) proposes `plugins/pipeline-core/lib/guard-authority-ledger-
intake.mjs` as an eighth kernel entry once that module ships (it does not exist yet): it will host
`ledgerConfirmsLiveGmwGrant`, whose return value becomes a term of the lift condition — exactly
Decision 3's own recursive-hole test. Endorsed here as the correct kernel classification, contingent
on that module actually landing; the array itself is edited by whichever dispatch ships the module,
not by this correction. This does not resolve the SEPARATE, already-pending question named at
`self-application-attestation-gate.mjs:45-47` — **which is about two modules, not one, and the first
version of this paragraph named only one of them.** The source comment reads: "This module is
deliberately not in `NEVER_LIFTABLE_KERNEL_PATHS`; GS-8's module is not either, and whether the
kernel list should grow is one ADR-0058 decision about both." "This module" is
`self-application-attestation-gate.mjs` itself — governed, for the live-enforcing copy, by GS-6 (the
same window-liftable rule the intake module above sits under), not by GS-8. "GS-8's module" is the
sibling file it imports and compares against, `./public-core-origin-allowlist.mjs`
(`self-application-attestation-gate.mjs:22-23`). Both memberships are open, both are outside this
design's scope, and both are left open below for their own dated correction when addressed.

4. **Bounded TTL, enforced in code, fail-closed on a malformed clock.** The
   verifier clamps effective expiry to `min(signedExpiresAt, openedAt + MAX_TTL)`
   with a fixed, short `MAX_TTL` (hours, not days). Expiry parsing follows the
   inverse of the known bug pattern already present once in this codebase
   (`human-guard-override.mjs`'s `expired = new Date(x).getTime() <= nowMs`,
   which a malformed timestamp turns into `NaN <= nowMs → false`, i.e. never
   expires): a window is valid only when its parsed expiry is a finite number
   strictly greater than now — unparseable means invalid, never means
   unbounded.

5. **Physical-repository and content binding.** The signed subject binds a
   fresh nonce, the physical repository/common-dir identity (reusing the
   existing `topology()` discipline, not a path string — ADR-0056's T6 lesson
   about a nested repository minting its own anchor applies unchanged here),
   the exact scope rule IDs, the TTL, the reason, and the live-plugin tree hash
   at the moment the window was prepared. A window is bound to the repository
   it was signed for and to nothing broader.

6. **Bootstrap surfaces it; bootstrap never blocks on it.** A SessionStart
   check re-derives validity through the same verifier the guards call (never
   a self-declared status field) and: a currently-valid window prints a loud
   warning naming scope, reason, and remaining time; an expired-but-present
   window prints one informational cleanup note, not a recurring nag; if a
   GS-6-scoped window was used, the current live-plugin tree hash is compared
   against the opening hash bound in the signed payload and a mismatch is
   stated as fact ("the plugin root changed during this window") without a
   verdict on whether that change was reviewed. This directly answers the PO's
   requirement: a check and a warning, never a failure.

7. **Effects on GS-1-class files are still out of reach.** Because scope is
   closed to GS-6/TP-* only, a window cannot be used to rewrite
   `push_approval` or the trust anchor mid-window — the mechanism that made
   `chat`-mode HGO unsafe under `signature` mode does not reappear here.

## Consequences

**Positive.** The Pipeline can fix its own guard/plugin code and its own
protected test files inside the same self-hosted session that needs the fix,
with a real human gate that the agent is cryptographically incapable of
forging or self-triggering, an audit trail of what was lifted and why, and no
"forgot to turn it back off" risk because there is nothing to turn off —
expiry is automatic and enforced in code.

**Negative.** A second signed-proof ceremony exists alongside the push-approval
one (same primitive, different `kind`), which is one more thing the PO
operates, however small. `guard-gate-strength.mjs` and `guard-testpath.mjs`
both grow a second code path (kernel-check, then window-check, then the
existing unconditional deny) that must be kept correct under Critic review —
guard code is exactly the class of change this repository already treats as
highest-scrutiny.

**Risk:** a same-session worktree-then-merge trick could in principle let an
agent bypass GS-6 entirely without any human step, by developing and then
silently merging a change into the live-enforcing copy's working tree via an
ordinary (non-Edit/Write) git command. This ADR does not close that path with
new guard code — it is closed by discipline: this repository's own delivery
convention already requires a human/PO action (review, then install/merge) before
any guard-code change becomes live, and the implementation of this very
feature follows that convention rather than exercising the trick it would
otherwise demonstrate. Recorded as a residual risk worth a dedicated guard in
its own right (see Follow-up).

**Nova B closure correction, 2026-09-12.** The accepted dispatch-budget binding
and durable HGO-consumption packages added first-party imports from existing
kernel modules into `lib/dispatch-budget-binding.mjs`, `lib/dispatch-policy.mjs`,
`lib/governance-hgo-consumption-action.mjs`, and
`lib/governance-hgo-consumption-source.mjs`. These four modules now compute the
budget admission or durable evidence consumed by already-kernel enforcement
code. A maintenance window that could rewrite one could alter that decision or
evidence without changing its importing kernel module. They therefore join
`NEVER_LIFTABLE_KERNEL_PATHS` under Decision 3's transitive-closure rule. Both
TP enforcement boundaries also evaluate kernel membership before accepting a
signed window: a valid TP-4 window still cannot lift `hooks/hooks.json`.

**Kernel-list reconciliation correction, 2026-10-09 (dispatch ADR58-CORR-20261009).** The
2026-08-10 correction made every `NEVER_LIFTABLE_KERNEL_PATHS` addition a decision of this ADR,
recorded as a dated correction when the addition is made. Almost none were: the live array
(`plugins/pipeline-core/lib/guard-maintenance-window.mjs`) holds 373 entries; this ADR named about
two dozen. The rest were added by code commits under Decision 3's own transitive-closure rule
(NVA-A7FIX-2: the kernel is closed under first-party import, enforced by GMWKC01), each with an
explanatory comment in the array, and this record never followed. This correction closes that gap
once: it names every live entry not named above, grouped by the commit that added it (found with
`git log -S` on the exact path string in the array's file; short SHA and commit date), with the
one reason each group is kernel. All paths below are relative to `plugins/pipeline-core/` unless
they start with `harness/`; a `schemas/` name is listed once and means the plugin copy plus its
project-root `schemas/` mirror. Every group carries the same reason class unless it says otherwise:
a module imported (or process-spawned) by an already-kernel file runs with that file's authority,
so a window that could rewrite it could change a kernel decision without touching the kernel file
(Decision 3, closed under import). Going forward the standing process of the 2026-08-10
correction is unchanged, and the full enumeration remains test-enforced by GMWKC01 and listed in
`docs/guard-maintenance-window-threat-model.md`; this correction does not replace that list.

Additions with a reason beyond closure:

- `a58e83657` (2026-08-07) `lib/guard-maintenance-window.mjs` itself, the window verifier named in
  Decision 3. `3bb7d14dc` (2026-08-19) `lib/guard-devplan-policy.mjs`, the dev-plan gate policy
  the kernel guards consult. `f6c9800a5` (2026-08-25) `lib/chat-gate-ceremony.mjs`, the shared
  attended-terminal confirmation primitive imported by `scripts/pipeline-state.mjs` and
  `lib/project-onboarding-v3.mjs`.
- `e51844ab8` (2026-10-09) `lib/hardened-private-directory.mjs` (WIN-AP-F2): kernel-listed
  installers import it, and it now hosts the private-root entry point that repairs an own
  insecure private-state segment, so a window rewriting it could weaken how every private
  directory the kernel trusts is secured. Its own imports (`lib/private-boundary.mjs`,
  `lib/windows-private-state.mjs`) are listed below.
- `61673c647` (2026-09-13) `lib/po-key-directory.mjs`: resolves the PO signing-key directory the
  proof verifiers read.
- `9d533fa5b` (2026-08-28) `lib/repository-path-identity.mjs`: the single definition of how two
  spellings of one physical repository path fold into one identity, used by the window verifier
  itself when it matches a stored fingerprint.
- `e7233fe61` (2026-09-02) `lib/rebase-authority.mjs`: decides whether an active rebase carries
  its own approved authority and so relieves the dev-plan gate; kernel on the merits as well as by
  closure.
- `8bff2fc94` (2026-09-07) `lib/critic-route-v3.mjs`: the V3 authority that selects the
  high-risk Critic model the protected health route probes. `51dc0c345` (2026-09-12)
  `lib/critic-skip-decision.mjs`: the required/skip/evidence decision `lib/dispatch-record.mjs`
  delegates to for every dispatch record. `69951b3b7` (2026-09-11) `lib/commit-message-policy.mjs`,
  `scripts/commit-msg-hook-install.mjs`, `lib/dispatch-record.mjs`,
  `scripts/settings-allowlist-merge.mjs` (NVA-B-COMMITMSG: the finished-message backstop and its
  shared policy).
- `46abe0304` (2026-08-29) `scripts/push-init.mjs` (NVA-V25-DRIVERKERNEL) and `4a1581c14`
  (2026-09-15) `lib/push-destination-policy.mjs`: they construct the text of the
  human-attended push-authorization signature command shown to the PO before signing;
  `3dcc68825` (2026-08-29) `scripts/guard-human-override.mjs`, `scripts/guard-maintenance-window.mjs`,
  `scripts/po-approval-gate.mjs`, `scripts/signing-ceremony.mjs` (NVA-V26-SIGNINGIMPORTERS): the
  code that invokes the signer or arms the override capability. Both groups are importers of a
  kernel module, a shape GMWKC01's outward walk cannot see.
- `3047c9c88` (2026-09-01) `lib/handover-rotation.mjs` (NVA-B-KERNELEDGE, dynamic import edge);
  `1e9f4564e` (2026-08-29) `scripts/pre-commit-hook-install.mjs`,
  `scripts/check-protected-path-integrity.mjs`, `lib/onboarding-language-correction.mjs`;
  `c598a9ede` (2026-08-27) `lib/onboarding-staging-authoring.mjs`; `b2606c05f` (2026-08-27)
  `lib/onboarding-argv-shapes.mjs` (the one declaration of the argv shape the lifecycle guard
  admits per mutating onboarding command).
- Resolution of three earlier open items. `92fd818c1` (2026-08-28) added
  `lib/self-application-attestation-gate.mjs` and `lib/public-core-origin-allowlist.mjs`, so
  the two memberships left undecided above and in Follow-up are decided as members (closure from
  `scripts/push-prepare.mjs` and the ruleset-freshness family), superseding that follow-up
  bullet. `lib/guard-authority-ledger-intake.mjs` was added by `b5cb993e8` (2026-08-26), so
  the "endorsed but not yet applied" follow-up bullet is satisfied. `hooks/guard-testpath.mjs`
  remains outside the array, as decided above.

Closure additions by commit (all closure-reached, no reason beyond Decision 3):

- `ad512e80f` (2026-08-17, "close the GMW kernel's transitive-closure gap with a test", 40):
  `lib/codex-host-layout.mjs`, `lib/codex-onboarding-app-server.mjs`,
  `lib/codex-onboarding-capabilities.mjs`, `lib/codex-onboarding-runtime.mjs`,
  `lib/continuity-host-adapter.mjs`, `lib/continuity-state.mjs`, `lib/continuity-status.mjs`,
  `lib/critic-export-policy.mjs`, `lib/critical-action-approval-request.mjs`,
  `lib/document-hooks.mjs`, `lib/entrypoint.mjs`, `lib/gate-estimate.mjs`, `lib/git-cmd.mjs`,
  `lib/human-role-labels.mjs`, `lib/machine-plane.mjs`, `lib/manifest.mjs`,
  `lib/onboarding-continuity.mjs`, `lib/plan-spec-state-v2.mjs`, `lib/po-gate-authority.mjs`,
  `lib/po-gate-profile-publisher.mjs`, `lib/project-authority.mjs`,
  `lib/project-onboarding-ready-gate.mjs`, `lib/project-onboarding-v3.mjs`,
  `lib/recovery-preview-attestation.mjs`, `lib/runner-native-continuation.mjs`,
  `lib/runner-profile-migration-v2.mjs`, `lib/runner-profile-migration-v3.mjs`,
  `lib/runner-profiles-v2.mjs`, `lib/runner-profiles-v3.mjs`, `lib/runtime-projection-v2.mjs`,
  `lib/runtime-projection-v3.mjs`, `lib/schema-lite.mjs`, `lib/session-cleanup-recovery.mjs`,
  `lib/source-observation.mjs`, `lib/windows-private-state.mjs`, `lib/worktree-lifecycle.mjs`,
  `lib/yaml-lite.mjs`, `scripts/codex-app-server-health.mjs`, `scripts/continuity-status.mjs`,
  `scripts/v3-bootstrap-authority.mjs`.
- `73b7abbe1` (2026-08-18, spawn-edge closure, 12): `lib/feature-package-topology.mjs`,
  `lib/private-boundary.mjs`, `lib/protected-test-paths.mjs`, `lib/publication-authority.mjs`,
  `lib/publication-bundle.mjs`, `lib/publication-bundle-v2.mjs`,
  `lib/publication-capability-preflight.mjs`, `lib/review-economy.mjs`,
  `scripts/pipeline-state.mjs`, `scripts/po-gate-profile-repair.mjs`,
  `scripts/project-onboarding-v3.mjs`, `scripts/publication-close-journal.mjs`.
- `b5cb993e8` (2026-08-26, VFX2-GMW Phoenix-merge closure, 17) with `be7b9aae7`, `b8a0c639c`,
  `b73959be2` (2026-09-12, 4 more): `lib/agent-decision-journal.mjs`,
  `lib/authority-revision-proof.mjs`, `lib/control-execution-exchange.mjs`,
  `lib/control-execution-lifecycle-event.mjs`, `lib/decision-reference-dual-evaluation.mjs`,
  `lib/external-push-ledger.mjs`, `lib/governance-event-store.mjs`, `lib/governance-event.mjs`,
  `lib/guard-handoff-offer.mjs`, `lib/human-decision-attribution.mjs`,
  `lib/human-governance-decision.mjs`, `lib/human-governance-ledger.mjs`,
  `lib/human-role-exception-decision.mjs`, `lib/lifecycle-governance-events.mjs`,
  `lib/onboarding-consent-marker.mjs`, `lib/threat-model-approval-request.mjs`,
  `lib/threat-model.mjs`, `lib/governance-action-artifact.mjs`, `lib/governance-gate-action.mjs`,
  `lib/governance-action-events.mjs`, `lib/governance-recovery-reconciliation-action.mjs`.
- `03a3cd86c` (2026-08-27, NVA-KERNELDYN-1, 6): `hooks/guard-dispatch-budget.mjs`,
  `lib/plan-authority-staging-guard.mjs`, `lib/security-completeness-gate.mjs`,
  `lib/security-evidence-evaluator.mjs`, `lib/verify-evidence-path.mjs`,
  `scripts/pre-push-hook-install.mjs`; `7c4456e57` (2026-09-17) `lib/checkpoint-push-audit.mjs`.
- `92fd818c1` (2026-08-28, NVA-V22-KERNELCLOSURE, 15 beyond the two decided above):
  `hooks/staleness-check.mjs`, `lib/bootstrap-payload-budget.mjs`, `lib/codex-host-plugin-list.mjs`,
  `lib/copy-safe-command.mjs`, `lib/public-core-observation.mjs`, `lib/ruleset-source.mjs`,
  `lib/trusted-tool-resolution.mjs`, `scripts/pipeline-start-preflight.mjs`,
  `scripts/pipeline-update-channel.mjs`, `scripts/po-approval-request.mjs`,
  `scripts/po-human-approval.mjs` (the script the human signs with),
  `scripts/push-gate-satisfiability.mjs`, `scripts/push-prepare.mjs`,
  `scripts/ruleset-freshness.mjs`, `scripts/ruleset-update-policy.mjs`.
- `bbf55041c` (2026-09-11, 5): `lib/dispatch-budget-core.mjs`, `lib/installed-plugin-attestation.mjs`,
  `lib/provenance-attestation.mjs`, `lib/provenance-envelope.mjs`,
  `scripts/installed-plugin-attestation-host.mjs`; `399d0a2c5` (2026-09-10)
  `lib/verify-selection.mjs`, `lib/consumer-baseline-verify.mjs`; `18ab3afd4` (2026-09-10)
  `lib/consumer-verify.mjs`, `scripts/consumer-verify-check.mjs`.
- `18bdaf9c6` (2026-09-23) `lib/signed-quality-package.mjs`,
  `scripts/generate-architecture-overview.mjs`; `c296398e0` (2026-09-13)
  `lib/successful-spawn.mjs`; `8b7da0f8a` (2026-09-18) `scripts/capture-evidence.mjs`,
  `lib/release-promotion-envelope.mjs`.
- `b7c660282` (2026-10-02, 12): `lib/critic-session-model-route.mjs`,
  `scripts/codex-critic-session-route.mjs`, `lib/passive-read-policy.mjs`,
  `lib/intake-material-reference.mjs`, `scripts/check-private-identifiers.mjs`,
  `lib/model-family-authority.mjs`, `lib/model-family-execution.mjs`,
  `lib/model-family-invocation.mjs`, `lib/model-family-runtime-host.mjs`,
  `lib/model-family-route-source.mjs`, `lib/model-family-host-store.mjs`,
  `lib/model-family-latest-selection.mjs`.
- `755419f54` (2026-09-21, Alfred architecture-adoption and design-advisory closure, 20):
  `lib/advisory-receipt.mjs`, `lib/architecture-adoption-authority.mjs`,
  `lib/architecture-adoption-orientation.mjs`, `lib/architecture-design.mjs`,
  `lib/architecture-map-scaffold.mjs`, `lib/critic-diagnostic-evidence.mjs`,
  `lib/critic-diagnostic-packet.mjs`, `lib/design-advisory-admission.mjs`,
  `lib/design-advisory-enforcement.mjs`, `lib/design-advisory-final-approval.mjs`,
  `lib/design-advisory-transaction.mjs`, `lib/governance-authority-resolver.mjs`,
  `lib/protected-baseline.mjs`, `scripts/architecture-adoption.mjs`,
  `scripts/architecture-fitness.mjs`, `scripts/architecture-remedy.mjs`,
  `scripts/check-clone-provisioning.mjs`, `scripts/governance-authority.mjs`,
  `scripts/module-inventory.mjs`, `scripts/rigor-floor.mjs`.
- `3b388ede3` (2026-09-22, Alfred close-audit and Critic-verification closure, 13):
  `lib/architecture-entry-readiness.mjs`, `lib/audit-bundle.mjs`, `lib/critic-packet-governance.mjs`,
  `lib/critic-review-lineage.mjs`, `lib/critic-verify-lifecycle.mjs`,
  `lib/feature-close-audit-receipt.mjs`, `lib/governance-review-action.mjs`,
  `lib/organization-policy.mjs`, `lib/requirement-traceability.mjs`,
  `scripts/check-critic-skip-coverage.mjs`, `scripts/critic-dispatch-preflight.mjs`,
  `scripts/critic-packet-preflight.mjs`, `scripts/session-critic-finalizer.mjs`;
  `e2713f8c7` (2026-09-24) `lib/onboarding-initial-answers-state.mjs`,
  `lib/onboarding-initial-answers-transaction.mjs`, `lib/onboarding-later-language.mjs`,
  `lib/critic-course-admission.mjs`.
- `ef471b03f` (2026-09-27, 48; 0.7 AC-19/A, AC-25, model-role and host-observation closure):
  `lib/architecture-effective-decisions.mjs`, `lib/architecture-decision-continuity.mjs`,
  `lib/architecture-decision-waiver-store.mjs`, `lib/organization-architecture-source.mjs`,
  `lib/organization-architecture-source-store.mjs`, `lib/native-goldfish-host-observation.mjs`,
  `lib/native-goldfish-host-return.mjs`, `lib/native-goldfish-host-state.mjs`,
  `lib/agent-model-registry.mjs`, `lib/agy-host-commit-admission.mjs`,
  `lib/agy-host-observed-local-readback.mjs`, `lib/agy-host-observed-receipt.mjs`,
  `lib/agy-host-observed-store.mjs`, `lib/agy-final-return.mjs`, `lib/agy-session-authority.mjs`,
  `lib/agy-session-dispatch.mjs`, `lib/antigravity-execution-host.mjs`,
  `lib/critic-disposition-addendum.mjs`, `lib/portable-agy-authorship-export.mjs`,
  `lib/portable-critic-export.mjs`, `lib/role-dispatch-preflight.mjs`,
  `scripts/dispatch-authorship-verify.mjs`, `scripts/portable-agy-authorship-export.mjs`,
  `scripts/portable-critic-export.mjs`, `scripts/model-role-dispatch-select.mjs`,
  `scripts/model-role-bootstrap.mjs`, `lib/design-workflow-package.mjs`,
  `lib/design-workflow-approval.mjs`, `lib/advisory-attempt-trail.mjs`,
  `lib/model-role-host-session.mjs`, `lib/model-role-host-identity.mjs`,
  `lib/model-role-host-store.mjs`, `lib/model-role-route-source.mjs`,
  `lib/model-role-approved-policy.mjs`, `lib/model-role-host-observations.mjs`,
  `lib/model-role-v3-baseline.mjs`, `lib/model-role-session.mjs`, `lib/model-role-dispatch.mjs`,
  `lib/antigravity-model-host-observation.mjs`, `lib/claude-model-host-observation.mjs`,
  `lib/codex-model-host-observation.mjs`, `lib/design-readiness-host-evidence.mjs`,
  `lib/advisory-lifecycle-v2.mjs`, `lib/sandboxed-readonly-duty.mjs`,
  `lib/codex-sandbox-compatibility.mjs`, `lib/design-readiness-runner-host-store.mjs`,
  `scripts/codex-sandbox-select.mjs`, `lib/sandbox-failure.mjs`.
- `8b5dcf4fb` (2026-09-28, Codex design-readiness host closure, 15): `lib/codex-host-output-custody.mjs`,
  `lib/codex-readiness-host-record.mjs`, `lib/codex-host-process-journal.mjs`,
  `lib/codex-host-process-launcher.mjs`, `lib/codex-host-process-exec-worker.mjs`,
  `lib/codex-host-process-supervisor.mjs`, `lib/codex-readiness-ownership-verifier.mjs`,
  `lib/codex-design-readiness-host-store.mjs`, `lib/codex-readiness-finalization.mjs`,
  `lib/codex-isolated-structured-host.mjs`, `lib/codex-tool-free-design-readiness.mjs`,
  `lib/design-readiness-hashes.mjs`, `scripts/codex-design-readiness-host.mjs`,
  `scripts/codex-design-readiness-bootstrap.mjs`, `scripts/tool-identity.mjs`.
- `26fef9e7d` (2026-09-29, 80; Advisor course, governance/lifecycle/retirement roots, completion
  augmentation, enrollment retirement): `lib/physical-scratch-boundary.mjs`,
  `lib/lifecycle-denial-loop.mjs`, `lib/advisory-route-selection.mjs`,
  `lib/advisory-receipt-assurance.mjs`, `lib/codex-advisor-admission.mjs`,
  `lib/codex-advisor-execution.mjs`, `lib/codex-advisor-host-record.mjs`,
  `lib/codex-advisor-host-store.mjs`, `lib/codex-advisor-request.mjs`,
  `lib/design-advisor-course-store.mjs`, `lib/design-advisor-course.mjs`,
  `lib/design-advisor-provenance.mjs`, `lib/design-advisory-coordinator-v2.mjs`,
  `lib/design-advisory-coordinator.mjs`, `lib/design-workflow-package-v2.mjs`,
  `lib/native-initial-advisor-execution.mjs`, `lib/readiness-advisor-context-v2.mjs`,
  `lib/runner-readiness-request.mjs`, `schemas/pipeline.design-workflow-package.v2.json`,
  `scripts/codex-design-advisor-bootstrap.mjs`, `scripts/codex-design-advisor-host.mjs`,
  `hooks/git-dangerous-policy.mjs`, `hooks/hook-governance-admission.mjs`,
  `lib/advisory-coordinator.mjs`, `lib/advisory-decision-event.mjs`,
  `lib/antigravity-json-spans.mjs`, `lib/antigravity-plugin-topology.mjs`,
  `lib/antigravity-topology-refresh-host.mjs`, `lib/git-hook-footprint.mjs`,
  `lib/git-hook-runtime-snapshot.mjs`, `lib/git-hook-snapshot-admission.mjs`,
  `lib/governance-scope.mjs`, `lib/project-pipeline-footprint.mjs`,
  `lib/project-uninstall-contract.mjs`, `lib/project-uninstall.fixture.mjs`,
  `lib/project-uninstall.mjs`, `lib/project-uninstall-workspace.mjs`,
  `lib/runtime-projection-removal.mjs`, `schemas/pipeline.governance-scope.v1.json`,
  `schemas/project-uninstall-journal.schema.json`, `schemas/project-uninstall-plan.schema.json`,
  `schemas/project-uninstall-request.schema.json`, `scripts/advisory-host-bridge.mjs`,
  `scripts/browser-evidence-preflight.mjs`, `scripts/check-artifact-topology.mjs`,
  `scripts/codex-advisory-app-server.mjs`, `scripts/codex-host-advisor-route.mjs`,
  `scripts/codex-sandbox-preflight.mjs`, `scripts/codex-sandbox-runtime.mjs`,
  `scripts/design-advisory-admission.mjs`, `scripts/design-advisory-coordinator.mjs`,
  `scripts/host-advisor-workspace.mjs`, `scripts/project-activation.mjs`,
  `scripts/project-uninstall.mjs`, `scripts/sandboxed-readonly-host-bridge.mjs`,
  `harness/scripts/verify-case-completion-augmentation.mjs`,
  `harness/scripts/verify-case-completion-augmentation.test.mjs`,
  `harness/config/verify-case-completion-augmentations.v1.json`,
  `lib/verify-case-completion-receipt.mjs`, `harness/scripts/check-verify-suite-registration.mjs`,
  `lib/test-case-completion.mjs`, `lib/enrollment-retirement-coordinator.mjs`, and the schemas
  `pipeline.enrollment-retirement-archive.v1.json`, `pipeline.enrollment-retirement-coordinator.v1.json`,
  `pipeline.enrollment-retirement-result.v1.json`, `pipeline.enrollment-retirement-inspection.v1.json`,
  `pipeline.plan-invalidation.v1.json`, `pipeline.enrollment-git-creation-plan.v1.json`,
  `pipeline.enrollment-git-creation-barrier.v1.json`, `pipeline.enrollment-git-removal-barrier.v1.json`,
  `pipeline.enrollment-git-creation.v1.json` (each under `schemas/` and the project-root mirror).
- `866be2139` (2026-10-05, ALFRED-QP5 closure repair, 9): `lib/bound-design-line-endings.mjs`,
  `lib/claude-initial-prompt-pointer.mjs`, `lib/claude-intake-prompt-capture.mjs`,
  `lib/claude-task-output-read-scope.mjs`, `lib/design-authoring.mjs`,
  `lib/model-family-discovery.mjs`, `lib/runtime-handover-projection.mjs`,
  `scripts/check-runner-manifest-parity.mjs`, `scripts/model-family-approval-request.mjs`.
- `46bf6a651` (2026-10-05, S2-70 guard split, 22): the modules extracted verbatim from
  `hooks/guard-lifecycle-ready.mjs`, `lib/guard/bootstrap-receipt.mjs`, `lib/guard/command-catalogue.mjs`,
  `lib/guard/constants.mjs`, `lib/guard/denial-route.mjs`, `lib/guard/denial-telemetry.mjs`,
  `lib/guard/devplan-shell-lane.mjs`, `lib/guard/dispatch-record-lane.mjs`,
  `lib/guard/entry-gates.mjs`, `lib/guard/evaluate.mjs`, `lib/guard/gate-strength-lane.mjs`,
  `lib/guard/grammar-denials.mjs`, `lib/guard/lifecycle-gate.mjs`, `lib/guard/path-containment.mjs`,
  `lib/guard/po-commands.mjs`, `lib/guard/powershell-dialect.mjs`, `lib/guard/read-scope.mjs`,
  `lib/guard/rebase-lane.mjs`, `lib/guard/sanctioned-args-onboarding.mjs`,
  `lib/guard/sanctioned-args-scripts.mjs`, `lib/guard/shell-grammar.mjs`, `lib/guard/verdict.mjs`,
  `lib/guard/write-scope.mjs`; they carry the lane verdicts that file used to hold, so they carry the
  same authority.

## Alternatives considered

- **Extend HGO's existing single-tool-call capability to cover GS-6.** Rejected:
  HGO's `chat`-mode activation step is an ordinary in-session command, which is
  exactly the property that makes it inadmissible in `signature` mode
  (`guard-testpath.mjs`'s own reasoning) — reusing that shape for GS-6 would
  reintroduce the same hole one file over.
- **A broad "lift everything" window with no per-rule scoping.** Rejected on
  the advisory consult's explicit finding: a window that also covers GS-1..GS-5/GS-7
  lets an agent commit a weakened `push_approval` whose effect outlives the
  window entirely. Scope is closed and enumerated, never a wildcard.
- **Rely solely on the "separate installed plugin copy" workflow already hinted
  at in GS-6's own code comments.** Not rejected — kept as the *primary* route
  and unaffected by this ADR. But it cannot substitute for same-session testing
  of a guard fix against the very session enforcing it, which is this
  repository's daily mode under ADR-0015; the window is the complementary route
  for exactly that case.

## Follow-up

- The residual worktree-merge risk noted under Consequences should get its own
  guard (e.g. refusing a same-repo merge/checkout that changes bytes under a
  live plugin root without a passing Critic record for the merged commit) —
  not yet built; track as a backlog item once GMW itself has shipped and been
  Critic-reviewed.
- `deploy`/`publication` are untouched by this ADR; if a maintenance-window
  need is ever raised for them, the shape proven here (closed scope, no
  activation step, bounded TTL) is the template to reuse.
- `plugins/pipeline-core/lib/guard-authority-ledger-intake.mjs`'s addition to
  `NEVER_LIFTABLE_KERNEL_PATHS` (2026-08-10 correction above) is endorsed but
  not yet applied — the array itself is edited when that module ships, not
  here. Trigger: land alongside that module.
- Two kernel-membership questions raised at `self-application-attestation-gate.mjs:45-47` remain
  undecided by this ADR — corrected here from an earlier version of this bullet, which named only
  one of them and mislabeled it (see the 2026-08-10 correction above). Neither is the intake module
  above; both are a separate module, a separate decision:
  - `plugins/pipeline-core/lib/self-application-attestation-gate.mjs` itself (the live-enforcing
    copy is governed by GS-6, the window-liftable rule).
  - `plugins/pipeline-core/lib/public-core-origin-allowlist.mjs`, GS-8's actual module.

  Owner `pipeline`. **Trigger:** resolved when a dated correction to this ADR either adds the
  relevant path(s) to `NEVER_LIFTABLE_KERNEL_PATHS` or records, on the record, that the
  maintenance-cost tradeoff (permanently uneditable under any window, per Decision 3) is accepted
  and the exposure stays — the same two-way trigger shape §15.1.6 (v) of the caching design now uses
  for the analogous `guard-testpath.mjs` question, not a default of leaving the question open
  indefinitely.
- `plugins/pipeline-core/hooks/guard-testpath.mjs`'s own membership in
  `NEVER_LIFTABLE_KERNEL_PATHS` — the question the entry above uses only as an
  analogy — is itself raised here, not yet decided.
  `backlog/items/2026-08-10-guard-testpath-not-kernel-protected-like-its-
  sibling.md` names the same recursive-hole shape Decision 3 already protects
  `guard-gate-strength.mjs` against: `guard-testpath.mjs` is the enforcement
  hook for the entire TP-* rule family, so a GS-6 window opened for any
  legitimate, unrelated purpose would let its first edit weaken or remove a
  TP-* refusal, and that edit would survive the window's own expiry — this
  file's own `Governs:` line already lists `guard-testpath.mjs`, so the
  question sits squarely inside this ADR's authority. `PIPE-WP-GTP-KERNEL`
  (2026-08-11) attempted the array addition the backlog item proposes and
  correctly stopped rather than ship it without this recorded decision —
  the stop is what surfaced that the question had only ever been used as an
  analogy above, never itself tracked.

  Owner `pipeline`. **Trigger:** the same two-way shape as the entry above —
  a dated correction that either adds the path to
  `NEVER_LIFTABLE_KERNEL_PATHS` or records that the maintenance-cost
  tradeoff is accepted and the exposure stays. The backlog item names the
  cost precisely: once added, a genuine bug in TP-*'s own enforcement logic
  would need a different, out-of-session route to fix (the PO editing it
  directly, or a separate installed-plugin-copy workflow) — the same
  limitation this repository already accepts for `guard-gate-strength.mjs`
  today. That tradeoff is the PO's to weigh, not a default either way.

  **Resolved, 2026-08-11 (PO decision).** The exposure stays;
  `guard-testpath.mjs` is NOT added to `NEVER_LIFTABLE_KERNEL_PATHS`. PO
  rationale, recorded as given: a GMW window is itself human-authorized to
  open — it requires the PO's own signature — and this repository's guard
  system is built to bound what an AGENT can do without a human step, not
  to bound the PO, who can already change any file directly, guard or no
  guard, outside a session entirely. Any edit reachable through an active
  window, including one to `guard-testpath.mjs`, only becomes reachable
  after the PO has already signed that window into existence. On that
  reasoning, the marginal exposure this bullet raised is not accepted as a
  live risk worth the permanent-uneditability cost. This resolves the
  two-way trigger above by the second branch: the tradeoff was weighed, not
  defaulted, and the exposure stays.
