# CYB-8 — finding/exception/VEX lifecycle (feature spec)

> **Status: DRAFT, design-phase, pre-gate.** Translates issue #47 (fetched
> verbatim via `gh issue view 47`, 2026-07-25) into checkable form. Phase III,
> depends on CYB-2 (#42 finding envelope) and CYB-3 (component identity). Not
> dispatched.

## 1. Problem (condensed)

Scanner output is evidence for a run, but there's no end-to-end lifecycle for
deduplicating, triaging, owning, waiving, remediating, retesting and closing
findings — the same root cause can reappear as unrelated findings, severity
gets confused with exploitability, false positives/accepted risks lack
durable authority+expiry, patches may close an issue without replaying the
original exploit. Outcome: a candidate/component-aware finding lifecycle with
explicit human authority for exceptions, VEX-style disposition, remediation
evidence, independent confirmation, automatic reopening on drift.

## 2. Core invariants (verbatim from #47, already checkable)

1. Raw observations immutable; triage/disposition are separate governed
   records.
2. SBOM inventory, scanner finding, exploitability/VEX state, risk acceptance,
   release approval stay distinct (direct link to CYB-3's invariant 2 — same
   separation principle, opposite direction: CYB-3 says the SBOM must not
   embed findings, CYB-8 says findings must not embed SBOM).
3. Every material finding has stable identity, owner, SLA, current
   disposition.
4. Waivers scoped/reasoned/time-bounded, cannot edit away source evidence.
5. Closure requires remediation + replay/retest evidence against the
   affected candidate.
6. Tool/rule/policy drift can reopen or stale prior conclusions.
7. External trackers are projections, not authority.

## 3. Acceptance criteria — checkable form

| # | #47 AC (paraphrased) | Checkable criterion | Evidence class |
| --- | --- | --- | --- |
| AC1 | Raw/normalized/triage/VEX/waiver/remediation/approval are distinct artifacts | Schema fixture: 7 distinct record types, no field overlap that would let one substitute for another | Schema fixture |
| AC2 | Finding IDs/dedup deterministic across repeated scans and scanner upgrades | Dedup fixture: same underlying issue found by scanner v1 and v2 collapses to one ID | Dedup fixture |
| AC3 | Every state transition typed/authorized/timestamped/reasoned/scoped | Transition fixture: an untyped or unauthorized transition attempt is rejected | State-machine fixture |
| AC4 | VEX records bind to exact component/SBOM/product versions, not inferred from absence | Fixture: no-finding-present ≠ a `not-affected` VEX record (explicit absence≠VEX invariant) | VEX-binding fixture |
| AC5 | Waivers require compensating controls+expiry, auto-invalid on scope/policy drift | Expiry/drift fixture (same pattern as CYB-1's waiver fixture, reused schema) | Waiver fixture |
| AC6 | Agents cannot approve their own false-positive/not-affected/accepted-risk decision | Self-approval fixture: an agent-authored disposition record has no path to self-set `approved` | Authority-boundary fixture |
| AC7 | Closure cites patch, original-trigger replay, security regression, independent confirmation | Closure fixture: a closure lacking a replay reference is rejected | Replay-based-closure fixture |
| AC8 | Release blocks on exact unresolved policy-relevant findings, not stale dashboard state | Release-gate fixture: a stale external-dashboard "resolved" status does not unblock release | Release-gate fixture |
| AC9 | Scanner/rule/SBOM/policy/candidate drift reopens or stales conclusions deterministically | Drift-reopening fixture per the 7 triggers in §4 below | Drift fixture |
| AC10 | External systems remain projections, cannot mutate canonical authority | Projection fixture: an external tracker write attempt does not alter the canonical record | Projection fixture |
| AC11 | Fixtures cover duplicate/collision, false-positive, not-affected, accepted-risk, expiry, recurrence, reopened, scanner-migration | 8-class fixture set | Fixture matrix |
| AC12 | Metrics (time-to-triage/remediate, recurrence, waiver age, escape rate, evidence completeness) without leaking sensitive content | Metrics fixture + a redaction check on the metrics export path | Safe-metrics fixture |

Coverage note: matches `backlog-acceptance-matrix.md`'s "12" count for #47.

## 4. Lifecycle state machine (from #47 §2, verbatim — 15 states)

`observed → needs-triage → confirmed → duplicate | false-positive |
not-affected | affected → under-remediation → mitigated |
accepted-risk/waived | fixed-awaiting-verification → verified-fixed →
superseded | stale | reopened`. Every transition names authority, reason,
timestamp, candidate/policy scope, evidence; invalid transitions fail closed
(AC3).

## 5. Drift/recurrence re-evaluation triggers (from #47 §7, verbatim — 7)

Candidate/dependency change · SBOM/component identity change · scanner/rule/
data-snapshot change · threat-model/control-profile change · waiver expiry ·
new exploitability evidence · similar root-cause recurrence (root-cause
clustering without treating heuristic similarity as proven identity).

## 6. Scope carried (from #47 §1-§8, mapped to spec.md's CYB-8 summary)

L4 ledger + state machine (§4) + projections · dedup/cluster identity (AC2) ·
VEX record class bound to SBOM identity (AC4, extends #39's artifact-topology
class the same way CYB-4's threat-model class does — same ADR-0045 extension
mechanism) · ownership/SLA policy inputs (§47 §4, inputs preserved not
collapsed into an unexplained score) · remediation package with
original-trigger replay (§47 §6, AC7) · drift reopening (§5 above).

## 7. Non-goals (verbatim from #47)

Putting findings/VEX inside the SBOM payload (CYB-3's boundary, enforced from
this side too); letting an external scanner/dashboard become canonical
authority; auto-accepting risk from severity/reachability alone; requiring
publication of sensitive exploit details; claiming remediation without
candidate-bound verification.

## 8. Dependencies

#39/CYB-3 (SBOM lifecycle, hard — component identity) · #41/CYB-1 (control/
assurance profiles) · #42/CYB-2 (normalized findings+coverage, hard per
spec.md: "Depends: CYB-2 (finding envelope), CYB-3 (component identity)") ·
#43/CYB-4 (threat/security requirements). #30/#31/#32 — soft, future
consumers not prerequisites.

## 9. Gate

Universal package rule. Schema/state-machine/synthetic-remediation-fixture
work can proceed with CYB-2/CYB-3 adapters in parallel (issue's own
"Parallelism" note); external governance/export integration is optional
follow-up. No dispatch yet.
