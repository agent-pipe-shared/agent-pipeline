#!/usr/bin/env node
// Generator for specs/sprint-phoenix-epic/evidence/acceptance-evidence-map-<date>.md:
// criterion verdicts x live issue acceptance bullets.
//
// Run:  node specs/sprint-phoenix-epic/evidence/acceptance-evidence-map.mjs \
//         --out specs/sprint-phoenix-epic/evidence/acceptance-evidence-map-<date>.md
//
// It lives next to its output rather than under evidence/ because evidence/ is
// git-ignored run output (QG-03) and this map is a durable package artifact.
//
// Inputs are two hand-transcribed maps, each with a cited source:
//   VERDICTS  - the 157 criterion verdicts. Baseline: evidence/phx-epic-coverage.md
//               (task PHX-COVERAGE, 2026-08-08), corrected by evidence/phx-adjudication.md
//               (task PHX-ADJ2, ten not-adjudicable rows resolved), then by the
//               2026-08-09 delta re-measurement in evidence/phx-fin-a.md / phx-fin-b.md.
//   BULLETS   - the 105 live issue acceptance bullets and the criteria each one is
//               proven by, transcribed from specs/sprint-phoenix-epic/design/issue-coverage.md.
//
// Output: for every issue, which live acceptance bullets are blocked and by which
// criteria, under the closure rule at design/issue-coverage.md:201-204 -- an issue
// remains open if any mapped criterion is unimplemented or unverified.
//
// Read-only. Writes one markdown report to stdout.

const IMPLEMENTED = 'implemented';

// --- criterion verdicts -----------------------------------------------------
// value: [verdict, sourceTag]  sourceTag: C = phx-epic-coverage.md, J = phx-adjudication.md,
// A = phx-fin-a.md (2026-08-09 delta), B = phx-fin-b.md (2026-08-09 delta)
const VERDICTS = {
  'PX0-AC-01': ['partial', 'C'],
  'PX0-AC-02': ['partial', 'C'],
  'PX0-AC-03': ['designed-only', 'C'],
  'PX0-AC-04': ['partial', 'C'],
  'PX0-AC-05': ['designed-only', 'C'],
  'PX0-AC-06': ['designed-only', 'C'],
  'PX0-AC-07': ['designed-only', 'C'],
  'PX0-AC-08': ['partial', 'C'],
  'PX0-AC-09': ['partial', 'C'],
  'PX0-AC-10': ['partial', 'C'],
  'PX0-AC-11': ['partial', 'C'],
  'PX0-AC-12': ['implemented', 'C'],
  'PX0-AC-13': ['partial', 'J'],
  'PX0-AC-14': ['implemented', 'C'],
  'PX0-AC-15': ['implemented', 'C'],
  'PX0-AC-16': ['partial', 'C'],
  'PX0-AC-17': ['partial', 'C'],

  'K-AC-01': ['implemented', 'C'],
  'K-AC-02': ['implemented', 'C'],
  'K-AC-03': ['implemented', 'C'],
  'K-AC-04': ['implemented', 'C'],
  'K-AC-05': ['partial', 'C'],
  'K-AC-06': ['implemented', 'C'],
  'K-AC-07': ['implemented', 'C'],
  'K-AC-08': ['partial', 'C'],
  'K-AC-09': ['implemented', 'C'],
  'K-AC-10': ['partial', 'C'],

  'H-AC-01': ['implemented', 'C'],
  'H-AC-02': ['implemented', 'C'],
  'H-AC-03': ['implemented', 'C'],
  'H-AC-04': ['implemented', 'C'],
  'H-AC-05': ['implemented', 'C'],
  'H-AC-06': ['implemented', 'C'],
  'H-AC-07': ['implemented', 'C'],
  'H-AC-08': ['not-started', 'J'],
  'H-AC-09': ['not-started', 'J'],
  'H-AC-10': ['implemented', 'C'],
  'H-AC-11': ['partial', 'C'],
  'H-AC-12': ['partial', 'C'],
  'H-AC-13': ['implemented', 'C'],
  'H-AC-14': ['partial', 'C'],
  'H-AC-15': ['partial', 'C'],

  'A-AC-01': ['partial', 'C'],
  'A-AC-02': ['partial', 'C'],
  'A-AC-03': ['not-started', 'C'],
  'A-AC-04': ['partial', 'C'],
  'A-AC-05': ['not-started', 'J'],
  'A-AC-06': ['implemented', 'C'],
  'A-AC-07': ['partial', 'C'],
  'A-AC-08': ['not-started', 'C'],
  'A-AC-09': ['designed-only', 'J'],
  'A-AC-10': ['partial', 'C'],
  'A-AC-11': ['not-started', 'C'],
  'A-AC-12': ['partial', 'C'],
  'A-AC-13': ['partial', 'C'],
  'A-AC-14': ['partial', 'C'],
  'A-AC-15': ['partial', 'C'],
  'A-AC-16': ['implemented', 'C'],

  'L-AC-01': ['partial', 'C'],
  'L-AC-02': ['partial', 'J'],
  'L-AC-03': ['implemented', 'C'],
  'L-AC-04': ['partial', 'C'],
  'L-AC-05': ['implemented', 'C'],
  'L-AC-06': ['implemented', 'C'],
  'L-AC-07': ['partial', 'C'],
  'L-AC-08': ['partial', 'J'],

  'P-AC-01': ['partial', 'C'],
  'P-AC-02': ['implemented', 'C'],
  'P-AC-03': ['partial', 'C'],
  'P-AC-04': ['implemented', 'C'],
  'P-AC-05': ['implemented', 'C'],
  'P-AC-06': ['partial', 'C'],
  'P-AC-07': ['implemented', 'C'],
  'P-AC-08': ['partial', 'C'],
  'P-AC-09': ['not-started', 'C'],
  'P-AC-10': ['partial', 'C'],
  'P-AC-11': ['partial', 'C'],
  'P-AC-12': ['implemented', 'C'],
  'P-AC-13': ['partial', 'C'],

  'V-AC-01': ['implemented', 'C'],
  'V-AC-02': ['partial', 'C'],
  'V-AC-03': ['implemented', 'C'],
  'V-AC-04': ['implemented', 'C'],
  'V-AC-05': ['implemented', 'C'],
  'V-AC-06': ['partial', 'C'],
  'V-AC-07': ['partial', 'C'],
  'V-AC-08': ['implemented', 'C'],
  'V-AC-09': ['partial', 'C'],
  'V-AC-10': ['implemented', 'C'],

  'X-AC-01': ['implemented', 'C'],
  'X-AC-02': ['implemented', 'C'],
  'X-AC-03': ['implemented', 'C'],
  'X-AC-04': ['implemented', 'C'],
  'X-AC-05': ['implemented', 'C'],
  'X-AC-06': ['implemented', 'C'],
  'X-AC-07': ['implemented', 'C'],
  'X-AC-08': ['implemented', 'C'],
  'X-AC-09': ['implemented', 'C'],
  'X-AC-10': ['implemented', 'C'],
  'X-AC-11': ['not-started', 'J'],
  'X-AC-12': ['partial', 'C'],
  'X-AC-13': ['implemented', 'C'],
  'X-AC-14': ['partial', 'C'],
  'X-AC-15': ['partial', 'C'],

  'C-AC-01': ['implemented', 'C'],
  'C-AC-02': ['partial', 'C'],
  'C-AC-03': ['implemented', 'C'],
  'C-AC-04': ['implemented', 'C'],
  'C-AC-05': ['implemented', 'C'],
  'C-AC-06': ['implemented', 'C'],
  'C-AC-07': ['partial', 'C'],
  'C-AC-08': ['implemented', 'C'],
  'C-AC-09': ['partial', 'C'],
  'C-AC-10': ['implemented', 'C'],
  'C-AC-11': ['implemented', 'C'],
  'C-AC-12': ['partial', 'C'],
  'C-AC-13': ['partial', 'C'],

  'E-AC-01': ['implemented', 'C'],
  'E-AC-02': ['partial', 'C'],
  'E-AC-03': ['implemented', 'C'],
  'E-AC-04': ['partial', 'C'],
  'E-AC-05': ['implemented', 'C'],
  'E-AC-06': ['partial', 'C'],
  'E-AC-07': ['implemented', 'C'],
  'E-AC-08': ['partial', 'C'],
  'E-AC-09': ['partial', 'C'],
  'E-AC-10': ['not-started', 'C'],
  'E-AC-11': ['partial', 'C'],
  'E-AC-12': ['implemented', 'C'],
  'E-AC-13': ['implemented', 'C'],
  'E-AC-14': ['partial', 'C'],
  'E-AC-15': ['implemented', 'C'],
  'E-AC-16': ['implemented', 'C'],
  'E-AC-17': ['implemented', 'C'],
  'E-AC-18': ['implemented', 'C'],
  'E-AC-19': ['implemented', 'C'],
  'E-AC-20': ['not-started', 'J'],
  'E-AC-21': ['partial', 'C'],

  'R-AC-01': ['implemented', 'C'],
  'R-AC-02': ['partial', 'C'],
  'R-AC-03': ['implemented', 'C'],
  'R-AC-04': ['partial', 'C'],
  'R-AC-05': ['implemented', 'C'],
  'R-AC-06': ['implemented', 'C'],
  'R-AC-07': ['implemented', 'C'],
  'R-AC-08': ['partial', 'C'],
  'R-AC-09': ['partial', 'C'],
  'R-AC-10': ['partial', 'C'],
  'R-AC-11': ['partial', 'C'],
  'R-AC-12': ['not-started', 'C'],
  'R-AC-13': ['partial', 'C'],

  'EPIC-AC-01': ['partial', 'C'],
  'EPIC-AC-02': ['not-started', 'J'],
  'EPIC-AC-03': ['partial', 'C'],
  'EPIC-AC-04': ['partial', 'C'],
  'EPIC-AC-05': ['constraint', 'C'],
  'EPIC-AC-06': ['implemented', 'C'],
};

// --- 2026-08-09 delta -------------------------------------------------------
// Applied on top of the baseline. Each entry MUST cite the delta artifact that
// establishes it; an entry with no artifact is a defect, not a promotion.
const DELTA = {
  // --- evidence/phx-fin-a.md (task PHX-FIN-A, 2026-08-09) ---
  // promoted: the continuity-authority-revision writer landed (c62a3c4) and its
  // 102 staged cases were registered into the canonical suite (0f3b4c9).
  'PX0-AC-02': ['implemented', 'A'],
  'PX0-AC-03': ['partial', 'A'],
  'PX0-AC-05': ['partial', 'A'],
  'PX0-AC-06': ['partial', 'A'],
  'PX0-AC-07': ['partial', 'A'],
  // promoted: the red, unregistered codex-host-plugin-list suite was retired
  // (14cca32) and replaced by the registered bootstrap-source-attestation
  // acceptance suite (f32e21c), harness/scripts/verify.mjs:333.
  'PX0-AC-09': ['implemented', 'A'],
  'PX0-AC-10': ['implemented', 'A'],
  'PX0-AC-11': ['implemented', 'A'],
  'PX0-AC-16': ['implemented', 'A'],
  'PX0-AC-17': ['implemented', 'A'],
  // confirmed partial: PX0-AC-01, PX0-AC-04, P-AC-08. P-AC-08's command family
  // and draft bootstrap preview are now built and tested (a5e5b65, b7a6e98),
  // but the existing-manifest reconciliation and the Result-reconciliation
  // fence remain entirely absent.

  // --- evidence/phx-fin-b.md (task PHX-FIN-B, 2026-08-09) ---
  // promoted: 5d0fc6a added `assumptionState` with exactly the seven epistemic
  // states the criterion names, governance/schemas/agent-decision-event.schema.json:14.
  'A-AC-11': ['implemented', 'B'],
  // confirmed: A-AC-01, A-AC-02, A-AC-05, A-AC-07, A-AC-14, H-AC-12,
  // EPIC-AC-01, EPIC-AC-03, EPIC-AC-04.
};

// --- per-criterion evidence pointer ----------------------------------------
// One clause per criterion, transcribed from the measurement artifacts named above.
// For `implemented`: the carrier plus the gate-registered suite that pins it.
// For anything else: the exact clause that is NOT pinned or NOT built.
const POINTERS = {
  'PX0-AC-01': 'continuity-state.mjs binds dispatch/intent to prdSha256/specSha256; no assertion names a REJECTED generic CAS authority change',
  'PX0-AC-02': 'continuity-authority-revision-plan emits the closed request; pinned in pipeline-state.test.mjs (registered)',
  'PX0-AC-03': 'apply exists and rechecks under the writer lock; the recheck breadth the criterion enumerates is not fully pinned',
  'PX0-AC-04': 'proof half fails closed and is pinned; the State-side preimage/revision/idempotency recheck is only partly asserted',
  'PX0-AC-05': 'continuity-authority-revision-receipt.v1 now has an emitter; durable retention of the receipt is not pinned',
  'PX0-AC-06': 'recover replays frozen journal bytes only; the recovered-preimage outcome class is not pinned',
  'PX0-AC-07': 'zero-write replay implemented; the conflicting-replay/second-writer half is not pinned',
  'PX0-AC-08': 'ruleset-source.mjs closed contract pinned by ruleset-source-tests; whether bootstrap actually EMITS one observation is unpinned',
  'PX0-AC-09': 'bootstrap-source-attestation-acceptance-tests (verify.mjs:333) — Codex-only marketplace resolution',
  'PX0-AC-10': 'bootstrap-source-attestation-acceptance-tests — pre-HEAD consumer compares loaded plugin identity',
  'PX0-AC-11': 'bootstrap-source-attestation-acceptance-tests — one common closed contract across the four source classes',
  'PX0-AC-12': 'ruleset-source-tests: source/loaded/installed/mismatch/remote unavailable each typed distinctly',
  'PX0-AC-13': 'ruleset-freshness-host.mjs selects the host transport correctly, but no suite exercises it and bootstrap does not wire it',
  'PX0-AC-14': 'ruleset-source-tests: private-coordinate-rejected, private-remote-rejected',
  'PX0-AC-15': 'ruleset-source-tests: private-classification-preserved, local-classification-preserved',
  'PX0-AC-16': 'bootstrap-source-attestation-acceptance-tests — equality bound to exact loaded and observed public remote identity',
  'PX0-AC-17': 'bootstrap-source-attestation-acceptance-tests — unknown keys, ambiguous selectors, more than one selected plugin all fail closed',

  'K-AC-01': 'governance-event-core/store-tests: closed envelope, origin payload, physical target, policy, size limits',
  'K-AC-02': 'governance-event-store-tests: exact idempotency is a zero-write replay',
  'K-AC-03': 'same assertion, conflicting-key half',
  'K-AC-04': 'governance-event-store-tests: canonical bytes, readback checkpoint, source-last head, RFC 8785 canonicalization',
  'K-AC-05': 'fork DETECTION is pinned; the governed disposition appended through the sanctioned recovery operation is not',
  'K-AC-06': 'governance-event-store-tests: checkpoint-aware verification; symlink and cross-repository rejection',
  'K-AC-07': 'governance-event-store-tests: projection recovery requires a retained checkpoint',
  'K-AC-08': 'no assertion covers a head/index ASSERTING an absent or invalid canonical record; only the stale-head case',
  'K-AC-09': 'governance-event-core-tests: six exact typed absence states preserved',
  'K-AC-10': 'validated-chain querying is pinned; preservation across MULTIPLE streams is not named',

  'H-AC-01': 'human-governance-ledger-tests: closed portable grant, single-use consumption under the canonical stream lock',
  'H-AC-02': 'governance-authority-resolver-tests + guard-push consumption receipt',
  'H-AC-03': 'human-governance-ledger-tests: one event-specific link and outcome per authority disposition',
  'H-AC-04': 'human-governance-ledger-tests: repository/candidate drift, expiry, consuming disposition all fail closed',
  'H-AC-05': 'human-governance-ledger-tests: detached proof verified without upgrading to human identity; no attribution field admitted',
  'H-AC-06': 'human-governance-ledger-tests: append-only consumption disposition; restricted-store erasure pinned separately',
  'H-AC-07': 'human-governance-ledger-tests: cross-repository decision rejected before mutation',
  'H-AC-08': 'NO CARRIER: no path imports a legacy approval/override/deploy record as an unverified observation',
  'H-AC-09': 'NO CARRIER: external-push-ledger is scoped to single-repo push proofs; nothing binds cross-repository guarded work to one physical target',
  'H-AC-10': 'five named assertions covering scope, reason, expiry, constraints, follow-up review, no standing bypass',
  'H-AC-11': 'portable reconstruction surface pinned; the no-join-handle clause is proved UNSATISFIABLE for the GMW half (acceptance.md amendment, tracked as O-4)',
  'H-AC-12': 'guard-push/guard-devplan/change-control validate the decision reference; the DUAL-EVALUATION during migration with shared owner and expiry has no carrier',
  'H-AC-13': 'human-governance-ledger-tests + store admission: prohibited content rejected before any temporary file exists',
  'H-AC-14': 'governance-events.md + po-human-approval.md + threat model exist; no migration, retention or recovery section for the ledger package',
  'H-AC-15': 'grant, consumption, expiry, drift, single-use, lifecycle links covered; denial, correction, retry, concurrency, interruption are not',

  'A-AC-01': 'record shape pinned; nothing enforces recording BEFORE dependent action where policy requires',
  'A-AC-02': 'append-only comes from the shared store and link validity is pinned; no assertion names the transition set',
  'A-AC-03': 'NO CARRIER: no revalidation/invalidation path identifies objects affected by a changed assumption',
  'A-AC-04': 'self-confirmation is prevented; no correlation path to the human ledger is implemented',
  'A-AC-05': 'NO CARRIER: neither event shape carries a runner/model/effort/profile/role/adapter field at all',
  'A-AC-06': 'agent-decision-journal-tests: free text, authority-shaped fields and unbound supersession rejected',
  'A-AC-07': 'default-deny capture policy pinned in the kernel; "mandatory classes never silently sampled" is not pinned',
  'A-AC-08': 'NO CARRIER: no detector for missing dispatch provenance; the Dispatch: trailer is convention only',
  'A-AC-09': 'materiality is documented as design intent only; no code enforces or measures it',
  'A-AC-10': 'the offer path fails closed on unavailable journaling; no per-event-class fail-open/fail-closed policy exists',
  'A-AC-11': 'agent-decision-event.schema.json:14 assumptionState enumerates exactly the seven required epistemic states (landed 5d0fc6a)',
  'A-AC-12': 'per-origin capture policy exists; independent projection/export configurability is not pinned',
  'A-AC-13': 'determinism inherited from the store; no journal-specific interrupted/out-of-order assertion',
  'A-AC-14': 'the criterion names 13 conformance scenarios; the suite carries far fewer',
  'A-AC-15': 'agent-decision-journal.md carries one section; no taxonomy, materiality policy, trust model, retention or recovery doc',
  'A-AC-16': 'agent-decision-journal-tests: a journal event cannot present as approval',

  'L-AC-01': 'the closed lifecycle schema and validator are pinned; NO PRODUCER exists — no Pipeline path emits a lifecycle event',
  'L-AC-02': 'six of the eight #10 exchange identities are retained; queueRevision and a distinct correlationId are absent',
  'L-AC-03': 'lifecycle-governance-events-tests: registered namespace only, no credential-carrying namespace, no opaque digest',
  'L-AC-04': 'semantic classes pinned; the VISUAL class distinction in the renderer is not pinned',
  'L-AC-05': 'lifecycle-governance-events-tests: candidate invalidation visible, duplicate sequences fail closed',
  'L-AC-06': 'replay rejects extra event data instead of exposing raw lifecycle bodies',
  'L-AC-07': 'no serial/parallel/retry/cancellation/recovery/malicious fixture matrix is named',
  'L-AC-08': 'no artifact traces each retained element to a stated user or audit need',

  'P-AC-01': 'schema/compatibility/merge pinned; provenance, dependency and signature-policy validation are not named',
  'P-AC-02': 'organization-policy-tests: floor weakening, unknown rule, single-owner conflict all rejected',
  'P-AC-03': 'planOrganizationPolicyActivation pinned; newly-required artifacts, external effects and backfill range are not',
  'P-AC-04': 'organization-policy-activation-tests: activation only after a bound authority readback; stale plan preimage rejected',
  'P-AC-05': 'organization-policy-tests: credential, endpoint, coordinate, actor-mapping and signing-key fields refused at every level',
  'P-AC-06': 'candidate-bound bundle build and offline verify pinned; legacy, orphaned, misplaced, stale and illegally-mutable classes are not each pinned',
  'P-AC-07': 'audit-bundle-tests: signs and verifies only an unchanged manifest, without identity or authority claims',
  'P-AC-08': 'THE EPIC GATING SLICE. Command family and absent-manifest draft preview are built and registered; the existing-manifest PO-bound reconciliation and the Result-reconciliation fence are entirely absent',
  'P-AC-09': 'NO CARRIER: no export-backfill preview or explicit consent path exists',
  'P-AC-10': 'the bundle half is pinned; nothing prevents a compliance claim from a pack, log or viewer',
  'P-AC-11': 'document ownership is validated; mode, owned sections, lifecycle event, preview, approval, retention, conflict policy and revision readback are not pinned',
  'P-AC-12': 'audit-bundle-tests: tampered or missing bundle bytes detected; signature invalidated when the manifest changes',
  'P-AC-13': 'organization-policy-packs.md and audit-bundles.md are stubs; no migration/versioning policy, no pack threat model',

  'V-AC-01': 'evidence-view-model-tests: offline report with source links and a candidate-bound receipt',
  'V-AC-02': 'part of the label set is pinned; fact, estimate, assumption, human decision, redacted, invalid and not-applicable are not all covered',
  'V-AC-03': 'evidence-view-model-tests: claims linked to canonical source record and exact candidate',
  'V-AC-04': 'evidence-view-model-tests: invalid topology yields an invalid view with no candidate or artifact leak',
  'V-AC-05': 'evidence-view-renderer-tests: deterministic redacted projection withholding artifact paths',
  'V-AC-06': 'the renderer test claims accessibility; NO keyboard/navigation, CSP or mobile/desktop snapshot check is named',
  'V-AC-07': 'the input side is pinned; no assertion modifies a viewer file or UI state and shows canonical authority unchanged',
  'V-AC-08': 'evidence-view-model-tests: exact canonical lifecycle state or a typed unavailable result',
  'V-AC-09': 'pass/unknown/invalid fixtures exist; tampered, misplaced, orphaned and legacy-layout fixtures with deterministic snapshots do not',
  'V-AC-10': 'evidence-viewer-tests: candidate binding rendered before any derived summary',

  'X-AC-01': 'external-reference-adapter-tests: unclosed references rejected, non-pipeline-owned writes blocked',
  'X-AC-02': 'external-reference-adapter-tests: one ownership class per synchronized field/section',
  'X-AC-03': 'external-reference-adapter-tests: inspect, exact preview, authority, idempotent apply, matching readback',
  'X-AC-04': 'external-reference-adapter-tests: no success reported for revision, capability, authority or readback conflict',
  'X-AC-05': 'external-reference-adapter-tests: external observations reconciled without importing them as authority',
  'X-AC-06': 'external-reference-adapter-tests: deterministic typed state for every abnormal external observation',
  'X-AC-07': 'external-reference-adapter-tests: credentials and private coordinates kept out of every portable record',
  'X-AC-08': 'external-reference-adapter-tests: provider names and fields kept out of the normative core schemas',
  'X-AC-09': 'external-reference-adapter-tests: external content treated as untrusted data, no execution or authority injection',
  'X-AC-10': 'external-reference-adapter-tests: identity resolved through the feature package, not a path guess',
  'X-AC-11': 'NO CARRIER: the adapter never references organization policy, and the policy modules never reference the adapter',
  'X-AC-12': 'the CLI test uses local synthetic observations; the four required profiles are not each named',
  'X-AC-13': 'external-reference-adapter-tests: defaults to reference-only or projection, never last-write-wins',
  'X-AC-14': 'the doc carries a reconciliation section; no assertion shows an offline external system leaving canonical authority intact',
  'X-AC-15': 'external-traceability.md carries three sections; no threat model, publication guide or recovery procedure',

  'C-AC-01': 'change-control-tests: profile validation plus the exact bound tuple for mandatory promotion',
  'C-AC-02': 'emergency and not-required are pinned; standard vs. normal distinct inputs and the anti-class-shopping clause are not',
  'C-AC-03': 'change-control-tests: Pipeline and external authority validated independently against the same tuple',
  'C-AC-04': 'change-control-tests: stale, unauthenticated, mismatched, unavailable and outside-window state all block',
  'C-AC-05': 'change-control-tests: external update published only after the local deployment event; failed attempts preserved',
  'C-AC-06': 'change-control-tests: reconciliation-required entered instead of claiming completed change control',
  'C-AC-07': 'explicit emergency authority is pinned; bounded scope and retrospective evidence are not',
  'C-AC-08': 'change-control-tests: the deploy adapter stays independently usable when not-required',
  'C-AC-09': 'no assertion resolves exactly-one-profile or rejects multiple mandatory profiles',
  'C-AC-10': 'change-control-tests: an automatically created external record stays draft or observation',
  'C-AC-11': 'change-control-tests: provider names and fields kept out of the provider-neutral core schema',
  'C-AC-12': 'unavailable external state blocks via C-AC-04; the explicit advisory-vs-mandatory application and operator recovery path are not pinned',
  'C-AC-13': 'change-control.md is a stub; no threat model, precedence, migration, runbook or rollback procedure',

  'E-AC-01': 'governance-export-adapter-tests: one validated source mapped deterministically with stable identity',
  'E-AC-02': 'profiles implemented and documented; DECLARING every lossy field/semantic conversion is not pinned',
  'E-AC-03': 'governance-export-adapter-tests: policy-less exports denied, only explicitly allowed fields projected',
  'E-AC-04': 'no assertion covers free-form rationale omission-unless-permitted-and-redacted',
  'E-AC-05': 'governance-export-outbox-tests: independent destination queues, idempotent enqueue, retryable and quarantined entries preserved',
  'E-AC-06': 'at-least-once behaviour is exercised by the retry tests; the explicit no-exactly-once claim is documentation only',
  'E-AC-07': 'governance-export-delivery-tests: only the safely acknowledged prefix advances after partial delivery',
  'E-AC-08': 'two of the eight enumerated detections are pinned; cursor rollback, outbox truncation, event gap, source fork, invalid hash and schema downgrade are not',
  'E-AC-09': 'viewer renders lag; no assertion shows canonical governance continuing under an unavailable advisory destination',
  'E-AC-10': 'NO CARRIER: no named lifecycle boundary blocks only the exact unacknowledged source range',
  'E-AC-11': 'the privacy half is pinned; attempt, counts, cursor/lag and policy digests are not each pinned',
  'E-AC-12': 'governance-export-adapter-tests: profile and acknowledgements are closed, non-authoritative and deduplicated',
  'E-AC-13': 'governance-export-outbox-tests: destination queues, cursors and failure domains stay independent',
  'E-AC-14': 'the in-memory collector is pinned; local-file, syslog and failure-injection fixtures are not named',
  'E-AC-15': 'governance-export-adapter-tests: allowlisting/redaction completed before every persistence boundary',
  'E-AC-16': 'nine named assertions: batching bound, compression, payload bound, rate limit, retry budget, backpressure, flush, restart resume, replay',
  'E-AC-17': 'governance-export-outbox-tests: duplicate delivery preserves one canonical source history',
  'E-AC-18': 'governance-export-adapter-tests: destination secrets excluded from every portable export record',
  'E-AC-19': 'evidence-viewer-tests: export lag and receipts rendered as a separate non-authoritative observation',
  'E-AC-20': 'NO CARRIER: audit-bundle carries nothing from the export package, and the export modules never reference the bundle',
  'E-AC-21': 'governance-event-export.md carries two sections; no data-flow diagram, mapping/loss guide, retention guidance, runbook or incident procedure',

  'R-AC-01': 'external-command-offer-tests: public-safe offer recorded before presentation, verified append readback required',
  'R-AC-02': 'no assertion correlates a rejected sanctioned path and the alternatives considered to the offer',
  'R-AC-03': 'external-command-offer-tests: a bound human decision is required for destructive attempts and appended before execution',
  'R-AC-04': 'recovery state mutation with pre/post digests, recoverability and cleanup/readback is not pinned',
  'R-AC-05': 'agent-decision-journal-tests: every enumerated private field and every untyped digest refused at both journal boundaries',
  'R-AC-06': 'external-command-offer-tests: user execution stays unobserved; completion admitted only with bounded evidence',
  'R-AC-07': 'external-command-offer-tests: failed, partial, cancelled, mismatch and unknown outcomes retained distinctly',
  'R-AC-08': 'append-without-rewrite is structural; no recovery apply/rollback/cleanup lifecycle event is named',
  'R-AC-09': 'substitution is pinned; the replay-renders-unknown/invalid half is not',
  'R-AC-10': 'fail-closed on the append is pinned; the policy-defined typed non-material exception is absent',
  'R-AC-11': 'the restricted machine-local store exists; no assertion pairs it with a public-safe typed omission/commitment',
  'R-AC-12': 'NO CARRIER: no Phoenix bootstrap-trajectory fixture exists',
  'R-AC-13': 'five of the eleven required fixture classes are named; guard override, secret-bearing command rejection, governed-script identity and malicious external content are not',

  'EPIC-AC-01': 'the issue-to-criterion mapping exists; no independent closure status exists for any of the eight issues',
  'EPIC-AC-02': 'NO CARRIER: planParallelSprintIntegration has no concept of "unpublished" and is called only from its own test file',
  'EPIC-AC-03': 'an outstanding deviation is recorded (the bound Spec section 7 inventory omits six implemented modules) and is not yet repaired through the sanctioned route',
  'EPIC-AC-04': 'Full Verify and blocking Security pass on the pushed candidate; privacy review, an independent high-risk Critic on the integrated candidate, and explicit PO acceptance are absent',
  'EPIC-AC-05': 'a prohibition, and it currently bites: 79 criteria are not implemented',
  'EPIC-AC-06': 'the PRD header records the PO approval binding the first implementation dispatch',
};

// --- live issue acceptance bullets -----------------------------------------
// Transcribed verbatim from specs/sprint-phoenix-epic/design/issue-coverage.md.
const BULLETS = {
  5: {
    title: 'Generate a local human-readable Evidence Viewer',
    rows: [
      ['One command produces offline HTML', ['V-AC-01']],
      ['All canonical lifecycle states are represented', ['V-AC-08']],
      ['Tampered/stale/mismatched/misplaced/orphaned evidence fails visibly', ['V-AC-04', 'V-AC-09', 'K-AC-06']],
      ['Exact candidate binding is prominent', ['V-AC-10']],
      ['Pass/fail/unknown/tampered/misplaced/legacy fixtures', ['V-AC-09']],
      ['Accessibility and mobile/desktop readability', ['V-AC-06']],
    ],
  },
  9: {
    title: 'Introduce organization policy packs and signed audit bundles',
    rows: [
      ['Policy origin and effective value are inspectable', ['P-AC-03']],
      ['Conflicting/incompatible packs cannot activate silently', ['P-AC-01', 'P-AC-02', 'P-AC-04']],
      ['Required documentation stays provider-neutral', ['P-AC-11']],
      ['External permission is scoped by class/target/mode/ownership/event/approval', ['P-AC-11', 'X-AC-02', 'X-AC-03']],
      ['Policy cannot grant unrestricted edits or import prose authority', ['P-AC-02', 'P-AC-11', 'X-AC-05']],
      ['Publications require preview, source digest, revision readback, reconciliation', ['P-AC-11', 'X-AC-03', 'X-AC-04']],
      ['Audit bundles verify offline and expose tampering', ['P-AC-12']],
      ['Bundle artifacts resolve through canonical inventory', ['P-AC-06']],
      ['Invalid/misplaced/orphaned/unreconciled artifacts cannot enter silently', ['P-AC-06', 'P-AC-12']],
      ['Private overlays cannot smuggle private authority or coordinates', ['P-AC-05']],
      ['Threat model and migration/versioning are documented', ['P-AC-13']],
    ],
  },
  17: {
    title: 'Define a sanitized multi-agent event model and local replay view',
    rows: [
      ['Raw messages/prompts/credentials/private paths/logs excluded by default', ['L-AC-06', 'A-AC-06']],
      ['Unknown and unavailable remain distinct', ['K-AC-09']],
      ['Replay detects broken correlation and candidate invalidation', ['L-AC-05']],
      ['Replay is non-authoritative and links canonical evidence', ['L-AC-04', 'L-AC-05', 'V-AC-03', 'V-AC-07']],
      ['Serial/parallel/retry/cancellation/malicious fixtures', ['L-AC-07']],
      ['Design is driven by user/audit needs, not competitor parity', ['L-AC-08']],
    ],
  },
  23: {
    title: 'Define external work-system and knowledge-base traceability adapters',
    rows: [
      ['#22 is the sole canonical artifact/lifecycle source', ['X-AC-10']],
      ['#9 governs mandatory documents and external writes', ['X-AC-11']],
      ['Synthetic issue/wiki/document/secondary-forge adapters share one core', ['X-AC-12']],
      ['Every synchronized field/section has one ownership class', ['X-AC-02']],
      ['Reference-only/outbound projection is the default', ['X-AC-13']],
      ['Bidirectional mode rejects unmapped fields/conflicts', ['X-AC-04', 'X-AC-13']],
      ['External status/prose cannot grant Pipeline authority/evidence', ['X-AC-05']],
      ['Protected publication requires preview/digest/revision/readback/receipt', ['X-AC-03']],
      ['Externally owned sections cannot be overwritten', ['X-AC-02', 'X-AC-04']],
      ['Stale/deleted/inaccessible/duplicate/out-of-order states are typed', ['X-AC-06']],
      ['Writes support preview and capability-bounded idempotent retry', ['X-AC-03', 'K-AC-02', 'K-AC-03']],
      ['External outage cannot erase local authority', ['X-AC-14']],
      ['Credentials/private coordinates stay out of portable evidence', ['X-AC-07']],
      ['Provider-specific names stay outside core schemas', ['X-AC-08']],
      ['Contract/threat/mapping/publication/conformance docs exist', ['X-AC-15']],
      ['#24 consumes the contract without provider-specific core fields', ['X-AC-08', 'C-AC-11']],
    ],
  },
  24: {
    title: 'Add policy-governed ITSM change control to release and promotion',
    rows: [
      ['Existing deploy adapter remains independent/provider-neutral', ['C-AC-08', 'C-AC-11']],
      ['Environment selects no control or exactly one effective profile', ['C-AC-09']],
      ['One artifact/environment binds both authorities, deploy, evidence, rollback, close', ['C-AC-01', 'C-AC-03', 'C-AC-05', 'C-AC-06']],
      ['Automatic creation/documentation never implies approval', ['C-AC-10']],
      ['Invalid/stale/wrong-window/wrong-artifact mandatory records block', ['C-AC-04']],
      ['Standard/normal/emergency/not-required have distinct behavior', ['C-AC-02']],
      ['Status text or unauthenticated actor cannot satisfy Pipeline authority', ['C-AC-03', 'C-AC-04']],
      ['Failure/rollback updates retain the failed attempt', ['C-AC-05']],
      ['Post-deploy external-write failure enters reconciliation', ['C-AC-06']],
      ['Synthetic core; named products only in profiles', ['X-AC-12', 'C-AC-11']],
      ['Advisory/mandatory offline and unavailable behavior is explicit', ['C-AC-12']],
      ['Threat/policy/migration/runbook/recovery docs exist', ['C-AC-13']],
    ],
  },
  30: {
    title: 'Add a repository-scoped tamper-evident human governance decision ledger',
    rows: [
      ['Every human authority transition records a decision first', ['H-AC-01', 'H-AC-12']],
      ['Mutable state without a valid decision cannot grant authority', ['H-AC-02']],
      ['Full decision lifecycle is reconstructable', ['H-AC-03', 'H-AC-05', 'H-AC-06', 'H-AC-11']],
      ['Decisions bind every policy-required target dimension', ['H-AC-04']],
      ['Cross-repository writes/consumption are rejected', ['H-AC-07', 'H-AC-09', 'K-AC-06']],
      ['Revocation/correction/expiry/supersession append history', ['H-AC-06']],
      ['Interrupted/concurrent append recovers without silent split authority', ['K-AC-04', 'K-AC-05', 'K-AC-07']],
      ['Idempotent duplicate submission cannot duplicate authority', ['K-AC-02', 'K-AC-03']],
      ['Truncation/reorder/change/fork/path/hash failures verify offline', ['K-AC-05', 'K-AC-06', 'K-AC-08']],
      ['Guard/plan/release/deploy/override paths reference decision IDs', ['H-AC-12']],
      ['Unverified legacy material cannot satisfy a current gate', ['H-AC-08']],
      ['Secrets/prompts/transcripts/commands/private paths are excluded', ['H-AC-13']],
      ['#5 renders the timeline without authority', ['V-AC-03', 'V-AC-07']],
      ['#9 bundles verified ledger records/integrity', ['P-AC-06', 'P-AC-12']],
      ['#24 links external and Pipeline decisions without conflation', ['C-AC-03']],
      ['Schema/taxonomy/authority/threat/migration/retention/recovery docs exist', ['H-AC-14']],
      ['Complete decision/failure/privacy fixture set', ['H-AC-15']],
    ],
  },
  31: {
    title: 'Add a privacy-preserving agent decision and assumption journal',
    rows: [
      ['Closed schema/materiality policy selects journaled events', ['A-AC-01', 'K-AC-01']],
      ['Assumption states remain distinct', ['A-AC-11', 'K-AC-09']],
      ['Verification/contradiction/expiry/invalidation/supersession append events', ['A-AC-02']],
      ['Changed assumptions invalidate/revalidate affected work', ['A-AC-03']],
      ['Journal cannot satisfy any authority/evidence gate', ['A-AC-16']],
      ['Human confirmation correlates to #30; only #30 grants authority', ['A-AC-04']],
      ['Runner/model/profile/role/capability carries assurance', ['A-AC-05']],
      ['Prompts/transcripts/reasoning/secrets/private paths/raw output excluded', ['A-AC-06']],
      ['Redaction occurs before local persistence and external projection', ['A-AC-06', 'E-AC-15']],
      ['Mandatory material events are never sampled/discarded silently', ['A-AC-07']],
      ['Retention/access/integrity is independent of human ledger', ['A-AC-12']],
      ['Interrupted/concurrent/duplicate/out-of-order behavior is deterministic', ['A-AC-13']],
      ['Offline verification detects mutation/gaps/forks/path/repository errors', ['K-AC-05', 'K-AC-06', 'K-AC-08']],
      ['#17 replays all origins without authority collapse', ['L-AC-04']],
      ['#5 shows uncertainty/status/decision with evidence', ['V-AC-02', 'V-AC-03']],
      ['Complete assumption/selection/failure/privacy fixture set', ['A-AC-14']],
      ['Schema/taxonomy/materiality/trust/privacy/retention/recovery docs exist', ['A-AC-15']],
    ],
  },
  32: {
    title: 'Add provider-neutral governance event export for SIEM and audit platforms',
    rows: [
      ['Human/agent/lifecycle origin and authority survive export', ['K-AC-10', 'E-AC-01']],
      ['Every export maps one validated source with stable identity/correlation', ['E-AC-01']],
      ['CloudEvents/OTLP/NDJSON/RFC 5424 mappings are deterministic/loss-declared', ['E-AC-02']],
      ['Default export excludes all prohibited/private material', ['E-AC-03', 'E-AC-15', 'E-AC-18']],
      ['Free-form rationale is explicit-policy-only and redacted', ['E-AC-04']],
      ['Sanitization precedes every queue/log/dead-letter/metric/receipt', ['E-AC-15']],
      ['At-least-once/idempotency/order/retry/rate/backpressure/replay/restart tested', ['E-AC-06', 'E-AC-16']],
      ['Duplicate delivery creates no canonical event/authority', ['E-AC-17']],
      ['Partial acceptance advances only acknowledged events', ['E-AC-07']],
      ['Cursor/gap/fork/hash/schema/ack failures are typed', ['E-AC-08']],
      ['Advisory failure preserves canonical operation', ['E-AC-09']],
      ['Required mode blocks only exact named boundary/range', ['E-AC-10']],
      ['Destination/alerts cannot change authority', ['E-AC-12']],
      ['Credentials/endpoints remain outside portable artifacts', ['E-AC-18']],
      ['Multiple destinations are independent', ['E-AC-13']],
      ['Receipts state exact acknowledgement without retention/review claims', ['E-AC-11']],
      ['External event correlates to sources/candidate/evidence/policy/chain', ['E-AC-01', 'K-AC-10']],
      ['#5 shows export lag/failure/receipt state without authority', ['E-AC-19']],
      ['#9 bundles sanitized export-policy/delivery metadata', ['E-AC-20']],
      ['Threat/data-flow/mapping/retention/runbook/recovery docs exist', ['E-AC-21']],
    ],
  },
};

// --- computation ------------------------------------------------------------
function verdictOf(id) {
  const d = DELTA[id];
  if (d) return d;
  const v = VERDICTS[id];
  if (!v) throw new Error(`no verdict recorded for ${id}`);
  return v;
}

const out = [];
const w = (s = '') => out.push(s);

// integrity: every criterion referenced by a bullet must have a verdict
const referenced = new Set();
for (const issue of Object.values(BULLETS)) {
  for (const [, ids] of issue.rows) for (const id of ids) referenced.add(id);
}
const missing = [...referenced].filter((id) => !VERDICTS[id]).sort();

const totals = {};
for (const id of Object.keys(VERDICTS)) {
  const [v] = verdictOf(id);
  totals[v] = (totals[v] || 0) + 1;
}

const nImpl = Object.keys(VERDICTS).filter((id) => verdictOf(id)[0] === IMPLEMENTED).length;
const nTotal = Object.keys(VERDICTS).length;
const nBullets = Object.values(BULLETS).reduce((n, i) => n + i.rows.length, 0);

w('# Sprint Phoenix — acceptance evidence map and issue reconciliation');
w();
w('Status: measurement');
w();
w('Date: 2026-08-09');
w();
w('Parent specification: [../spec.md](../spec.md) · Acceptance matrix: [../acceptance.md](../acceptance.md)');
w();
w('## What this document is');
w();
w('One durable record answering two questions the Product Owner asked together: what evidence');
w(`exists for each of the ${nTotal} Phoenix acceptance criteria, and what remains open when those`);
w(`verdicts are reconciled against the ${nBullets} live acceptance bullets of the eight open`);
w('`sprint:phoenix` issues.');
w();
w('It supersedes `acceptance-evidence-map-20260805.md` as the current measurement. It is generated');
w('by its own generator, `acceptance-evidence-map.mjs` in this directory, which carries the verdict');
w('map, the evidence pointers and');
w('the bullet-to-criterion map as auditable data rather than prose — regenerate it after any');
w('re-measurement instead of hand-editing this file.');
w();
w('**Candidate.** Measured at `de69756` on `sprint_phoenix`. The gate evidence belongs to `3387065`');
w('(`evidence/verify-latest.json`: `exitCode 0`, `status passed`, 368 registered suites, 368');
w('terminal receipts, `binding: "exact"`, tree clean at start and finish); the two commits between');
w('that candidate and the measured HEAD touch `docs/` and `backlog/` only, so no product surface');
w('moved. Security: `pipeline.security-verdict.v2`, `blocking: false`, `cap.sast` pass,');
w('`cap.secrets` pass.');
w();
w('**Evidence base.** Four read-only measurements, each dispatched to a fresh context and each');
w('adjudicating from the tree rather than from the handover:');
w();
w('| tag | measurement | scope |');
w('|---|---|---|');
w('| C | `PHX-COVERAGE`, 2026-08-08 | all 157 criteria, first full pass |');
w('| J | `PHX-ADJ2`, 2026-08-08 | the ten criteria the first pass could not adjudicate |');
w('| A | `PHX-FIN-A`, 2026-08-09 | the 13 PX0/P criteria moved by later product commits |');
w('| B | `PHX-FIN-B`, 2026-08-09 | the 10 A/H/EPIC criteria moved by later product commits |');
w();
w('The `A` and `B` runs re-measured, and did not inherit, every row they touched. Their run output');
w('lives under `evidence/` and is git-ignored by QG-03, which is why the operative content is');
w('reproduced here rather than referenced.');
w();
w('## The direct answer');
w();
w(`**Phoenix cannot claim complete.** ${nImpl} of ${nTotal} criteria carry a named assertion in a`);
w(`gate-registered suite; ${nTotal - nImpl} do not. EPIC-AC-05 forbids a completion claim while any`);
w('criterion remains unimplemented or unverified, and it currently bites. No issue is closeable on');
w('its own live acceptance bullets.');
w();
w('The shape of the remainder has not changed since the first pass and is worth stating plainly:');
w('Phoenix built the libraries and left the integration. Most non-implemented rows are not absent');
w('features but unpinned sub-clauses of features that exist — and a smaller, harder set is the');
w('seams between packages that are each individually implemented and mutually unaware.');
w();
w('Closure rule applied verbatim from `specs/sprint-phoenix-epic/design/issue-coverage.md:201-204`:');
w('an issue remains open if any mapped criterion is unimplemented, unverified, dependent on');
w('unpublished sibling work, or deferred without explicit PO disposition, owner and expiry.');
w('A bullet is therefore BLOCKED unless every criterion mapped to it is `implemented`.');
w();
if (missing.length) {
  w(`**INTEGRITY FAILURE:** criteria referenced by a bullet with no recorded verdict: ${missing.join(', ')}`);
  w();
}

w('## Criterion verdict totals');
w();
w('| verdict | count |');
w('|---|---|');
for (const k of ['implemented', 'partial', 'designed-only', 'not-started', 'constraint']) {
  w(`| ${k} | ${totals[k] || 0} |`);
}
w(`| **total** | **${Object.keys(VERDICTS).length}** |`);
w();

const noPointer = Object.keys(VERDICTS).filter((id) => !POINTERS[id]).sort();
if (noPointer.length) {
  w(`**INTEGRITY FAILURE:** criteria with a verdict but no evidence pointer: ${noPointer.join(', ')}`);
  w();
}

w('## Per criterion — verdict and evidence');
w();
w('`src`: **C** = the 2026-08-08 baseline measurement, **J** = its ten-row adjudication follow-up,');
w('**A**/**B** = the 2026-08-09 delta re-measurement. For `implemented`, the pointer names the');
w('gate-registered suite that pins the operative clause; for every other verdict it names the exact');
w('clause that is not pinned or not built.');
w();
const GROUPS = [
  ['PX0', 'Lifecycle-authority revision and runner-neutral ruleset source'],
  ['K', 'Governance event kernel'],
  ['H', 'Human Governance Decision Ledger (#30)'],
  ['A', 'Agent Decision and Assumption Journal (#31)'],
  ['L', 'Lifecycle stream and replay (#17)'],
  ['P', 'Policy packs and signed audit bundles (#9)'],
  ['V', 'Human-readable Evidence Viewer (#5)'],
  ['X', 'Traceability and documentation adapters (#23)'],
  ['C', 'ITSM change control (#24)'],
  ['E', 'Governance event export (#32)'],
  ['R', 'External command offer, workaround and recovery audit profile'],
  ['EPIC', 'Epic integration and release'],
];
for (const [prefix, title] of GROUPS) {
  const ids = Object.keys(VERDICTS).filter((id) => id.slice(0, id.lastIndexOf('-AC-')) === prefix);
  const impl = ids.filter((id) => verdictOf(id)[0] === IMPLEMENTED).length;
  w(`### ${prefix} — ${title} (${impl}/${ids.length} implemented)`);
  w();
  w('| ID | verdict | src | evidence / named gap |');
  w('|---|---|---|---|');
  for (const id of ids) {
    const [v, s] = verdictOf(id);
    w(`| ${id} | ${v} | ${s} | ${POINTERS[id]} |`);
  }
  w();
}

w('## Per issue');
w();
const summary = [];
for (const num of Object.keys(BULLETS).map(Number).sort((a, b) => a - b)) {
  const issue = BULLETS[num];
  const blocked = [];
  const clear = [];
  for (const [text, ids] of issue.rows) {
    const bad = ids.filter((id) => verdictOf(id)[0] !== IMPLEMENTED);
    if (bad.length) blocked.push([text, bad]);
    else clear.push(text);
  }
  summary.push([num, issue.rows.length, clear.length, blocked.length]);

  w(`### #${num} — ${issue.title}`);
  w();
  w(`${clear.length} of ${issue.rows.length} live acceptance bullets fully carried; **${blocked.length} blocked**.`);
  w();
  if (blocked.length === 0) {
    w('No blocking criterion. Closeable subject to the epic-level gates (EPIC-AC-01..06).');
    w();
    continue;
  }
  w('| # | live acceptance bullet | blocking criteria (verdict) |');
  w('|---|---|---|');
  blocked.forEach(([text, bad], i) => {
    const cells = bad.map((id) => `${id} (${verdictOf(id)[0]})`).join(', ');
    w(`| ${i + 1} | ${text} | ${cells} |`);
  });
  w();
}

w('## Summary');
w();
w('| issue | bullets | carried | blocked | closeable |');
w('|---|---|---|---|---|');
for (const [num, total, clear, blocked] of summary) {
  w(`| #${num} | ${total} | ${clear} | ${blocked} | ${blocked === 0 ? 'yes' : '**no**'} |`);
}
const closeable = summary.filter(([, , , b]) => b === 0).length;
w();
w(`Issues closeable on their own live acceptance bullets: **${closeable} of ${summary.length}**.`);
w();

// distinct blocking criteria, ranked by how many bullets they block
const blockCount = new Map();
for (const issue of Object.values(BULLETS)) {
  for (const [, ids] of issue.rows) {
    for (const id of ids) {
      if (verdictOf(id)[0] !== IMPLEMENTED) blockCount.set(id, (blockCount.get(id) || 0) + 1);
    }
  }
}
w('## The blocking set, ranked');
w();
w(`${blockCount.size} distinct criteria block at least one live acceptance bullet.`);
w();
w('| criterion | verdict | live bullets blocked |');
w('|---|---|---|');
for (const [id, n] of [...blockCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
  w(`| ${id} | ${verdictOf(id)[0]} | ${n} |`);
}
w();

// criteria carried by NO live bullet: the Phoenix-only strictness surface
const unreferenced = Object.keys(VERDICTS).filter((id) => !referenced.has(id)).sort();
w('## Criteria not mapped to any live issue bullet');
w();
const unrefOpen = unreferenced.filter((id) => verdictOf(id)[0] !== IMPLEMENTED);
w(`${unreferenced.length} of ${Object.keys(VERDICTS).length} criteria are Phoenix's own stricter contract rather than a live issue obligation.`);
w('They block no issue, but EPIC-AC-05 still forbids an epic completion claim while any of them is not `implemented`.');
w(`${unrefOpen.length} of those ${unreferenced.length} are currently not \`implemented\` and are listed below; the rest are omitted because they are done.`);
w();
w('| criterion | verdict |');
w('|---|---|');
for (const id of unrefOpen) w(`| ${id} | ${verdictOf(id)[0]} |`);
w();

w('## The epic gates, one by one');
w();
w('EPIC-AC-04 names seven gates for a completion claim. Their current state, so that the remaining');
w('work is not mistaken for paperwork:');
w();
w('| gate | state | evidence |');
w('|---|---|---|');
w('| Focused package checks | **partial** | per-package suites are green, but P-AC-08 declares the feature-package writer slice the gating first slice and its reconciliation half is unbuilt |');
w('| Full Verify | **passed** | `evidence/verify-latest.json` — exit 0, 368/368, exact binding on `3387065`, clean at start and finish |');
w('| Blocking Security | **passed** | `pipeline.security-verdict.v2` — `blocking: false`, `cap.sast` pass, `cap.secrets` pass |');
w('| Privacy review | **absent** | no privacy-review artifact exists for the integrated candidate |');
w('| Independent high-risk Critic | **absent for the integrated candidate** | Critic rounds exist per work package; none reviews Phoenix as one integrated candidate |');
w('| Exact branch push and readback | **passed** | `origin/sprint_phoenix = 3387065`, readback OID equality confirmed, approval bound to that exact commit |');
w('| Explicit PO acceptance | **absent** | the only recorded PO approval binds the first implementation dispatch (EPIC-AC-06), not completion |');
w();
w('Two epic criteria are open for reasons that are not implementation debt and cannot be closed by');
w('writing code:');
w();
w('- **EPIC-AC-03** — a deviation is recorded and unrepaired: the bound Spec §7 inventory omits six');
w('  already-implemented Phoenix modules. The criterion requires the Spec updated and the affected');
w('  approval renewed; the sanctioned route is the continuity-authority revision writer, which now');
w('  exists (PX0-AC-02 implemented), so this is executable where it previously was not.');
w('- **H-AC-11** — its own PO amendment records that Increment 1 does **not** satisfy the');
w('  no-join-handle clause for the GMW half, as a proved impossibility rather than an unfinished');
w('  implementation. It closes only by a separately reviewed amendment scoping the clause, or by');
w("  changing GMW's machine-local storage. Tracked as O-4.");
w();

// The repository's closed shell grammar admits no redirects, so the output path
// is an argument rather than a `>` redirection.
const outIdx = process.argv.indexOf('--out');
const text = out.join('\n') + '\n';
if (outIdx !== -1 && process.argv[outIdx + 1]) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(process.argv[outIdx + 1], text);
  process.stdout.write(`wrote ${process.argv[outIdx + 1]} (${text.length} bytes)\n`);
} else {
  process.stdout.write(text);
}
