# Project state — Agent-Pipeline

Current runner-neutral handover, 2026-10-25. This is the current open/next
authority. [Previous state](../specs/sprint-alfred-epic/plans/state-archive-before-pc-transfer-2026-10-25.md)
is historical and contains superseded goals and counts.

## Active goal and matrix

The PO requests a clean, documented feature-branch interim for a PC/runner
transfer by midnight and explicitly permits an earlier push. Production is
frozen. No close-block, feature close, main switch, merge or release is needed.
Keep `feat/sprint-alfred` and push its existing tracking branch after genuine
candidate-bound authorization. [Transfer plan](../specs/sprint-alfred-epic/plans/pc-runner-transfer-2026-10-25.md).

The [current matrix](../specs/sprint-alfred-epic/evidence/delivery-status-current.md)
contains **254 items:243 at75,4 at50,7 at25;11 below75;index73%** (PF-95/PF-94 follow-up, 2026-10-28
night: Glossover dead end (old batch, earlier course key) and Toolbox D69; bundle v3 (`35fb9c3a6`), v5
(`fa30ba28a`: docs of the four verbs, export field `next`) and patch c22 (`6d0946341`: the takeover also moves
the delivery-target origins entries, else `admit` ended in `CGB-CONFLICT`) installed in the stamp `20c50d267`
(`0.7.0+claude.20261028194700.6d09463`, version read back and equal, hooks refreshed); row stays at75, agent
38: refusal detail not surfaced by `admit`, superseded Glossover state needs one manual file move, path after
the delta, `FPR-LINEAGE-COVERAGE-CLAIM` unpinned, real retests; order: inspect, supersede, rerun round 1,
`--add-review-lineage` before the next correction commit, `--add-delta-request`, round 2; evidence
`PF95-TAKEOVER-DELIVERY-ORIGINS-VERIFY-2026-10-28.md`; PF-94, 2026-10-28: Glossover could
not run round 2 of its Critic course (no sanctioned takeover of a consumed non-course batch, no lineage
record writer, no delta request writer); the PF-94 bundle v2 was applied as one operator commit
`d2a0f0ffb`, installed in the stamp `dd16c6935` (`0.7.0+claude.20261028151938.d2a0f0f`, installed version
read back and equal, git hooks refreshed); the new P0 row is at75 with two agent entries (the path after
the admitted delta is not walked; `FPR-LINEAGE-COVERAGE-CLAIM` and `CGB-TAKEOVER-COURSE` not pinned, the
operator documentation and `--help` text missing) and the native-host entry for the real Glossover retest;
order for Glossover: `inspect-course-takeover`, `supersede-course-takeover`, rerun of round 1 on the course
path, `--add-review-lineage` before the next correction commit, correction commit, diagnostic evidence,
`--add-delta-request`, commit, round 2 preflight; before it 235/0/0; round-3 follow-up bundle v2,
2026-10-28: the first tests of the installed v1 build showed the v1 lift of PF-93 and D60 was too early
(fixes tested against states built by the new code, not against the previous build's state on disk): PF-93
export of a legacy packet finalized by the previous build still failed, D60 feature-request admit threw
after a half-finished claim, and Toolbox D61 (dead `transaction.lock` owner over an empty generic-batch
store, no sanctioned command) joined as a new P0 row; at intake 232/2/1, 74.57%; bundle v2 plus the c14
increment applied as one operator commit `de73effdd`, installed in the stamp `3dd733330`
(`0.7.0+claude.20261028130003.de73eff`, installed version read back and equal, git hooks refreshed); all
three rows at75 again; the Verify registration of `critic-packet-release.test.mjs` and the inventory suite
(30 of 30) are delivered; still open after75: the real Glossover retest of PF-93 (green cases use a chain
built with the real previous build), the D31 native qualification, the native Windows run of
D58/D59/D60/D61, Full Verify, the batch Critic and PO acceptance, all held by the PO until the happy-path
and brownfield tests are green; two unpinned D60 cases and the PO decision on different-task-same-target
semantics are recorded on the D60 row; before it 234/0/0, 75.00%; round-3 follow-up bundle v1,
2026-10-28: PF-93, Toolbox D60 and D31/D32 moved to75 on operator commit `e8834589d`, installed in the
stamp `c896f9444` (`0.7.0+claude.20261028105149.e883458`, installed version read back and equal);
open after75: the D31 native qualification, the Verify-suite registration of
`critic-packet-release.test.mjs`, the native Windows run of D58/D59/D60, Full Verify, the batch Critic and
PO acceptance, all held by the PO until the happy-path and brownfield tests are green; before it 231/2/1,
74.57%; PF-93 reopened to50 and
Toolbox D60 joined at25 on 2026-10-28 after the Glossover and Toolbox sessions tested the installed build:
export of a finalized legacy packet and admit on a held packet still fail; D31/D32 follows a changed PO
design, a budget checkpoint does not stop the Goldfish and the slice stays started; the next candidate
carries all three fixes; round-3 bundle v1,
2026-10-28: PF-85, D52, PF-93 and D58/D59 moved to75 on operator commit `692301fd9`, installed in
the stamp `59b3a7b65`; D31/D32 is the one row below75; the PO holds Full Verify and the batch Critic until
the happy-path and brownfield tests are green; before it 228/3/2, 74.25%; Toolbox D58/D59
intake, 2026-10-28: one P0 row joined at25, the Windows directory fsync refusal that
aborts the Critic batch admit with CGB-PHYSICAL, held patch delivered and verified on
Linux; PF-93 intake,
2026-10-28: one P0 row joined at25, a Critic packet claimed under an older plugin
version cannot be finalized or released; round-2
bundle v5 amendment, 2026-10-28: the 24 held patches were applied in `c0b837599` and
installed in the stamp `638aef7bf` (`0.7.0+claude.20261028061638.c0b8375`, installed
tree equal to the committed tree); six rows moved 50 to75 with open entries kept
(preflight prerequisites, design course versus registrar, half-moved feature directory,
Critic admission without a dispatch record, PF-82, PF-86); three rows stay at50: D52,
D31/D32, PF-85; no Full Verify, Critic, native or acceptance claim; evening
sitting amendment, 2026-10-27: the bundle and increment were applied in `4ea7a86b7`
and installed in the stamp `4df491eb2` (`0.7.0+claude.20261027214535.4ea7a86`);
eleven rows to75 with open entries kept, five rows 25 to50 on partial delivery,
four rows stay at50: preflight prerequisites, design course versus registrar,
half-moved feature directory, Critic admission without a dispatch record; no Full
Verify, Critic, native or acceptance claim; P0/P1
intake round 3, 2026-10-27, PO message: ten P1 rows from the Toolbox hand-over and
Glossover feedback 06 joined, no P0 open, see
`backlog/items/2026-10-27-p0-p1-findings-round-3-toolbox-and-glossover.md`; sitting
amendment, 2026-10-27: the 17 held patches were applied in `624016cb1` to `6546599bc`
and installed in `0.7.0+claude.20261027135736.6546599`; seven rows moved to75 with
their open entries kept; D182, Elephant exception by PO decision 2026-10-27: the native
member records are read once per admission, admission 110 s to about 20 s,
`e41348d1c`, not yet in a stamped install; green-in-code
amendment, 2026-10-27, PO rule "everything green in the code gets 75": five rows with
green committed code moved 50 to75, their open entries kept; second
row amendment, 2026-10-27, second PO tile: two rows without an agent entry left moved
50 to75; first row amendment, same day, PO tile decision: three rows whose only open entries are a
counted Verify run, the Critic and PO acceptance moved 50 to75; analysis
amendment, 2026-10-27: eight analysed rows moved 25 to50 on committed recon notes and
unapplied held patches, see `evidence/recon-2026-10-27`; D173,
2026-10-27: PF-80 moved to75, held patch D173 applied in `e3f0d7d03`, installed in
the stamp `e562ae955`; D172,
2026-10-27: PO rule "75 counts when technically delivered in the candidate"; Full
Verify, Critic, native Windows runs and PO acceptance are the gates AFTER 75.
D25, PF-78 and S7b moved to75 on held patches applied in `304365b68` and
installed as `0.7.0+claude.20261026222010.17e002a`; D7 moved to50 on D170
`17e002a67` and D171 `bff5c444e` (D171 is in source, not yet stamped); Wanted 2
to 4 of D7 open. The Glossover findings PF-79 (P0: Critic packet admission
demands a dispatch record, see the backlog item for the two possible causes and
the open PO questions Q1 to Q3 of the D172 recon), PF-80 and PF-81 (P1) join at25.
D167 adds
the P0 row for PF-78, Critic diagnostic evidence producer versus registrar
location; D166 adds
seven Toolbox rows: P0 D25, D6 at50 and D7 with D15/D16/D17/D24, P1 D8, D9,
D14/D18 and D21 with the rest of D3; D165 adds
two P0 consumer blocker rows for an interim candidate; D164 adds the P1
prerequisite row at25; D163
hotfix amendment 2026-10-26: the PO applied all nineteen held patches as operator
commit `9ce6c2361`, stamped `689116c57`, installed on all three runners).
None is at100 and none UNKNOWN. All P0/P1/Kritisch/Wichtig/Hoch findings
remain0.7.0, mapped to existing ACs. Ten distinct second-run outcomes were
added; no earlier identity disappeared. [Finding ledger](../specs/sprint-alfred-epic/evidence/greenfield-second-run-2026-10-25/README.md).
75 means focused Source readiness, not native acceptance or release.
All-at75 remains the continuation objective after transfer.

**Status 2026-10-29 (27 patches applied and installed, stamp f6fd58003; Full Verify, Critic, native runs, acceptance pending):**
state authority diagnostics, trace and memo (e1b, e1c, e2, e3); the Critic path rule for every legitimate file name
character with the registration route walk (f1, f1-c2, f2, f3, f4); operator text of the range bindings (d2); takeover
verbs in the admit refusal (c24); two production fixes found by walking round 2 of a Critic course (h1, h2); a replayed old takeover moves its leftover origin (k1); test-only m1, n1, n2, p1, q1, q2, q3 (baseline reds fixed). Apply blocks, counts, gaps: `held-patches/STATE-AUTHORITY-AND-CRITIC-PATHS-VERIFY-2026-10-29.md`.
Matrix rows of these patches are lifted next.

**Status 2026-10-28 night (round-2 bundle held; apply, install, Full Verify, Critic, native runs and PO acceptance pending):**
after the 2026-10-27 install the remaining complete held patches are composed in
`specs/sprint-alfred-epic/evidence/held-patches/w7-round2-bundle-v5-2026-10-28.patch` (24 patches, 47 files,
chain-checked on a fresh clone of HEAD; supersedes the 13-, 15-, 17- and 22-patch round-2 bundles, apply only one;
apply blocks, test counts and the kernel parts for the batch Critic in `COMPOSED-STACK-VERIFY-2026-10-28.md`).
v5 adds to v4 a push-init fixture repair (publication review gate, 23 to 32 of 32) and a PRODUCTION fix: the doc
reconciliation tool listed tracked files with the 1 MiB spawn buffer, which fails on this repository
(`GIT-LS-FILES-ERROR`) and would block layer 1b of a real push here; observer-conformance is fixed through the
Phoenix patch, so its standalone patch is not applied. The recon of the remaining baseline reds is
`w7-recon-baseline-reds-c.notes.md` (parallel-work and configure-verify-names classified, seven files unclassified).
v4 = the 17 production and test patches below plus five TEST-ONLY baseline-red repairs (critic-generic-batch origin
fixture, pipeline-state calibration fixtures c3, codex-pretool-guard ready fixture, catalogue-admit D64 pin,
guard-dispatch fixtures c2): no production line, each with a QG-04 comment; guard-dispatch is 60 of 75 (15 baseline
reds left: ten need generator-built briefings, five wait for a guard-owner decision on the check order); the
codex-pretool-guard check 7 needs the runner HOME and is unconfirmed under the runner. New PO questions in the
verify document: D64 bootstrap admission (K152/G7, no register entry), the write-carrier policy for Plan,
general-purpose and Codex worker, `set-phase --verify-command` versus the adopted profile bytes.
It carries D56 slices 2-5 (attested record admission, binding assurance, writer CLI, guard admission,
end-to-end chain test and refusal text), D52 checkpoint-commit route, PF-86 read API c6, D31 briefing and
budget-notice checkpoint return, Phoenix feature directory and reopen dry run, the Phoenix Wanted 4 chain
(byte-identical rebind clause in the design review chain, recorded `pathRebind` in the signed approval binding,
present-plan path remap in the state machine), the PowerShell parity of the half-moved repair lane, and the
preflight scanner and no-sudo slices. Composed-tree test files: all pass except `guard-dispatch.test.mjs` (60 of 75, the
15 reds are baseline reds) and `codex-pretool-guard.test.mjs` (own reporter, 38 of 39 under plain node). Assumed rebind
defaults pending the PO: receipt files stay, a rebind always needs a fresh signature. Not built:
PF-85 slice 1a (a cancelled predecessor already does not block; the extra case needs a package schema field),
native Windows proofs of the PowerShell lane, guard-dispatch groups B and C, the other baseline-red test files of the
2026-10-27 list. No matrix row is lifted before the PO has applied, stamped and installed.

**Status 2026-10-27 evening (composed stack verified; apply, Full Verify, Critic, native runs and PO acceptance pending):**
the complete held patches are composed in
`specs/sprint-alfred-epic/evidence/held-patches/w7-final-bundle-2026-10-27.patch`
(53 files; apply blocks and the baseline comparison in `COMPOSED-STACK-VERIFY-2026-10-27.md`:
no regression in the 51 touched or submit-plan test files, every red file red with identical
names on the clean HEAD). Not in the bundle: PF-86 c1/c2 (partial, NGHS46 red), and the slices
admission read cost, admission 300 s budget with 330 s hook timeout (hooks.json is TP-4), D31 schema
half, signature slice A (one operator command, full proof path) and D56 validator, none dispatched
yet. **Dispatch blocker:** admission takes 102-112 s; the budget literal was raised 100 s to 200 s
(commit `5df5da90d`, Elephant exception by PO decision 2026-10-27) but the installed plugin copy
needs `guard-dispatch.mjs` copied by the PO; the 120 s hook timeout stays the ceiling. The registry
was moved aside once (retained under `session-authority-abandoned`) without lowering the admission
time; the measured cost is the native pending-inventory read (about 15 s per read, repeated per
registry boundary). PO decisions taken: PF-86 registry API change go; PF-85 1a after the cancel
class; signature ceremony and D50 as in the 2026-10-27 register.
**Update (same evening):** the bundle has a second file,
`w7-increment-2026-10-27.patch` (apply order: bundle, then increment; chain-checked on a fresh clone of
HEAD): D31 schema half, admission budget 300 s with hook timeout 330 s (hooks.json TP-4: PO ceremony),
D56 attested-record validator slice 1, and the admission read-cost fix. A CPU profile corrected the
earlier cost guess: one inventory read is 44 ms, one admission repeated it about 960 times and zero-filled
buffers on every file read; with `allocUnsafe` plus a stamp-checked read reuse the real-state admission
reads fall from 19.3 s to 5.5 s. Still open: PF-86 c3, signature slice A, D56 slices 2-5, the baseline-red
test files; Full Verify, batch Critic (the read reuse is an authority-read change), native run and PO
acceptance are not done, no row is lifted.

**Status 2026-10-27 (held work and one blocker; Full Verify, Critic, native runs and PO acceptance pending):**
installed candidate `0.7.0+claude.20261027062846.bdc9f83` carries D173 (PF-80) and
D177 C1 (memoised integrated-slice proof). Held and NOT applied, in
`specs/sprint-alfred-epic/evidence/held-patches/`: the D177 increment
(`d177-admission-speed-settled-history.patch`, typed `GUARD-DISPATCH-SLOW` refusal
at phase checkpoints, no wall-clock gain measured, commit message in
`scratch/commit-msg/apply-d177-increment.txt`) and D174 PF-81
(`d174-pf81-commit-verify-pnpm-lockfile.patch`, `verify-evidence-producer.test.mjs`
44/44 before, 50/50 after, real pnpm install and a native Windows pnpm shim not
exercised). PF-81 stays at25 until applied and installed. **Blocker:** the
stopped D174 Goldfish left `stop-failure-46e6e808863ff820684496cb118d865b.json`
in `.git/agent-pipeline/run/native-goldfish-host-commit/`; the native inventory
refuses it (`native-managed-unknown-native-entry`), so every dispatch is blocked
and `heal` refuses; `move-aside` did not clear it (registry retained aside as
`20261027071029609-d037ab66-repair-move-aside`). The PO moves that one file out
of the directory; then `heal` and the prepared D179 briefing (missing `docs/adr`,
package in `scratch/wave3/pkg-d179-adr-missing.json`) follow. Backlog item:
`2026-10-27-a-stop-failure-diagnostic-makes-the-native-goldfish-inventory-unreadable`.

**D165 interim candidate, status 2026-10-26 (implementation complete, verify, critic and PO acceptance pending):**
the PO applied brownfield entry D1, the PF-75 declaration patch (A), and in
operator commit `1bcce7add` S1 command admission, S2 devplan parity, S3 scope
union, S5 Windows findings, S7a Windows private root-only check and CDR (Critic
diagnostic evidence registration), installed as
`0.7.0+claude.20261026181519.1bcce7a`. Still held and NOT applied: S4
(`held-patches/d165-s4-submit-plan-precheck.patch`, turns ten fixture suites red;
scope decision open: restrict the precheck to enforced/calibrated adoption) and the
partial S8 (state suite fixture, line-2218 decision open). The PF-75 patch B
(`d165-pf75-b-introducing-commit.patch`) matches neither forward nor reverse in
the tree and needs a manual applied-state check. Open: S7b (Windows
bootstrap finding with the copy-paste `icacls` instruction), CDR documentation,
the lock fix, nine push-init fixture cases (`CBV-ROOT`), the Antigravity
installer (`ATR-SOURCE-CANDIDATE-UNAVAILABLE`), the PF-75 push-prepare remedy
text and a Critic repair-map route. The guard-dispatch suite is red at the
pre-hotfix commit too
(`backlog/items/2026-10-26-guard-dispatch-suite-red-before-the-hotfix.md`).

**D166 Toolbox handovers (2026-10-26, PO blocked in the consumer session):** the
three Toolbox files (D1-D26) are distilled into seven backlog items and seven
matrix rows; P0 first: D25 dispatch on Windows
(`2026-10-26-dispatch-authority-store-check-fails-on-windows.md`), D6, D7 complex.
P2/P3 and D26 live in `2026-10-26-toolbox-session-friction-and-feature-wishes.md`
(0.7.1). Consumer acceptance test for P0: a Windows feature run from draft to the
first Goldfish dispatch without manual `icacls`, `git mv` or `discard-feature`.
Toolbox ran on a build before S1-S3/S5/S7a; D2, D3, D5 and the D6 cause need a
live confirmation on the installed candidate.

## Off-machine follow-up (WSL PC re-entry, 2026-10-26)

The PO relayed a handover written on the original machine after the push of
`1addf4dd9`. Two metadata-only commits exist ONLY there and are not in this
checkout: `64dbc35d0` (actual push/audit custody, transfer defect reopened) and
`6f089c41ba56a25e1adfeecdd92ab824bdbe9255` (regular State autofold). They change
no product code. Their matrix adds one row at25: 208 items, 184 at75, 17 at50,
7 at25; 24 below75, index71.27%. Before adopting them, compare current branch
and remote OIDs and merge normally; never reset or discard work done here.
The new row is P1 `pipeline.push-approval-record-always-trails-the-signed-commit`
(backlog/items/2026-08-26-push-approval-record-always-trails-the-signed-commit.md,
AC-37; signature bounds AC-28/AC-36/AC-172 unchanged): `approve-push` writes a
further local State audit entry after the frozen signed commit, so every normal
approve/push cycle leaves the same trailing entry; no regular immediate close
with a clean tree and fully transferred audit exists. Documented, not fixed.
A proposed one-time human operator exception for the metadata push was NOT
approved or executed; derive no hook bypass or signature reuse from it. An
aborted signing attempt there caused `chat:member-source-drift`; after explicit
PO confirmation that all workers had stopped, the registry was archived with
the sanctioned move-aside command, and signing then worked (no key change, no
manual registry repair).
PO observation on this PC: in a new session whose first request is a fetch
from origin, the fetch ran before `pipeline-start` (see PO list Q18).

## WSL PC autonomous round (2026-10-26, PO away)

Held kernel patches committed for the bundled sitting C29 (all `git apply
--check` clean, suites re-run by the Coordinator): pre-ready ref Git
`ed5b55474`, HGO request sweep `2e3aaf3c6`, route effort `b7fbc78b6`, Windows
session locks `6e9a37f16`, Critic transaction owner recovery `a574a7c20`.
Rows stay at their stage until the PO applies them. Behavioral-evidence oracle
row moved 25→75 (`45612a7bd`). Tracked packager `scripts/pack-held-patch.mjs`.
In progress, scratch only: identity/actor reuse (work copy GREEN on the guard
suite and restart cases; C5 packaging pending) and G33 damaged-State recovery
(new backlog item `35e93ec92`; RED confirmed; C2 apply/GREEN/package pending).
**Blocker (Q22, P0 item `c647a524e`):** every governed dispatch from this
session is refused with `SDC-LOCK-HELD` while `inspect` reads the lock absent.
Built briefings wait in `scratch/wave3/` (`briefing-identity-c5.md`,
`briefing-g33-c2.md`; rebuild at HEAD before use, pass with the trailing
newline). Q22 resolved: the refusal came from a session-cleanup manifest lock a
gone hook process left inside custody (not the registry lock); retired
once under PO exception D159, dispatch resumed. Durable fix is held patch
`p0-session-cleanup-lock-recovery.patch` (C29 item 8). G33 patch committed
(`c42dbaf7f`); identity needs one more continuation (patch build, notes).
Caution: scratch work trees that symlink root entries let pipeline-state
suites overwrite the real `architecture/adoption-state.json` (restored). Consumer report 05 is triaged in
`backlog/items/2026-10-26-report-05-consumer-findings.md` (blocker PF-58, four
majors, all 0.7.0). Identity patch committed (`8cbd536ba`); PF-58 fixed directly
(`29d4b4619`); PF-61 and PF-65 are held patches C29 items 9 and 10. Kernel paths
(checked with `isNeverLiftableKernelPath`): `lib/dispatch-briefing-build.mjs`,
`lib/dispatch-budget-notice.mjs`, `lib/onboarding-continuity.mjs`,
`scripts/push-prepare.mjs`, `scripts/architecture-adoption.mjs`,
`lib/architecture-entry-readiness.mjs`, so PF-64/69, PF-59 (D160), D161 and D162
are held-patch work too; packages wait in `scratch/wave3/` (`pkg-pf64-grant-arrival.json`,
`pkg-pf59-handover-block.json`). PO decisions today: D160 (Q23 a), D161 (Q21 a),
D162 (brownfield architecture: no deferral, adoption as onboarding migration,
old records migrated on contact). The PO plans the C29 sitting for about 15:00
today; a bundle integration run of all ten patches is in progress because
patch 3 turns the SubagentStop pin red (goldfish-deep effort versus the
`duty.deep` route). Open PO topics: `specs/sprint-alfred-epic/plans/po-ceremonies-pending.md`
(C29, T3).

## Committed Source and actual qualification

- AC168 `0b80f4f09`:Main66pass/1native skip, stage50. Live10% measurement
  remains open. The later full guard failure is resolved below.
- G24/R3/G27 `fb18ac6b0`:Main93pass/2native skips,83pass/8environment
  skips,57pass and consumers9pass. Their rows are75. Historical scanner
  findings remain unresolved until reproduction/exact-value review.
- G9a original signed-plan/delegation course7/7:stage75.
- Critic preparation `73afcf742`:40original/focused+9consumer pass;
  manifest reference and immutable diagnostic carry75. Recovery50:
  unknown/live-owner locks refuse recovery.
- Phoenix entry `17899cc73`:3actual package cases+9consumers pass, stage75;
  native Windows remains unmeasured.
- Verify checkout `183ecfb2d`:87original+3Phoenix+9consumer=99pass.
  Registered worktree calibration and drift checks are qualified; full
  lifecycle/Critic/close continuity is open, so its P0 row is50.
- READY guard `cf1d5c422`:394original cases391pass/3native Windows skips,
  plus5G23+9consumers; combined405pass/3skip. Literal scratch writes and
  inventory reads retain pre-ready, physical-path and credential controls.
  PO applied the protected patch and performed the required operator commit.
  Full guard and current G23 read rows return to75. Earlier failed physical
  alias and fixture attempts are retained, not reclassified as passes.
- Dispatch helper `869dafa52`:88/88 original/focused/consumer pass;
  standalone help has no account/builder effects, mixed help refuses.
  Help row is75.

[Latest Source/capture custody](../specs/sprint-alfred-epic/evidence/transfer-integrated-qualification-2026-10-25/README.md).
Earlier qualifications remain linked from matrix snapshots. Final full
Verify/Security, frozen independent Critic and PO acceptance remain open.
Retain the single frozen Critic batch/max3correction-review policy.

## Portable unfinished work and next order

[Portable package and replay instructions](../specs/sprint-alfred-epic/evidence/pc-runner-transfer-2026-10-25/README.md)
preserve188 artifacts, exact postimages, patches, captures, dependencies and
full briefings. Seven groups are inert. Do not apply partial patches to Main.

The subsequent rigorous portability audit additionally preserves
[525 briefing/spec/context/launcher inputs](../specs/sprint-alfred-epic/evidence/pc-transfer-briefing-history-2026-10-25/README.md)
and closes [three Scratch-only matrix capture dependencies](../specs/sprint-alfred-epic/evidence/pc-transfer-dependency-closure-2026-10-25/README.md).
The new immutable matrix snapshot changes seven locators, no stages.
Historical `source` paths inside custody/old logs are provenance, not files
the next runtime must find locally; use each recorded tracked transport.
The [detailed portability audit](../specs/sprint-alfred-epic/evidence/pc-transfer-portability-audit-2026-10-25/README.md)
covers the Evidence tree, all354 local repository roots, archival link limits
and exclusions. [Workspace inventory](../specs/sprint-alfred-epic/evidence/pc-transfer-workspace-inventory-2026-10-25/README.md)
preserves public deltas and postimages separately from qualified Main Source.
No current continuation requires the original special worktrees or clones.
Use new inert candidates restored from tracked transports; never blindly
merge an old rehearsal or rejected overlay.

1. Re-enter through AGENTS.md, architecture map, touched concepts, compiled
   decisions and the new runtime's own pipeline-start. Last actual Codex
   readback here was `0.7.0+codex.20261025134513.977dad8`, content identity
   `1d11178192a9c68453084d1ae05f4863bf05ebd9e4608e1f52e8c0b926e26dfe`;
   onboarding readback-current, continuity valid, CAS-READY. Optional model-role
   bootstrap unavailable. Committed Source is newer than this installed build.
   No new stamp or borrowed runtime readiness follows from this transfer.
2. Resume G8/finalizer together in new inert candidates. G8 has17owned files,
   active design9/14; full Model loaded35/pass33/todo2, one later test separately
   green. Exact pre-edit loaded test SHA is unavailable. Finalizer has3owned
   files,15pass/10positive RED. Its static adapter→Codex-host import creates
   an ESM cycle. A full lazy-reader continuation briefing is preserved but
   never dispatched. Retain exact prelaunch packet/claim binding and live
   original Source context; never reconstruct handles from caller JSON.
3. AGY original return remains open. D154/D156 each authorized one native
   experiment, each executed once. v2 observed one PreTool invocation, two
   stream updates of that same step, empty children and no PostTool. The
   second state is an unknown hashed transition, not DONE. Parent SUCCESS
   is not child settlement. The PO manual probe showed a carrier refusal
   before execution. Next test needs a valid generated Goldfish/Critic carrier.
   No third external model call is authorized by these approvals.
   [Sanitized observation](../specs/sprint-alfred-epic/evidence/pc-runner-transfer-2026-10-25/agy-manual-carrier-observation.md).
4. Original controller:full216 baseline201pass/15fail; calibration five focused
   cases now green, two private-Critic binding cases remain RED. Settle focused
   qualification before a full rerun. G9b hook-cwd2/2 green but original pin31/34,
   three receipt/readback failures open.
5. G33 prevention is committed; safe recovery of damaged State is in progress
   as a held patch (bounded fifth continuity repair; provenance must be in the
   State itself; see the WSL round above). Preserve all23 below75 rows, including
   behavioral oracle, architecture scope before signing, Critic recovery,
   lifecycle and native/provider outcomes. Scope next fanouts from row evidence;
   no silent deferral to0.7.1.

## Authority and isolation

[D143–D157](../specs/sprint-alfred-epic/plans/po-decisions-2026-10-25-fix-wave.md)
record PO decisions. Method-only workers and checked integration are authorized;
no native model/dispatch/budget attestation follows. PRD/Spec are unchanged.
Public tests use unique owned `/tmp` children; private synthetic tests require
the separately Source-validated private parent. Recreate prerequisites on the
new host through the appropriate operator route.

Live handles, signing keys, real stores and private cleanup pointers are not
portable. Unknown-live AGY/G8 fixtures remain on the original machine; do not
delete without settlement and ownership evidence. Earlier account-namespace
test effects remain unknown:historical metadata audit220unattributed entries,
contentRead=false,cleanupPermission=false. Do not inspect keys/anchors or claim
clean Git proves private-profile cleanup. Live-edit/overlap captures remain
excluded as passes.

Feature remains active in implementation. Push preparation follows after all
handover writes are committed; no new candidate-bound signature is claimed
here. Read actual local/remote Git OIDs on the next machine rather than
inferring a completed transfer from this plan.
