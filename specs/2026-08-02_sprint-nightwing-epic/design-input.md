# Sprint Nightwing Epic — Design input

- Captured: 2026-08-02
- Lifecycle profile: Epic
- Design route: Codex Sol / xhigh
- Source class: PO direction plus public project issues and public sprint branches
- Scope baseline: Agent-Pipeline 0.4.7 `main`

This file is the sanitized source evidence for the Nightwing PRD and technical
specification. It records decisions and constraints, not a conversation
transcript. It intentionally contains no credentials, machine-local paths,
private identities, or raw command history.

## DI-1 — Context

Nightwing is the last of four concurrent feature sprints. Nova, Cyborg, and
Phoenix are being developed in parallel from the current 0.4.7 baseline.
Nightwing begins design early because its product-experience scope is broad,
but implementation must begin only after the accepted results of those three
sprints have been assembled and qualified.

The current Nightwing branch is therefore a design branch first. Its early
artifacts must remain useful after a later rebase without independently
redesigning contracts owned by the other sprints.

## DI-2 — Product goal

Develop an implementation-ready Nightwing Epic that turns the integrated
Agent-Pipeline portfolio into a coherent, low-friction and honestly governed
product experience. A user should be able to understand, install, configure,
operate, inspect, update, and trust the Pipeline without learning accidental
internal structure or losing explicit human intent.

## DI-3 — Requested behavior

1. Start from the current `main` design baseline while explicitly accounting
   for Nova, Cyborg, and Phoenix.
2. Intake every open public issue labelled `sprint:nightwing` and preserve
   issue-level traceability.
3. Treat Nightwing as one Epic with bounded implementation packages, explicit
   dependencies, acceptance gates, and a rebase/integration strategy.
4. Prepare remote and branch state fully inside the selected repository.
5. Ask a fresh read-only Advisor to challenge the proposed plan after the
   first complete design exists.
6. Revisit and optimize the design after all three prerequisite sprints have
   landed on `main`.

## DI-4 — Nightwing issue inventory

All 23 issues below were open and carried `sprint:nightwing` at intake time.
Priority markers are part of the public issue titles.

| Issue | Required outcome |
| --- | --- |
| #3 | Progressive Arbitheon product front door |
| #4 | Deterministic ten-minute Arbitheon onboarding |
| #6 | Exact-candidate GitHub PR checks from Pipeline evidence |
| #11 | Demonstrably low-ceremony Mini path |
| #19 | Evidence-backed, capability-neutral comparison |
| #20 | Prioritized roadmap and dependency map |
| #25 | Schema-driven configuration UI and portable preferences |
| #26 | Explicit per-project adoption for preference drift |
| #50 | Compatibility-safe Arbitheon display-brand rollout |
| #61 | Internally consistent, restart-safe Codex onboarding |
| #65 | Opt-in installed-artifact E2E smoke skill |
| #66 | Explicit Stable, Beta, Alpha, Pinned, and Development freshness sources |
| #67 | Integrated and qualified Nova/Cyborg/Phoenix/Nightwing portfolio candidate |
| #68 | Governed disposable session scratch root |
| #74 | Human Authority and Adoption Trust Contract |
| #75 | Runner-neutral cost-per-outcome and Critic-assurance measurement |
| #76 | Human-authorized expedited path with an auditable control floor |
| #78 | Consolidated documentation estate with governed retirement |
| #79 | Input-aware optional Design pre-stage |
| #80 | Advisor capability preflight separated from consultation |
| #96 | Intent-preserving, channel-aware install and update contract |
| #97 | PO-approved implementation design amendments without full rebaseline |
| #99 | Durable architecture-decision continuity across sessions |

The public issue metadata marks #66, #67, and #96 as blockers. Issue #67 is
both the first implementation gate and the final portfolio-qualification
umbrella; treating it as a single end-only task would violate its stated
outcome.

## DI-5 — Upstream ownership boundaries

Nightwing must consume, not duplicate, accepted contracts from:

- **Nova:** runner conformance, isolated execution, bounded scheduling and
  worker capacity, durable selected-sandbox capability, invocation-failure
  recovery, Critic convergence, backlog reconciliation, continuation, forge
  abstraction, and the executable release loop.
- **Cyborg:** policy-complete security verification, hostile-context and tool
  hardening, findings/exceptions/VEX remediation, provenance and supply-chain
  evidence, and product-security readiness.
- **Phoenix:** evidence viewing, organization policy packs, sanitized events
  and replay, external traceability/change control, human governance decisions,
  agent decision journals, and governance-event export.

Nightwing may add adapters or user-facing projections over these contracts.
It may not introduce a competing runner registry, policy hierarchy, evidence
identity, human-decision ledger, event schema, security control catalog, or
release authority.

## DI-6 — PO constraints and decisions

- Use only the public project identity and public repository information. Do
  not consume, persist, or publish private account data.
- Work only in the selected Nightwing repository and branch. Never create or
  relocate a second repository outside that workspace.
- A disposable scratch root, when #68 is implemented, is an additional
  ephemeral capability and never a second checkout or authority root.
- The duplicate legacy lifecycle state under the old runner-specific authority
  location is obsolete migration residue; retire it through the sanctioned
  neutral-authority migration and commit that retirement.
- Preserve all other Pipeline runtime and project files. A file is not obsolete
  merely because a similar projection exists elsewhere.
- Nightwing is implemented last. Rebase and merge mechanics may be complex,
  but design now must minimize later semantic conflict and keep documentation
  aligned with the final integrated behavior.
- English remains authoritative for repository documentation; collaboration
  with the PO may be in German.
- Do not assign a release version before the accepted integrated baseline and
  release plan establish it.

## DI-7 — Success expectations

- Every Nightwing issue is assigned to one bounded package and one final
  acceptance route.
- The accepted Nova, Cyborg, and Phoenix candidate identities are recorded
  before Nightwing implementation changes shared contracts.
- A fresh user can reach a verified sample outcome in at most ten documented
  minutes on supported combinations.
- Configuration and update flows preserve sparse user intent and never require
  editing generated projections.
- Human authority, exceptions, expedited delivery, Mini delivery, Advisor use,
  and architecture changes remain distinct and auditable.
- Public product claims are backed by exact evidence and typed coverage or
  limitation data.
- Documentation has a small, owned topology with no accidental second source
  of truth.
- The final portfolio candidate passes the repository's full deterministic,
  security, installed-artifact, evidence-binding, and independent-review gates.

## DI-8 — Risks

| Risk | Required response |
| --- | --- |
| Parallel sprint contracts change before merge | Re-run contract inventory after final rebase; update the Spec through reviewed authority change rather than patching around drift. |
| Shared lifecycle files create large merge conflicts | Keep the early branch design-only; implement only after #67 baseline qualification. |
| Product UX duplicates underlying policy or evidence authority | Require one named upstream owner for every cross-sprint interface. |
| Documentation ships before behavior stabilizes | Build a front-door skeleton early, finalize claims and task paths only from qualified behavior. |
| Broad Epic becomes a sequence of hidden rewrites | Use bounded vertical packages with entry/exit receipts and issue-level acceptance. |
| Metrics imply unsupported quality or cost claims | Emit typed unknown/unavailable coverage and block claims that lack evidence. |
| Convenience paths weaken controls | Keep Mini, expedited delivery, and ordinary delivery separate; define their non-waivable floors. |
| Scratch capability repeats the unsafe second-workspace pattern | Bind scratch to an ephemeral non-repository contract and test that it cannot become a checkout or authority root. |

## DI-9 — Open questions deferred to integrated-baseline review

1. What are the exact accepted commit and tree identities for Nova, Cyborg, and
   Phoenix?
2. Which shared schemas or CLI surfaces changed after this design snapshot?
3. Which Nightwing acceptance fixtures already exist upstream and should be
   extended rather than recreated?
4. What release/channel version is assigned to the final portfolio candidate?
5. Which platform/runner matrix is release-required versus evidence-limited at
   Nightwing close?

These questions do not block early design. They are mandatory inputs to the
#67 baseline gate and must not be answered by assumption.

## DI-10 — Initial slicing decision

Nightwing uses six delivery streams around a two-part integration umbrella:

1. **NW-0 Integration baseline and final qualification** — #67.
2. **NW-1 Configuration, distribution, and freshness** — #25, #26, #66, #96.
3. **NW-2 Session, onboarding, and installed experience** — #3 foundation,
   #4, #61, #65, #68, #79, #80.
4. **NW-3 Human and architecture authority** — #11, #76, #97, #99.
5. **NW-4 Evidence, assurance, and repository-host feedback** — #6, #74, #75.
6. **NW-5 Brand, documentation, comparison, and roadmap** — #3 completion,
   #19, #20, #50, #78.

Issue #3 is intentionally split into an early navigation/contract skeleton and
a late evidence-backed content completion. Issue #67 is intentionally split
into entry and exit gates. Each issue still has one owner and one final close
decision.

## DI-11 — Collision-safe early design

The PO requested an explicit preparation track for Nightwing work that can be
designed before the prerequisite sprints merge because it has no semantic
overlap, or only a narrow consumer dependency, with Nova, Cyborg, and Phoenix.

The classification is made at **issue-slice level**, never by declaring a whole
issue independent merely because one part of it is. Early design may define:

- Nightwing-owned domain vocabulary, user journeys, decision tables, and
  failure semantics;
- privacy and threat boundaries that constrain any later implementation;
- black-box acceptance scenarios and synthetic, provider-neutral test vectors;
- capability-shaped consumer expectations without choosing an upstream schema,
  writer, file path, command name, or receipt format.

Early design may not implement shared behavior, bind speculative upstream
identifiers, create compatibility forks, freeze evidence-backed product claims,
or bypass the #67 contract-revalidation gate. Every early block must name both
its collision-safe output and the integration-held surface that remains open.

In this context, `risk-free` means **collision-safe within the declared design
boundary**. It does not mean exempt from later review: every block is compared
with the accepted integrated contracts before it can receive implementation
authority.
