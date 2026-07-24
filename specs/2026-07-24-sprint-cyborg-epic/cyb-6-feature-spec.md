# CYB-6 — stack-aware verification breadth (feature spec)

> **Status: DRAFT, design-phase, pre-gate.** Translates issue #44 (fetched
> verbatim via `gh issue view 44`, 2026-07-25) into checkable form. Phase III,
> depends on CYB-1 (`cap.*` family registry — CYB-6 populates the thirteen
> CYB-1F-frozen roots with adapters/conformance, never owns the identity
> scheme), CYB-2 (#42 evidence feed), CYB-4 (threat-model inputs). Not
> dispatched.

## 1. Problem (condensed)

The current security phase (secrets, SCA, SAST, license) is a valuable
baseline but not a complete verification strategy — different systems need
different techniques (source/data-flow, IaC, container, API/DAST, fuzz,
permission checks). A fixed global scanner list either under-tests high-risk
systems or burdens irrelevant ones. Outcome: a policy-driven, stack-aware
capability plan selecting appropriate techniques from stack + assurance +
threat model.

## 2. Capability families — already frozen, not re-decided here

The thirteen families in #44 are **verbatim identical** to CYB-1F §3's frozen
`cap.*` roots (secrets, sca, sast, iac, container, ci-workflow, dast, fuzz,
memsafety, authz, crypto, privacy, ai-agent). CYB-6's job is **registry
population** (adapters + conformance for each root) — CYB-1F already states
"CYB-6 later populates the registry with adapters and conformance but never
owns the identity scheme." This spec does not redefine the family list.

## 3. Acceptance criteria — checkable form

| # | #44 AC (paraphrased) | Checkable criterion | Evidence class |
| --- | --- | --- | --- |
| AC1 | Candidate-bound stack/exposure inventory drives a deterministic capability plan | Inventory fixture: same candidate → same digest-bound plan across 2 runs | Determinism fixture |
| AC2 | Every selected/omitted capability has an explainable policy reason | Plan-output fixture: every `cap.*` entry (selected or omitted) carries a non-empty reason field | Explainability fixture |
| AC3 | Required unavailable/unsupported modules fail per policy, cannot become pass | Negative-gate fixture: required-but-unavailable `cap.*` blocks, never silently downgrades to pass | Negative-gate fixture |
| AC4 | Representative static/SCA/IaC/container/workflow/API-dynamic/fuzz adapters satisfy one provider-neutral contract | One shared adapter-contract test suite run against ≥7 representative adapters (one per major family cluster) | Adapter conformance suite |
| AC5 | Rules/config/tool/data identities and coverage feed #42 evidence | Cross-package fixture: CYB-6 adapter output validates against CYB-2's `security-evidence.v2` schema | Cross-package fixture |
| AC6 | Dynamic testing bound to exact non-production target + authorized scope | Dynamic-harness fixture: target-binding check rejects an unauthorized/production-looking target | Dynamic-harness fixture |
| AC7 | Fuzz failures retain minimized reproducers, support regression replay | Fuzz fixture: a synthetic crash reproduces after minimization, then replays clean post-fix | Fuzz-replay fixture |
| AC8 | Empty rule sets/unreachable targets/partial coverage/truncated runs have typed outcomes | 4 dedicated fixtures, one per named class | Typed-outcome fixture set |
| AC9 | Discovery/adapters don't implicitly install tools or execute untrusted setup | Fixture: discovery against a repo with a malicious `postinstall`-style script never executes it | Safety fixture |
| AC10 | Resource/network/credential/target boundaries enforced and tested | Boundary fixture per resource class | Boundary fixture |
| AC11 | Cross-platform fixtures cover supported execution paths | Fixture matrix across declared supported platforms (native Windows included per the Windows/sandbox-assurance slice cross-link) | Cross-platform fixture |
| AC12 | Core conformance runs offline with synthetic fixtures | CI job asserts zero outbound network calls during core conformance | Offline-conformance fixture |
| AC13 | Docs show how to add an adapter without changing core semantics | Doc + a worked "add one new adapter" walkthrough that touches no core file | Doc check |

Coverage note: matches `backlog-acceptance-matrix.md`'s "13" count for #44.

## 4. Scope carried (from #44 §1-§8, mapped to spec.md's CYB-6 summary)

Stack/exposure inventory (candidate-bound, digest, auto-detection with
confidence+evidence, project declarations resolve ambiguity, unknown/
conflicting stays visible, repo-controlled metadata untrusted and cannot
execute during discovery — direct overlap with CYB-5's trust-boundary
classification) · module selection from L1(CYB-1)+L2(CYB-2) plus CYB-4 threat-
model inputs (#44 scope 2, explicit in spec.md) · registry population for the
thirteen CYB-1F family IDs · new real adapters: IaC, CI-workflow,
container-static · bounded dynamic/fuzz harness CONTRACT + synthetic
conformance adapters with end-to-end regression-replay proof on synthetic
reproducers (PRD deviation, per spec.md: contract-first, not every family
needs a live external-service adapter in this package).

## 5. Non-goals (verbatim from #44)

Running all techniques for all projects; declaring a project secure because
modules passed; scanning production by default; embedding one vendor's finding
schema in the core; replacing threat modeling/human review/remediation
governance.

## 6. Dependencies

#40 (exact-candidate, resolved) · #41/CYB-1 (catalog + `cap.*` registry,
hard) · #42/CYB-2 (policy-complete aggregation + normalized evidence, hard) ·
#43/CYB-4 (threat-model inputs, hard) · #39/CYB-3 (SBOM/component inventory
where dependency/artifact analysis needs it, soft).

## 7. Gate

Universal package rule. Inventory/adapter-family/synthetic-fixture work can
run on separate branches once #41/#42 schemas are approved (issue's own
"Parallelism" note) — but integration still needs CYB-1, CYB-2 AND CYB-4
closed per the dependency spine (spec.md §4: "CYB-4 → CYB-6"). No dispatch yet.
