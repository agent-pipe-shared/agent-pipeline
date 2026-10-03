# Sprint Alfred Epic — source-to-requirement traceability

Status: proposed map for the current five-source design package. It does not
replace item-level acceptance or create review/approval evidence.

## Canonical five-source package

| Source | Purpose | Binding rule |
| --- | --- | --- |
| [`design-input.md`](design-input.md) | Current source index and provenance limits. | Historical input files remain unchanged; it is not a replacement for raw input bytes. |
| [`prd_sprint-alfred-epic.md`](prd_sprint-alfred-epic.md) | Outcomes, full five-track/eighteen-WP scope, gates and success criteria. | `technical-spec-sha256` must equal exact current `spec.md` SHA-256. |
| [`spec.md`](spec.md) | Technical contracts, verification and acceptance. | §20 contains proposed recovery amendment; changing Spec requires same-candidate PRD marker refresh. |
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
| Recovery availability | §13 | §20 | 2026-10-03 recovery design | P1 source confirmation, signed archival, CAS/readback and preservation negatives, host evidence and PO disposition. |
| Three-runner happy path (findings round) | §§7.12, 14 | §21 | 2026-10-03 findings register | Per-runner end-to-end scenario on the stamped candidate; acceptance cases R1-1…R6-4; AC-26…AC-31. |

## 2026-10-03 findings-round map

Register IDs are those of
[`design/greenfield-0.7-findings-round-2026-10-03.md`](design/greenfield-0.7-findings-round-2026-10-03.md);
backlog items live under `backlog/items/`.

| Register ID | Spec § / cases | Acceptance | Backlog item |
| --- | --- | --- | --- |
| K1-x, K1-1, K1-2, K1-3 | §21.1 R1-1, R1-2 | AC-26 | `2026-10-03-lifecycle-coordination-commands-refused-as-implementation-writes.md` |
| K1-4 | §21.1 R1-6 | AC-26 | same |
| K1-5 | §21.1 R1-4 | AC-26 | same |
| K1-6 | §21.1 R1-1 | AC-26 | same; `2026-10-03-handover-doc-committed-without-governance-classification.md` |
| K1-7 | §21.1 R1-5 | AC-26 | `2026-10-03-git-stash-list-classified-as-working-tree-write.md` |
| K7-1, K7-2 | §21.1 R1-3 | AC-26 | `2026-10-03-draft-phase-guard-blocks-mandatory-bootstrap-preflight.md` |
| K7-3 | §21.1 R1-1 | AC-26 | `2026-10-03-session-readiness-drops-to-partial-after-bootstrap-ready.md` |
| K2-1, K2-1b | §21.2 R2-1 | AC-27 | `2026-10-03-claude-windows-guard-refuses-every-in-repo-read.md` |
| K2-2, K2-3, K2-5 | §21.2 R2-2, R2-3, R2-5 | AC-27 | `2026-10-03-read-blocks-and-misleading-denial-texts-across-runners.md` |
| K2-4 | §21.2 R2-4 | AC-27 | `2026-10-03-advertised-git-to-head-pipeline-is-refused.md` |
| K4-1 | §21.3 R3-3 | AC-28 | `2026-10-03-guard-override-request-digest-drifts-after-arming.md` |
| K4-2, K4-3, K4-4, K4-5 | §21.3 R3-4, R3-5 | AC-28 | `2026-10-03-signature-ceremony-requires-operator-work-and-breaks.md` |
| K4-6, K4-6b | §21.3 R3-1 | AC-28 | `2026-10-03-three-runner-happy-path-with-two-po-approvals.md` |
| K6-1, K6-2, K6-3 | §21.3 R3-2 | AC-28 | `2026-10-03-feature-branch-push-admitted-without-signature-approval.md` |
| K3-1, K3-2, K3-7 | §21.4 R4-1, R4-2 | AC-29 | `2026-10-03-role-route-preflight-with-self-dispatch-fallback.md` |
| K3-3, K3-4, K7-4 | §21.4 R4-3 | AC-29 | `2026-10-03-agy-driver-dispatch-and-design-routes-incomplete.md` |
| K3-5 | §21.4 R4-5 | AC-29 | `2026-10-03-claude-windows-greenfield-lifecycle-not-walkable.md` (cross-runner host-commit note) |
| K3-6 | §21.4 R4-5 | AC-29 | `2026-10-03-claude-windows-greenfield-lifecycle-not-walkable.md` |
| K3-8 | §21.4 R4-4 | AC-29 | `2026-10-03-dispatch-guard-rejects-built-in-capitalized-agent-types.md` |
| K3-9 | §21.4 R4-4 | AC-29 | `2026-10-03-dispatch-budget-lock-refuses-every-subagent-call-on-windows.md` |
| K7-5 | §21.4 R4-6 | AC-29 | `2026-10-03-claude-session-start-emits-codex-transcript-recovery-hint.md` |
| K5-1, K5-2, K5-3 | §21.5 R5-1 | AC-30 | `2026-09-29-greenfield-design-course-cost-and-proportionality.md` |
| K5-4 | §21.5 R5-2 | AC-30 | `2026-09-27-installed-design-trailer-example-is-rejected-by-git-guard.md` |
| K5-5, K5-6 | §21.5 R5-3 | AC-30 | `2026-10-03-claude-windows-greenfield-lifecycle-not-walkable.md` |
| K8-3 | §21.5 R5-4 | AC-30 | `2026-10-03-forensics-and-audit-evidence-not-reconstructable.md` |
| K8-1, K8-2, K8-4 | §21.6 R6-1, R6-2, R6-4 | AC-31 | same |
| K7-6 | §21.6 R6-3 | AC-31 | `2026-10-03-handover-doc-committed-without-governance-classification.md` |
| K7-7 | §21.6 | AC-31 | `2026-10-03-claude-windows-greenfield-lifecycle-not-walkable.md` |
| K7-8 | reproduction step only | — | `2026-10-03-claude-windows-greenfield-lifecycle-not-walkable.md` |

## Evidence and authority limits

The historical authoring record is not extended by this draft and may omit
later source changes. This input index is not raw original-input evidence.
The sanitized handover is narrative only. No model consultation, independent
readiness, Critic review, PO decision, implementation authority, host
attestation, installation or lifecycle transition is claimed. Current
candidate identity, exact source hashes, existing acceptance and sanctioned
State remain the control points for those future acts.
