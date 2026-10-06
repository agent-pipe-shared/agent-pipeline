# Sprint Alfred Epic — source-to-requirement traceability

Status: proposed map for the current five-source design package. It does not
replace item-level acceptance or create review/approval evidence.

## Canonical five-source package

| Source | Purpose | Binding rule |
| --- | --- | --- |
| [`design-input.md`](design-input.md) | Current source index and provenance limits. | Historical input files remain unchanged; it is not a replacement for raw input bytes. |
| [`prd_sprint-alfred-epic.md`](prd_sprint-alfred-epic.md) | Outcomes, full five-track/nineteen-WP scope, gates and success criteria. | `technical-spec-sha256` must equal exact current `spec.md` SHA-256. |
| [`spec.md`](spec.md) | Technical contracts, verification and acceptance. | §8.2 contains E4 (native Goldfish host-commit); §20 contains the recovery deliverable (RV-1…RV-11); §21 contains the findings round. Changing Spec requires same-candidate PRD marker refresh. |
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
| Recovery availability (implemented epic deliverable) | §§7.11, 13 | §20 (RV-1…RV-11) | 2026-10-03 recovery design | P1 source confirmation, signed archival, CAS/readback and preservation negatives (RV-1…RV-7); attended external route anchor, bounded-path, journal/crash and typed-unavailable cases (RV-8…RV-11); host evidence and PO disposition. Owned by the implementation wave for remaining Alfred work, sequenced after R4. |
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

## PO decisions → owner and case

Every PO decision recorded in `design-input.md` (2026-10-03 and 2026-10-04,
numbering as there) has one owner and at least one acceptance case. A decision
whose behaviour lives in a workstream is owned by that workstream (Spec §21);
the others name their Spec section. This section adds no register ID and does
not change the 77-row map above. Acceptance IDs are those of `acceptance.md`
(AC-35 and AC-36 extend AC-29 and AC-28 with the revision-4 cases).

2026-10-03 decisions:

| Decision | Owner | Spec § / cases | Acceptance |
| --- | --- | --- | --- |
| 2026-10-03 #1: no post-approval binding document; every register row in scope and mapped | Design package (this file) | Spec §21 intro, §21.0 scope rule; reconciliation: register count = mapped rows = Spec §21 header counts (77) | AC-26…AC-32 (via the map above) |
| 2026-10-03 #2: a fallback self-dispatch never satisfies readiness, Critic or plan-verifier | R4 | §21.4 role-route preflight; R4-1, R4-2 | AC-29 |
| 2026-10-03 #3: `scratch/` script execution stays fail-closed | R1 | §21.1 scratch bullet; R1-4 | AC-26 |
| 2026-10-03 #4: every signature-mode push is signed; two decisions per feature plus one per additional push | R3 | §21.0 counting rule; §21.3 push signing; R3-1, R3-2, R3-7 | AC-28, AC-32 |
| 2026-10-03 route (R1 shared catalogue, R5 simplified coordinator) | R1, R5 | §21.0 route decision; R1-1; R5-1, R5-6 | AC-26, AC-30 |
| 2026-10-03 hotfixes 1–7 replaced by source fixes | R4, R5 (wave 0 port in §21.7) | §21.4 hotfix removal; §21.7 wave 0; R4-8, R5-8 | AC-29, AC-30 |

2026-10-04 decisions:

| Decision | Owner | Spec § / cases | Acceptance |
| --- | --- | --- | --- |
| #1 recovery route delivered completely in 0.7.0, including the signed legacy-custody transaction and the attended external route | Recovery (implementation wave, after R4) | §20.1–§20.3; RV-1…RV-11 | AC-33 |
| #2 model-family approval, all-or-nothing across runners; older selectable release; later downgrade refused | R4 | §21.4 Model-family approval; R4-11 | AC-35 (extends AC-29) |
| #3 Antigravity readiness, Critic and Advisor routes enabled without prior host measurement; typed failures | R4 | §21.4 Antigravity bullet; R4-3, R4-12; the PO host run (§21.7) | AC-29, AC-32 |
| #4 unmarked Codex Goldfish dispatch refused unless `Host commit: not-requested (reason: …)` | R4 | §21.4 Codex bullet; R4-5 | AC-29 |
| #5 signing window starts at hand-over, 60 minutes default, 5–120 | R3 | §21.3 ceremony mechanics; R3-8 | AC-36 (extends AC-28) |
| #6 direct Elephant design commits use `Dispatch: stage-0 (elephant)` only | R5 | §21.5 trailer grammar; R5-2 | AC-30 |
| #7 re-enrollment with retained history is one one-time act | R3 | §21.0 counting rule; R3-1 scenario D | AC-36 (extends AC-28) |
| #8 Antigravity lock freshness: session-bound, labelled 30-minute compatibility fallback | R4 | §21.4 Antigravity bullet; R4-3 | AC-29 |
| #9 uninstall with a foreign Git hook keeps refusing, with a clear code and instructions | Activation/uninstall slice (Spec §18) | §18 foreign-hook paragraph; U-1 (`PU-FOREIGN-HOOK-CONFLICT`) | AC-34 |
| #10 chat-mode confirmations in the session, commit-bound, labelled | R3 | §21.3 ceremony mechanics; R3-9 | AC-36 (extends AC-28) |
| #11 `standing-approved` projects keep checkpoint pushes without a per-push approval | R3 | §21.3 ceremony mechanics; R3-7, R3-10 | AC-36 (extends AC-28) |
| #12 all runners, all platforms, consuming repositories too | R1–R6 (each workstream's consumer-layout fixtures) | §21.0 consumer and platform universality; each workstream's cases; R4-8 | AC-26…AC-31; AC-32 host matrix |
| #13 explicit new Advisor course (child of the previous terminal course) | Design workflow (Spec §17) | §17 new-course decision and prior-course linkage, validator and entrypoint negatives; R4-1 for the exception facts | AC-26…AC-32 package-level; Spec §17 evidence tests |
| #14 Critic and plan-verifier on Claude and Antigravity as hook-observed native subagents; measured, else `unavailable` | R4 | §21.4 mechanism per role; R4-2, R4-12 | AC-35 (extends AC-29) |
| #15 "always a repair route" = no dead end, typed result naming the attended prerequisite | Recovery | §20.1 closing paragraph; RV-11 | AC-33 |
| #16 agent-only design course: no PO terminal command, file placement or intermediate signature; one final approval | R1, R3, R5 | §21.0 agent-only design course; R5-6, R3-1 | AC-30, AC-32 |

2026-10-06 decisions (device switch; `design-input.md` decisions 17–19, Spec
§22; this subsection extends the section's scope to the 2026-10-06 decisions,
and AC-37 is additional to AC-32):

| Decision | Owner | Spec § / cases | Acceptance |
|---|---|---|---|
| #17 product goal: agent flows through bootstrap, install, recovery, device switch and lifecycle repair without hurdles; every block has an agent-executable fix; the human only for a real signature | R7 (governing requirement; makes 2026-10-04 #15 and #16 concrete) | §22.0 governing requirement, typed repair rule and signature rule; R7-9a, R7-9b | AC-37 (AC-32 unchanged) |
| #18 device-switch findings T1–T17 fixed in 0.7.0, none deferred | R7 for 12 rows; R1, R3, R4, R5 for the 5 mapped rows | §22.0 row ownership; R7-1…R7-8; mapped-row replay in R7-9 | AC-37; mapped rows also AC-26, AC-28, AC-29, AC-30 |
| #19 environment prerequisites checked at install and bootstrap, with a concrete repair action, never first discovered at a signature | R7 | §22.0 prerequisites; R7-7 (report), R7-6 (signing prerequisites) | AC-37 |

Mapped decisions: 2026-10-06 #17–#19 (3 of 3); 2026-10-04 #1–#16 (16 of 16);
2026-10-03 decisions #1–#4 and the route and hotfix decisions (6 rows).

## 2026-10-06 device-switch map (T1–T17)

Rows T1–T17 are the toil rows recorded during the device switch (the working
log was an ignored scratch note, so the finding is repeated here and in Spec
§22.0). This map is complete: one row per T-row, each owned by exactly one R7
contract (Spec §22.1–§22.8) or mapped to the existing owner whose approved
scope already covers it. T-rows are not findings-register IDs and do not change
the 77-row map above or its counts.

T-rows: 17; mapped rows: 17

| Row | Finding | Owner | Spec § / cases | Acceptance | Source |
|---|---|---|---|---|---|
| T1 | Git for Windows 2.56.0.windows.1 rejects `NUL`; discovery cause swallowed behind `GS-GIT-UNAVAILABLE` | R7-1 | §22.1 R7-1a, R7-1b | AC-37 | `2026-10-06-git-for-windows-2-56-rejects-git-config-global-nul.md`; `2026-10-06-preflight-hides-the-git-error-behind-gs-git-unavailable.md` |
| T2 | Pre-ready lockdown refuses every diagnostic | R7-1 | §22.1 R7-1c | AC-37 | `2026-10-06-preflight-hides-the-git-error-behind-gs-git-unavailable.md` |
| T3 | Orphan session descriptors of a blocked session need a PO decision | R7-2 | §22.2 R7-2a, R7-2b, R7-2c | AC-37 | toil row only |
| T4 | Pre-push hook absent on the second device, PO confirmation | R3 (K6-2); report in R7-7 | §21.3 R3-2; §22.7 R7-7e; replay §22.9 | AC-28, AC-37 | toil row only |
| T5 | Approval-bound package in the ignored root `evidence/` | R7-3 | §22.3 R7-3a, R7-3b, R7-3d | AC-37 | `2026-10-06-approval-bound-design-package-lives-in-an-ignored-directory.md` |
| T6 | Backlog writes refused while the package is unverifiable | R7-4 | §22.4 R7-4a | AC-37 | `2026-10-06-approval-bound-design-package-lives-in-an-ignored-directory.md` |
| T7 | Only `reopen-design` offered as recovery on a new device | R7-5 (`verified` route); lost-artifact sub-case: PO decision required, see below | §22.5 R7-5a, R7-5b, R7-5c | AC-37 | `2026-10-06-approval-bound-design-package-lives-in-an-ignored-directory.md` |
| T8 | Clearing the registered authoring dispatch needs `continuity-cas` and a signed override | R5 | §21.5 coordinator records authoring itself; R5-6; replay §22.9 | AC-30, AC-37 | toil row only |
| T9 | Re-registering an authoring dispatch needs a signed override | R5 | §21.5 coordinator; R5-6 (R1 catalogue admits the verb); replay §22.9 | AC-30, AC-37 | toil row only |
| T10 | Course outputs under `evidence/` not writable in design phase | R1 | §21.1 K5-8; R1-1; replay §22.9 | AC-26, AC-37 | toil row only |
| T11 | `project/pipeline-state.json` commit refused in design phase | R7-4 | §22.4 R7-4b | AC-37 | toil row only |
| T12 | Handover did not list device-bound artifacts | R7-3 | §22.3 R7-3c | AC-37 | `2026-10-06-approval-bound-design-package-lives-in-an-ignored-directory.md` |
| T13 | No wired Claude Advisor route; one-time exception rationale every course | R4 | §21.4 Advisor exception and role-route preflight (K3-2); R4-1, R4-2; replay §22.9 | AC-29, AC-37 | toil row only |
| T14 | Key directory per repository in non-travelling private state | R7-6 | §22.6 R7-6a | AC-37 | toil row only |
| T15 | `openssl` taken from the terminal PATH only | R7-6 | §22.6 R7-6b, R7-6c | AC-37 | toil row only |
| T16 | Bootstrap checks none of the preconditions that later block | R7-7 | §22.7 R7-7a…R7-7e | AC-37 | toil row only |
| T17 | PowerShell lane `continuity-cas` denial has no override route | R7-8 | §22.8 R7-8a, R7-8b, R7-8c | AC-37 | toil row only |

Owner counts (equal to the Spec §22.0 statement): R7-1 2, R7-2 1, R7-3 2,
R7-4 2, R7-5 1, R7-6 2, R7-7 1, R7-8 1 (12 owned by R7); mapped: R1 1 (T10),
R3 1 (T4), R4 1 (T13), R5 2 (T8, T9); total 17. R7-9 owns no row.

**Open PO question (T7 sub-case, not decided here).** PRD and Spec unchanged,
but a bound artifact (package, course or readiness evidence) exists only on an
unreachable device: may a re-approval reuse the earlier course and readiness
evidence bound to the unchanged PRD/Spec digests, or must the evidence be
regenerated (a repeated course)? Spec §22.5 fails closed meanwhile and reuses
nothing.

## Evidence and authority limits

The historical authoring record is not extended by this draft and may omit
later source changes. This input index is not raw original-input evidence.
The sanitized handover is narrative only. No model consultation, independent
readiness, Critic review, PO decision, implementation authority, host
attestation, installation or lifecycle transition is claimed. Current
candidate identity, exact source hashes, existing acceptance and sanctioned
State remain the control points for those future acts.
