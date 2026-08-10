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
  remaining residual does **not** satisfy. **Superseded by §15.2 (PO-decided
  2026-08-09).** D-2 is closed as of increment 1: §15.2.3 adds a narrowing-only
  ledger read at the two hooks that call `windowCoversRule`
  (`guard-testpath.mjs`, `guard-gate-strength.mjs`), and §15.3 moves both files
  into the increment-1 inventory. Retained here, quoted rather than deleted, so a
  reader consulting this deferral list in isolation is told the same thing §15
  already decided, not the opposite.
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

**Superseded by §15.2 (PO-decided 2026-08-09).** D-2 is closed as of increment 1: §15.2.3 adds the
narrowing-only ledger read this section's "closure path" paragraph below describes directly to the two hooks
that call `windowCoversRule` (`guard-testpath.mjs`, `guard-gate-strength.mjs`), and it ships as part of
increment 1, not increment 2. The paragraphs immediately below (through "It satisfies it at every boundary that
grants or consumes") describe the **original, now-superseded** position — retained, quoted rather than
deleted, so a reader consulting this section in isolation is told the same thing §15 already decided, not the
opposite; §15.2.5 also retracts the "appear in §9's amendment rather than in §11's increment-1 inventory"
clause in the paragraph after them, by name.

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

**Note (superseded in part by §15.2/§15.3, PO-decided 2026-08-09).** The table above reflects this document's
original increment-1 scope, in which the guard-hook closure of D-2 (§8.5.2) was deferred to increment 2 and
named no hook file. That deferral no longer holds: §15.2 closes D-2 inside increment 1, and §15.3's delta table
adds `plugins/pipeline-core/hooks/guard-testpath.mjs` and `plugins/pipeline-core/hooks/guard-gate-strength.mjs`
as **modify** rows, alongside the identity-registry rows for O-1. Retained here rather than rewritten, per
§15.3's own note that "§11 itself is not rewritten" — see §15.3 for the current, complete delta.

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
no guard protects this file today — but the reason is registration, not structural reach.**
`identity-registry.json` lives outside the worktree in the git sense (never tracked, never committed, above);
`gateStrengthRuleFor` (`guard-gate-strength.mjs:170-178`) resolves every candidate path against the project
root and returns no rule only when the resolved path lies **outside the project directory itself**
(`rel.startsWith('..' + sep)`). In a standard, non-linked checkout — this repository's own topology —
`git rev-parse --git-common-dir` resolves to `.git`, which sits **inside** the project root;
`.git/agent-pipeline/human-governance-identity/identity-registry.json` is a path that exclusion check does not
fire on at all. The function falls through to its allowlist lookup and returns `null` only because no
`GATE_STRENGTH_PATHS` entry names this path yet — the same mechanism that already protects
`project/critical-human-proof.json` (GS-2) would reach it with one more entry, a real, cheap, available
mitigation for the common case. (A linked-worktree topology can differ: there `<git-common-dir>` resolves into
the *primary* checkout, a sibling tree outside the linked worktree's own project root, and the exclusion check
genuinely fires — but that is not this repository's standard checkout and does not generalize to it.)
Populating **and** protecting this file are therefore both currently unenforced, manual, PO-side acts —
protecting it needs one `GATE_STRENGTH_PATHS` entry, out of this design-doc-only dispatch's scope, not a
structural impossibility. Disclosed as a residual, not designed around here — §15.1.6.

**Loading the registry from disk, and the absent-file case.** `human-governance-identity-registry.mjs` (§15.3)
exports `loadIdentityRegistry({ rootDir })`: it resolves `<git-common-dir>` via
`discoverRepository(rootDir).commonDir` (`worktree-lifecycle.mjs:235-253`) — the same resolution the write side
already performs for the portable stream (`governance-event-store.mjs:81-88`, and §15.2.3's
`ledgerConfirmsLiveGmwGrant` reuses it too) — then reads
`<commonDir>/agent-pipeline/human-governance-identity/identity-registry.json`. **When the file does not
exist — the default state on every machine, since populating it is a manual, PO-side act (above) —
`loadIdentityRegistry` returns an empty registry (`{schema: "pipeline.human-governance-identity-registry.v1",
entries: []}`), not an error.** This is a deliberate fold, not an omission: an absent file and a
present-but-empty one are behaviourally identical inputs to `resolveNaturalPersonIdentity` — both produce zero
matching entries for any `authorityClass` — so `resolveNaturalPersonIdentity` returns its existing
`{status: "unknown"}` outcome (above) for the absent-registry case, rather than gaining a fourth, distinct
status. A fourth outcome would ripple through every consumer of the closed three-value set this section already
establishes (the CLI branch, the reviewer-facing lookup contract, §13 AC-14's rebind text) for no behavioural
gain, since `unknown` already means exactly "no registered holder resolves this decision" — the absent-file
case is one instance of that, not a different question. A malformed-but-present file (one that fails
`validateIdentityRegistry`) is a distinct case from either: `resolve-identity` fails closed with
`GAC-IDENTITY-REGISTRY`, the same fail-closed-on-malformed-input posture `parse(argv)`'s other branches already
use, rather than being silently treated as absent or empty.

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

#### 15.1.6 The residuals of §15, stated plainly

This subsection is the residual register for the **whole** of §15, not for §15.1 alone. It sits under §15.1
because that is where it started and because §15.2.4 already points here by name; the first **two** entries below
belong to O-1's identity registry, the last **four** — (i) to (iv) — to O-2's hook-path closure. (An earlier
revision of this sentence read "the first three… the last two", which matched neither the entries then present
nor the ones now: it is corrected here, and §15.4's O-2 bullet is corrected to the same count.) Keeping one
register is deliberate: a reader asking "what did §15 leave open" must not have to find two lists. **Every entry
in the O-2 block ((i)-(iv)) carries an owner and an explicit `Trigger:` clause** — a disclosed residual with an
owner but no exit condition is the "documented instead of fixed" state QG-06 names as a finding rather than a
mitigation. The two O-1 entries above state their exits in prose and are left in that form here; promoting them
to the same labelled shape is named as a follow-up rather than done silently in a dispatch scoped to the O-2
block.

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
`identity-registry.json` lives outside the worktree in the git sense (§15.1.2), but in this repository's
standard, non-linked checkout topology `<git-common-dir>` resolves to `.git`, inside the project root —
`gateStrengthRuleFor` (`guard-gate-strength.mjs:170-178`) does not structurally exclude this path; it is simply
unregistered in `GATE_STRENGTH_PATHS` today (§15.1.2 corrects the structural-impossibility framing this
paragraph originally carried). No guard today prevents an agent with local write access from editing or
corrupting this file undetected — not because the mechanism cannot reach it, but because nobody has added the
one-entry registration yet. This is not a weaker claim than the mechanism already makes: §15.1.3(a)
already sets the registry's assurance ceiling at self-asserted, never independently verified, never signed —
an unprotected file is consistent with, not a regression from, that ceiling, since the ceiling never assumed
write protection existed. Tracked as a residual, owner `pipeline` (PHX-2), alongside the role-and-time-
granularity residual above; adding the `GATE_STRENGTH_PATHS` entry is follow-up guard-config work outside a
design-doc-only dispatch's scope, not designed further here — but it is available and cheap, not blocked on
any further design.

**From O-2's hook-path closure (§15.2), recorded here because §15.2.4 says they are, and until this revision
they were not.**

**(i) The hook's ledger read is checkpoint-less, and so is every other read this design specifies.** Without a
`checkpoint`, `verifyPortableGovernanceStream` reports `completeness: "unknown"` unconditionally, so the read
proves that the *retained* stream is a contiguous hash chain and cannot prove that it is *complete*. An agent
with local write access to the human stream's storage root can delete a disposition file and make a disposed
grant continue to read as live — at the hook, and equally at §7.4's install readback and §7.5's reconcile,
neither of which this document specifies to retain or pass a checkpoint either. §15.2.4 states the mechanics;
this entry is the tracking. Owner `pipeline` (PHX-2). **Trigger:** resolved when any read on this path passes a
retained `checkpoint`, so that `verifyPortableGovernanceStream` can report completeness rather than
`"unknown"` — reached by either of the two available exits, whichever is opened first: a producer retains a
ledger sequence it can witness later (for GMW that means changing `lib/guard-maintenance-window.mjs`, the file
§7.1/A-3/§11 hold at "no change"), or the boundaries that *can* retain one do so, which is a change to
§7.4/§7.5 that this amendment did not open. Neither exit is chosen here and no calendar date is set, because
the choice belongs to whichever of those two changes is opened first; what the trigger fixes is the condition
under which this entry may be closed, not the date. What must not happen is the third option an earlier
revision took by accident: declaring the closure complete and leaving the disclosure three paragraphs upstream
to contradict it.

**(ii) The grant memo is forgeable and unwitnessed, bounded by its TTL.** §15.2.3a's memo lives under
`tmpdir()`, is not signed or MAC'd (deliberately, §15.2.3a), and an agent with local write access can forge
one. Forging it cannot create the PO-signed window record that remains the necessary condition, so it grants
nothing new; what it does is suppress the ledger half of the intersection for at most
`GMW_LEDGER_MEMO_TTL_MS` (60 s) — a strictly weaker, time-bounded instance of (i), which is unbounded. The one
genuine delta over (i) is visibility: the stream is a worktree path where a tampered event is in principle
reviewable, while the memo is not. A `<git-common-dir>` location plus one `GATE_STRENGTH_PATHS` entry would
narrow the delta and was rejected on cost, with the reasoning in §15.2.3a rather than left implicit. Owner
`pipeline` (PHX-2). **Trigger:** resolved if and when `<git-common-dir>` resolution becomes available to this
path without paying its own git subprocesses — the reason for the rejection, §15.2.3a — whether by a reusable
production export replacing the test-only `guardMaintenanceWindowInternals.topology`
(`guard-maintenance-window.mjs:578`) or by the two-subprocess cost being judged acceptable on reassessment;
at that point the memo moves beside the window record and gains its `GATE_STRENGTH_PATHS` entry. Reassessed
whenever either the memo's location or `topology`'s export status changes; until one of those happens the entry
stands, bounded by `GMW_LEDGER_MEMO_TTL_MS`.

**(iii) A miss still contains six git spawns with no per-spawn timeout.** `runGit` forwards a timeout only when
its caller passes one (`worktree-lifecycle.mjs:110-122`) and the store's `assertPhysicalRoot` passes none, while
GMW's own `git()` caps its two spawns at 5 s (`guard-maintenance-window.mjs:193`). `spawnSync` blocks the event
loop, so nothing in this design can interrupt a hung `git` from outside. The memo bounds how often that path
runs, not how long one invocation of it can take; B-1 pins the count. The fix is one argument at the store's own
`discoverRepository` call — outside this dispatch's scope, per §2's non-scope list, which holds
`governance-event-store.mjs` and the rest of the ledger's internals out of this design — hence recorded rather
than applied. Owner `pipeline` (PHX-2). **Trigger:** resolved when the store's `assertPhysicalRoot` →
`discoverRepository` call passes a `timeout` to `runGit`, giving every spawn on this path the per-spawn bound
GMW's own `git()` already has (`guard-maintenance-window.mjs:193`); that is a one-argument change in
`governance-event-store.mjs`, and it belongs to whichever dispatch next holds that file in scope.

**(iv) The module that hosts the new narrowing check is not a never-liftable kernel path, so one edit under any
maintenance window removes the check permanently.** `plugins/pipeline-core/lib/guard-authority-ledger-intake.mjs`
— the module §11/§15.3 specify to host `ledgerConfirmsLiveGmwGrant`, `readGrantMemo` and `writeGrantMemo` — is
**not** a member of `NEVER_LIFTABLE_KERNEL_PATHS` (`guard-maintenance-window.mjs:120-128`), and nothing in this
document as previously written would ever have made it one. It sits inside the live plugin root, so
`guard-gate-strength.mjs` matches it as `LIVE_PLUGIN_RULE` (`:199-208`), finds it is not a kernel path, and
admits the `Edit`/`Write` under any active, correctly-scoped, unexpired GS-6 window (`:227-240`) — a window
legitimately armed for some entirely unrelated purpose. One line inside `ledgerConfirmsLiveGmwGrant` (an
unconditional `return true;` ahead of the read) removes O-2's narrowing from **both** call sites at once, and
**that effect outlives the window**: closing or expiring the window restores GS-6's refusal, but nothing
restores a deleted check. This is why it is a separate entry rather than a variant of (i): every other residual
here is either TTL-bounded ((ii)) or needs the adversary to keep tampering with state that the next read
re-examines ((i), (iii)), whereas this one is a single edit with an unbounded, self-sustaining effect. The
standard it fails is this document's own, quoted from §6's rejection of Option B: moving a capability-bearing
record into the agent's write surface forces "the guards that protect it ... to protect the very record that
lifts them — the recursive hole the never-liftable kernel list (`:120-128`) exists to close. Under an agent
adversary this is the decisive argument." Once §15.2.3 makes `ledgerConfirmsLiveGmwGrant`'s return value a term
of the lift condition, the code computing it is exactly such a capability-bearing artifact.

*The fix, stated exactly.* One new entry in the `NEVER_LIFTABLE_KERNEL_PATHS` array at
`plugins/pipeline-core/lib/guard-maintenance-window.mjs:120-128`:

```js
"plugins/pipeline-core/lib/guard-authority-ledger-intake.mjs",
```

That is the whole change — the same repository-relative, forward-slashed, `plugins/pipeline-core/`-prefixed
string shape as the six plugin-root entries already in the array, so it is derived unchanged into
`PLUGIN_KERNEL_SUFFIXES` (`:139-141`) and checked against **both** the project-root and live-plugin-root anchors
the comment at `:130-138` describes, which is the layout case that comment exists for. No new list, no new
predicate, no change to `isNeverLiftableKernelPath`'s logic, no change to any caller.

*Why it is proposed here and applied elsewhere.* `lib/guard-maintenance-window.mjs` is held at "no change" by
§7.1/A-3/§11 ("deliberate: another session owns this file"), and §15.3's row for it says exactly that. This
entry therefore follows the deferred-application path §9 already uses for the H-AC-11/H-AC-12 amendment text —
specified precisely, reviewed together with this design, then applied by the dispatch that owns the file, **not**
edited in-session. §15.3 carries it as a required companion change to the `guard-authority-ledger-intake.mjs`
row so that the module cannot ship without it.

Owner `pipeline` (PHX-2). **Trigger:** resolved when the entry above is present in
`NEVER_LIFTABLE_KERNEL_PATHS`. Unlike (i)-(iii), this residual has a definite, cheap exit and no open design
question behind it; it is open only for as long as this document does not edit the file holding the list.

*What the one entry does and does not close, stated rather than assumed.* It closes the hole **this design
itself opens**: a newly created module that becomes a term of the lift condition while remaining GS-6-liftable.
It does not by itself make O-2's narrowing unremovable, because the second call site,
`plugins/pipeline-core/hooks/guard-testpath.mjs` (§15.2.2, §15.3), is likewise not a
`NEVER_LIFTABLE_KERNEL_PATHS` member, while the first, `hooks/guard-gate-strength.mjs`, already is (`:121`).
Under the same window an edit there removes the ledger call — or the entire TP-* refusal — just as permanently.
That exposure is **inherited, not created here**: it predates O-2 entirely and is a property of which hook files
the kernel list names, not of anything §15 adds. Whether `guard-testpath.mjs` should join the list is a real
decision with a real cost (a kernel entry makes the file uneditable under *any* window, exactly as
`guard-gate-strength.mjs` is today), and it is deliberately **not decided here** — it is named so that the
one-entry fix above is read as closing what this design opened, rather than as a claim that O-2's narrowing has
become unremovable.

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

The dispatch briefing for this amendment named `hooks/guard-lifecycle-ready.mjs` as the synchronous call site.
**That is not what the source shows** — and, on re-reading, it is not what this document said either. §8.5.2
cites `windowCoversRule` in `lib/guard-maintenance-window.mjs:559-566` and speaks of "the hooks that call" it
without enumerating any, which is exactly what §11's own superseded note records: the D-2 deferral "named no
hook file". An earlier revision of this subsection attributed the wrong premise to §8.5.2, a section that does
not contain it; the misattribution is corrected here, and the finding below is unchanged, because it never
rested on that attribution. `guard-lifecycle-ready.mjs` imports only `GATE_STRENGTH_PATHS` (the path *list*) from
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
  tools only, matcher `Edit|Write|NotebookEdit` (`guard-gate-strength.mjs:44-45`), registered at
  `hooks/hooks.json:39`, whose hook object carries no `timeout` key — unlike `guard-testpath.mjs`'s
  (`hooks/hooks.json:61-65`). Both facts are used again in §15.2.3a.

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
export const GMW_LEDGER_MEMO_TTL_MS = 60_000;   // pinned module constant, exported for budget test B-1

export async function ledgerConfirmsLiveGmwGrant({
  rootDir, scopeRuleIds, openingTreeSha256, windowExpiresAtMs,
  nowMs = Date.now(),
  queryDecisions = queryHumanGovernanceDecisions,   // injected default, the `spawn = spawnSync` convention
} = {}) {                                           // guard-maintenance-window.mjs:336/:383/:485/:559 already uses
  // never throws -- any failure below, including a rejected read, returns false, the same "not covered"
  // outcome an absent or unusable window already produces (guard-testpath.mjs:224, guard-gate-strength.mjs:239)
  try {
    const ruleDigest = canonicalSha256({ scopeRuleIds, openingTreeSha256 });  // same preimage as §4's row
    // O(1), no subprocess, no event file opened. A miss is anything but a fully valid memo (§15.2.3a).
    const memo = readGrantMemo({ rootDir, ruleDigest, windowExpiresAtMs, nowMs });
    if (memo.status === "hit") return memo.confirmed;   // includes the negative memo; see §15.2.3a
    // --- miss: the full read, priced in §15.2.3a and bounded in frequency by the memo above ---
    // repositoryFingerprint is READ from the registry the store is about to validate anyway, not re-derived
    // by a fourth `discoverRepository` call (§15.2.3a, R1): `verifyPortableGovernanceStream` re-derives the
    // physical fingerprint itself and fails GES-CROSS-REPOSITORY unless the caller's value AND the registry's
    // both equal it, so a wrong, stale or forged value can only deny.
    const repositoryFingerprint = readRegistryRepositoryFingerprint(rootDir);
    // async, lock-free read of the human stream (§8.5.2: "readers take none") via the existing reader --
    // queryHumanGovernanceDecisions (human-governance-ledger.mjs:228), awaited here, not reimplemented;
    // see the resolved-assumption note below for why no separate synchronous scan is written.
    // No `checkpoint` is passed -- deliberately; see the completeness/integrity disclosure in §15.2.4.
    const { decisions } = await queryDecisions({ repositoryRoot: rootDir, repositoryFingerprint });
    const grant = /* the first entry of `decisions` with:
         event === "granted", outcome === "granted",
         scope.packageId === "guard-maintenance-window", scope.repositoryFingerprint === repositoryFingerprint,
         ruleDigest === ruleDigest (above), validity.notBeforeEpochMs <= nowMs <= validity.expiresAtEpochMs,
         and no committed disposition (revoked/expired/consumed) whose link points back to it */;
    writeGrantMemo({ rootDir, ruleDigest, grant, windowExpiresAtMs, nowMs });   // best effort; failure ignored
    return grant !== undefined;
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
`.mjs` file) rather than taken on the language spec alone. **The budget question is answered in §15.2.3a, and
the answer an earlier revision of this paragraph gave — "one more lock-free read ... does not change that
order of magnitude" — was false and is withdrawn there rather than softened.**

**This is what the original wording flagged for the implementor to discover again; it is resolved here
instead:** `ledgerConfirmsLiveGmwGrant` is `async`, both call sites `await` it, and no parallel synchronous
ledger mechanism exists anywhere in this design.

**Call-site change, both narrower than the file they sit in:**

```text
// hooks/guard-testpath.mjs, replacing the body of the existing try block at :216-224
const { covered, window } = windowCoversRule({ rootDir: projectDir, ruleId: matched.id });
if (covered && await ledgerConfirmsLiveGmwGrant({ rootDir: projectDir, scopeRuleIds: window.scopeRuleIds, openingTreeSha256: window.openingTreeSha256, windowExpiresAtMs: window.expiresAtMs })) {
  process.stderr.write(`[pipeline-guard-maintenance-window] ${matched.id} lifted: ...\n`);
  process.exit(0);
}
// falls through to the existing refusal path exactly as if `covered` had been false
```

The same edit shape applies at `hooks/guard-gate-strength.mjs:231-238` for GS-6, `await`ed the same way; that
call site sits inside the top-level `if (process.argv[1] && ...)` block described above, which is still
top-level module code and not a function body.

#### 15.2.3a The execution budget: the true cost, traced, and the memo that bounds it

**The claim this subsection replaces.** An earlier revision of §15.2.3 settled the budget question with *"one
more lock-free read of the same on-disk, atomically-published stream (§8.5.2) does not change that order of
magnitude."* **That claim was false.** It was inferred from the word "read" rather than traced, and it is
withdrawn here rather than softened. What follows prices the call chain against the real modules and specifies
the mechanism that makes the PO's 2026-08-09 decision affordable. The decision itself is untouched: the ledger
read stays in increment 1, at the hook, exactly as §15.2 places it.

*(Line numbers into `plugins/pipeline-core/lib/governance-event-store.mjs` are deliberately omitted in this
subsection and in §15.2.4, and symbol names used instead. That file is under concurrent modification in this
checkout — its line numbers moved between two reads taken minutes apart while this section was written — and
this document's older citations into it have already drifted: §3.1's `:629` for `appendPortableGovernanceEvent`
no longer resolves to it. Every other file is cited by line as usual.)*

**What one uncached call actually costs**, per hook invocation that reaches the ledger step — i.e. per tool
call in which `windowCoversRule` has already returned `covered: true`:

| Step | Git subprocesses | Full stream scans |
| --- | --- | --- |
| `windowCoversRule` → `currentGuardMaintenanceWindow` → `topology` (`guard-maintenance-window.mjs:559`, `:485`, `:202-210`) — **paid today, unchanged** | **2** (`rev-parse --show-toplevel` `:204`, `rev-parse --path-format=absolute --git-common-dir` `:206`), each capped at 5 s (`:193`) | 0 |
| `discoverRepository(rootDir)` in the *original* `ledgerConfirmsLiveGmwGrant` body, only to derive `repositoryFingerprint` | **3** (`worktree-lifecycle.mjs:237`, `:241`, `:250`) | 0 |
| `queryHumanGovernanceDecisions` → `queryPortableGovernanceStream` → `verifyPortableGovernanceStream` → `assertPhysicalRoot` → `discoverRepository` | **3** | 0 |
| the same `verifyPortableGovernanceStream` → `loadRegistry` + `scanStream` | 0 | **1** |
| then `queryPortableGovernanceStream`'s **own** `assertPhysicalRoot` → `discoverRepository`, on the next line | **3** | 0 |
| then its own `loadRegistry` + `scanStream`, repeating verbatim what `verifyPortableGovernanceStream` just did | 0 | **1** |
| **added by §15.2.3 as originally written** | **9** | **2** |
| **total in the hook step, including today's window check** | **11** | **2** |

A "full stream scan" is not a file read. `scanStream` lists the human stream's directory and, for **every**
retained event file, performs a read, a strict-JSON parse, envelope validation and a path/envelope binding
check; it then sorts the result and re-verifies the **entire** hash chain, failing `GES-CHAIN` on any gap. That
is O(n) in the number of retained human-governance decisions, twice per call, and the human stream is
append-only (H-AC-06), so n only ever grows. Nothing in this path passes a `checkpoint` (§15.2.4), so nothing
bounds the scan to a suffix.

Two properties of that cost matter more than its size:

- **It is unbounded per spawn.** GMW's own `git()` caps each of its two spawns at 5 s
  (`guard-maintenance-window.mjs:193`). `runGit` forwards a timeout only when its caller passes one
  (`worktree-lifecycle.mjs:110-122`), and neither `assertPhysicalRoot` nor the original
  `ledgerConfirmsLiveGmwGrant` passes one. `spawnSync` blocks the event loop, so no `await`, `Promise.race` or
  `AbortSignal` wrapped around the awaited read can interrupt a hung `git`. The budget being consumed is the
  runner's, not the hook's: `guard-testpath.mjs` declares `"timeout": 10` (seconds) at `hooks/hooks.json:61-65`
  and that limit is enforced by the hook runner which spawns the process, not by any code inside
  `guard-testpath.mjs`; `guard-gate-strength.mjs`'s entry (`hooks/hooks.json:39`) declares no timeout at all
  and inherits the runner's default. Today's two window-check spawns are bounded at 5 s each, i.e. already at
  that ceiling in the worst case; the nine added ones are bounded by nothing.
- **It is paid per tool call, not per window.** A maintenance window exists precisely so that guarded paths can
  be edited, so its natural shape is a burst of dozens of `Edit`/`Write` calls over a few minutes, every one of
  them matching the same rule and paying the full price again. §15.2.4's observation that the cost is zero on
  every call where no window is active is correct and unchanged — it describes the case that was never the
  problem.

**R1 — the fourth `discoverRepository` call is removed.** `ledgerConfirmsLiveGmwGrant` no longer derives
`repositoryFingerprint` itself; `readRegistryRepositoryFingerprint(rootDir)` (a new helper in the same module)
reads it out of `governance/events/registry.json`, one small worktree file. This adds no trust:
`verifyPortableGovernanceStream` re-derives the *physical* fingerprint through `assertPhysicalRoot` and fails
`GES-CROSS-REPOSITORY` unless the caller's value **and** the registry's own value both equal it, so the
caller-supplied term is an assertion target and never an authority. A wrong, stale or forged value can only
make the read fail, which `ledgerConfirmsLiveGmwGrant`'s `catch` turns into `false` — the safe direction. This
removes the only spawns this design was itself responsible for: 3 of the 9, on every uncached call.

The remaining 6 spawns and 2 scans are the store's own shape, and §2's non-scope keeps the ledger's internals
out of this design. They are therefore priced, memoized, and pinned by B-1 (§15.2.3b) rather than restructured
here, so that a later store-side de-duplication — one `queryPortableGovernanceStream` that does not repeat
`assertPhysicalRoot`/`loadRegistry`/`scanStream` immediately after `verifyPortableGovernanceStream` performed
them — shows up as a falling number in a test rather than as an unnoticed one. That is a named, optional
follow-up, not a precondition of this amendment.

**The memo.** Three new exports in `plugins/pipeline-core/lib/guard-authority-ledger-intake.mjs` —
`readGrantMemo`, `writeGrantMemo`, `GMW_LEDGER_MEMO_TTL_MS` — plus `readRegistryRepositoryFingerprint` above.

- **Where.** `<tmpdir>/agent-pipeline-gmw-grant-memo/<sha256({schema, rootDir})>.json`, directory `0700`, file
  `0600`, published by write-temporary-then-`rename` so a concurrent reader never observes a torn file. **No
  new primitive is invented**: `plugins/pipeline-core/lib/native-hook-failure-memory.mjs` is the same shape for
  the same reason — a machine-local, TTL-bounded, hook-written performance memory under `tmpdir()`, keyed by a
  digest of its inputs, mode `0600`, whose own header states the governing doctrine ("deliberately not
  authority state ... a missing, forged, or expired entry can only cause another fail-closed observation",
  `:3-11`, `:17-20`, `:28-31`, `:43-53`) — and the atomic-publish idiom is GMW's own `writeAtomic`
  (`guard-maintenance-window.mjs:247-256`).
- **What it holds, exactly.** `{schema: "pipeline.gmw-grant-memo.v1", rootDir` (realpath)`, ruleDigest,
  confirmed` (boolean)`, grantNotBeforeEpochMs, grantExpiresAtEpochMs, observedAtEpochMs, streamToken}`.
  **Eight keys, and exactly eight for both polarities.** A negative memo (`confirmed: false`) describes the case
  where no live grant exists, so there are no grant bounds to record: `grantNotBeforeEpochMs` and
  `grantExpiresAtEpochMs` are then **`null` — present with the value `null`, never absent, never `0`, never
  omitted**. This is specified rather than left to the implementer because the two obvious alternatives both
  break the mechanism silently: omitting the keys makes every negative memo fail condition (1)'s closed-shape
  check and therefore turn into an automatic miss, deleting negative memoization entirely while the prose below
  still claims it; writing `0` makes a negative memo look like a positive one with an absurd validity range.
  The positive memo carries the same eight keys with both bounds as finite integers.
  Deliberately **not** held: the window's `reason` — free text that `currentGuardMaintenanceWindow` does return
  to its caller (`:549`) — the proof, the decision, the decision id, or any event payload. The memo is a
  validity envelope, not a copy of the ledger; §5.1's exclusion list is honoured in a file that is not portable
  anyway, and the memo therefore carries nothing that would have to be redacted if it ever were.
- **`streamToken`.** `sha256({registryMtimeMs, registrySize, streamDirMtimeMs, sortedEventFileNames})` over
  `governance/events/registry.json` and the human stream's own directory: one `stat`, one `stat` and one
  `readdir`. No event file is opened, nothing is parsed, and no event's bytes are digested. Every append
  publishes a new event file into that directory by atomic rename, so any appended disposition changes both the
  directory mtime and the name set; any deletion changes the name set; a registry repointed at another storage
  root changes the registry's `stat`.
- **When a memo may be served — all six, or it is a miss.** (1) it parses and passes an exact closed-shape
  check: **all eight** keys above present, no ninth key, each with its declared type — `schema` the exact
  literal, `rootDir`/`ruleDigest`/`streamToken` non-empty strings, `confirmed` a boolean, `observedAtEpochMs` a
  finite integer, and `grantNotBeforeEpochMs`/`grantExpiresAtEpochMs` **either both finite integers or both
  `null`**, with `null` admitted for exactly these two keys and required to agree with `confirmed` (both `null`
  iff `confirmed === false`, both integers iff `confirmed === true`). The check is identical for positive and
  negative memos — same key set, same closed-shape rejection of extras — so a negative memo passes (1) on its
  own terms rather than by exception; (2) `rootDir` equals `realpathSync(projectDir)`; (3) `ruleDigest` equals the digest recomputed from the
  **live** window record this same call just read; (4) `0 <= nowMs - observedAtEpochMs <=
  GMW_LEDGER_MEMO_TTL_MS`, so a future-dated memo is a miss; (5) `streamToken` equals the token computed now;
  (6) for `confirmed: true` only, `grantNotBeforeEpochMs <= nowMs <= min(grantExpiresAtEpochMs,
  windowExpiresAtMs)`. Anything else — absent file, unreadable file, parse failure, any mismatch — is a
  **miss**, and a miss performs the full read. **No miss ever yields `true` by itself.**
- **`GMW_LEDGER_MEMO_TTL_MS = 60_000`.** A pinned module constant in the style of `MAX_WINDOW_TTL_MS`, not a
  configuration knob: it is a safety bound, and a bound that an agent-writable configuration file could widen
  would not be one.
- **Negative memoization is included, deliberately.** A `confirmed: false` memo is served under (1)-(5) as
  well. Serving a stale `false` can only refuse a lift, which is the direction §8.1 and §8.5 already choose
  ("the direction that reduces agent capability always wins"), and without it the case "window armed, ledger
  silent" — an agent already being refused — would pay the full 6-spawn/2-scan price on every tool call.

**Why this cache cannot be wrong in the unsafe direction.** The unsafe direction is precisely one thing:
answering `true` when a fresh read would answer `false`. Every way a live grant stops being live is enumerated,
with what catches it:

| How a live grant stops being live | Caught by |
| --- | --- |
| the grant's own validity elapses | condition (6), re-evaluated against `nowMs` on **every** hit; no I/O, so it cannot itself go stale |
| the window is closed (`close` unlinks `window.json`, `guard-maintenance-window.mjs:574`) | not the memo's problem: `windowCoversRule` runs **first, uncached, on every call**, and `covered: false` short-circuits before the memo is read at all |
| the window expires | same — `currentGuardMaintenanceWindow` re-derives `active` from the signed bound on every call (`:542-545`) |
| a `revoked`/`expired`/`consumed` disposition is appended | condition (5): the append publishes a new file into the stream directory, changing both the directory mtime and the name set |
| an event file is deleted (§15.2.4's disclosed residual) | condition (5): the name set changes |
| the registry is repointed at a different stream | condition (5): the registry's `stat` changes |
| the repository under `rootDir` is a different repository | condition (2) |
| the window is replaced by a different one | condition (3): different `{scopeRuleIds, openingTreeSha256}` is a different `ruleDigest` |
| the stream becomes corrupt, so a fresh read would fail `GES-CHAIN` | conditions (4)+(5) — **partially**: a content-only edit that changes neither the name set nor the directory mtime is not detected structurally, and is bounded by the TTL instead |

Exactly one row is not caught structurally, and it is bounded rather than left open. In every other row the memo
is invalidated before it can answer, and every failure of the memo machinery itself degrades to a miss, i.e. to
a full fresh read. **There is no code path in which an absent, stale, unparsable or mismatched memo produces
`true`.**

**The forgeable-memo question, answered rather than asserted.** The memo is a file, on a filesystem an agent
with local write access can write. A forged memo saying `confirmed: true` would make the hook take the lift
branch. What that buys the forger is nothing it did not already have, for the reason §15.2.1 quotes from
§8.5.2: **the proof-verified window record remains a necessary condition and is checked first, uncached, on
every call.** No memo can manufacture a `window.json` carrying a valid detached Ed25519 signature over an
intent digest; without one, `covered` is `false` and the memo is never consulted. The most a forged memo
achieves is to suppress the *ledger* half of the intersection for at most `GMW_LEDGER_MEMO_TTL_MS` — that is,
to restore, for one minute, exactly the pre-O-2 behaviour in which the window record alone decided.

That capability is not new, and it is strictly weaker than one this section already discloses: §15.2.4 records
that an agent with local write access to the human stream's storage root can delete a disposition file and make
a disposed grant read as live **permanently**, defeating the same half of the intersection with no expiry at
all. The memo adds a second, TTL-bounded instance of a residual whose unbounded instance is already on the
record. One respect in which it is nevertheless a real delta is stated rather than absorbed: the stream lives in
the worktree, where a tampered or deleted event is at least in principle visible to `git status` and to review,
while the memo lives under `tmpdir()` and is visible to nobody. Both the bound and the delta are carried in
§15.1.6.

Two things this design deliberately does **not** do about that:

- **It does not MAC or sign the memo.** A MAC key readable by the same user is tamper-*evidence* against
  corruption, not a defence against the adversary §1 names, and presenting it as one would be the overclaim this
  document exists to avoid. HGO's MAC over `audit.jsonl` is not a counter-example: it protects a machine-local
  record whose *contents are* authority, whereas the memo's contents are a cache of a value that is itself not
  authority (§8.5.2: the ledger side "can never produce a lift by itself").
- **It does not move the memo to `<git-common-dir>/agent-pipeline/…`, beside GMW's own window record.** That
  location would be marginally better protected — §15.1.2 establishes that `gateStrengthRuleFor`
  (`guard-gate-strength.mjs:170-178`) reaches paths under `.git` in this repository's standard topology with one
  `GATE_STRENGTH_PATHS` entry — but *resolving* `<git-common-dir>` costs the very git subprocesses the memo
  exists to avoid, and `topology` (`guard-maintenance-window.mjs:202-210`) is not available for production reuse
  (`guardMaintenanceWindowInternals` is marked "Exposed only for tests", `:578`). A cache whose lookup costs two
  subprocesses gives back most of what it saves. The trade is recorded here so the next reader sees that it was
  taken, not missed.

**What a hit costs, including the term that does grow.** `windowCoversRule` as today (2 spawns, one Ed25519
verification, two small reads), plus: one memo read, one `stat` of `registry.json`, one `stat` and one `readdir`
of the stream directory, a sort of the returned names, and one sha256 whose input includes that sorted name
list. **Zero added subprocesses, zero event files opened, zero parses, zero hash-chain verification.** What a
hit is **not** is constant-time in the stream: `streamToken` is defined over `sortedEventFileNames`, so a hit
performs a `readdir` and a sort across the *whole* retained-event **name** set and digests it — O(n log n) in
the number of retained events, and n "only ever grows" for the same append-only reason stated above. An earlier
revision of this paragraph claimed "no term that grows with the size of the human stream"; that was inconsistent
with `streamToken`'s own definition three bullets earlier and is withdrawn. The distinction the memo actually
buys is between two linear terms, not between linear and constant: a hit reads **names** out of one directory
entry (no `open`, no parse, no envelope validation, no path/envelope binding check, no chain re-verification,
no git subprocess), while a scan reads, parses and chain-verifies every **file** — twice per call. Both grow
with n; they grow by different orders of magnitude and against different constants, and stating that honestly is
what keeps the next reader from re-deriving the budget from a claim that does not hold. A miss costs the 6 spawns and 2 scans
priced above plus one memo write, and occurs at most once per `GMW_LEDGER_MEMO_TTL_MS` per
`(rootDir, ruleDigest)`, plus once whenever the stream, the registry or the window actually changes.

**The residual cost, stated as a bound rather than an average.** The worst single call is still a miss, and a
miss still contains 6 `git` spawns with no per-spawn timeout, inside the store. The memo bounds how *often* that
path runs; it cannot bound how long one hung `git` takes, because `spawnSync` blocks the event loop. Bounding
that means passing a `timeout` at the store's own `discoverRepository` call — one argument in
`governance-event-store.mjs`, which is outside this dispatch's scope, per §2's non-scope list. It is recorded in
§15.1.6 with that one-line fix named, and B-1 asserts the shape of the cost so the exposure cannot silently
grow.

#### 15.2.3b B-1 — the budget test

Specified here, written by the implementation dispatch. It extends the integration test
`plugins/pipeline-core/scripts/guard-authority-ledger-intake.test.mjs` that §11 creates and §15.3 already
extends once — one row, extended twice, not duplicated, the same direction §9 uses for
`scripts/governance-authority.mjs`.

Fixture: a temporary repository with a registry, a human stream seeded with **1 000** retained events, and an
armed window whose `{scopeRuleIds, openingTreeSha256}` match a live `granted` decision. Assertions are
**structural first, wall-clock second**, because a wall-clock-only budget test pins nothing about the mechanism
and flakes on shared CI:

1. **Cold miss and warm hit, through the injected reader seam.** `ledgerConfirmsLiveGmwGrant` takes
   `queryDecisions = queryHumanGovernanceDecisions` (§15.2.3), the same injected-default convention
   `guard-maintenance-window.mjs` already uses for `spawn`. A cold call invokes `queryDecisions` **exactly
   once**. A second call inside the TTL, made with a `queryDecisions` stub that **throws if invoked at all**,
   returns `true` — an answer that touched the stream could not pass this test.
2. **Burst.** 50 consecutive lifted calls inside one TTL invoke `queryDecisions` exactly **once**, not 50
   times. With a counting `spawn` injected into `windowCoversRule`, the same 50 calls perform exactly 2 spawns
   each — today's cost, unchanged — and the memo adds none.
3. **What (1) and (2) do and do not prove, stated so the coverage is not overclaimed.** The 6 store-internal
   git spawns and 2 stream scans are **not** reachable from any injection seam this design owns; they are the
   traced cost of one `queryDecisions` invocation (§15.2.3a's table), so counting invocations is what pins
   them. A test that also wants the raw spawn count must shim `git` on `PATH`, which is platform-bound and is
   deliberately not required here.
4. **Invalidation — the load-bearing safety assertion.** After a `revoked` disposition is appended to the
   stream, the very next call returns `false` **immediately, without waiting for the TTL**, because the stream
   token changed. Repeated, each as its own case, for: an event file deleted; the registry repointed at another
   storage root; the window replaced by one with different `scopeRuleIds`.
5. **Expiry is never served stale.** A memo written while the grant was live yields `false` on the first call
   after `min(grantExpiresAtEpochMs, windowExpiresAtMs)` has passed, with the stream untouched and the TTL not
   yet elapsed — driven by an injected `nowMs`, never by a sleep.
6. **A miss never grants.** A truncated memo, a memo carrying one extra key, a memo for a different `rootDir`,
   a memo with a future `observedAtEpochMs`, and an absent memo each force the full read; each, with
   `queryDecisions` stubbed to reject, returns `false`.
7. **Wall clock, as a ceiling with margin rather than as a measurement.** The complete hook step
   (`windowCoversRule` + `ledgerConfirmsLiveGmwGrant`) completes in **< 1 000 ms** on a cold miss at 1 000
   retained events and **< 250 ms** on a hit — 10 % and 2.5 % of `guard-testpath.mjs`'s declared 10 s runner
   budget (`hooks/hooks.json:61-65`). The ceilings sit an order of magnitude above the expected cost and an
   order of magnitude below the timeout on purpose: assertions 1-2 pin the shape of the cost, and 7 fails only
   when something has gone badly wrong.
8. **Negative memoization works structurally, not only in prose.** Given a prior `confirmed: false` memo whose
   `grantNotBeforeEpochMs` and `grantExpiresAtEpochMs` are `null` (§15.2.3a's negative shape), still inside the
   TTL and matching conditions (1)-(5), the next call returns `false` with a `queryDecisions` stub that
   **throws if invoked at all** — the same seam assertion 1 uses for the positive warm hit, in the opposite
   polarity. Without this case the bullet "negative memoization is included, deliberately" is untested, and the
   most likely implementation slip — omitting the two `null` keys instead of writing them, so every negative
   memo fails the closed-shape check and silently becomes a miss — passes every other assertion in this list,
   because a permanent miss still returns `false`.

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
active window claiming a lift — and is zero on every call where no window is active. That bound is real but
narrower than an earlier revision of this paragraph implied: inside an active window the case is not rare at
all, it is every guarded edit the window exists to permit, and §15.2.3a prices it, corrects the "one more read"
claim it rested on, and specifies the memo that bounds it.

**The memo's failure mode is the same one, by construction.** `readGrantMemo` never throws: an absent,
unreadable, unparsable, mismatched, future-dated or expired memo is a *miss*, and a miss performs the full read
whose failure mode is the paragraph above. `writeGrantMemo` never throws either, and a failed write is ignored —
the next call is simply another miss. There is no state of the memo machinery in which
`ledgerConfirmsLiveGmwGrant` returns `true` without either a fresh confirming read or a memo that satisfied
every one of §15.2.3a's six conditions, and none in which it blocks a tool call harder than today's ordinary
refusal.

One honest consequence, stated rather than hidden: a lift that used to succeed on the machine-local window
record alone now **also** requires the ledger to confirm it, so an unreadable ledger denies a lift the window
record alone would have granted. That is the intended effect of closing H-AC-02 at the hook, not a side effect
of it — the same fail-closed direction §8.1 already chose for the arming boundary, applied here for the first
time to the read path.

**Completeness and integrity, disclosed rather than assumed.** Every other consumer of
`queryHumanGovernanceDecisions` in this codebase (`governance-authority.mjs`) passes a `checkpoint` it received
from an earlier operation and refuses to trust the result unless `completeness === "verified"` (the default and
consumption-readback paths) or `integrity` is `"valid"`/`"prefix-valid"` against that specific witnessed
checkpoint (the consumption path). `ledgerConfirmsLiveGmwGrant` deliberately departs from that pattern: it
passes **no** `checkpoint`, because none is available to it — the machine-local window record carries only
`scopeRuleIds` and `openingTreeSha256` (above), and `lib/guard-maintenance-window.mjs` cannot change to add a
retained ledger sequence without violating the "no change" constraint this design already preserves (§7.1,
A-3, §11). Without a `checkpoint`, `verifyPortableGovernanceStream` always returns `completeness: "unknown"`
and `integrity: "prefix-valid"` (its own `if (!checkpoint) return …` early return; symbol-anchored per the
line-number note in §15.2.3a, and an earlier revision's `:687` no longer resolves to it) — never
`"verified"`/`"valid"` — regardless
of the ledger's actual state, so gating on those fields the way the other consumers do is not written into this
design: gating on `completeness` would always refuse, and gating on `integrity` would never refuse, since it is
unconditionally `"prefix-valid"` here. What the read still gets for free, unconditionally, is `scanStream`'s
hash-chain re-verification of every retained event on every call (its `previousEventDigest`/`sequence`
contiguity loop, failing `GES-CHAIN`; an earlier revision's `:453-457` pointed at neither the function nor the
loop) — a corrupted or non-contiguous stream still fails, which `ledgerConfirmsLiveGmwGrant`'s own
`catch` turns into `false`. That same loop is the dominant per-call cost §15.2.3a prices and the memo bounds in
frequency; nothing about the memo weakens it, because a memo miss runs it in full. What it does **not** get,
and could not get without a checkpoint no producer here
retains: proof that the retained stream is *complete* — that no disposition (`revoked`/`expired`/`consumed`)
that once existed for this grant was later deleted from the end of the stream. This read cannot distinguish
"no disposition exists" from "a disposition existed and the on-disk record for it was removed"; an agent with
local write access to the human stream's storage root could delete a disposition file and make a lifted grant
continue to read as live here. This is a genuine residual, disclosed rather than assumed away — and it is
**not** confined to the hook, which an earlier revision of this sentence claimed by saying it "does not weaken
H-AC-02's satisfaction at any boundary that *does* hold a checkpoint (arming, consumption, status,
reconcile)". Those boundaries are not specified to hold one anywhere in this document: §7.4 step (d) relies on
"the store's own readback" and names no checkpoint, and §7.5's reconcile names none either. Calling it a
hook-only residual understated it. It is carried as a residual of this design's checkpoint-less read posture,
owner `pipeline` (PHX-2), in §15.1.6 — which, until this revision, did not in fact carry it, although this
paragraph already said it did. Whether the arming and consumption boundaries should retain and pass a
checkpoint is a design question this amendment does not open and does not answer; it is recorded there so the
next revision inherits it as a question rather than as a settled claim.

#### 15.2.5 What this removes from increment 2, and what remains

D-2 (§2, "synchronous dual-evaluation inside the guard hot path") is closed by §15.2.3 **as a placement
decision**: the dual evaluation now runs inside the synchronous guard hook, in increment 1, and no part of that
move is left to increment 2. §8.5.2's "the hooks that call `windowCoversRule` appear in §9's amendment rather
than in §11's increment-1 inventory" no longer applies: they are named and specified above, as part of
increment 1. **What is *not* closed is the assurance of the read that now runs there**, and an earlier revision
of this paragraph asserted the opposite by writing "fully closed — nothing partial is left over" three
paragraphs after §15.2.4 disclosed a live residual of its own. §14's O-2 entry ("known non-conformance... owner
`pipeline`... no date") is resolved **in the respect it was raised**: H-AC-02 (`acceptance.md:143-144`) no
longer has an interval between two boundaries in which the hook honours mutable state claiming human authority
with *no ledger decision consulted at all*. The hook consults one, on every lifted call. It is satisfied at the
hook against every state that read can distinguish — and it is **not** discharged against an agent with local
write access to the human stream's storage root, which can delete a disposition and make a disposed grant read
as live (§15.2.4), nor against one that forges the memo, which suppresses the same half of the intersection for
up to one minute (§15.2.3a). Both are carried in §15.1.6, owner `pipeline` (PHX-2). Increment 1 therefore ships
O-2's mechanism, not a discharge of every assurance question the mechanism raises; that is the same distinction
§5.2's R-3 draws for H-AC-11, drawn here for the same reason — a closure claim wider than its evidence is the
failure this document exists to avoid. H-AC-12's migration clause and its expiry (§9) are untouched — that amendment
bounds a different clause and was never O-2's subject. D-1 (the restricted attribution store, §5.4) is **not**
affected by this section; it remains increment 2, and §15.1 does not depend on it (§15.1.2 explicitly avoids
the kernel path D-1 would need).

### 15.3 §11 implementation inventory — delta only

The rows below are additions to, or modifications of, §11's table; §11 itself is not rewritten.

| File | Change | Rationale |
| --- | --- | --- |
| `plugins/pipeline-core/lib/guard-authority-ledger-intake.mjs` | **extend** the create already specified in §11: add `ledgerConfirmsLiveGmwGrant` (§15.2.3) alongside the write-side builders, plus the memo and cost-bounding surface of §15.2.3a — `readGrantMemo`, `writeGrantMemo`, `readRegistryRepositoryFingerprint`, `GMW_LEDGER_MEMO_TTL_MS`. Same file, five more exports. **Required companion change — see the row for `lib/guard-maintenance-window.mjs` below:** this module must be a `NEVER_LIFTABLE_KERNEL_PATHS` member before or at the same time as it ships, or the check it hosts is removable by one edit under any GS-6 window (§15.1.6 (iv)). | keeps every ledger-reading and ledger-writing entry point for this design in one module, per §7.1's own reasoning; the memo is the read path's own concern and belongs beside it, not in a new module; the kernel-list companion is what stops "one module" from also meaning "one editable point of failure" |
| `plugins/pipeline-core/scripts/guard-authority-ledger-intake.test.mjs` | **extend** the create already specified in §11: integration tests for the narrowing read (ledger confirms → lift proceeds; ledger silent/absent/corrupted → lift denied exactly like an absent window; a disposed grant → denied) | moves an O-2 non-conformance out of "no test exists for it" the same day it moves out of "not implemented" |
| `plugins/pipeline-core/scripts/guard-authority-ledger-intake.test.mjs` | **extend a second time — the same row, not a duplicate of it** (the "one row, extended twice" direction §9 already uses for `scripts/governance-authority.mjs`): add **B-1**, the budget test specified in §15.2.3b — cold-miss/warm-hit through the injected `queryDecisions` seam, the 50-call burst, the four invalidation cases, expiry-never-served-stale, five miss-never-grants cases, the negative-memo warm hit that pins negative memoization structurally, and the wall-clock ceilings (< 1 000 ms cold, < 250 ms warm) against `guard-testpath.mjs`'s declared 10 s runner budget (`hooks/hooks.json:61-65`) | §15.2.3a corrects a false cost claim; a corrected claim with no test is the same claim one revision later. B-1 is what keeps the bound true after the next change to the store, and its structural assertions fail on a regression the wall clock would hide |
| `plugins/pipeline-core/hooks/guard-testpath.mjs` | **modify**: call `ledgerConfirmsLiveGmwGrant` after `windowCoversRule` returns `covered: true` (§15.2.3) | closes H-AC-02 at the TP-* hook path (§15.2.2 identifies this as an actual call site; the original §11 named no hook file at all for increment 1) |
| `plugins/pipeline-core/hooks/guard-gate-strength.mjs` | **modify**: same change, GS-6 only (§15.2.3) | closes H-AC-02 at the GS-6 hook path |
| `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` | **no change** | §15.2.2's correction: this file does not call `windowCoversRule` and has no role in O-2's closure |
| `plugins/pipeline-core/lib/guard-maintenance-window.mjs` | **no change to behaviour, exports or logic** (§11's existing row stands, and this document does not edit the file). **One data-only addition is *proposed* here and applied by the dispatch that owns this file** (§9's deferred-application pattern): the single array element `"plugins/pipeline-core/lib/guard-authority-ledger-intake.mjs"` in `NEVER_LIFTABLE_KERNEL_PATHS` (`:120-128`), exact text and rationale in §15.1.6 (iv). It must land no later than the intake module itself. | §15.2.3's design deliberately avoids needing any export this file does not already have — but §15.2.3 also makes a *new* module a term of the lift condition, and a term of the lift condition that a maintenance window can edit re-opens exactly the recursive hole the kernel list exists to close (§6, Option B, reason 2). One array element, no logic touched, is the smallest change that closes it |
| `plugins/pipeline-core/lib/human-governance-identity-registry.mjs` | **create** — `validateIdentityRegistryEntry`, `validateIdentityRegistry`, `resolveNaturalPersonIdentity`, `loadIdentityRegistry` (§15.1.2) | O-1's mechanism; no kernel file changes because of it |
| `plugins/pipeline-core/lib/human-governance-identity-registry.test.mjs` | **create** — unit tests: shape validation, overlap rejection, resolved/unknown/ambiguous lookup outcomes | same H-AC-15-style discipline §12 already applies to the write-side builders |
| `plugins/pipeline-core/scripts/governance-authority.mjs` | **extend** the modification already specified in §11: add the `--resolve-identity-file`/`--resolve-identity-json` verb pair to `parse(argv)`'s `Set` (`:13`) and one more early branch in `main()` (`:39-99`), each carrying the canonical-JSON payload `{authorityClass, occurredAtEpochMs}` — not the two-flag `resolve-identity --authority-class <class> --occurred-at-ms <n>` form §15.1.2 already rejects as not fitting `parse(argv)`'s closed shape (§15.1.2) | one read-only query surface, reusing the file §11 already touches for `reconcile` rather than adding a new script |

### 15.4 §14 disposition

- **O-1 — mechanism resolved; completion gated by AC-14, unlike O-2.** Mechanism specified in §15.1; the
  identity registry requires no kernel change and can ship independently of D-1/increment 2. The residual it
  creates (both producers now attributable at role-and-time granularity by a local registry holder) is
  disclosed in §15.1.6, on the same terms O-4 already established, and does not soften O-4 itself. The
  H-AC-11 amendment text is proposed in §15.1.5 and applied by the reviewed rebind, not here — and, unlike
  O-2, that step has not yet happened as of this document: §13 AC-14 is this document's own gate against
  declaring the mechanism complete before it does.
- **O-2 — mechanism resolved; four assurance residuals open and tracked.** Mechanism specified in §15.2;
  D-2's *placement* is closed and pulled into increment 1 (§15.2.5, §15.3), with the real execution cost traced
  in §15.2.3a — nine added git subprocess spawns and two full O(n) hash-chain re-verifications per lifted tool
  call, not "one more read" — bounded by the memo specified there and pinned by budget test B-1 (§15.2.3b).
  H-AC-02 is satisfied at the guard hook against every state the hook's read can distinguish. It is **not**
  discharged against an agent with local write access to the human stream's storage root (§15.2.4) or to the
  memo (§15.2.3a), and a miss still contains six git spawns with no per-spawn timeout. **Fourth, and unlike the
  other three unbounded in time:** the module hosting the narrowing check,
  `lib/guard-authority-ledger-intake.mjs`, is not a `NEVER_LIFTABLE_KERNEL_PATHS` member, so one edit under any
  active GS-6 window removes the check permanently — §15.1.6 (iv) states the defeat path and proposes the
  one-element kernel-list addition that closes it, applied per §9's deferred-application pattern by the dispatch
  that owns `lib/guard-maintenance-window.mjs` and carried in §15.3 as a required companion change. All
  **four** are in §15.1.6, each with an owner (`pipeline`, PHX-2) and an explicit trigger; the count here and
  the count in §15.1.6's preamble are the same four by construction. An earlier revision of this bullet read
  "no non-conformance remains open for it", which was wider than §15.2.4's own disclosure in the same document;
  a later one said "three", which stopped being true the moment (iv) was found. Both are corrected here.
- **O-3, O-4, O-5 — unchanged.** Not reopened by this section.
