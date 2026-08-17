# Sprint Phoenix acceptance matrix

Status: draft

Rigor: 2

Risk: high
Parent specification: [spec.md](spec.md)

Every criterion uses an EARS-style trigger and observable result. This matrix
is normative and is summarized by the Epic criteria in `spec.md`. A package
cannot claim completion from prose review alone; each criterion must map to a
named test or deterministic Verify step and exact candidate evidence.

## Normative interpretation of Spec §§4.4–4.5

For every Phoenix stream, package, briefing, and implementation, Spec §4.4's
“independently configured” retention/access statement means independent
capture eligibility and downstream projection/export decisions within a
selected storage profile. It does not mean independent physical ACLs or
retention for files committed to one Git repository: every portable record
shares the repository's complete access population and durable-history
boundary. A narrower requirement selects `restricted-machine-local` or fails
closed before persistence.

Spec §4.5's “sole read boundary” means that the query/projection service is the
only sanctioned semantic input for replay, viewer, bundle, adapter, ITSM, and
export consumers. It is not the only physically possible filesystem or Git
read and is not a confidentiality control against repository readers. Portable
admission therefore SHALL make direct clone/read exposure safe before the
first durable byte. This interpretation is normative and cannot be weakened by
architecture prose or an implementation briefing.

## PX0 — Lifecycle-authority revision and runner-neutral ruleset source/freshness

- **PX0-AC-01:** WHEN an active design's PRD or Spec candidate changes after
  continuity initialization and before plan approval, THE SYSTEM SHALL reject
  a generic continuity CAS that changes either authority binding and SHALL NOT
  permit a hand-edited State workaround.
- **PX0-AC-02:** WHEN a scoped human design-revision decision is presented,
  THE SYSTEM SHALL produce one closed read-only continuity-authority revision
  request bound to the active feature, exact State revision, current and
  proposed PRD/Spec paths and digests, decision reference, candidate/evidence
  binding, idempotency key, and expiry.
- **PX0-AC-03:** WHEN the dedicated revision request is applied, THE SYSTEM
  SHALL recheck the State preimage, old authority, current proposed artifact
  bytes, exact decision scope/validity, and candidate/evidence tuple under the
  lifecycle writer lock before atomically publishing and reading back the new
  State authority.
- **PX0-AC-04:** IF the feature, phase, plan path, State revision, old/new
  digest, decision scope, expiry, candidate/evidence binding, or idempotency
  tuple is absent, stale, mismatched, reused with different intent, or
  otherwise invalid, THEN THE SYSTEM SHALL fail closed without changing State
  or claiming a revised authority.
- **PX0-AC-05:** WHEN a continuity-authority revision succeeds, THE SYSTEM
  SHALL retain one public-safe correlated lifecycle/audit receipt containing
  stable operation and reason classes, old/new public artifact digests,
  decision/candidate/evidence references, and typed outcome; it SHALL NOT
  persist raw commands, private paths, prompts, user/account data, or private
  machine identifiers.
- **PX0-AC-06:** WHEN the revision is interrupted after a durable stage, THE
  SYSTEM SHALL expose a typed recovery-required state and permit recovery only
  to the exact retained preimage or intended postimage after fresh binding
  checks; it SHALL NOT select a new candidate or infer success from a temporary
  file.
- **PX0-AC-07:** WHEN the exact same completed revision request is replayed,
  THE SYSTEM SHALL return a verified zero-write replay; a conflicting replay
  or a second writer SHALL fail closed and preserve the first read-back
  authority.

- **PX0-AC-08:** WHEN bootstrap resolves a loaded Pipeline distribution, THE
  SYSTEM SHALL emit one closed runner-neutral source observation containing
  runner, selected plugin, version, source class, and the strongest available
  loaded/installed identity.
- **PX0-AC-09:** WHEN a valid Codex-only consumer has no
  `.claude/settings.json`, THE SYSTEM SHALL resolve marketplace source through
  the native Codex registry without reporting `marketplace-unavailable`.
- **PX0-AC-10:** WHEN a valid consumer repository is pre-HEAD, THE SYSTEM SHALL
  compare the loaded plugin identity rather than requiring consumer `HEAD`.
- **PX0-AC-11:** WHEN Claude, Codex, self-application, or local-development
  supplies a source observation, THE SYSTEM SHALL validate it through the same
  common closed contract before freshness evaluation.
- **PX0-AC-12:** IF loaded, installed, source, or remote identity is missing or
  disagrees, THEN THE SYSTEM SHALL return a distinct typed status and SHALL NOT
  infer equality.
- **PX0-AC-13:** WHEN remote freshness needs networking on a host with a known
  network-denied workspace sandbox, THE SYSTEM SHALL use the selected
  network-open/read-only host transport without consuming a known-failing
  sandbox attempt.

  **Amendment (PO, 2026-08-12).** The second clause is satisfied
  (`plugins/pipeline-core/scripts/ruleset-freshness.mjs`'s
  `createWslHostFailClosedSpawn`, replacing the removed
  `createWslHostAttestedSpawn`): under the `host-authorized-wsl` boundary,
  the two network-delegated git calls now always return a synthetic
  refusal without ever attempting to spawn a subprocess — no known-failing
  sandbox attempt is consumed. The first clause is NOT satisfied by
  Increment 1. `createWslHostAttestedSpawn` never delegated to a genuine
  host-side process in the first place — two independent investigation
  dispatches (2026-08-11/12) confirmed it only checked a local Codex
  App-Server health observation, then spawned git in the calling process's
  own sandbox; removing it deletes a misleading mechanism, not a working
  one. A genuine host transport for this clause is not an unfinished
  stub: it is fully designed and unbuilt —
  `design/codex-wsl-freshness-host-action-family.md` §4 (the eight-member
  closed action family), §6 (dispatch/rejection rules) and §11 (states
  explicitly that implementing it would serve this criterion in full) —
  but implementing it requires answering that design's own open §13
  question (Option A/B/C on the threat model's "no repository mutation"
  sentence) and repairing `ruleset-freshness-host.mjs`'s nine broken
  imports (§1, out of scope there). This clause closes only once that
  design is implemented and its own open question is answered — not
  before, and not by another interim placeholder. Recorded in
  `docs/state.md`'s 2026-08-12 checkpoint alongside this amendment;
  `O-1`..`O-5` are a distinct, already-fully-assigned numbering scheme
  belonging to `design/gmw-hgo-evidence-intake-into-the-human-ledger.md`
  (H-AC-11/H-AC-12's design, unrelated to this criterion) — this clause
  is not part of that scheme and is referenced here by criterion ID only.

  **Second amendment (PO, 2026-08-17).** Clause 1's disposition is upgraded
  from the amendment above's "designed but unbuilt" to **structurally
  unreachable from the process this criterion is evaluated in**. Two later
  investigation dispatches (PHX-WP-PX0AC13-HOSTDELEGATION,
  PHX-WP-PX0AC13-REMOVEATTESTATION) found, and this amendment re-verified
  against current source, that no in-process mechanism can satisfy the
  clause. `runPipelineUpdateAvailabilityCli`
  (`plugins/pipeline-core/scripts/ruleset-freshness.mjs`) passes only a
  `spawn` override into `inspectPipelineUpdateAvailability`; it never
  supplies `networkPreflight` or `hostTransport`, and that module neither
  imports nor calls `ruleset-freshness-host.mjs`.
  `observePublicRemoteIdentity`'s host-transport branch is therefore
  unreachable from the CLI entry point —
  `selectHostTransport(undefined, undefined)` returns `null`,
  so every CLI run falls through to the in-sandbox spawn, which under the
  `host-authorized-wsl` boundary is `createWslHostFailClosedSpawn`'s
  synthetic refusal. Nor could the CLI construct the missing inputs:
  `createFreshnessHostAction` and `selectHostTransport` both require a
  64-hex `expectedControlIdentitySha256`, and the only legitimate value is a
  live external control-daemon observation —
  `inspectHostRulesetFreshness` takes it from `observeCodexAppServer()`'s
  `daemonIdentitySha256` (`ruleset-freshness-host.mjs`), and both
  `executeRulesetFreshnessHostAction` and the common reader's receipt check
  independently re-observe and re-compare it before any result is accepted,
  so a fabricated value fails closed at the receipt comparison. In the same
  rigor this repository's H-AC-11 amendment uses: this is a proved
  structural result about the in-process path, not an unfinished
  implementation of it. It does not make the clause unsatisfiable in
  principle — satisfying it requires an out-of-process host adapter invoked
  with a live daemon observation, which is exactly what
  `design/codex-wsl-freshness-host-action-family.md` designs and what the
  amendment above already conditions this clause's closure on. What the
  upgrade settles is the disposition, not the exit: no in-process interim
  can close clause 1, and none should be attempted.

  **Third amendment (PO, 2026-08-17).** §13's own open question is answered:
  Option A accepted (docs/phoenix-governance-threat-model.md's operating-rule
  sentence amended the same day to permit the one bounded local write Part B
  needs). Clause 1 is now unblocked for implementation — building the
  out-of-process host adapter design §13 conditioned this clause's closure on
  is dispatchable; not yet built as of this amendment. WHEN source/freshness diagnostics are rendered or persisted,
  THE SYSTEM SHALL omit tokens, credentials, home paths, cache paths, private
  remotes, SSH key paths, and account coordinates.
- **PX0-AC-15:** WHEN the ruleset source is private or local, THE SYSTEM SHALL
  preserve its classification without exporting its coordinates.
- **PX0-AC-16:** WHEN source equality is claimed, THE SYSTEM SHALL bind the
  claim to the exact loaded identity and exact observed public remote identity.
- **PX0-AC-17:** IF a runner adapter emits unknown keys, ambiguous selectors, or
  more than one selected Pipeline plugin, THEN THE SYSTEM SHALL fail closed.

## K — Governance event kernel

- **K-AC-01:** WHEN a governance event is submitted, THE SYSTEM SHALL validate
  one closed envelope, one origin-specific payload schema, the physical target
  repository, effective policy, and size/classification limits before writing.
- **K-AC-02:** WHEN the same canonical request and idempotency key are replayed,
  THE SYSTEM SHALL return the existing event with zero write.
- **K-AC-03:** IF an idempotency key is reused with different content, THEN THE
  SYSTEM SHALL fail closed without adding an event.
- **K-AC-04:** WHEN an event is published, THE SYSTEM SHALL create one immutable
  canonical file, compute its domain-separated event digest over canonical
  bytes with exactly the `eventDigest` field omitted, bind its previous digest
  and sequence, atomically read it back, emit an independently retainable
  checkpoint witness, and update only replaceable indexes source-last.
- **K-AC-05:** IF two records fork from one predecessor or claim one sequence,
  THEN THE SYSTEM SHALL mark the stream invalid until an explicit governed
  disposition is appended through the sanctioned recovery operation; recovery
  SHALL never delete or rewrite either published record.
- **K-AC-06:** IF a canonical record is truncated, reordered, changed,
  duplicated, symlinked, path-substituted, or bound to another repository, THEN
  offline verification against the required candidate-bound or independently
  retained checkpoint SHALL fail. Without such a checkpoint, verification may
  report only `prefix-valid`/completeness `unknown` and SHALL NOT satisfy an
  authority, bundle, viewer, migration, or release gate.
- **K-AC-07:** WHEN an index/head is absent or stale but canonical records form
  one valid chain up to the required checkpoint, THE SYSTEM SHALL rebuild the
  projection only through `governance-event recover` with exact preimage,
  checkpoint, idempotency, write-ahead, and readback binding, without changing
  canonical records.
- **K-AC-08:** IF a head/index asserts a canonical record that is absent or
  invalid, THEN THE SYSTEM SHALL fail closed rather than trusting the
  projection.
- **K-AC-09:** WHEN a record contains an unknown, unavailable, omitted,
  redacted, invalid, or not-applicable value, THE SYSTEM SHALL preserve the
  exact typed state.
- **K-AC-10:** WHEN any consumer queries multiple streams, THE SYSTEM SHALL
  preserve each record's origin, authority class, integrity, and assurance.

## H — Human Governance Decision Ledger (#30)

- **H-AC-01:** WHEN a supported human decision changes Pipeline authority, THE
  SYSTEM SHALL durably append and read back one exact repository/scope-bound
  decision before making the transition effective.
- **H-AC-02:** IF mutable state claims human authority without a matching valid
  ledger decision, THEN THE SYSTEM SHALL reject the authority claim.
- **H-AC-03:** WHEN approval is requested, granted, denied, cancelled, consumed,
  revoked, expired, corrected, or superseded, THE SYSTEM SHALL use distinct
  linked event types.
- **H-AC-04:** WHEN policy requires candidate, package, artifact, environment,
  action, rule, validity, or single-use binding, THE SYSTEM SHALL reject a
  decision missing or mismatching any required dimension.
- **H-AC-05:** WHEN identity or time is locally attributed rather than
  independently attested, THE SYSTEM SHALL record the lower assurance class and
  SHALL NOT claim verified identity or trusted time. A portable repository
  record SHALL contain only the non-identifying authority/actor class and
  assurance; any natural-person attribution or joinable pseudonymous reference
  SHALL remain in the separately protected, erasable machine-local profile.
- **H-AC-06:** WHEN a `repository-public-safe` authority decision is consumed,
  revoked, expired, or superseded, THE SYSTEM SHALL leave the original event
  unchanged and append the new disposition. This append-only requirement
  applies only to portable repository records. A `restricted-machine-local`
  record SHALL instead follow its authorized expiry, erase, and key-destruction
  policy under H-AC-11/H-AC-13; after the proved erasure boundary, only a
  non-correlating sanitized operation receipt MAY remain, and dependent
  authority SHALL fail closed rather than reconstructing the erased content.
- **H-AC-07:** IF a decision from one repository is presented in another, THEN
  THE SYSTEM SHALL reject it before state or external mutation.
- **H-AC-08:** WHEN a legacy approval/override/deploy record cannot prove its
  original authority tuple, THE SYSTEM SHALL import it only as an unverified
  observation that cannot satisfy a gate.

  **Amendment (PO, 2026-08-17).** Satisfied by construction, not by a live
  import path. Two independent investigations (PHX-WP-HAC08, 2026-08-09
  build and 2026-08-17 re-investigation) confirmed by repo-wide search that
  no code path in `plugins/`, `harness/`, or `scripts/` currently imports or
  migrates a legacy record at all — the WHEN-clause's antecedent has no live
  trigger today. A real candidate source of class `guard-override-jsonl-record`
  does exist (`project/guard-override.log.jsonl`) but is the guard's own live
  token-consumption ledger, not a dormant record awaiting migration, and the
  one real historical import path this repo ever had
  (`scripts/migrate-backlog-state.mjs`) is permanently closed
  (`applyBacklogMigration` refuses once `backlog/transitions.ndjson` exists,
  and it does) and, while it ran, deliberately refused authority-bearing
  legacy records rather than importing them as observations. The clause's
  guarantee holds regardless: `legacy-import-observation`
  (`plugins/pipeline-core/lib/agent-decision-journal.mjs`, drift-tested) is
  the ONLY representable shape a legacy-record import can take in this
  codebase, and it is non-authoritative by construction (rides the existing,
  unmodified `origin === "agent"` → `authorityClass: "non-authoritative"`
  binding), so any future caller that does perform such an import is
  structurally unable to produce anything that satisfies a gate. No further
  code closes this any more completely than the existing shape already does.
- **H-AC-09:** WHEN cross-repository guarded work is authorized, THE SYSTEM
  SHALL bind evaluation, token consumption, ledger placement, and target
  repository to one physical target and SHALL NOT copy private coordinates
  into the coordinator repository.

  **Amendment (PO, 2026-08-17).** Satisfied by construction, not by a live
  binding mechanism. This clause's WHEN-condition — cross-repository guarded
  work being authorized — currently has no trigger in this repository at
  all: CLAUDE.md's Sprint-0 hard rule ("Read-only toward the three project
  repos ... never a write ... until an explicitly approved Phase-4
  migration") forbids the System from authorizing any cross-repository
  guarded work today, and no Phase-4 migration roadmap exists anywhere in
  this repository (confirmed 2026-08-17: repo-wide search for a Phase-4
  migration plan/design returns nothing). Since the antecedent cannot fire
  under current policy, the clause's guarantee holds vacuously and
  permanently unless and until a future Phase-4 migration authorizes
  cross-repository guarded work — at which point this criterion becomes live
  again and needs a real binding mechanism that does not exist yet (the
  external-push-ledger machinery this repo has today is scoped to
  single-repository push proofs only). Building that mechanism now, ahead of
  the policy that would ever call it, would be building ahead of this
  repo's own governing policy rather than closing a gap.
- **H-AC-10:** WHEN a PO authorizes bounded direct Elephant implementation or
  another role exception, THE SYSTEM SHALL record exact scope, reason, expiry,
  constraints, and mandatory follow-up review; it SHALL NOT create a standing
  implicit bypass.
- **H-AC-11:** WHEN a reviewer reconstructs a human decision, THE SYSTEM SHALL
  expose request, actor/authority class and assurance, time and assurance,
  exact scope, stable reason code, policy and rule digests, evidence, outcome,
  consumption, revocation, expiry, correction, and supersession. A
  natural-person attribution or free-form rationale MAY be exposed only from
  a separately protected machine-local decision record to an authorized local
  query. That restricted record SHALL have no portable counterpart or join
  handle and SHALL NOT be persisted in, bundled from, or inferred by a
  repository record.

  **Amendment for GMW (PO, 2026-08-08).** The second clause above cannot be
  satisfied by any identifier scheme for the Guard Maintenance Window (GMW)
  producer specifically: the portable record's required `scope.candidate`,
  `scope.artifacts[].sha256`, `validity.expiresAtEpochMs`, and `ruleDigest` are
  byte-identical to, or recomputable from, values GMW's own machine-local
  record already carries, and that record additionally holds `subject.reason`
  in clear text plus `proof.publicKey`/`proof.keyReference` — an
  attribution-and-rationale record in this criterion's own sense. This is a
  proved result, not an unfinished implementation (impossibility proof:
  `design/gmw-hgo-evidence-intake-into-the-human-ledger.md` §5.2, rules
  R-1/R-2/R-3), and it does not extend to HGO, where the same join reaches
  only digests and no attribution (same §5.2, R-3). Increment 1 does **not**
  satisfy H-AC-11's no-join-handle clause for the GMW half; that would hold
  only if a later, separately reviewed amendment scopes the clause to the
  restricted machine-local profile it actually describes, or GMW's own
  machine-local storage changes so no attributing value remains there.
  Tracked as O-4 in
  `design/gmw-hgo-evidence-intake-into-the-human-ledger.md` §14, owner
  `pipeline` (PHX-2).

  **Amendment for O-4 (PO, 2026-08-17).** O-4 — left open by the amendment
  above as the one condition under which the no-join-handle clause could
  hold — is now decided: the clause is scoped to the record it actually
  describes. No intake design can satisfy "no portable counterpart or join
  handle" while this criterion's first clause simultaneously requires the
  portable record to expose request, exact scope, and the policy/rule
  digests; `design/gmw-hgo-evidence-intake-into-the-human-ledger.md` §5.2
  shows the two records stay joinable through `scope.candidate`, `validity`,
  `ruleDigest`, and the artifact digests even after every identifier is
  removed. The second clause therefore binds the separately protected
  restricted machine-local decision record of that design's §3.4 — the
  profile whose envelope can omit every correlator by typed state — and not
  the enforcement material a producer keeps for its own operation. What that
  producer-side material must satisfy is stated separately and belongs to
  the producer: GMW's machine-local window record exists to enforce a
  window, it is not a ledger record, it is not created by this intake path,
  and this clause does not govern it; its own privacy and retention
  obligations travel with the producer rather than being discharged or
  imposed here. This closes O-4
  (`design/gmw-hgo-evidence-intake-into-the-human-ledger.md` §14, owner
  `pipeline`, PHX-2). It is a scoping decision, not evidence: it removes the
  proved blocker recorded in the amendment above, and the clause is
  satisfied only once the restricted profile demonstrably behaves as
  described, under this criterion's ordinary evidence requirements.
- **H-AC-12:** WHEN an existing guard, plan, release, deployment, or override
  path grants or consumes human authority, including `guard-devplan`,
  `guard-push`, `pipeline-state`, release planning, deploy approval/consumption,
  and Git-guard override consumption, THE SYSTEM SHALL reference and validate
  the canonical decision ID before the transition becomes effective. Every
  direct reader SHALL dual-evaluate during migration, fail on disagreement,
  and carry the shared compatibility owner and expiry.

  **Amendment (PO, 2026-08-17).** For two of the six enumerated readers,
  existing mechanisms already satisfy this criterion's intent, and the PO
  decided on 2026-08-11 that those two close on the mechanism they already
  have rather than being rebuilt against the human ledger. **Release
  planning:** `plugins/pipeline-core/scripts/release-version-plan.mjs`
  derives `decisionId` as a domain-separated SHA-256 over the canonical
  decision payload (`releaseVersionDecisionId`), refuses any decision whose
  stored ID does not rebuild from the complete observation (`RVD-ID`), and
  binds every plan to both that ID and the decision's own digest
  (`plan.decisionId`, `plan.decisionSha256`) before the plan may be
  consumed — a canonical, content-bound decision ID referenced and validated
  before the transition becomes effective. **Deploy approval/consumption:**
  `plugins/pipeline-core/lib/critical-action-authorization.mjs` rebuilds the
  signed subject from what the guard can observe about the action actually
  happening and verifies a detached Ed25519 signature against the key
  identity committed in `project/critical-human-proof.json`, so a recorded
  approval is consumed only when its proof verifies over that exact
  artifact/environment and candidate — authority validated rather than
  believed. This closes two of the six readers, not all of them.
  `guard-devplan`, `guard-push`, `pipeline-state`, and Git-guard override
  consumption remain open and are unaffected by this amendment; that the
  deploy mechanism's module also serves a raw-push route does not close
  `guard-push`, which is enumerated separately here and stays open. The
  amendment addresses this criterion's first sentence for these two readers
  only: the second sentence's migration dual-evaluation, shared
  compatibility owner, and expiry are untouched.

  **Amendment for Git-guard override consumption (PO, 2026-08-17).** Satisfied
  by construction, not by a dual-evaluation call. `plugins/pipeline-core/hooks/
  guard-git.mjs`'s Phoenix authority block (`consumePhoenixOverrideAuthority`,
  line 697) already calls `invokeGovernanceAuthority` →
  `scripts/governance-authority.mjs --request-json`/`--consume-request-json`,
  which delegates to `lib/human-governance-ledger.mjs`'s
  `queryHumanGovernanceDecisions`/`appendConsumedHumanGovernanceDecision` — a
  genuine, canonical-ledger-backed reference-and-validate of the decision ID
  before the override transition becomes effective, satisfying this
  criterion's first sentence independently of the shared
  `decision-reference-dual-evaluation.mjs` primitive. The second sentence does
  not apply to this reader: in a Phoenix-governed repository
  (`governance/events/registry.json` present — true for this repository), the
  override consumption's `if (phoenixGovernedProject())` branch
  (`guard-git.mjs:894-901`) unconditionally requires the ledger-backed
  authority check and hard-exits via `emit()`/`process.exit` on either outcome
  before the plain one-time-token path (`findConsumption`/`appendLedger`,
  `guard-git.mjs:902-916`) is ever reached — independently confirmed by
  reading `emit()` itself (`:767-770`, unconditional `process.exit`). That path
  is structurally unreachable here, not a coexisting legacy verification of the
  same authority claim, and it validates only `rule|token` reuse (no
  decisionId, no ledger, no shape resembling
  `pipeline.human-decision-reference.v1`), so there is no old-path verdict to
  disagree with. The reference this reader validates
  (`PHOENIX_OVERRIDE_REFERENCE_SCHEMA = "pipeline.git-override-authority-
  reference.v1"`, fields `authorityRequest`/`consumption`) is a genuinely
  different shape than `pipeline.human-decision-reference.v1`; the shared
  primitive's own `isDecisionReference` gate
  (`decision-reference-dual-evaluation.mjs:130`) rejects it, so a literal dual-
  evaluation call here would compare a syntax-only precondition (always true
  once reached) against a check that already unconditionally gates the
  transition on its own — never able to disagree, adding no protection.
  Git-guard override consumption is the sixth and final reader; all six are
  now dispositioned (two by this amendment's own PO decision above, two by
  dual-evaluation wiring, one — `pipeline-state`'s deploy/push half — folded
  into `guard-push`, and this one by construction).
- **H-AC-13:** IF a proposed portable ledger entry contains a secret, raw
  prompt, complete transcript, unrestricted command/output, private path, or
  private coordinate, natural-person identifier, joinable pseudonym,
  free-form rationale, or any data whose policy requires selective access,
  finite erasure, correction in place, or a retention period shorter than the
  repository's, THEN THE SYSTEM SHALL reject portable persistence before any
  temporary or final file exists. Deterministic redaction MAY produce a new
  public-safe request only when the result is classified for the repository's
  single access/retention trust zone.
- **H-AC-14:** WHEN the human-ledger package is declared complete, THE SYSTEM
  SHALL provide maintained schemas, event taxonomy, authority/trust model,
  threat model, migration, retention, recovery, and operator guidance.
- **H-AC-15:** WHEN the human-ledger conformance suite runs, THE SYSTEM SHALL
  cover grant, denial, consumption, expiry, revocation, correction, retry,
  concurrency, interruption, tampering, stale candidate, cross-repository
  binding, and redaction.

## A — Agent Decision and Assumption Journal (#31)

- **A-AC-01:** WHEN an agent declares a material assumption or selection, THE
  SYSTEM SHALL record its domain, status, selected option, stable reason codes,
  evidence basis/gaps, and revalidation trigger before dependent action where
  policy requires.
- **A-AC-02:** WHEN an assumption becomes verified, contradicted, expired,
  invalidated, or superseded, THE SYSTEM SHALL append a linked event without
  rewriting the original.
- **A-AC-03:** IF a changed material assumption affects a package, candidate,
  decision, or evidence result, THEN THE SYSTEM SHALL identify the affected
  objects and invoke the governed revalidation/invalidation path.

  **Amendment (PO, 2026-08-17).** No such mechanism exists anywhere in this
  codebase (confirmed by direct search: no "governed revalidation/invalidation
  path" of any kind, for any object type, in `plugins/pipeline-core/{lib,scripts}`),
  and none is planned for this epic. The PO decided against scoping and building
  a new dependency-graph/cascade subsystem to satisfy this clause — this is a
  scope decision, not an implementation gap left for a future dispatch.
  A-AC-03 is descoped from Sprint Phoenix: the criterion's cascade requirement
  is withdrawn, satisfied by the epic's explicit decision not to build it,
  the same disposition class as H-AC-08 (`docs/state.md`, commit `29f29185`).
  Should a future epic need assumption-driven revalidation, this is the
  starting reference (design/agent-decision-journal-production-producer.md
  §5's H-AC-08 disposition follows the identical pattern for a sibling
  criterion).
- **A-AC-04:** WHEN an agent asks for human authority, THE SYSTEM SHALL correlate
  the request to the human ledger and SHALL NOT self-confirm it.
- **A-AC-05:** WHEN runner, model, effort, profile, role, adapter, or capability
  identity is recorded, THE SYSTEM SHALL include its provenance and assurance.
- **A-AC-06:** IF a journal request contains hidden reasoning, raw prompts,
  complete transcripts, secrets, private paths, unrestricted commands/output,
  or duplicated artifact bodies, THEN THE SYSTEM SHALL reject or
  deterministically remove the prohibited content before persistence.
- **A-AC-07:** WHEN capture policy marks a security, privacy, authority,
  candidate, external-side-effect, recovery, or verification-scope event
  mandatory, THE SYSTEM SHALL NOT silently sample or discard it.
- **A-AC-08:** WHEN delivered work originated from a dispatch, THE SYSTEM SHALL
  retain a matching public-safe dispatch reference and detect missing required
  provenance.
- **A-AC-09:** WHEN routine low-impact activity is not material, THE SYSTEM
  SHALL avoid producing exhaustive reasoning or token-level telemetry.
- **A-AC-10:** IF agent journaling is unavailable, THEN THE SYSTEM SHALL apply
  the event class's explicit fail-open/fail-closed policy and expose the gap.
- **A-AC-11:** WHEN an assumption state is recorded, THE SYSTEM SHALL preserve
  `assumed`, `inferred`, `observed`, `verified`, `contradicted`,
  `unavailable`, and `unknown` as distinct typed states.
- **A-AC-12:** WHEN journal retention, access, or integrity policy is resolved,
  THE SYSTEM SHALL keep capture eligibility and downstream projection/export
  policy independently configurable from the human ledger without permitting
  either policy to weaken the other's authority boundary. Portable records in
  one Git repository SHALL share that repository's access and retention
  boundary; a stream requiring a narrower boundary SHALL use the separately
  protected machine-local profile or fail closed before persistence. This is
  the normative interpretation of Spec §§4.4–4.5: “independently configured”
  means independent capture eligibility and downstream projection/export
  decisions within the selected storage profile, not per-stream physical ACL
  or retention inside one Git repository; “sole read boundary” means the sole
  sanctioned semantic consumer interface for the listed projections, not an
  exclusive filesystem/Git read or confidentiality boundary. Direct repository
  reads are assumed possible and SHALL be safe from restricted or erasable
  content by pre-durability admission.
- **A-AC-13:** WHEN interrupted, concurrent, duplicate, or out-of-order journal
  submissions occur, THE SYSTEM SHALL produce deterministic typed outcomes and
  preserve one valid canonical history or a fail-closed fork state.
- **A-AC-14:** WHEN the journal conformance suite runs, THE SYSTEM SHALL cover
  unverified assumptions, later confirmation, contradiction, candidate
  invalidation, route selection, decomposition, verification-scope change,
  escalation, fallback, redaction, tampering, retry, and missing journal
  availability.

  **Amendment (PO, 2026-08-17).** The journal conformance suite covers 12 of
  the 13 scenarios named above. Seven are pinned by dedicated named tests in
  `plugins/pipeline-core/lib/agent-decision-journal.test.mjs`
  (verification-scope change, escalation, fallback, redaction, retry,
  missing journal availability, and tampering); five — unverified
  assumptions, later confirmation, contradiction, candidate invalidation,
  and route selection — are covered by that file's generic A-AC-02/A-AC-11
  tests and are deliberately not duplicated as separately named cases. The
  thirteenth, "decomposition", is confirmed not representable: no
  `decomposition` value exists in `kind`, `state`, `assumptionState`, or any
  command-offer state or assurance enum anywhere in
  `plugins/pipeline-core/lib/agent-decision-journal.mjs`. Two prior
  investigation dispatches established this and it is not reopened here —
  PHX-WP-A, which reported A-AC-14 `absent` rather than padding the suite
  with one shallow test per scenario, and PHX-WP-A2, which pinned the seven
  then-uncovered scenarios and recorded the same negative finding for
  "decomposition". The PO accepts 12 of 13 as this criterion's closed scope
  rather than commissioning new schema surface — a new `kind` value plus its
  published-schema, validator, and taxonomy consequences — for one untested
  scenario. This is a scope narrowing, not a finding that the missing
  scenario does not matter: an agent's decomposition of work is a real thing
  to journal, it is simply not being built in Phoenix, and a later package
  that wants it must add the enum value and its own coverage explicitly
  rather than inheriting a claim from this criterion.
- **A-AC-15:** WHEN the agent-journal package is declared complete, THE SYSTEM
  SHALL provide maintained schema, taxonomy, materiality policy, trust model,
  privacy threat model, retention, recovery, and operator documentation.
- **A-AC-16:** IF an agent-journal event is presented as approval, waiver, risk
  acceptance, release/deployment authority, destructive-operation authority,
  or deterministic evidence, THEN THE SYSTEM SHALL reject that use and require
  the corresponding human-ledger decision or canonical evidence.

## L — Lifecycle stream and replay (#17)

- **L-AC-01:** WHEN dispatch, status, cancellation, candidate change,
  verification, review, gate, recovery, or reconciliation produces a material
  event, THE SYSTEM SHALL project it through a closed lifecycle schema.

  **Amendment (PO, 2026-08-17).** The `cancellation` item in this enumeration is
  satisfied by a `kind: "status"` event carrying `status: "cancelled"` — no
  dedicated `cancellation` kind exists or is required. The closed schema defined
  no field, pairing rule or validation that distinguished a `cancellation`-kind
  event from that representation, so the code was corrected the same day (commit
  `20014aab`) to stop emitting an undistinguishable duplicate kind; `cancelled`
  remains a valid `status` and the cancellation scenario still replays. This
  amendment changes the encoding of one enumerated trigger, not the criterion.
  L-AC-01 stays `partial` regardless: only 1 of the 9 named triggers has a real
  producer today (see this criterion's evidence-map pointer), and nothing here
  changes that.
- **L-AC-02:** WHEN an event derives from the #10 control/execution exchange,
  THE SYSTEM SHALL retain package, dispatch, attempt, queue, candidate, worker,
  correlation, and invalidation identity.
- **L-AC-03:** WHEN runner-specific detail is retained, THE SYSTEM SHALL place it
  under a registered namespaced extension and reject unknown namespaces.
- **L-AC-04:** WHEN replay correlates human, agent, deterministic, and
  runner-observed records, THE SYSTEM SHALL preserve their distinct semantic
  and visual classes.
- **L-AC-05:** IF stream sequence, correlation, candidate, or authority binding
  is broken, THEN THE SYSTEM SHALL render the gap/invalidation and SHALL NOT
  invent a total order or successful completion.
- **L-AC-06:** WHEN replay is generated, THE SYSTEM SHALL exclude raw prompts,
  messages, credentials, private paths, and unrestricted logs by default.
- **L-AC-07:** WHEN serial, parallel, retry, cancellation, recovery, or malicious
  event fixtures are replayed, THE SYSTEM SHALL produce deterministic bounded
  output.
- **L-AC-08:** WHEN lifecycle event classes, fields, or views are selected, THE
  SYSTEM SHALL trace each retained element to a stated user or audit need and
  SHALL NOT justify it only through competitor or provider parity.

## P — Policy packs and signed audit bundles (#9)

- **P-AC-01:** WHEN an organization pack is inspected, THE SYSTEM SHALL validate
  schema, provenance, compatibility, dependencies, signature policy, and every
  field's merge strategy before activation.
- **P-AC-02:** IF a pack attempts to weaken an immutable Core floor, widen a set
  intersection, introduce an unknown rule, or conflict with a single-owner
  value, THEN THE SYSTEM SHALL reject activation.
- **P-AC-03:** WHEN a policy transition is proposed, THE SYSTEM SHALL show a
  deterministic preview of origin, prior/effective value, conflict, newly
  required artifacts, external effects, and historical backfill range.
- **P-AC-04:** WHEN a pack is activated, THE SYSTEM SHALL use a recoverable,
  source-last transaction and exact readback; generated runner projections
  SHALL NOT become authority.
- **P-AC-05:** WHEN portable policy is stored, THE SYSTEM SHALL exclude
  credentials, endpoints, private tenant/project coordinates, private actor
  mappings, and private signing keys.
- **P-AC-06:** WHEN a bundle is built, THE SYSTEM SHALL inventory artifacts
  through a valid `pipeline.feature-package.v1` manifest and the #22 topology
  validator, bind exact source digests, policy versions, independently retained
  event-chain checkpoints, candidate/release identity, and verification
  results, and fail on legacy, missing, orphaned, misplaced, stale, truncated,
  or illegally mutable required artifacts.

  **Amendment for legacy/orphaned (PO, 2026-08-11).** Five of the seven named
  trigger conditions are pinned and exercised by a registered, green Verify
  suite (`audit-bundle-core-tests`): missing, misplaced, stale, truncated, and
  illegally mutable. The remaining two are each satisfied by proof, not by an
  added check. "Legacy" is proved structurally unreachable as an input to this
  criterion's own validator: an artifact path is confined to `specs/${id}/` by
  `packageRelative`'s own check (`feature-package-topology.mjs:34-37`,
  `FTP-ARTIFACT-N: path must be canonical within specs/${id}/`), and a package
  only reaches validation with a `lifecycle.json` present — the exact
  condition `inventoryFeaturePackages` uses to exclude it from the `legacy`
  classification in the first place. No input this validator ever receives
  can be legacy, the same rigor H-AC-11's O-4 amendment uses for a proved
  impossibility. "Orphaned" has no structural predicate the current manifest
  schema can enforce: which files a manifest lists is a curatorial decision
  made when it was last edited, not a property the file itself carries —
  concretely, `specs/sprint-nova-epic/lifecycle.json` lists
  `evidence/nova-b/*` as tracked artifacts while `evidence/nova-a/*` files of
  identical shape, same package, same directory depth, are not listed at all,
  and no predicate over path, name, extension, or directory depth separates
  the two sets (independently re-verified 2026-08-17: 10 `nova-b` paths
  listed, 0 `nova-a` paths listed, both directories real and populated). A
  prior attempt to build a literal "every unlisted file fails" check
  (`PHX-WP-PAC06-ORPHAN`, commit `fad0aa95`) broke `check-artifact-topology.mjs`
  against this repository's real packages (107 findings on `sprint-nova-epic`,
  57 on `sprint-phoenix-epic`, every one a legitimate untracked file) and was
  reverted (`cc43a182`). A real "orphaned" check needs a baseline/grandfather
  mechanism the manifest schema does not have today — named as future scope
  in `design/p-ac-06-clause-disposition-proposal.md`, not attempted here. Full
  investigation, options considered, and the PO's decision are recorded in
  that document.
- **P-AC-07:** WHEN a bundle is signed, THE SYSTEM SHALL use an external key
  interface and declare signature/key/time assurance without implying trusted
  identity, custody, retention, or compliance beyond the evidence.
- **P-AC-08:** WHEN a normative PRD/Spec/acceptance/result is required at Close,
  THE SYSTEM SHALL retain it at a durable topology path under a valid lifecycle
  manifest or require an explicit human disposition; initial manifest creation
  and every lifecycle transition SHALL use an exact preview, authority class,
  candidate/evidence binding, transactional writer, and readback. Handover
  prose SHALL NOT substitute for it. For Phoenix, the `#22 lifecycle writer`
  capability SHALL be implemented by the feature-package command family in
  the already inventoried `harness/scripts/pipeline-state.mjs`, covered by
  `harness/scripts/pipeline-state.test.mjs`, and SHALL consume the accepted
  #22 topology validator/transition planner. PHX-0 slice A SHALL extend that
  planner and its existing suite only with the read-only absent-manifest
  `draft` bootstrap preview required to bind initial creation; it SHALL NOT
  introduce a separate planner or bypass the resulting receipt. This writer
  SHALL also reconcile the inherited Phoenix `draft` manifest's stale PRD,
  Spec, acceptance, architecture, and Result digests only through an
  existing-manifest preview, exact PO-bound apply, and readback, with no
  lifecycle-state, artifact-set, candidate, or other authority-byte change.
  A Result reconciliation SHALL be admitted only when the current Result is
  bound by Continuity State and proves the exact stale manifest digest as its
  preserved historical prefix followed by the canonical Result-reconciliation
  fence; a metadata-only Result digest refresh SHALL be refused.
  It SHALL NOT permit manual digest replacement to stand in for that
  transaction. This writer
  closure SHALL be the
  mandatory first slice inside Spec §4.6 package PHX-0, not a separate package
  before PHX-0; PHX-0 SHALL NOT proceed to its ruleset-trust-root slice and
  PHX-1 SHALL NOT start until the writer slice passes its focused Verify and
  Critic gates.
- **P-AC-09:** WHEN historical events would become exportable after a policy or
  destination change, THE SYSTEM SHALL require exact preview and explicit
  backfill consent.
- **P-AC-10:** IF an adopting system is not separately assessed against a legal
  or regulatory regime, THEN THE SYSTEM SHALL NOT claim compliance from a
  policy pack, log, viewer, or signed bundle.
- **P-AC-11:** WHEN policy requires a governed document or external
  publication, THE SYSTEM SHALL remain provider-neutral and scope permission by
  document class, target class/binding, mode, owned fields/sections, lifecycle
  event, preview, approval, retention, conflict policy, and revision readback.

  **Amendment (PO, 2026-08-17), `preview` dimension only.** The `previewRequired`
  policy field validates and merges (`organization-policy.mjs`) but gates no
  decision: `external-reference-adapter.mjs`'s `preview()` already runs
  unconditionally on every governed write, regardless of the field's value —
  confirmed by direct source reading, not inferred. The PO decided this is
  satisfied by construction rather than something to make conditionally
  configurable (which would be a real, riskier behavior change to a
  preview-first-by-design adapter): "scope permission by ... preview" is met
  because preview is never skippable, not because the field enforces it.
  `previewRequired` stays declared for forward-compatibility (a future policy
  MAY still declare it; the value is simply always already true in effect).
  `retention` and `conflictPolicy` are separate open questions under this same
  criterion, not resolved by this amendment (see
  backlog/items/2026-08-16-p-ac-11-four-dimensions-declared-but-inert.md's
  Triage section for their own dispositions).

  **Amendment (PO, 2026-08-17), `retention` dimension only.** The `retention`
  dimension is dropped, not left declared-but-inert like `lifecycleEvents` and
  `conflictPolicy`. No bridge exists anywhere in this codebase between
  `identity.retention`'s `[active,retain,archive]` vocabulary
  (`external-reference-adapter.mjs`, a different field, left untouched by this
  amendment) and this criterion's `retention` categorical commitments
  (`retain-indefinitely`, `retain-until-superseded`,
  `retain-per-external-schedule`); the two have zero overlap and no mapping
  between them has ever been defined. A `documentClasses` entry declaring
  `retention` now fails the same closed-key check as any other unrecognized
  key. This criterion's list of dimensions to scope permission by is amended
  to read: document class, target class/binding, mode, owned fields/sections,
  lifecycle event, preview, approval, conflict policy, and revision readback
  — `retention` removed. `conflictPolicy` remains a separate open question,
  not resolved by this amendment (see
  backlog/items/2026-08-16-p-ac-11-four-dimensions-declared-but-inert.md's
  Triage section).

  **Amendment (PO, 2026-08-17), `lifecycleEvents` dimension only.** Built, not
  left declared-but-inert: `plugins/pipeline-core/lib/external-reference-
  adapter.mjs`'s `planExternalReferenceWrite` now wires `lifecycleEvents` into
  the same decision path `ownedSections` already uses, gating a governed write
  on the artifact's own `binding.identity.lifecycleState` after binding
  resolves (unlike `ownedSections`, this dimension needs the resolved
  identity, not just `desired.changes`, so it sits after that point rather
  than beside it). Four of `LIFECYCLE_EVENTS`' six values
  (`completed`, `superseded`, `abandoned`, `retained`) are verbatim identical
  to `feature-package-topology.mjs`'s `FEATURE_STATES` and map 1:1 with no
  judgment call needed. `proposed` and `active` have no identically-named
  `FEATURE_STATES` counterpart; the PO delegated a bounded mapping decision
  for the five remaining build-phase states to the implementing dispatch
  (`FEATURE_STATE_TO_LIFECYCLE_EVENT`, `external-reference-adapter.mjs`):
  `proposed` covers the states before a build is committed to (`draft`,
  `awaiting-approval`); `active` covers the states of a build actually
  underway toward publication (`approved`, `implementing`, `verifying`). The
  mapping is total (every `FEATURE_STATES` value is covered by exactly one
  `LIFECYCLE_EVENTS` value, pinned by a dedicated test) so no artifact write
  can land on an unrepresentable state — the same defect class F1 originally
  left open one level up in `ownedSections`, not reproduced here. A declared
  `lifecycleEvents` list, even one that maps to zero live states for a given
  policy, is a real restriction; an undeclared key stays neutral, the same
  declared-vs-undeclared precedent already governing every other P-AC-11
  scoping dimension. `conflictPolicy` remains the sole remaining open
  question under this criterion, not resolved by this amendment (see
  backlog/items/2026-08-16-p-ac-11-four-dimensions-declared-but-inert.md's
  Triage section).

  **Amendment (PO, 2026-08-17), `conflictPolicy` dimension only.** Built, not
  left declared-but-inert: `plugins/pipeline-core/lib/external-reference-
  adapter.mjs`'s `planExternalReferenceWrite` now consults the effective
  policy's document-class entry `conflictPolicy` at the same site the
  unconditional revision/ownership conflict check already occupied. A
  declared `require-reconciliation` returns `status: "reconciliation-required",
  reason: "policy-conflict-reconciliation"` — the adapter's existing status
  value, already used for `external-unreachable`/`invalid-inspection`/
  `invalid-preview`, extended with a new `reason` value following the same
  `policy-...` convention as `policy-owned-sections`/`policy-lifecycle-event`/
  `policy-mode-mismatch`/`policy-approval-required`. A declared `reject`, OR
  an undeclared `conflictPolicy` key, both keep today's exact unconditional
  behavior (`status: "conflict", reason: "revision-or-ownership"`) — this is
  the declared-vs-undeclared precedent every other P-AC-11 scoping dimension
  already follows, with the one difference that here undeclared and `reject`
  resolve to the SAME (strictest, backward-compatible) branch, matching
  `organization-policy.mjs`'s `CONFLICT_POLICY_RANK` where `reject` (rank 1)
  is strictly stricter than `require-reconciliation` (rank 0): there are only
  two effective branches, not three. This closes the last remaining open
  dimension of this criterion's "scope permission by ... conflict policy"
  clause (see
  backlog/items/2026-08-16-p-ac-11-four-dimensions-declared-but-inert.md's
  Triage section for the prior open-question record).
- **P-AC-12:** WHEN a bundle is verified offline, THE SYSTEM SHALL validate its
  manifest, artifact digests, event-chain references, topology, optional
  signature profile, and declared omissions and SHALL visibly reject
  tampering.
- **P-AC-13:** WHEN the policy/bundle package is declared complete, THE SYSTEM
  SHALL provide a maintained threat model plus explicit pack, schema,
  activation, bundle, and compatibility migration/versioning policy.

## V — Human-readable Evidence Viewer (#5)

- **V-AC-01:** WHEN a completed or in-progress governed package is selected, THE
  SYSTEM SHALL generate one offline static report from validated canonical
  artifacts and streams.
- **V-AC-02:** WHEN the report renders a fact, estimate, assumption, human
  decision, unknown, unavailable, redacted, invalid, or not-applicable value,
  THE SYSTEM SHALL label the exact class visibly.
- **V-AC-03:** WHEN the report renders approval, exception, review, check, or
  release state, THE SYSTEM SHALL link the claim to its canonical source
  record/evidence and exact candidate.
- **V-AC-04:** IF any source digest, topology, chain, candidate, or policy
  binding is invalid, THEN THE SYSTEM SHALL mark the affected view invalid and
  SHALL NOT render a pass/approval claim.
- **V-AC-05:** WHEN redacted sharing is requested, THE SYSTEM SHALL produce a
  deterministic policy-bound projection without raw prompts, logs,
  credentials, private paths, or coordinates.
- **V-AC-06:** WHEN report fixtures are rendered, THE SYSTEM SHALL pass
  accessibility structure, keyboard/navigation, content-security-policy, and
  representative mobile/desktop snapshot checks.
- **V-AC-07:** IF a viewer file or UI state is modified, THEN THE SYSTEM SHALL
  remain unable to alter canonical authority.
- **V-AC-08:** WHEN canonical lifecycle state marks an artifact proposed,
  active, completed, superseded, abandoned, or retained, THE SYSTEM SHALL
  represent that exact state or a typed invalid/unavailable result.
- **V-AC-09:** WHEN the viewer conformance suite runs, THE SYSTEM SHALL include
  pass, fail, unknown, tampered, misplaced, orphaned, and legacy-layout
  fixtures with deterministic snapshots.
- **V-AC-10:** WHEN a viewer report is opened, THE SYSTEM SHALL display the
  exact candidate binding prominently before any derived pass, approval, or
  release summary.

## X — Traceability and documentation adapters (#23)

- **X-AC-01:** WHEN an external link is recorded, THE SYSTEM SHALL bind system
  class, adapter/profile, object ID, relation, authority direction, Pipeline
  artifact digest, external revision, mode, and freshness.
- **X-AC-02:** WHEN a field or document section is synchronized, THE SYSTEM
  SHALL require one ownership class: Pipeline-owned, external-owned,
  projection-only, independently maintained, or unsupported.
- **X-AC-03:** WHEN an external write is proposed, THE SYSTEM SHALL perform
  inspect, exact preview, authority confirmation, idempotent apply, revision
  readback, and sanitized receipt against one target.
- **X-AC-04:** IF the target revision changed, ownership conflicts, readback
  differs, or the adapter lacks a required capability, THEN THE SYSTEM SHALL
  report conflict/partial/reconciliation-required rather than success.
- **X-AC-05:** WHEN external state changes, THE SYSTEM SHALL treat it as a typed
  observation or review request and SHALL NOT execute a Pipeline transition
  from ordinary text/status.
- **X-AC-06:** WHEN an external object is stale, deleted, moved, merged,
  duplicated, inaccessible, or observed out of order, THE SYSTEM SHALL preserve
  a deterministic typed state.
- **X-AC-07:** WHEN an adapter handles credentials or private coordinates, THE
  SYSTEM SHALL keep them in approved machine-local storage and exclude them
  from portable evidence and diagnostics.
- **X-AC-08:** WHEN provider-specific capability or mapping is needed, THE
  SYSTEM SHALL confine its name/fields to the adapter profile and SHALL NOT add
  them to normative core schemas.
- **X-AC-09:** IF external content contains commands, prompts, or malicious
  structured data, THEN THE SYSTEM SHALL treat it as untrusted data and prevent
  execution/authority injection.
- **X-AC-10:** WHEN a Pipeline artifact is linked or published, THE SYSTEM SHALL
  resolve its sole canonical identity and lifecycle through #22 rather than a
  repository-specific path guess.
- **X-AC-11:** WHEN organization policy governs a mandatory document class or
  external write, THE SYSTEM SHALL consume the effective #9 policy and SHALL
  NOT create a parallel adapter authority.
- **X-AC-12:** WHEN adapter conformance is evaluated, THE SYSTEM SHALL prove one
  provider-neutral core contract with synthetic issue-tracker, knowledge-base,
  document-store, and secondary-forge profiles.
- **X-AC-13:** WHEN an adapter profile does not explicitly enable a narrower
  synchronized field/section, THE SYSTEM SHALL default to reference-only or
  outbound-projection behavior and reject generic last-write-wins.
- **X-AC-14:** IF an external system is offline or unavailable, THEN THE SYSTEM
  SHALL preserve canonical local operation and authority and expose the
  external observation/reconciliation gap.
- **X-AC-15:** WHEN the adapter package is declared complete, THE SYSTEM SHALL
  provide maintained contract, threat model, ownership and lifecycle mapping,
  publication guide, recovery procedure, and conformance suite.

## C — ITSM change control (#24)

- **C-AC-01:** WHEN change control is enabled for an environment, THE SYSTEM
  SHALL bind policy, change class, immutable artifact, environment, scope,
  required external state, schedule, freshness, and update obligations.
- **C-AC-02:** WHEN standard, normal, emergency, or not-required classification
  is selected, THE SYSTEM SHALL apply distinct validated inputs and SHALL NOT
  permit class selection solely to avoid approval.
- **C-AC-03:** WHEN promotion is evaluated, THE SYSTEM SHALL independently
  validate Pipeline authority and authenticated external change authority
  against the same artifact/environment/scope/window tuple.
- **C-AC-04:** IF external state is draft, stale, rejected, expired,
  conflicting, unknown, outside its window, unauthenticated, or bound to
  another artifact/environment, THEN THE SYSTEM SHALL block mandatory
  promotion.
- **C-AC-05:** WHEN deployment begins, validates, fails, or rolls back, THE
  SYSTEM SHALL publish the corresponding external update only after the local
  event and SHALL preserve failed attempts.
- **C-AC-06:** IF deployment succeeds but an external update/readback fails,
  THEN THE SYSTEM SHALL retain deployment evidence and enter
  `reconciliation-required` without claiming completed change control.
- **C-AC-07:** WHEN emergency change policy is used, THE SYSTEM SHALL require
  its explicit human authority, bounded scope, and retrospective evidence; it
  SHALL NOT act as a generic bypass.
- **C-AC-08:** WHEN no effective policy requires ITSM, THE SYSTEM SHALL keep the
  existing deploy adapter independently usable.
- **C-AC-09:** WHEN release configuration is evaluated for an environment, THE
  SYSTEM SHALL resolve exactly `not-required` or one effective change-control
  profile and reject ambiguous/multiple mandatory profiles.
- **C-AC-10:** WHEN an external change record or documentation projection is
  created automatically, THE SYSTEM SHALL retain it as draft/observation and
  SHALL NOT infer external approval.
- **C-AC-11:** WHEN a provider-specific ITSM capability or mapping is needed,
  THE SYSTEM SHALL confine product names and fields to adapter profiles and
  SHALL NOT modify the provider-neutral deploy or change-control core schema.
- **C-AC-12:** WHEN the external ITSM system is unavailable, THE SYSTEM SHALL
  apply the effective advisory or mandatory policy explicitly, preserving
  local evidence and an operator-visible recovery/reconciliation path.
- **C-AC-13:** WHEN the change-control package is declared complete, THE SYSTEM
  SHALL provide maintained threat model, policy precedence, migration,
  operator runbook, and failure/rollback/recovery procedures.

## E — Governance event export (#32)

- **E-AC-01:** WHEN an event is exported, THE SYSTEM SHALL map exactly one
  validated canonical source event to one stable destination-neutral event ID,
  source, type, time, schema, correlation, policy revision, and integrity
  reference.
- **E-AC-02:** WHEN CloudEvents, OTLP, NDJSON, or RFC 5424 profiles are used,
  THE SYSTEM SHALL use pinned deterministic mappings and declare every lossy
  field/semantic conversion.
- **E-AC-03:** WHEN an export policy is absent, THE SYSTEM SHALL deny every
  field and destination by default.
- **E-AC-04:** WHEN a free-form human rationale or agent summary exists, THE
  SYSTEM SHALL omit it unless an explicit destination policy allows and
  redacts it before outbox persistence.
- **E-AC-05:** WHEN a destination is enabled, THE SYSTEM SHALL maintain an
  independent sanitized outbox, cursor, retry budget, health state, and
  dead-letter area outside portable authority.
- **E-AC-06:** WHEN delivery is retried, THE SYSTEM SHALL use at-least-once
  semantics and stable source/event idempotency and SHALL NOT claim
  exactly-once.
- **E-AC-07:** WHEN a batch is partially accepted, THE SYSTEM SHALL advance
  only safely acknowledged events and leave every other event recoverable.
- **E-AC-08:** IF cursor rollback, outbox truncation, event gap, source fork,
  invalid hash, schema downgrade, forged acknowledgement, or destination
  mismatch is detected, THEN THE SYSTEM SHALL fail typed and preserve the
  canonical source.
- **E-AC-09:** WHEN a destination is advisory and unavailable, THE SYSTEM SHALL
  expose lag/failure while allowing canonical local governance to continue.
- **E-AC-10:** WHEN export is required at a named lifecycle boundary, THE
  SYSTEM SHALL block only that boundary and the exact unacknowledged source
  range with an operator-visible recovery.
- **E-AC-11:** WHEN a delivery receipt is generated, THE SYSTEM SHALL state
  adapter/profile, batch/events, attempt, acknowledgement class, counts,
  terminal disposition, cursor/lag, and policy/projection digests without
  implying retention, immutability, analyst review, or compliance.
- **E-AC-12:** IF an external destination emits an alert, command, approval, or
  status, THEN THE SYSTEM SHALL prevent it from changing Pipeline authority
  through the outbound export channel.
- **E-AC-13:** WHEN multiple destinations are configured, THE SYSTEM SHALL keep
  their policies, queues, cursors, credentials, health, and failure domains
  independent.
- **E-AC-14:** WHEN live destination tests are absent, THE SYSTEM SHALL still
  prove core conformance using in-memory, local-file, OTLP-profile, syslog, and
  failure-injection fixtures without requiring a commercial service.
- **E-AC-15:** WHEN an event is prepared for export, THE SYSTEM SHALL complete
  allowlisting/redaction before outbox, transport log, dead-letter, metric,
  diagnostic, or delivery-receipt persistence.
- **E-AC-16:** WHEN the exporter operates under retryable failures or shutdown,
  THE SYSTEM SHALL apply bounded batching, compression where enabled, rate
  limits, retry budget/backoff, backpressure, cancellation, flush, replay, and
  restart recovery according to the destination profile.
- **E-AC-17:** WHEN an exported event or batch is delivered more than once, THE
  SYSTEM SHALL preserve one canonical source history and SHALL NOT create
  duplicate governance authority.
- **E-AC-18:** WHEN portable export intent/evidence is written, THE SYSTEM SHALL
  exclude destination credentials, endpoints, certificates, tokens, and
  private organization coordinates while preserving typed local bindings.
- **E-AC-19:** WHEN export health is rendered by the Evidence Viewer, THE
  SYSTEM SHALL show destination profile, lag, failure/quarantine counts,
  integrity gaps, acknowledgement class, and recovery state without becoming
  an authorization source.
- **E-AC-20:** WHEN an audit bundle includes export metadata, THE SYSTEM SHALL
  include only policy/profile digests and sanitized delivery evidence required
  by bundle policy and SHALL NOT treat delivery as source authority.
- **E-AC-21:** WHEN the export package is declared complete, THE SYSTEM SHALL
  provide a maintained threat model, data-flow diagram, mapping/loss guide,
  retention guidance, operator runbook, and incident/recovery procedures.

## R — External command offer, workaround, and recovery audit profile

- **R-AC-01:** WHEN THE PIPELINE knowingly offers an external command or script
  for execution, including a Pipeline-initiated offer or a user-requested,
  Pipeline-supplied offer, THE SYSTEM SHALL append a privacy-safe
  `command-offer` agent-journal event before presentation or initiation. The
  event SHALL bind offer origin, stable operation/tool/script class and version
  or independently public-safe governed-artifact identity, public-safe
  target/candidate binding, side-effect and authority class, policy/redaction
  digests, selected alternative/reason codes, required decision reference or
  `not-required`, execution-assurance requirement, and typed omissions.
- **R-AC-02:** WHEN a sanctioned path is rejected or an alternative recovery is
  considered, THE SYSTEM SHALL correlate its trigger, typed rejection, evidence
  gap, candidate alternatives, and selected recovery to the existing offer or
  a distinct agent event.
- **R-AC-03:** WHEN an offer or recovery changes authority, invokes a defined
  override, bypasses a normal guard, is destructive, or policy requires
  authorization, THE SYSTEM SHALL validate and correlate an exact
  scope/candidate/target/validity-bound human-ledger decision before initiation.
  A standard non-authoritative offer SHALL remain an agent selection and SHALL
  NOT imply approval.
- **R-AC-04:** WHEN recovery mutates local state, THE SYSTEM SHALL record a
  stable operation class, public-safe target binding, exact pre/post evidence
  digests, recoverability, and required cleanup/readback.
- **R-AC-05:** IF any offer, recovery, preview, canonical record, export,
  outbox, diagnostic, receipt, or crash artifact would expose a credential,
  token, account, SSH key, private path/coordinate, raw command/script text or
  arguments, shell history, transcript, prompt, unrestricted output, or a
  digest derived from arbitrary private command text, THEN THE SYSTEM SHALL
  reject or redact it before every durable boundary. A digest is permitted only
  for an independently public-safe governed script artifact.
- **R-AC-06:** WHEN an offer is displayed, acknowledged, authorized, copied,
  generated, or asserted by a user, THE SYSTEM SHALL record only that exact
  state and SHALL NOT label it `executed`, `completed`, or `succeeded`.
- **R-AC-07:** WHEN THE PIPELINE initiates execution, THE SYSTEM SHALL append
  `attempted` and may append `observed-completed` or `readback-verified` only
  when bounded evidence supports the respective fact. A user-executed command
  SHALL remain `execution-unobserved` unless an allowed independent evidence
  interface verifies it; failed, partial, cancelled, unknown, unavailable, and
  readback-mismatch outcomes SHALL remain distinct.
- **R-AC-08:** WHEN recovery apply, rollback, cleanup, or readback occurs, THE
  SYSTEM SHALL append a lifecycle event and SHALL NOT rewrite the original
  offer, proposal, or authorization.
- **R-AC-09:** IF a required offer, authority link, candidate/policy binding,
  or outcome evidence is missing, stale, duplicated, substituted,
  cross-repository, or contradictory, THEN replay and every dependent outcome
  SHALL render it `unknown` or `invalid`, never successful.
- **R-AC-10:** IF journaling an offer is unavailable, THEN the system SHALL
  fail closed before presenting or initiating a material, destructive,
  authority-changing, or policy-required external action; policy may define a
  typed non-material exception that still never claims execution.
- **R-AC-11:** WHEN a private-only handoff detail is operationally necessary,
  THE SYSTEM SHALL store it only in sanctioned machine-local state and expose a
  public-safe typed omission/commitment if policy permits.
- **R-AC-12:** WHEN the motivating Phoenix bootstrap trajectory is encoded as a
  fixture, THE SYSTEM SHALL demonstrate rejected guard path, attended local
  repair, unchanged public-privacy boundary, successful readback, and no remote
  write without embedding machine-specific values.
- **R-AC-13:** THE implementation SHALL provide fixtures for Pipeline-initiated
  and user-requested/Pipeline-supplied offers; approval-without-run;
  user-run-without-report; failed, partial, cancelled, and readback-mismatch
  results; duplicate/retry and substitution; guard override; arbitrary
  secret-bearing command rejection; independently public-safe governed script
  identity; and malicious external command-content rejection.

## Epic integration and release

- **EPIC-AC-01:** WHEN any issue package is delivered, THE SYSTEM SHALL retain
  its issue mapping, exact dependencies, valid lifecycle manifest, candidate
  evidence, and independent closure status within the single Phoenix Epic.
- **EPIC-AC-02:** IF a package consumes an unpublished Nova, Cyborg, or
  Nightwing commit, THEN Phoenix verification SHALL fail.
- **EPIC-AC-03:** WHEN implementation deviates from this rigor-2 specification,
  THE SYSTEM SHALL update the Spec and renew the affected approval before merge.
- **EPIC-AC-04:** WHEN Phoenix claims complete, THE SYSTEM SHALL pass focused
  package checks, Full Verify, blocking Security, privacy review, independent
  high-risk Critic, exact branch push/readback, and explicit PO acceptance.
- **EPIC-AC-05:** IF any Phoenix issue criterion remains unimplemented,
  unverified, deferred without owner/expiry, or dependent on unavailable
  external/private evidence, THEN the Epic SHALL NOT claim complete.
- **EPIC-AC-06:** WHEN the implementation is ready for the first dispatch, THE
  SYSTEM SHALL require the Product Owner's literal `approved` against the
  readable PRD and bound Spec; design work alone SHALL NOT authorize code.
