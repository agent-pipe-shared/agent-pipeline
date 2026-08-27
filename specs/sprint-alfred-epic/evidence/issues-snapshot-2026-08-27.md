# GitHub issue snapshot — sprint:alfred set (captured 2026-08-27)

Machine-captured via `gh issue view --json number,title,state,labels,body`
from `agent-pipe-shared/agent-pipeline` by scratch/fetch-issues-snapshot.mjs. Verbatim bodies;
no editing. Purpose: offline verification base for design-phase Critic
reviews of specs/sprint-alfred-epic/. The live issues remain authoritative.

---

## #99 — [P1][Architecture] Make project architecture decisions durable across agent sessions

State: OPEN · Labels: area:docs, area:lifecycle, enhancement, sprint:alfred

## Observation basis

Verified against release `v0.4.7` and the current `main` state at `89cb12b99e3fd86ac44878d0c23b278f00538921`.

The greenfield foundation already provides `docs/ARCHITECTURE.md`, supports references to Architecture Decision Records, and defines an immutable ADR convention. Issue #22 establishes the broader governed-document topology. However, a fresh kickoff does not currently create or require an initial architecture decision, and material choices can remain implicit in code, specifications, or one agent session's reasoning.

Issue #9 owns versioned organization policy packs, provenance, compatibility, and precedence between organization, project, and local governance. The current governance manifest can resolve advisory guidelines and enforcing policies, but it does not yet define organization- or team-level ADR sources, their applicability, or their integration into the effective architecture decision set of a project.

Repeated fresh sessions can therefore produce individually plausible projects while silently changing structural assumptions. The objective is not identical generated code. It is durable, explainable conformance to the same human-approved architecture boundaries across sessions and runners.

## Problem classification

- **Cause:** architecturally significant choices are not always promoted into durable decision authority.
- **Incorrect state classification:** a project may appear design-complete even though its architecture baseline is implicit or incomplete.
- **Recovery gap:** later sessions have no narrow governed path for recording, superseding, or explicitly waiving an inherited decision.
- **Consequence:** implementation structure, dependencies, persistence, deployment assumptions, and quality-attribute trade-offs can drift between sessions.
- **Environment boundary:** organization or team decision sources may be external to the project repository and must be resolved without copying private organizational content into public evidence.

## Outcome

Introduce **Architecture Decision Continuity**: every project receives a typed architecture-baseline assessment, and architecturally significant decisions become durable inputs to later Design, implementation, review, Critic, and restart flows.

The assessment must return one explicit result:

- `initial-adr-required`
- `architecture-baseline-sufficient`
- `no-material-architecture-decision`

The effective architecture baseline includes applicable Pipeline authority, organization and team governance, inherited architecture decisions, and project-local ADRs. A fresh session must not consider only the repository-local decision directory while silently omitting a configured higher-level decision source.

Applicable company and team ADRs or policies are **agent-enforced, human-waivable governed defaults**:

- the agent must follow them unless an authorized human explicitly decides otherwise;
- the agent may not silently ignore, weaken, reinterpret, or override them;
- a human exception must record the decision, rationale, scope, affected authority, and duration or supersession condition;
- the exception applies only to its declared scope and does not mutate or invalidate the original organization or team authority.

In short: **follow by default; deviate only through an explicit and auditable human decision.**

## Scope

### 1. Architecture-significance rubric

Define a compact, deterministic rubric for decisions that materially affect at least one of:

- system structure or component boundaries;
- runtime, framework, dependency, storage, or integration strategy;
- deployment and execution environment;
- security, privacy, reliability, portability, performance, or other quality attributes;
- choices that are costly, risky, or difficult to reverse.

Do not require an ADR for every implementation detail.

### 2. Initial architecture-baseline assessment

During greenfield onboarding and before implementation authority is granted:

- inspect PRD, specification, architecture summary, applicable inherited governance, and declared delivery constraints;
- determine whether a material decision exists;
- create or request a lean initial ADR when required;
- otherwise record the typed `no-material-architecture-decision` result with rationale;
- bind the resulting decision set into the governed lifecycle without forcing artificial ADR volume.

For a small static browser game, one concise ADR may be sufficient when it fixes material constraints such as client-only execution, dependency strategy, persistence boundary, and deployment model.

### 3. Reusable Architecture Decision Skill

Provide a project-neutral, explicitly invokable Pipeline Skill that can:

- assess whether a proposed choice is architecturally significant;
- draft a concise ADR from governed evidence;
- identify applicable inherited decisions and policies;
- propose an explicit human waiver when a project needs to deviate;
- supersede rather than rewrite accepted ADRs;
- update the living architecture summary and references;
- validate status, identity, applicability, supersession, and traceability.

The Skill must not approve its own decision or exception.

### 4. Inherited team and organization architecture

Consume the accepted policy-pack and precedence contract from #9 rather than implementing a competing policy system.

Configured organization and team decision sources must provide stable, verifiable metadata including:

- pack and decision identifiers;
- immutable version or digest;
- owning governance layer;
- status and supersession relationship;
- applicability to technology, components, project classes, quality attributes, or environments;
- authority class, including organization/team governed default, project ADR, advisory guideline, or local preference;
- compatibility and freshness information.

Directory location or a familiar folder name alone must never establish authority.

The resolver must:

- validate configured sources and consume the effective policy result from #9;
- distinguish Pipeline, managed organization/team, project, advisory, and local layers;
- select only decisions relevant to the current project and explain why each applies;
- include applicable decisions in architecture assessment, Design, dispatch, review, and Critic context;
- reference inherited decisions by stable identity and digest instead of copying complete company or team documents into the project;
- return typed diagnostics for missing, stale, incompatible, ambiguous, superseded, or conflicting authority;
- preserve privacy by sanitizing organization coordinates and private source details from public evidence.

A project ADR may specialize an inherited decision within an allowed extension boundary. It may not silently weaken it. Any departure requires an explicit, auditable human exception tied to the exact higher-level authority and affected scope.

Conflict handling must distinguish:

- an applicable governed default with no exception: the agent follows it;
- an explicit human exception: the agent follows the scoped exception and preserves the original authority reference;
- incompatible inherited decisions: resolution is requested from the owning or authorized human layer;
- project ADR versus higher-level authority: rejected unless a valid scoped exception exists;
- advisory deviation: allowed only with a named rationale when the advisory source requires acknowledgement;
- unavailable optional guidance: reported as typed and unsatisfied, but not falsely treated as consumed;
- unavailable mandatory governance source: blocks the dependent decision until restored or explicitly handled by authorized human policy.

Local preferences apply only where higher layers are silent and do not become architecture authority by default.

### 5. Bounded session consumption

Fresh sessions and resumed sessions must receive the same effective decision set without loading an unbounded document estate. Context should include relevant decision summaries, identities, applicability, current status, supersession links, and any active human exceptions.

The resolved set must remain stable across supported runners, restarts, and compaction.

### 6. Architecture-impact lifecycle

Every Epic, Feature, Sprint, and Mini close must report one typed architecture impact:

- `architecture-conforms`
- `architecture-decision-added`
- `architecture-decision-superseded`
- `architecture-summary-updated`
- `no-architecture-impact`

Issue #97's governed change-request path must consume this result so that bounded implementation-phase changes can update or supersede architecture authority without reopening the complete Design phase.

Session checkpoints that exit without reaching a close path are deliberately out of scope for this typed reporting duty: they are covered by the push-boundary architecture-freshness enforcement defined in #106, which records typed staleness debt at checkpoint pushes and requires its consumption before the next session obtains implementation authority.

### 7. Review and recovery

- Critic verifies semantic conformance to applicable decisions and active exceptions, not merely the presence of ADR files.
- Missing or stale summaries receive a narrow, typed repair path.
- Changed material architecture without a decision, supersession, or exception fails closed before final acceptance.
- Recovery must not fabricate historical decisions or infer human approval.

### 8. Existing-project adoption

Provide deterministic adoption for projects that predate the feature:

- inventory current architecture evidence;
- identify material implicit choices;
- allow a human to approve a present-state baseline;
- create forward-looking ADRs without pretending they existed historically;
- preserve existing code and history unless an independently approved change requires modification.

## Acceptance criteria

- A greenfield project receives exactly one typed architecture-baseline result before implementation authority.
- A material greenfield choice produces a lean ADR; a genuinely trivial case may produce `no-material-architecture-decision` with evidence.
- A configured organization policy pack and team ADR pack are resolved before the initial architecture assessment.
- Applicable inherited decisions are included in Design, dispatch, review, and Critic context.
- An irrelevant ADR is not loaded merely because it resides in the same directory or pack.
- Without an explicit human exception, the agent follows every applicable company/team ADR or policy.
- A human can authorize a scoped deviation that records rationale, affected authority, scope, and lifecycle; the original authority remains intact.
- A project ADR can specialize inherited guidance but cannot silently weaken it.
- Conflicts identify the exact higher-level authority and required decision owner.
- Missing packs, digests, versions, applicability metadata, and supersession state produce typed diagnostics.
- Advisory guidance, inherited governed defaults, project ADRs, local preferences, and human exceptions retain distinct semantics.
- Referenced organization/team decisions are immutable and digest-bound rather than copied wholesale into the project.
- Public evidence sanitizes private pack locations, organization coordinates, accounts, and repository details.
- Two fresh supported-runner sessions resolve the same effective architecture constraints and active exceptions.
- A later incompatible framework, backend, storage, or deployment change is blocked until an ADR, supersession, or explicit human exception authorizes it.
- A superseding ADR preserves the old decision and updates the living architecture summary.
- Epic, Feature, Sprint, and Mini close paths record one typed architecture-impact result.
- Deterministic tests cover decision identity, applicability, precedence, exception scope, status, supersession, freshness, restart behavior, and runner parity.
- Critic tests prove semantic conformance and detect a token ADR that does not match the implementation.
- Existing-project migration creates no fabricated history.

## Non-goals

- Requiring an arbitrary minimum number of ADRs.
- Recording every low-level implementation choice.
- Requiring identical generated code across independent runs.
- Permanently freezing architecture.
- Replacing PRDs, specifications, user documentation, tests, or human approval.
- Trusting directory or folder names as proof of authority.
- Reimplementing the organization policy-pack system owned by #9.
- Allowing a project ADR to silently override organization or team governance.
- Copying a complete company decision repository into each project.
- Treating an external knowledge-base page as authority without the provenance and revision binding owned by #9 and #23.
- Retroactively claiming that newly captured decisions existed before adoption.

## Related work

- #22 defines the governed document topology and ADR artifact class.
- #4 owns the short greenfield onboarding flow and should consume the baseline assessment.
- #9 owns organization policy identity, provenance, compatibility, and precedence; this issue consumes that contract.
- #23 owns external work-system and knowledge-base projections; external content cannot become authority without provenance.
- #79 may surface architecture choices during the optional Design pre-stage but must not approve them.
- #97 should consume architecture impact and supersession during bounded implementation-phase change requests.
- #78 owns the user-facing documentation system; it should document how humans inspect decisions and authorize exceptions.
- #104 and #106 consume this issue as durable architecture authority; co-scheduling in Sprint Alfred removes their provisional-identity fallback as the default path.
- #108 assembles and qualifies the Sprint Alfred candidate and performs the final integrated validation for this issue.

## Delivery classification

- **Sprint:** Alfred
- **Priority:** P1
- **Size:** XL

Detailed slicing remains the responsibility of the Alfred Design phase.

---

## #101 — [P1][Security] Make the protected-path baseline immutable and self-protecting

State: OPEN · Labels: area:security, sprint:alfred

## Observation basis

Validated on 2026-08-03 against Agent-Pipeline `0.5.1`, current `main` commit `5d2b83dcc765d50801f4491e1bd9bed32090112b`.

The repository's `.claude/guard-config.json` identifies protected tests, verification scripts, and hooks. It does not protect itself. The current `guard-testpath.mjs` contract also treats missing configuration as no protected paths, and project configuration can replace the complete protected-path list.

As a result, an agent can weaken the guard that protects verification surfaces by first changing the configuration used by that guard.

## Problem

A mutable project file is the sole source of the protected-path set and can subtract the very surfaces that are intended to detect control weakening.

This remains a concrete self-protection gap after the broader definition-integrity and change-integrity work delivered for #46.

## Outcome

Ship an immutable minimum protected-surface baseline with the Pipeline and let project configuration add protection without being able to remove or shadow that baseline.

## Scope

1. Define a versioned, plugin-owned minimum baseline covering at least:
   - the effective guard configuration;
   - the baseline definition and loader;
   - guard and authority hook implementations;
   - their contract tests;
   - shared Verify registration and integrity checks; and
   - sanctioned writers that may change protected policy.
2. Merge project additions with the shipped baseline using deterministic additive semantics.
3. Treat absent, unreadable, malformed, duplicate, or conflicting project configuration as baseline-only operation with a typed diagnostic, never as an empty baseline.
4. Detect attempts to subtract, shadow, redirect, or ambiguously override a baseline entry.
5. Bind the effective baseline revision and digest into verification evidence.
6. Provide migration/readback for existing project configurations.
7. Add fixtures for direct self-edit, list removal, empty config, malformed JSON, path aliasing, case variation, symlink/reparse ambiguity, and valid additive extension.

## Acceptance criteria

- [ ] Removing every project-defined protected path leaves the shipped minimum baseline effective.
- [ ] The effective guard configuration cannot authorize its own weakening.
- [ ] Missing or malformed project configuration never produces zero protection.
- [ ] Project-defined protection remains additive and backward-compatible.
- [ ] Baseline identity and effective merged identity are deterministic and evidence-bound.
- [ ] Every supported mutation path receives the same protected-surface decision.
- [ ] Regression fixtures run in shared Verify.
- [ ] Closure identifies the exact merged commit and focused test evidence.

### Documentation acceptance

- [ ] User documentation explains the immutable minimum baseline, additive project configuration, invalid-configuration behavior, diagnostics, recovery, and migration.
- [ ] Security and maintainer documentation records baseline ownership, version/digest semantics, sanctioned writers, loader behavior, and shared Verify coverage.
- [ ] Documentation is verified against the exact accepted candidate and the closing comment links the updated user and technical documentation.

## Non-goals

- Preventing the human repository owner from editing files outside an agent-controlled execution path.
- Treating every project file as protected.
- Replacing organization policy precedence or the broader #46 authority model.
- Automatically repairing arbitrary project configuration.

## Related work

- #46 established definition integrity, bounded task authority, and independent control-change review.
- #42 established policy-complete security verification.

This is a current-core hardening item and must not expand an active Sprint branch.

## Priority / size

P1 / M

---

## #102 — [P1][Lifecycle] Protect approved design authority from implementation-time writes

State: OPEN · Labels: area:docs, area:lifecycle, area:security, sprint:alfred

## Observation basis

Validated on 2026-08-03 against Agent-Pipeline `0.5.1`, current `main` commit `5d2b83dcc765d50801f4491e1bd9bed32090112b`.

The current plan lifecycle binds approval to exact PRD and Spec digests. `guard-devplan.mjs` protects the exact authority documents while a submission awaits approval, but exits successfully as soon as the lifecycle is a current `implementing` state. The exact approved PRD or Spec can therefore receive an initial implementation-time write. Digest drift becomes visible only after the authoritative bytes have already changed.

The workflow dispatch preflight already prevents non-Coordinator packages from writing global PRD/Spec authority. The remaining gap is the active Coordinator/tool execution path and any equivalent supported mutation route.

## Problem

Approved design authority is cryptographically bound but not sealed against direct agent-driven modification during implementation.

A later drift failure is valuable detection, but it is not a substitute for preventing the unauthorized first write.

## Outcome

Make the exact approved PRD and Spec immutable to agent/tool mutation throughout implementation. Design changes must travel through a sanctioned authority transition rather than direct file editing.

## Scope

1. Resolve the exact current authority paths and digests from validated lifecycle state.
2. Block Edit, Write, shell-based mutation, and equivalent supported write routes against those exact files while implementation authority is active.
3. Keep clearly separated proposal, analysis, scratch, and change-request artifacts writable within their own declared scope.
4. Admit new authority only through:
   - the existing `reopen-design` transition; or
   - the bounded PO-approved amendment path defined by #97 when available.
5. Treat out-of-band byte drift as invalidated authority requiring recovery; do not silently bless the new bytes.
6. Preserve the human root of authority: the control constrains agent/tool execution and does not claim that the Pipeline can prevent the repository owner from acting outside it.
7. Produce typed, sanitized diagnostics naming the sanctioned next action.
8. Add runner-neutral fixtures for exact PRD/Spec writes, neighboring proposal documents, command-mediated writes, aliases/symlinks, stale state, restart, and approved authority transition.

## Acceptance criteria

- [ ] An agent/tool cannot directly change the approved PRD or Spec during implementation.
- [ ] The first attempted unauthorized write is blocked before bytes change.
- [ ] Proposal and change-request artifacts remain available without becoming authority.
- [ ] `reopen-design` remains a valid recovery path.
- [ ] #97 can promote an accepted amendment without introducing a bypass.
- [ ] Out-of-band authority drift remains visible and non-green.
- [ ] Behavior is consistent across supported runner mutation routes.
- [ ] Closure identifies the exact merged commit and focused test evidence.

### Documentation acceptance

- [ ] User documentation explains approved PRD/Spec immutability, sanctioned reopen/amendment paths, drift recovery, and actionable diagnostics.
- [ ] Lifecycle and authority documentation records protected states and surfaces, mutation-route coverage, transition semantics, evidence, and runner-neutral verification.
- [ ] Documentation is verified against the exact accepted candidate and the closing comment links the updated user and technical documentation.

## Non-goals

- Preventing a human owner from editing the repository outside the Pipeline.
- Making every document immutable.
- Reimplementing the amendment lifecycle owned by #97.
- Treating an agent-authored proposal as accepted authority.

## Related work

- #97 owns bounded PO-approved design amendments.
- #46 owns bounded package authority and control-change integrity.
- #99 owns durable architecture decisions across sessions.

This is a current lifecycle-authority hardening item and must not expand active Nightwing scope.

## Priority / size

P1 / M

---

## #103 — [P1][Telemetry] Separate planned gates from unplanned workflow interruptions

State: OPEN · Labels: area:lifecycle, area:telemetry, enhancement, sprint:alfred

## Observation basis

Validated on 2026-08-03 against Agent-Pipeline `0.5.1`, current `main` commit `5d2b83dcc765d50801f4491e1bd9bed32090112b`.

The Pipeline exposes many typed `*-REQUIRED`, stale, unavailable, invalid, and recovery outcomes across planning, invocation, verification, review, authority, and close. Existing work already covers important portions:

- #38: invocation reliability and contract repair;
- #54: Critic dispatch validity and bounded correction;
- #75: runner-neutral cost and Critic assurance.

There is no common accounting contract that distinguishes an expected lifecycle gate from an unplanned interruption and measures how long the workflow remains unable to make planned progress.

## Problem

Today, a successful eventual outcome can hide repeated interruptions, repair loops, waiting time, and avoidable process friction.

Conversely, counting every non-pass outcome as an incident would misclassify intentional human gates and normal lifecycle control as failure.

Without a typed distinction, the Pipeline cannot reliably answer:

- which gates are expected and planned;
- which events unexpectedly interrupt planned progress;
- which categories recur by phase, runner, role, or contract;
- how much wall time and retry work each interruption consumes; and
- whether a repair actually reduced recurrence.

## Outcome

Add a privacy-bounded, runner-neutral **Workflow Interruption Receipt** and local aggregation model that separates planned gates from unplanned interruptions and measures recovery cost.

## Classification contract

At minimum distinguish:

1. `planned-gate` — an expected lifecycle decision or evidence boundary reached in the normal declared path;
2. `unplanned-interrupt` — a contract, invocation, state, drift, availability, or recovery condition that prevents the declared next step;
3. `external-wait` — a declared wait for a human or external authority whose duration is observable but not classified as a Pipeline defect;
4. `terminal-blocker` — a non-recoverable or deliberately stopped condition; and
5. `unknown` — insufficient evidence, never silently reclassified.

The registry and derivation rules are versioned. Free-text model judgment cannot be the sole classifier.

## Scope

1. Emit one normalized receipt containing:
   - event and lineage ID;
   - feature/package/dispatch and phase;
   - runner/role where observable;
   - original typed code and normalized category;
   - planned/unplanned classification and derivation revision;
   - first-observed, resolved, or terminal timestamps;
   - blocked wall time;
   - attempt and recovery counts;
   - sanctioned resolution reference;
   - exact candidate/evidence binding where applicable; and
   - measured, estimated, unavailable, or unknown collection status.
2. Reuse #38 attempt/repair identities, #54 review lineages, and #75 usage/cost evidence instead of creating competing schemas.
3. Produce local reports by phase, code family, runner, role, recurrence signature, and resolution class.
4. Keep raw prompts, full transcripts, secrets, private paths, account identities, and unrelated source content out of receipts.
5. Preserve skipped, unavailable, unresolved, and unknown outcomes as non-green.
6. Dogfood the receipt for at least two weeks before defining optimization thresholds or public claims.
7. Keep external installation surveillance and undeclared outbound telemetry out of scope.

## Acceptance criteria

- [ ] Planned gates and unplanned interruptions have deterministic, testable classification.
- [ ] Repeated attempts correlate to one interruption lineage rather than inflating independent counts.
- [ ] Blocked wall time and recovery effort are visible without inventing unavailable provider data.
- [ ] #38, #54, and #75 evidence can be joined through stable identifiers.
- [ ] Missing telemetry is distinguishable from zero.
- [ ] Local aggregation exposes the highest recurring interruption categories and their resolution effectiveness.
- [ ] Receipts contain no prohibited private data.
- [ ] A two-week dogfood baseline is recorded before threshold-dependent policy work consumes the metrics.
- [ ] Core behavior requires no hosted analytics service.

### Documentation acceptance

- [ ] User documentation explains the interruption categories, local reports, privacy boundary, unknown/unavailable states, and interpretation of the dogfood baseline.
- [ ] Telemetry reference documentation records the versioned registry, receipt fields, lineage/join semantics, retention/privacy rules, and verification fixtures.
- [ ] Documentation is verified against the exact accepted candidate and the closing comment links the updated user and technical documentation.

## Non-goals

- Treating every human approval gate as a defect.
- Replacing cost telemetry, Critic economics, or invocation repair owned by existing issues.
- Anonymous or mandatory external usage telemetry.
- Automatically changing policy from a short or incomplete baseline.

## Priority / size

P1 / L

---

## #104 — [P1][Architecture] Make agent-first architecture the measurable default

State: OPEN · Labels: area:lifecycle, area:routing, area:telemetry, enhancement, sprint:alfred

## Observation basis

Validated on 2026-08-03 against Agent-Pipeline `0.5.1`, current `main` commit `5d2b83dcc765d50801f4491e1bd9bed32090112b`.

The current core already provides bounded task/path authority, independent sensitive-delta checks, exact-candidate evidence, and emerging durable architecture decisions in #99. Those controls answer whether an agent may operate on a surface and whether sensitive changes were checked.

They do not define a product-level architecture optimized for repeated agent delivery, make it the inherited default, or measure whether a project-specific alternative works better.

## Problem

Architecture guidance is commonly derived from human team topology, communication cost, and long-lived individual comprehension. Those concerns remain relevant where humans maintain the system, but they are no longer the primary organizing force for agent-first delivery.

For the Pipeline, architecture should primarily follow durable information, authority, side-effect, contract, and verification boundaries. A fresh agent session must be able to re-establish sufficient context, change a bounded surface, and verify the result without loading or rediscovering unrelated implementation.

Without a defined default:

- module shape remains an aesthetic or prompt-level suggestion;
- a new project can silently inherit human-centered structure;
- agents may repeatedly traverse implementation outside the declared module;
- contracts can remain incomplete because the current model inferred the missing information;
- context and re-entry cost remain invisible;
- recommendations arrive only after expensive structural debt exists; and
- "agent-friendly" cannot be distinguished from arbitrarily small files or excessive facades.

Prompt instructions, role prose, an ADR summary, or an agent's statement that it followed good architecture are not mechanical controls and cannot satisfy this outcome.

## Outcome

Define, ship, and dogfood a versioned **Agent-First Architecture Standard** as the measurable default for new projects, new modules, and architecture-impacting Feature/Epic work.

The standard defines functional properties of good agentic architecture. It does not mandate one directory layout, language, framework, file size, or module count.

The Pipeline:

1. inherits the standard when no accepted project-specific profile exists;
2. evaluates it mechanically through #106;
3. measures whether it is effective through candidate-bound module/contract receipts;
4. actively proposes compliant architecture during planning rather than waiting for post-implementation review; and
5. allows the human/PO to select a durable custom architecture profile while continuing to measure its outcomes.

## Definition of good agentic architecture

The first profile must turn each property into versioned machine-readable declarations, observable signals, or deterministic checks.

### 1. Context locality

A bounded task should obtain sufficient context from the module's declared contract, architecture map, and directly owned surface without routinely loading unrelated implementation.

Measure at least:

- modules/files consulted;
- interface/contract reads versus foreign implementation reads;
- cross-module traversal;
- wall time to establish sufficient context;
- runner-reported context/token dimensions where available; and
- unknown/unavailable measurement status.

### 2. Contract sufficiency

Every governed module exposes enough stable, current information for another agent/session to use or modify it safely:

- responsibility and non-responsibilities;
- public inputs, outputs, invariants, errors, and side effects;
- dependency and authority boundaries;
- compatibility and lifecycle expectations;
- verification entry points; and
- exact implementation/contract revision binding.

A prose description alone is not sufficient. Contract presence, identity, freshness, coverage class, and implementation agreement require mechanical evidence.

### 3. Change locality

A normal bounded change should remain predominantly inside one declared module or an explicitly planned small boundary set.

Measure:

- late write-scope expansion;
- unrelated module edits;
- hidden dependency discovery;
- cross-boundary correction work; and
- architecture-related review findings.

### 4. Dependency legibility

Dependencies are explicit, directional, graphable, and evaluated against a closed profile. Cycles, forbidden direction, implicit global access, and undeclared cross-module reach are mechanically detectable where the configured analyzer contract claims coverage.

### 5. Authority and side-effect locality

Filesystem, network, credential, state, deployment, and other consequential effects are owned by explicit boundaries. A module contract states which effects it can request or perform; prompt intent cannot grant or broaden them.

### 6. Verification locality

Each module or bounded module set exposes deterministic verification sufficient to test its contract and affected integration surface without requiring an unrelated full-system model judgment.

### 7. Session re-entry stability

A fresh supported runner/session can reconstruct the accepted architecture, current contracts, relevant decisions, and sanctioned next actions from durable project artifacts rather than conversational memory.

### 8. Parallel work safety

Boundaries support independent work packages with explicit contracts, controlled overlap, deterministic integration evidence, and no implicit shared-write authority.

### 9. Refactorability without structural churn

Mechanical refactoring may be cheap for agents, but accepted module identities, contracts, and architecture decisions remain stable until evidence supports a deliberate change. The standard prevents metric-driven module fragmentation, duplicated facades, and constant topology churn.

## Default, applicability, and override

### Greenfield and new architecture

For a new project or new governed module:

- the active profile defaults to the shipped `agent-first` standard;
- planning must produce a machine-readable architecture disposition before implementation authority;
- the disposition maps proposed modules/contracts/dependencies/effects/verification to the profile; and
- unresolved required properties prevent a full architecture-ready claim.

A missing project profile means `inherited-agent-first`, not `unconfigured` and not pass-by-absence.

### Existing repositories

Adopt through:

1. read-only architecture and interaction inventory;
2. exact accepted baseline;
3. visible current deviations and unknown coverage;
4. net-new/worsened-deviation ratchet through #106; and
5. evidence-backed opportunistic improvement.

No all-at-once restructuring is required.

### Human/PO override

The human/PO may select a custom architecture profile or override a default property through a durable, versioned architecture decision.

The decision records:

- affected project/modules/properties;
- rationale and trade-offs;
- custom rule/profile revision;
- required safety floors that remain non-overridable;
- review/supersession conditions; and
- exact baseline from which outcomes are measured.

A deliberate custom architecture is not automatically a waiver or defect. It remains measurable and must not be silently replaced by the default. An agent cannot create, approve, broaden, or infer the override.

## Governed module inventory

Resolve module/package identities from the effective standard/custom profile and accepted project authority, consuming #99 when available.

Record:

- module identity and versioned boundary;
- owned paths and public contract surfaces;
- allowed dependency direction;
- authority and side-effect ownership;
- verification entry points;
- accepted architecture/ADR references;
- effective profile source (`inherited-agent-first` or accepted custom); and
- exact candidate/baseline binding.

Do not invent accepted boundaries solely from directory names or one model's interpretation.

## Navigation and re-entry representation

The machine-readable architecture navigation artifacts (architecture map/index, architecture summary, and decision index) are resolved through a pluggable representation contract with one shipped default representation:

- the shipped default targets conformance with the Open Knowledge Format (OKF) at an exactly pinned specification revision whose identity and digest are recorded in the effective profile;
- switching or upgrading the representation (including an OKF revision change) is a governed profile transition through #99, never silent drift;
- representation metadata (including OKF provenance, trust, lifecycle, or attestation fields) is represented state only; it can never substitute for the mechanical evidence, digest binding, and candidate binding required by #106; and
- conformance of the produced bundle to the pinned representation revision is itself mechanically checkable evidence.

The concrete representation decision for the first increment is recorded as an architecture decision during the Sprint design phase using the #99 machinery.

## Module Interaction and Contract Sufficiency Receipt

For each applicable task, record where observable and policy-permitted:

- declared primary module and planned write surface;
- modules and files consulted;
- interface/contract reads versus implementation reads;
- cross-module traversal and graph fan-in/fan-out;
- context/token dimensions using #75 semantics;
- interruption and repair lineages from #103;
- invocation retries from #38;
- late write-scope expansion;
- architecture-related Critic findings and correction cycles from #54;
- wall time to establish sufficient context;
- profile conformance/deviation references; and
- measured, estimated, unavailable, or unknown status for every metric.

Never record raw prompts, hidden reasoning, full transcripts, secrets, private paths, or unrelated source.

## Contract-sufficiency signals

Derive evidence-backed signals for at least:

- missing required contract;
- contract contradicted by implementation;
- stale contract or architecture view;
- foreign implementation inspection required beyond the accepted boundary;
- hidden dependency or cyclic traversal;
- repeated cross-boundary lookup;
- late scope expansion;
- review-discovered architecture assumption;
- verification not locally available;
- authority/side-effect ownership unclear; and
- sufficient contract for the bounded task.

Signals preserve uncertainty and cannot claim semantic completeness from file counts alone.

## Active architecture optimization

At planning, and again when actual evidence diverges, produce a decision-ready comparison of plausible remedies:

- clarify or generate a contract;
- improve machine-readable architecture navigation;
- change dependency direction;
- split or merge a module;
- expose a stable facade;
- localize verification or side-effect ownership;
- repair a Pipeline dispatch/context contract;
- select or retain a custom architecture with an explicit PO decision; or
- gather more evidence.

The standard recommendation is active by default. Implementation or architecture mutation still requires ordinary project authority and the #106 fitness contract.

Use #93 for reuse/build/capability alternatives where applicable and #99 for durable architecture authority.

## Acceptance criteria

- [ ] A versioned machine-readable definition of good agentic architecture exists and covers context, contracts, change, dependencies, authority/effects, verification, re-entry, parallelism, and controlled refactoring.
- [ ] Good architecture is not represented or accepted solely as prompt, role, guideline, or prose input.
- [ ] New projects/modules inherit the agent-first standard when no custom profile is accepted.
- [ ] Planning actively produces and evaluates an architecture disposition before implementation authority.
- [ ] Existing repositories can adopt through baseline and ratchet without a cliff migration.
- [ ] The PO can select a durable custom profile without losing measurements or being repeatedly overridden by the default.
- [ ] An agent cannot create or infer a custom-profile override.
- [ ] Module identities and boundaries come from effective architecture authority or remain explicitly provisional.
- [ ] Architecture navigation/re-entry artifacts are produced through the pluggable representation contract; the shipped default is conformant to the pinned OKF specification revision recorded in the effective profile, and the representation choice is recorded as a durable architecture decision.
- [ ] Representation metadata (including provenance, trust, or attestation fields) never satisfies a mechanical property by itself; bundle conformance to the pinned representation revision is mechanically validated.
- [ ] Candidate-bound receipts measure context locality, cross-module traversal, hidden coupling, late scope expansion, and contract-related rework without raw conversational content.
- [ ] Missing telemetry is distinguishable from zero and from sufficient context.
- [ ] The same fixed workload can compare the standard and a custom architecture before and after structural change.
- [ ] Measurements cannot automatically authorize a refactor or weaken non-overridable safety floors.
- [ ] Fixtures cover inherited greenfield default, accepted custom profile, cohesive module, missing/stale/contradictory contract, hidden dependency, cyclic traversal, misleading tiny-module optimization, late scope expansion, unavailable context telemetry, and legitimate cross-module work.

### Documentation acceptance

- [ ] User documentation explains the inherited agent-first default, applicability, PO-controlled custom profiles, measurements, interpretation, and known limitations.
- [ ] Architecture reference documentation publishes the versioned property IDs, profile/schema semantics, precedence, metrics, calibration method, and worked examples.
- [ ] Documentation is verified against the exact accepted candidate and the closing comment links the updated user and technical documentation.

## Non-goals

- One universal ideal module/file size or module count.
- Recreating human team boundaries as the default architecture.
- Optimizing only for token count.
- Recording prompts or hidden reasoning.
- Replacing runtime performance, security, human architecture authority, or #99.
- Automatically restructuring a repository.
- Treating prompt compliance as architecture evidence.
- Coupling the standard permanently to one external knowledge format: the representation contract keeps the shipped OKF default swappable through a governed decision.

## Related work

- #99 establishes durable architecture decisions.
- #106 mechanically enforces the effective standard/custom profile.
- #105 consumes architecture deviations and measured friction as rigor inputs.
- #109 consumes the representation default for the brownfield adoption bundle.
- #93 owns evidence-backed reuse/build and capability recommendations.
- #38, #54, #75, and #103 provide repair, review, cost, and interruption inputs.

## Priority / size

P1 / L

---

## #105 — [P1][Governance] Derive a deterministic minimum rigor floor from change surface

State: OPEN · Labels: area:lifecycle, area:routing, enhancement, sprint:alfred

## Observation basis

Validated on 2026-08-03 against Agent-Pipeline `0.5.1`, current `main` commit `5d2b83dcc765d50801f4491e1bd9bed32090112b`.

The Pipeline has explicit lifecycle profiles and a deterministic Mini eligibility proposal in #11, but broader process rigor is still selected through a mixture of human/agent judgment and task framing. The same material change can therefore enter different control paths depending on how it is described.

Issue #103 distinguishes planned gates from unplanned interruption cost. Issue #104 defines the measurable Agent-First Architecture Standard. Issue #106 mechanically evaluates the effective standard/custom architecture profile.

Those contracts provide observable inputs; they do not themselves derive the minimum lifecycle rigor owed by one change.

## Problem

The actor implementing a change can influence how much process the change appears to require.

A purely model-judged control level is vulnerable to inconsistency and optimistic classification. Prompting an agent to “use good architecture” or asking it to self-report compliance does not constrain its route and cannot lower the required controls.

A purely path- or diff-size-based rule is also insufficient because small changes to authority, security, public contracts, architecture boundaries, dependencies, workflows, or irreversible effects can be consequential.

The Pipeline needs a deterministic minimum floor while preserving human authority to demand more rigor and to select a durable custom architecture.

## Outcome

Derive a versioned **Minimum Rigor Floor** from the human-approved planned change surface, effective architecture profile, and mechanically observed impact. Re-evaluate it against the actual candidate before review/close.

The floor is asymmetric:

- the human/PO may always escalate rigor;
- the Pipeline mechanically escalates when the surface, architecture impact, uncertainty, or actual evidence grows;
- an agent may propose the planned surface but cannot lower the derived floor;
- prompt, role, prose, or self-attested architecture compliance has no authority;
- a human-approved custom architecture profile is a valid project decision, not automatically a waiver; and
- lowering a mandatory safety/control floor still requires an explicit, bounded, expiring human decision with visible non-default evidence.

## Scope

### 1. Observable input contract

Define provider-neutral inputs including at least:

- planned and actual paths/modules;
- protected authority, guard, policy, security, workflow, release, and evidence surfaces;
- public API/schema/contract changes;
- dependency and toolchain changes;
- data migration or persistent-state effects;
- external/network/credential effects;
- reversibility and rollback evidence;
- diff size and generated/binary content;
- cross-module scope and architecture-impact disposition;
- effective architecture profile ID, source, revision, and digest;
- inherited Agent-First Architecture Standard versus accepted custom profile;
- #104 context-locality, contract-sufficiency, change-locality, re-entry, and verification-locality signals;
- #106 planned/actual fitness violations, baseline changes, exceptions, and unknown coverage;
- late architecture or write-scope expansion;
- required human or external decisions; and
- uncertainty/unknown inputs.

Inputs are exact-candidate- or approved-plan-bound. Unknown is never silently treated as low rigor.

### 2. Deterministic derivation

Produce:

- minimum lifecycle profile/control set;
- required architecture/design/evidence and independent review classes;
- escalation and reauthorization triggers;
- derivation revision and input/profile digests;
- human-selected effective rigor when it is higher; and
- a typed explanation suitable for planning and review.

Keep change risk classification separate in the first increment. The floor may consume risk-relevant facts, but it must not pretend that one scalar score replaces security, operational, product, or architecture judgment.

### 3. Architecture-derived rigor

For architecture-applicable work:

1. no explicit project profile means the inherited agent-first standard from #104;
2. an accepted custom profile is consumed exactly as durable architecture authority;
3. missing, stale, invalid, or unevaluable effective-profile evidence prevents a low-rigor classification;
4. new/worsened #106 violations, architecture-boundary changes, missing contracts, hidden side-effect ownership, late cross-module expansion, or unresolved analyzer coverage escalate rigor or require reauthorization;
5. sustained high #104 context/re-entry/rework signals trigger an architecture review requirement once calibrated thresholds are accepted; and
6. an agent statement, plan sentence, prompt instruction, or prose ADR summary cannot satisfy mechanical profile evidence.

A PO-selected custom profile does not raise rigor merely because it differs from the standard. Its concrete impact and remaining safety floors determine the result. A late or self-inferred profile change is invalid authority.

### 4. Planned versus actual surface

- Derive the initial floor from an accepted planned surface and effective architecture profile.
- Recompute against the actual candidate, actual graph, and fitness evidence before review/close.
- Actual-surface growth may only retain or escalate the floor.
- A narrower final diff does not silently erase gates already required or evidence already collected.
- Material unplanned expansion or profile drift triggers reauthorization rather than retroactive self-approval.

### 5. Human authority and exceptions

- Human escalation is immediate and needs no waiver.
- A durable custom architecture profile is recorded through #99/#104 authority and remains effective until superseded according to its own decision.
- A decision that lowers a mandatory safety/control floor is explicit, scoped, reasoned, expiring, candidate/plan-bound, and recorded through existing authority evidence.
- Agents cannot create, sign, consume, renew, broaden, or infer an override/de-escalation decision.
- Skipped, waived, unknown, or unavailable evidence remains visibly non-green.

### 6. Calibration and rollout

- Consume the two-week dogfood baseline from #103 before fixing optimization thresholds.
- Use #104 measurements to calibrate agent-architecture friction thresholds against fixed workloads.
- Preserve #11's deterministic Mini fast lane as a consumer/special case, not a duplicate classifier.
- Start new derivation rules in report-only comparison mode, then promote accepted rules deliberately.
- Record disagreements between current selected rigor and derived floor to test false escalation and under-classification.
- Do not leave mandatory mechanical architecture invariants in report-only mode merely because prompt guidance exists.

## Acceptance criteria

- [ ] The same normalized change surface and effective architecture profile always produce the same minimum floor for one derivation revision.
- [ ] Authority, security, architecture-boundary, public-contract, dependency, workflow, release, and irreversible-effect changes cannot be classified as low rigor solely because the diff is small.
- [ ] Unknown material or architecture inputs do not lower the floor.
- [ ] The agent cannot lower the floor through prompt/prose compliance, route selection, profile inference, or self-issued evidence.
- [ ] Applicable work without a custom profile consumes the inherited agent-first standard.
- [ ] A valid PO-approved custom profile is consumed without being silently replaced or automatically stigmatized as a waiver.
- [ ] New/worsened fitness violations, missing contracts, late cross-module expansion, and profile drift deterministically escalate or reauthorize.
- [ ] Calibrated sustained context/re-entry/rework friction can trigger required architecture review.
- [ ] Planned and actual surfaces, graphs, and profiles are bound and compared.
- [ ] Actual scope growth escalates or reauthorizes before close.
- [ ] Human escalation remains friction-light.
- [ ] Human lowering of a mandatory control floor is bounded, expiring, auditable, and never represented as pass.
- [ ] #11 can consume the common derivation without losing its deterministic Mini outcome.
- [ ] Fixtures cover low-risk local work, inherited agent-first default, accepted custom profile, missing/stale profile, small protected-surface edit, dependency/public-contract change, architecture violation, late expansion, high context friction, unknown data, human escalation, valid de-escalation, replay, and expiry.

### Documentation acceptance

- [ ] User documentation explains minimum-rigor derivation, material escalation from small diffs, custom-profile handling, human escalation/de-escalation, and diagnostics.
- [ ] Governance reference documentation records the versioned derivation registry, inputs, precedence, evidence outcomes, exception semantics, and conformance fixtures.
- [ ] Documentation is verified against the exact accepted candidate and the closing comment links the updated user and technical documentation.

## Non-goals

- One universal numeric risk or architecture score.
- Eliminating human judgment or durable custom architecture.
- Letting the agent choose or lower its own controls.
- Treating prompt compliance as architecture evidence.
- Equating code size or token count with consequence.
- Replacing #11, #85, #99, security policy, #104, or #106.

## Related work

- #11 owns the low-ceremony Mini path.
- #85 owns consequential means/action admission.
- #99 owns durable architecture decisions.
- #103 provides interruption baselines.
- #104 defines and measures the Agent-First Architecture Standard.
- #106 mechanically evaluates the effective architecture profile.

## Priority / size

P1 / L

---

## #106 — [P1][Architecture] Mechanically enforce agent-first architecture with baseline-and-ratchet fitness checks

State: OPEN · Labels: area:lifecycle, area:review, enhancement, sprint:alfred

## Observation basis

Validated on 2026-08-03 against Agent-Pipeline `0.5.1`, current `main` commit `5d2b83dcc765d50801f4491e1bd9bed32090112b`.

The repository already contains:

- architecture guidelines and a Semgrep dependency-direction example;
- bounded task/path authority and independent sensitive-delta checks from #46;
- durable architecture-decision work in #99; and
- the measurable Agent-First Architecture Standard defined by #104.

Those foundations do not yet form one lifecycle fitness contract that makes the agent-first standard active by default, evaluates it before implementation, re-evaluates the final candidate, and supports existing repositories without requiring immediate cleanup of every historical violation.

## Problem

Architecture rules that exist only as prompts, role instructions, guidelines, ADR prose, examples, or model self-reports are advisory context. They are easy for fresh sessions to miss, reinterpret, or claim without conformance.

Good agentic architecture therefore requires:

1. a closed, versioned, machine-readable definition;
2. deterministic or explicitly bounded analyzer contracts;
3. mechanical evaluation on the real planned and actual surfaces;
4. enforcement outside the model at authority-bearing lifecycle boundaries;
5. exact profile/candidate/baseline evidence; and
6. a human-controlled override/custom-profile path.

Applying universal hard module walls would still backfire:

- existing repositories may contain accepted violations;
- legitimate work can cross a planned small boundary set;
- one language-independent static heuristic cannot prove every dependency or contract property;
- module size is not itself an architectural violation; and
- metrics must not authorize uncontrolled refactoring.

## Outcome

Mechanically enforce the effective **Agent-First Architecture Profile** with provider-neutral fitness evidence, baseline-and-ratchet adoption, and human-controlled custom profiles.

For applicable work:

- no explicit project profile means the inherited `agent-first` standard from #104;
- an accepted custom profile replaces the overridable default properties exactly as durable architecture authority;
- mandatory safety/authority floors remain independently non-overridable;
- prompt/prose compliance has no gate value; and
- the same evaluator runs at planning, pre-close, governed pushes, and CI/publication.

## Core enforcement invariant

An architecture requirement is enforceable only when it has:

- a stable property/rule ID;
- closed input and outcome schemas;
- applicability and coverage semantics;
- a deterministic check or bounded adapter capability;
- explicit `pass | finding | unavailable | unsupported | unknown | excepted` outcomes;
- profile revision and digest;
- exact baseline/candidate binding;
- blocking or advisory policy; and
- fixtures.

A sentence instructing an agent to follow the rule, an agent-generated architecture document, or a model assertion of compliance cannot produce `pass`.

## Scope

### 1. Profile resolution and precedence

Resolve one effective architecture profile:

1. accepted project/custom profile and inherited non-overridable policy;
2. otherwise the shipped versioned `agent-first` standard from #104.

Record:

- profile source (`inherited-agent-first` or accepted custom);
- standard/custom revision and digest;
- inherited mandatory floors;
- applicable modules/artifacts/languages;
- configured analyzer capabilities and limitations;
- baseline identity;
- exception/override authority; and
- supersession/review state.

For applicable work, a missing project profile is never `unconfigured`; it resolves to `inherited-agent-first`. A missing, invalid, stale, or unevaluable effective profile is non-green.

### 2. Machine-readable architecture fitness model

Represent at least:

- accepted/provisional module identities and owned surfaces;
- public contract identities and implementation bindings;
- allowed, denied, and exceptional dependency directions;
- allowed boundary crossings;
- authority and side-effect ownership;
- verification entry points and locality;
- architecture navigation/re-entry artifacts;
- planned parallel-work overlap constraints;
- measurable context/change/contract thresholds from #104 once calibrated;
- severity and blocking policy; and
- required evidence classes.

Do not infer accepted authority solely from a directory tree or model output.

### 3. Mechanically evaluated property classes

The first increment must mechanically evaluate or explicitly report unavailable/unsupported coverage for:

1. **module identity and ownership** -- affected paths resolve to declared modules or provisional planning state;
2. **contract presence and freshness** -- required contract identity/digest exists and matches the effective architecture revision;
3. **dependency direction and cycles** -- graph edges conform to declared direction and cycle policy;
4. **boundary crossing** -- cross-module reads/writes/dependencies match the planned and authorized boundary set;
5. **authority/side-effect ownership** -- protected effects resolve to declared owners/capabilities;
6. **verification locality** -- declared module verification exists and the candidate records the required affected integration checks;
7. **architecture navigation/re-entry** -- required machine-readable map/index is current for the candidate;
8. **parallel overlap** -- independently dispatched work does not silently share undeclared write or contract authority;
9. **profile drift** -- rules, baselines, contracts, analyzers, or accepted custom authority did not change silently; and
10. **calibrated friction thresholds** -- sustained context traversal, late expansion, or contract-related rework from #104 triggers the configured architecture-review outcome.

Where semantic proof is not mechanically possible, the profile names the limitation and required human/independent evidence. The model cannot fill the gap by assertion.

### 4. Baseline and ratchet

For existing repositories:

- inventory current violations and unknown coverage against an exact accepted baseline;
- preserve historical violations as visible debt without treating them as pass;
- block net-new violations, worsened dependency direction, new cycles, expanded forbidden reach, missing/staler contracts, new ownership ambiguity, and expired exceptions;
- permit explicit improvement even when unrelated baseline debt remains;
- reduce the baseline deterministically when violations are resolved; and
- require a human-approved profile/baseline/exception transition to alter the ratchet.

For new projects/modules, no legacy baseline suppresses the inherited standard: applicable required properties must be satisfied or explicitly resolved through the PO-controlled custom-profile/override path before implementation authority.

### 5. Lifecycle placement

Run the same normalized evaluator at:

#### Planning / pre-implementation

- resolve the effective profile;
- validate the machine-readable architecture disposition;
- evaluate planned modules/contracts/dependencies/effects/verification;
- identify unsupported/unknown analysis before work begins;
- derive the architecture contribution to #105 rigor; and
- withhold implementation authority when a required property has no accepted resolution.

#### Dispatch / implementation

- project the accepted module/write/authority surface into #46 task authority;
- block silent scope widening;
- require typed reauthorization for material divergence; and
- prevent a prompt or revised plan sentence from changing the effective profile.

#### Pre-review / pre-close

- evaluate the actual candidate graph, contracts, effects, verification, architecture map, and #104 measurements;
- compare planned and actual surfaces;
- require resolution of new/worsened blocking findings; and
- bind the result to the exact candidate.

#### Push / session exit

- evaluate architecture navigation/map currency and touched-contract identity/digest freshness for the surface actually pushed;
- candidate and publication pushes are blocking: a stale architecture map or a stale touched contract fails closed before the push completes;
- session-checkpoint pushes are permitted but must record typed `architecture-map-stale` / `contract-stale` debt bound to the exact pushed commit; a silent pass is impossible;
- open push-time staleness debt must be consumed and resolved during the next applicable session's planning before implementation authority is granted; and
- a checkpoint exit that never reaches a close path therefore cannot leave undetected stale architecture state for later sessions.

#### CI / publication

- verify the same profile, baseline, analyzer, contract, and candidate identities;
- fail closed when a required capability/evidence class is unavailable, stale, invalid, or incomplete; and
- never consume model prose as substitute evidence.

### 6. Human/PO custom profile and override

The human/PO may deliberately choose a custom architecture through #99/#104.

A valid transition records:

- affected project/modules/properties;
- exact prior and new profile digests;
- rationale and trade-offs;
- custom rules and applicability;
- inherited mandatory safety floors;
- accepted current baseline;
- evidence/review expectations; and
- supersession/review conditions.

The selected custom profile is then mechanically enforced and measured exactly like the standard. It is not repeatedly challenged merely for being different.

Agents and tools may propose the decision and supply evidence. They cannot approve, activate, broaden, or silently infer it.

### 7. Graph, receipts, and diagnostics

Produce sanitized, exact-candidate evidence showing:

- effective profile source/revision/digest;
- modules and public contracts;
- dependency edges and direction;
- authority/effect/verification ownership;
- planning versus actual scope;
- baseline, new, resolved, unknown, unavailable, unsupported, and excepted findings;
- analyzer coverage and limitations;
- #104 measurement references;
- #105 rigor contribution;
- decision/override references; and
- sanctioned remediation.

Core semantics remain provider-neutral. Projects may use built-in, external, or private analyzers through a common evidence contract; no single external tool or commercial service becomes universally mandatory.

## Acceptance criteria

- [ ] Good agentic architecture is defined through versioned machine-readable properties and mechanical evidence, not prompt/prose compliance.
- [ ] Applicable work without a custom profile deterministically resolves to the inherited agent-first standard.
- [ ] A missing/invalid/stale effective profile or required evaluator cannot be represented as pass.
- [ ] Planning must mechanically evaluate an architecture disposition before implementation authority.
- [ ] Module ownership, contract freshness, dependency direction/cycles, boundary crossings, effect ownership, verification locality, navigation/re-entry, overlap, and profile drift have executable or explicitly unavailable/unsupported outcomes.
- [ ] Model self-report, an ADR paragraph, or an agent-authored architecture document cannot satisfy a mechanical property.
- [ ] Existing violations can be baselined without being hidden or treated as pass.
- [ ] Net-new/worsened violations and expired exceptions fail at configured blocking boundaries.
- [ ] New projects/modules cannot use a legacy baseline to bypass required inherited properties.
- [ ] Resolved violations reduce the baseline deterministically.
- [ ] Planning, dispatch, close, push, and CI consume the same normalized profile semantics.
- [ ] Actual scope/profile divergence triggers reauthorization rather than implicit expansion.
- [ ] Governed outbound pushes evaluate architecture-map and touched-contract freshness; candidate and publication pushes fail closed on staleness, and session-checkpoint pushes record typed staleness debt bound to the exact pushed commit.
- [ ] A following session cannot obtain implementation authority for the affected scope while unconsumed push-time staleness debt exists; consuming and resolving the debt reduces it deterministically.
- [ ] A valid PO-approved custom profile is durably selected, mechanically enforced, continuously measured, and not silently replaced by the standard.
- [ ] Agents cannot create or activate a custom-profile override.
- [ ] Generated evidence distinguishes evaluated, unsupported, unavailable, unknown, excepted, and measured scope.
- [ ] #104 metrics can trigger configured architecture review but cannot autonomously authorize a refactor.
- [ ] Fixtures cover inherited greenfield default, accepted custom profile, clean architecture, missing/stale contract, accepted legacy debt, new/worsened violation, resolved violation, new cycle, hidden side effect, missing local verification, stale architecture map, analyzer unavailable, legitimate override, expiry/supersession, scope divergence, prompt-only claimed compliance, exact-candidate drift, checkpoint push with a stale architecture map producing typed debt, a follow-up session blocked until push-time debt is consumed, a publication push failing closed on a stale map, and deterministic staleness-debt reduction on resolution.
- [ ] Core conformance requires no external commercial service.

### Documentation acceptance

- [ ] User documentation explains baseline-and-ratchet adoption, planning/pre-close/push/CI outcomes, remediation, exceptions, custom profiles, analyzer gaps, and migration.
- [ ] Architecture and maintainer documentation records evaluator schemas, rule IDs, outcome semantics, candidate binding, rollout from report-only to blocking, and fixtures.
- [ ] Documentation is verified against the exact accepted candidate and the closing comment links the updated user and technical documentation.

## Non-goals

- One universal folder layout, architecture, module-size rule, language, or framework.
- Treating prompts, role text, or model self-attestation as enforcement.
- Automatically inventing accepted architecture from the current file tree.
- Replacing #99, #46, #104, or #105.
- Requiring immediate cleanup of all existing violations.
- Allowing metrics or analyzers to authorize a refactor.
- Preventing a human/PO from selecting a durable custom architecture.
- Blocking session-checkpoint pushes outright: an aborting session must still be able to preserve work, which is why checkpoint staleness produces mandatory typed debt instead of a hard stop.

## Related work

- #104 defines and measures the Agent-First Architecture Standard.
- #105 consumes profile conformance and friction as deterministic rigor inputs.
- #99 owns durable architecture authority.
- #46 supplies task/path authority and independent sensitive-delta checks.
- #77 separated session checkpoint, feature close, and publication; push-time enforcement consumes exactly those exit boundaries.
- #87/#88 may later supply optional analyzer adapters but are not prerequisites for the core contract.

## Priority / size

P1 / L

---

## #108 — [P1][Integration] Assemble and qualify the Sprint Alfred agent-first governance core

State: OPEN · Labels: area:lifecycle, area:security, area:telemetry, enhancement, sprint:alfred

## Observation basis

Planned on 2026-08-03 against Agent-Pipeline `0.5.1`, current `main` commit `5d2b83dcc765d50801f4491e1bd9bed32090112b`. Membership revised on 2026-08-08: #99 moved into Alfred from Nightwing, and #109 was added.

Sprint Alfred is a future, independently closable integration sprint. It begins only from an accepted `main` base after its entry conditions are satisfied; it does not expand Nightwing, Phoenix, Nova, or Batman.

## Purpose

Assemble the currently separate architecture, governance, and measurement work into one coherent delivery that makes agent-first architecture the mechanically evaluated default while preserving the human/PO as root authority.

The Sprint must prove an integrated control loop rather than close eight isolated mechanisms.

## Authoritative Sprint membership

Sprint Alfred owns exactly:

- #99 -- durable architecture-decision continuity as the Sprint's architecture authority (moved from Nightwing on 2026-08-08);
- #101 -- immutable and self-protecting protected-path baseline;
- #102 -- protection of approved design authority from implementation-time writes;
- #103 -- separation of planned gates from unplanned workflow interruptions;
- #104 -- measurable Agent-First Architecture Standard as the inherited default;
- #105 -- deterministic minimum rigor floor derived from change surface;
- #106 -- mechanical architecture fitness enforcement with baseline and ratchet; and
- #109 -- typed architecture-baseline adoption demand for existing repositories.

The `sprint:alfred` label mirrors this decision. The membership recorded here and on each member issue is the durable planning authority.

## Entry conditions

Before an Alfred implementation branch is cut:

- #100 is accepted on `main` as a prerequisite hotfix, but remains outside Alfred;
- every required upstream authority contract consumed from #46 is available on the accepted base; #99 is delivered inside Alfred since the 2026-08-08 membership revision and is no longer an upstream precondition;
- the PO identifies which other independently handled `sprint:NONE` items, if any, must land first;
- the shared evidence/profile schema boundaries and issue ownership are frozen; and
- no active Sprint branch is expanded or coupled to Alfred.

## Integrated outcome

A qualified Alfred candidate must demonstrate that:

1. protected control and design-authority surfaces cannot be silently weakened by an agent;
2. applicable work resolves to a versioned agent-first architecture profile unless the PO has durably selected a custom profile;
3. good agentic architecture is represented by machine-readable properties and candidate-bound evidence;
4. architecture fitness is mechanically evaluated outside model prompts or self-attestation;
5. planned authority gates and unplanned interruptions are measured separately;
6. architecture, control-surface, and workflow evidence deterministically contribute to the minimum rigor floor;
7. existing repositories can adopt the standard through a visible baseline-and-ratchet path;
8. the human/PO retains explicit override and custom-profile authority;
9. the same semantics survive planning, dispatch, pre-close, push/session exit, Verify/CI, and publication boundaries;
10. architecturally significant decisions remain durable and consumable across fresh sessions, restarts, and supported runners; and
11. a repository without an accepted architecture baseline resolves to a typed adoption demand and exactly one durable PO decision.

## Delivery sequence

### 1. Control and schema foundation

- Implement #101 and #102 against the accepted authority model.
- Implement #99's durable architecture-decision authority early so #104 and #106 consume accepted rather than provisional module identities.
- Freeze shared identifiers for protected surfaces, architecture profiles, decisions, findings, exceptions, candidate binding, and evidence coverage.
- Establish #103 event semantics before using interruption data as a quality signal.

### 2. Measurable default

- Implement #104 as the versioned inherited `agent-first` profile.
- Establish a dogfood baseline and calibrate measurements without allowing metrics to authorize refactoring.
- Keep PO-selected custom profiles measurable and mechanically enforceable.

### 3. Report-only integration

- Run #106 initially in report-only mode against the shared profile/evidence schema.
- Integrate #105 with the same normalized findings and coverage states.
- Prove that `unknown`, `unavailable`, `unsupported`, stale, and prompt-only claims cannot become green evidence.

### 4. Ratchet and blocking promotion

- Establish the accepted legacy baseline.
- Block net-new or worsened violations and expired exceptions.
- Introduce the #109 adoption demand once evaluator outcomes and accepted baselines exist, and record the Agent-Pipeline repository's own brownfield adoption decision as the first dogfood case.
- Promote blocking behavior only after focused fixtures and dogfood calibration prove the configured boundaries.
- Require PO authority for profile, baseline, exception, or override transitions.

### 5. Integrated qualification

Qualify one exact candidate across all eight member issues. Evidence must cover fresh-repository defaults, an existing-repository baseline, a valid PO custom profile, control-surface self-protection, planned versus unplanned interruptions, deterministic rigor derivation, decision continuity across a fresh session, the typed adoption demand with a recorded PO decision, exact-candidate drift, and fail-closed unavailable evidence.

## Acceptance criteria

- [ ] #99, #101-#106, and #109 use compatible versioned profile, finding, coverage, decision, and evidence identities.
- [ ] The inherited agent-first default is active without requiring a project-authored prompt or prose rule.
- [ ] No model assertion, ADR paragraph, or generated architecture document can satisfy a mechanical property.
- [ ] Protected policy and approved design authority cannot authorize their own weakening.
- [ ] Planned gates and unplanned interruptions remain separately queryable and cannot distort one another.
- [ ] #105 derives rigor deterministically from the effective profile, actual change surface, fitness outcome, and typed evidence gaps.
- [ ] #106 evaluates planning and the actual candidate using the same normalized semantics.
- [ ] Baseline debt is visible, net-new/worsened debt is blocked, and resolved debt reduces the baseline deterministically.
- [ ] #99's typed architecture-baseline assessment and decision continuity are integrated so #104/#106 consume accepted architecture authority rather than provisional identities.
- [ ] The #109 adoption demand is qualified end to end, including the Agent-Pipeline repository's own recorded brownfield adoption decision.
- [ ] A PO-selected custom profile is respected, measured, and mechanically enforced without being silently replaced.
- [ ] Mandatory safety and authority floors remain independent of the overridable architecture profile.
- [ ] Cross-issue fixtures run through shared Verify/CI and bind to the exact candidate.
- [ ] Dogfood evidence records usefulness, false positives, unavailable coverage, interruption impact, and operator burden.
- [ ] Every member issue receives a candidate- and evidence-bound closing comment before closure.
- [ ] The Sprint close comment records the exact merged commit, qualification evidence, member issue disposition, and remaining debt.

### Documentation acceptance

- [ ] Integrated user documentation covers the Alfred defaults, setup/adoption, configuration and PO override, diagnostics, recovery, migration, limitations, and release behavior.
- [ ] Architecture, security, lifecycle, telemetry, governance, and reference documentation are updated as one consistent contract with navigable cross-links.
- [ ] Qualification verifies every documented command, configuration example, lifecycle claim, and link against the exact accepted candidate; the Sprint close comment links the resulting documentation evidence.

## Non-goals

- Implementing #100 inside Alfred.
- Assigning #107 or any runner work to Alfred.
- Creating a runner Sprint or runner-specific label.
- Pulling Batman capability/adapter work into the core Sprint.
- Requiring enterprise IAM or a commercial service for solo/private dogfood use.
- Enforcing one universal folder layout, language, framework, or architecture style.
- Letting metrics, analyzers, or agents approve their own refactor or authority expansion.

## Priority / size

P1 / XL

---

## #109 — [P1][Adoption] Demand and govern architecture-baseline adoption for existing repositories

State: OPEN · Labels: area:docs, area:lifecycle, enhancement, sprint:alfred

## Observation basis

Validated on 2026-08-08 against Agent-Pipeline `v0.5.3`, current `main` commit `2740041d59458f949b597905816af12048502469`.

#104 defines existing-repository adoption through a read-only inventory, an exact accepted baseline, visible deviations, and a net-new/worsened-deviation ratchet. #106 mechanically blocks regressions against that baseline and, at governed push boundaries, records typed architecture-staleness debt. #99 (existing-project adoption) allows a human to approve a present-state baseline and create forward-looking ADRs without fabricated history.

None of these makes the initial adoption decision itself mandatory. A repository that predates the architecture feature set -- including Agent-Pipeline itself once this capability ships -- can remain indefinitely in a visible-debt state without any explicit product-owner decision. Missing or stale agent-facing architecture maps surface as findings, not as demands. In large existing repositories this reproduces exactly the failure the Agent-First Architecture Standard targets: fresh sessions cannot re-establish context from durable artifacts, traverse foreign implementation, and attach changes without an architecture plan.

## Problem classification

- **Cause:** architecture-baseline adoption is representable but never demanded; the pipeline has no path that forces the adoption question to a decision.
- **Incorrect state classification:** the absence of an adoption decision is indistinguishable from a deliberate, informed deferral.
- **Recovery gap:** there is no typed migration proposal and no governed decision loop that converts "architecture documentation missing/stale" into a scoped, costed, PO-approved plan.
- **Consequence:** agents in undocumented existing repositories plan blind, bolt changes onto whatever they find first, and accumulate exactly the structural debt #104 measures.
- **Environment boundary:** full migration of a large repository is expensive; a demand that ignores cost will be ignored or rubber-stamped.

## Outcome

Introduce a typed, durable **architecture-adoption state** per repository (or declared scope) with an active, decision-ready demand loop:

1. the pipeline detects a missing or materially stale architecture baseline;
2. it produces a staged, inventory-based migration proposal with explicit cost/effort estimation;
3. it requires exactly one durable PO decision -- `adoption-approved-scoped`, `adoption-deferred` (with a mandatory review condition or expiry), or `adoption-partial`; and
4. planning consumes the adoption state; the demand is re-raised only on expiry or material change, never per session.

The decision is cheap and mandatory; the migration is expensive and deliberately released. An undecided state cannot silently pass as adopted.

## Scope

### 1. Detection and typed adoption state

Resolve one typed adoption state per repository/scope from #106 evaluator outputs (architecture navigation/map currency, contract coverage, unknown coverage):

- `adoption-required`
- `adoption-approved-scoped`
- `adoption-deferred`
- `adoption-partial`
- `adoption-complete`

A repository without an accepted architecture baseline deterministically resolves to `adoption-required`. Absence of evidence is never `adoption-complete`.

### 2. Decision-ready migration proposal

When the state is `adoption-required` (or a material delta re-raises the demand), produce a sanitized, decision-ready proposal containing:

- inventory summary: candidate modules, coverage gaps, unknown coverage share;
- a staged path: the machine-readable agent navigation map first; contracts for the hottest modules next, prioritized by observed traversal/friction telemetry from #104 where available; the remainder governed by the #106 ratchet;
- effort estimation with explicit status per figure (`measured | estimated | unavailable`);
- explicitly what is *not* proposed: no restructuring, no all-at-once migration.

### 3. Single durable PO decision -- no nagging

- Exactly one durable decision resolves the demand; agents cannot approve, broaden, extend, or expire it.
- A deferral must carry a review condition or expiry; an expired deferral re-raises the demand.
- While a valid decision exists, the pipeline must not re-prompt per session.
- Material change -- new modules, coverage regression, or a calibrated #104 friction-threshold breach -- re-raises the demand with a delta proposal rather than a full restart.
- Work in an undecided `adoption-required` scope triggers the demand and requires the PO decision (which may be a deferral) before implementation authority proceeds; the decision gate is mandatory, the migration is not.

### 4. Agent-generated backfill safety

- Generated maps and contracts carry a coverage class and confidence marker; they cannot produce a mechanical `pass` by themselves (per the #106 enforcement invariant).
- Contradiction-with-implementation signals from #104 apply to backfilled contracts exactly as to authored ones.
- Present-state baseline acceptance follows #99 existing-project adoption: human-approved, forward-looking, no fabricated history.

### 5. Agent-first artifact orientation

- The machine-readable navigation map is the primary artifact; any human-facing architecture view is derived from it, not the reverse.
- Decision authority remains human; artifact orientation is agent-first.
- The generated navigation map follows the pluggable representation contract and shipped default from #104 (conformant to the pinned OKF specification revision), so brownfield adoption produces a portable, standard-conformant bundle.

### 6. Dogfooding

The Agent-Pipeline repository itself performs the adoption flow as the first brownfield case, producing the same typed state, proposal, and PO decision evidence.

## Acceptance criteria

- [ ] A repository without an accepted architecture baseline deterministically resolves to `adoption-required` and cannot silently appear adopted.
- [ ] The demand loop produces a staged, inventory-based migration proposal with per-figure estimation status (`measured | estimated | unavailable`).
- [ ] Hot-module contract backfill is prioritized by observed traversal evidence where available; unavailable telemetry is typed, not guessed.
- [ ] Exactly one durable PO decision resolves the demand; agents cannot approve, extend, or expire it.
- [ ] A deferral without a review condition or expiry is invalid; an expired deferral re-raises the demand.
- [ ] No per-session re-prompting occurs while a valid decision exists.
- [ ] Material change (new modules, coverage regression, calibrated friction-threshold breach) re-raises the demand with a delta proposal.
- [ ] Implementation authority in an undecided `adoption-required` scope requires the PO decision first; a recorded deferral then permits work under the existing #106 ratchet.
- [ ] Agent-generated maps/contracts carry coverage class and confidence and cannot satisfy a mechanical property by themselves.
- [ ] Present-state baseline acceptance follows #99 semantics; no fabricated history.
- [ ] Public evidence is sanitized: no private accounts, machine names, absolute paths, or authentication details.
- [ ] The Agent-Pipeline repository completes the adoption flow as the first brownfield case with recorded state, proposal, and decision evidence.
- [ ] Deterministic fixtures cover: undecided brownfield repo, deferral with expiry, expiry re-demand, partial-scope adoption, material-change delta demand, agent backfill without self-certification, and the dogfooding case.

## Non-goals

- Forcing immediate or complete migration of any existing repository.
- Per-session nagging or repeated prompting against a valid standing decision.
- Agent-approved, agent-extended, or agent-expired adoption decisions.
- Replacing the baselines, ratchet, or push-time staleness debt owned by #104/#106.
- Restructuring code as part of adoption.
- Treating generated documentation as accepted authority without mechanical evidence and human baseline acceptance.

## Dependencies and related work

- #104 supplies the standard, the telemetry, and the existing-repository baseline semantics this issue consumes.
- #106 supplies the evaluator outcomes, ratchet, and push-time staleness debt; this issue adds the missing initial-decision demand on top.
- #99 supplies present-state baseline acceptance and the no-fabricated-history rule for backfill.
- #108 should include this capability in Sprint Alfred integration and qualification.
- #105 may consume the adoption state as a rigor input for work in undecided or deferred scopes.

## Sprint planning

- **Sprint:** Alfred
- Planning window: with the Alfred portfolio; requires the #104 profile contract and #106 evaluator outcomes as inputs.
- Independent of other sprint branches; starts from the common Alfred base.
- Internal slicing (detection, proposal, decision, dogfooding) is the responsibility of the Alfred Design phase.
- Sprint close must comment the merged commit and evidence on this issue before closing it.

## Priority / size

P1 / M
