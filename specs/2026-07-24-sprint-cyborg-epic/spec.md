# Technical Spec — Sprint Cyborg Epic

> Status: DRAFT — companion to [`prd_cyborg-epic.md`](prd_cyborg-epic.md);
> same PO gate. **Design authority note:** the nine `sprint:cyborg` issues are
> requirements input. This spec is the design authority; where it deviates
> from an issue's solution sketch, the deviation is listed in §3 and wins
> unless the PO objects at the gate.

## 1. Identity, profile, and immutable inputs

- Base: `main` @ `86deb0cbbed8cbaae7d652e7060c220cecfe3436` (= `v0.4.0`).
- Branch: `feat/sprint-cyborg-claude`; V3 profile `epic`; this spec is a
  `design_phase` artifact.
- Requirements input: issues #39, #41–#48 (full text snapshot read
  2026-07-24); absorbed backlog items per PRD.
- Existing substrate this design builds on (v0.4.0, verified present):
  - `harness/scripts/security-scan.mjs` — adapter runner (gitleaks,
    osv-scanner, semgrep, license-check), typed `PASS|FINDINGS|SKIPPED|ERROR`,
    manifest-driven config, gate modes, `pipeline.security-evidence.v1` with
    exact-candidate before/after snapshot binding and `payloadSha256`.
  - `harness/scripts/verify.mjs` — registered suite runner,
    `pipeline.verify-evidence.v0`, scoped-verify-registration.
  - `plugins/pipeline-core/hooks/guard-push.mjs` — push gate consuming both
    evidence files with exact-candidate checks (13-finding class observed).
  - ADR-0045 artifact topology (`governance/artifact-topology.json`, classes
    incl. `supply-chain`, `candidate-evidence`, `release`) +
    `check-artifact-topology.mjs`, `feature-package-topology.mjs`.
  - ADR-0046 project-authority layering; sealed private overlay.
  - ADR-0032 two-tier SBOM convention (baseline `third-party-licenses.json` +
    optional CycloneDX), `docs/releases/<version>.md` release manifests.
  - Append-only ledger + generated projection pattern
    (`backlog/transitions.ndjson` → `STATUS.md`/`index.json`).
  - Trust machinery: `tool-identity.mjs` trusted-tool resolution, SNT-A
    source/cache byte-equality verification, guard union, 6-field briefing +
    `Dispatch:` trailers, Critic contract (ADR-0014), capability probes.

## 2. Architecture — one evidence spine

The issues sketch per-issue manifests, receipts, planners and evaluators.
Implemented literally, that yields ~9 overlapping schema families and at
least three new orchestrators. This design collapses them into **one layered
evidence spine** with three existing enforcement points and no new runner
binaries.

### 2.1 Layered canonical schemas

| Layer | Schema (new unless noted) | Content | Feeds |
| --- | --- | --- | --- |
| L0 Catalog | `pipeline.control-catalog.v1` — versioned data file `governance/security-controls/catalog.json` (+ org/project overlays via the governance policy layer) | control IDs, revisions, applicability expressions, phases, verifier capability IDs, evidence contracts, severities, waiver semantics, informative standard mappings | L1 |
| L1 Effective policy | `pipeline.security-policy-resolution.v1` | catalog version, assurance level (`baseline|elevated|critical`), active modules, resolved control set + digest, unresolved `unknown` inputs | L2, receipts |
| L2 Capability plan | `pipeline.capability-plan.v1` | candidate-bound required capability list (accepted adapters, versions, rule/config digests, expected coverage, blocking behavior), explicit optional/not-applicable entries with reasons, plan digest | L3, guard-push |
| L3 Run evidence | `pipeline.security-evidence.v2` (supersedes v1, explicit migration) | everything v1 has, plus: plan binding, per-capability typed outcome (`pass, findings, required-capability-missing, unsupported, execution-unavailable, partial-coverage, stale, invalid, not-applicable, waived`), normalized finding envelopes, coverage record | guard-push, Close, release, #5/#9 consumers |
| L4 Finding lifecycle | `pipeline.finding-record.v1` + append-only findings ledger with generated projections (backlog-ledger mechanics); its canonical path is assigned through a new `security-finding` class in `governance/artifact-topology.json` (ADR-0045 extension — #47 requires canonical records to live in the #22 topology, no freestanding path convention) | dedup identity, state machine, triage/disposition records, waivers with expiry, remediation packages, VEX-style records as a typed record class linked to SBOM identity | release admission, #48 |
| L5 Supply-chain | `pipeline.sbom-manifest.v1` (normalized manifest over CycloneDX JSON / SPDX JSON payloads-by-digest); `pipeline.provenance.v1` (subjects, materials, builder, invocation, environment, reproducibility grade) | topology class `supply-chain` under ADR-0045 | release binding, L4 VEX links |
| L6 Release binding | machine-readable companion `docs/releases/<version>.json` next to the existing human manifest (ADR-0032 extension, not replacement) | digests of the approved SBOM, provenance, security evidence, finding-state snapshot, control receipt | audit/consumers |

Design rules: every schema is closed, versioned, digest-carrying, and
exact-candidate-bound (reusing the proven v1 candidate snapshot mechanism).
Typed uncertainty (`unknown`, `unavailable`, `partial`, `stale`) is never
collapsed. No layer duplicates a lower layer's payload — links by digest.

### 2.2 Enforcement points (reused, not invented)

1. **`security-scan.mjs`** gains the L1→L2 resolver call and the L3
   completeness evaluator in its existing aggregate step. The current
   hardcoded `SCANNER_DEFS` order becomes plan-driven; the adapter interface
   stays, extended by a declared-capabilities export (§2.3).
2. **`verify.mjs`** keeps its role (test suites + wiring); new deterministic
   suites register through the existing scoped registration (absorbing
   `pipeline.verify-gate-scoped-registration`).
3. **`guard-push.mjs`** extends its existing evidence checks: in addition to
   exit-0 + candidate freshness it requires plan-completeness (`v2` verdict
   states) once a repository's effective policy demands it. Repos without a
   policy keep today's behavior during a **time-bounded compatibility
   window** (deviation D9): the window ends for a repository the moment it
   adopts any L1 policy, and sprint close reviews every governed repository
   still inside the window; a releasable repository may stay windowed only
   through an explicit typed `not-applicable` policy decision (#42 scope 7).
4. **Boundary map for the "same evaluator at Push/PR/Close/Release" AC
   (#42):** one shared evaluator library is consumed by (a) guard-push on
   branch pushes (push boundary), (b) guard-push's existing tag/deploy
   refspec path consuming L6 + L4 state (release-admission boundary),
   (c) the `close-block` skill's gate step (Close boundary), and (d) a CI
   workflow step invoking the same library (PR boundary). No boundary gets
   its own verdict logic.

### 2.3 Adapter contract v2 (backwards-compatible)

Each adapter module additionally exports `capabilities()` metadata: stable
capability IDs (from the #44 family registry), supported ecosystems/artifact
types, engine/adapter version, offline/network behavior, rule-profile
identity, coverage semantics, platform constraints. The four existing
adapters are migrated in place; synthetic fake adapters prove the contract
offline for families without a bundled real tool. Trusted-tool resolution
(`tool-identity.mjs`) remains the only executable-resolution path.

### 2.4 AI-assisted-development hardening maps onto existing mechanisms

#46 is implemented as a module of the L0 catalog plus concrete controls at
existing choke points — not as a new framework:

- **Trust-boundary taxonomy** → normative doc + closed enum used by briefing
  templates and skills; untrusted classes can never mutate policy/scope.
- **Tool/definition integrity** → digest inventory of skills/agents/hooks/
  configs reusing the SNT-A byte-equality machinery; drift = typed
  requalification trigger.
- **Task-authority manifest** → machine-readable scope block added to the
  6-field briefing (paths, operations, tools, budgets, expiry); a PreToolUse
  guard enforces path scope; the close authorship check verifies the
  delivered diff against the manifest (absorbs `pipeline.dispatch-provenance`:
  missing `Dispatch:` trailer ⇒ fail-closed remediation).
- **Change-integrity checks** → new verify suites: scope delta, test
  deletion/weakening, guard/workflow/dependency-file changes, secret-shaped
  content, suspicious Unicode/normalization.
- **Multi-agent containment** → Critic dispatch checklist assertion
  (paths/refs only, read-only out-of-band monitoring; absorbs
  `pipeline.critic-context-isolation`); origin/trust class on every briefing.
- **Authority containment** → override-ledger binding to the physical target
  repository (absorbs `pipeline.cross-repository-override-ledger-binding`).
- **Governed exception class** → "PO-waived direct implementation" becomes an
  L0 waiver type with expiry + mandatory follow-up fresh-context Critic
  (absorbs `pipeline.elephant-direct-implementation-under-afk-authorization`).
- **CI authority** → static workflow checks (pinning, permissions, untrusted
  event isolation) as verify suites on top of the #27 baseline.

## 3. Deliberate deviations from the issue solution sketches

| # | Issue sketch | This design | Rationale |
| --- | --- | --- | --- |
| D1 | #42 sketches a standalone "aggregate evaluator" + separate planner artifacts | One resolver lib + evaluator inside `security-scan.mjs`'s existing aggregate step; plan as L2 schema | No second orchestrator; the enforcement points already exist |
| D2 | #39 sketches a broad multi-ecosystem generation framework with reference single- and monorepo adapters | Contract + normalization + Node-ecosystem reference adapter + synthetic fixtures for multi-ecosystem/monorepo semantics; further real generators are follow-up adapters | Prove the contract, not N integrations; this repo itself is `not-applicable` for most ecosystems — honesty over breadth |
| D3 | #41 sketches generated operator/developer/auditor views | One catalog + one receipt + documentation; generated views deferred to the Evidence-Viewer line (#5, other sprint) | View generation is a consumer concern; catalog/receipt schemas must not bend to rendering needs |
| D4 | #44 lists 13 families with reference adapters | Family registry covers all 13 as contract + capability IDs; real adapters in Cyborg only where a governed repo is applicable (SAST/SCA/secrets/license exist; + IaC, workflow, container-static); DAST/fuzz ship as bounded harness contract + synthetic conformance adapters | A real fuzz/DAST integration without an applicable governed target would be untested theater |
| D5 | #45 sketches builder trust domains incl. CI build-out | Local reference builder + digest enforcement + provenance envelope; dogfood subject = the released plugin package; keyless/OIDC signing designed, implementation via external key boundary only | The Pipeline's current release artifact is the plugin/tag itself; CI provenance infra without a CI build product is premature |
| D6 | #47 could be read as a tracker product | Ledger + projection reusing backlog-ledger mechanics; external trackers are projections (none in Cyborg core) | Proven append-only pattern, no new stateful service |
| D7 | #48 sketches org-wide IR integration surface | Schemas + canonical artifacts + this repo's own SECURITY.md/support policy as reference instance; ITSM/SIEM integrations out | Reference instance proves the contract; integrations are consumer work |
| D8 | Issues imply nine independent schema families | One layered spine (§2.1) with digest links | Overlap elimination; single migration story |
| D9 | #42 scope 7: manifest-less behavior only via explicit `not-applicable` policy | Time-bounded compatibility window for not-yet-migrated repos (§2.2.3); window ends on first L1 policy adoption; sprint-close review of remaining windowed repos; releasable repos need the explicit `not-applicable` decision to stay windowed | Big-bang enforcement would break every consumer repo on day one; the window is the migration path, not a permanent weakening |
| D10 | #46 requires runner-consistent controls "through capability contracts" | CYB-5's enforcement points (PreToolUse guard, 6-field briefing manifest, `Dispatch:` trailers) are Claude-runner-native today; the control catalog entries declare runner-neutral capability requirements, and the Codex transport maps them to its host-boundary equivalents (or records typed `unavailable`) in a named CYB-5 sub-deliverable | Honest runner asymmetry with a typed gap beats pretended parity |

## 4. Work packages and ordering

Every package runs its own feature lifecycle (design → dispatch →
verify → Critic → PO gate) under this Epic; package-level detailed design
docs live in the package's ADR-0045 topology under `specs/<package-id>/`.
"Boundary" = the schemas/contracts a package freezes for its consumers.

### CYB-0 — sprint scaffolding (S)
Feature-state switch via the sanctioned `pipeline-state.mjs` writer; triage
records for the six absorbed backlog items; spec-retention registration for
this Epic's authority set; sprint telemetry note. No product code.

### CYB-A0 — assurance quickfix: recovery-preview callback attestation (S/M)
Resolve the open Critic findings on the existing candidate
(`recovery-preview-attestation.mjs`: replay acknowledgement/API migration,
candidate-bound evidence), fresh independent Critic, close the backlog item.
Due 2026-07-27. Boundary: none (self-contained defect).

### CYB-1 — control catalog + assurance authority (#41) (XL, P0)
L0 catalog schema + reference catalog content; L1 resolver
(`security-policy-resolver.mjs`); assurance levels; module precedence;
evaluation receipt; waiver lifecycle incl. the PO-waived-direct-implementation
class; operator/developer/auditor views shipped as catalog-validated
documentation (satisfying #41's "generated from or validated against"
branch; generated rendering stays deferred per D3).

**Boundary freeze = named PO checkpoint, delivered as a mid-package
sub-deliverable (CYB-1F)** so Phase II starts before CYB-1's full package
close. CYB-1F enumerates exactly: the L0 catalog schema, the L1 resolution
schema, the receipt schema, the waiver classes, **and the capability-ID
grammar plus the initial thirteen capability-family IDs with their stability
rules** (hoisted from #44 — CYB-6 later populates the registry with adapters
and conformance but never owns the identity scheme). Changes after CYB-1F
follow the §6 re-approval rule.

### CYB-2 — policy-complete verification (#42) (XL, P0)
L2 plan builder; adapter contract v2 migration of the four existing adapters;
L3 evaluator + `security-evidence.v2` + explicit v0/v1→v2 migration;
guard-push plan-completeness extension with per-repo compatibility window;
read-only preflight (extends the existing toolchain-preflight pattern).
Depends: CYB-1 boundary.

### CYB-3 — SBOM lifecycle (#39) (XL, P1)
ADR-0032 amendment (supersede two-tier convention where applicable);
topology class wiring; `sbom-manifest.v1`; CycloneDX/SPDX validated profiles
with deterministic canonicalization/digesting; Node reference generation
adapter; staleness/invalidations; release binding via L6; migration +
`not-applicable` paths. Depends: CYB-1 boundary (applicability).

### CYB-4 — threat-model + security-requirement lifecycle (#43) (L, P1)
Applicability from assurance profile; closed threat-model and requirement
schemas (machine-readable core + generated/checked human view); lifecycle +
change-impact triggers; assisted-analysis safeguards (proposals never
self-approve). Repo-level reference instance for agent-pipeline itself.
Depends: CYB-1.

### CYB-5 — AI-assisted development hardening (#46) (XL, P1)
Per §2.4, delivered as three slices: (a) trust taxonomy + definition-integrity
inventory + task-authority manifest & guards + drift requalification (needs
(a)'s digest inventory, so it lives here); (b) change-integrity verify
suites + dispatch-provenance enforcement + Critic isolation checklist;
(c) override-ledger target binding + CI authority suites + the D10 Codex
equivalence mapping. Depends: CYB-1 (module/control IDs); ONLY the
override-ledger defect fix in (c) is self-contained and may start in
Phase II.

### CYB-6 — stack-aware verification breadth (#44) (XL, P1)
Stack/exposure inventory (candidate-bound, digest); module selection from
L1+L2 **plus threat-model inputs from CYB-4** (#44 scope 2); registry
population for the thirteen CYB-1F family IDs (adapters + conformance, no
identity-scheme ownership); new real adapters: IaC, CI-workflow,
container-static; bounded dynamic/fuzz harness CONTRACT + synthetic
conformance adapters with end-to-end regression-replay proof on synthetic
reproducers. Depends: CYB-1, CYB-2, CYB-4.

### CYB-7 — provenance + artifact integrity (#45) (XL, P1)
Subject model; `provenance.v1`; digest enforcement at produce/promote/readback;
release-manifest machine companion (L6); reference local builder for the
plugin package; signing/attestation via external key boundary **with a
working local-test-key sign/verify path** (not design-only — the
forged/expired/revoked-trust fixtures of #45 must execute); graded
reproducibility states. Depends: CYB-1, CYB-3 (SBOM subject links).

### CYB-8 — finding/exception/VEX lifecycle (#47) (XL, P1)
L4 ledger + state machine + projections; dedup/cluster identity; VEX record
class bound to SBOM identity; ownership/SLA policy inputs; remediation
package with original-trigger replay; drift reopening. Depends: CYB-2
(finding envelope), CYB-3 (component identity).

### CYB-9 — product-security readiness (#48) (L, P2)
Applicability-driven artifact set; SECURITY.md public projection; support/EOL
policy; response + IR/rollback runbooks; security release evidence linking
L4–L6. Reference instance: this repository. Depends: CYB-1, CYB-8.

**Phases:** I = CYB-0, CYB-A0, CYB-1 (CYB-1F freeze mid-package) ·
II = CYB-2, CYB-3, CYB-4 (+ CYB-5c's override-ledger fix only) ·
III = CYB-5, CYB-6, CYB-7, CYB-8 · IV = CYB-9 + integration + close
accounting. Dependency spine: CYB-1F → all; CYB-2 → {CYB-6, CYB-8};
CYB-3 → {CYB-7, CYB-8}; CYB-4 → CYB-6; CYB-8 → CYB-9.

## 5. Test-first implementation sequence

Per package: (1) schema fixtures (valid + every typed failure class) before
implementation; (2) fake adapters/synthetic fixtures prove contracts offline;
(3) negative gates ("all skipped", "required skipped", stale plan, digest
mismatch, expired waiver, replayed acknowledgement) get failing fixtures
FIRST; (4) migration tests prove v0/v1 evidence cannot silently satisfy v2
policy; (5) cross-platform capability probes gate platform-specific fixtures
(existing symlink-capability pattern). Guard/hook/canon code and test-suite
authorship dispatch to `goldfish-deep` per MP rules; ordinary briefed
implementation to `goldfish-implementor`.

## 6. Mandatory gates and stop conditions

- CYB-1 schema-boundary freeze: PO checkpoint before Phase II dispatches.
- Every package: Full Verify + Security green on its candidate, independent
  fresh-context Critic (ADR-0014/0015) BEFORE the package PO gate.
- Guard-push evidence contract at every push (no evidence-free pushes; the
  PO-run guarded-push tool remains a PO-only escape hatch).
- Boundary re-approval rule: a frozen schema changes only with a recorded
  re-approval; consumers re-verify against the new digest.
- Stop conditions: any guardrail weakening, any `mini`-profile scope breach,
  any unresolved trust-boundary violation in the delivery process itself,
  missing PO-gate authority for a gate decision.

## 7. Verification and evidence

Every package delivers: candidate-bound `verify-latest.json` +
`security-latest.json` (v2 once CYB-2 lands), focused suite receipts, Critic
findings record, and its per-issue evidence comment content (merged commit +
acceptance mapping) staged for sprint close. The acceptance matrix
(`backlog-acceptance-matrix.md`) tracks issue-AC → package → evidence class.

## 8. Completion contract

Sprint close = all nine issues individually evidence-closed per the issues'
close-accounting rule; six absorbed backlog items transitioned with evidence;
final integrated candidate green (Full Verify + Security), fresh Critic PASS,
PO gate; `docs/state.md` handover updated; spec retention registered. Cyborg
does NOT claim: certification, vulnerability-freedom, SLSA levels, or
completion of consumer-project rollouts (per-project adoption stays a PO
decision per ADR-0032/0046 discipline).
