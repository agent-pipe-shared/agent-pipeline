# Sprint Phoenix design readiness audit

Status: design content ready; fixed-candidate review pending

Date: 2026-07-26

This is the requirement-by-requirement audit for the pre-implementation
candidate. It distinguishes content readiness from Product Owner authority,
independent review, commit, push, implementation, and final Epic completion.

## Objective coverage

| Objective requirement | Authoritative evidence | Assessment |
| --- | --- | --- |
| Work only on the dedicated Phoenix branch | Git readback: `sprint_phoenix`, tracking `origin/main`; [scope-validation.md](scope-validation.md) | PROVEN for current workspace |
| Start from the accepted public `origin/main` base | Base commit `9d1b3dc108eb77629ace5b82002120f5539abd8d`; public release `v0.4.6`; [scope-validation.md](scope-validation.md) | PROVEN for the design base |
| Use Pipeline 0.4.6 | Mandatory bootstrap resolved `0.4.6+codex.20260726170452`; [../RECOVERY.md](../RECOVERY.md) | PROVEN after exact continuity recovery and full V4/V3 readback |
| Include every open `sprint:phoenix` issue | Live GitHub readback found #5/#9/#17/#23/#24/#30/#31/#32; [issue-coverage.md](issue-coverage.md) maps all 105 issue acceptance bullets | PROVEN |
| Validate issue ideas rather than copy them | [architecture.md](architecture.md) rejects one mega-log, simple precedence, external authority, raw rationale, exactly-once, compliance, and sibling dependency | PROVEN |
| Include fitting Phoenix/unassigned governance backlog | [scope-validation.md](scope-validation.md) separates incorporated inputs, conformance fixtures, and excluded sibling/legacy work | PROVEN |
| Do not reopen completed 0.4.6 work due stale docs | Product Owner disposition and exclusion rule in [scope-validation.md](scope-validation.md) | PROVEN as scope rule |
| Include runner-neutral marketplace/freshness | PHX-0 in [../acceptance.md](../acceptance.md), trust-root architecture, and first delivery package | PROVEN in design |
| Audit necessary workarounds/recovery safely | Recovery profile `R-AC-01..08`, architecture §14, and [../RECOVERY.md](../RECOVERY.md) | PROVEN in design |
| Produce one coherent Epic architecture | Separate canonical streams over one event kernel; dependency graph and one-writer package sequence in [architecture.md](architecture.md) | PROVEN |
| Remain independent of Nova/Cyborg/Nightwing | Accepted prerequisites and negative dependency gate `EPIC-AC-02` | PROVEN in design; implementation evidence pending |
| Use Advisor help | Approved bounded primary and one fallback attempted; both timed out; workspace digest unchanged; [advisor-review.md](advisor-review.md) | ATTEMPTED / UNAVAILABLE, never passed |
| Produce readable PRD and exact Spec binding | [../prd_phoenix-epic.md](../prd_phoenix-epic.md) plus its `technical-spec-sha256` marker | PROVEN as draft; approval pending |
| No implementation before literal `approved` | Only the design package, lifecycle state, and recovery audit are changed; no product source/schema/test is created | PROVEN for current workspace |

## Design completeness

| Surface | Normative evidence | Status |
| --- | --- | --- |
| Runner-neutral trust root | `PX0-AC-01..10` | Designed |
| Governance event kernel | `K-AC-01..10` | Designed |
| Human decision ledger (#30) | `H-AC-01..15` | Designed |
| Agent journal (#31) | `A-AC-01..16` | Designed |
| Lifecycle/replay (#17) | `L-AC-01..08` | Designed |
| Policy/bundles (#9) | `P-AC-01..13` | Designed |
| Evidence Viewer (#5) | `V-AC-01..10` | Designed |
| Traceability/publication (#23) | `X-AC-01..15` | Designed |
| ITSM (#24) | `C-AC-01..13` | Designed |
| Governance export (#32) | `E-AC-01..21` | Designed |
| Recovery audit | `R-AC-01..08` | Designed |
| Epic integration | `EPIC-AC-01..06` | Designed |

The 145 normative criteria are unique, sequential within each group, and
contain no numbering gap. Every criterion remains unimplemented until a later
approved package maps it to a named automated test/Verify step and exact
candidate evidence.

## Standards-source audit

The design uses immutable primary-source references where a version is claimed:

- CloudEvents specification 1.0.2;
- OpenTelemetry specification 1.59.0 stable Logs Data Model, with a separately
  pinned tested OTLP/protobuf mapping;
- RFC 5424;
- RFC 8785;
- W3C Trace Context;
- DSSE envelope 1.0.2;
- in-toto Attestation Framework 1.2.0 Statement v1.

These profiles provide interchange/canonicalization/signature shapes only.
They do not grant Pipeline authority or prove legal identity, key custody,
trusted time, destination retention, analyst review, or compliance.

## Deterministic checks completed

| Check | Result |
| --- | --- |
| UTF-8, final newline, trailing whitespace across the package | pass |
| Relative Markdown targets | pass; no missing or escaping target |
| Internal Markdown anchors | pass |
| Acceptance IDs | 145 unique; no duplicates or sequence gaps |
| Live issue coverage | 105 rows; every referenced acceptance ID exists |
| Public privacy scan | no absolute home/user path, SSH-key path, token pattern, PAT pattern, or bearer credential found |
| PRD technical-Spec binding | exact SHA-256 marker matches current `spec.md` |
| Git whitespace check for tracked changes | pass |
| Branch/readback | `sprint_phoenix...origin/main`; no push performed |

Full Verify, Security, privacy review, implementation tests, native platform
evidence, Critic, and issue closure are deliberately not claimed in the design
phase.

## Completed pre-review authority transitions

1. The inherited completed 0.4.6 feature was repaired and closed without
   inventing a Result.
2. Phoenix is the active design feature with valid continuity initialized at
   revision 0 (current revision 1 after cleanup binding), exact PRD/Spec
   authority, `result:null`, and `nextAction:"review"`.
3. The Product Owner explicitly authorized the fixed-candidate Critic.
4. A repeated full bootstrap passed under Pipeline 0.4.6. The canonical
   handover's 2026-07-25 date remains a visible documentation-drift warning.

## Remaining authority gates

1. Fix the design and recovery record in one local candidate commit.
2. Run the authorized independent Critic on fixed paths and refs.
3. Correct and freshly re-review any blocking or major finding.
4. Present the readable PRD and wait for the literal Product Owner
   `approved` implementation gate.

No remote write is needed for these design-readiness steps.
