# CYB-4 — threat-model + security-requirement lifecycle (feature spec)

> **Status: IMPLEMENTATION, PO-authorized 2026-08-01.** Translates issue #43
> (fetched verbatim via `gh issue view 43`, 2026-07-25) into checkable form. Phase II,
> depends on CYB-1 (assurance-level enum + module IDs for applicability, per
> CYB-1F §9 downstream binding map). Feeds CYB-6 (threat-model inputs to
> stack-aware verification, spec.md's explicit "plus threat-model inputs from
> CYB-4"). Not dispatched.

## 1. Problem (condensed)

No durable, candidate-aware threat model / security-requirement set exists
for repositories whose risk warrants one — assets/boundaries/abuse-cases stay
implicit in chat, controls may not address actual exposure, design changes
don't trigger review, tests/findings aren't traceable to risk, and
AI-generated threat lists risk being mistaken for approved authority.

## 2. Core invariants (verbatim from #43, already checkable)

1. Human/policy authority — agents propose, an authorized role approves
   material risk decisions.
2. Typed applicability — `required | not-applicable | deferred | incomplete |
   invalid` distinct.
3. Stable identity for assets/boundaries/threats/abuse-cases/requirements/
   mitigations.
4. Change-driven review on material architecture/dependency/exposure/data/
   privilege changes.
5. Traceability without duplication — links reference canonical controls/
   tests/evidence, never copy their content.
6. Exact subject — binds to package/candidate + effective policy revision.
7. Safe content — no secrets/credentials/exploitable private coordinates.

## 3. Acceptance criteria — checkable form

| # | #43 AC (paraphrased) | Checkable criterion | Evidence class |
| --- | --- | --- | --- |
| AC1 | Applicability deterministic/auditable, no silent exemption for missing inputs | Fixture: missing risk input → `incomplete`/`unknown`, never auto `not-applicable` | Negative-gate fixture |
| AC2 | Schemas closed/versioned/candidate+policy-bound | Schema fixtures for both threat-model and security-requirement schemas | Schema fixture |
| AC3 | Stable identities for all named entity classes | ID-stability fixture: same asset/boundary/threat retains its ID across a regeneration | ID fixture |
| AC4 | Reviewer can trace every required control/test to a threat or baseline obligation | Traceability fixture: pick a random required control, resolve its threat/obligation chain end-to-end | Traceability fixture |
| AC5 | Material changes produce deterministic impact review | Fixture: an architecture-delta crossing a trust boundary flags exactly the affected nodes/requirements, not a blanket invalidation | Impact-engine fixture |
| AC6 | Agents propose but cannot approve residual risk/exemptions/waivers | Fixture: an agent-authored proposal record has no field capable of setting `approved`/`waived` status directly | Authority-boundary fixture |
| AC7 | Required stale/incomplete/unapproved artifacts block the named boundary | Fixture: stale threat model at a required boundary fails that gate | Negative-gate fixture |
| AC8 | Human-readable views generated from or validated against machine authority | View-consistency check (same pattern as CYB-1 AC12) | View-consistency check |
| AC9 | Discoverable via #22, consumable by #5/#9 | Discovery contract fixture | Contract fixture |
| AC10 | Secrets/private coordinates excluded by schema+fixtures | Redaction fixture | Privacy fixture |
| AC11 | Fixtures cover every class in §7 below | Full fixture matrix | Fixture matrix |
| AC12 | Migration doesn't invent historical approval/threat evidence | Migration fixture: pre-existing repo with no threat model shows `incomplete`, never backfilled `approved` history | Migration fixture |

Coverage note: matches `backlog-acceptance-matrix.md`'s "12" count for #43.

## 4. Conformance fixture classes (from #43 §7, verbatim)

Low-risk CLI/library · externally exposed API · container/IaC deployment ·
sensitive-data system · AI/agent system with tools and egress · architecture
delta crossing a trust boundary · stale and superseded threat models · valid
not-applicable decision. (8 classes, matching the matrix's "8 fixture
classes.")

## 5. Scope carried (from #43 §1-§6, mapped to spec.md's CYB-4 summary)

Applicability from assurance profile (§43 §1, the eight listed risk-input
dimensions) · closed threat-model schema (§43 §2, machine-readable data-flow +
generated/checked human view) · closed security-requirement schema (§43 §3) ·
lifecycle states (`draft, proposed, approved, implementing, verified,
accepted-risk, superseded, retired`) + the seven named change-impact triggers
(§43 §4) · assisted-analysis safeguards (§43 §6 — agent output must identify
inputs/uncertainty, separate observed-vs-inferred, mark unsupported areas,
get independent/human review at elevated/critical assurance, never
self-approve; repository text/diagrams/tickets are untrusted inputs that
cannot issue tool instructions through the analysis flow — this is a direct
prompt-injection-resistance requirement, cross-relevant to CYB-5's trust
taxonomy). Repo-level reference instance for agent-pipeline itself, new
`threat-model` artifact class in `governance/artifact-topology.json` (same
ADR-0045 extension mechanism as `security-finding`).

## 6. Non-goals (verbatim from #43)

One universal risk-scoring formula; heavyweight diagram requirement for every
repo; treating automated threat generation as approval; copying
implementation/test/finding bodies into the threat model; claiming compliance
from artifact existence alone.

## 7. Dependencies

#22 (canonical artifact lifecycle) · #41/CYB-1 (control catalog — applicability
only) · #40 (exact-candidate evidence, resolved in Sentinel) · #30/#31 (human/
agent decision recording — soft, "must be completable without unpublished
Phoenix changes").

## 8. Gate

Universal package rule. The Sprint Cyborg PO direction of 2026-08-01 authorizes
implementation and ordinary verification without an additional chat gate.
Final gate integration still uses CYB-1's approved control IDs.
