# GMW/HGO evidence intake into the Human Governance Decision Ledger

> Design only. Nothing in this document has been implemented. It specifies a
> **receiving contract**: what the PHX-2 Human Governance Decision Ledger requires
> from the two human-authority mechanisms in this plugin (GMW, HGO) so that a
> reviewer can reconstruct *what was approved, when, why, and by whom* under the
> privacy split the bound acceptance criteria mandate — including the one clause of
> that split this design cannot satisfy and therefore discloses (§5.2 R-3, O-4).
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
   (see §14, open question O-3).
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
- **D-2 — synchronous dual-evaluation inside the guard hot path.** §8.5.2 explains
  why the intersection check is placed at the arming/consumption boundary and in
  reconcile, not on every hook read, what that costs, and which criterion the
  remaining residual does **not** satisfy.
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
  exposes `prepare | install | status | close`. `parseArgs` (`:56-73`) shares one
  option set across all four commands, so `--plan`/`--spec` already *parse* on
  `install`; the install branch simply never reads them and requires only
  `--request` and `--proof`, with `--authority` optional (`:115-130`). Only
  `prepare` consumes them today, digesting them through `readPublicRepositoryFile`
  (`:107-108`). §7.4 therefore needs no new option — only a consumer for two
  options that already parse.
- The same CLI pins `GMW_POLICY_REVISION = "guard-maintenance-window-v1"`
  (`scripts/guard-maintenance-window.mjs:49`) and passes it into the signed intent
  as `policyRevision` (`scripts/guard-maintenance-window.mjs:109`,
  `po-approval-proof.mjs:22-25`). It is a public constant, covered by the PO's
  signature, and carries no key material — §5.5 makes it the only signed input of
  `policyDigest`.

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

**HGO's capability field inventory, read from source.** The first version of this
document asserted an HGO field set instead of verifying it, and named a
`plan + spec` artifact source that HGO does not have. The verified inventory:

- `CAPABILITY_KEYS` (`human-guard-override.mjs:1066-1089`) is exactly `schema,
  status, root, requestSha256, planSha256, selectionSha256, reasonSha256, plugin,
  repository, toolName, toolInputSha256, commandClass, denials, policy, preview,
  eligiblePaths, mode, authorSourceRoot, authorizedAt, expiresAt, consumedAt, mac`.
  **`specSha256` does not occur anywhere in the module**, and `planSha256`
  (`:1295-1313`) is the digest of an in-memory plan payload object, not of a
  repository file. There is no plan/spec artifact pair to copy.
- The capability carries a candidate **in two of its three modes, not in all
  three.** `repository` is whatever the denial, plan and consume paths observed,
  and each of them branches on the mode. For `standard` and `pipeline-author-repair`
  it is `repositoryObservation` (`:424-434`) =
  `{fingerprintSha256, head, tree, statusSha256, state}`, so
  `scope.candidate = {commit: repository.head, tree: repository.tree}` is derivable
  and exact. For `mode: "global-plugin-install"` all three paths substitute
  `localPluginInstallSourceObservation` (`:1164`, `:1276`, `:1586`), whose `head`
  and `tree` are **`null`** (`:231-232`) — deliberately, because that observation
  attests the plugin *source tree* (`marketplaceSha256`, `manifestSha256`,
  `pluginTreeSha256`, `:233-238`) and never runs `rev-parse` at all. The capability
  copies the observation verbatim (`repository: planned.repository`, `:1470`), and
  `scope.candidate` requires two `OID` values (`human-governance-decision.mjs:29`),
  so that mode has **no candidate source**. §7.5 makes this the first
  representability layer and §8.1 states the consequence. An earlier revision of
  this document asserted the candidate as unconditional and pinned it as verified in
  H-2; that was true of `repositoryObservation` and of two modes, not of the field.
- `eligiblePaths` holds **repo-relative** strings (`safePath` `:436-455`, pushed as
  `path.relative` at `:798`/`:815`/`:851`). It is **empty** for the
  `closed-shell-exact` (`:838-844`) and `global-plugin-install` (`:785-792`)
  classes, and for the dominant `writer-owned-project-policy-emergency` class its
  entries are usually the dot-prefixed protected paths of `protectedPath`
  (`:457-478`). §7.5 and finding F-3 (§14) take the consequences.
- `policy` is `policyIdentity(root, pluginRoot, denials)` (`:369-396`) =
  `{guards:[{guard, implementationSha256}], project:[{path, status, sha256}]}` —
  shipped guard code plus repository-relative policy files with real byte digests,
  and no key material anywhere. §5.5 uses it as HGO's `policyDigest` preimage;
  §7.5 uses its `project` entries as the artifact fallback.
- Consumption re-observes the repository and refuses on any drift of capability,
  plugin identity, policy identity or repository observation (`:1588-1611`,
  `HGO-DRIFT`) — including a changed worktree `statusSha256`. HGO's candidate
  binding is therefore already enforced at consume time, which is what makes the
  HGO half of §8.5.1's candidate rule non-vacuous.
- `recordHumanGuardDenial` rejects an empty denial set (`:1156`), so every HGO
  decision has at least one denying guard identity behind it.

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
| | `scope.candidate` | intent `candidate{commit,tree}` verbatim (`guard-maintenance-window.mjs:364-371`) | `{commit: repository.head, tree: repository.tree}` from the capability's `repositoryObservation` (`human-guard-override.mjs:424-434`) — **except `mode: "global-plugin-install"`, whose observation carries `head: null`/`tree: null` and has no candidate at all** (§3.3, §7.5 layer 0) | H-AC-04 "candidate" | signed for GMW; locally observed for HGO; absent for one HGO mode |
| | `scope.artifacts` | plan + spec `{path, sha256}`, digests re-checked against the signed intent | the layered, source-established set of §7.5 — representable `eligiblePaths`, else the present `policy.project` entries; **never** a plan/spec pair, which HGO does not have | H-AC-04 "artifact" | digest-verified at intake |
| | `scope.environment` | `local-checkout` | `local-checkout` | H-AC-04 "environment" | deterministic |
| | `validity.singleUse` | `false` (a window is time-boxed, not single-use) | `true` | H-AC-04 "single-use" | structural |
| **when** | `validity.notBeforeEpochMs` / `expiresAtEpochMs` | `installedAtMs` / `min(signed expiresAtMs, installedAtMs + MAX_WINDOW_TTL_MS)` — the **same formula** the enforcement path uses (`:542-545`). The two halves have **different provenance**, and §7.3 turns on that: `installedAtMs` is an unsigned per-process clock read (`const installedAtMs = nowMs;`, `:456`, which the module's own comment marks as "NOT part of the signed subject", carrying "no security weight of its own", `:446-447`), while the upper bound is, for a request built by `prepare()`, the **signed** `subject.expiresAtMs` itself: `prepare()` already clamps it to `min(signed, nowMs_prepare + MAX_WINDOW_TTL_MS)` (`:354`), and because install's own clock read can only be at or after that, its `min()` re-selects the same signed term — this is the honest-builder case and the normal one. For a hand-built subject whose signed `expiresAtMs` exceeds install-time `nowMs + MAX_WINDOW_TTL_MS` — the case `GMW-EXPIRY-TOO-FAR` (`:443-445`) exists to block — the value the intake commits at §7.4 step (b)/(c) is instead the **clock** term `installedAtMs + MAX_WINDOW_TTL_MS`, computed by the intake's own `min()` before `installGuardMaintenanceWindow` ever runs; that call then throws at step (d) and step (e) appends `revoked`, so no window arms, but the ledger briefly held a `granted` record whose bound was clock-derived, not signed. The intake takes **one** clock read per install and passes it to both the builder and `installGuardMaintenanceWindow` (`nowMs`, `:383`), so this record's `notBeforeEpochMs` *is* that process's `installedAtMs` rather than an approximation of it | authorization time / capability expiry | H-AC-04 "validity", H-AC-11 "time" | — |
| | `envelope.occurredAtEpochMs`, `envelope.observedAtEpochMs` | local clock at the transition | local clock | H-AC-11 "time and assurance" | — |
| | `timeAssurance` (payload and envelope) | **`locally-observed`, always** | `locally-observed` | H-AC-05 (never claim trusted time) | there is no attested time source anywhere in this path |
| **why** | `reasonCode` | signed `subject.reasonCode` if the final GMW carries one; otherwise `GUARD.MAINTENANCE.WINDOW_UNATTESTED` (§5.3) | stable code per HGO outcome, e.g. `GUARD.OVERRIDE.CONSUMED` | H-AC-11 "stable reason code" | signed → attested by the same proof; unsigned → explicitly marked as unattested by the code itself |
| | *(the operator's free-form reason)* | **not portable, ever** — stays machine-local (§5) | already digest-only (`reasonSha256`) and machine-local | H-AC-13 | — |
| **by whom** | `authorityClass` | `product-owner` | `product-owner` (or the configured reviewer class) | H-AC-11 "actor/authority class" | class only — **no name, no key digest, no pseudonym** (H-AC-05) |
| | `identityAssurance` | **`locally-attributed`** — see below | `locally-attributed` | H-AC-05 | — |
| | `envelope.correlation.requestId` | the approval intent digest `intent.sha256` | request digest | H-AC-11 "request" | per-decision unique; carries no person-identifying value, and is byte-identical to the producers' machine-local request key — see §5.2, R-3 |
| | `policyDigest` | the closed preimage of §5.5 — signed `policyRevision` + `kind`, the public liftable-rule catalogue and TTL ceiling. **The trust anchor is not an input, at any depth** | `canonicalSha256(capability.policy)`, i.e. the guard/policy identity HGO already computes and MACs (`human-governance-decision.mjs` untouched; source `human-guard-override.mjs:369-396`) | H-AC-11 "policy digest" | re-derivable from public inputs alone |

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
design of H-AC-11, the natural person behind it is not recoverable **from the
repository record**. Whether that record is *joinable* to a machine-local one that
does name a person is a second, separate question, and the honest answer is
producer-dependent: no for HGO, yes for GMW while its window/request record still
exists. §5.2 establishes that instead of assuming the split holds.

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
2. `record.proof` and the trust anchor's `keyReference`/`publicKeySha256`
   (`critical-human-proof-policy.mjs:185-194`: the anchor is exactly those two
   keys) — **and every value derived from either of them, at any depth**. A
   public-key digest is a **stable pseudonym** for one natural person across every
   record it appears in, and a digest *of* that digest is the same pseudonym one
   hash deeper: identical in every record forever, and confirmable by anyone
   holding the local policy. H-AC-05 permits only the non-identifying class, and
   H-AC-13 names joinable pseudonyms. The proof stays in the machine-local window
   record, which already holds it. Because portable records are append-only
   (H-AC-06), a derivative admitted here could never be corrected or erased, so
   §5.5 closes the one field whose natural preimage was the anchor, and the
   verification of that field is **constructive** (recompute from the declared
   preimage) rather than a blocklist of forbidden values — a blocklist cannot
   catch a derivative.
3. `subject.reason` — free-form rationale, named by H-AC-13.
4. `subject.nonce` and GMW's `repoFingerprintSha256` — machine-local correlators
   with no reviewer value; the ledger has its own fingerprint (§3.1, A-6).

Note `proofSha256` is deliberately **not** persisted portably either: a reviewer
cannot verify a signature digest without the key, and per-decision uniqueness is
already carried by `correlation.requestId = intent.sha256`.

### 5.2 What stays restricted, and the join that actually exists

H-AC-11's second clause requires that the restricted record "SHALL have no
portable counterpart or join handle and SHALL NOT be persisted in, bundled from,
or inferred by a repository record". An earlier revision of this section asserted,
as a testable rule, that no intent digest, candidate, artifact digest or timestamp
may appear in both zones — while §4 and §7.3 placed exactly those values in the
portable record. **That rule is not implementable together with H-AC-11's first
clause, and this section no longer asserts it.** The reason is structural, and it
has to be stated before the corrected rules, because this is the one place where
two bound criteria pull against each other.

**Why no identifier scheme can satisfy it.** H-AC-11's first clause requires the
portable record to expose "request … exact scope … policy and rule digests,
evidence". Every one of those values is, by construction, a function of the same
producer facts the machine-local record holds:

| Portable value | Machine-local counterpart | Relation |
| --- | --- | --- |
| `envelope.correlation.requestId` | GMW `record.intent.sha256` (`guard-maintenance-window.mjs:462`); HGO `capability.requestSha256`, which is also the **filename** of the machine-local request (`human-guard-override.mjs:1223`) and is carried in every audit entry (`:1226-1235`, `:1511-1520`, `:1623-1631`) | byte-identical |
| `decisionId` = `gmw-request-<i32>` (§7.3) | the same intent digest | 32-hex prefix of it |
| `scope.candidate` | GMW signed `intent.value.candidate` (`:366-375`, stored at `:462`); HGO `capability.repository.head/.tree` | byte-identical |
| `scope.artifacts[].sha256` | GMW signed `planSha256`/`specSha256`; HGO `policyIdentity`'s file digests (`human-guard-override.mjs:380-394`) | byte-identical |
| `validity.expiresAtEpochMs` | GMW signed `subject.expiresAtMs`, narrowed by `installedAtMs` (`:542-545`) | equal by formula |
| `ruleDigest` | recomputable from `subject.scopeRuleIds` + `openingTreeSha256` (`:355-362`) | recomputable |

Renaming or salting the identifiers removes none of this: any deterministic
derivation is recomputable by whoever holds the machine-local record (§5.1 makes
the same argument one hash deeper for key digests), and dropping
`correlation.requestId` altogether would violate H-AC-11's own "expose request"
requirement while leaving `scope.candidate` + `validity` + `ruleDigest` as an
exact per-decision fingerprint. **Stated plainly: no identifier scheme available to
this design satisfies both clauses of H-AC-11 at once.** What follows is therefore
split into what holds and what does not.

**R-1 — the portable-content rule (holds; tested).** No portable record produced by
this path contains a natural-person identifier, a pseudonym, a key digest or any
value derived from the trust anchor at any depth, free-form text, a digest of
free-form text, an absolute path, or the subject nonce. That is §5.1's exclusion
list, enforced constructively for `policyDigest` (§5.5, U-7) and by enumeration
elsewhere (I-10, AC-2).

**R-2 — the zone rule between the portable stream and the restricted governance
store (holds; increment 2).** When the attribution payload of D-1 enters the
restricted store (§3.4), no record-level correlator crosses in either direction:
no `decisionId`, `eventId`, `idempotencyKey`, intent digest, subject digest,
nonce, candidate, artifact digest or exact timestamp. The restricted envelope sets
`candidate`, `artifacts` and every `correlation` key to the typed state
`{state:"omitted-by-policy"}` (permitted by `governance-event.mjs:118-128`,
`:130-149`), leaving only the repository fingerprint — zone-scoped, identical for
every record in the repository, and therefore not a record-level handle. §12's
erasure test asserts exactly this pair of properties and nothing wider.

**R-3 — the disclosure (does not hold; recorded, not softened).** The producers'
**pre-existing** machine-local stores are joinable to the portable record per
decision, by every row of the table above. Increment 1 therefore does **not**
designate them as H-AC-11's restricted record (§5.4 withdraws the earlier claim
that it did) and does not claim H-AC-11's second clause satisfied. The consequence
differs materially per producer:

- **HGO — the join reaches no attribution.** Its machine-local zone holds digests
  only: `reasonSha256` over the operator's text and never the text itself
  (`human-guard-override.mjs:1370`, re-checked at `:1430`; no path writes the
  plaintext to disk), no key material, and no natural-person identifier anywhere in
  `audit.jsonl`, the request files or the capabilities. A join tells its holder
  *which* machine-local request produced a lift, not *who* authorized it. H-AC-11's
  "natural-person attribution or free-form rationale" has no exposure point on the
  HGO side today, so its second clause has no referent there.
- **GMW — the join reaches attribution and rationale, and that is a
  non-conformance.** The window and request records hold `subject.reason` as free
  text (`guard-maintenance-window.mjs:342`, `:358`, `:461`) and `proof`, whose shape
  is `{schema, intentSha256, keyReference, publicKey, signatureBase64}`
  (`po-approval-proof.mjs:34`) — the approver's public key and its reference — and
  `currentGuardMaintenanceWindow` already returns the reason to a local query
  (`:549`). That record *is* an attribution-and-rationale record in H-AC-11's sense,
  and after this design the repository permanently holds a per-decision pointer into
  it. **Increment 1 does not satisfy H-AC-11's no-join-handle clause for the GMW
  half.** Carried as O-4 (§14) with an owner and the two available exits, not as a
  resolved item.

**Two bounds on the GMW residual, so it is neither overstated nor understated.**
The machine-local side is transient by construction: `request.json` is a single
fixed path that the next `prepare` overwrites (`:377-378`, `storagePaths`
`:258-261`) and `window.json` is unlinked at close (`:574`), so the join target for
an earlier decision is normally already gone, while the portable record is
permanent. And whoever holds the machine-local record holds the attribution
already, ledger or no ledger; what the ledger adds is a durable repository-side
pointer to a record that may no longer exist. Neither bound makes the clause
satisfied, and neither is offered as one.

**The honest consequence for a reviewer, unchanged:** no *portable* record
attributes a lift to a person, and once the machine-local record is gone no
mechanical attribution is possible at all. That accountability ceiling is what the
bound criteria decided, and it is carried to the PO as open question O-1 (§14)
rather than quietly softened.

### 5.3 What happens to GMW's free-text `subject.reason`

- It **stays exactly where it is**: inside the signed subject, in the machine-local
  window and request files, readable through `currentGuardMaintenanceWindow`,
  which already returns it (`:549`). Nothing about GMW's own storage of it changes.
- It is **never copied portably**, and — importantly — **no digest of it is
  copied portably either**. A digest of a short, low-entropy operator sentence is
  both dictionary-attackable and — unlike a scope digest — a direct route back to
  the *content* of the operator's sentence; it would breach §5.2's R-1 while
  looking prudent. (HGO's `reasonSha256` is fine precisely because it never leaves
  the machine-local zone.)
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
  files (§3.2). Both are outside the worktree and owner-private. What increment 1
  does **not** do is designate them as the "separately protected machine-local
  decision record" of H-AC-11: they are joinable to the portable record per
  decision, and only the GMW pair exposes attribution or rationale at all (§5.2,
  R-3, and O-4). The record H-AC-11 describes is created by increment 2, in the
  restricted store, under R-2.
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

### 5.5 `policyDigest`: the closed preimage, and why it is not the trust anchor

`policyDigest` was the one digest in this design left as prose ("the effective
proof-policy inputs"). That is not admissible: the only proof policy in the GMW
path is the trust anchor, whose entire content is `{keyReference,
publicKeySha256}` (`critical-human-proof-policy.mjs:185-194`, read at
`guard-maintenance-window.mjs:508-511`), so the field's *natural* preimage is
exactly the stable pseudonym §5.1 excludes.

**Dropping the field is not available.** `policyDigest` is a required key of the
closed payload and must match the `SHA256` pattern
(`human-governance-decision.mjs:23,26`); omitting it fails `HGL-SHAPE`, and
relaxing that validator is a kernel change (increment 2, D-1). A typed state is
not admitted for payload fields either — the typed states of
`governance-event.mjs:24` apply to the envelope, not to this payload. The field
must therefore be given a preimage that is safe, or the whole intake is
unimplementable. It can be given one.

**GMW.**

Line references in the block below are to `lib/guard-maintenance-window.mjs`
except where the CLI is named.

```text
policyDigest = canonicalSha256({
  schema:          "pipeline.guard-authority-intake-policy.v1",
  policyRevision:  intent.value.policyRevision,   // SIGNED; "guard-maintenance-window-v1",
                                                  // scripts/guard-maintenance-window.mjs:49
  approvalKind:    intent.value.kind,             // SIGNED; "guard-lift"
  proofRequirement:"detached-ed25519-over-intent-digest",   // constant of this path
  liftableRuleIds: LIFTABLE_RULE_IDS,             // ["GS-6"], exported at :104
  liftableRulePrefix: "TP-",                      // pinned copy; see below
  maxWindowTtlMs:  MAX_WINDOW_TTL_MS,             // exported at :175
})
```

`LIFTABLE_RULE_IDS` (`:104`) and `MAX_WINDOW_TTL_MS` (`:175`) are exported and are
imported directly. `LIFTABLE_TP_PREFIX` (`:105`) is **module-private**, so the
intake carries its own pinned copy of the literal rather than asking another
session's module to widen its export surface; §12's catalogue-pinning test asserts
the copy still agrees with GMW's behaviour through the exported `isLiftableRuleId`
(`:108-110`), which is the observable form of the same catalogue.

**HGO.** `policyDigest = canonicalSha256(capability.policy)`, i.e. the exact
`policyIdentity` object HGO already computes, MACs into the capability, and
re-checks at consume time (`human-guard-override.mjs:369-396`, `:1593`).

The argument for portability rests on the preimage alone, and is complete without
any reference to what HGO records locally: every input is a digest of *content* —
shipped guard implementation files under the plugin's `hooks/` (`:371-379`) and
repository-relative policy files (`:380-394`) — so the value is reproducible by
anyone holding those same bytes; it contains no key material, no free text and no
path outside the repository; and it is not person-bound, since two different
approvers acting on the same policy state produce the same digest. Those are the
same three properties the GMW preimage is checked against below.

Deliberately **not** part of that argument: the fact that HGO's own denial audit
entry already carries `policySha256` over the same object (`:1233`). Machine-local
recording is not evidence of portable safety — §5.3 rejects precisely that
inference two sections earlier, where `reasonSha256` is acceptable *because* it
never leaves the machine-local zone. A rule that only binds in the direction that
is inconvenient is not a rule, so the local precedent is recorded here as a
non-argument rather than quietly reused.

**Four properties, stated so they can be tested rather than believed:**

1. **Closed.** The preimage is a fixed, enumerated object. Nothing else can enter
   it, so no future input can smuggle the anchor in sideways.
2. **Not a derivative of the trust anchor's key digest — explicitly.** Neither
   `keyReference` nor `publicKeySha256`, nor any value computed from either,
   appears in the preimage at any depth. Stated here because the reviewer must be
   able to check the claim rather than infer it from an absence.
3. **Not person-bound.** Every input is either a signed public constant, a
   published catalogue value, or a digest of repository/plugin code. Two different
   people signing on the same policy revision produce the *same* `policyDigest` —
   which is exactly the property that distinguishes a policy digest from a
   pseudonym.
4. **Constructively verified.** The privacy test (§12, test 16) recomputes
   `policyDigest` from the declared preimage and asserts equality, so any extra or
   substituted input fails the test. AC-2's enumeration of forbidden values stays,
   but it is the weaker of the two checks and is no longer the only one.

The signature's real value is unchanged and is still recorded — as
`scope.action`, as the reason code's provenance (§5.3), and as the machine-local
proof the window record keeps. What is *not* recorded is who holds the key.

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
policy                 { policyDigest: <the closed preimage of §5.5>,
                         configurationDigest: <openingTreeSha256>,
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

Let `i32` be the first 32 hex characters of `intent.sha256`, and let `g` be the
**grant generation**: the number of `granted` decisions already linked to
`requestDecisionId` in the human stream.

```text
requestDecisionId = "gmw-request-<i32>"
grantDecisionId   = "gmw-grant-<i32>-<g>"
revokeDecisionId  = "gmw-revoke-<i32>-<g>"
expireDecisionId  = "gmw-expired-<i32>-<g>"
```

All match the `ID` pattern (`human-governance-decision.mjs:4`) and stay under 128
characters. The generation replaces the earlier `installedAtMs` suffix, which was
wrong under concurrency: two racing installs read different clocks, so they would
have produced two *different* grant ids for one request and left two live grants
that the boundary check of §8.5 could not disambiguate.

**One behaviour for the identical-request race, and where the race is actually
decided.** The store resolves the idempotency key *before* it calls `assertAppend`:
under the stream lock it scans, looks for a committed event with the same
`idempotencyKey`, fails `GES-IDEMPOTENCY-CONFLICT` on a differing intent digest or
returns an `idempotent-replay` receipt on a byte-identical one, and only if no such
event exists does `assertAppend` run at all
(`governance-event-store.mjs:638-651`). Because every identifier above is derived
from the request digest **and from the stream state itself**, an `assertAppend`
precondition cannot fire for this identifier scheme: the intake's `g` is the number
of grants it observed, so any concurrent append that would invalidate the
precondition also increments that number, and the id the intake then computes
collides with the committed one. Two concurrent installs of the same signed request
are the plainest case — both read an empty stream, both compute `g = 0`, both build
the same `decisionId` and the same `idempotencyKey`, and the second one under the
lock is decided by the idempotency branch. An earlier revision specified a
`GAL-GRANT-RACE` precondition on `assertAppend` for exactly this race, with a losing
racer that "fails closed and retryable"; that precondition was unreachable and
§12's I-12 asserted a behaviour the store cannot produce. Both are corrected here.

The single specified behaviour:

1. The intake reads the stream unlocked, computes `g`, and **skips** the append
   entirely if a live, non-disposed grant for `requestDecisionId` already exists —
   the common, supported re-install case (GMW `:451-455`).
2. Otherwise it appends. If the store returns `idempotent-replay` or fails
   `GES-IDEMPOTENCY-CONFLICT`, the intake re-reads the committed event under that
   key and **adopts** it — continuing to §7.4's step (d) — if and only if all of:
   (a) the committed payload validates as the same decision class with the same
   `decisionId`; (b) its `scope`, `ruleDigest`, `policyDigest`,
   `validity.expiresAtEpochMs` and `validity.singleUse` are **byte-identical** to
   what the intake was about to append; (c) its `validity.notBeforeEpochMs`, which
   is deliberately **not** compared for equality, passes both of the two checks
   stated below; and (d) for a `granted` append, that grant resolves as live and
   non-disposed in the same read (a `requested` record has nothing to dispose).
   Adoption is what makes the race benign: both racers end up bound to one and the
   same ledger decision, which is exactly the state a sequential identical
   re-install produces, and the window each of them arms is the same signed window
   with the same signed bound.
3. In every other case — a different decision committed under the intake's key, a
   committed decision that is already revoked or expired, or one whose
   `notBeforeEpochMs` fails either check below — the intake **fails closed with the
   retryable code `GAL-GRANT-RACE` and no window is armed.** The operator re-runs
   the identical `{request, proof}`: no re-signing, no new ceremony (§1). Case 3 is
   not decorative; it is the interleaving in which a racer would otherwise arm a
   window against an already-disposed grant, which §8.5 would then deny anyway —
   arming it would be capability the ledger does not back.

**Which fields are inside the identity check, and why one cannot be.** Every field
in (b) is a pure function of the signed request plus a public catalogue, so two
honest racers derive the same bytes or one of them is not honest: `scope` and
`ruleDigest` come from the signed subject and the signed intent (§4), `policyDigest`
from §5.5's closed preimage of signed and published constants, `singleUse` is the
constant `false`, and `expiresAtEpochMs` is the signed `subject.expiresAtMs` itself
for an honest, `prepare()`-built request — the normal case: `prepare()` already
clamps it to `min(signed, nowMs_prepare + MAX_WINDOW_TTL_MS)` (`:354`), and because
install's own clock read can only be at or after that, `min(signed, installedAtMs +
MAX_WINDOW_TTL_MS)` at commit time (§7.4 step (b)/(c), *before*
`installGuardMaintenanceWindow` runs) re-selects the same signed term. Two honest
racers therefore derive the same bytes there too. A hand-built subject whose signed
`expiresAtMs` exceeds install-time `nowMs + MAX_WINDOW_TTL_MS` is the one case this
does not hold for: the intake's own `min()` there selects the **clock** term, not the
signed value, so the field this section pins to the signature is briefly committed as
a clock-derived value before `GMW-EXPIRY-TOO-FAR`
(`guard-maintenance-window.mjs:443-445`) throws at the later install call (§7.4 step
(d)) and step (e) appends `revoked`. Capability is not widened by this — `min()` can
never exceed the signed bound, so no window ever arms off the clock-derived value —
but in that corner the byte-identity on `expiresAtEpochMs` between two honest racers
is, once again, coincidence-decided rather than signature-decided. For the case this
design is built for — a `prepare()`-built request — the bound that actually bounds
the lift is still compared byte for byte, and it is a signed value.

`validity.notBeforeEpochMs` is not such a field. It is GMW's `installedAtMs`, and
`installedAtMs` is a per-process clock read — `const installedAtMs = nowMs;`
(`:456`), marked by the module's own comment as "NOT part of the signed subject",
carrying "no security weight of its own" (`:446-447`). It is not derived from the
signed request at all, so **two honest racers necessarily disagree on it**, and a
byte-identity test over it would decide the race by clock coincidence: adopt if two
processes happened to read the same millisecond, fail closed otherwise. That is not
a stricter check, it is a nondeterministic one, and in every non-coincidental
interleaving it makes the adoption branch unreachable for the GMW path —
reproducing exactly the defect the previous revision removed when it found that the
`GAL-GRANT-RACE` `assertAppend` precondition could not fire. It also catches nothing
an adversary controls: an agent choosing its own clock cannot alter what another
process already committed, and every field that *is* derived from the signature is
compared above. This design already draws that line for identifiers — the ids above
come from the request digest and the stream state, never from a clock, and §12's U-4
pins that "a changed `installedAtMs` changes **no** id at all". A value excluded
from a decision's identity cannot be reintroduced as the test of that identity.

**What binds `notBeforeEpochMs` instead — H-AC-04's validity dimension is verified,
not dropped.** The check becomes constructive rather than comparative, the same move
§5.5 makes for `policyDigest`: recompute from a declared preimage instead of
comparing against a value someone hands you. Adoption requires **both** of:

- **(i) Formula.** `validity.expiresAtEpochMs === min(signed subject.expiresAtMs,
  validity.notBeforeEpochMs + MAX_WINDOW_TTL_MS)` — the enforcement path's own
  formula (`:542-545`), evaluated on the committed pair. Since (b) has already
  pinned the left side to the signed bound, this says the committed `notBefore` is
  recent enough that the signed expiry is still the binding term, which is exactly
  the condition `install` enforces at `:443-445`. It refuses any committed record
  whose two halves were not produced by this formula — including one whose
  `notBefore` sits far enough in the past that the machine-local window would expire
  before the ledger claims it does.
- **(ii) In force at the adopter's own clock.** `notBeforeEpochMs <= nowMs <=
  expiresAtEpochMs`. This is not a new predicate: `resolveHumanGovernanceAuthority`
  evaluates it on every read and denies with `expired` outside that interval
  (`human-governance-ledger.mjs:56`), so (d)'s liveness resolution performs it. It
  is named here so the bound is verified deliberately rather than inherited by
  accident, and because (d) does not apply to a `requested` record: that record
  grants nothing and carries `outcome: "pending"`, so (i) is the whole of its
  validity check, while the capability-bearing `granted` record is held to (i) and
  (ii) together. The kernel applies the same interval to its own one-shot
  consumption helper (`human-governance-decision.mjs:51-52`).

**What adoption asserts, precisely.** The adopter does not claim that it computed
the committed record. It binds to a grant another process committed for the same
signed request, and `notBeforeEpochMs` records when *that* grant took effect — the
true value for the one decision both racers end up bound to. The adopter's own clock
read was never a fact about the ledger; it was its prediction of what it would have
written had it won. The sequential path already works this way and is already
accepted: step 1 skips the append when a live grant exists and arms the window
against a `notBeforeEpochMs` from an *earlier* install, with no comparison at all
(§6, "same signed request re-installed while a grant is live"). A race path stricter
than the supported sequential path it converges to would be an inconsistency, not
extra safety.

**And the residual divergence narrows, it never grants.** The second arming rewrites
`window.json` with its own `installedAtMs` (`:456`, `:467`), so the machine-local
record can start marginally later than the adopted `notBeforeEpochMs`. Under the
intersection rule (§8.5) a lift needs the window record *and* a live grant, so the
effective start is the later of the two, never the earlier; the upper bound cannot
diverge at all, since both sides evaluate to the same signed `expiresAtMs` by the
argument above.

The byte-identical branch is the rare one, not the rule: `occurredAtEpochMs` comes
from the local clock, so two appends of the same decision are normally not
byte-identical and the conflict path is what fires. That is also why the intake's
own comparison is field-level: the store's is over the whole intent, envelope clock
fields included (`governance-event-store.mjs:642`), so it answers "are these the
same bytes" while the intake has to answer "is this the same decision". Treating
that conflict as a signal rather than an error is safe **only** because of the
verification in (2); an unverified "a conflict means someone else already wrote my
record" is precisely the assumption this section refuses to make.

`assertAppend` is not unused by this design — it is load-bearing where it is
reachable. The kernel's own consumption helper binds the live-grant check to the
same stream lock (`human-governance-ledger.mjs:209-223`, `HGL-CONSUME-NOT-LIVE`),
and §7.5's HGO consumption goes through that helper rather than re-implementing it.
If a later revision ever moves these identifiers off the stream state — a clock or
nonce suffix would do it — the precondition becomes reachable again and must be
reinstated together with a test that can fail without it. The same tripwire guards
the identity check above, for the same reason: a clock value belongs in neither an
identifier nor an adoption predicate, and admitting it into either is the change
that reopens this section.

The race specified here is **per request**. Two *different* signed requests
installed concurrently produce two independent request/grant chains, while GMW's
`writeAtomic` keeps `window.json` a singleton (`:467`), so the ledger can hold two
live grants behind one machine-local window. That interleaving is outside this
section and is recorded as O-5 (§14) rather than designed around silently.

`requested` is appended once and skipped on every later install of the same
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
using the same signature (§8.1). This requires `install` to *consume*
`--plan`/`--spec`; both already parse there, because `parseArgs` shares one option
set across all commands (`scripts/guard-maintenance-window.mjs:56-73`), and only
the install branch's failure to read them (`:115-130`) has to change. `prepare`'s
own defaults (`:50-52`) are deliberately **not** reused as an install-time
fallback: a default that silently supplies a different artifact than the one the
PO signed over would defeat the digest check it is supposed to pass.

### 7.5 HGO event sequence

**Where each HGO scope field comes from** (§3.3's inventory, not assumption):
`scope.candidate` from `capability.repository.head`/`.tree`; `scope.packageId`
`human-guard-override`; `scope.action` from the consumption mode;
`ruleDigest = canonicalSha256({eligiblePaths, commandClass})`;
`policyDigest = canonicalSha256(capability.policy)` (§5.5);
`validity.notBeforeEpochMs` / `expiresAtEpochMs` from `capability.authorizedAt` /
`capability.expiresAt`; `correlation.requestId` from `capability.requestSha256`.

**Representability, in the order the payload actually constrains it.** Two payload
requirements can independently make an HGO decision unrepresentable. The candidate
is checked **first**, because no artifact source can repair a missing one — and
because checking it second is what let an earlier revision classify a candidate-less
capability as representable.

**Layer 0 — the candidate.** `scope.candidate` requires two `OID` values and admits
no typed state (`human-governance-decision.mjs:29`), unlike the envelope, which does
(`governance-event.mjs:138-145`). A capability whose `repository.head`/`.tree` are
`null` — i.e. every `mode: "global-plugin-install"` capability (§3.3) — **cannot be
represented**, and the intake appends nothing for it. The intake **SHALL NOT**
substitute the observation's `statusSha256`, its `fingerprintSha256` or the plugin
tree digest for a commit or a tree: all three are 64-hex and would pass the `OID`
pattern, and writing one would place a value into `scope.candidate` that is not the
thing the field denotes — permanently, in an append-only record. That is the
prohibition AC-12 already states for artifacts; AC-13 states it for the candidate.

**Layers 1-3 — the artifacts.** The payload requires at least one `{path, sha256}`
entry whose path matches an artifact pattern that begins `[A-Za-z0-9]`
(`human-governance-decision.mjs:30-31`; the envelope repeats it at
`governance-event.mjs:23`). HGO's own data satisfies that only sometimes, so the
intake uses a layered, deterministic source and states the residue:

1. every `capability.eligiblePaths` entry that matches the artifact path pattern
   **and** resolves to a regular file inside the worktree, paired with the sha256
   of its bytes read at the moment the event is built (denial time for `denied`,
   authorization time for `granted`; the `consumed` disposition inherits the
   grant's `scope` unchanged, `human-governance-decision.mjs:60`);
2. otherwise every `capability.policy.project` entry with `status: "present"` whose
   path matches the pattern, with the digest `policyIdentity` already computed
   (`human-guard-override.mjs:386-394`). These are honestly *bound* to the
   decision, not decorative: a change to any of them drifts the capability and
   HGO refuses to consume it (`:1593`, `HGO-DRIFT`);
3. otherwise **the decision is not representable in the portable payload at all**,
   and increment 1 appends nothing for it. See finding F-3 (§14) and §8.1.

**Neither residue is hypothetical, and they are not the same set.** `eligiblePaths`
is empty for the `closed-shell-exact` (`:838-844`) and `global-plugin-install`
(`:785-792`) classes, and the dominant `writer-owned-project-policy-emergency` class
targets dot-prefixed paths such as the `.claude/` configuration files (`:457-478`),
which the leading-`[A-Za-z0-9]` rule rejects. Layer 2 rescues part of that, because
two of `policyIdentity`'s five `project` entries are `project/`-prefixed and do
begin alphanumerically (`:380-394`) — which is exactly why layer 0 has to come
first: a `global-plugin-install` capability in a checkout carrying those files would
otherwise pass layer 2 and be classified representable while its candidate is still
`null`, and the fail-closed rule of §8.1 would then fire on a decision that was
never expressible. These are limitations of the payload contract, not of HGO; the
amendments that remove them are specified in §9 and left to the rebind.

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

**One bounded exception, named rather than hidden: the HGO decisions the payload
cannot represent at all (§7.5, layers 0 and 3).** "Fail closed" there would not mean
"record it and proceed", it would mean *disabling a working human lane* for as long
as the payload contract stays as it is. The field constraint of §1 reads as a
ceiling on additions and retires nothing that already exists; turning off a lane to
satisfy a bookkeeping rule would retire something.

The exception covers two disjoint sets, and the second matters more than the first:

- the decisions whose **artifact** set cannot be built (§7.5 layer 3) — the
  dot-prefixed and path-less classes;
- **every `global-plugin-install` decision, whose candidate does not exist** (§7.5
  layer 0). That set is the local plugin-install override lane, and it exists only
  in a Pipeline source checkout: `isPipelineSourceRoot` requires both
  `plugins/pipeline-core/.codex-plugin/plugin.json` and `harness/scripts/verify.mjs`
  (`human-guard-override.mjs:242-245`), which is to say, in the repository where the
  Pipeline itself is developed — including this one. An unconditional fail-closed
  rule would therefore have switched off, in exactly that repository, the one lane
  whose purpose is installing the plugin under test.

Increment 1 leaves both sets exactly as they are today — machine-local audit chain
only, no portable event, no refusal, no new capability, no change to HGO's behaviour
— and the gap is carried as finding F-3 with its amendments in §9, not silently
absorbed. Representability is decided **before** any append is attempted, so the two
cases can never be conflated at run time: a decision that cannot be represented is
not an append that failed. Every HGO decision that *is* representable fails closed
as stated above, and this exception is scoped to representability alone: a
representable decision whose append merely *fails* still blocks the consumption.

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

#### 8.5.1 Which candidate the check passes — the resolver's actual comparison

The resolver compares the supplied candidate to the grant's, field by field:
`if (decision.scope.repositoryFingerprint !== repositoryFingerprint ||
decision.scope.candidate.commit !== candidate.commit ||
decision.scope.candidate.tree !== candidate.tree) return … "scope-mismatch"`
(`human-governance-ledger.mjs:55`). "A live grant exists" is therefore not a
well-defined question until the caller says which candidate it passes. This design
previously left that open. It is settled here, **differently for the two
producers, because the two mechanisms bind candidates differently**:

- **GMW → the grant's own candidate**, `decision.scope.candidate`. GMW's
  enforcement is deliberately candidate-independent: validity is derived purely
  from the signed time bound (`guard-maintenance-window.mjs:542-545`, no candidate
  term). A maintenance window exists precisely so that guarded paths can be
  edited, so `HEAD` moving during the window is the **normal** case, not an
  anomaly. Passing the *current* candidate would therefore report a false
  ledger/window disagreement on almost every real window: `status` would lose its
  stated value as the detector of a lost close-append, and a reconcile keyed on
  disagreement could append a spurious `revoked` that H-AC-06 makes permanent.
  That reading is rejected.
- **HGO → the currently observed candidate.** HGO's capability *is* candidate-
  bound and its consume path already re-observes the repository and refuses on any
  drift (`human-guard-override.mjs:1588-1611`, `HGO-DRIFT`), down to the worktree
  `statusSha256`. Passing the current candidate is therefore non-vacuous there and
  agrees with the mechanism's own rule: whenever HGO would consume, the two
  candidates are equal by construction; when they differ, denying is correct.

**The honest cost of the GMW choice, stated rather than implied.** Passing the
grant's own candidate makes the resolver's candidate comparison **vacuous for
GMW**: the boundary check is a *liveness, repository-binding and disposition*
check, and it is named that way in this document from here on. The candidate
binding H-AC-04 requires is still established and still enforced — but once, at
grant creation, against the PO-signed intent candidate
(`guard-maintenance-window.mjs:364-371`, re-derived and proof-checked at
`:401-419`), and thereafter by `HGL-SCOPE`/`HGL-CROSS-REPOSITORY` at append
(`human-governance-ledger.mjs:156`) and by the repository-fingerprint comparison
that the same line 55 performs on every read. What the boundary does **not** do is
re-bind the lift to the current tree; claiming otherwise would be the overclaim
this document exists to avoid.

This is not a novel reading: the kernel's own one-shot disposition path resolves
liveness the same way, passing `candidate: grant.scope.candidate` into the
resolver under the stream lock (`human-governance-ledger.mjs:215-221`).

Two consequences are binding on the implementation: **reconcile SHALL NOT derive
any disposition from a candidate difference** (only from expiry, from a missing
window record after a recorded grant, or from an explicit close), and §12's
stale-candidate test pins both halves of the rule.

#### 8.5.2 Where the dual evaluation runs (D-2), and the criterion it does not meet

At the arming boundary (`install`), at the consumption boundary (HGO `consume`),
in `status`, and in reconcile — **not** inside the synchronous guard hook read
path. The hook path (`windowCoversRule`, `guard-maintenance-window.mjs:559-566`)
is synchronous and must not take the ledger's stream lock or perform async
repository I/O on every tool call; doing so would make guard evaluation depend on
a lockable resource, which is a denial-of-enforcement risk far worse than the
residual it closes.

**H-AC-02 is the criterion actually at stake, and the residual does not satisfy
it.** H-AC-02 (`acceptance.md:143-144`) reads: "IF mutable state claims human
authority without a matching valid ledger decision, THEN THE SYSTEM SHALL reject
the authority claim." It carries no migration qualifier and no expiry. The
machine-local window record is mutable state claiming human authority; between two
boundaries the hook honours it with no ledger decision consulted. Anchoring this
residual to H-AC-12's "during migration" clause — as this document did — answered
a weaker question than the one being asked, and the accompanying "nothing
regresses" is true but sets the bar at the pre-ledger status quo that this
document exists to replace. Recorded plainly: **as designed, increment 1 does not
satisfy H-AC-02 at the guard hook.** It satisfies it at every boundary that grants
or consumes.

**The closure path, since a defect with no route out is only half-reported.** The
hook can perform the intersection without any of the three costs above, because on
that side the check is **narrowing-only**: it can turn a `covered: true` into
`covered: false` and can never produce a lift by itself, since the proof-verified
window record remains a necessary condition. That asymmetry is what makes the
ledger read cheap in guarantees — no lock is needed (readers take none; each event
file is published by atomic rename, `governance-event-store.mjs:657-659`), no
integrity assumption is needed (an agent that forges or deletes ledger files can
only *deny* itself the lift), and no human step is added. The remaining real cost
is per-call read I/O over the human stream, which is why this is scheduled as
increment 2 alongside D-1 rather than asserted as free, and why the hooks that
call `windowCoversRule` appear in §9's amendment rather than in §11's increment-1
inventory. Until it lands, O-2 (§14) carries a **known non-conformance with an owner
and a named closure path**, not an interpretation to ratify. It carries **no date**:
scheduling increment 2 is part of the decision O-2 asks the PO for, and this
document does not assert a date it has no standing to set. The only date in §9 is
H-AC-12's migration expiry, which bounds that clause alone and, as §9 says
explicitly, discharges nothing of H-AC-02.

The migration compatibility owner and expiry that H-AC-12's own sentence requires
are recorded in the amendment of §9; they bound the H-AC-12 clause, and they do
not bound H-AC-02, which has no expiry to give.

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

**Further amendments belong in the same rebind** so the artifacts stay consistent
(bundling them avoids repeated rebinds). AC-9 makes the §9 amendment a completion
gate for this path, so an under-specified list here would write an incomplete
inventory into a bound artifact and lock it in. The list below is therefore
derived row-by-row from §11 rather than summarized:

- `spec.md` §7.4 (`:405-427`) gains **five** rows: the intake module
  `plugins/pipeline-core/lib/guard-authority-ledger-intake.mjs`, its unit test
  `…/lib/guard-authority-ledger-intake.test.mjs`, the integration test
  `plugins/pipeline-core/scripts/guard-authority-ledger-intake.test.mjs`, and the
  two producer CLIs `plugins/pipeline-core/scripts/guard-maintenance-window.mjs`
  and `plugins/pipeline-core/scripts/guard-human-override.mjs`.
- Two rows already in `spec.md` §7.4 are **extended, not duplicated**:
  `scripts/governance-authority.mjs` (`:421`) and
  `scripts/governance-authority.test.mjs` (`:422`) gain the lazy `expired` and
  repair `revoked` reconcile dispositions of §7.5/§8.2. This is inventory
  catch-up, not a new surface: `spec.md:310` already declares
  `governance-authority resolve|reconcile` as a service operation.
- No row is needed for `docs/human-governance-ledger.md`: `spec.md:418` already
  carries it as a **create**, which is also why §11 lists it as a create (§14,
  F-4).
- The migration compatibility owner and expiry H-AC-12 requires: owner
  `pipeline` (PHX-2 package), expiry at the end of the Phoenix epic, after which
  the intersection check becomes unconditional rather than migration-scoped. Note
  that this bounds the H-AC-12 clause only; H-AC-02 (§8.5.2) is unconditional and
  is not discharged by any expiry.
- **For the H-AC-02 residual (increment 2).** The guard hooks that consult
  `windowCoversRule` gain the synchronous, lock-free, narrowing-only intersection
  read of §8.5.2, and `spec.md` §7.4 gains their rows at that point. Specified
  here so the residual has a named closure; not part of increment 1's inventory.
  **Superseded by §15.2 (PO-decided 2026-08-09).** The sentence above — "not part
  of increment 1's inventory" — no longer applies. §15.2.3/§15.3 name
  `guard-testpath.mjs` and `guard-gate-strength.mjs` as part of increment 1's
  inventory, not increment 2's. Neither file appears anywhere in `spec.md` today
  (confirmed by search), so both get **new** `spec.md` §7.4 rows — not extensions
  of an existing one, the other direction §9's five-file enumeration above used —
  and those rows land in the same rebind this section's H-AC-12 amendment already
  requires, not a later one. Retained here, quoted rather than deleted, so a
  reader consulting §9 in isolation is told the same thing §15 already decided,
  not the opposite — the same quote-and-supersede style §15.2.5 already used to
  retract the parallel sentence in §8.5.2.
- **For O-1's identity-registry mechanism (§15.1, §15.3).**
  `plugins/pipeline-core/lib/human-governance-identity-registry.mjs` and its unit
  test `…/lib/human-governance-identity-registry.test.mjs` are both **new**
  `spec.md` §7.4 rows: neither file exists in the repository or in `spec.md`
  today. `plugins/pipeline-core/scripts/governance-authority.mjs` gains
  `resolve-identity` (§15.1.2) as a further **extension** of the same row already
  extended above (`:1241-1246`) for the reconcile disposition — one row, extended
  twice, not duplicated, following `spec.md:421`'s existing entry, the same
  extended-not-duplicated direction that row already uses. All three rows land in
  the same rebind as the rest of this section's amendments, gated by AC-9/AC-14.
- **For the un-representable HGO decisions (increment 2, finding F-3).** The
  portable payload cannot express an override whose only bound paths are
  dot-prefixed or absent, because `scope.artifacts` requires at least one entry
  whose path starts `[A-Za-z0-9]` (`human-governance-decision.mjs:30-31`, mirrored
  at `governance-event.mjs:23`). Two candidate amendments, both kernel-level and
  therefore explicitly **not applied here**: admit a leading `.` in the artifact
  path pattern (dot-prefixed repository-relative paths are public and carry no
  privacy problem), or admit a typed `not-applicable` artifact entry in the
  payload as the envelope already does (`governance-event.mjs:130-136`). The
  first is narrower and is the recommendation; both touch a shipped validator and
  its published schema, so both belong to the reviewed rebind.
- **For the candidate-less HGO decisions (increment 2, finding F-3's second
  half).** `scope.candidate` requires two `OID` values and admits no typed state
  (`human-governance-decision.mjs:29`), while a `global-plugin-install` capability
  observes a plugin source tree and carries `head: null`/`tree: null`
  (`human-guard-override.mjs:231-232`). The only honest amendment is to let
  `scope.candidate` carry a typed state as the envelope already does
  (`governance-event.mjs:138-145`), which K-AC-09 already requires consumers to
  preserve exactly. The alternative — borrowing the observation's 64-hex
  `statusSha256`, which would pass the `OID` pattern — is rejected: it would record a
  value that is not a commit as a commit, permanently. Until the amendment lands the
  local plugin-install lane stays outside the portable ledger and unchanged (§8.1).
- **For H-AC-11's join clause (F-A, O-4).** No intake design can satisfy H-AC-11's
  "no portable counterpart or join handle" while its first clause requires the
  portable record to expose request, exact scope and the rule/policy digests: §5.2's
  table shows the two records are joinable through `scope.candidate`, `validity`,
  `ruleDigest` and the artifact digests even with every identifier removed. The
  amendment that would make the criterion satisfiable scopes the clause to the record
  it actually describes — the restricted machine-local profile of §3.4, whose
  envelope can omit every correlator by typed state — and states separately what is
  required of a producer's own enforcement material, which is not a ledger record
  and is not created by this path. This is an acceptance-criterion change and is
  **not** applied here; O-4 carries the PO decision. The alternative exit is a change
  to GMW's machine-local storage so that the rationale and the proof no longer sit in
  a record keyed by the intent digest; that touches a module another session owns, it
  is not proposed here, and it would still not remove the structural join.
- Only if increment 2 (D-1) is accepted: `spec.md` §6.1's closed schema family
  gains the restricted attribution schema.

## 10. Assumptions and pinned dependencies

Both producers get a safety net here. The first version of this document listed
ten GMW assumptions and none for HGO, which made every HGO dependency read as
established fact — and one of them was wrong (§3.3, §7.5). An unverified GMW
dependency fails loudly against a row below; an unverified HGO dependency used to
fail only at implementation time. §10.2 closes that asymmetry.

### 10.1 Unverified assumptions about the finalized GMW

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
| A-11 | GMW enforcement stays candidate-independent — validity from the signed time bound alone, no candidate term (`:542-545`) | §8.5.1's choice inverts: if the final GMW binds a candidate at enforcement, the boundary must pass the *current* candidate and the vacuity disclosure is wrong in the other direction | §12's stale-candidate test fails the moment a candidate term enters the validity computation |
| A-12 | `install` remains re-runnable with an identical `{request, proof}` (`:451-455`) | §7.3's fail-closed retry after a lost race stops being free for the human, and §8.1's "costs the human nothing" no longer holds | integration test 8 (re-install appends nothing, does not error) |

### 10.2 HGO dependencies — verified in this checkout, pinned against drift

These are **not** unverified: every row was read from source for this document
(§3.3). They are listed so that a later change to HGO breaks a named row and a
test, rather than breaking the intake silently.

| # | Pinned dependency (**verified**, `human-guard-override.mjs`) | If it changes | Detection |
| --- | --- | --- | --- |
| H-1 | `CAPABILITY_KEYS` keeps `repository`, `eligiblePaths`, `policy`, `commandClass`, `requestSha256`, `authorizedAt`, `expiresAt` (`:1066-1089`) | the HGO builders lose their field sources and fail closed | shape assertion in the unit tests; `exactKeys` at `:1100` already fails a drifted capability |
| H-2 | `repository` stays `repositoryObservation` with `head`/`tree` for `standard`/`pipeline-author-repair` (`:424-434`), **and stays `localPluginInstallSourceObservation` with `head: null`/`tree: null` for `global-plugin-install`** (`:231-232`, substituted at `:1164`, `:1276`, `:1586`) | if the mode split moves, either `scope.candidate` loses a source it had, or a mode that has none is treated as if it had one | U-10 pins the mapping **per mode** including the layer-0 not-representable outcome; `HGL-SCOPE` at validation |
| H-3 | `eligiblePaths` stays repo-relative (`:436-455`, `:815`) | an absolute path could reach a portable field | privacy test 16 and the artifact path pattern both reject it |
| H-4 | `policy` stays `policyIdentity`'s `{guards, project}` shape with no key material (`:369-396`) | `policyDigest`'s HGO preimage stops being closed or stops being safe | §12's constructive `policyDigest` test |
| H-5 | consume keeps refusing on repository/policy/plugin drift (`:1588-1611`) | §8.5.1's HGO half becomes vacuous too, and the current-candidate choice loses its justification | integration test on drift-rejection ordering |
| H-6 | the audit chain keeps `denied`/`authorized`/`expired`/`rejected`/`consumed` (`:1226-1235`, `:1511-1520`, `:1598-1605`, `:1623-1631`) | §7.5's event mapping loses its trigger points | CLI integration tests |
| H-7 | a denial set is never empty (`:1156`) | the HGO path could produce a decision with no denying guard identity behind it | unit test on the builder's precondition |

## 11. Implementation inventory (file level)

| File | Change | Rationale |
| --- | --- | --- |
| `plugins/pipeline-core/lib/guard-authority-ledger-intake.mjs` | **create** — pure builders: `buildWindowRequestDecision`, `buildWindowGrantDecision`, `buildWindowRevocationDecision`, `buildWindowExpiryDecision`, `buildOverrideDecisions`, plus `buildAppendIntent` (§7.2) and the deterministic id helpers (§7.3). No I/O, no clock, no randomness — every time value is a parameter | keeps the whole contract unit-testable and independent of the unfinished GMW's function signatures (§7.1) |
| `plugins/pipeline-core/lib/guard-authority-ledger-intake.test.mjs` | **create** — §12's unit tests U-1..U-10 | the H-AC-15 dimensions §12's map assigns to the pure builders; it does **not** discharge H-AC-15 for this path on its own |
| `plugins/pipeline-core/scripts/guard-authority-ledger-intake.test.mjs` | **create** — §12's integration tests I-1..I-14, against a temporary repository and the real store | the remaining H-AC-15 dimensions (concurrency, interruption, tampering, cross-repository, retry) exist only across the CLI/store boundary; §12's map states which test covers which dimension |
| `plugins/pipeline-core/scripts/guard-maintenance-window.mjs` | modify `install` (append-then-arm, fail closed; accept `--plan`/`--spec`, digest-verified), `close` (unlink-then-append, fail open), `status` (report ledger/window disagreement) | the only place that can `await` without changing library signatures |
| `plugins/pipeline-core/scripts/guard-human-override.mjs` | modify the authorize/consume/deny paths to append the events of §7.5, consumption fail-closed via `appendConsumedHumanGovernanceDecision` | H-AC-12 already names Git-guard override consumption |
| `plugins/pipeline-core/scripts/governance-authority.mjs` | add a `reconcile` path that appends lazy `expired` and repair `revoked` dispositions (§7.5, §8.2) | the criteria require distinct disposition events; nothing else runs at expiry |
| `plugins/pipeline-core/lib/guard-maintenance-window.mjs` | **no change** | deliberate: another session owns this file (§7.1, A-3) |
| `plugins/pipeline-core/lib/human-guard-override.mjs` | **no change** | its audit chain stays as the machine-local record (§5.4) |
| `plugins/pipeline-core/lib/human-governance-ledger.mjs`, `human-governance-decision.mjs`, `governance-event*.mjs` | **no change in increment 1** | design to what exists; increment 2's kernel change is D-1 |
| `docs/human-governance-ledger.md` | **create** — the file does not exist in this checkout (untracked, and absent from disk); `spec.md:418` still carries it as a create. This path contributes the two producers' section: reason codes, what is portable, what is not | H-AC-14; the row is a creation, not an edit, so the work is not understated (§14, F-4) |
| `specs/sprint-phoenix-epic/acceptance.md`, `spec.md` | **amendments specified in §9, applied by the rebind, not here** | bound artifacts |

## 12. Verification approach

**Unit** (pure builders; no repository, no clock):

- **U-1** Every builder output passes `validateHumanGovernanceDecision` — and a
  mutated copy with one extra key fails `HGL-SHAPE`.
- **U-2** `granted` without `links.requestDecisionId` fails `HGL-LIFECYCLE`; each
  disposition requires exactly its own link.
- **U-3** `reasonCode` values are pinned; a free-text reason injected anywhere in
  the input never appears in, and is not hashed into, any output field.
- **U-4** Identifier determinism: identical input → identical ids; a changed grant
  generation `g` changes only the grant/disposition ids, never
  `requestDecisionId`; and a changed `installedAtMs` changes **no** id at all —
  the regression guard against the clock-suffixed scheme §7.3 replaced.
- **U-5** `identityAssurance` is `locally-attributed` and `timeAssurance` is
  `locally-observed` for **every** builder, including the proof-verified GMW path.
- **U-6** `validity` matches `min(signed, installedAtMs + MAX_WINDOW_TTL_MS)`
  exactly, and the catalogue pin of §5.5 agrees with `isLiftableRuleId`.
- **U-7** `policyDigest` is verified **constructively**: recomputed from §5.5's
  declared preimage and asserted equal. Additionally, a builder handed a trust
  anchor as an extra input produces a byte-identical output, and neither
  `keyReference`, `publicKeySha256`, nor any digest of either appears anywhere in
  the preimage or the output.
- **U-8** No builder can emit `corrected` or `superseded`: this path never
  produces a correction, and the test pins that as a property rather than leaving
  the H-AC-15 correction dimension unaddressed.
- **U-9** The HGO denial builder produces `requested` + `denied` with
  `GUARD.OVERRIDE.DENIED` and `links.requestDecisionId`.
- **U-10** HGO representability, in §7.5's order. Layer 0: a
  `global-plugin-install` capability (`repository.head === null`) yields the explicit
  *not-representable* outcome and **no decision object**, even when its
  `policy.project` entries would satisfy layer 2; and no builder ever writes
  `statusSha256`, `fingerprintSha256` or a plugin tree digest into `scope.candidate`.
  Layers 1-3: a capability with representable `eligiblePaths` uses them; one without
  falls back to the present `policy.project` entries; one with neither yields the
  same *not-representable* outcome — never a fabricated path, never a fabricated
  candidate, never an empty `artifacts` array.

**Integration** (temporary repository, real store, both CLIs):

- **I-1** install → `requested` + `granted` present and readable back; window armed.
- **I-2** Re-install of the identical request appends nothing and does not error.
- **I-3** install with a failing store append → **no window record exists** (fail
  closed), and a retry after the store recovers arms the window.
- **I-4** close → window gone and `revoked` appended; close with a failing append →
  **window still gone** (fail open), and `status` reports the disagreement.
- **I-5** Reinstall after close → grant generation `g+1`, same
  `requestDecisionId`, ledger reads granted → revoked → granted.
- **I-6** Artifact digest mismatch or missing `--plan`/`--spec` → fail closed.
- **I-7** Cross-repository: a decision from another repository is rejected
  (`HGL-CROSS-REPOSITORY`).
- **I-8** HGO lifecycle through the CLI: denial recorded, authorization recorded,
  consumption recorded; a second consumption fails (`HGL-CONSUME-NOT-LIVE`).
- **I-9** Tamper: mutate one event file → stream verification fails and install
  refuses.
- **I-10** Privacy property test over generated inputs: no output contains an
  absolute path, the `reason` text, its digest, the nonce, the proof, the trust
  anchor's key digest, **or any value derived from the anchor** — the last being
  enforced constructively by U-7, since a property test can only enumerate.
- **I-11** Stale candidate (§8.5.1): a window whose `HEAD` moved after install
  still resolves as a live grant at the arming boundary and in `status`; reconcile
  appends **no** disposition from a candidate difference; and the HGO half denies
  when the observed candidate differs from the capability's.
- **I-12** Concurrency, asserting §7.3's one specified behaviour and no other. (a)
  Two concurrent installs of the same signed request leave exactly one `requested`
  and one `granted` in the stream: the racer that reaches the stream lock first
  appends, the other **adopts** that committed grant under §7.3's step 2, both arm
  the window (the second arming is the supported identical re-install, GMW
  `:451-455`), and neither errors; a subsequent install then appends nothing. The
  load-bearing assertion is that adoption happens **although the adopting racer's own
  computed `validity.notBeforeEpochMs` differs from the committed one** — the test
  drives the two builders with two different fixed clock reads so this is pinned
  rather than left to timing — while the adopted record's `scope`, `ruleDigest`,
  `policyDigest`, `validity.expiresAtEpochMs` and `validity.singleUse` are
  byte-identical to what that racer built, and its `expiresAtEpochMs` equals the
  signed `subject.expiresAtMs`. (b) The fail-closed half, one case per step-3 branch,
  each arming **no** window and failing with `GAL-GRANT-RACE`: a committed decision
  that is already revoked; one differing in any field of the byte-identity set; one
  whose `notBeforeEpochMs` breaks §7.3's formula check (i); and one outside the
  adopter's own clock interval (ii). (c) A regression assertion that the intake never
  relies on an `assertAppend` precondition for (a) — the same-key branch is what
  decides it (`governance-event-store.mjs:640-644`).
- **I-13** Expiry: a window that expires unused gets exactly one `expired`
  disposition from reconcile, and a second reconcile appends nothing.
- **I-14** Reconstruction (AC-8): a fixture-based test renders one window's full
  history from the portable stream alone and answers *what / when / why / by-whom-
  as-class*.
- **Increment 2 only** — R-2 of §5.2, and deliberately nothing wider: no
  `decisionId`, `eventId`, `idempotencyKey`, intent digest, candidate, artifact
  digest or exact timestamp appears in the restricted record; its envelope carries
  the typed `omitted-by-policy` states; and erasing it leaves no dangling reference
  in the portable stream. The test does **not** assert that the portable record is
  unjoinable to the producers' own machine-local stores — it is joinable, and §5.2's
  R-3 says so rather than letting a green test imply otherwise.

**H-AC-15 coverage map** (`acceptance.md:206-209`), so the claim and the tests can
be compared directly instead of taken on trust:

| Dimension | Covered by |
| --- | --- |
| grant | U-1, U-2, I-1 |
| denial | U-9, I-8 |
| consumption | I-8 |
| expiry | U-6, I-13 |
| revocation | I-4 |
| correction | U-8 (negative: this path never emits one) |
| retry | I-2, I-3 |
| concurrency | I-12 |
| interruption | I-3, I-4 (crash-matrix rows 3 and 5) |
| tampering | I-9 |
| stale candidate | I-11 |
| cross-repository binding | I-7 |
| redaction | U-3, U-7, I-10 |

Gate: `node harness/scripts/check-doc-contracts.mjs` for this document;
`node --test` over the new and touched test files for the implementation.

## 13. Acceptance criteria for this design's implementation (checkable)

- **AC-1** Installing a window appends exactly one `requested` (first time) and
  one `granted` before the window record exists; verified by asserting the ledger
  contents *and* the absence of `window.json` when the append fails.
- **AC-2** No portable record produced by this path contains an absolute path,
  free-form text, a digest of free-form text, the nonce, the proof, a key digest,
  **or any value derived from the trust anchor** (I-10 enumerates; U-7 proves the
  derivative case constructively, because an enumeration cannot).
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
  appended — for every decision the payload can represent. For the decisions it
  cannot (§7.5 layers 0 and 3, §8.1), increment 1 changes HGO's behaviour in no way at
  all, and a test asserts exactly that: no portable event, no refusal, no new
  capability.
- **AC-8** A reviewer can answer *what/when/why* and *by-whom-as-class* for any
  lift from the portable stream alone, demonstrated by a fixture-based
  reconstruction test that renders one window's full history.
- **AC-9** The amendments of §9 — H-AC-12's enumeration in `acceptance.md`, and
  every `spec.md` §7.4 row §9 enumerates — are present in the rebound artifacts
  before this path is declared complete. The §9 list and the §11 inventory are
  compared row by row as part of that check; a mismatch fails the gate.
- **AC-10** `policyDigest` equals `canonicalSha256` of §5.5's declared preimage,
  recomputed independently in the test, and the trust anchor is absent from that
  preimage at every depth (U-7).
- **AC-11** The boundary check passes GMW's *grant-recorded* candidate and HGO's
  *currently observed* candidate (§8.5.1); a window survives a moved `HEAD`; and no
  reconcile disposition is ever derived from a candidate difference (I-11).
- **AC-12** No HGO decision is ever recorded with a fabricated or substituted
  artifact: the artifact set comes from §7.5's layers or the decision is not
  recorded at all (U-10).
- **AC-13** No HGO decision is ever recorded with a fabricated or substituted
  **candidate**: a capability whose observation carries no `head`/`tree` produces no
  portable record at all, no digest of any kind is written into `scope.candidate` in
  its place, and the local plugin-install lane behaves exactly as it does today —
  no portable event, no refusal, no new capability (§7.5 layer 0, §8.1, U-10).
- **AC-14** (added, round-1 rework) The H-AC-11 amendment text proposed in §15.1.5
  — the paragraph beginning "Amendment for the machine-local identity registry
  (PO, 2026-08-09)" — is present, as reviewed and rebound, in `acceptance.md`'s
  H-AC-11 criterion before O-1's identity-registry mechanism (§15.1) is declared
  complete. Parallel to AC-9, but not covered by it: AC-9 gates only "the
  amendments of §9", and §15.1.5's text is not one of them, nor is it §9's own
  text — §15.1.5's closing line already says the text is "proposed text only...
  applied by the reviewed rebind, not here," and this criterion is the checkable
  gate that line otherwise leaves implicit.

## 14. Open items and findings for the PO

- **O-1 (decision to confirm).** From the repository alone, natural-person
  attribution is **not recoverable** for any lift: a reviewer gets
  `product-owner / locally-attributed` and nothing more, forever (§5.2, R-1). This
  follows from H-AC-11 as written; confirm that this accountability ceiling is
  intended before implementation, because it cannot be softened later without
  reopening H-AC-11. Read together with O-4, which is the opposite-direction
  finding: the ceiling holds for the repository record, and *not* for a holder of
  GMW's machine-local record, who can still join the two.
- **O-2 (known non-conformance, not an interpretation).** The dual evaluation runs
  at the arming/consumption boundaries, in `status` and in reconcile, not inside
  the synchronous guard hook (§8.5.2, D-2). Against H-AC-12's migration clause
  that is defensible with an owner and an expiry. Against **H-AC-02**
  (`acceptance.md:143-144`), which is unconditional and has no expiry, it is not:
  between two boundaries the hook honours mutable state claiming human authority
  with no ledger decision consulted. Recorded as a non-conformance with owner
  `pipeline` (PHX-2) and closure in increment 2 via the narrowing-only hook read
  of §8.5.2 — not as a question about how to read a criterion. The PO decision
  actually needed is whether increment 1 may ship with that gap open, given that
  the gap is identical to today's behaviour and that closing it costs per-call
  read I/O in the guard path. **No date is asserted for the closure**, here or in
  §8.5.2: scheduling increment 2 is part of this decision, not something this
  document can announce. §9's only date is H-AC-12's migration expiry, which bounds
  that clause and discharges nothing of H-AC-02.
- **O-4 (known non-conformance, PO decision needed).** H-AC-11's second clause — a
  restricted record with "no portable counterpart or join handle" — is **not
  satisfied for the GMW half** of increment 1, and §5.2 shows it cannot be satisfied
  by any identifier scheme while the first clause requires the portable record to
  expose request, exact scope and the rule/policy digests: the two records stay
  joinable through `scope.candidate`, `validity`, `ruleDigest` and the artifact
  digests even with every identifier stripped out. On the HGO side the same join
  reaches a zone that holds no attribution and no plaintext rationale at all
  (`human-guard-override.mjs:1370`, `:1430`), so nothing is exposed there. Owner
  `pipeline` (PHX-2). No date is asserted: the two exits are an
  acceptance-criterion amendment (§9) or a change to GMW's own machine-local
  storage, and choosing between them is the PO's call, not this document's. What is
  needed is which exit to take — and, until one is taken, whether increment 1 may
  ship with the residual disclosed as R-3 states it.
- **O-5 (decided, PO 2026-08-08: leave it, documented).** Two *different* signed
  requests installed concurrently each produce their own `requested`/`granted`
  chain, while GMW keeps `window.json` a singleton (`writeAtomic`,
  `guard-maintenance-window.mjs:467`). The ledger can therefore hold two live
  grants behind one machine-local window, and a later repair `revoked` (§8.2 row
  5) would have to dispose both. §7.3 specifies the identical-request race only;
  this divergence is a separate, distinct-request case.
  **Decision: leave it, documented, rather than designed around.** Two
  concurrent *distinct* maintenance-window requests are not a reachable state
  for a single-human PO, so the cost of designing around the divergence today
  would be an unrequested design change. The cost of not recording it is the
  part that matters: someone generalizes the mechanism later — to a multi-human
  PO, or to a second signer — without knowing that `window.json`'s
  singleton shape and the ledger's two-grant capacity were left to diverge on
  purpose rather than by oversight. This disclosure is that record; it is not
  deleted or softened by the decision, because a decision that hides what it
  decided against cannot be audited. Closing it, should it ever become
  necessary, means deciding whether a second live grant is refused at intake or
  recorded and reconciled — a design call for whoever revisits this together
  with increment 2.
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
- **Finding F-3 (contract limitation, verified, two halves).** The portable payload
  cannot represent two disjoint classes of HGO override.
  **(a) No artifact.** `scope.artifacts` requires at least one entry and every
  entry's path must start `[A-Za-z0-9]` (`human-governance-decision.mjs:30-31`,
  mirrored at `governance-event.mjs:23`), while HGO's dominant class targets exactly
  the dot-prefixed configuration paths of `protectedPath`
  (`human-guard-override.mjs:457-478`) and two other classes carry no path at all
  (`:785-792`, `:838-844`).
  **(b) No candidate.** `scope.candidate` requires two `OID` values and admits no
  typed state (`human-governance-decision.mjs:29`), while a
  `mode: "global-plugin-install"` capability observes
  `localPluginInstallSourceObservation`, whose `head`/`tree` are `null`
  (`human-guard-override.mjs:231-232`, substituted at `:1164`, `:1276`, `:1586`).
  Half (b) is the more consequential one: it is the local plugin-install lane, it
  exists only in a Pipeline source checkout (`:242-245`) — including this one — and
  an unconditional fail-closed rule would have disabled it there. Increment 1 records
  the representable subset and leaves both classes exactly as they are today (§7.5
  layers 0 and 3, §8.1); the two kernel amendments are specified in §9 and applied by
  the rebind. Both are limitations of the payload contract, not of HGO, and both were
  found by verifying HGO's field inventory rather than assuming it — (b) only after
  an earlier revision of this document had asserted the candidate as unconditionally
  present and pinned that assertion as "verified".
- **Finding F-4 (inventory correction, verified).** `docs/human-governance-ledger.md`
  **does not exist in this checkout** — untracked and absent from disk, while
  `spec.md:418` still carries it as a create. The earlier inventory row described
  an edit to it, which both understated the work and failed the existence check
  this document applies to other people's citations in F-1. §11 now lists it as a
  create.
- **Backlog claims:** all six checked claims survived verification (§3.2 table);
  none had to be designed around.
- **Corrections carried into this revision (review round 2).** Five findings were
  resolved against source. §5.2 asserted a two-zone separation that the payload's own
  required fields make unattainable; it is replaced by three rules — what holds, what
  holds in increment 2, and a disclosed residual — plus O-4. §3.3 pinned HGO's
  candidate as unconditional; it is mode-dependent and absent for
  `global-plugin-install`, which is now §7.5's layer 0, an explicit §8.1 exception,
  and AC-13. §7.3's `GAL-GRANT-RACE` precondition could not fire for the race it
  named, because the store resolves the idempotency key first; the race now has one
  specified behaviour (verified adoption, or fail closed) and I-12 asserts that one.
  §8.5.2 claimed O-2 carried a date it does not have; the claim is withdrawn rather
  than a date invented. §5.5's HGO justification rested on the machine-local-recording
  inference §5.3 rejects; the independent argument is now the only one, with the
  precedent explicitly marked as a non-argument. Two of the five changed the design
  rather than its wording: representability is decided at the candidate before the
  artifacts, and the race resolves by verified adoption instead of a retryable loser.
- **Round 1's corrections remain in force**: the boundary check's candidate argument
  (§8.5.1), `policyDigest`'s closed preimage (§5.5), HGO's real artifact sources
  (§3.3, §7.5), the H-AC-02 anchoring of the hook residual (§8.5.2, O-2), the
  H-AC-15 coverage claim versus the actual tests (§12), the §9 amendment versus the
  §11 inventory, and F-4 above — with the generation-suffixed identifiers of §7.3
  kept and their concurrency story corrected as described above.
- **Corrections carried into this revision (review round 4).** Round 3's major
  finding — the byte-identical `validity` precondition made the adoption branch
  unreachable, because `notBeforeEpochMs` is `installedAtMs`, an unsigned
  per-process clock read that two honest racers never share — is resolved by
  narrowing the identity check rather than relaxing it. `scope`, `ruleDigest`,
  `policyDigest`, `validity.singleUse` and `validity.expiresAtEpochMs` stay
  byte-identical (the last is the signed `subject.expiresAtMs` itself for a
  `prepare()`-built request, because `GMW-EXPIRY-TOO-FAR` bounds it);
  `validity.notBeforeEpochMs` leaves the byte-identity set and is instead bound by
  two replacement checks — the enforcement formula of `:542-545` evaluated on the
  committed pair, and in-force resolution at the adopter's own clock, which
  `resolveHumanGovernanceAuthority` already performs. I-12 asserts the one outcome
  this produces, with the racers' differing clock reads pinned in the test rather
  than left to timing.
- **Correction (round-4 PASS, minor finding F-A).** The round-4 review's sole
  finding flagged that §7.3/§4's justification for keeping
  `validity.expiresAtEpochMs` in the byte-identity set argued from a check
  (`GMW-EXPIRY-TOO-FAR`) that has not yet run at the moment the value is committed:
  the ledger append happens at §7.4 step (b)/(c), while the check lives inside
  `installGuardMaintenanceWindow`, called only at step (d). The justification is
  now scoped to the honest, `prepare()`-built request — the normal case, where
  `prepare()`'s own clamp (`:354`) already bounds the signed value before install's
  `min()` runs — and states the exceptional case explicitly: a hand-built subject
  whose signed `expiresAtMs` exceeds install-time `nowMs + MAX_WINDOW_TTL_MS` is
  briefly committed with a clock-derived `expiresAtEpochMs` before
  `GMW-EXPIRY-TOO-FAR` throws and step (e) appends `revoked`. The mechanism, the
  byte-identity set, the step order and I-12's asserted outcomes are unchanged;
  only the stated reason for one field's membership in that set was corrected.

## 15. O-1/O-2 amendment (PO-decided 2026-08-09)

Both decisions below are PO-decided, not open again: §14's O-1 and O-2 entries are superseded by this section,
not re-argued. What follows specifies their implementation to the same bar the rest of this document holds
itself to — precise enough that an implementor makes no further design choice of its own. O-3 (no ceremony
added), O-4 (GMW's separate join residual) and O-5 (the distinct-request race) are not reopened; §15.1.6
extends O-4's disclosure pattern to a second, independently-caused residual rather than touching O-4 itself.

### 15.1 O-1 — "must be able to carry a natural person's identity"

#### 15.1.1 What the PO rejected, and what does not change

The PO rejected the ceiling this document's original §5.2/§14 stated: that from the repository alone a lift
resolves to `product-owner / locally-attributed` and nothing more, forever. That ceiling followed from two
facts, neither of which O-1 asks this design to undo: H-AC-13 (`acceptance.md:214-222`) rejects a
"natural-person identifier... or any data whose policy requires... a retention period shorter than the
repository's" from **portable** persistence, unconditionally; and §5.2's R-1/R-2 show no identifier scheme
puts a name into the **portable** payload without violating that. **Nothing below adds a natural-person
identifier to a portable record.** The `AUTHORITIES` role set and `ASSURANCE` classes in
`human-governance-decision.mjs:10-11` and `human-role-exception-decision.mjs:27-28` stay exactly as they are —
confirmed identical in both files, so the gap the PO is closing is structural, not accidental to one schema.
What O-1 asks for is a decision that *also*, separately, carries an identity — and "also" is answered by
adding a second, independent record a reviewer consults alongside the decision, never by widening the decision
itself.

#### 15.1.2 The mechanism: a machine-local identity registry, joined by role and time

**New file, new module, no kernel change.** `plugins/pipeline-core/lib/human-governance-identity-registry.mjs`
(create) validates and looks up entries in a new machine-local file,
`<git-common-dir>/agent-pipeline/human-governance-identity/identity-registry.json` — a sibling of GMW's and
HGO's own machine-local directories (`guard-maintenance-window/`, `human-guard-overrides/`), outside the
worktree, never synced, never referenced by any commit. Its shape:

```text
{
  schema: "pipeline.human-governance-identity-registry.v1",   // a local file-format marker only;
                                                                // NOT a governance-event payload schema,
                                                                // and not a candidate for spec.md §6.1's
                                                                // closed v1 family (F-2, §14) -- this file
                                                                // never enters governance-event.mjs at all
  entries: [
    {
      authorityClass:        "product-owner",   // one of AUTHORITIES, human-governance-decision.mjs:10 --
                                                  // the SAME closed set; no new role is invented
      keyReference:          "local-po-key" | null,  // matches critical-human-proof.json's
                                                       // trustAnchor.keyReference verbatim when this role
                                                       // signs; null for a role that never holds a signing
                                                       // key (its exact shape is whatever
                                                       // critical-human-proof-policy.mjs already validates --
                                                       // not redefined here)
      naturalPersonId:       "roaspeci",         // ID pattern, human-governance-decision.mjs:4 -- see 15.1.3
      effectiveFromEpochMs:  1754000000000,      // Number.isSafeInteger, >= 0
      effectiveUntilEpochMs: null,               // null == still current; else > effectiveFromEpochMs
    },
  ],
}
```

**Validation (exact, closed).** `validateIdentityRegistryEntry(entry)`: `exact()` over the five keys above;
`authorityClass ∈ AUTHORITIES`; `keyReference` is `null` or a non-empty string; `naturalPersonId` matches the
`ID` pattern (`human-governance-decision.mjs:4` — an alphanumeric initial followed by up to 127 characters
drawn from `A-Z`, `a-z`, `0-9`, `.`, `_`, `:` and `-`); `effectiveFromEpochMs` a safe non-negative integer;
`effectiveUntilEpochMs` is `null` or a safe integer strictly greater than `effectiveFromEpochMs`. **No two
entries for the same `authorityClass` may have overlapping `[effectiveFromEpochMs, effectiveUntilEpochMs)`
intervals**, and at most one entry per `authorityClass` may have `effectiveUntilEpochMs === null` (the
"current holder" slot) — `validateIdentityRegistry(file)` rejects the whole file rather than silently picking
a winner.

**Lookup (exact).** `resolveNaturalPersonIdentity({ registry, authorityClass, occurredAtEpochMs })` returns
`{status: "resolved", naturalPersonId}` if exactly one entry matches `authorityClass` and
`effectiveFromEpochMs <= occurredAtEpochMs < (effectiveUntilEpochMs ?? Infinity)`; `{status: "unknown"}` if
none matches (a decision may predate the registry, or a role may have no registered holder — not an error);
`{status: "ambiguous"}` if more than one would match (only reachable if the file was hand-edited around the
overlap check, so it fails closed rather than guessing).

A reviewer reconstructs an identity for a portable decision `D` by reading `D.authorityClass` and
`D.envelope.occurredAtEpochMs` (both already portable and unchanged, §4/§7.2) and passing them to
`resolveNaturalPersonIdentity` against their own local registry file. **No new field is added to the portable
payload.** This is why no schema change to `human-governance-decision.mjs`, `human-role-exception-decision.mjs`,
or `governance-event.mjs` is needed for O-1 at all, and why §11's "no change in increment 1" row for those
three files stands even after this amendment.

**Wiring, minimal.** `plugins/pipeline-core/scripts/governance-authority.mjs` (already gaining a `reconcile`
path per §11) gains one more read-only verb over the lookup above — composed to fit, not bypass, its existing
closed shape. `parse(argv)` (`governance-authority.mjs:12-23`) accepts exactly four `argv` entries,
`argv[0] === "--repo"`, and `argv[2]` one of six enumerated flags, each an existing verb's `-file`/`-json`
pair carrying a single canonical-JSON payload in `argv[3]` — not a multi-flag CLI. A bare `resolve-identity
--authority-class <class> --occurred-at-ms <n>` does not fit that shape at all. The verb is added the same way
every other one was: two more entries in the `Set` at `:13`, `--resolve-identity-file` and
`--resolve-identity-json`, each carrying the canonical-JSON payload `{authorityClass, occurredAtEpochMs}` —
exactly `resolveNaturalPersonIdentity`'s two parameters. `main()` (`:39-99`) gains one more early branch,
alongside its existing `consumptionReadback`/`consumption`/default three, that validates this payload's exact
shape, calls `resolveNaturalPersonIdentity` directly against the local registry (no
`queryHumanGovernanceDecisions` call — this verb never touches the ledger), and returns
`Object.freeze({schema: "pipeline.governance-authority-identity-readback.v1", ...result})`, the same
freeze-and-print convention every other branch already uses (`:102`). No producer path (GMW's
`install`/`close`, HGO's authorize/consume/deny) reads or writes the registry; populating it is a manual,
PO-side act, exactly like editing `critical-human-proof.json` is today. **Unlike `critical-human-proof.json`,
no guard protects this file today.** `identity-registry.json` lives outside the worktree (above);
`gateStrengthRuleFor` (`guard-gate-strength.mjs:170-178`) resolves every candidate path against the project
root and returns no rule whenever the resolved path lies outside it (`rel.startsWith('..' + sep)`) — GS-family
protection is worktree-relative by construction and structurally cannot reach a path outside the project
directory without unrelated guard changes out of this design-doc-only dispatch's scope. Populating **and**
protecting this file are therefore both currently unenforced, manual, PO-side acts. Disclosed as a residual,
not designed around here — §15.1.6.

#### 15.1.3 (a)/(b) Assurance and shape: self-declared, bounded, no new ceremony

**(a) Assurance.** The identifier is exactly as trustworthy as `locally-attributed` already claims for the
decision it attributes — self-asserted by whoever maintains the registry file on their own machine, never
independently verified, never signed. **No new value is added to the closed `ASSURANCE` set**
(`locally-attributed, externally-attested, unknown`), and registry entries carry no assurance field of their
own: their trust ceiling is inherited, not stated, from `identityAssurance` on the decision(s) resolved through
them — which is `locally-attributed` in every case this design produces (U-5, AC-4, unchanged). Requiring a
signature over registry entries would be a new human ceremony and is rejected under §1's constraint; a
self-declared name is not a stronger claim than what already exists for the same decision, only a more
complete one.

**(b) Shape.** `naturalPersonId` reuses the same `ID` pattern shared by `human-governance-decision.mjs:4` and
`human-role-exception-decision.mjs:21` (§15.1.2's validation rule above) rather than admitting free text. Two
grounds, both already established elsewhere in this document: §5.3 treats a free-text field —
even a digest of one — as the exact shape of private data this design keeps out of anything durable, and a
legal name is no different in kind from `subject.reason`; and a bounded pattern makes "is this identifier
well-formed" a structural check rather than a convention, the same argument §3.1 makes for `reasonCode`. The
registry is machine-local and therefore outside H-AC-13's reach (§15.1.4), so this constraint is not legally
required here — it is chosen anyway, as defense in depth and for consistency with the rest of the schema
family: a handle or short name (`roaspeci`, `po-alex`), not a sentence.

#### 15.1.4 (c)/(d) Storage location, and the H-AC-13 resolution

**(c) Where it is stored.** The briefing poses two options: directly in the portable record, or a machine-local
mapping file the portable record references by a stable key. **The first is rejected outright by H-AC-13
(below).** The second is *almost* the answer, with one correction: the portable record does not gain a **new**
reference key at all. A new dedicated join field (e.g. a registry row ID written into the decision) would
itself be exactly the "joinable pseudonym" §5.1 already excludes — a stable value, present in every record it
appears in, that a holder of the machine-local file could use to look up a name; renaming it changes nothing,
per §5.2's own argument about derivatives. Instead, the machine-local file is keyed by two fields the portable
record **already carries for an unrelated, pre-existing purpose** — `authorityClass` and the decision's own
timestamp — so no schema addition, and therefore no new correlator, is needed at all. This is a genuine third
option, not a restatement of the briefing's second one; §15.1.6 states plainly what it costs.

**(d) The H-AC-13 tension, resolved: no conflict**, because no natural-person identifier ever reaches "a
proposed portable ledger entry" — H-AC-13's exact trigger condition (`acceptance.md:214-215`). The identity
registry is not a governance-event payload, is never passed to `appendPortableGovernanceEvent` or
`putRestrictedGovernanceEvent`, and is not reachable from `governance-event.mjs`'s schema list at all
(§15.1.2's file-format marker note exists precisely to prevent that confusion). §5.1's exclusion list and
§5.2's R-1 are therefore unaffected by this amendment: they describe what a *decision* may carry, and
`naturalPersonId` is never an input to one. Stated explicitly, per this briefing's own instruction, rather
than left to be inferred from the registry's location.

#### 15.1.5 (e) Does H-AC-11 need reopening — yes, exact text

H-AC-11 already carries one amendment, dated 2026-08-08, disclosing that GMW's machine-local window/request
record is joinable to the portable record and that increment 1 does not satisfy the "no join handle" clause
for that half (`acceptance.md:188-206`). The mechanism above creates a second, independently-caused join —
role-and-time rather than per-decision-request — and it extends to **both** producers, including HGO, which
the original R-3 (§5.2) found clean of any attribution join. That finding no longer holds once an
identity-registry entry exists for an `authorityClass` HGO also uses. This is a materially new fact about
H-AC-11's second clause, not covered by the existing 2026-08-08 paragraph, which is scoped to GMW. **Proposed
insertion, immediately after that paragraph, same style:**

> **Amendment for the machine-local identity registry (PO, 2026-08-09).** A decision's `authorityClass` and
> timestamps MAY be used, entirely outside the portable schema, to resolve a self-declared natural-person
> identifier held in a machine-local identity-registry record keyed by `authorityClass` and a validity time
> range — never by a decision-level correlator, and never persisted portably
> (`design/gmw-hgo-evidence-intake-into-the-human-ledger.md` §15.1.2). Because the registry key reuses
> `authorityClass` and the decision's own `occurredAtEpochMs` — fields the portable record already exposes for
> their existing purpose under this criterion's own first clause — a local holder of both the portable stream
> and the registry can attribute a decision, from **either** producer, to a natural person by role and time
> window whenever the registry holds exactly one covering entry for that decision's `authorityClass` and
> `occurredAtEpochMs`; where no covering entry exists, resolution yields no identity
> (`resolveNaturalPersonIdentity`'s `unknown` outcome); where more than one entry would cover it instead —
> reachable only if the file was hand-edited around the overlap check, §15.1.2 — resolution yields `ambiguous`
> rather than guessing; and this clause's disclosure reaches only the resolving case, not either non-resolving
> outcome. This clause's "no portable counterpart or join handle" is read, as of this amendment, to forbid a
> correlator manufactured for the purpose of joining — a decision ID, a request digest, a candidate, or any
> value derived from the trust anchor (§5.1) — not the pre-existing `authorityClass` and `occurredAtEpochMs`
> fields the ledger already carries for authority and event time. **This does NOT exempt
> `validity.expiresAtEpochMs`**, which the 2026-08-08 paragraph above already counts as one of the four
> byte-identical fields constituting GMW's proven join violation; that finding is unchanged and unsoftened by
> this amendment. The residual is disclosed, not softened, on the same terms the 2026-08-08
> paragraph above established for GMW's separate residual, and is tracked as O-1 in
> `design/gmw-hgo-evidence-intake-into-the-human-ledger.md` §15.1.6, owner `pipeline` (PHX-2).

This amendment is proposed text only, per this document's own non-scope (§2) and process (§9): applied by the
reviewed rebind, not here. `acceptance.md` is not touched by this dispatch.

#### 15.1.6 The residual, stated plainly

**What holds.** No portable record produced by this path, before or after this amendment, contains a
natural-person identifier, a pseudonym, or any value derived from one (R-1 unchanged). Recovering an identity
requires local possession of a file that never leaves the machine and is never part of any pushed ref.

**What does not hold, and is new.** Before this amendment, HGO's side of R-3 concluded the join reaches no
attribution at all. After it, both producers' decisions are attributable **at role-and-time granularity** by a
local registry holder — coarser than GMW's existing per-decision join (O-4), but strictly more identifying,
since it yields an actual name rather than a key digest. For the single-human-PO shape this repository runs
under today, `authorityClass: "product-owner"` already narrows to one person informally; this amendment makes
that explicit and queryable rather than pretending an anonymity the deployment does not actually have. Whether
that trade is acceptable for a future multi-human PO is not this document's call — it is disclosed, exactly as
O-5 (§14) disclosed a comparable single-human-shaped simplification, for whoever generalizes this later to read
rather than discover.

**Also new, and not currently closed: the registry file itself carries no write protection today.**
`identity-registry.json` lives outside the worktree (§15.1.2), and `gateStrengthRuleFor`
(`guard-gate-strength.mjs:170-178`) resolves every candidate path against the project root, returning no rule
whenever that path lies outside it — GS-family protection is worktree-relative by construction and cannot
reach a machine-local file outside the project directory without guard changes this document does not design
(out of scope here, §15.1.2). No guard today prevents an agent with local write access from editing or
corrupting this file undetected. This is not a weaker claim than the mechanism already makes: §15.1.3(a)
already sets the registry's assurance ceiling at self-asserted, never independently verified, never signed —
an unprotected file is consistent with, not a regression from, that ceiling, since the ceiling never assumed
write protection existed. Tracked as a residual, owner `pipeline` (PHX-2), alongside the role-and-time-
granularity residual above; closing it is follow-up guard-config work outside a design-doc-only dispatch's
scope, not designed further here.

### 15.2 O-2 — closing the synchronous guard-hook gap inside increment 1

#### 15.2.1 What the PO rejected

§8.5.2's original plan ran the dual evaluation at the arming/consumption/status/reconcile boundaries and
deferred the hook-path closure to increment 2 (D-2), leaving H-AC-02 unconditionally unsatisfied at the hook
between those boundaries. The PO rejected the deferral, not the mechanism: §8.5.2 already specified the closure
path (narrowing-only, lock-free) as sound; O-2 asks for it now. Quoted from §8.5.2, and built on rather than
re-derived: the hook-side check "can turn a `covered: true` into `covered: false` and can never produce a lift
by itself, since the proof-verified window record remains a necessary condition... no lock is needed (readers
take none; each event file is published by atomic rename)... no integrity assumption is needed (an agent that
forges or deletes ledger files can only *deny* itself the lift)." Nothing in that reasoning depended on *when*
the check runs, only on it being read-only and narrowing-only — so pulling it into increment 1 changes only the
schedule, not the safety argument, exactly as O-2's decision text frames it.

#### 15.2.2 Corrected finding: which file actually calls `windowCoversRule`

This document's own citation (§8.5.2: "the hooks that call `windowCoversRule`") and this briefing's premise
both point at `hooks/guard-lifecycle-ready.mjs` as the synchronous call site. **That is not what the source
shows.** `guard-lifecycle-ready.mjs` imports only `GATE_STRENGTH_PATHS` (the path *list*) from
`guard-gate-strength.mjs`, for its own shell-command substring check (`gateStrengthShellRefusal`,
`hooks/guard-lifecycle-ready.mjs:299-327`) — and that function's own comment states explicitly that GS-6, the
live-plugin-root rule GMW governs, is **deliberately excluded** from its needle set ("the live plugin root
(GS-6) is NOT a needle here... Shell WRITES into the enforcing plugin root are already refused by
GUARD-CROSS-REPO-MUTATION", `:302-308`). `guard-lifecycle-ready.mjs` never imports or calls `windowCoversRule`,
`currentGuardMaintenanceWindow`, or anything else from `lib/guard-maintenance-window.mjs`.

The two actual call sites, found by tracing every import of `windowCoversRule` in the plugin:

- `plugins/pipeline-core/hooks/guard-testpath.mjs:105` (import), `:217` (call) — the TP-* rule family, wired
  as a PreToolUse deny-guard on `Edit`/`Write` against configured test paths (`guard-testpath.mjs:4`).
- `plugins/pipeline-core/hooks/guard-gate-strength.mjs:63` (import), `:231` (call) — GS-6 only, wired for write
  tools only, matcher `Edit|Write|NotebookEdit` (`guard-gate-strength.mjs:44-45`, corroborated from the calling
  side by `guard-lifecycle-ready.mjs:282`, which is where this document's own §8.5.2 citation was actually
  found while verifying this section).

Both call sites already wrap the call: `try { const { covered, window } = windowCoversRule(...); if (covered)
{...; process.exit(0);} } catch { /* an unusable window is not a lift; the refusal below still stands */ }`
(`guard-testpath.mjs:216-224`, `guard-gate-strength.mjs:228-239`, near-identical). **This existing pattern is
itself the answer to the failure-mode question §15.2.4 asks:** any error already narrows to "not covered"
today, for the window read alone; §15.2.3 extends the same convention to the new ledger read rather than
inventing a different one. Reported as a correction, not a stop condition (this dispatch's own field 5): the
call chain **was** determined, with source-line certainty, and the design below is written against the files
it is actually in.

#### 15.2.3 The mechanism: recompute `ruleDigest`, no change to `lib/guard-maintenance-window.mjs`

**The constraint to preserve.** §11 marks `plugins/pipeline-core/lib/guard-maintenance-window.mjs` "no change
— deliberate: another session owns this file" (§7.1, A-3). O-2 must not force a change there merely to expose
a field the hook happens to need.

**What `windowCoversRule` already returns is enough.** Its `window` result
(`lib/guard-maintenance-window.mjs:547-556`, `windowCoversRule` itself at `:559-566`) already carries
`scopeRuleIds` and `openingTreeSha256` — exactly the two inputs §4's table gives for GMW's `ruleDigest`:
`ruleDigest = canonicalSha256({scopeRuleIds, openingTreeSha256})`. The hook does not need `intent.sha256`,
`decisionId`, or any other value `windowCoversRule` does not already return: it can recompute the *same*
digest the intake wrote into the granting ledger decision at install time, from values the machine-local
record already exposes, and ask the ledger whether a live grant carries that exact digest. **No export from
`lib/guard-maintenance-window.mjs` changes.**

**New function**, alongside the write-side builders §7.1/§11 already specify in the same file:

```text
// plugins/pipeline-core/lib/guard-authority-ledger-intake.mjs
export async function ledgerConfirmsLiveGmwGrant({ rootDir, scopeRuleIds, openingTreeSha256, nowMs = Date.now() }) {
  // never throws -- any failure below, including a rejected read, returns false, the same "not covered"
  // outcome an absent or unusable window already produces (guard-testpath.mjs:224, guard-gate-strength.mjs:239)
  try {
    // repositoryFingerprint: the same derivePoGateRepositoryFingerprint({gitCommonDir, primaryRoot})
    // resolution §7.2's append intent already performs for `rootDir` (po-gate-authority.mjs:212-217,
    // governance-event-store.mjs:81-88) -- not a new resolution problem, the write side already has it
    const repositoryFingerprint = derivePoGateRepositoryFingerprint(topologyFor(rootDir));
    const ruleDigest = canonicalSha256({ scopeRuleIds, openingTreeSha256 });  // same preimage as §4's row
    // async, lock-free read of the human stream (§8.5.2: "readers take none") via the existing reader --
    // queryHumanGovernanceDecisions (human-governance-ledger.mjs:228), awaited here, not reimplemented;
    // see the resolved-assumption note below for why no separate synchronous scan is written
    const { decisions } = await queryHumanGovernanceDecisions({ repositoryRoot: rootDir, repositoryFingerprint });
    // true iff `decisions` contains at least one entry with:
    //   event === "granted", outcome === "granted",
    //   scope.packageId === "guard-maintenance-window", scope.repositoryFingerprint === repositoryFingerprint,
    //   ruleDigest === ruleDigest (above), validity.notBeforeEpochMs <= nowMs <= validity.expiresAtEpochMs,
    //   and no committed disposition (revoked/expired/consumed) whose link points back to it
    return /* at least one such decision exists */;
  } catch { return false; }
}
```

No candidate comparison is performed here, deliberately: §8.5.1 already established that GMW's enforcement is
candidate-independent and that passing the grant's own candidate makes the resolver's candidate check vacuous
for GMW specifically. This function checks liveness, repository binding and rule-scope only — the same three
properties §8.5.1 says the GMW boundary actually enforces — and adds nothing the resolver itself would not
already treat as vacuous.

**The async question, resolved rather than flagged (Critic-round-1 rework on this amendment, verified against
current source).**
`queryHumanGovernanceDecisions` (`human-governance-ledger.mjs:228`) is `export async function`, built on the
also-`async` `queryPortableGovernanceStream`; `governance-event-store.mjs` imports exclusively from
`node:fs/promises` (`:11`) and has no synchronous fs primitive anywhere in the file. There is no synchronous
path into the human stream to fall back to, and none is needed: `ledgerConfirmsLiveGmwGrant` is declared
`async` above and both call sites below `await` it directly, calling the existing reader rather than
reimplementing it — the "parallel ledger mechanism" §2's Non-scope rules out is not needed and is not written.

Two questions had to be settled to make that safe, both checked against this checkout rather than assumed:
whether top-level `await` is available in these two specific hook files, and whether one more awaited read
fits inside the hook's execution budget. Both hooks are ESM (`.mjs`, `import` syntax throughout; `guard-testpath.mjs`'s
call site sits directly at module top level, `guard-gate-strength.mjs`'s sits inside a top-level `if
(process.argv[1] && ...)` block — still top-level module code, not inside any function or generator body,
which is the only context top-level `await` is barred from) on Node 24+ (`SETUP.md:19`), where top-level
`await` needs no wrapping async function and is not novel to this document either:
`hooks/staleness-check.mjs:207-208` already does exactly this at its own top level today —
`if (isDirectInvocation(import.meta.url)) { await run(); }` — inside the same `hooks/` directory this
amendment edits. Empirically confirmed for this exact shape (an `await` inside a top-level `if` block in a
`.mjs` file) rather than taken on the language spec alone. On the budget question: `hooks.json` gives
`guard-testpath.mjs` an explicit 10-second PreToolUse timeout (`hooks/hooks.json:63-65`);
`guard-gate-strength.mjs`'s entry carries no override, so Claude Code's hook default applies. Both budgets
already cover everything the hook does after the window check today — override consumption, denial
recording — which is local disk I/O of the same kind; one more lock-free read of the same on-disk,
atomically-published stream (§8.5.2) does not change that order of magnitude.

**This is what the original wording flagged for the implementor to discover again; it is resolved here
instead:** `ledgerConfirmsLiveGmwGrant` is `async`, both call sites `await` it, and no parallel synchronous
ledger mechanism exists anywhere in this design.

**Call-site change, both narrower than the file they sit in:**

```text
// hooks/guard-testpath.mjs, replacing the body of the existing try block at :216-224
const { covered, window } = windowCoversRule({ rootDir: projectDir, ruleId: matched.id });
if (covered && await ledgerConfirmsLiveGmwGrant({ rootDir: projectDir, scopeRuleIds: window.scopeRuleIds, openingTreeSha256: window.openingTreeSha256 })) {
  process.stderr.write(`[pipeline-guard-maintenance-window] ${matched.id} lifted: ...\n`);
  process.exit(0);
}
// falls through to the existing refusal path exactly as if `covered` had been false
```

The same edit shape applies at `hooks/guard-gate-strength.mjs:231-238` for GS-6, `await`ed the same way; that
call site sits inside the top-level `if (process.argv[1] && ...)` block described above, which is still
top-level module code and not a function body.

#### 15.2.4 Failure mode, specified explicitly

`ledgerConfirmsLiveGmwGrant` never throws (15.2.3's own `catch { return false; }`), and its call site is
additionally inside the *existing* outer `try/catch` both hooks already wrap the window check in — a `try`
block already awaits other calls in this design's own write path, so an awaited call inside it is not a new
pattern. Any failure — corrupted stream, missing directory, a verification failure, a transient I/O error, a
rejected promise from the awaited read — resolves to **`false`**, which the
`if (covered && await ledgerConfirmsLiveGmwGrant(...))` guard turns into exactly
the same refusal path an absent or expired window already produces today. **This can never block a tool call
harder than today's ordinary refusal, and it can never grant one it would not already have granted**: the
window check still runs first and is still required (`covered` must be `true` before the ledger call happens
at all), so the ledger read is purely narrowing, consistent with §8.5's rule stated as one line: "the direction
that reduces agent capability always wins." The added cost is scoped to exactly the case that matters — an
active window claiming a lift — and is zero on every call where no window is active, which is the overwhelming
common case; §8.5.2's "per-call read I/O" concern is therefore bounded to the rare case, not paid on every tool
call as its original phrasing implied.

One honest consequence, stated rather than hidden: a lift that used to succeed on the machine-local window
record alone now **also** requires the ledger to confirm it, so an unreadable ledger denies a lift the window
record alone would have granted. That is the intended effect of closing H-AC-02 at the hook, not a side effect
of it — the same fail-closed direction §8.1 already chose for the arming boundary, applied here for the first
time to the read path.

#### 15.2.5 What this removes from increment 2, and what remains

D-2 (§2, "synchronous dual-evaluation inside the guard hot path") is **fully closed** by §15.2.3 — nothing
partial is left over. §8.5.2's "the hooks that call `windowCoversRule` appear in §9's amendment rather than in
§11's increment-1 inventory" no longer applies: they are named and specified above, as part of increment 1.
§14's O-2 entry ("known non-conformance... owner `pipeline`... no date") is resolved: H-AC-02
(`acceptance.md:143-144`) is satisfied at the hook as of this amendment, not only at the arming/consumption/
status/reconcile boundaries. H-AC-12's migration clause and its expiry (§9) are untouched — that amendment
bounds a different clause and was never O-2's subject. D-1 (the restricted attribution store, §5.4) is **not**
affected by this section; it remains increment 2, and §15.1 does not depend on it (§15.1.2 explicitly avoids
the kernel path D-1 would need).

### 15.3 §11 implementation inventory — delta only

The rows below are additions to, or modifications of, §11's table; §11 itself is not rewritten.

| File | Change | Rationale |
| --- | --- | --- |
| `plugins/pipeline-core/lib/guard-authority-ledger-intake.mjs` | **extend** the create already specified in §11: add `ledgerConfirmsLiveGmwGrant` (§15.2.3) alongside the write-side builders. Same file, one more export. | keeps every ledger-reading and ledger-writing entry point for this design in one module, per §7.1's own reasoning |
| `plugins/pipeline-core/scripts/guard-authority-ledger-intake.test.mjs` | **extend** the create already specified in §11: integration tests for the narrowing read (ledger confirms → lift proceeds; ledger silent/absent/corrupted → lift denied exactly like an absent window; a disposed grant → denied) | moves an O-2 non-conformance out of "no test exists for it" the same day it moves out of "not implemented" |
| `plugins/pipeline-core/hooks/guard-testpath.mjs` | **modify**: call `ledgerConfirmsLiveGmwGrant` after `windowCoversRule` returns `covered: true` (§15.2.3) | closes H-AC-02 at the TP-* hook path (§15.2.2 identifies this as an actual call site; the original §11 named no hook file at all for increment 1) |
| `plugins/pipeline-core/hooks/guard-gate-strength.mjs` | **modify**: same change, GS-6 only (§15.2.3) | closes H-AC-02 at the GS-6 hook path |
| `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` | **no change** | §15.2.2's correction: this file does not call `windowCoversRule` and has no role in O-2's closure |
| `plugins/pipeline-core/lib/guard-maintenance-window.mjs` | **no change** (§11's existing row stands) | §15.2.3's design deliberately avoids needing any export this file does not already have |
| `plugins/pipeline-core/lib/human-governance-identity-registry.mjs` | **create** — `validateIdentityRegistryEntry`, `validateIdentityRegistry`, `resolveNaturalPersonIdentity` (§15.1.2) | O-1's mechanism; no kernel file changes because of it |
| `plugins/pipeline-core/lib/human-governance-identity-registry.test.mjs` | **create** — unit tests: shape validation, overlap rejection, resolved/unknown/ambiguous lookup outcomes | same H-AC-15-style discipline §12 already applies to the write-side builders |
| `plugins/pipeline-core/scripts/governance-authority.mjs` | **extend** the modification already specified in §11: add `resolve-identity --authority-class <class> --occurred-at-ms <n>` (§15.1.2) | one read-only query surface, reusing the file §11 already touches for `reconcile` rather than adding a new script |

### 15.4 §14 disposition

- **O-1 — mechanism resolved; completion gated by AC-14, unlike O-2.** Mechanism specified in §15.1; the
  identity registry requires no kernel change and can ship independently of D-1/increment 2. The residual it
  creates (both producers now attributable at role-and-time granularity by a local registry holder) is
  disclosed in §15.1.6, on the same terms O-4 already established, and does not soften O-4 itself. The
  H-AC-11 amendment text is proposed in §15.1.5 and applied by the reviewed rebind, not here — and, unlike
  O-2, that step has not yet happened as of this document: §13 AC-14 is this document's own gate against
  declaring the mechanism complete before it does.
- **O-2 — resolved.** Mechanism specified in §15.2; D-2 is fully closed and pulled into increment 1 (§15.2.5,
  §15.3). H-AC-02 is satisfied at the guard hook as of this amendment; no non-conformance remains open for it.
- **O-3, O-4, O-5 — unchanged.** Not reopened by this section.
