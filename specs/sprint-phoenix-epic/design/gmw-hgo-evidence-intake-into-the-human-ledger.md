# GMW/HGO evidence intake into the Human Governance Decision Ledger

> Design only. Nothing in this document has been implemented. It specifies a
> **receiving contract**: what the PHX-2 Human Governance Decision Ledger requires
> from the two human-authority mechanisms in this plugin (GMW, HGO) so that a
> reviewer can reconstruct *what was approved, when, why, and by whom* — without
> violating the privacy split the bound acceptance criteria already mandate.
> The finalized GMW is being produced in a separate session and was not available
> when this was written; every assumption about its final shape is listed and
> labelled in §10.

Source of the requirement: `backlog/items/2026-08-07-gmw-hgo-evidence-must-reach-the-phoenix-audit-ledger.md`
(PO requirement, APS, 2026-08-07). Every factual claim that item makes about GMW
was re-derived from source for this document; the results are in §3 and §14.

## 1. Threat model — read this first, everything below reasons from it

**The adversary is the agent, not the human.** This is a binding PO decision
(APS, 2026-08-07), taken while rejecting a proposal for a second PO-held key and
a per-release signing ceremony: *"wir sichern den agenten ab und nicht den human.
Das signieren ausserhalb ist schon heftig genug."*

Three consequences that shape every decision in this document:

1. **No new human ceremony, key, or signing step is proposed.** The evidence
   intake rides entirely on ceremonies that already exist: GMW's existing detached
   Ed25519 proof over an intent digest (`plugins/pipeline-core/lib/guard-maintenance-window.mjs:418`,
   `plugins/pipeline-core/lib/po-approval-proof.mjs:33`) and HGO's existing
   attended authorization. Where a requirement cannot be met without a new human
   step, this document says so as a finding instead of designing the step in
   (see §11, open question O-3).
2. **The value of the ledger record here is reconstructability and tamper-evidence
   against agent behaviour and accidental loss** — not defence against a human
   forging their own approval. An argument of the form *"a human could tamper with
   X"* carries almost no weight in what follows. An argument of the form *"an agent
   can reach X"*, or *"X is silently lost on the normal happy path"*, is decisive.
   GMW's current retention behaviour is a **loss** problem (§3.2), not a forgery
   problem, and is treated as such.
3. **Fail-closed and fail-open are chosen per direction, by who gains capability.**
   Anything that would let an agent obtain an *unrecorded* lift fails closed.
   Anything that would let an agent keep a lift *alive* by breaking the ledger
   fails open toward narrowing. §8 takes this decision explicitly.

**The constraint forbids adding, it retires nothing.** Read it as a ceiling, not
as a rollback: every existing external-signing boundary stays exactly as it is.
`specs/sprint-phoenix-epic/spec.md:423-426` binds `authority-revision-proof.mjs`,
`phoenix-authority-approval.mjs` and `phoenix-authority-revision.mjs` — the
external-key/human-terminal signature boundary for a continuity authority
revision — and none of it is touched here. The PO confirmed the same position on
2026-08-06 (`docs/state.md:624`): *"signing outside the agent session is intended
and stays: the prompt is what keeps the credential out of the session's reach,
and an agent able to satisfy it would hold the signing authority it exists to be
denied."* That is the same agent-adversary model as the 2026-08-07 correction, not
a competing one. This design accordingly **leans on** the existing signature
boundary wherever it already applies (GMW's proof at install) and proposes no
retirement of any bound criterion, ADR, or shipped module; what it must not do —
and does not do — is invent an extra approval or signing act to get evidence into
the ledger.

A second, quieter property matters for the same reason: the portable ledger lives
in the Git worktree, which is exactly the surface an agent can write. That is why
this design never moves a *capability-bearing* record into the worktree (§6) and
why the ledger is treated as **evidence plus a cross-check**, never as the sole
thing standing between an agent and a lifted guard.

## 2. Scope, non-scope, deferred

**In scope.** The receiving contract for two producers into the existing PHX-2
ledger: which portable events are appended, at which point in each producer's
lifecycle, derived from exactly which producer fields, with which assurance
classes; the portable/restricted split for actor attribution and rationale; the
retention model for GMW; failure and crash behaviour; the exact amendment
H-AC-12 needs; a file-level implementation inventory and test approach.

**Non-scope.**

- Changing GMW's or HGO's security model, proof requirement, or scope rules.
  This design adds no allow, weakens no deny, and reads no key.
- The ledger's own internals. `plugins/pipeline-core/lib/human-governance-ledger.mjs`,
  `human-governance-decision.mjs`, `governance-event.mjs` and
  `governance-event-store.mjs` already exist and provide the append-only,
  hash-chained, repository-bound, locked, idempotent writer this design targets.
  **No parallel ledger mechanism is proposed.**
- Any edit to the bound artifacts `specs/sprint-phoenix-epic/acceptance.md` and
  `specs/sprint-phoenix-epic/spec.md`. §9 specifies the amendments; applying them
  is the reviewed rebind path's job, not this document's.
- The push-approval path (`gates.push_approval`), covered by
  `specs/sprint-phoenix-epic/design/phx-2-additive-ledger-authority.md`.

**Deferred, deliberately.**

- **D-1 — the restricted machine-local attribution record (increment 2).** The
  restricted store already exists (§3.4) but admitting an attribution payload into
  it requires a kernel change plus a spec §6.1 amendment. Increment 1 answers all
  four PO questions portably at class level and leaves attribution exactly where
  it already lives. See §5.4.
- **D-2 — synchronous dual-evaluation inside the guard hot path.** §8.5 explains
  why the intersection check is placed at the arming/consumption boundary and in
  reconcile, not on every hook read, and what that costs.
- **D-3 — lazy `expired` dispositions.** Emitted by an explicit reconcile step,
  not by a timer or by the guard read path (§7.5).

## 3. What exists today (verified against source, not assumed)

### 3.1 The ledger and the event kernel — the sink exists

- `plugins/pipeline-core/lib/human-governance-decision.mjs:22-41`
  (`validateHumanGovernanceDecision`) defines the closed portable payload:
  exactly `decisionId, event, outcome, authorityClass, identityAssurance,
  timeAssurance, scope, reasonCode, policyDigest, ruleDigest, validity, links`.
  Extra keys are rejected (`exact()`, line 18). `EVENTS` (line 8) is
  `requested, granted, denied, cancelled, consumed, revoked, expired, corrected,
  superseded`; `AUTHORITIES` (line 10) is `product-owner, delegated-reviewer,
  security-reviewer, privacy-reviewer`; `ASSURANCE` (line 11) is
  `locally-attributed, externally-attested, unknown`. `reasonCode` must match
  the upper-case `CODE` pattern of line 5 (an upper-case initial followed by up to
  127 characters drawn from `A-Z`, `0-9`, `.`, `_`, `:` and `-`) — **free text is
  structurally rejected**.
  `scope` (line 28) is exactly `repositoryFingerprint, candidate{commit,tree},
  packageId, action, environment, artifacts[{path,sha256}]`; `validity` (line 33)
  is `notBeforeEpochMs, expiresAtEpochMs, singleUse`; `links` (line 35) is the six
  lifecycle links, of which **exactly one** must be non-null for every event other
  than `requested` (lines 37-39).
- `plugins/pipeline-core/lib/human-governance-ledger.mjs:150`
  (`appendHumanGovernanceDecision`) is the portable writer; `:228`
  (`queryHumanGovernanceDecisions`) the reader; `:48`
  (`resolveHumanGovernanceAuthority`) the fail-closed resolver, which already
  denies on `not-granted`, `scope-mismatch`, `expired`, and `disposed` (lines
  54-58).
- `plugins/pipeline-core/lib/governance-event.mjs:25-30` fixes the 28 envelope
  keys; `:169-174` restricts human-origin payloads to
  `pipeline.human-governance-decision.v1` and
  `pipeline.human-role-exception-decision.v1`; `:181-182` force
  `sourceUri = urn:pipeline:repository:<fingerprint>` and `streamId === origin`;
  `:191-195` enforce portable/restricted policy coherence.
- `plugins/pipeline-core/lib/governance-event-store.mjs:629`
  (`appendPortableGovernanceEvent`) is **async** and takes an *intent* — the four
  fields `sequence, previousEventDigest, payloadDigest, eventDigest` are computed
  by the store, not by the caller (`INTENT_OMITTED_FIELDS`, line 36).
- The repository fingerprint used by the ledger is
  `derivePoGateRepositoryFingerprint({gitCommonDir, primaryRoot})`
  (`plugins/pipeline-core/lib/po-gate-authority.mjs:212-217`,
  preimage `pipeline.po-gate.repository.v1\0<common>\0<primary>`), resolved in
  `governance-event-store.mjs:81-88`.

**Conclusion: the sink exists and is usable today.** This design writes to it and
invents nothing parallel.

### 3.2 GMW — the backlog item's three claims re-verified

| Backlog claim | Verified? | Evidence |
| --- | --- | --- |
| Window lives at `<git-common-dir>/agent-pipeline/guard-maintenance-window/window.json`, machine-local | **yes** | `guard-maintenance-window.mjs:258-261` (`storagePaths`) |
| `installGuardMaintenanceWindow` overwrites with `writeAtomic` | **yes** | `:467`, atomic `rename` at `:247-256` |
| `closeGuardMaintenanceWindow` unlinks the record | **yes** | `:574` (`unlinkSync(paths.window)`), no copy taken first |
| So a closed window leaves **no durable evidence at all** | **yes** | close is the only writer of that path besides install; nothing else persists the record |
| `subject.reason` is free text | **yes** | required non-empty string at `:342`, trimmed into the signed subject at `:358`, `validSubject` at `:301` |
| The intent carries `featureId/planSha256/specSha256/candidate` | **yes** | `:366-375`, built by `createPoApprovalIntent` (`po-approval-proof.mjs:22-26`), which also carries `kind`, `policyRevision`, `subjectSha256`, `decision` |

Additional facts this design depends on, all read from source:

- The signed subject is exactly `{scopeRuleIds, expiresAtMs, reason,
  repoFingerprintSha256, openingTreeSha256, nonce}` (`:355-362`), and
  `expiresAtMs` is an **absolute, signed** bound (`:351-354`).
- The stored window record is `{schema, root, repoFingerprintSha256, subject,
  intent, proof, installedAtMs}` (`:457-465`). **`root` is an absolute filesystem
  path** and `proof` is signature material — both matter for §6.
- Effective expiry is `min(signed expiresAtMs, installedAtMs + MAX_WINDOW_TTL_MS)`
  (`:542-545`), fail-closed (`Number.isFinite(...) && nowMs < ...`).
- The liftable rule set is closed and public: `LIFTABLE_RULE_IDS = ["GS-6"]`
  plus the `TP-` prefix (`:104-110`), with a hardcoded never-liftable kernel list
  at `:120-128`.
- GMW's own `repoFingerprint` is `sha({physicalRoot, physicalCommon})` (`:284-286`)
  — a **different preimage** from the ledger's fingerprint (§3.1). The two values
  are not interchangeable; see A-6 in §10.
- The CLI (`plugins/pipeline-core/scripts/guard-maintenance-window.mjs:54`)
  exposes `prepare | install | status | close`, and `prepare` already accepts
  `--plan <path>` and `--spec <path>`, while `install` currently accepts only
  `--request` and `--proof` (`:115-128`).

### 3.3 HGO — already audit-chained, already named in H-AC-12

- Storage: `<git-common-dir>/agent-pipeline/human-guard-overrides/` with
  `audit.jsonl`, `audit.head.json`, a MAC key and a lock
  (`plugins/pipeline-core/lib/human-guard-override.mjs:270-282`). Entries are
  MAC-verified on read (`:995`) and the head is authenticated (`:1023-1026`).
- The chain already records `denied` (`:1226-1235`), `authorized`
  (`:1511-1520`), `expired`/`rejected` (`:1598-1605`) and `consumed`
  (`:1623-1631`).
- **HGO already stores the rationale as a digest, never as text**: `reasonSha256`
  is computed at `:1370` and is what travels through the audit entries. This is a
  useful in-repo precedent for §5.3 — and note it stays machine-local, which is
  precisely what makes it acceptable.
- HGO is covered by H-AC-12's "Git-guard override consumption"
  (`specs/sprint-phoenix-epic/acceptance.md:187-193`). GMW is not (§9).

### 3.4 The restricted machine-local zone — also already exists

`governance-event-store.mjs` provides `putRestrictedGovernanceEvent` (`:740`),
`queryRestrictedGovernanceEvent` (`:803`), `eraseRestrictedGovernanceEvent`
(`:824`), `destroyRestrictedGovernanceKey` (`:844`),
`createRestrictedAuthorization` (`:124`) and `planRestrictedGovernanceOperation`
(`:773`). Records are encrypted, must live **outside** the repository
(`:90-93`), and the envelope must declare `storageProfile:
"restricted-machine-local"`, `classification: "restricted"`,
`retentionCompatibility: "machine-local-expiring"` (`:747-749`). That is exactly
the erasable zone H-AC-06's restricted branch and H-AC-11's "separately protected
machine-local decision record" describe.

**One blocker, verified:** `governance-event.mjs:169-174` admits only the two
existing human payload schemas, so an *attribution* payload cannot enter that
store without a kernel change. That is why the restricted record is increment 2
(§5.4, D-1), not increment 1.

## 4. The four PO questions as a field mapping

`what / when / why / by whom`, each mapped to the concrete portable field, the
criterion that requires it, and the assurance class it can **honestly** claim.
All field names are from the validated payload (§3.1) unless prefixed `envelope.`.

| PO question | Portable field(s) | Value for GMW | Value for HGO | Required by | Honest assurance |
| --- | --- | --- | --- | --- | --- |
| **what** was approved | `scope.action` | `GUARD.MAINTENANCE.LIFT` | `GUARD.OVERRIDE.CONSUME.SIGNATURE` or `GUARD.OVERRIDE.CONSUME.CHAT` | H-AC-11 "exact scope", H-AC-04 "action" | deterministic, derived from the mechanism, not from operator input |
| | `scope.packageId` | `guard-maintenance-window` | `human-guard-override` | H-AC-04 "package" | deterministic |
| | `ruleDigest` | `canonicalSha256({scopeRuleIds, openingTreeSha256})` | `canonicalSha256({eligiblePaths, commandClass})` | H-AC-04 "rule", H-AC-11 "rule digests" | re-derivable against the closed public catalogue (`LIFTABLE_RULE_IDS` + `TP-` prefix, `:104-110`) |
| | `scope.candidate` | intent `candidate{commit,tree}` verbatim | capability's candidate | H-AC-04 "candidate" | signed for GMW; locally observed for HGO |
| | `scope.artifacts` | plan + spec `{path, sha256}`, digests re-checked against the signed intent | plan + spec of the override | H-AC-04 "artifact" | digest-verified at intake |
| | `scope.environment` | `local-checkout` | `local-checkout` | H-AC-04 "environment" | deterministic |
| | `validity.singleUse` | `false` (a window is time-boxed, not single-use) | `true` | H-AC-04 "single-use" | structural |
| **when** | `validity.notBeforeEpochMs` / `expiresAtEpochMs` | `installedAtMs` / `min(signed expiresAtMs, installedAtMs + MAX_WINDOW_TTL_MS)` — the **same formula** the enforcement path uses (`:542-545`) | authorization time / capability expiry | H-AC-04 "validity", H-AC-11 "time" | — |
| | `envelope.occurredAtEpochMs`, `envelope.observedAtEpochMs` | local clock at the transition | local clock | H-AC-11 "time and assurance" | — |
| | `timeAssurance` (payload and envelope) | **`locally-observed`, always** | `locally-observed` | H-AC-05 (never claim trusted time) | there is no attested time source anywhere in this path |
| **why** | `reasonCode` | signed `subject.reasonCode` if the final GMW carries one; otherwise `GUARD.MAINTENANCE.WINDOW_UNATTESTED` (§5.3) | stable code per HGO outcome, e.g. `GUARD.OVERRIDE.CONSUMED` | H-AC-11 "stable reason code" | signed → attested by the same proof; unsigned → explicitly marked as unattested by the code itself |
| | *(the operator's free-form reason)* | **not portable, ever** — stays machine-local (§5) | already digest-only (`reasonSha256`) and machine-local | H-AC-13 | — |
| **by whom** | `authorityClass` | `product-owner` | `product-owner` (or the configured reviewer class) | H-AC-11 "actor/authority class" | class only — **no name, no key digest, no pseudonym** (H-AC-05) |
| | `identityAssurance` | **`locally-attributed`** — see below | `locally-attributed` | H-AC-05 | — |
| | `envelope.correlation.requestId` | the approval intent digest `intent.sha256` | request digest | H-AC-11 "request" | per-decision unique, non-identifying |
| | `policyDigest` | `canonicalSha256` of the effective proof-policy inputs that decided the lift was admissible | same for HGO's mode | H-AC-11 "policy digest" | re-derivable locally |

**Why `identityAssurance` is `locally-attributed` even for a cryptographically
verified GMW proof.** The trust anchor against which the signature is verified is
machine-local configuration read at
`guard-maintenance-window.mjs:508-511` (`readCriticalHumanProofPolicy`). The
ledger already states this rule about itself in exactly these terms:
`human-governance-ledger.mjs:117-122` — *"A caller-supplied trust policy is not
proof of that policy's provenance … it never upgrades local attribution to
externally-attested human identity"* — and its result reports
`proofTrustAssurance: "caller-supplied-policy"` (`:131`) rather than an upgraded
class. Claiming `externally-attested` here would be exactly the overclaim H-AC-05
forbids. The signature's real value is unchanged and is recorded elsewhere: the
agent is cryptographically incapable of producing it, and that fact is what
`scope.action` plus `policyDigest` record.

**What a reviewer therefore gets, plainly stated:** *what*, *when* and *why* are
fully answered from the portable record alone. *By whom* is answered **at class
level only** — `product-owner`, `locally-attributed` — and, by the deliberate
design of H-AC-11, the natural person behind it is not recoverable from the
repository, nor joinable to it from the machine-local zone. §5 designs that split
rather than assuming it.

## 5. The privacy split, designed

### 5.1 What is portable

Exactly the fields enumerated in §4: authority class, assurance classes, stable
reason code, scope (repository fingerprint, candidate, package, action,
environment, artifact paths + digests), rule and policy digests, validity bounds,
lifecycle links, and the per-decision request digest. Nothing else. The closed
payload shape (§3.1) makes this structurally enforceable rather than a convention:
an extra key fails `HGL-SHAPE`, and free text fails the `reasonCode` pattern.

Four values that exist in the producers and are **explicitly excluded** from the
portable record:

1. `record.root` — an absolute filesystem path (`guard-maintenance-window.mjs:459`).
   H-AC-13 rejects private paths outright.
2. `record.proof` and the trust anchor's `keyReference`/`publicKeySha256`. A
   public-key digest is a **stable pseudonym** for one natural person across every
   record it appears in; H-AC-05 permits only the non-identifying class, and
   H-AC-13 names joinable pseudonyms. The proof stays in the machine-local window
   record, which already holds it.
3. `subject.reason` — free-form rationale, named by H-AC-13.
4. `subject.nonce` and GMW's `repoFingerprintSha256` — machine-local correlators
   with no reviewer value; the ledger has its own fingerprint (§3.1, A-6).

Note `proofSha256` is deliberately **not** persisted portably either: a reviewer
cannot verify a signature digest without the key, and per-decision uniqueness is
already carried by `correlation.requestId = intent.sha256`.

### 5.2 What stays restricted, and how the two records relate

They relate **only by construction, never by a handle.** H-AC-11 requires that the
restricted record "SHALL have no portable counterpart or join handle and SHALL NOT
be persisted in, bundled from, or inferred by a repository record". This design
therefore forbids, as a testable rule:

- no `decisionId`, `eventId`, `idempotencyKey`, intent digest, subject digest,
  nonce, candidate commit/tree, artifact digest or exact timestamp from a portable
  record may appear in a restricted record, and vice versa;
- a restricted envelope sets `candidate`, `artifacts` and every `correlation` key
  to the typed state `{state:"omitted-by-policy"}` (permitted by
  `governance-event.mjs:118-128,130-149`), leaving only the repository
  fingerprint, which is zone-scoped and identical for every record in the
  repository and therefore not a record-level join handle;
- the erasure test in §12 asserts that erasing the restricted record leaves no
  dangling reference anywhere in the portable stream.

**The honest consequence, stated plainly:** after erasure — or even before it — no
mechanical join can attribute a specific lift to a specific person. That is not a
gap in this design; it is what the bound criteria decided, and it is what makes
the machine-local record genuinely erasable while the portable record is
append-only forever (H-AC-06). It is carried to the PO as open question O-1 (§13)
rather than quietly softened.

### 5.3 What happens to GMW's free-text `subject.reason`

- It **stays exactly where it is**: inside the signed subject, in the machine-local
  window and request files, readable through `currentGuardMaintenanceWindow`,
  which already returns it (`:549`). Nothing about GMW's own storage of it changes.
- It is **never copied portably**, and — importantly — **no digest of it is
  copied portably either**. A digest of a short, low-entropy operator sentence is
  both dictionary-attackable and a perfect join handle to the machine-local
  record; it would defeat §5.2 while looking prudent. (HGO's `reasonSha256` is
  fine precisely because it never leaves the machine-local zone.)
- The portable `reasonCode` is a **separate, stable code**, not a transformation
  of the free text. Preferred source: a new `reasonCode` field inside GMW's signed
  subject, so the code is covered by the *existing* signature — one more field in
  a payload the PO already signs, i.e. **no new ceremony** (§1). Fallback when the
  final GMW's subject carries no such field: the intake records
  `GUARD.MAINTENANCE.WINDOW_UNATTESTED` and never derives a code from the free
  text or from an agent-supplied flag pretending to be signed. The code itself
  therefore states its own provenance, which is the honest handling under the
  agent-adversary model.

### 5.4 Increment 1 vs increment 2 for the restricted record

- **Increment 1 (this design, no kernel change).** Portable events only.
  Attribution and rationale stay in the producers' existing machine-local, owner-
  private stores — HGO's MAC-chained `audit.jsonl` (§3.3) and GMW's window/request
  files (§3.2). Both are outside the worktree, `0600`, and already satisfy
  "separately protected machine-local record readable by an authorized local
  query" for H-AC-11 purposes.
- **Increment 2 (D-1, bundled with the rebind of §9).** Move attribution into the
  restricted governance store (§3.4) to gain encryption at rest, expiry, erase
  receipts and key destruction — i.e. the machinery H-AC-06's restricted branch
  actually names. This requires (a) a new payload schema, e.g.
  `pipeline.human-decision-attribution.v1`, admitted for `origin: "human"` **only**
  when `storageProfile === "restricted-machine-local"`, a ~2-line addition to
  `governance-event.mjs:169-174` plus a closed-shape validator module, and (b) a
  spec §6.1 amendment, since that list is declared closed
  (`specs/sprint-phoenix-epic/spec.md:278-301`). Precedent exists:
  `pipeline.human-role-exception-decision.v1` is already implemented and already
  absent from that list, so the family has been extended once before — which is an
  argument for doing it through the rebind, not around it.

## 6. GMW retention: chosen approach and the rejected one

**Chosen — Option A: emit portable ledger events at install and at close; GMW's
own storage contract is unchanged.**

Reasons, in order of weight under §1's threat model:

1. **Option B would put private data in the repository.** The window record
   contains `root`, an absolute filesystem path, and `proof`, signature material
   (`:457-465`). H-AC-13 rejects portable persistence of private paths *before any
   temporary or final file exists*. Making that record the portable artifact is not
   a tradeoff, it is a violation.
2. **Option B moves a capability-bearing record into the agent's write surface.**
   Today the window lives in the Git common directory, outside the worktree. A
   tracked, append-only window artifact would sit in the tree the agent edits, and
   the guards that protect it would have to protect the very record that lifts
   them — the recursive hole the never-liftable kernel list (`:120-128`) exists to
   close. Under an agent adversary this is the decisive argument.
3. **Append-only and revocation-by-deletion are incompatible.** H-AC-06's
   append-only rule applies to portable records. But GMW's close is deliberately
   agent-safe and unauthenticated *because deleting the record only narrows
   capability* (`:568-575`). An append-only portable window could not be closed by
   deletion at all; close would need a new authenticated disposition — i.e. new
   ceremony, forbidden by §1.
4. **The kernel already provides append-only, hash-chained, verifiable retention.**
   Building a second one inside GMW is the parallel mechanism this design is
   explicitly not allowed to invent.

**Rejected — Option B: make the window record itself an append-only portable
artifact.** Its genuine advantages, recorded honestly: a single source of truth
with no dual-write failure mode; no possibility of ledger/window divergence (§8.5
exists only because Option A was chosen); and evidence that survives even if the
ledger writer is unavailable. These were outweighed by 1-3 above. If the PO ever
reverses this, the reversal must also solve the private-path problem (a redacted
projection of the record) and replace deletion-based close with an authenticated
disposition — which reopens the ceremony question.

**Consequences for the three lifecycle ends of a window:**

| Situation | Portable evidence |
| --- | --- |
| Window installed, later **closed** | `requested` + `granted` at install; `revoked` (`GUARD.MAINTENANCE.CLOSED`) at close. Full history survives the deletion of `window.json`. |
| Window installed, **expires unused** | `requested` + `granted`. Expiry is already implied by `validity.expiresAtEpochMs`, and `resolveHumanGovernanceAuthority` denies with `expired` (`human-governance-ledger.mjs:56`). An explicit `expired` disposition is appended lazily by reconcile (§7.5) so H-AC-03's distinct event type exists in the record. |
| Window installed and **never closed**, still valid | `requested` + `granted`, no disposition. This is a live grant and the ledger says so truthfully. |
| Window **prepared but never signed/installed** | **Nothing portable.** Correct: `prepare` grants no authority, and writing repository state from an agent-safe step that anyone can call in a loop would be both noise and a write amplifier. |
| Same signed request **re-installed** while a grant is live | Nothing new; the intake skips the append (§7.3). |
| Same signed request re-installed **after** a close or expiry | A **new** `granted` record with a new `decisionId`, linked to the same `requested`. The ledger then honestly reads granted → revoked → granted. |

## 7. The receiving contract

### 7.1 Where the intake sits (and why not inside the libraries)

`appendPortableGovernanceEvent` is `async`; `installGuardMaintenanceWindow`,
`closeGuardMaintenanceWindow` and `consumeHumanGuardOverride` are all synchronous.
Rather than changing those signatures — the single riskiest thing to do to a
module another session is finalizing — **the intake lives in a new pure builder
module plus the two existing CLI wrappers**:

- pure builders in `plugins/pipeline-core/lib/guard-authority-ledger-intake.mjs`
  turn producer facts into validated append *intents*. No I/O, no clock, no
  randomness: fully unit-testable.
- `plugins/pipeline-core/scripts/guard-maintenance-window.mjs` and
  `plugins/pipeline-core/scripts/guard-human-override.mjs` do the awaiting and
  the ordering.

This gives the robustness property the briefing asked for: **the contract depends
on GMW's data, not on GMW's function signatures.** If the finalized GMW changes
its internals, only the field-extraction adapter moves (see §10).

### 7.2 The append intent

Exactly the 24 keys the store expects (`governance-event-store.mjs:36`, template
at `human-governance-ledger.mjs:179-204`):

```text
schema                 "pipeline.governance-event-envelope.v1"
payloadSchema          "pipeline.human-governance-decision.v1"
canonicalization       "RFC8785"
digestAlgorithm        "sha-256"
eventId                "evt-<decisionId>"
idempotencyKey         "<decisionId>"
origin                 "human"
authorityClass         "human-authority"
eventType              "human.requested" | "human.granted" | "human.revoked"
                       | "human.expired" | "human.denied" | "human.consumed"
occurredAtEpochMs      local clock at the transition
observedAtEpochMs      same
timeAssurance          "locally-observed"
repositoryFingerprint  derivePoGateRepositoryFingerprint(...)   <- NOT GMW's own
sourceUri              "urn:pipeline:repository:<fingerprint>"
streamId               "human"
correlation            { featureId: <intent featureId>, packageId: <scope.packageId>,
                         requestId: <intent.sha256>,
                         sessionId: {state:"omitted-by-policy"},
                         dispatchId: {state:"omitted-by-policy"},
                         traceId:  {state:"omitted-by-policy"} }
candidate              scope.candidate
artifacts              scope.artifacts
policy                 { policyDigest, configurationDigest: <openingTreeSha256>,
                         capturePolicyDigest, redactionPolicyDigest }
classification         "repository-public-safe"
storageProfile         "repository-public-safe"
retentionCompatibility "repository-retained"
disclosureClass        "repository-visible"
payload                the validated decision of §3.1
```

`sessionId`/`dispatchId`/`traceId` are always omitted by policy: they are
machine-local correlators, i.e. private coordinates under H-AC-13. Any policy
digest the environment genuinely cannot supply is recorded as
`{state:"unavailable"}` — a typed state the kernel accepts (`:126-128`) — never
as a fabricated hash.

### 7.3 Deterministic identifiers (idempotency without a registry)

Let `i32` be the first 32 hex characters of `intent.sha256`.

```text
requestDecisionId = "gmw-request-<i32>"
grantDecisionId   = "gmw-grant-<i32>-<installedAtMs>"
revokeDecisionId  = "gmw-revoke-<i32>-<installedAtMs>"
expireDecisionId  = "gmw-expired-<i32>-<installedAtMs>"
```

All match the `ID` pattern (`human-governance-decision.mjs:4`) and stay under 128
characters. Consequences that were designed for, not stumbled into:

- Re-running `install` with the identical signed request (explicitly supported by
  GMW, `:451-455`) must not conflict: **before appending, the intake resolves the
  stream; if a live, non-disposed grant for `requestDecisionId` already exists, it
  appends nothing.** Without this the second install would produce the same
  `idempotencyKey` with a different `occurredAtEpochMs`, and the store would fail
  it as `GES-IDEMPOTENCY-CONFLICT` — turning a supported operation into a hard
  error.
- `requested` is appended once and skipped on every later install of the same
  request. It is required, not optional: a `granted` decision without a non-null
  `links.requestDecisionId` fails `HGL-LIFECYCLE`
  (`human-governance-decision.mjs:37-39`).

### 7.4 GMW event sequence

1. **`install`, before arming.**
   a. Resolve the ledger. If a live grant exists → skip to (d).
   b. Append `requested` (`outcome: "pending"`, all links null) unless present.
   c. Append `granted` with `links.requestDecisionId = requestDecisionId`.
   d. Read back (the store's own readback is authoritative), then call
      `installGuardMaintenanceWindow(...)`.
   e. If (d)'s install throws, append `revoked` with reason code
      `GUARD.MAINTENANCE.NOT_ARMED`.
2. **`close`.** Call `closeGuardMaintenanceWindow(...)` first — narrowing always
   wins (§8.2) — then append `revoked` with `GUARD.MAINTENANCE.CLOSED` and
   `links.revokesDecisionId = grantDecisionId`.
3. **`status`.** Read-only. Never appends. It may *report* a
   ledger-vs-window disagreement, which is how a lost close-time append becomes
   visible (§8.5).

`scope.artifacts` requires at least one entry
(`human-governance-decision.mjs:30`). The intake takes the plan/spec **paths**
and verifies `sha256(file) === intent.value.planSha256 / specSha256` before use;
paths are unsigned and therefore agent-supplied, but a digest match proves the
bytes are the ones the PO signed over, so no trust is placed in the path itself.
If the paths are absent or the digests disagree, the intake **fails closed and the
window does not arm** — the operator re-runs `install` with the correct paths
using the same signature (§8.1). This requires `install` to accept `--plan`/`--spec`,
which `prepare` already does (`scripts/guard-maintenance-window.mjs:54`).

### 7.5 HGO event sequence

| HGO transition | Portable event | Reason code | Link |
| --- | --- | --- | --- |
| `recordHumanGuardDenial` (`:1146`, audit `denied` at `:1226`) | `requested` then `denied` | `GUARD.OVERRIDE.DENIED` | `requestDecisionId` |
| `authorizeHumanGuardOverride` (`:1414`, audit `authorized` at `:1511`) | `granted` (`singleUse: true`) | `GUARD.OVERRIDE.AUTHORIZED` | `requestDecisionId` |
| `consumeHumanGuardOverride` (`:1531`, audit `consumed` at `:1623`) | `consumed` | `AUTHORITY.CONSUMED` (the value `createConsumedHumanGovernanceDecision` already sets, `human-governance-decision.mjs:61`) | `consumesDecisionId` |
| capability expired (`:1598`, `HGO-EXPIRED`) | `expired` | `GUARD.OVERRIDE.EXPIRED` | `expiresDecisionId` |
| capability drift-rejected (`:1598`, `HGO-DRIFT`) | `revoked` | `GUARD.OVERRIDE.DRIFT` | `revokesDecisionId` |

Consumption uses the ledger's own helper
(`appendConsumedHumanGovernanceDecision`, `human-governance-ledger.mjs:166`),
which re-reads the grant **under the human-stream append lock** and refuses a
second consumption (`HGL-CONSUME-NOT-LIVE`, `:222`). That is the strongest
anti-replay primitive available and is reused rather than re-implemented.

Reconciliation (`expired` dispositions for GMW and HGO alike) is appended by an
explicit reconcile command in
`plugins/pipeline-core/scripts/governance-authority.mjs` — never by a timer and
never by a guard read path. Reconcile is idempotent by `expireDecisionId`.

## 8. Failure modes, and the fail-open/fail-closed decision

### 8.1 The decision: fail closed at arming, fail open at narrowing

**A lift SHALL fail closed when its evidence cannot be recorded.** If the
`requested`/`granted` append or its readback fails for any reason, the window is
not armed and the override is not consumed.

Grounds:

- H-AC-01 (`acceptance.md:140-142`) already requires the system to "durably append
  and read back one exact repository/scope-bound decision **before** making the
  transition effective". Given the ledger exists, this is less a free choice than
  a criterion already taken.
- Under §1's threat model this is the only safe direction: an agent that can
  suppress a ledger write must not thereby obtain an **unrecorded** lift. Failing
  open here would make "break the ledger" the cheapest way to get an invisible
  guard lift — and invisibility is exactly the property the agent adversary wants.
- **It costs the human nothing.** Re-installing the identical `{request, proof}`
  is explicitly supported by GMW (`:451-455`); the operator retries the same
  command with the same signature. No re-signing, no new ceremony (§1).

**Narrowing SHALL fail open.** `close` deletes the window record first and appends
`revoked` afterwards; if the append fails, the window is still gone. Refusing to
close because bookkeeping failed would leave a *live guard lift* standing for the
sake of a record — the strictly worse outcome under the same threat model. The
resulting inconsistency is detectable and repairable (§8.5).

Stated as one rule: **the direction that reduces agent capability always wins.**

### 8.2 Crash-state matrix

| # | Crash point | Portable state | Machine-local state | Effective capability | Repair |
| --- | --- | --- | --- | --- | --- |
| 1 | before any append | none | none | none | none needed |
| 2 | after `requested`, before `granted` | dangling `requested` (`pending`) | none | none | next install appends `granted`; or reconcile appends `cancelled` |
| 3 | after `granted`, before `window.json` write | grant recorded | no window | **none** (intersection, §8.5) | reconcile appends `revoked` / `GUARD.MAINTENANCE.NOT_ARMED` |
| 4 | after `window.json` write, before returning | grant recorded | window present | lift active, fully recorded | none needed |
| 5 | `close`: after unlink, before `revoked` | grant still live | no window | **none** (intersection) | reconcile appends `revoked`; `status` reports the disagreement |
| 6 | ledger stream unverifiable/corrupted | verify fails | unchanged | install fails closed; guards keep denying by default | store recovery (`recoverPortableGovernanceProjection`, `governance-event-store.mjs:689`) |
| 7 | HGO: `consumed` appended, capability file not yet marked | consumption recorded | capability still armed | **none** — a ledger-consumed capability is dead | HGO consume path re-checks the ledger first |
| 8 | window expires, nobody runs anything | grant with elapsed validity | window read returns `expired` (`:552-553`) | none | reconcile appends `expired` lazily |

Note that rows 3, 5, 7 all resolve to *less* capability than either record alone
suggests. That is a property of §8.5, not a coincidence.

### 8.3 Authority issuer and replay rule

The issuer of GMW authority remains the PO's detached Ed25519 signature over the
intent digest, verified against the machine-local trust anchor — unchanged. The
ledger issues nothing; it records and cross-checks. Replay is bounded three ways
that already exist: the signed absolute `expiresAtMs` plus the narrowing
`installedAtMs + MAX_WINDOW_TTL_MS` ceiling (`:542-545`), the
`GMW-EXPIRY-TOO-FAR` check at install (`:443-445`), and the store's own
idempotency plus the live-grant skip of §7.3.

### 8.4 Durable storage and atomicity boundary

Two separate stores with separate atomicity guarantees: the kernel's
same-directory temporary write plus atomic publish plus exact readback under a
stream lock (portable), and GMW's `writeAtomic` rename (machine-local). There is
**no cross-store transaction and this design does not pretend otherwise** — §8.2
enumerates every interleaving instead, and §8.5 makes every one of them safe.

### 8.5 Intersection semantics — the rule that makes dual-write safe

> **The effective capability is the intersection.** A guard rule is lifted only if
> the machine-local window record says so **and** the ledger holds a live,
> non-disposed grant for it. Disagreement never grants; disagreement always
> denies, and is reported.

This is what makes the fail-open close (§8.1) safe, and it is also the honest
reading of H-AC-12's dual-evaluation requirement
(`acceptance.md:190-193`: "Every direct reader SHALL dual-evaluate during
migration, fail on disagreement, and carry the shared compatibility owner and
expiry").

**Where the dual evaluation runs (D-2).** At the arming boundary (`install`), at
the consumption boundary (HGO `consume`), in `status`, and in reconcile — **not**
inside the synchronous guard hook read path. The hook path (`windowCoversRule`,
`:559-566`) is synchronous and must not take the ledger's stream lock or perform
async repository I/O on every tool call; doing so would make guard evaluation
depend on a lockable resource, which is a denial-of-enforcement risk far worse
than the residual it closes. The residual: between two arming boundaries, the hook
trusts the machine-local record alone — which is the pre-existing behaviour, so
nothing regresses. This interpretation is carried to the rebind review as open
question O-2 (§13) rather than being settled here.

The migration compatibility owner and expiry required by the same sentence are
recorded in the amendment of §9.

### 8.6 Self-reference audit

Mutable material that cannot authenticate itself, and what covers it: the window
record (covered by the re-verified proof on every read, `:513-530`); the portable
stream (covered by its hash chain and readback verification); the plan/spec paths
at intake (covered by digest comparison against the signed intent, §7.4); the
reason code when unsigned (covered by *labelling itself* unattested, §5.3). The
trust anchor and the guard kernel are outside this design's reach and are already
on the never-liftable list (`:120-128`).

## 9. The H-AC-12 amendment

H-AC-12 (`acceptance.md:187-193`) enumerates `guard-devplan`, `guard-push`,
`pipeline-state`, release planning, deploy approval/consumption, and Git-guard
override consumption. **GMW is absent**, verified by reading the criterion; and a
repository-wide search of `specs/sprint-phoenix-epic/` finds no mention of the
Guard Maintenance Window anywhere in `spec.md` or `acceptance.md`. A conformance
run against H-AC-12 as written therefore passes while GMW sits entirely outside
the ledger.

**Exact amendment.** In H-AC-12's enumeration, after "and Git-guard override
consumption", insert: `, guard-maintenance-window installation and closure`. The
sentence then reads "… deploy approval/consumption, Git-guard override
consumption, and guard-maintenance-window installation and closure, THE SYSTEM
SHALL reference and validate the canonical decision ID before the transition
becomes effective."

**Process.** `acceptance.md` is a bound authority artifact. This amendment follows
the ordinary reviewed rebind path — proposed here, reviewed, then applied by the
rebind, **not** edited in-session. This document does not touch the file.

Two further amendments belong in the same rebind so the artifacts stay consistent
(bundling them avoids two rebinds):

- `spec.md` §7.4 (`:405-428`) gains inventory rows for the new intake module, its
  test, and the two CLI wrappers (§11).
- The migration compatibility owner and expiry H-AC-12 requires: owner
  `pipeline` (PHX-2 package), expiry at the end of the Phoenix epic, after which
  the intersection check becomes unconditional rather than migration-scoped.
- Only if increment 2 (D-1) is accepted: `spec.md` §6.1's closed schema family
  gains the restricted attribution schema.

## 10. Unverified assumptions about the finalized GMW

The finalized GMW is being produced elsewhere and was **not** available. Each
assumption below is about its final shape; each names what breaks if it is false,
and how the breakage is detected rather than silently absorbed.

| # | Assumption (**unverified**) | If false | Detection |
| --- | --- | --- | --- |
| A-1 | The signed subject still carries `scopeRuleIds`, an absolute `expiresAtMs`, and `openingTreeSha256` | `ruleDigest` and `validity` cannot be derived; intake fails closed, no window arms | intake's shape check at install; unit tests pin the field set |
| A-2 | The approval intent still carries `featureId`, `planSha256`, `specSha256`, `candidate{commit,tree}`, `policyRevision`, `subjectSha256` | `scope.candidate`, `correlation.requestId` and artifact verification lose their source; fail closed | same |
| A-3 | `installGuardMaintenanceWindow` stays synchronous, verify-and-place, and throws on refusal | the CLI-level ordering of §7.4 breaks (an async install would need `await`) | compile/test failure at the CLI; the builder module is unaffected |
| A-4 | `closeGuardMaintenanceWindow` stays unauthenticated and narrowing-only | §8.1's fail-open close would need revisiting; a close that can *grant* anything invalidates the asymmetry | design review of the final module before wiring |
| A-5 | The effective expiry formula stays `min(signed, installedAtMs + MAX_WINDOW_TTL_MS)` | ledger `validity` and enforcement disagree; windows appear live in one and dead in the other | intersection check (§8.5) reports the disagreement; a conformance test pins both to one helper |
| A-6 | GMW keeps its own repository fingerprint preimage (`sha({physicalRoot, physicalCommon})`), distinct from the ledger's `pipeline.po-gate.repository.v1\0…` | if someone "unifies" them, cross-repository checks may pass on the wrong preimage | a test asserts the two values are computed independently and that the ledger's own is used in `scope.repositoryFingerprint` |
| A-7 | The final GMW adds a signed `subject.reasonCode` | the portable reason code degrades to `GUARD.MAINTENANCE.WINDOW_UNATTESTED` (§5.3) — designed for, not fatal | the code value itself makes the degradation visible in the ledger |
| A-8 | `LIFTABLE_RULE_IDS` + `TP-` prefix remains the closed liftable set | `ruleDigest` stops being resolvable against a published catalogue | catalogue-pinning test in the conformance suite |
| A-9 | The CLI keeps the `prepare/install/status/close` command surface | §7.1's placement of the intake moves | CLI test failure |
| A-10 | ADR-0058 and the GMW threat model/design documents land with the finalized module | this design cites no line from them (they are **absent from this checkout**, §14) and does not depend on them | §14 |

## 11. Implementation inventory (file level)

| File | Change | Rationale |
| --- | --- | --- |
| `plugins/pipeline-core/lib/guard-authority-ledger-intake.mjs` | **create** — pure builders: `buildWindowRequestDecision`, `buildWindowGrantDecision`, `buildWindowRevocationDecision`, `buildWindowExpiryDecision`, `buildOverrideDecisions`, plus `buildAppendIntent` (§7.2) and the deterministic id helpers (§7.3). No I/O, no clock, no randomness — every time value is a parameter | keeps the whole contract unit-testable and independent of the unfinished GMW's function signatures (§7.1) |
| `plugins/pipeline-core/lib/guard-authority-ledger-intake.test.mjs` | **create** — §12 | H-AC-15 dimensions for this path |
| `plugins/pipeline-core/scripts/guard-maintenance-window.mjs` | modify `install` (append-then-arm, fail closed; accept `--plan`/`--spec`, digest-verified), `close` (unlink-then-append, fail open), `status` (report ledger/window disagreement) | the only place that can `await` without changing library signatures |
| `plugins/pipeline-core/scripts/guard-human-override.mjs` | modify the authorize/consume/deny paths to append the events of §7.5, consumption fail-closed via `appendConsumedHumanGovernanceDecision` | H-AC-12 already names Git-guard override consumption |
| `plugins/pipeline-core/scripts/governance-authority.mjs` | add a `reconcile` path that appends lazy `expired` and repair `revoked` dispositions (§7.5, §8.2) | the criteria require distinct disposition events; nothing else runs at expiry |
| `plugins/pipeline-core/lib/guard-maintenance-window.mjs` | **no change** | deliberate: another session owns this file (§7.1, A-3) |
| `plugins/pipeline-core/lib/human-guard-override.mjs` | **no change** | its audit chain stays as the machine-local record (§5.4) |
| `plugins/pipeline-core/lib/human-governance-ledger.mjs`, `human-governance-decision.mjs`, `governance-event*.mjs` | **no change in increment 1** | design to what exists; increment 2's kernel change is D-1 |
| `docs/human-governance-ledger.md` | add the two producers to the operator/taxonomy guide (reason codes, what is portable, what is not) | H-AC-14 |
| `specs/sprint-phoenix-epic/acceptance.md`, `spec.md` | **amendments specified in §9, applied by the rebind, not here** | bound artifacts |

## 12. Verification approach

Unit (pure builders; no repository, no clock):

1. Every builder output passes `validateHumanGovernanceDecision` — and a mutated
   copy with one extra key fails `HGL-SHAPE`.
2. `granted` without `links.requestDecisionId` fails `HGL-LIFECYCLE`; each
   disposition requires exactly its own link.
3. `reasonCode` values are pinned; a free-text reason injected anywhere in the
   input never appears in, and is not hashed into, any output field.
4. Identifier determinism: identical input → identical ids; a changed
   `installedAtMs` changes only the grant/disposition ids, never `requestDecisionId`.
5. `identityAssurance` is `locally-attributed` and `timeAssurance` is
   `locally-observed` for **every** builder, including the proof-verified GMW path.
6. `validity` matches `min(signed, installedAtMs + MAX_WINDOW_TTL_MS)` exactly.

Integration (temporary repository, real store):

7. install → `requested` + `granted` present and readable back; window armed.
8. Re-install of the identical request appends nothing and does not error.
9. install with a failing store append → **no window record exists** (fail closed).
10. close → window gone and `revoked` appended; close with a failing append →
    **window still gone** (fail open), and `status` reports the disagreement.
11. Reinstall after close → new grant id, same `requestDecisionId`, ledger reads
    granted → revoked → granted.
12. Artifact digest mismatch or missing `--plan`/`--spec` → fail closed.
13. Cross-repository: a decision from another repository is rejected
    (`HGL-CROSS-REPOSITORY`).
14. HGO double consumption → second attempt fails (`HGL-CONSUME-NOT-LIVE`).
15. Tamper: mutate one event file → stream verification fails and install refuses.
16. Privacy: property test over generated inputs asserting that no output contains
    an absolute path, the `reason` text, its digest, the nonce, the proof, or the
    trust anchor's key digest.
17. Increment 2 only: erasing the restricted record leaves no dangling reference,
    and no portable field appears in the restricted record.

Gate: `node harness/scripts/check-doc-contracts.mjs` for this document;
`node --test` over the new and touched test files for the implementation.

## 13. Acceptance criteria for this design's implementation (checkable)

- **AC-1** Installing a window appends exactly one `requested` (first time) and
  one `granted` before the window record exists; verified by asserting the ledger
  contents *and* the absence of `window.json` when the append fails.
- **AC-2** No portable record produced by this path contains an absolute path,
  free-form text, a digest of free-form text, the nonce, the proof, or a
  key digest (test 16).
- **AC-3** Every portable record produced by this path validates as
  `pipeline.human-governance-decision.v1` and is accepted by
  `appendHumanGovernanceDecision`.
- **AC-4** `identityAssurance === "locally-attributed"` and
  `timeAssurance === "locally-observed"` in every record, without exception.
- **AC-5** Closing always removes the window record, whether or not the ledger
  append succeeds; and a ledger-vs-window disagreement never yields `covered:
  true` at an arming or consumption boundary.
- **AC-6** Re-installing an identical signed request neither errors nor appends.
- **AC-7** HGO consumption fails closed when the `consumed` event cannot be
  appended.
- **AC-8** A reviewer can answer *what/when/why* and *by-whom-as-class* for any
  lift from the portable stream alone, demonstrated by a fixture-based
  reconstruction test that renders one window's full history.
- **AC-9** The amendment of §9 is present in the rebound `acceptance.md` before
  this path is declared complete.

## 14. Open items and findings for the PO

- **O-1 (decision to confirm).** The privacy split means natural-person
  attribution is, by construction, **not joinable** to any specific lift (§5.2).
  A reviewer gets `product-owner / locally-attributed` and nothing more. This
  follows from H-AC-11 as written; confirm that this accountability ceiling is
  intended before implementation, because it cannot be softened later without
  reopening H-AC-11.
- **O-2 (interpretation to ratify).** H-AC-12's "every direct reader SHALL
  dual-evaluate" is implemented at the arming/consumption boundaries and in
  reconcile, not inside the synchronous guard hook (§8.5, D-2). Ratify or
  redirect.
- **O-3 (no ceremony added).** Nothing here adds a human step. The one producer-
  side ask is a `reasonCode` field inside GMW's *existing* signed subject
  (§5.3) — same signature, one more field. If that is not wanted, the fallback is
  already designed and the record labels itself unattested.
- **Finding F-1 (documentation, verified).** The GMW module header cites
  `docs/adr/0058-guard-maintenance-window.md`,
  `docs/guard-maintenance-window-threat-model.md` and a Nova design document
  (`guard-maintenance-window.mjs:10-13`). **None of the three exist in this
  checkout** (`docs/adr/` ends at 0057; `git ls-files` finds neither of the other
  two). GMW arrived via the marketplace snapshot merge without its decision
  record. This design therefore cites no line from them; the ADR should land with
  the finalized module (A-10).
- **Finding F-2 (spec drift, verified).** `pipeline.human-role-exception-decision.v1`
  is implemented and admitted by the kernel (`governance-event.mjs:170`) but is
  absent from `spec.md` §6.1's "closed" v1 schema family (`:278-301`). Not caused
  by this work; relevant because increment 2 would touch the same list, and the
  rebind is the moment to reconcile it.
- **Backlog claims:** all six checked claims survived verification (§3.2 table);
  none had to be designed around.
