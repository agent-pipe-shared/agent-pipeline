# PRD — Sprint Cyborg: Post-go-live security assurance

> Status: **DRAFT — awaiting PO approval** (EL-19 gate; no implementation
> dispatch before the PO writes "approved").
> Authored 2026-07-24 in the Cyborg design phase (V3 profile `epic`,
> `design_phase`).

## Identity and immutable inputs

- **Sprint label:** `sprint:cyborg` — "Post-go-live security: secure-by-design
  controls, candidate assurance and supply-chain integrity."
- **Common base:** the accepted go-live commit
  `86deb0cbbed8cbaae7d652e7060c220cecfe3436` = tag `v0.4.0` on `main`. All
  Cyborg work branches from this exact OID, never from a pre-go-live
  candidate.
- **Sprint branch (this runner):** `feat/sprint-cyborg-claude`, following the
  normative branch template `feat/sprint-cyborg-<runner>` from the issue set.
- **Issue scope:** the nine open `sprint:cyborg` issues #39, #41, #42, #43,
  #44, #45, #46, #47, #48 (read in full on 2026-07-24; no comments present at
  read time).
- **Activation gate:** the issues require "Sprint Sentinel merged and
  repository go-live accepted." Cross-sprint prerequisites #22, #27, #28 and
  #40 are CLOSED; `v0.4.0` is released; the PO instructed Cyborg activation on
  2026-07-24. The gate is satisfied.
- **Runner ownership:** this session/runner owns ONLY Sprint Cyborg. Residual
  Sentinel work (formal sprint close, `0.4.1`) and any parallel sprint belong
  to other runners/branches and are never modified from this branch.

## Design authority

Per PO directive 2026-07-24: the issues are well-prepared **requirements
input**; their solution sketches are NOT adopted design. The Epic's own
architecture lives in [`spec.md`](spec.md) (one layered evidence spine,
reuse of the three existing enforcement points, deviation catalog §3). Where
spec and issue sketch conflict, the spec wins; every material deviation is
listed and goes through this PO gate.

## Summary

Sentinel made the Pipeline's own release trustworthy (exact-candidate
evidence, guard union, go-live). Cyborg makes the Pipeline able to *produce
and prove secure software* as a product capability: a versioned
secure-development control catalog with assurance profiles, policy-complete
fail-closed security verification, a governed SBOM lifecycle, threat-model and
security-requirement artifacts, stack-aware verification breadth, provenance
and artifact-integrity attestations, a governed finding/VEX/remediation
lifecycle, product-security readiness artifacts, and hardening of AI-assisted
development itself.

The unifying invariants across all nine issues:

1. **Policy-complete, fail-closed** — a green verdict means every required
   control reached an accepted terminal state; `SKIPPED` is never `PASS`.
2. **Exact-candidate binding** — every claim binds to an immutable
   commit/tree/digest (foundation: closed #40).
3. **Typed honesty** — `met`, `not-met`, `not-applicable`, `unavailable`,
   `waived`, `unknown`, `invalid`, `partial`, `stale` stay distinct; nothing
   collapses into false success.
4. **Provider-neutral core, adapter edges** — no commercial tool becomes
   normative; core conformance runs offline with synthetic fixtures.
5. **Human authority preserved** — agents propose; authorized humans/policy
   approve risk, waivers, releases and disclosures. Agents never self-approve.

## Why Cyborg is an Epic

Seven of nine issues are sized XL, two L. They define interlocking contracts
(catalog → capability plan → evidence → findings → release binding) plus an
ADR amendment (ADR-0032) and extensions of the canonical artifact topology
(ADR-0045/#22). Multi-package schema design, cross-package integration
surfaces, and multi-session delivery are exactly the Epic profile. Per the
issues' process note, each work package still selects its own
mini/feature/epic lifecycle profile at dispatch time.

## Complete scope

### GitHub issues (all nine; none deferred)

| Issue | Prio/Size | Theme | Work package |
| --- | --- | --- | --- |
| #41 | P0 / XL | Secure-development control catalog + assurance profiles | CYB-1 |
| #42 | P0 / XL | Policy-complete, fail-closed security verification | CYB-2 |
| #39 | P1 / XL | Release-bound SBOM lifecycle and interchange contract | CYB-3 |
| #43 | P1 / L | Threat-model + security-requirement lifecycle | CYB-4 |
| #46 | P1 / XL | AI-assisted development hardening | CYB-5 |
| #44 | P1 / XL | Stack-aware static/dep/IaC/container/dynamic/fuzz verification | CYB-6 |
| #45 | P1 / XL | Source/build provenance + release-artifact integrity | CYB-7 |
| #47 | P1 / XL | Finding, exception, VEX and remediation lifecycle | CYB-8 |
| #48 | P2 / L | Product-security readiness, disclosure, support, IR | CYB-9 |

### Backlog items absorbed into Cyborg (proposed triage; PO confirms at this gate)

| Backlog item | Fit | Disposition |
| --- | --- | --- |
| `pipeline.recovery-preview-callback-attestation` (P1 defect, due 2026-07-27) | Candidate assurance; false-success boundary; implementation candidate exists with open Critic findings | CYB-A0 assurance quickfix, first implementation package of the sprint |
| `pipeline.critic-context-isolation` (due 2026-07-27) | #46 §6 multi-agent containment | Absorbed into CYB-5 |
| `pipeline.dispatch-provenance` (due 2026-07-27) | #46 §5 change-integrity / provenance | Absorbed into CYB-5 |
| `pipeline.cross-repository-override-ledger-binding` (due 2026-07-27) | #46 §8 authority containment; guard/override audit integrity | Absorbed into CYB-5 |
| `pipeline.elephant-direct-implementation-under-afk-authorization` | #41 §6 waiver/exception lifecycle: "PO-waived direct implementation" becomes a governed, expiring exception class with mandatory follow-up Critic | Absorbed into CYB-1 (waiver semantics) + close-ritual hook |
| `pipeline.verify-gate-scoped-registration` (stub) | #42 scoped capability registration | Absorbed into CYB-2 |

Accepting this PRD records the triage decision (decision/rationale/assignment/
date) in each item per the backlog process; the items stay open until their
absorbing package delivers evidence.

### Explicitly out of scope

- Residual Sentinel work: formal sprint close, `0.4.1`, `sentinel-go-live-completion`, all `pipeline.windows-*` items, `push-guard-worktree-target` (in progress elsewhere), `observation-intake-document-governance`, `private-overlay-activation-bridge`.
- Nightwing (onboarding/docs), Phoenix (governance evidence/audit trails), Nova (execution scale) issues and their backlog analogues (`documentation-information-architecture`, `dual-channel-publication`, `regulated-document-hooks`, `spec-retention` items, `afk-assumption-mode`, `execution-model-switchback`, `multi-cli-efficiency-pilots`, `session-keep-awake`, `nonblocking-interaction-continuity`, review-economics items, `stateful-design-contract-template`, `canonical-worktree-lifecycle`, `po-gate-worktree-authority`, `codex-plugin-validator-host-parity`, `codex-sandbox-critic-longterm`, `t1-governance-path-preflight`, `project-scoped-github-issue-operations`).
- Anything the issues list as non-goals (certification claims, vendor mandates, auto-installation, default production scanning, publishing sensitive exploit detail, agent-approved waivers/releases).

## Required outcomes

1. **Control catalog and assurance authority (#41, CYB-1)** — a versioned,
   closed-schema control catalog with baseline/elevated/critical profiles,
   typed applicability, deterministic resolver, candidate-bound evaluation
   receipt and governed waiver lifecycle. This is the foundation package: its
   approved schema boundary unblocks every other package.
2. **Policy-complete verification (#42, CYB-2)** — required-capability plan
   from the effective control profile; adapter capability contracts;
   fail-closed completeness evaluation with the full typed outcome set;
   digest-bound tools/rules/config; normalized findings + coverage;
   `pipeline.security-evidence.v0` migration. "All scanners skipped" can never
   exit green again on a repository where policy requires them.
3. **Supply-chain truth (#39 + #45, CYB-3 + CYB-7)** — governed SBOM artifact
   class (ADR-0032 amendment, #22/ADR-0045 extension), CycloneDX/SPDX
   profiles, generation adapter contract, release-bound immutable inventory;
   plus SLSA-aligned provenance envelopes, digest-addressed artifacts,
   attestation via external key boundary, graded reproducibility states.
4. **Risk lifecycle (#43 + #47, CYB-4 + CYB-8)** — canonical threat-model and
   security-requirement schemas with change-driven review; governed finding
   lifecycle with dedup, VEX-style disposition, scoped expiring waivers,
   remediation with original-trigger replay, drift-driven reopening.
5. **Verification breadth (#44, CYB-6)** — stack/exposure inventory driving a
   deterministic capability plan across thirteen capability families;
   provider-neutral adapter contracts with reference adapters; opt-in bounded
   dynamic/fuzz harnesses; all feeding CYB-2 evidence.
6. **AI-assisted development hardening (#46, CYB-5)** — trust-boundary
   classification, digest-bound tool/definition integrity, least-authority
   task manifests, context/data protection, independent change-integrity
   checks, multi-agent containment, drift requalification, CI authority
   boundaries. Dogfooded on the Pipeline itself (the absorbed backlog items
   are its first three concrete fixtures).
7. **Product-security readiness (#48, CYB-9)** — applicability-driven
   disclosure policy, support/EOL policy, vulnerability response, incident
   response/rollback runbooks, security release evidence, operational
   expectations.
8. **Assurance quickfix (CYB-A0)** — finish the recovery-preview callback
   attestation package: resolve the open Critic findings (replay
   acknowledgement/API migration, candidate-bound evidence), obtain
   independent review, and close the false-success boundary before the large
   packages start. Due date 2026-07-27 is met by scheduling it first.

## Order of work

- **Phase I — Foundation:** CYB-0 (sprint scaffolding: feature-state switch via
  the sanctioned writer, triage records, spec-retention registration),
  CYB-A0 (assurance quickfix), CYB-1 (#41 catalog). CYB-1's schema-boundary
  freeze (CYB-1F, incl. the capability-ID grammar and the thirteen family
  IDs) is a named PO checkpoint delivered mid-package so Phase II can start.
- **Phase II — Core enforcement (parallel after CYB-1F):** CYB-2 (#42),
  CYB-3 (#39), CYB-4 (#43); of CYB-5 only the self-contained override-ledger
  defect fix may start early.
- **Phase III — Breadth (parallel):** CYB-5, CYB-6 (#44), CYB-7 (#45), CYB-8
  (#47). CYB-6 consumes CYB-4's threat-model inputs; CYB-7 consumes CYB-3's
  SBOM binding; CYB-8 consumes CYB-2's finding envelope and CYB-3's
  component identity.
- **Phase IV — Readiness and close:** CYB-9 (#48), cross-package integration
  verification, per-issue evidence comments, sprint close accounting.

Dependency spine: CYB-1F → all; CYB-2 → {CYB-6, CYB-8}; CYB-3 → {CYB-7,
CYB-8}; CYB-4 → CYB-6; CYB-8 → CYB-9. Fake adapters and synthetic fixtures
keep contract work unblocked by real scanner integrations.

## Hard stops

- No package starts implementation before this PRD is approved (EL-19).
- No work package weakens an existing guardrail, gate or deny rule; Full
  Verify and Security gates stay green at every push (guard-push contract).
- Schema/contract changes to another package's approved boundary require a
  recorded re-approval, not a silent edit.
- An agent may not approve waivers, risk acceptance, disclosure or release —
  in the deliverables NOR in the delivery process itself.
- Sprint close accounting: per-issue evidence comment naming the merged commit
  and exact acceptance evidence; incomplete issues stay open; bulk closure is
  forbidden.

## Non-goals

Aggregated from the issue set: no certification/compliance claims from
mappings; no mandated commercial scanner/registry/builder/service; no
auto-installation of tools; no production scanning by default; no
bit-for-bit reproducibility mandate for every technology; no embedding of
findings/VEX into SBOM payloads; no external system as canonical authority;
no heuristic prompt-injection "detection" sold as proof; no elimination of
human accountability.

## Definition of Done

- All nine issues satisfy their acceptance criteria with candidate-bound
  machine evidence, each closed individually with its evidence comment.
- The six absorbed backlog items carry completed triage records and either
  closure evidence or an explicit remaining-scope note.
- Full Verify and the Security gate pass on the final integrated candidate;
  independent Critic review per checkpoint deliverable (ADR-0014/0015);
  PO gate passed per package and at sprint close.
- `docs/state.md` hands over a clean sprint-close state; specs are retained
  per the spec-retention guard.

## Binding PO decisions and exceptions recorded at this gate

1. **Parallel-sprint exception:** calibration `wipLimit: 1` is overridden by
   the PO's 2026-07-24 instruction: parallel sprints on separate runner
   branches; this runner owns only Cyborg.
2. **Model exception:** the registered V3 route for `epic/design_phase/claude`
   is `opus/xhigh`; the PO explicitly set Fable 5 / xhigh via `/model` for
   this session. Recorded as a PO exception (MP-05 rationale: Epic design of
   the largest sprint so far).
3. **Branch template:** `feat/sprint-cyborg-claude` per the issues' normative
   template (adjusted from the initially requested generic name).
4. **PO-gate authority receipt** is UNAVAILABLE on this checkout
   (`check-po-gate-authority.mjs`); remedy is `node setup.mjs
   --publish-po-profile` from the canonical primary checkout — a PO action
   outside this branch. Until then, gated pushes rely on the standard
   guard-push evidence path.

## Advisory record (V3 duty, Epic profile)

One fresh read-only Advisor consult (Claude chain, native Fable adapter,
answered 2026-07-24) reviewed this design against the nine issues. Its
material findings were incorporated: capability-ID grammar + thirteen family
IDs hoisted into the CYB-1F freeze; deviations D9 (guard-push
compatibility-window polarity vs #42 scope 7, time-bounded) and D10 (runner
asymmetry of CYB-5 enforcement, Codex equivalence sub-deliverable) added;
Release/PR/Close/Push boundary map made explicit; CYB-4 → CYB-6 dependency
wired; D3/D5 narrowed to satisfiable AC form; findings ledger assigned an
ADR-0045 topology class. No `pipeline.advisory-receipt.v1` file was produced
by the host machinery in this session; this record is the disclosure, not a
receipt claim.

## Open decisions for the PO (answer with the gate)

- **A.** Approve the nine-issue scope plus the six backlog absorptions/triage
  dispositions as listed (or name exclusions).
- **B.** Approve the CYB package slicing and Phase I→IV order, including
  CYB-A0 first and the CYB-1 schema-boundary checkpoint as a named PO gate.
- **C.** Confirm that per-package lifecycle profiles (mini/feature/epic) are
  selected at dispatch time per MP/V3 rules, within this approved Epic.
