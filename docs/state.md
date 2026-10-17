# Project state — Agent-Pipeline

> Current public repository state. Durable decisions remain in the ADR register.
> Previous state text is preserved as a public projection in the archive below.

**Current task (2026-10-17): close the 0.7.0 local candidate, no new fixes.**
Read these two files first, in this order, before any other work:

1. [Current item status](../specs/sprint-alfred-epic/evidence/delivery-status-current.md):
   the only work list. Per item it gives the stage and what is still open, each entry with
   an owner (agent, critic, verify-wsl, native-host, po-decision, po-signature, po-acceptance).
   Do not re-derive status from older matrices, ledgers or chat.
2. [The cut decision](../specs/sprint-alfred-epic/plans/po-decisions-2026-10-12.md), section
   "Cut for the 0.7.0 candidate": only closing steps remain, in this order: one WSL Full
   Verify, one Critic batch, PO acceptance lists in blocks. New implementation only for what
   those steps show as genuinely red. Touch an item only for an `agent` entry released for work.

After each closing step, rerun `specs/sprint-alfred-epic/tools/delivery-remeasure.mjs` and
commit the new snapshot; it replaces `delivery-status-current` and keeps history in dated
directories. The sections below are background from 2026-10-12.

**Earlier task: portable Alfred WIP checkpoint, 2026-10-12.**
Start at [the Claude handover](../specs/sprint-alfred-epic/plans/HANDOVER-2026-10-12.md).
The PO requests all important work and public evidence committed for another PC.
The checkpoint was pushed: `origin/feat/sprint-alfred` = `6447fcc1a` (observed
2026-10-12 by the Claude continuation after `git fetch`).
This is a transfer checkpoint, not release, installation readiness or acceptance.
Claude continuation ledger (batches, collected patches, PO topics):
[claude-session-2026-10-12](../specs/sprint-alfred-epic/plans/claude-session-2026-10-12.md).

## Scope and measurable progress

The delivery scope remains 174 original backlog items, 37 ACs and four incident
criteria. Nightwing, Batman and explicitly deferred work stay excluded.
Current status (2026-10-17, HEAD `76fe529b3`): 7 at 25%, 151 at 50%, 15 at 75%, one
unknown, zero accepted; index 50.86% — see
[delivery-status-current](../specs/sprint-alfred-epic/evidence/delivery-status-current.md).
Every 75 still needs Critic confirmation. The figures below are the superseded 2026-10-11 matrix.
[2026-10-11 matrix](../specs/sprint-alfred-epic/evidence/item-owned-egm-delivery-20261011/postinstall-delivery-matrix.md):
55 at 25%, 75 at 50%, nine at 75%, 35 unknown, zero accepted; 66 assessments.
JSON SHA256: `bb2ad93f93de1db19a6506908a8a572ac2ea57e8044d1fc48a3178358c4eb03c`.
The conservative weighted index is 33.33%, versus 32.76% at the frozen baseline;
this is neither elapsed-time progress nor an ETA. The EGM benchmark is closed as
noncomparable. Do not restart it or infer a causal cost/speed improvement.

## Portable working states and evidence

The [prepared Source manifest](../specs/sprint-alfred-epic/implementation/checkpoint-2026-10-12/prepared-source/manifest.json)
packages 48 inert proposal leaves: 41 v7 selections plus seven review-route leaves.
The [restore plan](../specs/sprint-alfred-epic/implementation/checkpoint-2026-10-12/prepared-source/restore-plan.md)
defines application boundaries. These proposals are not live Main integration,
whole-composition qualification, independent review or acceptance.

The [portable evidence manifest](../specs/sprint-alfred-epic/evidence/checkpoint-2026-10-12/portable-evidence-manifest.json)
maps 248 named records to 230 new objects, conserves 499 prior custody files and
resolves all 174 rows through ten assessment bases. Use its canonical maps;
old scratch/cache paths are provenance, not required filesystem inputs.
Twelve original-requirement associations remain explicitly unresolved.
Private runtime authority, keys, host correlation and missing genuine inputs are
not manufactured or exported. Two older status projections had local Home paths;
their [amendment](../specs/sprint-alfred-epic/evidence/checkpoint-2026-10-12/status-public-projection-amendment-20261012.json)
records the public derivatives without rerunning tests or changing outcomes.

Canonical `specs/**/evidence/**` and `backlog/evidence/**` now override generic
suffix ignores, including log, jsonl and tmp. Root regenerated snapshots and
private scratch remain local; important records are promoted to canonical paths.
The [policy note](../specs/sprint-alfred-epic/evidence/checkpoint-2026-10-12/ignore-policy/policy.md)
records actual Git checks and the consumer-onboarding follow-up.

## Commits and genuine remaining gates

Item commit `5422e4b6e` normalizes three open schemas and records the candidate
admission defect. The official reconciler then recorded five initial open events;
the strict backlog checker passed, with 22 accepted historical DRIFT findings.
Ledger/projection commit: `7530c94fc`. No item closure was asserted.

The live Main Alfred changes are now committed at
`d02409a8a7e63067f3cc2964b98e7d39e6ab57b6`: 317 public files, parent
`8d87a95bcb04a9edfad3998fd34ed7d827039156` (portable documentation/evidence).
The human signed intent
`ee0b27b272019a22e935c85ccc4efebb713f2577fe6245ead641d3e6f36d1aae`;
the installed official authorizer verified the exact staged package and the
native Commit hook accepted its integration binding. The earlier 144-path
proof was not reused. Working tracked Source was unchanged after commit.
The [transparent composition helper](../specs/sprint-alfred-epic/implementation/checkpoint-2026-10-12/live-main-composition/README.md)
records the explicit scope, real strict check outside every Git repository,
and exact 317-blob staged readback. Both PowerShell blobs retain matching LF
bytes. Its request, public proof and actual signing review material are retained
with canonical artifact hashes. This is packaging evidence, not functional
test, independent Critic or Full Verify evidence.

A feature checkpoint push supports honest WIP without claiming Critic/Full Verify
PASS. It still requires a clean final HEAD, one Checkpoint-Intent trailer and the
exact separate push signature. No commit may follow that final push approval.

## Runtime, reviews and continuation

This ready session retains Coordinator authority, implementation phase,
`sprint-alfred-epic`, continuity revision 32. Main State is current but governed
delivery queue admission remains `SQ-DELIVERY-STATE-UNAVAILABLE`; do not fabricate
a queue, requester, host identity or native dispatch. A fresh runtime must follow
AGENTS/map/decisions and the installed pipeline-start entry before productive work.

The installed C2 lineage is `2137b756448606516528697a12945af18bb96943`,
tree `517f1b1733164b9d34355db3dcfd60597f0ebee0`, parent
`a7a9b3cfa2dd32407f8e7b1d80959f1090c77859`.
[C2 handover](../specs/sprint-alfred-epic/plans/handover-2026-10-11-egm-local-stamped-candidate.md)
preserves the distinction from Main; do not transplant private lifecycle state.
Codex plugin version observed here was `0.7.0+codex.20261011202443.a7a9b3cf`;
another PC must independently observe its own installation and model.

No technical batch Critic or Full Verify PASS exists. C2 Full Verify stopped
before suites at augmentation registration. Critic target provenance,
committed membership/Main relationship and genuine current inputs remain held.
The PO selected an additional authenticated review-before-Main course; its seven
code proposals and 17 controlled negative checks are preserved, while genuine
positive admission, original-budget/membership, M4-positive and correction-carrier
evidence remain absent. The selection joins the common design package, not a
self-approved architecture exception or runtime activation.

The whole-item operating contract remains: one Goldfish performs item analysis,
test cases, code and targeted fixes; reserve overlapping files and run disjoint
items concurrently. Elephant consumes matched evidence instead of routinely
rerunning targeted tests. Coherent batches use one FULL Critic plus at most three
DIFFs; one fresh Correction Goldfish owns follow-up fixes. Independent work must
continue during Main review/Verify. Feature work is temporarily frozen only to
make this transfer checkpoint stable.

Optional model evidence absence under an otherwise ready preflight is not a new
lifecycle gate. Unsupported read spelling can follow the guard's admitted
grammar guidance; actual path, role, authority and mutation refusals stay binding.
`/tmp/.git` was present on this host; use explicitly reviewed owned throwaway
directories outside every repository, never global deletion or fake environments.

## Historical detail

[Historical state before rotation](../specs/sprint-alfred-epic/evidence/checkpoint-2026-10-12/docs-state-before-rotation.md)
retains earlier inventories, test counts, holds and source references.
One local Home prefix is normalized; the original digest is retained in the
checkpoint rotation note. No historical outcomes are changed.
[Postinstall continuation](../specs/sprint-alfred-epic/plans/handover-2026-10-11-postinstall-delivery.md)
and [decision intake](../specs/sprint-alfred-epic/plans/po-decisions-2026-10-12.md)
contain the detailed continuation. Historical PASS statements apply only to their
recorded candidate/fixture scope, not current Main or final acceptance.
