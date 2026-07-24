# CYB-9 — product-security readiness (feature spec)

> **Status: DRAFT, design-phase, pre-gate.** Translates issue #48 (fetched
> verbatim via `gh issue view 48`, 2026-07-25) into checkable form. Phase IV
> (final package), depends on CYB-1 (assurance levels) and CYB-8 (finding
> lifecycle — spec.md §4 dependency spine: "CYB-8 → CYB-9"). Not dispatched.
> This completes design-phase drafting for all nine CYB-N packages plus CYB-A0
> and CYB-1F.

## 1. Problem (condensed)

Secure implementation and scanning don't complete the product-security
lifecycle — no governed answer for vulnerability disclosure/reporting,
supported versions, triage/response ownership, emergency-fix/rollback,
operational monitoring requirements, or public-vs-internal separation of
security commitments. Repositories may omit these, duplicate them
inconsistently, or leave stale contacts after release.

## 2. Acceptance criteria — checkable form

| # | #48 AC (paraphrased) | Checkable criterion | Evidence class |
| --- | --- | --- | --- |
| AC1 | Applicability determines exact readiness artifact set, no silent exemption for unknown product classes | Fixture: unclassified product type → `unknown`/`incomplete`, never silently `not-applicable` | Negative-gate fixture |
| AC2 | Public disclosure, restricted response, canonical finding records stay separate | Schema fixture: 3 distinct artifact classes, no field lets one substitute for another | Schema fixture |
| AC3 | Support/EOL policy versioned, authoritative, consistent with release manifests | Fixture: a release outside its support window is flagged inconsistent, not silently admitted | Consistency fixture |
| AC4 | Vulnerability intake/SLA/ownership/remediation/disclosure/closure have named authority/evidence | End-to-end fixture tracing one synthetic vulnerability through the full named-authority chain | Traceability fixture |
| AC5 | Incident/rollback runbooks bind to actual release/deploy capabilities | Fixture: a runbook step referencing a nonexistent deploy capability fails validation, not silently accepted as prose | Capability-binding fixture |
| AC6 | Agents cannot publish advisory/accept risk/close incident/authorize production change without human/policy gate | Authority-boundary fixture (same pattern as CYB-1/CYB-4/CYB-8's self-approval fixtures) | Authority-boundary fixture |
| AC7 | Security release evidence links exact fixed artifacts, SBOM/provenance, validated findings | Cross-package fixture referencing CYB-3/CYB-7/CYB-8 records | Cross-package fixture |
| AC8 | Restricted details/secrets/private endpoints cannot enter public artifacts | Redaction fixture (same pattern as CYB-3's privacy fixture) | Privacy fixture |
| AC9 | Stale contacts/unsupported channels/missing required artifacts produce typed failures | 3 dedicated fixtures (stale contact, unsupported channel, missing artifact) | Typed-staleness fixture |
| AC10 | Fixtures cover public package, internal service, unsupported legacy version, emergency fix, rollback, valid not-applicable | 6-class fixture set | Fixture matrix |
| AC11 | #22/#5/#9/#24 can consume artifacts without becoming their authority | Consumer-without-authority fixture | Contract fixture |
| AC12 | Docs explain disclosure/support/incident/release/recovery responsibilities | Doc review checklist | Doc check |

Coverage note: matches `backlog-acceptance-matrix.md`'s "12" count for #48.

## 3. Scope carried (from #48 §1-§8, mapped to spec.md's CYB-9 summary)

Applicability-driven artifact set (7 input dimensions from §48 §1) ·
`SECURITY.md` public projection (§48 §2) · support/EOL policy (§48 §3) ·
vulnerability response process roles/evidence (§48 §4, integrates with CYB-8
"without making public disclosure text the canonical finding record") ·
incident-response + rollback runbooks (§48 §5) · security release evidence
linking L4-L6 (finding/VEX ledger through release binding) · operational
security expectations (§48 §7, requirements+evidence links, not one
monitoring product). The readiness artifact set gets a new
`security-readiness` topology class in `governance/artifact-topology.json`
(same ADR-0045 extension mechanism already used for `security-finding` and
CYB-4's `threat-model` class). Reference instance: this repository itself —
consistent with CYB-1's reference catalog and CYB-7's local reference builder,
this package should also produce agent-pipeline's own SECURITY.md/support
policy as its proving instance, not only an abstract schema.

## 4. Non-goals (verbatim from #48)

Operating a hosted vulnerability-reporting service; mandating one disclosure
platform/regulator/incident tool; publishing sensitive exploit/operational
details; replacing organization-wide incident management; claiming legal/
regulatory compliance from template presence.

## 5. Dependencies

#22 (canonical artifact lifecycle) · #41/CYB-1 (control/assurance profiles,
hard) · #47/CYB-8 (governed finding/remediation lifecycle, hard — the actual
dependency spine entry) · #39/CYB-3 and #45/CYB-7 (SBOM/provenance release
evidence, soft — consumed, not blocking) · #24 (ITSM projection — explicitly
"not required for completion").

## 6. Gate

Universal package rule — the epic's final package, closes Phase IV alongside
"integration and close accounting" (spec.md §4). Applicability/schema/fixture/
projection-rule work can proceed once CYB-1's control IDs are approved
(issue's own "Parallelism" note); the hard blocker is CYB-8 landing first. No
dispatch yet.
