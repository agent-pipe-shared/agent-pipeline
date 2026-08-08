<!-- po-language: en -->

# PRD — Governance Sprint Phoenix

> Product Review Document for the Product Owner gate. Status: `approved — PHX-0A
> lifecycle-manifest reconciliation scope revision bound for implementation`. Task: `sprint-phoenix-epic` · profile
> `epic` · rigor 2 · risk high. Approval authorizes exactly the first
> implementation dispatch; push, merge, release, external writes, and final
> acceptance keep their own gates.

<!-- technical-spec-sha256: f7e32bb764d408ec21d6578d72b4729d8d5931bcf840ebac2198a2d652233d4f -->

The technical approval binds the exact neighboring [spec.md](spec.md).
Acceptance criteria are maintained in
[acceptance.md](acceptance.md), not duplicated here. Any change to the bound
Spec, the issue set, an authority source, a portable data class, or an external
write capability requires renewed readiness and Product Owner approval.

## What

Phoenix builds one coherent governance foundation for Agent Pipeline. It makes
human approvals and exceptions reconstructable, records material agent
assumptions without turning them into authority, and provides a privacy-safe
history of lifecycle activity. These three kinds of records stay separate so
that an observation or agent statement can never be mistaken for human
approval.

On top of that foundation, Phoenix delivers a local human-readable evidence
view, organization policy packs, portable audit bundles, safe links to work
systems and knowledge bases, an independently checked ITSM change gate, and
provider-neutral export to audit and security platforms.

Phoenix also repairs the trust root exposed during this bootstrap: the loaded
Pipeline version and its freshness must be discoverable through a
runner-independent route. A valid Codex-only or not-yet-committed repository
must not fail merely because a Claude-specific file or consumer commit is
absent.

*Technical scope: public issues #5, #9, #17, #23, #24, #30, #31, and #32;
PO additions PHX-0 lifecycle-authority revision and ruleset source/freshness,
plus the external-handoff, workaround, and recovery audit profile.*

## Why

Today the necessary evidence exists in several useful but disconnected forms.
That makes it too easy to lose decision history, confuse current state with
authority, export more data than intended, or let an external status appear to
grant permission. A governance product also cannot be credible when it cannot
reliably identify the ruleset that governs the current session.

Phoenix gives operators and reviewers one explainable product model:

- people grant, deny, revoke, or narrow authority;
- agents declare only material assumptions and selections;
- runtime components report what happened and what evidence is missing;
- views, bundles, integrations, and exports are derived consumers, never hidden
  authority sources.

Success means a reviewer can reconstruct a decision and its consequences
offline, detect tampering or missing evidence, understand what was deliberately
omitted for privacy, and distinguish an external acknowledgement from an
internal approval.

## Scope

- A tamper-evident Human Governance Decision Ledger as the historical source
  for human authority-changing decisions.
- A separate privacy-minimized Agent Decision and Assumption Journal.
- A sanitized lifecycle event model and deterministic local replay.
- A shared event foundation with strict origin, repository, candidate,
  integrity, and correlation fields.
- Organization policy packs whose merge rules cannot silently weaken core
  safety floors.
- Portable audit bundles with optional signatures and explicit assurance
  limits.
- An offline, accessible Evidence Viewer generated only from validated
  canonical inputs.
- Provider-neutral traceability and documentation adapters with preview,
  explicit authorization, revision checks, and readback.
- ITSM change control composed with, but never substituted for, Pipeline human
  authority.
- One-way governance event export with sanitized per-destination queues,
  stable idempotency, and honest acknowledgement states.
- Runner-neutral ruleset source and freshness for Codex, Claude,
  self-application, local development, offline, and pre-commit states.
- A sanctioned, evidence-bound continuity-authority revision path for an active
  design whose immutable PRD/Spec candidate has legitimately changed before
  approval. Generic CAS remains unable to rewrite authority; the dedicated
  path requires an exact scoped human decision, old/new artifact digests,
  atomic State readback, and a public-safe audit record.
- A single writer-bound reconciliation of the inherited Phoenix `draft`
  lifecycle manifest's stale PRD, Spec, acceptance, architecture, and
  append-only Result digests. Result reconciliation is admitted only when the
  stale digest is proved as the exact preserved historical prefix followed by
  the canonical Result reconciliation fence and the Continuity State binds the
  current Result. It preserves state and artifact inventory, requires an exact
  preview and PO-bound apply/readback, refuses metadata-only Result refreshes,
  and prohibits manual manifest edits.
- A correlated external-handoff, recovery, and workaround profile. Every
  Pipeline-known command or script offered for user execution is recorded
  before presentation, whether Pipeline-initiated or user-requested and
  Pipeline-supplied; offer, authorization, observed execution, and readback
  remain separate without retaining private machine details or raw commands.
- Migration of existing authority consumers without inventing historical
  approvals or deleting legacy evidence.

The validated issue and backlog disposition is in
[design/scope-validation.md](design/scope-validation.md), and every live issue
acceptance bullet is cross-referenced in
[design/issue-coverage.md](design/issue-coverage.md). The architecture and
delivery dependency graph are in
[design/architecture.md](design/architecture.md).

The current pre-implementation evidence and remaining authority gates are
summarized in [design/readiness-audit.md](design/readiness-audit.md).

## Non-goals

- Capturing hidden reasoning, full conversations, prompts, terminal history,
  unrestricted output, secrets, private paths, or account details.
- Building one universal audit log that erases the difference between people,
  agents, and runtime observations.
- Treating Git, current state, a viewer, bundle, issue, wiki, ITSM status,
  security alert, or delivery receipt as human authority.
- Requiring a hosted service or named commercial provider for normal local
  operation.
- Claiming legal compliance, verified identity, trusted time, destination
  retention, analyst review, or exactly-once delivery without separate
  evidence.
- Treating a command offer, preview, approval, generated script, copy action,
  or user assertion as proof of execution or success.
- Reopening completed 0.4.6 recovery work because historical backlog or
  documentation status is stale.
- Taking ownership of Nova execution/isolation, Cyborg work, Nightwing's
  product front door, or other unpublished sibling-Sprint changes.
- Implementing the marketplace-path fix alone before the shared Phoenix design
  is approved.

## Delivery shape

Phoenix is delivered as one Epic with a physical writing limit of one package:

1. establish runner-neutral ruleset identity and the shared event foundation;
2. add the human ledger, lifecycle stream, and policy foundation;
3. add the agent journal and safe external-reference adapters;
4. add the Evidence Viewer, signed bundles, ITSM composition, and event export;
5. migrate existing authority paths and pass integrated privacy, security,
   platform, review, and release gates.

Each package remains independently reviewable. The Epic closes only when every
scoped issue is implemented, verified, and dispositioned on one integrated
candidate.

## Risks and mitigation

| Risk | Mitigation |
| --- | --- |
| Agent or runtime records accidentally become approval | Separate closed record types and a resolver that accepts authority only from valid human decisions. |
| Governance capture creates a new privacy leak | Default-deny fields, redaction before any durable write, local-only bindings, size limits, and prohibited-content tests. |
| Hashes or signatures are overstated | Every view reports its exact assurance; integrity never implies identity, trusted time, custody, or compliance. |
| Policy composition silently weakens safeguards | Every policy field declares a merge rule; core floors are immutable and exceptions require explicit human authority. |
| External tools create feedback loops or stale authority | One-way projections by default; ITSM is separately authenticated and composed only at the exact release boundary. |
| Export failure loses or duplicates events | Independent local queues, at-least-once delivery, stable idempotency, typed partial states, and explicit reconciliation. |
| Epic breadth hides partial completion | One issue/acceptance matrix, dependency-ordered packages, exact evidence binding, and no completion claim with an unresolved item. |
| Parallel Sprints contaminate Phoenix | Dedicated branch, accepted public base, no unpublished sibling dependency, and integration only through a separately approved update. |

## Alternatives considered

- **Implement the issues separately.** Rejected because each would invent its
  own event, policy, integrity, and adapter semantics.
- **Use one generic audit log.** Rejected because it collapses human authority,
  agent declarations, and runtime observations.
- **Use mutable state or Git history as the ledger.** Rejected because neither
  preserves the full decision lifecycle and closed governance semantics.
- **Make an external service canonical.** Rejected because offline operation,
  field ownership, privacy, and authority would depend on a provider.
- **Export raw data and redact downstream.** Rejected because private data
  would already have crossed the first controlled boundary.
- **Patch only the observed Codex marketplace path.** Rejected because another
  runner-specific workaround would preserve the architectural defect.
- **Depend on unpublished Nova replay/execution work.** Rejected because
  Phoenix must close independently on the accepted public base.

## Coverage matrix

| Product Owner input | Where it is covered |
| --- | --- |
| Work only on the dedicated Phoenix branch | Scope validation and parallel-Sprint risk control |
| Include every open `sprint:phoenix` issue | What, Scope, and the binding issue matrix |
| Validate issue ideas instead of copying them | Architecture separation, policy merge rules, external authority boundary, and Alternatives |
| Include suitable assigned or unassigned governance backlog | Scope validation with incorporated, fixture-only, and excluded dispositions |
| Add runner-independent marketplace version/freshness | What, Scope, first delivery wave, and PHX-0 |
| Rebind a legitimately revised active-design PRD/Spec without a hand-edited State workaround | Scope, PHX-0 slice A, and the lifecycle-authority revision contract |
| Reconcile stale Phoenix lifecycle-manifest authority digests without a hand edit | Scope, PHX-0A writer transaction, and P-AC-08 |
| Audit all Pipeline-known external execution handoffs, recovery, and workarounds safely | Scope, privacy risk control, and External Command Offer profile |
| Treat completed 0.4.6 work as complete despite stale documentation | Non-goals and scope validation |
| Do not start one fix before the overall design | Delivery shape and explicit non-goal |
| Use Advisor help | Bounded primary/fallback attempts and honest unavailable result in [design/advisor-review.md](design/advisor-review.md) |
| Keep Nova, Cyborg, and Nightwing independent | Non-goals, parallel-Sprint risk control, and dependency checks |

## DoD

Phoenix is done only when the full [acceptance matrix](acceptance.md) is
implemented and proven on one exact candidate; privacy/security checks and the
high-risk independent review pass; every scoped issue has an explicit closure
mapping; no unpublished sibling work is required; migrations preserve legacy
evidence; and the Product Owner separately accepts the integrated Epic.

No external write, push, merge, release, or final acceptance is implied by
approval of this PRD.

## Phases beneath this PRD

Phoenix is delivered in phases. This PRD is the feature's single bound authority;
each phase carries its own plan document beneath it, in PRD form but deliberately
not named `prd_*.md`, because the PO gate admits exactly one PRD per active
feature directory and a second one would silently contest the authority slot.
A phase plan is approved through the ordinary `submit-plan` / `approve-plan`
transition against this PRD.

| Phase | Plan | Status |
| --- | --- | --- |
| Design | the four packages under [design/](design) | Closed 2026-08-08 — R1, R2, R3 and PHX-LEDGER-INTAKE all Critic-clean under the four-round cap |
| Gate integrity and residual closure | [phase-plan_gate-integrity.md](phase-plan_gate-integrity.md) | Awaiting PO approval |

The current phase plan closes what the design phase measured but did not repair:
verify-gate coverage becomes self-enforcing, the four current gate failures get
owners, R1's and R3's residuals are executed, and the ledger-intake design is
implemented. It carries the seven Product Owner decisions of 2026-08-08 and
states the phase's human-approval cost as a measured number rather than an
estimate.

## Decision points

1. **Approve this unified Phoenix product scope and delivery shape?**
   Recommendation: yes. It includes every labelled issue and both Product
   Owner additions while preventing eight independent, incompatible
   governance implementations.
2. **Authorize one narrow administrative repair of the inherited completed
   0.4.6 active-feature state because no sanctioned transition is available?**
   Recommendation: yes. Delete only the stranded continuity adoption,
   read back the exact change, close the old feature through the sanctioned
   writer under the Product Owner's completion disposition, and then activate
   this Phoenix PRD in design phase. Exact preimage/postimage, reason, actor,
   and no-remote-write evidence remain in
   [RECOVERY.md](RECOVERY.md).
3. **After the resulting design candidate is fixed, recognize the PO-only
   independent Critic review because the Advisor route was unavailable?**
   Decision: completed with PASS, using only the Phoenix Spec, fixed diff range,
   governance paths, evidence paths, ruleset SHA, and the standing read-only
   functional-equivalent assurance. This does not convert the Advisor outcome
   into a pass.
