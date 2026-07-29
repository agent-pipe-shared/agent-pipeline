<!-- po-language: en -->

# PRD — Agent Pipeline 0.4.7 hotfix

> Product Review Document for the PO gate. Status:
> `expanded 0.4.7 corrective implementation candidate in progress on
> 2026-07-29; the final stabilized PRD/Spec bytes require a fresh digest-bound
> PO selection before candidate freeze`.
> Task: `agent-pipeline-0.4.7-hotfix` · Feature · Rigor 2 · Risk high.
> Base: public 0.4.6 release at
> `9d1b3dc108eb77629ace5b82002120f5539abd8d`. Acceptance criteria:
> [spec.md](spec.md).

<!-- technical-spec-sha256: cef5983ec352601de8ae8652ffc56212c07869a7238687c300992c2c284af762 -->

The 2026-07-28 approval remains historical evidence for the already
implemented slices. The Human/PO explicitly directed implementation of the
revised recovery and attended-override scope on 2026-07-29. This authorizes
repository-local implementation and verification only; it does not authorize
push, merge, tag, release, Issue mutation, Pull Request operation, or mutation
of a downstream Sprint checkout.

## Final expanded release authority — 2026-07-29

This section supersedes every narrower historical scope and deferral below.
The Human/PO activated this expanded scope; once the implementation documents
stop changing, their exact final digests must be selected again through the
sanctioned authority writer.

The already published corrective baseline is
`41c09045e73b95988a335bcf1c476734f7785302`. It is the implementation base for
the remaining work, not a complete `0.4.7` release candidate. The final release
scope is:

- Issue #70 / AC-047-01–02: canonical backlog ledger admission while the item
  remains open;
- Issue #63 / AC-047-03–08: typed V4 source diagnosis plus absent-manifest
  plan/confirmed apply/readback;
- Issue #73 / AC-047-09–15 and AC-047-27–50: retained guarded bootstrap,
  cross-platform runtime/private-state, authority, cleanup, publication and
  attended-override repairs;
- Issue #71 / AC-047-16–23: reactive, typed WSL AF_UNIX incompatibility
  detection plus an opt-in, digest-bound, session-only compatibility profile;
- the discovered kickoff correction / AC-047-51: an explicitly unapproved
  writer-shaped kickoff state with an omitted approval object is not persisted
  PO authority, while approved/malformed lookalikes remain fail-closed; and
- Issue #77 / AC-047-52–60: one restart-safe close coordinator separating
  checkpoint, feature close, candidate freeze, final Verify, optional
  publication/readback, cleanup and later release/promotion; and
- Issue #80 / AC-047-24 and AC-047-61–68: a versioned split between immediate
  model-free Advisor capability preflight and concrete, demand-bound
  consultation, with no model child or timeout wait during bootstrap.

The 180,000/90,000 ms Advisor budgets apply only after a valid on-demand
consultation trigger. Issue #72/native Apple Silicon remains a follow-up and
is not a `0.4.7` platform gate.

The expanded scope reopens security, lifecycle, generated-authority and
machine-local configuration surfaces. Therefore the immutable final candidate
requires fresh candidate-bound Full Verify, blocking Security and independent
high-risk Critic evidence. Earlier full-run evidence remains historical only.
Candidate freeze and final evidence may not start until the stabilized revised
PRD/Spec bytes are selected again through the sanctioned authority writer.

## Historical narrowed candidate truth — 2026-07-29

This section records the previously approved narrowed scope and is superseded
by “Final expanded release authority” above.

The implementation baseline is commit
`0f36072f5250708e59d200ef802bdfdba92adccf`, tree
`f77f533b94180bf9a7f77a4c046db5b96fa9fd86`, on
`hotfix/issue-73`. Against `origin/main`
`9d1b3dc108eb77629ace5b82002120f5539abd8d`, that baseline is 26 commits
ahead and zero behind. The former candidate
`0e6d9cdd4089620cc783d87c947e00e026379b28` is a reachable
intermediate ancestor.

`0f36072` passed Full Verify and blocking Security before the independent
high-risk Critic identified seven delta-scoped hardening gaps. The corrections
to persisted PO-authority observation, attended-override path/audit/plugin
identity, composite crash recovery, candidate composition, and deferred-work
governance are composed in one local publishable candidate whose tree excludes
operational Pipeline State. Per the PO's 2026-07-29 instruction, that delta
receives focused regression evidence and a diff-bounded Critic; the already
green full-run evidence remains the baseline and is not rerun. Exact candidate
identity is reported by Git and package readback rather than embedded
recursively in its own document bytes.

At this historical narrowed baseline, the product truth was deliberately
narrower than the original aggregate 0.4.7 plan:

- implemented and retained: the closed guard grammar, cross-platform restart
  and private-state fixes, exact legacy continuity adoption, transactional
  stale-marker PO authority rebind, closed/design re-entry, descriptor-bound
  cleanup recovery, the neutral PO-authority decision, composite orphan/lost
  binding recovery, portable publication baseline guard, and attended
  one-action Human override;
- deferred and removed from this hotfix's release contract: backlog admission,
  generic V4 source/manifest recovery, WSL IPC compatibility/profile work,
  and the 180/90-second Advisor timeout change;
- still required before any release claim: final digest-bound PRD/Spec
  authority, an immutable candidate commit/tree, the green `0f36072`
  Full-Verify/Security baseline plus focused correction-delta regressions and
  a diff-bounded independent high-risk Critic,
  packaging/version consistency, installed readback, and a clean
  lifecycle/readback state.

### Historical deferral ownership and expiry (fully superseded)

This register records the former narrowed decision. The final expanded
authority later activated H1, H3, H4 and H6:

| Formerly deferred work | Current disposition |
| --- | --- |
| AC-047-01–02 backlog admission | Activated in 0.4.7; H1 is required. |
| AC-047-03–08 generic source/manifest recovery | Activated in 0.4.7; H3 is required. |
| AC-047-16–23 WSL IPC compatibility/profile | Activated in 0.4.7; H4 is required. |
| AC-047-24 Advisor 180/90-second budgets | Activated with #80 in 0.4.7; budgets are consultation-only and never consumed by bootstrap. |

All earlier deferrals are provenance, not permission to omit required release
slices.

The first repaired defect is distinct from the previously implemented narrow
stale-marker repair. It includes both divergent document bytes and the common
post-authoring state where the PRD marker already matches the current Spec but
State/Continuity still bind the previous document digests. Outside the narrow
repair shape, V4 can return `partial` with diagnostic
`po_authority_rebind_unavailable` and `nextAction:null`, even while repository,
runtime, continuity, and App Server are otherwise ready. The implementation exposes
one closed read-only plan that preserves both document candidates for the PO
decision. It must not infer which candidate is authoritative.

The plan must show each candidate's path, document role, provenance, and
current digest. Its apply action must be typed, bound to the exact plan digest,
require explicit PO confirmation, revalidate document, State, Continuity, and
plan digests, fail closed on any drift, use only the sanctioned lifecycle/State
writer, retain both document versions, and return the active feature to
`design` while preserving the updated Continuity. No manual State, Runtime,
Continuity, Cleanup, PRD-binding, or projection edit is an acceptable recovery.

A remaining multi-generation variant appears when the current documents, PRD
marker, persisted PO gate, and Continuity no longer form one prior/current
pair. A coherent-current-document consumer may retain only older Continuity;
another consumer may carry independently stale marker, PO-gate and Continuity
generations. These are legitimate neutral-selection inputs only when every
historical surface remains structurally valid and the current documents and
PO profile independently pass full validation. The planner must disclose and
digest-bind all generations, leave the choice to the PO, and expose the same
confirmed State-writer path. Human Guard Override remains forbidden for this
authority transition.

A second repaired deadlock exists when portable State still binds a missing private
cleanup descriptor while every remaining private descriptor is independently
safe to retire. Composite recovery binds the complete orphan set and portable
preimage plus the deterministic State-release postimage, retires only that
exact set, then releases only the unchanged lost binding. A crashed
process-owner lock is reclaimable only after the owner is proven dead; replay
never adopts arbitrary same-shape State bytes. The publication guard rejects
a candidate that retains a machine-local cleanup handle.

Finally, guards remain an agent-control boundary, not a mechanism for overruling
an attended Human/PO. A Human must be able to authorize one otherwise denied,
eligible tool action without disabling a guard. The authorization must be
bound to the exact repository, tool input, denial set, source/State preimage,
complete plugin policy/adapter/CLI identity, reason digest, expiry, and
one-use nonce. It must be stored owner-private outside the tracked worktree
and recorded in a keyed, tamper-evident audit chain before the action is
admitted. Capability use requires its matching authorization event. Physical
path escapes, runtime projections, every Git invocation, safety invariants,
external publication, direct lifecycle-State edits, and secret-bearing
requests remain non-overridable.

For transparent continuity with the original contract, AC-047-01 through
AC-047-29 keep their identifiers and receive the normative dispositions in
the revised Spec. AC-047-30 through AC-047-50 define the new repairs.

### Product decisions to bind to the reconciled bytes

1. Bind AC-047-01–68, including AC-047-24, as the complete 0.4.7 corrective
   implementation scope.
2. Bind the current PRD and Spec bytes as design authority only, not as release
   evidence or an immutable candidate claim.
3. Require candidate-bound focused regressions, two independent Critic views,
   Full Verify/Security, package/readback and local installed/live evidence.
4. Keep publication, main update, merge, final `0.4.7` version, tag, release,
   marketplace mutation and downstream Sprint operations separately gated.

## Historical candidate audit status — 2026-07-28 (non-normative)

The 15-commit audit and its broader scope record why the 2026-07-29
disposition was necessary. It is retained only as provenance. It does not
describe the current worktree, current acceptance scope, or current candidate
evidence.

## What

0.4.7 is a focused corrective release on top of 0.4.6. Its retained contract:

- preserves the already implemented legacy adoption, closed re-entry,
  cross-platform command grammar, and restart/private-state repairs;
- converts general PRD/Spec authority drift from an actionless lockout into a
  neutral, digest-bound, explicitly PO-selected transaction;
- extends that neutral transaction to structurally valid multi-generation
  marker, PO-gate and Continuity drift without treating stale provenance as
  current authority;
- converges the exact lost-cleanup-binding plus safely retirable-orphan
  deadlock through one crash-safe composite recovery;
- prevents publication of a portable baseline containing a machine-local
  cleanup handle; and
- lets an attended Human authorize exactly one eligible denied action through
  an expiring, single-use, tamper-evident capability without disabling guards.
- makes bootstrap Advisor observation immediate and model-free, while a real
  consultation requires one reasoned, digest-bound question and is not
  repeated without material drift.

The release becomes the clean common base for three active Sprint branches. It
contains no Sprint feature work.

## Why

0.4.6 and intermediate 0.4.7 candidates can fail closed without offering a
safe next action. The reproduced lockouts include actionless document
authority drift, a lost cleanup binding combined with otherwise retirable
private descriptors, and portable branch tips that bind machine-local state.
Separately, a Human supervising an agent has no narrow way to authorize one
denied action and is forced into repeated restarts or unsafe broad bypasses.
The hotfix replaces each lockout with an exact, auditable state machine.

## Scope

- **Legacy lifecycle adoption:** a dedicated plan/apply transition recognizes
  only the exact released `codex-onboarding-0.4.5` continuity-adoption
  preimage, reconciles its historical PRD digest with the current
  repository-scoped PO approval, binds the existing Result and exact 0.4.6
  release evidence, and advances only to the ordinary evidence-bound
  `close-feature` gate. Generic CAS authority remains unchanged.
- **PO authority rebind:** a legitimate later Spec change that leaves an older
  PRD marker and matching stale PO-gate/Continuity bindings receives one
  read-only, digest-bound, explicitly PO-confirmed cross-platform rebind. It
  updates all three authority surfaces atomically or rolls back completely;
  it never becomes a generic authority repair or force-close route. An
  interrupted complete postimage is rolled back and replanned because matching
  bytes cannot authenticate a replaced inode.
- **Closed-feature re-entry:** the exact writer-generated closed audit and the
  immediately following unapproved `design` selection are valid lifecycle
  boundaries. This permits the normal close-to-next-feature flow without
  treating arbitrary inactive State as pristine or bypassing cleanup recovery.
- **Neutral authority decision and design re-entry:** repairable document
  divergence or already-reconciled documents with stale State/Continuity
  bindings expose both candidates and require a separately digest-bound PO
  selection. The sanctioned writer converges every authority surface and
  returns the active feature to `design` without discarding Continuity.
- **Multi-generation authority recovery:** structurally valid historical PRD
  marker, PO-gate and Continuity generations may differ independently from
  each other and from current documents. The neutral plan binds and discloses
  every surface; only an explicitly selected and confirmed apply converges
  them to independently validated current document/profile authority.
- **Composite cleanup recovery:** the exact lost portable binding and complete
  safely retirable orphan set are planned, revalidated, retired, released and
  read back as one crash-safe transaction.
- **Portable publication baseline:** push/publication is rejected whenever the
  committed portable Continuity still binds a machine-local cleanup handle.
- **Attended Human override:** an eligible denial can be authorized for one
  exact next tool call through a private authenticated capability and
  tamper-evident audit chain. Direct State edits, publication, destructive
  history operations, path escapes, secrets and guard/source replacement
  remain non-overridable.
- **Portable guard and restart:** one closed command grammar supports native
  Windows paths, the exact PowerShell bootstrap read, and the bounded
  read-only diagnostic pipeline while retaining all mutation and pre-readiness
  denials. Native Windows uses a physical trusted Codex executable and the
  shared owner-private state assurance.
- **Advisor lifecycle:** preserve the frozen V3 runner routes while a V2
  lifecycle contract makes Epic/Feature bootstrap a zero-model capability
  preflight. Consultation requires one allowlisted reason, question/evidence
  digests and exact candidate/policy binding; the evidence digest is derived
  from bounded physical repository-file bytes and those exact bytes reach the
  selected model turn only after independent launcher/bridge/transport
  validation. Unchanged demand is not repeated. Claude and Codex retain their
  same-runner adapters, and only actual Codex consultation may consume the
  180/90-second budgets.
- **Release evidence:** produce independent 0.4.7 focused, platform,
  verification, security, Critic, packaging, and installed-readback evidence
  against one immutable final candidate. Sprint integration remains a later,
  separately authorized activity.

## Production rollback contract

The PO/release owner must renew this contract before any Main publication and
no later than 2026-07-30. Before publication, withhold promotion and use only
an ordinary reviewed revert commit. After publication but before any 0.4.7
writer mutation, reinstall the exact trusted 0.4.6 package, reload Claude Code
plugins or start a new Codex session, and verify version/source and lifecycle
readback. Once any 0.4.7 writer or recovery has mutated state, downgrade is
forbidden: freeze mutation and publish a forward corrective patch using typed
0.4.7 recovery only. Never rewrite shared history or manually repair Pipeline
State, authority, cleanup descriptors, audit, runtime state or private
configuration. The dormant non-default H4 profile may remain; changing or
removing it needs a separate typed confirmed plan. Every rollback or
forward-fix candidate must rerun affected focused gates plus exact-candidate
Full Verify, blocking Security, package, install and lifecycle readback gates.

## Non-goals

- No native Apple Silicon Nova acceptance.
- No merge, cherry-pick, close, or modification of Nova Pull Request #64.
- No Nova supervisors, worker pools, forge, Antigravity, backlog
  reconciliation, or other Sprint feature.
- No general shell/PowerShell interpreter or new arbitrary pre-ready authority.
- No generic continuity migration, force close, arbitrary Result adoption, or
  manual edit of `.claude/pipeline-state.json`.
- No broader close-system redesign beyond #77's minimum corrective slice.
- No guessed replacement of an existing manifest.
- No eager/global WSL workaround, external destination allowlist, credential
  access, or additional private path.

## Risks and mitigation

| Risk | Mitigation |
| --- | --- |
| Legacy adoption becomes a generic authority rewrite. | One exact historical/current preimage, read-only plan, digest-bound confirmed apply, shared lock, atomic CAS, and negative/replay/durability tests; ordinary CAS remains protected. |
| Neutral authority repair silently chooses a document. | Both candidates and all binding provenance are exposed; only a separately confirmed selection digest may mutate authority. |
| Historical authority validation either rejects legitimate generations or trusts stale provenance. | Validate historical schemas, canonical paths and digests structurally; validate current documents/profile independently; disclose every generation and require a plan/selection-bound PO-confirmed writer. |
| Composite cleanup retires a live or changed descriptor. | Complete sorted orphan-set and State preimages, owner/manifest checks, write-ahead journal, CAS revalidation and idempotent crash recovery. |
| Human override becomes a guard-disable switch. | Exact denial/tool/repository/preimage binding, short expiry, single consumption, authenticated private audit, and a closed non-overridable invariant set. |
| Guard parsing authorizes writes. | Closed grammar, per-segment validation, typed denials, hostile and outer-hook tests. |
| Manifest repair replaces foreign data. | Absent targets only; bind source, parent, plan, publication identity, and final readback. |
| WSL workaround exposes local daemons, external destinations, or becomes permanent. | PO-approved warning for `dangerously_allow_all_unix_sockets`; the required `network.enabled` has no domain allow entries; every new WSL Elephant session is nested-standard-first; only a matching `nested-codex-sandbox` failure may activate the profile later in that same session; direct-host observations are never activation authority; a successful nested standard operation after a WSL/Codex fix leaves the dormant profile wholly unused; the profile is never default and narrow duties stay isolated; legacy candidate upgrades require the exact prior private receipt and atomic two-preimage rollback. |
| IPC troubleshooting log leaks machine-local data or becomes an activation oracle. | Closed sanitized schema, owner-private bounded local retention, no raw paths/commands/stderr, and activation consumes typed runtime results rather than log text. |
| Bootstrap capability observation silently becomes a model probe or consultation. | Closed V2 policy/CLI, zero-effects evidence, explicit non-trigger events and process tests proving no prompt, child, receipt or timeout budget. |
| An unchanged or stale Advisor question is repeated or reused across material drift. | Demand and consultation-record digests bind question, reason, evidence, candidate and route policies; identical keys do not launch, drift requires a fresh demand. |
| Advisor evidence is digest-labeled but absent, changed or omitted from the model turn. | Canonical physical-file bundle derives the digest; launcher, bridge and selected transport independently validate path/content/size bindings before child start; the exact runtime-only bytes are rendered into the single model turn as untrusted data. |
| Windows reports false privacy or runs a wrapper. | Owner/DACL assurance, physical direct executable, digest binding, no shell. |
| Sprint rebases keep conflicting implementations. | Changed-path intersection, manual disposition, renewed candidate gates. |

## Alternatives considered

- **Merge PR #64:** rejected because its 200+ files contain cumulative Nova
  work rather than a hotfix.
- **Leave recovery only in Nova:** rejected because the defect blocks the first
  public release after 0.4.6 and belongs in the common base.
- **Enable the WSL profile for every WSL session:** rejected because activation
  would precede evidence and would not retire automatically after a Codex fix.
- **Add isolated command-string exceptions:** rejected because quoting,
  redirects, pipelines, and Windows paths would retain competing heuristics.

## Coverage matrix

| Confirmed input | Disposition |
| --- | --- |
| General PRD/Spec authority drift | AC-047-30–34; implemented in the current worktree |
| Lost binding plus retirable orphans | AC-047-35–38; implemented in the current worktree |
| Machine-local binding in portable tip | AC-047-39–40; publication guard implemented; real-origin readback remains a separately gated release test |
| Attended Human guard override | AC-047-41–47; implemented with private authenticated audit and closed exclusions |
| Multi-generation authority drift | AC-047-48–50; required Phoenix-/Nova-shaped synthetic fixtures and confirmed convergence, with Human Override prohibited |
| Issue #73 retained repairs | AC-047-09–15; retained from the implementation base |
| Released 0.4.6 continuity | Dedicated one-shot Result/PRD reconciliation followed by the existing close gate |
| Backlog, generic source/manifest recovery and WSL IPC profile | Activated by the final expanded release authority as #70, #63 and #71 |
| Unified close ordering | Activated as the bounded #77 minimum corrective slice |
| Advisor capability/consultation lifecycle | Activated as #80; AC-047-24 and AC-047-61–68, with zero-model bootstrap and consultation-only 180/90 budgets |
| Pull Request #64 | Not integrated or operated on |
| Downstream Sprints | No mutation in this hotfix session; later integration is separately authorized |

## DoD

Product completion requires AC-047-01–68, including AC-047-24, in
[spec.md](spec.md).
Completion still requires one immutable candidate commit/tree, all focused
tests, fresh candidate-bound Full Verify/Security, a fresh independent
high-risk Critic over the complete expanded candidate,
packaged/installed plugin readback, version consistency, required platform
semantics, and clean lifecycle/readback. Nova/Phoenix or PR #64 evidence is
inadmissible.

## Decision points

1. The expanded implementation scope for #70, #63, #71, #73, the kickoff
   correction, #77 and #80 is approved; release is not approved.
2. Final PRD/Spec bytes require one matching digest-bound authority decision.
3. The immutable candidate requires the bound green Full-Verify/Security
   baseline, focused correction-delta regressions, diff-bounded Critic,
   packaging and installed readback before any release claim.
4. Push, tag, merge, release and every downstream Sprint mutation require new
   explicit authorization.

## Technical source note

Exact state machines, invariants, tests, implementation surfaces and forbidden
transfer paths live in [spec.md](spec.md). Historical Issue/PR research and
Nova reference commits remain provenance only; none of their State, evidence
or unrelated implementation is part of this candidate.

The legacy-continuity repair is based on the exact released checkout evidence:
the continuity PRD digest is the reachable historical `9825ca78...`, the
current repository-scoped PO approval and released file bind
`217eff32...`, the Spec remains `5a95aa55...`, the existing Result is
`ceed30dd...`, and annotated tag `v0.4.6` dereferences to base
`9d1b3dc1...`. These values are closed preconditions, not configurable
examples.
