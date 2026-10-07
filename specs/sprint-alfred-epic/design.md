# Sprint Alfred Epic — integrated design

Status: proposed canonical design source for the current package. It is not a
PO approval, readiness receipt, plan submission, or grant of implementation
authority.

## Governing sources and design base

ADR-0043 amendment / GitHub #108 govern scope. The normative architecture
basis is [`design/agent-first-architecture.md`](design/agent-first-architecture.md).
The PRD and Technical Specification remain the complete product and technical
contracts. Five current package sources are [`design-input.md`](design-input.md),
[`prd_sprint-alfred-epic.md`](prd_sprint-alfred-epic.md), [`spec.md`](spec.md),
this file, and [`traceability.md`](traceability.md). The historical
[`evidence/design-authoring-record.json`](evidence/design-authoring-record.json)
is preserved unchanged.

## Integrated outcome and existing scope

Deliver one candidate across the established five tracks and nineteen work
packages (A1–A5, B1–B3, C1–C3, D1–D4, E1–E4). Track A measures enforcement and
protects controls, design authority and lifecycle evidence. Track B derives
rigor and routes legitimate work. Track C measures interruptions,
dispatch/Verify economics and cadence. Track D makes agent-first architecture
decisions, standards, fitness and adoption usable. Track E freezes shared
contracts, adds the provider-free AGY dispatch spike (E3) and native-runner
Goldfish host-commit (E4, Spec §8.2), and qualifies the exact candidate.
Detailed contracts, schemas and acceptance remain in PRD §§2–7, Spec §§3–15
and `acceptance.md`.

| Track | Integrated responsibility | Detail |
| --- | --- | --- |
| A — enforcement/control integrity | Measure per-runner execution; place controls in the acting process; protect surfaces, approved design and closed evidence. | PRD §4; Spec §4; A1–A5 acceptances. |
| B — process governance | Derive rigor mechanically, route typed guard denials, and move prose rules into checked homes. | PRD §4; Spec §5; B1–B3 acceptances. |
| C — measurable rigor | Separate interruption from planned gates; measure economics and cadence before policy promotion. | PRD §4; Spec §6; C1–C3 acceptances. |
| D — agent-first architecture | Preserve decisions, define the standard, evaluate fitness deterministically, guide PO-scoped adoption. | PRD §4; Spec §7; normative doctrine. |
| E — integration | Freeze shared contracts and integrate qualification; preserve boundaries between provider-free fixtures and native host evidence. | PRD §4; Spec §§3, 8–15. |

The 2026-09-27 greenfield remediation's five slices and the 2026-09-28
activation, Agy topology and content-preserving uninstall work remain in
scope. Keep their ownership, sequence and acceptance in
[`design/greenfield-0.7-remediation-2026-09-27.md`](design/greenfield-0.7-remediation-2026-09-27.md)
and Spec §§16–19. Existing design workflow requirements remain: preserve the
initial source, one Advisor cycle, Elephant disposition, independent
readiness, and one final PO package decision. Host export denial is not
bypassed; source tests do not prove installed plugin identity.

## Recovery-availability amendment

The latest user requirement and sanitized Toolbox handover are indexed in
`design-input.md` and specified in Spec §20 and
[`design/recovery-availability-2026-10-03.md`](design/recovery-availability-2026-10-03.md).
This is additive design, not a claim that the handover was verified live or
that recovery source is implemented. Recovery is an implemented epic
deliverable (Spec §20.3, RV-1…RV-11), owned by the implementation wave for the
remaining Alfred work and sequenced after R4.

Use three levels: evidence-preserving repair for a closed known shape;
existing GMW/HGO within current authority while verifier and proof remain
valid; and an attended external source/install route, an implemented 0.7.0
deliverable (PO decision 2026-10-04 #1), when bootstrap, lifecycle or verifier
failure prevents safe in-session work. The external route is a pinned
standalone Node CLI using built-ins only, trusted by an attended operator
outside the broken runner through an operator-selected artifact and public
signer anchor. It uses detached human Ed25519 authorization, exact bounded
Pipeline code/test paths, owner-private preimages, repository/plugin identity,
lock/CAS, a journaled per-file atomic prefix, exact post-image readback and
forward-only crash recovery. State, runtime-private evidence, proofs, trust
anchors and unrelated configuration remain with sanctioned writers. Its full
contract is Spec §20.1 and its acceptance RV-8…RV-11. "There must always be a
repair route" means no dead end: where safe repair is impossible (unknown
owner, missing proof/key/trust, ambiguous bytes) the Pipeline returns a typed
result naming the concrete attended prerequisite, after which the route applies
(PO decision #15).

Live or ambiguous owners are not reclaimed by age. Source distinguishes V2
`ownerRuntime: null` (`unavailable`) from V1 field-absent (`unobserved`);
neither means dead, and the reported descriptor schema remains unknown
without raw readback. Signed custody preserves valid matching bytes and
metadata; existing replay requires its complete actual preconditions,
otherwise new explicit signed authority is required. Conflicting/stale and
bounded readable invalid/malformed bytes may be archived by exact digest;
absence is bound without fabrication; unreadable/symlinked/ambiguous targets
return unavailable. Archived receipts grant no authority. The handover has
shortened digests and no complete argv/raw JSON, so no receipt classification,
owner death, fix or test result is inferred. P1 source confirmation precedes
minor items; R2/R3 specifics remain unconfirmed. Full boundaries and tests
are in the linked recovery design and Spec §20.

## 2026-10-03 findings-round amendment

The three-runner greenfield runs and this repository's own bootstrap showed
that the design course is not walkable on the current candidate. All three
runners stopped in draft. The source-verified register
([`design/greenfield-0.7-findings-round-2026-10-03.md`](design/greenfield-0.7-findings-round-2026-10-03.md))
holds 77 findings (IDs K1-x … K9-5) in five root causes plus the
push-signature requirement. PRD §14 and Spec §21 turn them into six
workstreams. Every register ID is owned by exactly one of them or deferred
with a reproduction step; `traceability.md` carries the complete map and its
count:

- R1: one shared admission catalogue for every emitted lifecycle command;
  `scratch/` script execution stays fail-closed with a truthful denial
- R2: a per-target read policy that tolerates auxiliary-root failures, with one
  shared credential-root list for host and distro paths
- R3: a per-feature two-decision ceremony model; every additional push costs
  one more signed (or chat-confirmed), commit-bound approval; enrollment and
  key setup are one-time acts
- R4: role-route preflight (a fallback self-dispatch may substitute only the
  labelled, non-authorizing Advisor duty; readiness is a host-observed CLI
  child, while the Critic and plan-verifier on Claude and Antigravity are
  hook-observed native subagents whose hook coverage R4 measures, and the role
  is unavailable until it is), all-or-nothing model-family approval (PO
  decision 2026-10-04 #2, Spec §21.4, R4-11), Antigravity route defaults, a
  cross-platform budget lock, the trusted runner-CLI location on Windows, and
  the readiness child contract
- R5: a simplified design-course coordinator, one revision cycle on every
  runner, and one trailer contract
- R6: a multi-runner transcript reader, an audit index and a host-path check

**Revision cycle.** The first drafts of PRD §14 and Spec §21 went through one
design revision cycle on 2026-10-03. Its corrections are applied in the five
sources themselves: complete register ownership, the counting rule for PO
decisions, the Advisor-only fallback, fail-closed `scratch/` execution, the
end-to-end scenario with its host matrix, and recovery ownership. A second
revision on 2026-10-04 answers the second independent readiness review the
same way: an owner and cases for the model-family decision, the external
recovery route's full contract and acceptance, the Critic/plan-verifier
mechanism, acceptance for the remaining PO decisions, the work-package count
(nineteen, with an E4 section in Spec §8.2) and the sequencing. No separate
document carries them and no separate document carries binding force beyond
the approved sources. This paragraph is provenance only, not Advisor or
readiness evidence.

**Sequencing.**

0. Wave 0: the E1 contract freeze and the verbatim port of the operator
   hotfixes into the source tree.
1. R1 and R2 come next: they block every runner's design course. The A1/C1
   measurement work interleaves after R1, because it needs R1's admission
   catalogue.
2. The R4 Windows platform fixes and the route preflight follow, because
   Goldfish dispatch on Windows depends on them.
3. R3, R5 and R6 then run as parallel slices through one hook-and-commit-policy
   integration slice.
4. Recovery (Spec §20) follows R4, because its owner observation needs the
   platform sweep.

This interleaves with the existing waves rather than replacing them. The
amendment's acceptance is AC-32: the three-runner end-to-end scenario on the
host matrix of Spec §21.7, on the stamped candidate.

## 2026-10-06/07 device-switch amendment

Bringing the approved candidate up on a second device surfaced twenty hurdles
(T1–T17 on 2026-10-06, T18–T20 on 2026-10-07) that no agent could clear alone.
Spec §22 adds the workstream R7, agent-recoverable operation and device
portability: fifteen rows are owned by ten contracts (R7-1…R7-8, R7-10,
R7-11) that give each block a typed agent-executable repair (null-device
handling with a diagnosable preflight, orphan archival, tracked bound
artifacts, writes in every state, approval rebind, a read-only signing-readiness
probe, one readiness report, shell-lane parity, supersede of a stale authoring
registration, parallel dispatch on the budget lock), and five rows (T4, T9,
T10, T13, T18) are mapped to the R1, R3, R4 and R5 contracts that already cover
them. R7-9 replays the mapped rows. PO decisions 17–28 (`design-input.md`)
bind the amendment; Spec §22.12 sequences it. `traceability.md` carries the
20-row map; AC-37 is additional to AC-32.

## Sequence, evidence and gates

Retain PRD §5 and Spec §§16–19 sequencing: control foundation first; A1/A5,
B and E dependencies before claims that consume them; architecture baseline
and fitness promotion only after measured evidence; integrated candidate
qualification last. Recovery P1 is an input/dependency, not a shortcut
around this sequence or a new PO decision. Implementation remains gated by
the currently sanctioned State transition and exact approved package.

Keep evidence classes distinct: source fixtures, sanitized reports, native
runner observations and installed-plugin readback cannot substitute for one
another. Handover narrative is not a raw receipt. Historical PRD/Spec
bindings, review records, ledgers and Git history are not rewritten to make
the current package appear approved. When Spec changes, recompute the PRD
`technical-spec-sha256` against exact current bytes as required by the
historical authoring record.

## Completion boundary

Completion remains PRD §7, Spec §§12–21 and the existing
[`acceptance.md`](acceptance.md); item-level backlog acceptance remains
authoritative. Current five-source hashes, actual route/advisor evidence,
independent readiness, Critic, final PO package decision, Verify, and
host/install evidence must be produced through their established workflows.
These design documents create none of them and claim no lifecycle authority.
