# Project state — Agent-Pipeline

> Current public repository state. Durable decisions remain in the ADR register.
> Previous state text is preserved as a public projection in the archive below.
> Calibration: [`project/pipeline.json`](../project/pipeline.json) names this file as the handover.

**Current task (2026-10-17): close the 0.7.0 local candidate, no new fixes.**
Read these three files first, in this order, before any other work:

1. [Current item status](../specs/sprint-alfred-epic/evidence/delivery-status-current.md):
   the only work list. Per item it gives the stage and what is still open, each entry with
   an owner (agent, critic, verify-wsl, native-host, po-decision, po-signature, po-acceptance).
   Do not re-derive status from older matrices, ledgers or chat.
2. [The cut decision](../specs/sprint-alfred-epic/plans/po-decisions-2026-10-12.md), section
   "Cut for the 0.7.0 candidate": only closing steps remain, in this order: one WSL Full
   Verify, one Critic batch, PO acceptance lists in blocks. New implementation only for what
   those steps show as genuinely red. Touch an item only for an `agent` entry released for work.

3. [Handover to the WSL session](../specs/sprint-alfred-epic/plans/HANDOVER-2026-10-17-wsl.md):
   the closing steps in order, the Critic scope, and the open Windows findings with their
   measurements, so they are built on and not rediscovered.

**Claude WSL session, 2026-10-20:** the content of the next candidate is being built on
`feat/sprint-alfred` after `e6fec04a0`. It is not stamped or pushed; that waits for the PO's call
(D18, D56 (4)). PO decisions D54-D56 and the triage of report 03 are in
[po-decisions-2026-10-18](../specs/sprint-alfred-epic/plans/po-decisions-2026-10-18.md) and
[feedback-03-triage](../specs/sprint-alfred-epic/plans/feedback-03-triage.md). PO steps and open
questions (Q13 new) are in
[po-ceremonies-pending](../specs/sprint-alfred-epic/plans/po-ceremonies-pending.md).
Built, not accepted:
- the orphaned `registry.lock` (FB3-PF-55/56): it is retired once its owner is gone, and
  `release-lock` and `wait` are added;
- the checkpoint-lane check before signing (PF-32/33);
- the commit route for Pipeline-owned files (PF-31/36/40);
- the Critic findings of `e6fec04a0`: F2, F4, F5, F7, F8, F9 and F11, plus F1's D52 (2) part;
- PF-34: the Critic review unit is registered with the feature package, and
  `register-feature-package.mjs --add-review-unit` adds it to an existing manifest;
- the Q12 trailer form `Dispatch: D<n> (elephant-exception)` (D55);
- Q1 (D27/D55): a course slice recorded only by its orchestrator commit is accepted at close on the
  audit route only (`CLOSE-AUTHORSHIP-COMMIT-ONLY` otherwise). This sprint's own close therefore
  runs `feature-close-prepared` with `--audit-request` and `--critic-verify-lifecycle`;
- FB3-PF-54 first stage (D56 (1)): `architecture-boundary-check.mjs` over the tracked tree with
  `architecture/boundary-policy.json` (pass here, 115 accepted entries), and the module facts in the
  briefing skeleton;
- the backlog check is valid again (nine item types, eighteen ledger entries), and four suites red on
  `e6fec04a0` are fixed (repair-map AC-4, the architecture overview, the close audit lifecycle).
Ordinal-2 delta Critic over `e6fec04a0..f62b5143a`: FAIL on F-A and F-B (major), with F-C, F-D
and F-E minor. The report and its disposition are in
[ord2-f62b5143a](../specs/sprint-alfred-epic/evidence/critic/ord2-f62b5143a/disposition.md). The
corrections are Elephant-built, because the Goldfish route needs Spec item rows these items do not
have. That puts them under the new PO question Q14, together with the D55/D56 commits.
Corrections built, not accepted:
- F-D: the close plan reports each slice's authorship record (`courseAuthorship`);
- F-C: `commit-pipeline-owned.mjs` writes provenance trailers only with `--agent`;
- F-B, unprotected half: `lib/guard-override-ledger.mjs` resolves the ledger under the common Git
  directory, and an older tree ledger stays consumed.
Its writer, guard-git, is ceremony C13. C13 is ready as two whole-file drop-ins (hook and test); a
clone proof shows guard-git 258/258.
Ordinal-3 delta Critic over `f62b5143a..254ff0002`: FAIL on F1, F2 and F3 (major), F4 minor
([ord3-254ff0002](../specs/sprint-alfred-epic/evidence/critic/ord3-254ff0002/disposition.md)).
Corrections built, not accepted: `commit-pipeline-owned.mjs` requires `--agent` or `--human`
(F4); PUSHSIG-S4c no longer depends on the checkout path length (F3); the ledger helper says it
is not yet in effect and creates its file owner-only (F1, closed only by C13). F2 (stage-0
trailers on commits that exceed stage-0) goes to Q14; backlog commits now use
`Dispatch: administrative (elephant)`, which needs the paths staged first and the Dispatch line
before `AI-Assisted`.
PO decision 2026-10-20: ceremonies first, then the last Critic review (ordinal 4) over the delta
after them, then the candidate is stamped and pushed. Second PO decision the same day, before the
ceremonies: measure in a throwaway clone with real background dispatches which fault leaves
`registry.lock` behind after a dispatch, then narrow the registry so that it keeps the lock only
after a real partial effect (the "Not in this item" part of
`backlog/items/2026-10-20-an-orphaned-registry-lock-blocks-every-dispatch.md`).
Measured: the lock stays behind when a hook is killed while it holds it; the current build retires
it at the next launch (pinned in `c1bdbe0db`). The retain was not narrowed, because narrowing does
not help a killed holder. D57 (third PO call the same day): the ordinal-4 Critic and Full Verify
move after the PO's local test of the candidate; Q14 (a), Q13 (a), Q6 (b); C6 and C2 land in this
candidate; the Codex-host half of AC-147/209 moves after 0.7.0.
Landed since: ceremonies C11+C3+C14 (`73c889ad6`), C12 (`21fba99dc`) and C13 (`7a7ccceae`, the PO's
terminal commit of hook and test), the C13 doc edits (`8b23eecce`), and the Q13 take-over verb
`session-authority-repair.mjs take-over` (`e3902a6fb`, SAR10). Implementation complete, not accepted.
Then ceremonies C6 (`2efb70679`) and C2 (`9dda09720`, with its pin). D58: Q15 (a), the
`guard-git.test.mjs` split follows the local test (backlog item); the PO called for the candidate.
**Pushed 2026-10-20:** candidate `0913fa941` (checkpoint over the stamp `9ad53b50f`, version
`0.7.0+<runner>.20261020064459.a8ddf85`) to `origin/feat/sprint-alfred` with a signed approval;
it replaces `e6fec04a0`. The first signature was spent: push-prepare folded the pending approval
record above the checkpoint commit and reported ready for a HEAD without `Checkpoint-Intent`
(backlog item `2026-10-20-a-checkpoint-fold-lands-above-the-checkpoint-commit.md`).
Implementation complete, PO acceptance pending.
**Goal since 2026-10-20 (PO):** a content-final local test candidate for 0.7.0, pushed to
`feat/sprint-alfred` for the PO's acceptance tests; the release itself (main, release gates,
version decision) is not part of it. The PO installed `0913fa941`. Route (D59): the ordinal-4
Critic closes the running batch; a Full Verify (`--mode candidate`) in a fresh clone names every
red suite; the known reds are fixed (doc contracts, the checkpoint fold, the guard-git test split);
the delivery matrix credits earlier per-item Critics and counted Verify results; items with no
review get a new batch. The 2026-10-20 remeasure (`8063c1ce6`): 7 at 25, 144 at 50, 23 at 75,
index 52.30%.

**Correction route since D63-D67 (2026-10-20), read this first.** Run
`node specs/sprint-alfred-epic/plans/correction-ledger-check.mjs` before any work: it prints the
one cluster in progress and its next step from the committed ledger (D67, enforced: no briefing
for a cluster that is not in progress, while the tree is dirty, or while a started cluster has no
committed closure). Read that cluster's closure entries in
`specs/sprint-alfred-epic/plans/full-verify-correction-plan-2026-10-20.md` and do not re-measure
what they record. Facts: the Full Verify measurement of `c1771bc98` has 138 of 1057 steps red
(`specs/sprint-alfred-epic/evidence/full-verify-c1771bc98/`); all 103 test-red suites are also red
in the working checkout; they form ten clusters K1-K10 with an owning item each. D63 confirms the
deferrals, releases the reconstructions and the superseded list; D64 puts the Codex happy-path
blockers and majors into AC-123, AC-155, AC-207 and AC-264; D65 and D66 decide eight small design
calls; C15 and C16 collect the protected registration changes for the bundled sitting. Estimate
(not measured): 5-8 session days to the content-final candidate.
Closures: M0 (measurements) and W1 (AC-142B, AC-224, AC-155A, implementation complete at
`c578670d7`, Critic batch and PO acceptance pending) are closed; K1 is in progress.

**Scope route since D60-D62 (2026-10-20):** the scope pass
(`specs/sprint-alfred-epic/plans/scope-pass-2026-10-20.md`) found the content scope incomplete
(145 items with open work). D61: everything goes into the candidate, the larger features too;
ADR-0085 items close as superseded after a PO-visible list; test hosts are Claude on native
Windows, Codex and Antigravity on WSL (PO) and Claude on WSL (this Elephant session); every
signature-bound patch is signed in one bundled sitting before Full Verify. D62 adds PF-34 and
PF-57 (Critic route) to AC-142 and AC-224. The remeasure's open points proved stale in places,
so every item is re-read against its acceptance before dispatch (21 read-only readers,
`scratch/scope-verify/`); then Goldfish dispatches per item, the bundled ceremony sitting, Full
Verify, corrections, stamp and push.
Open:
- T1 and T2;
- the delivery matrix, remeasured after the PO installed the candidate;
- after the local test: the ordinal-4 Critic and Full Verify (needs a clean tree, Q7).
  `check-doc-contracts.test.mjs` is red 73/76 already at HEAD (broken links from evidence under
  `specs/` into `scratch/`, the handover's missing link back to calibration), so Full Verify
  will report it;
- PO acceptance.

**Claude WSL session, 2026-10-19:** last pushed candidate `e6fec04a0` (checkpoint over the
stamp `d52de6154`, version `0.7.0+<runner>.20261019205354.d99774b`), pushed to
`origin/feat/sprint-alfred` with a signed approval. It replaces every candidate named below and
carries PF-49 to PF-55 (D46-D53 in
[po-decisions-2026-10-18](../specs/sprint-alfred-epic/plans/po-decisions-2026-10-18.md), E36 in
[elephant-decisions-2026-10-19](../specs/sprint-alfred-epic/plans/elephant-decisions-2026-10-19.md)).
Implementation complete, not accepted. Open, in this order:
1. The independent Critic batch on PF-54/PF-55 (D51 (4): after the push): production commits
   `f52d20a12`, `d769449e8`, `e64562c6a`, `cfcd01b6f`, `426e4afbe`, `d99774b17`.
2. The PO's test of this candidate in the main project.
3. Not rerun after the last changes: the finalizer, commit-execution, AGY and
   human-guard-override suites; Full Verify is open. The SAR suite and the new pin case are not
   yet registered in Full Verify (protected file, needs a ceremony).
4. Backlog: `2026-10-19-session-authority-repair-gaps-after-pf55`,
   `2026-10-19-suites-red-on-this-checkout-before-pf55`, the post-push record step of
   `2026-10-19-a-push-leaves-the-next-item-dispatch-refused`. The push-approval record in
   `project/pipeline-state.json` stays uncommitted until the next `push-prepare` folds it.

**Claude WSL session, 2026-10-18:** local test candidates are stamped from real greenfield
findings (PF-14, PF-19, PF-20, PF-23, PF-25). PO decisions D5-D15 are in
[po-decisions-2026-10-18](../specs/sprint-alfred-epic/plans/po-decisions-2026-10-18.md).
Last pushed candidate: `15f9355d3` (PF-25 feature package registration, Antigravity runner
view). On it, the PO's installer option 2 was refused `ATR-WIRING-OWNERSHIP-UNVERIFIABLE`:
global hook wiring still pointed into the removed managed copy. Fixed in `c2817beda`.
A read-only `prepare()` against the real configuration is now `prepared`, and a rehearsal
with the real `agy` CLI in a throwaway home is `refreshed`. That fix is not yet stamped or
pushed. The PO's real-project re-test of PF-25 is pending. Full Verify, the Critic batch and
PO acceptance are still open.

**WSL session, 2026-10-17:** the WSL clone was synced to the stamp commit `902f029c3`
with a local fetch from the Windows checkout (fast-forward, no own commits lost). The
installed plugin matches that source (`d6f4d76`). The branch is checkpoint-pushed so a
second PC can run greenfield tests. Closing step 1 (WSL Full Verify) is still open.

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
Current status (2026-10-18, HEAD `98b6e5ca2`): 7 at 25%, 150 at 50%, 16 at 75%, one
unknown, zero accepted; index 51.01% — see
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
