# Sprint Alfred Epic — source-to-requirement traceability

Status: proposed map for the current five-source design package. It does not
replace item-level acceptance or create review/approval evidence.

## Canonical five-source package

| Source | Purpose | Binding rule |
| --- | --- | --- |
| [`design-input.md`](design-input.md) | Current source index and provenance limits. | Historical input files remain unchanged; it is not a replacement for raw input bytes. |
| [`prd_sprint-alfred-epic.md`](prd_sprint-alfred-epic.md) | Outcomes, full five-track/eighteen-WP scope, gates and success criteria. | `technical-spec-sha256` must equal exact current `spec.md` SHA-256. |
| [`spec.md`](spec.md) | Technical contracts, verification and acceptance. | §20 contains the recovery deliverable (RV-1…RV-7); §21 contains the findings round. Changing Spec requires same-candidate PRD marker refresh. |
| [`design.md`](design.md) | Integrated design and sequencing. | Links detailed sources without superseding their evidence. |
| This file | Source-to-requirement/evidence map. | No pass or approval claim. |

## Input lineage

| Input | Requirements carried | Destination |
| --- | --- | --- |
| ADR-0043 amendment and GitHub #108 | Existing epic scope and membership. | PRD §§1–7; Spec §§1–15; `design.md`. |
| PO inputs 2026-08-27 and 2026-08-28 | Historical distilled direction and gate rework. | PRD §§1–10; linked from `design-input.md`; source files unchanged. |
| Issue snapshot, issue/backlog intake, live assignment reader | Member issues, disposition, acceptance ownership. | PRD §§4, 7, 10; `acceptance.md`; live assignment remains authoritative over old counts. |
| Architecture doctrine and external research | Agent-first properties, deterministic enforcement, knowledge estate. | PRD §§1–4, 7; Spec §7; `design.md`. |
| Design-authoring record | Historical authorship/commit record and PRD spec-hash invariant. | Preserved at `evidence/design-authoring-record.json`; not modified. |
| 2026-09-19 design-workflow input | One Advisor cycle, disposition, independent readiness, one final PO decision. | Spec §17; `design-input.md` and `design.md`. |
| 2026-09-27 greenfield remediation | Five implementation slices, ownership, preservation and candidate evidence. | PRD §§1, 7; Spec §16; canonical remediation source remains detailed authority. |
| 2026-09-28 activation/topology/uninstall input | Explicit opt-in, Agy topology observation, content-preserving exit. | PRD §12; Spec §18; remediation source. |
| Latest recovery user input | Keep repair available when in-session maintenance cannot safely proceed. | PRD §13; Spec §20; recovery design source. Exact supplied sentence is in `design-input.md`. |
| Toolbox handover narrative | P1 orphan/CAS report and R1–R5/B2 items. | Recovery design and Spec §20; not verified live output and does not establish receipt status, owner death, or descriptor schema. Source separately distinguishes V2 null=`unavailable` from V1 absent=`unobserved`. |
| 2026-10-03 findings round (PO observations, three runner analyses, live defects) | Source-verified register of 77 IDs; happy path on three runners; signed pushes; complete Alfred scope. | PRD §14; Spec §21; the register; the map below. |
| 2026-10-03 PO decisions on the revision of the sources | Revise the sources before approval; four Elephant defaults with PO overrule right; every signature-mode push signed; one final approval per design. | `design-input.md` (PO input, not approval); PRD §14; Spec §21.0. |

## Requirement and evidence map

| Requirement | PRD | Spec | Detailed source | Required completion evidence |
| --- | --- | --- | --- | --- |
| Enforcement placement/control integrity | §§1–4, 7 | §4 | A1–A5 contracts and member acceptance | Candidate-bound execution probes; typed limits remain visible. |
| Protected surfaces/design authority/lifecycle evidence | §4 Track A, §7 | §§4.3–4.5 | Applicable ADRs and A3/A4/A5 acceptance | Mutation fixtures, exact candidate, writer/observer conformance. |
| Typed governance/rigor/interruption/economics | §§3–5 | §§5–6 | B/C issue intake and acceptance | Deterministic derivation plus measured receipts. |
| Agent-first architecture/adoption | §§1–4, 7 | §7 | `design/agent-first-architecture.md` | Semantic decision review, deterministic fitness, PO-scoped adoption. |
| Integration/cross-runner qualification | §§4–5, 7 | §§3, 8–15 | E1–E4 contracts | Frozen contracts and per-runner evidence; fixtures are not native evidence. |
| Greenfield/activation/uninstall | §§1, 4, 7, 12 | §§16, 18 | 2026-09-27 remediation design | Slice acceptance, actual topology evidence, preserved-content readback. |
| Design workflow | §11 | §17 | 2026-09-19 input | Preserved input bytes, actual route receipt/disposition, fresh readiness, one final PO decision. |
| Recovery availability (implemented epic deliverable) | §§7.11, 13 | §20 (RV-1…RV-7) | 2026-10-03 recovery design | P1 source confirmation, signed archival, CAS/readback and preservation negatives, host evidence and PO disposition. Owned by the implementation wave for remaining Alfred work, sequenced after R4. |
| Three-runner happy path (findings round) | §§7.12, 14 | §21 | 2026-10-03 findings register | AC-32 on the host matrix; acceptance cases R1-1…R6-5; AC-26…AC-32. |

## 2026-10-03 findings-round map

Register IDs are those of
[`design/greenfield-0.7-findings-round-2026-10-03.md`](design/greenfield-0.7-findings-round-2026-10-03.md);
backlog items live under `backlog/items/`. This map is complete: one row per
register ID, each ID owned by exactly one workstream (Spec §21.1–§21.6) or
deferred (Spec §21.8), each row naming its own backlog item or `register only`.
The owner column repeats the ID lists of the Spec §21 workstream headers.

Register IDs: 77; mapped rows: 77

| Register ID | Owner | Spec § / cases | Acceptance | Backlog item |
| --- | --- | --- | --- | --- |
| K1-x | R1 | §21.1 R1-1 | AC-26 | `2026-10-03-lifecycle-coordination-commands-refused-as-implementation-writes.md` |
| K1-1 | R1 | §21.1 R1-1, R1-2 | AC-26 | `2026-10-03-lifecycle-coordination-commands-refused-as-implementation-writes.md` |
| K1-2 | R1 | §21.1 R1-1, R1-2 | AC-26 | `2026-10-03-lifecycle-coordination-commands-refused-as-implementation-writes.md` |
| K1-3 | R1 | §21.1 R1-1, R1-2 | AC-26 | `2026-10-03-lifecycle-coordination-commands-refused-as-implementation-writes.md` |
| K1-4 | R1 | §21.1 R1-6 | AC-26 | `2026-10-03-lifecycle-coordination-commands-refused-as-implementation-writes.md` |
| K1-5 | R1 | §21.1 R1-4 | AC-26 | `2026-10-03-lifecycle-coordination-commands-refused-as-implementation-writes.md` |
| K1-6 | R1 | §21.1 R1-7 | AC-26 | `2026-10-03-handover-doc-committed-without-governance-classification.md` |
| K1-7 | R1 | §21.1 R1-5 | AC-26 | `2026-10-03-git-stash-list-classified-as-working-tree-write.md` |
| K1-8 | R5 | §21.5 R5-6 | AC-30 | `2026-10-03-three-runner-happy-path-with-two-po-approvals.md` |
| K2-1 | R2 | §21.2 R2-1 | AC-27 | `2026-10-03-claude-windows-guard-refuses-every-in-repo-read.md` |
| K2-1b | R2 | §21.2 R2-1 | AC-27 | `2026-10-03-claude-windows-guard-refuses-every-in-repo-read.md` |
| K2-2 | R2 | §21.2 R2-2 | AC-27 | `2026-10-03-read-blocks-and-misleading-denial-texts-across-runners.md` |
| K2-3 | R2 | §21.2 R2-3 | AC-27 | `2026-10-03-read-blocks-and-misleading-denial-texts-across-runners.md` |
| K2-4 | R2 | §21.2 R2-4 | AC-27 | `2026-10-03-advertised-git-to-head-pipeline-is-refused.md` |
| K2-5 | R2 | §21.2 R2-5 | AC-27 | `2026-10-03-read-blocks-and-misleading-denial-texts-across-runners.md` |
| K2-6 | R2 | §21.2 R2-3 (reproduce first) | AC-27 | `2026-10-03-read-blocks-and-misleading-denial-texts-across-runners.md` |
| K2-6b | R2 | §21.2 R2-3 | AC-27 | `2026-10-03-read-blocks-and-misleading-denial-texts-across-runners.md` |
| K3-1 | R4 | §21.4 R4-7 | AC-29 | `2026-10-03-role-route-preflight-with-self-dispatch-fallback.md` |
| K3-2 | R4 | §21.4 R4-2 | AC-29 | `2026-10-03-role-route-preflight-with-self-dispatch-fallback.md` |
| K3-3 | R4 | §21.4 R4-3 | AC-29 | `2026-10-03-agy-driver-dispatch-and-design-routes-incomplete.md` |
| K3-4 | R4 | §21.4 R4-3 | AC-29 | `2026-10-03-agy-driver-dispatch-and-design-routes-incomplete.md` |
| K3-5 | R4 | §21.4 R4-5 | AC-29 | register only |
| K3-6 | R4 | §21.4 R4-2 | AC-29 | register only |
| K3-7 | R4 | §21.4 R4-1, R4-2 | AC-29 | `2026-10-03-role-route-preflight-with-self-dispatch-fallback.md` |
| K3-8 | R4 | §21.4 R4-4 | AC-29 | `2026-10-03-dispatch-guard-rejects-built-in-capitalized-agent-types.md` |
| K3-9 | R4 | §21.4 R4-4 | AC-29 | `2026-10-03-dispatch-budget-lock-refuses-every-subagent-call-on-windows.md` |
| K3-10 | R4 | §21.4 R4-8 | AC-29 | `2026-10-03-dispatch-budget-lock-refuses-every-subagent-call-on-windows.md` (platform sweep) |
| K3-11 | R4 | §21.4 R4-4 | AC-29 | `2026-10-03-role-route-preflight-with-self-dispatch-fallback.md` |
| K3-12 | R4 | §21.4 R4-4 | AC-29 | `2026-10-03-role-route-preflight-with-self-dispatch-fallback.md` |
| K3-13 | R4 | §21.4 R4-8 | AC-29 | `2026-10-03-dispatch-budget-lock-refuses-every-subagent-call-on-windows.md` (platform sweep) |
| K3-14 | R4 | §21.4 R4-7 | AC-29 | `2026-10-03-claude-windows-greenfield-lifecycle-not-walkable.md` |
| K3-15 | R4 | §21.4 R4-7 | AC-29 | `2026-10-03-claude-windows-greenfield-lifecycle-not-walkable.md` |
| K3-16 | R4 | §21.4 R4-8 | AC-29 | register only |
| K3-17 | R4 | §21.4 R4-9 | AC-29 | register only |
| K4-1 | R3 | §21.3 R3-3 (footer sub-aspect: §21.8 reproduction) | AC-28 | `2026-10-03-guard-override-request-digest-drifts-after-arming.md` |
| K4-2 | R3 | §21.3 R3-4 | AC-28 | `2026-10-03-signature-ceremony-requires-operator-work-and-breaks.md` |
| K4-3 | R3 | §21.3 R3-1, R3-5 (R1 admits the commands) | AC-28 | `2026-10-03-signature-ceremony-requires-operator-work-and-breaks.md` |
| K4-4 | R3 | §21.3 R3-5 | AC-28 | `2026-10-03-signature-ceremony-requires-operator-work-and-breaks.md` |
| K4-5 | R3 | §21.3 R3-6 | AC-28 | `2026-10-03-signature-ceremony-requires-operator-work-and-breaks.md` |
| K4-6 | R3 | §21.3 R3-1 | AC-28 | `2026-10-03-three-runner-happy-path-with-two-po-approvals.md` |
| K4-6b | R3 | §21.3 R3-1 | AC-28 | `2026-10-03-three-runner-happy-path-with-two-po-approvals.md` |
| K4-7 | R5 | §21.5 R5-6 | AC-30 | `2026-10-03-three-runner-happy-path-with-two-po-approvals.md` |
| K4-8 | deferred §21.8 | §21.8 reproduction | — | register only |
| K4-9 | R3 | §21.3 R3-3 | AC-28 | `2026-10-03-guard-override-request-digest-drifts-after-arming.md` |
| K5-1 | R5 | §21.5 R5-1 | AC-30 | `2026-09-29-greenfield-design-course-cost-and-proportionality.md` |
| K5-2 | R5 | §21.5 R5-1 | AC-30 | `2026-09-29-greenfield-design-course-cost-and-proportionality.md` |
| K5-3 | R5 | §21.5 R5-5 | AC-30 | `2026-09-29-greenfield-design-course-cost-and-proportionality.md` |
| K5-4 | R5 | §21.5 R5-2 | AC-30 | `2026-09-27-installed-design-trailer-example-is-rejected-by-git-guard.md` |
| K5-5 | R5 | §21.5 R5-3 | AC-30 | `2026-10-03-claude-windows-greenfield-lifecycle-not-walkable.md` |
| K5-6 | R5 | §21.5 R5-3 | AC-30 | `2026-10-03-claude-windows-greenfield-lifecycle-not-walkable.md` |
| K5-7 | R5 | §21.5 R5-6 | AC-30 | register only |
| K5-8 | R1 | §21.1 R1-1 | AC-26 | register only |
| K5-9 | R5 | §21.5 R5-8 | AC-30 | register only |
| K5-10 | R5 | §21.5 R5-8 | AC-30 | register only |
| K5-11 | R5 | §21.5 R5-8 | AC-30 | register only |
| K5-12 | R4 | §21.4 R4-7, R4-10 | AC-29 | register only |
| K6-1 | R3 | §21.3 R3-2 | AC-28 | `2026-10-03-feature-branch-push-admitted-without-signature-approval.md` |
| K6-2 | R3 | §21.3 R3-2 | AC-28 | `2026-10-03-feature-branch-push-admitted-without-signature-approval.md` |
| K6-3 | R3 | §21.3 R3-7 | AC-28 | `2026-10-03-feature-branch-push-admitted-without-signature-approval.md` |
| K7-1 | R1 | §21.1 R1-3 | AC-26 | `2026-10-03-draft-phase-guard-blocks-mandatory-bootstrap-preflight.md` |
| K7-2 | R1 | §21.1 R1-8 | AC-26 | `2026-10-03-draft-phase-guard-blocks-mandatory-bootstrap-preflight.md` |
| K7-3 | R1 | §21.1 R1-9 | AC-26 | `2026-10-03-session-readiness-drops-to-partial-after-bootstrap-ready.md` |
| K7-4 | R4 | §21.4 R4-3 | AC-29 | `2026-10-03-agy-driver-dispatch-and-design-routes-incomplete.md` |
| K7-5 | R4 | §21.4 R4-6 | AC-29 | `2026-10-03-claude-session-start-emits-codex-transcript-recovery-hint.md` |
| K7-6 | R6 | §21.6 R6-3 | AC-31 | `2026-10-03-handover-doc-committed-without-governance-classification.md` |
| K7-7 | deferred §21.8 | §21.8 reproduction | — | register only |
| K7-8 | deferred §21.8 | §21.8 reproduction | — | register only |
| K8-1 | R6 | §21.6 R6-1 | AC-31 | `2026-10-03-forensics-and-audit-evidence-not-reconstructable.md` |
| K8-2 | R6 | §21.6 R6-2 | AC-31 | `2026-10-03-forensics-and-audit-evidence-not-reconstructable.md` |
| K8-3 | R5 | §21.5 R5-4 | AC-30 | `2026-10-03-forensics-and-audit-evidence-not-reconstructable.md` |
| K8-4 | R6 | §21.6 R6-4 | AC-31 | `2026-10-03-forensics-and-audit-evidence-not-reconstructable.md` |
| K8-5 | R6 | §21.6 R6-5 | AC-31 | `2026-10-03-forensics-and-audit-evidence-not-reconstructable.md` |
| K9-1 | R5 | §21.5 R5-7 | AC-30 | register only |
| K9-2 | R1 | §21.1 R1-6 | AC-26 | register only |
| K9-3 | R5 | §21.5 R5-7 | AC-30 | register only |
| K9-4 | R5 | §21.5 R5-7 | AC-30 | register only |
| K9-5 | R6 | §21.6 R6-1 | AC-31 | register only |

Requirement-level rows (not register IDs, not counted above):

| Requirement | Spec § / cases | Acceptance | Backlog item |
| --- | --- | --- | --- |
| Governing requirement (happy path, two per-feature PO decisions) | §21.0, §21.7 | AC-32 | `2026-10-03-three-runner-happy-path-with-two-po-approvals.md` |

Owner counts (equal to the Spec §21 headers): R1 13, R2 8, R3 11, R4 20, R5 16,
R6 6, deferred 3; total 77.

## Evidence and authority limits

The historical authoring record is not extended by this draft and may omit
later source changes. This input index is not raw original-input evidence.
The sanitized handover is narrative only. No model consultation, independent
readiness, Critic review, PO decision, implementation authority, host
attestation, installation or lifecycle transition is claimed. Current
candidate identity, exact source hashes, existing acceptance and sanctioned
State remain the control points for those future acts.
