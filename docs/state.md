# Project state — Agent-Pipeline

> Current public repository state. Durable decisions remain in the ADR register.
> Previous state text is preserved as a public projection in the archive below.
> Calibration: [`project/pipeline.json`](../project/pipeline.json) names this file as the handover.

**Current 0.7.0 continuation — all runners (2026-10-24; supersedes older cuts below):**

Follow the [runner-neutral completion plan](../specs/sprint-alfred-epic/plans/plan_0.7.0-completion-and-greenfield-2026-10-24.md): finish content and focused checks, stabilize real Greenfield paths, run preparatory full Verify/Security and fix/classify failures, freeze, conduct one full Critic batch with at most three correction-diff reviews, then run final release Full Verify/Security on the reviewed candidate. No early/per-item Critic or automatic full-review loop. PRD and Spec require separate explicit PO permission; use existing accepted ACs and delivery machinery, without reopening design.

The [official 0.7.0 matrix](../specs/sprint-alfred-epic/evidence/delivery-status-current.md) remains 194 distinct items: 2 at 25, 36 at 50, 156 at 75, none at 100 or UNKNOWN; index 69.85%, 38 below75. Five explicit later deferrals were removed; all 22 original P0/P1 report entries are traced through 28 Greenfield rows, including three aliases counted once. Retained evidence binds `31db7853a`; initial Greenfield assessments bind `daaf074b1`. Fresh calibration, role-route and GND qualification now proposes 75, but proposals are not yet counted. Native duties, review and PO acceptance stay open.

K156/registration is operator-committed `0fb6fe6d9`; G19/G21 is operator-committed `daaf074b1`. G19 preflight `20392c08f` and G22 dependencies `3c43c8555` committed normally. The improved protected-commit diagnostic is committed `1b7fc4f04`: it identifies missing author-source selection without changing eligibility or signing. G23's test-module glob correction, the 18-path P1 lifecycle composition and seven-path recording overlay are applied but uncommitted. New required receipts 16/16, composed G21 Source/Result 22/22 and owner-focused P1 checks passed. The dedicated State fixture correction preserves all 21 assertions: State 3/3, composed K156 19/19 and consumer paths 9/9 now pass. Two append-only private-temp test changes add genuine controlled refusal/cleanup mutations: 20 passes and nine native skips. The complete 27-path package is staged with matching owner postimages; its normal active-hook commit was refused for registration, command catalogue and State writer. The exact human operator command is prepared and delivered; actual commit readback is pending. The capability inventory needs rebaseline after a real source commit, not an invented future HEAD. See [retained content-wave evidence](../specs/sprint-alfred-epic/evidence/verify-fixes/content-wave-2026-10-24/README.md) and [earlier cohort custody](../specs/sprint-alfred-epic/evidence/verify-fixes/cohort-2026-10-24/README.md).

G17 remains STOP/NOT MAIN-READY: the earlier candidate accepted an unowned settlement-gap write. Subsequent publisher instrumentation is unfinished, exposes live owner objects, and has no corrected managed positive. Automatic approval review rejected host receipt/protected-mutation changes; neither rejected transformation executed. No normalization of actual receipt hashes or alternate-tool application is allowed. Collect a safe concrete proposal before asking the PO. G8's audit found no genuine independent reviewer producer at the active present-plan consumer; controlled METHOD observations cannot supply that authority. Neither package is imported or promoted.

The PO deferred Greenfield runs until morning and offered a final terminal window; no fully qualified terminal package was ready then. Continue parallel disjoint slices and collect real operator/signature/decision needs in the [PO queue](../specs/sprint-alfred-epic/plans/po-pending-codex-2026-10-24.md). The operator command is not a signature ceremony; no live signing command exists. Installed runtime remains `f2aee4ec2`, Codex `0.7.0+codex.20261024154452.355dba9`, loaded SHA `961616d408f8f37b60b38f52700c21e2b87c353250a141e725f3d10b9a74df4d`; no later stamp/install/push. Attended model confirmation actually returned READY: fresh frontier requests use approved `gpt-6.1-sol`. The PO-created `/run/user/1000/ap-g17` is owned by `skar667`, mode 0700; use only authorized new nonce children, never account-home/preexisting cleanup. The full-wave worker exception is methodological only: no fabricated native binding, receipt, model observation, signature or budget grant. Preserve all earlier attempts/costs and actual scope stops; ordinary approved work and active-hook commits need no repeated chat permission.

The [prepared 0.7.1 inventory](../backlog/matrices/0.7.1-preparation-2026-10-24.md) stays locked until BOTH 0.7.0 release AND genuine close-block. Its 110 none-header rows partition 20 active 0.7 overlaps, 78 provisional future candidates and 12 closed-history rows. The final semantic cross-check against newly added Greenfield IDs is still open. No future feature activation or acceptance is inferred.


Five native-only rubric corrections are now counted with original scope/duties
preserved:38 items remain below75. The pending27-path package and its separate
qualification proposals are excluded from this snapshot.

**Additional focused checkpoint:** fixture-only guard isolation committed normally as `982e66c27`: original73 pass/1 Windows skip unchanged, final74/1, controlled original contamination69/4/1; consumer9/9. [Parallel custody](../specs/sprint-alfred-epic/evidence/verify-fixes/parallel-followups-2026-10-24/README.md) retains exact failures, reports and hashes. G23 passive matrix and required FD completion7/7, candidate registration1108/completion376 and kernel/consumer18/18 are green but the four-path follow-up overlay remains inert until the frozen27 operator commit is read back. G6 installer matcher defect is reproduced and a three-path repair is inert; aggregate write-chain, source-script negatives and final-readback fault remain unqualified. No G6 promotion or host proof is claimed. Current matrix remains194/38 below75; no stamp/install/push. The exact27 operator paths and staged bytes remain unchanged.

**Earlier session cut (2026-10-24, Claude tokens exhausted until Sunday 2026-10-25 21:00; the PO continues two days with Codex as the Elephant):**
- Detailed state, queue, mechanics and standing rules: `specs/sprint-alfred-epic/plans/handover-codex-switch-2026-10-24.md`. Read `CLAUDE.md` in
  full first (Codex does not load it). Findings register: `specs/sprint-alfred-epic/plans/greenfield-findings-2026-10-23.md` (G1 to G16, V1 to V4).
- Since the sitting: Full Verify run once (red 51 of 1095, classified), fixes K140 to K150 part A imported on `feat/sprint-alfred` (implementation
  complete; independent Critic read, a fresh Full Verify and PO acceptance pending); new dev stamp `556247e05` (`0.7.0+<runner>.20261024080351.b00899b`, includes K143 to K153; the PO installs it),
  later commits are not stamped. The two human-operator commits are done (K152 part 3 `e9e866fec`, K153 `c80bd9e97`); the tree is clean.
- Queued, not started (order in the handover section 5): K146 dispatch enforcement with a fix-wave route, K152 parts 1 and 2, K150 part B,
  CCH136/137 fix, K156 calibration deadlock, K154 critic gate, K155 docs; then Full Verify, Reader third round, Critic batch, C28 re-pin, final
  stamp. Two more runner reports (Codex, Claude) are to be triaged into the findings register. No stamp, install, push or release without a PO call.
- The 2026-10-22 night session cut (stamp `9355151ff`, push `57aa08996`, the old path to close 0.7.0) is archived verbatim in
  `specs/sprint-alfred-epic/plans/state-archive-session-cut-2026-10-22.md`.

**AFK window (2026-10-23, written during the window; wins over the session cut where they differ):**
- Agents imported on `feat/sprint-alfred` (implementation complete; Critic read and PO acceptance pending): K53 to K132 batches (scripts,
  backlog sweep, D75/D76, D140 docs, pins, Reader corrections, ledger); counted runs `evidence/pin-counted-results-2026-10-23*.md`.
- Sitting preparation index (start here, links every file, rehearsal and open task): `specs/sprint-alfred-epic/plans/sitting-preparation-index-2026-10-23.md`.
- Held for the PO sitting (about 15:00 on 2026-10-23): ordered runbook `specs/sprint-alfred-epic/evidence/sitting/runbook.md` (steps
  01 to 47; step 35, the Critic preimage re-pin, waits until just before the stamp); patches also in `evidence/held-patches/`.
- PO list: `plans/po-list-afk-2026-10-22.md`, rows 1 to 44; tile decisions up to batch 12 in `plans/po-decisions-2026-10-23-tiles.md`.
  Reader course: rounds 20261023a and b done, correction batches 1 and 2 imported, no third round; the terminal v2 record
  (owner `by: APS`) is written after the sitting.
- Ledger after fresh counted runs: K3, K4, K5, K9, K11, K12 closed (named rests in the plan file); K8 repairs held; K1D, K2, K6, K7, K13
  open on ceremonies or PO decisions. Matrix remeasured 2026-10-23 (`evidence/delivery-remeasure-2026-10-23/`): 3/56/115 at 25/50/75, index 66.09% (was 63.65%); repeat after the PO tests. Not started: stamp, push, Full Verify, Critic batch, Reader course.

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
`c578670d7`, Critic batch and PO acceptance pending) are closed; K1 is partly closed (2026-10-21,
'K1 closure': implementation complete, Critic batch and PO acceptance pending; recovery 39/39,
binding 61/66; the rest, binding A/B/E and GDW01, is the decision cluster K1D awaiting the PO; the
model-family cases joined the D66 row); K1h with K10 is in progress (onboarding-continuity
306/306; the first full Verify after it showed two Verify-only causes, the ambient TMPDIR and the
completion-registry drift). D73 (2026-10-21, PO tiles) decides K1D A, E and GDW01 (GDW01 is fixed in
0.7.0 through a guard drop-in) and a private TMPDIR per Verify suite; D74 fixes refusals without a
repair in 0.7.0. K1h is partly closed (2026-10-21, 'K1h closure': implementation complete, Critic
batch and PO acceptance pending; private Verify TMPDIR `b73b423b1`/`216a9c78f`; the named rest went
to K7, K9, K1D and the D66 row). K1D is in progress (D73 A delivered at `4fb40e587`, binding 65/67;
B, E and GDW01 remain). D75 (2026-10-21, PO tile) puts typed continuation after a budget stop and
classified cancel reasons into 0.7.0, enforced in the hooks with self-describing, runner- and
platform-neutral messages. D70 (lost-binding recovery, built at
`d2602f5cf`/`5e5c7d8f2`, implementation complete) and D71 (the per-user session-power address root
past its 4096-slot bound: 3769 stale test slots moved aside, product fix in this candidate) are in
`po-decisions-2026-10-18.md`. D72 settles both open K1 calls: the address root stays at the OS home
and a repair verb cleans it (no redirect), and `archive-orphan` may use the lost-binding release
after a read-back archive. **K1 handover for the new session (2026-10-20, PO-agreed single
restart; the remaining waves run in it, autonomously per plan):** tree clean after this commit;
interim stamp `4d78bb07e` (0.7.0+…20261020195107.231d1a0) may be installed by the PO. Order:
(1) the D71 repair verb per D72 as one goldfish-deep dispatch from the template (new module, plan
plus readback, moves absent-repository slots aside, deletes nothing; the 4096 refusal in
`lib/session-power.mjs` names it; scratch runners run it after each suite; the `verify.mjs`
per-suite run is collected as a C15 drop-in; neither touched file may pass 1000 lines); (2) RF2A
per D72 (`applyOrphanDescriptorArchive` in `lib/session-cleanup-recovery.mjs`); (3) D70 (b) legacy
bytes; (4) the binding-suite rest (49/66) and recovery (37/39); (5) K1f, K1g; (6) the model-family
group to the D66 package; (7) the K1 closure entry, ledger and state line, then K1h/K10 onward.
Shell guard: one simple command per call, no pipes; commit messages via `-F`.
D69 / ADR-0088 (test economy): fast gate plus fresh full run, quarantine with owner and expiry,
retire on supersede, ratchet, runtime budget; rules 3 and 4 apply in this candidate, the Verify
rebuild follows 0.7.0 (`backlog/items/2026-10-20-verify-test-economy-rebuild.md`).

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

## Archived history

| Date range | Summary | Archive |
|---|---|---|
| 2026-10-24 | Historical October 12 integration and runtime cut; current continuation stays in state | [docs/state-archive/2026-10-24--codex-greenfield-history.md](state-archive/2026-10-24--codex-greenfield-history.md) |

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

Retained Sentinel Epic authority (`governance/spec-retention.json`, archive
`docs/spec-archive/2026-07-20-sentinel-recovery/`):
[PRD](../specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md),
[Spec](../specs/2026-07-19-sprint-sentinel-epic/spec.md),
[acceptance matrix](../specs/2026-07-19-sprint-sentinel-epic/backlog-acceptance-matrix.md),
[reconciliation design](../specs/2026-07-19-sprint-sentinel-epic/public-private-reconciliation-design.md),
[recovery](../specs/2026-07-19-sprint-sentinel-epic/RECOVERY.md),
[platform support](../specs/2026-07-19-sprint-sentinel-epic/platform-support-contract.md),
[Windows blockers](../specs/2026-07-19-sprint-sentinel-epic/windows-blockers-scope.md).

## Historical detail

[Historical state before rotation](../specs/sprint-alfred-epic/evidence/checkpoint-2026-10-12/docs-state-before-rotation.md)
retains earlier inventories, test counts, holds and source references.
One local Home prefix is normalized; the original digest is retained in the
checkpoint rotation note. No historical outcomes are changed.
[Postinstall continuation](../specs/sprint-alfred-epic/plans/handover-2026-10-11-postinstall-delivery.md)
and [decision intake](../specs/sprint-alfred-epic/plans/po-decisions-2026-10-12.md)
contain the detailed continuation. Historical PASS statements apply only to their
recorded candidate/fixture scope, not current Main or final acceptance.
