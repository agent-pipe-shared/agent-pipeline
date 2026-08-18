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
