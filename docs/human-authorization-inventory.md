# Human authorization inventory

Every human intent/gate this repository's code implements today, found by
searching `plugins/pipeline-core/scripts/pipeline-state.mjs`,
`plugins/pipeline-core/scripts/po-human-approval.mjs`,
`plugins/pipeline-core/scripts/po-approval-gate.mjs`, and the `lib/` modules
those files import, for every `approve-*`/`submit-*`/`authorize-*` CLI
subcommand and every `createPoApprovalIntent(...)` call site. Classified by
whether the gate sits on the shared `pipeline.po-approval-proof.v1`
detached-proof contract (ADR-0055/ADR-0056: a candidate-bound Ed25519
signature, `signature` mode, or an explicit `chat`/waiver attribution record)
or on a different mechanism. This is a point-in-time inventory (2026-08-18);
re-derive it from the code rather than trusting it stale, per this
repository's own "code beats spec" convention.

This is #3 of the 5-work-package scope in
`backlog/items/2026-08-02-unified-human-authorization-ux.md`'s 2026-08-18
scoping pass. It supersedes that item's own prose where the two disagree:
several gates below (`publication`, `feature-package-reconcile`) have since
moved onto the shared contract by commits landed after that scoping pass was
written (notably `cbeeda8d` "port ADR-0061 authorize-critical ceremony into
Phoenix" and the H-AC-11/H-AC-12 commits) — this document reflects the code
as read today, not the backlog note.

## On the shared `pipeline.po-approval-proof.v1` contract

For each: `verifyCriticalHumanProof`/`createPoApprovalIntent` rebuilds the
approval intent from what the guard/CLI observes (never trusts the mutable
state record), verifies a detached Ed25519 signature against the committed
trust-anchor set in `project/critical-human-proof.json`, and is bound to the
exact candidate commit+tree.

| Intent/gate | Authorizes | `kind` | Mode source | Authoring file(s) |
|---|---|---|---|---|
| Push | `git push` of the candidate commit to a remote/ref | `push` | `gates.push_approval` in `pipeline.user.yaml` (`signature`\|`chat`, default `signature`); ADR-0056 | `plugins/pipeline-core/scripts/pipeline-state.mjs` (`approve-push`, ~L7123-7257), `lib/critical-action-authorization.mjs`, `hooks/guard-push.mjs` |
| Deploy | Consuming a deploy approval for `{artifact, environment}` | `deploy` | `project/critical-human-proof.json` `requiredKinds`/waiver only (no `pipeline.user.yaml` key); ADR-0055/0056 | `plugins/pipeline-core/scripts/pipeline-state.mjs` (`approve-deploy`/`consume-deploy`/`clear-deploy`, ~L7387-7507), `lib/critical-action-authorization.mjs` |
| Publication | `publication-approve` (a State→publication projection transaction) | `publication` | `requiredKinds`/waiver only (no `pipeline.user.yaml` key) | `plugins/pipeline-core/scripts/pipeline-state.mjs` (`runPublicationCommand`, ~L2618-2802) |
| Feature-package reconcile | `feature-package-reconcile` (cross-repository package reconciliation) | `feature-package-reconcile` | `gates.reconcile_approval` in `pipeline.user.yaml`, same shape as push (ADR-0056 2026-08-11 follow-up) | `plugins/pipeline-core/scripts/pipeline-state.mjs` (`defaultFeaturePackageReconcileApproval`, ~L6259-6284); this kind is in `ALWAYS_REQUIRED_KINDS` — always demanded, not gated by `requiredKinds` membership |
| Governance fork disposition | Disposing of a forked-subagent scope-creep finding | `governance-fork-disposition` | Same shared contract | `plugins/pipeline-core/scripts/po-human-approval.mjs` (`runForkDispositionApproval`, ~L426-484) |
| Critical action (generic H-AC ceremony) | The ADR-0061-ported "authorize-critical" flow: an agent-prepared request over one of the `CRITICAL_ACTION_KINDS` (`push`, `deploy`, `publication`, `governance-fork-disposition`, `feature-package-reconcile`), authorized externally | `critical-action` (outer intent) wrapping the actual action `kind` + `subjectSha256` in the signed subject | Same shared contract | `plugins/pipeline-core/lib/critical-action-approval-request.mjs`, `plugins/pipeline-core/scripts/po-human-approval.mjs` (`criticalApprovalRequest`, ~L223-249) |
| Guard Maintenance Window (GMW) install | Time-boxed PO-signed exception letting a self-protecting guard rule (GS-6, protected test paths) honor an additional allow-path | `guard-lift` | Same shared contract, trust-anchor default `project/critical-human-proof.json` | `plugins/pipeline-core/lib/guard-maintenance-window.mjs`; ADR-0058; `docs/guard-maintenance-window-threat-model.md` |
| Human Guard Override (HGO), signed route | Signed admission past a PreToolUse guard denial for one exact request/plan pair | `guard-override` | Same shared contract (default trust anchor same file); the `activate`/chat route also exists alongside this signed one (ADR-0059 Decision 1) | `plugins/pipeline-core/lib/human-guard-override.mjs` (~L1796-1825), `plugins/pipeline-core/scripts/guard-human-override.mjs` |
| Threat model approval (Cyborg CYB-4) | PO decision on a threat-model boundary (`approved`/other) | `threat-model` | Same shared contract — the original adapter this whole contract generalized from | `plugins/pipeline-core/lib/threat-model.mjs`, `lib/threat-model-approval-request.mjs` |
| Security authority proof | A recorded security-authority decision | `security-authority` | Same shared contract | `plugins/pipeline-core/lib/security-authority-proof.mjs` |

**Note on `guard-override`'s `global-plugin-install` denial class:** deliberately
NOT extended to the signed route (no candidate commit/tree exists for that
denial to bind a proof to) — it keeps only the chat-mode route. Documented
in `lib/human-guard-override.mjs` as a scoped, reported deviation, not a gap.

## NOT on the shared contract (a different mechanism)

| Intent/gate | Authorizes | Mechanism | Authoring file(s) |
|---|---|---|---|
| Plan/PRD approval (`approve-plan`) | Approving a submitted plan, moving the feature out of `awaiting-approval` | Repository-scoped **PO-gate-authority binding**: `poGateAuthority`/`validatePoGateAuthorityForRepository` plus `poGateProfile`/`validatePoGateProfileForRepository` — checks the authority's bound `planPath`/`planSha256`/`specSha256` against the submitted plan, no Ed25519 proof involved | `plugins/pipeline-core/scripts/pipeline-state.mjs` (`approve-plan`, ~L6869-6939) |
| PO-authority rebind (`po-authority-rebind-plan`/`-apply`) | Rebinding the PO-gate-authority record itself to a new manifest/profile (the mechanism `approve-plan` depends on) | Amendment-record-gated transaction (recent hardening: `feat(pipeline-core): require amendment record for immutable manifest rebinds`); not the Ed25519 proof contract | `plugins/pipeline-core/scripts/pipeline-state.mjs` (`runPoAuthorityRebindCommand`, ~L5224-5260 and helpers ~L4668-5220) |
| PO-authority decision (`po-authority-decision-plan`/`-select`/`-apply`) | Recording a PO decision that revises authority (a decision-selection transaction distinct from a manifest rebind) | Same PO-gate-authority family as above, own plan/select/apply transaction, not the Ed25519 proof contract | `plugins/pipeline-core/scripts/pipeline-state.mjs` (`runPoAuthorityDecisionCommand`, ~L5261-5401 and `buildPoAuthorityDecisionPlan` ~L4901-5075) |
| Push (`chat` mode) | Same push action as above, when `gates.push_approval: chat` | Explicit, self-declaring **attribution record** — a human runs the approval command in-session; ADR-0056 states plainly this is "an attribution record, not proof of a human" | `plugins/pipeline-core/scripts/pipeline-state.mjs` (`approve-push`), `lib/critical-human-proof-policy.mjs` |
| Deploy/Feature-package-reconcile (waived) | Same actions as above, when a kind carries an ADR-0055 waiver in `project/critical-human-proof.json` | Recorded waiver (`kind` + `reason`), a committed, diffable, attributable act of standing the cryptographic check down — not proof | `plugins/pipeline-core/lib/critical-human-proof-policy.mjs` |

## Explicitly out of scope for this inventory

Read-only/mechanical state transitions that do **not** gate on a human
decision were excluded rather than padding the tables above: `set-feature`,
`set-phase`, `submit-plan`, `reopen-design`, `seal-plan-approval`,
`revoke-plan`, `bind-plan-spec`, `close-feature`, the `continuity-*`
subcommands (`continuity-adoption-*`, `continuity-result-close-*`,
`continuity-result-bootstrap-*`, `continuity-result-rebind-*`,
`continuity-result-case-migration-*`), and the `authority-revision-*`
subcommands. These are Elephant/session-continuity bookkeeping or
already-approved-authority projections; none of them independently ask a
human for a decision the way the two tables above do. If a future pass finds
one of these secretly gating on a human decision, it belongs in this
document and this note should be corrected, not left to imply certainty
this Goldfish pass did not verify line-by-line for every listed subcommand.

## Known gaps, stated rather than glossed

- **`deploy` and `publication` have no `pipeline.user.yaml` mode key** — only
  `push` and `feature-package-reconcile` got the `signature`/`chat` operator
  control (ADR-0056 §5, §Follow-up). Standing either down still requires an
  explicit waiver in `project/critical-human-proof.json`.
- **`approve-plan` staying off the shared contract is a recorded PO decision**
  (`backlog/items/2026-08-05-critical-human-proof-not-wired-to-push-and-prd-gates.md`,
  "Option B: closed", 2026-08-18), not an oversight — the existing
  PO-gate-authority binding was judged sufficient.
- **Two shapes exist for the same underlying primitive**: the per-kind direct
  path (`verifyCriticalHumanProof` rebuilding an intent with `kind` set to the
  action itself — `push`/`deploy`/`publication`/`feature-package-reconcile`)
  and the generic `critical-action` wrapper
  (`createCriticalActionApprovalRequest`, `kind: "critical-action"` with the
  real action kind nested in the signed subject) used by
  `po-human-approval.mjs`'s `criticalApprovalRequest`. Both verify against the
  same trust-anchor family and the same underlying `po-approval-proof.mjs`
  primitive; this pass did not trace whether every one of the five
  `CRITICAL_ACTION_KINDS` is reachable through both shapes end-to-end.
- **ADR-0056's 2026-08-16 correction**: the committed trust anchor is now a
  SET (`trustAnchors`, schema `.v3`) and, in this repository, currently
  **empty** — meaning "any well-formed Ed25519 key may sign" rather than a
  pinned identity, per `docs/adr/0056-push-approval-mode.md`'s own correction
  section. The repository-local `lib/critical-human-proof-policy.mjs` does not
  read `.v3` at all; ceremonies must use the installed plugin build.
