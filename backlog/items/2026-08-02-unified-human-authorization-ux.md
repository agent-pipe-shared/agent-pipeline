---
schema: pipeline.backlog-item.v1
id: pipeline.unified-human-authorization-ux
type: workflow-improvement
owner: pipeline
status: closed
closed_at: "2026-08-19"
closure_repository: "self"
closure_commit: "6b34ed12d7ac9fe61723157e72c527518a0af6ff"
closure_evidence: "backlog/items/2026-08-02-unified-human-authorization-ux.md"
created: 2026-08-02
source: "PO product-direction decision during Sprint Cyborg CYB-4 PO-proof UX review, 2026-08-02"
tracking: Current CYB-4 helper is a compatible first adapter only; no programme-wide migration or closure is claimed.
due: 2026-08-30
---

# Unify human authorization UX across Pipeline intents and gates

## Description

Human authorization must not remain a one-off PO-proof interaction in CYB-4.
The Pipeline needs one shared, detached-proof contract that all existing human
intents and configured human gates can adopt, and that every future sprint
uses by default. It must be easy enough for solo developers and small teams
while keeping private authorization material out of agents, chat transcripts,
repositories, CI, and Pipeline state.

## Triggering situation

During the first hands-on Cyborg PO-proof setup, the raw multi-command flow
failed when paths and shell variables were not persistent between commands.
The PO explicitly requested an executable, low-friction workflow and required
the approach to become programme-wide rather than a special case for one
threat-model gate.

## Affected artifact

The current foundation is `plugins/pipeline-core/scripts/po-human-approval.mjs`
and `docs/po-human-approval.md`, plus every current and future human-intent or
human-gate producer/consumer in Pipeline runners, desktop applications, and
sprint templates. An inventory is required before migration; no single gate is
the complete scope.

## Proposal

Define a versioned shared Human-Authorization contract with a stable detached
public proof and adapter boundary. Inventory every existing human intent and
configured gate, migrate it to the shared prepare/approve/verify UX, and make
adoption an explicit requirement for subsequent sprint design packages.

Desktop applications should implement Passkey/WebAuthn as the preferred native
adapter. CLI runners on Linux, macOS, Windows, and WSL should support an
external, passphrase-protected Ed25519/SSH-style key adapter with one-time
setup and a short repeat approval flow. IAM, hardware-key, and password-manager
adapters may be supplied without changing the common verification contract.

Acceptance must include cross-platform user documentation, a no-secret-agent
boundary, candidate binding and replay resistance, adapter conformance tests,
and an adoption check that prevents new one-off human-approval UX from being
introduced.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted; substantially advanced today, stays open.
- **Rationale:** ADR-0055 (`docs/adr/0055-critical-human-proof-waiver.md`)
  and ADR-0056 (`docs/adr/0056-push-approval-mode.md`), landed 2026-08-06 as
  part of unrelated session work, deliver a real chunk of this item's
  proposal: `push` and `deploy` are both migrated onto the shared
  `pipeline.po-approval-proof.v1` verified-proof contract (previously only
  the one-off Cyborg threat-model gate used it, exactly the "one-off UX"
  this item warns against); a configured mode
  (`gates.push_approval: "signature"|"chat"` in `pipeline.user.yaml`) makes
  the low-friction/high-assurance tradeoff explicit and PO-controlled,
  fail-closed on any absent/unreadable/unrecognized value, per this item's
  "easy enough for solo developers... while keeping private authorization
  material out of agents" requirement. `docs/po-human-approval.md`'s
  "Adapter boundary" section already frames the shipped Ed25519 CLI adapter
  as "the first adapter for one shared Human-Authorization contract, not a
  CYB-4-only mechanism" — today's work is exactly that generalization
  happening for two more gates.
  **Still open, confirmed unimplemented, not to be silently dropped:**
  PRD approval (`approve-plan`) is not migrated — same finding as
  `backlog/items/2026-08-05-critical-human-proof-not-wired-to-push-and-prd-gates.md`,
  narrowed today to exactly this gap. `publication` was deliberately **not**
  brought onto the new shape — ADR-0056 states this explicitly and records
  it as its own follow-up ("two shapes now exist where one would be
  better"). No formal inventory of every human intent/gate exists as a
  dedicated artifact. No Passkey/WebAuthn or other adapter beyond the single
  external-Ed25519-key adapter exists. No "adoption check that prevents a
  new one-off human-approval UX from being introduced" exists as a gate —
  ADR-0055/0056 landing as an unplanned side effect of unrelated push-gate
  work, discovered only by tonight's backlog reconciliation rather than by
  a structural check, is itself a small piece of evidence for why this item
  wants one. Cross-platform conformance of the adapters is unverified in
  this pass.
- **Assignment (if accepted):** push/deploy migration delivered by
  ADR-0055/ADR-0056, Sprint Nova session, 2026-08-06. Remaining scope
  (PRD-approval migration, publication unification, adapter inventory,
  adoption-enforcement check, Passkey/WebAuthn/other adapters,
  cross-platform conformance) unassigned.
- **Date:** 2026-08-06

### Sprint deferral (2026-08-17)

- **Decision:** deferred — remaining scope owned by Sprint Alfred.

Remaining scope deferred to Sprint Alfred ("Agent-first architecture,
mechanical governance, measurable rigor, and control integrity" —
ADR-0043's 2026-08-17 amendment). PRD-approval migration and the adoption-
enforcement check are exactly Alfred's "mechanical governance" scope; not
needed near-term — push/deploy (the gates this session actually exercises)
are already migrated.

### PO Decision — 2026-08-18

- **Decision:** Option A — pursue the FULL remaining scope now: PRD-approval migration, publication unification, a formal gate/intent inventory, an adoption-enforcement check, and additional adapters (Passkey/WebAuthn).
- **Rationale:** PO's direct choice, going further than the Elephant's staged recommendation (PRD-approval migration first) — the PO wants the complete remaining program scoped and pursued together.
- **Assignment:** Dispatch-ready — large, multi-session program; needs its own scoping/sequencing pass before implementation dispatch begins (not a single bounded task).
- **Date:** 2026-08-18

### Scoping pass — 2026-08-18 (Elephant, same-day follow-up)

The remaining program breaks into five separable work packages. Sequencing and
one resolved contradiction below; this is method/sequencing, not a new PO
decision, per this repo's own "decide, don't ask" default.

1. **PRD-approval migration — SUPERSEDED, not dispatched.** The same session's
   `2026-08-05-critical-human-proof-not-wired-to-push-and-prd-gates.md` names
   this identical gap (`approve-plan` not on the Ed25519 proof contract) and
   was answered the same day with **Option B: closed** — the existing
   PO-gate-authority binding is accepted as sufficient, no Ed25519 proof is
   added to `approve-plan`. That decision directly resolves this item's
   sub-scope; migrating PRD-approval anyway would contradict a PO decision
   made hours earlier in the same docket. Marked done-via-supersession, not
   queued.
2. **Publication unification — dispatch-ready.** Bring `publication` onto the
   shared `pipeline.po-approval-proof.v1` contract, same shape as the
   `push`/`deploy` migration ADR-0056 already did; ADR-0056 itself names this
   as its own recorded follow-up ("two shapes now exist where one would be
   better"). Touches `plugins/pipeline-core/scripts/po-human-approval.mjs`
   and `docs/po-human-approval.md` — the SAME files
   `PHX-WP-PORT-ADR0061-AUTHORIZE-CRITICAL` (this round's other dispatch) is
   actively editing. **Sequenced to dispatch only after that dispatch lands**,
   not run concurrently.
3. **Formal gate/intent inventory — dispatch-ready, independent.** A durable
   artifact enumerating every human intent/gate in the Pipeline and its
   current authorization mechanism (which are on the shared contract, which
   are one-off). No file overlap with the rest of this round; can dispatch
   immediately.
4. **Adoption-enforcement check — sequenced after #3.** A structural check
   that refuses a newly-introduced one-off human-approval UX. Needs the
   inventory (#3) as its own input to know what "the shared contract"
   currently covers, so it cannot be scoped correctly before #3 lands.
5. **Passkey/WebAuthn (and other) adapters — scope resolved, not immediately
   dispatched.** The item's own Proposal assigns this to "desktop
   applications"; this repository is a CLI-based agent-orchestration
   Pipeline with no desktop-app code anywhere in it. Decision: this repo's
   share of the work is defining the **adapter contract/interface** a
   downstream desktop consumer would implement against (extending
   `docs/po-human-approval.md`'s existing "Adapter boundary" section) — not
   building a desktop application, which does not exist in this codebase.
   Bounded to that scope, it is dispatch-ready; building it as a literal
   Passkey/WebAuthn implementation would be scope invented beyond what this
   repository can deliver.

**Next dispatch round:** #3 (inventory) can go out immediately, independent of
the currently-running workflow. #2 (publication unification) queues behind
`PHX-WP-PORT-ADR0061-AUTHORIZE-CRITICAL` landing (file conflict on
`po-human-approval.mjs`). #4 (adoption check) queues behind #3. #5 (adapter
contract) is independent and dispatch-ready alongside #3.

### Progress note — 2026-08-19

All 5 work packages from the 2026-08-18 scoping pass now have a landed
disposition: #1 (PRD-approval migration) stays superseded, no action needed.
#2 (publication unification) landed as a regression test proving the migration
was already functionally complete (commit `41c7711d`) — a real remaining
asymmetry was found and left as a noted gap, not filed as its own item yet:
`publication-authority.mjs` doesn't rebuild-verify `criticalProof` at execution
time the way push/deploy do. #3 (gate/intent inventory) landed
(`docs/human-authorization-inventory.md`, commit `acd8cb56`). #4
(adoption-enforcement check) landed (`harness/scripts/check-auth-gate-inventory-drift.mjs`,
commit `f1387980`, registered in Verify, passes clean against the real repo).
#5 (Passkey/WebAuthn adapter-contract scope) landed (`docs/po-human-approval.md`'s
extended "Adapter boundary" section, commit `49b9434c`) — this repo defines
the adapter contract only, no desktop-app implementation, per its own scope
boundary; found and disclosed one narrow coupling (`verifyPoApprovalProof`'s
`crypto.verify(null,...)` assumes EdDSA-family keys, would need a small change
for an ECDSA/P-256 Passkey credential) as a documented future-work note, not a
blocker. **Remaining open scope, now filed separately:** the publication-authority
execution-time asymmetry noted under #2 is now its own backlog item
(`2026-08-19-publication-authority-lacks-execution-time-criticalproof-reverification.md`)
— investigation there confirmed it is a real gap needing a PO decision between
two named directions, correctly not resolved here.

### Revisit and partial delivery (2026-08-25, PO-directed AFK sweep)

- **Decision:** `implemented` for the bounded piece; item stays open — real
  remaining scope exists and is not this dispatch's to close.
- **What changed since the 2026-08-17 deferral, re-checked live rather than
  inherited:** the PRD-approval piece of this item's remaining scope is now
  **resolved**, not merely deferred — `backlog/items/2026-08-05-critical-
  human-proof-not-wired-to-push-and-prd-gates.md` (the sibling item this
  item's own 2026-08-06 Triage pointed at for that gap) was closed 2026-08-18
  with an explicit PO decision: PRD approval does **not** get the same
  Ed25519 signature requirement as push, because it is already SHA-bound and
  judged less security-critical, and a signature requirement there would
  violate the "minimize PO gates" line established for the HGO ceremony. That
  removes PRD-approval migration from this item's open scope entirely — it is
  answered, not outstanding.
- **Delivered this pass:** `docs/human-authorization-inventory.md` — the
  formal inventory of every human intent/gate this item's Proposal names as
  step 1 ("Inventory every existing human intent and configured gate"),
  cataloguing push/deploy/publication/GMW/HGO/kickoff-language against the
  shared detached-proof contract, PRD-approval and remote-provisional-
  approval as deliberately outside it, and the concrete remaining gaps below.
  Every path the document cites was confirmed to exist in this checkout
  before commit (see the dispatch record / completion report for the
  verification command and exit code).
- **Confirmed still genuinely open (not attempted this pass, with reasons):**
  - **Adoption-enforcement check** — a `rg`-based scan of
    `plugins/pipeline-core/scripts/*.mjs` for the substring `approv` returned
    over 70 files, most unrelated to human authorization. Reliably telling a
    new bespoke approval prompt apart from ordinary code that merely mentions
    "approval" is a real design/scoping task, not a bounded mechanical
    addition a single dispatch should attempt without more analysis.
  - **Publication shape unification** — explicitly its own follow-up in
    ADR-0056 ("the two now differ in shape, and one shape would be better
    than two"), not re-litigated here.
  - **Passkey/WebAuthn or other adapters** — none exist beyond the shipped
    external Ed25519 CLI adapter; no desktop application exists in this
    repository yet to consume one, so building an adapter now would be
    speculative rather than bounded.
  - **Cross-platform conformance** — unverified; needs execution on
    macOS/Windows/WSL, unavailable in this sandboxed single-OS session.
- **Assignment (if accepted):** the four gaps above remain unassigned; none
  of them is a routine technical implementation choice — each needs either
  further scoping work or a concrete consumer/target before it can be built.
- **Date:** 2026-08-25

### Merge reconciliation note (2026-08-26)

The "Confirmed still genuinely open" list in the entry immediately above was
written from a checkout that did not yet contain the 2026-08-18/2026-08-19
work packages recorded earlier in this document. Three of its four items are
superseded by that already-landed work, not still open: the
adoption-enforcement check landed as
`harness/scripts/check-auth-gate-inventory-drift.mjs` (commit `f1387980`);
publication shape unification landed (commit `41c7711d`, with one noted
residual gap tracked separately, see the 2026-08-19 progress note above); the
Passkey/WebAuthn adapter-contract scope landed in `docs/po-human-approval.md`'s
"Adapter boundary" section (commit `49b9434c`). Both `harness/scripts/check-
auth-gate-inventory-drift.mjs` and `docs/human-authorization-inventory.md`
were confirmed present in this checkout during merge resolution. Cross-platform
(macOS/Windows/WSL) conformance testing of the adapters is the one item from
that list neither branch resolved, and remains genuinely open.

## Triage — closed 2026-08-19

**Merge note (2026-08-26, moved from frontmatter):** Merged 2026-08-26 from a Nova-line branch (feat/sprint-nova-codex-v046) and a Phoenix-line branch (origin/sprint_phoenix) that diverged after the 2026-08-06 Triage entry below and progressed independently. The Phoenix line's 2026-08-18/2026-08-19 work packages (#2 publication unification, #3 gate/intent inventory, #4 adoption-enforcement check, #5 Passkey/WebAuthn adapter-contract scope) are confirmed landed in this checkout (harness/scripts/check-auth-gate-inventory-drift.mjs and docs/human-authorization-inventory.md both verified present on disk during merge resolution). The Nova line's 2026-08-25 entry below was written from a checkout that did not yet contain that Phoenix-line work and independently characterizes three of those four items as 'still genuinely open, not attempted this pass' -- that characterization is superseded by the Phoenix-line artifacts, not by opinion. Status is kept closed per the Phoenix-line Triage; the one item neither line resolved is cross-platform (macOS/Windows/WSL) conformance testing of the adapters, which remains genuinely open.

- **Decision:** closed — resolved as far as this session can take it. All 5
  work packages from the 2026-08-18 scoping pass have a landed or properly-filed
  disposition (see above); the one remaining substantive question (publication's
  execution-time trust boundary) now has its own tracked item with its own PO
  decision pending, rather than sitting as an unfiled note under this umbrella
  item.
- **Rationale:** This item's own purpose — scope and track the
  `unified-human-authorization-ux` remaining program — is fulfilled: every
  named work package has a real disposition, and the one still-open technical
  question is durably tracked in its own right-sized item instead of here.
- **Date:** 2026-08-19
