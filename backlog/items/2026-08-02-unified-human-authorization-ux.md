---
schema: pipeline.backlog-item.v1
id: pipeline.unified-human-authorization-ux
type: workflow-improvement
owner: pipeline
status: open
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
