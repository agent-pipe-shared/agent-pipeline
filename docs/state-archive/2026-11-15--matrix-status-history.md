# Handover archive -- Matrix status history

> Rotated from `docs/state.md` on 2026-11-15 by `plugins/pipeline-core/scripts/handover-rotate.mjs` (ADR-0066).
> Section(s) archived: Matrix status history.
> Summary: Matrix status history 2026-10-26 to 2026-11-01: amendment-by-amendment stage movements, candidate stamps and held-bundle status of the 0.7.0 matrix before candidate 15c; superseded by the current matrix document and candidates 15c to 29e.
> Append-only once written; never edited by hand.
> Content below is verbatim except that relative markdown link target(s) were rewritten to keep resolving correctly at this file's directory depth (link text and all other content are untouched).

## Matrix status history

(15c: no stage change; candidate 14, 2026-10-31 evening: operator-applied through `88a800089`, stamped `e9454e59e`, installed and read back `0.7.0+claude.20261031181742.88a8000`; carries the consumer Critic-course chain, the green-Verify triage fixes, the Critic preimage re-pin (D221) and the D216 option A read/write split, decisions D219-D222; implementation complete, matrix not re-measured; Full Verify on this tree is red until candidate 15; open: batch Critic, native Windows runs, PO acceptance, drift-test debt for the read halves; no push planned; previous: `a2099ff5f` 10-31, candidate 13 installed, read back
`0.7.0+claude.20261031060558.62b553e`: AC-175 and G15 to75, 26 held patches; red and named: onboarding-v3
push gate and SECGATE-1; open: consumer retests (PROJ-B D207/N20 route, PROJ-A N29), 0.7.1 items in
`backlog/items/2026-10-30-candidate11-follow-ups.md`; PF-95/PF-94 history (`20c50d267`) in the matrix; PF-94, 2026-10-28: PROJ-B could
not run round 2 of its Critic course (no sanctioned takeover of a consumed non-course batch, no lineage
record writer, no delta request writer); the PF-94 bundle v2 was applied as one operator commit
`d2a0f0ffb`, installed in the stamp `dd16c6935` (`0.7.0+claude.20261028151938.d2a0f0f`, installed version
read back and equal, git hooks refreshed); the new P0 row is at75 with two agent entries (the path after
the admitted delta is not walked; `FPR-LINEAGE-COVERAGE-CLAIM` and `CGB-TAKEOVER-COURSE` not pinned, the
operator documentation and `--help` text missing) and the native-host entry for the real PROJ-B retest;
order for PROJ-B: `inspect-course-takeover`, `supersede-course-takeover`, rerun of round 1 on the course
path, `--add-review-lineage` before the next correction commit, correction commit, diagnostic evidence,
`--add-delta-request`, commit, round 2 preflight; before it 235/0/0; round-3 follow-up bundle v2,
2026-10-28: the first tests of the installed v1 build showed the v1 lift of PF-93 and D60 was too early
(fixes tested against states built by the new code, not against the previous build's state on disk): PF-93
export of a legacy packet finalized by the previous build still failed, D60 feature-request admit threw
after a half-finished claim, and PROJ-A D61 (dead `transaction.lock` owner over an empty generic-batch
store, no sanctioned command) joined as a new P0 row; at intake 232/2/1, 74.57%; bundle v2 plus the c14
increment applied as one operator commit `de73effdd`, installed in the stamp `3dd733330`
(`0.7.0+claude.20261028130003.de73eff`, installed version read back and equal, git hooks refreshed); all
three rows at75 again; the Verify registration of `critic-packet-release.test.mjs` and the inventory suite
(30 of 30) are delivered; still open after75: the real PROJ-B retest of PF-93 (green cases use a chain
built with the real previous build), the D31 native qualification, the native Windows run of
D58/D59/D60/D61, Full Verify, the batch Critic and PO acceptance, all held by the PO until the happy-path
and brownfield tests are green; two unpinned D60 cases and the PO decision on different-task-same-target
semantics are recorded on the D60 row; before it 234/0/0, 75.00%; round-3 follow-up bundle v1,
2026-10-28: PF-93, PROJ-A D60 and D31/D32 moved to75 on operator commit `e8834589d`, installed in the
stamp `c896f9444` (`0.7.0+claude.20261028105149.e883458`, installed version read back and equal);
open after75: the D31 native qualification, the Verify-suite registration of
`critic-packet-release.test.mjs`, the native Windows run of D58/D59/D60, Full Verify, the batch Critic and
PO acceptance, all held by the PO until the happy-path and brownfield tests are green; before it 231/2/1,
74.57%; PF-93 reopened to50 and
PROJ-A D60 joined at25 on 2026-10-28 after the PROJ-B and PROJ-A sessions tested the installed build:
export of a finalized legacy packet and admit on a held packet still fail; D31/D32 follows a changed PO
design, a budget checkpoint does not stop the Goldfish and the slice stays started; the next candidate
carries all three fixes; round-3 bundle v1,
2026-10-28: PF-85, D52, PF-93 and D58/D59 moved to75 on operator commit `692301fd9`, installed in
the stamp `59b3a7b65`; D31/D32 is the one row below75; the PO holds Full Verify and the batch Critic until
the happy-path and brownfield tests are green; before it 228/3/2, 74.25%; PROJ-A D58/D59
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
intake round 3, 2026-10-27, PO message: ten P1 rows from the PROJ-A hand-over and
PROJ-B feedback 06 joined, no P0 open, see
the round-3 findings backlog item of 2026-10-27; sitting
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
to 4 of D7 open. The PROJ-B findings PF-79 (P0: Critic packet admission
demands a dispatch record, see the backlog item for the two possible causes and
the open PO questions Q1 to Q3 of the D172 recon), PF-80 and PF-81 (P1) join at25.
D167 adds
the P0 row for PF-78, Critic diagnostic evidence producer versus registrar
location; D166 adds
seven PROJ-A rows: P0 D25, D6 at50 and D7 with D15/D16/D17/D24, P1 D8, D9,
D14/D18 and D21 with the rest of D3; D165 adds
two P0 consumer blocker rows for an interim candidate; D164 adds the P1
prerequisite row at25; D163
hotfix amendment 2026-10-26: the PO applied all nineteen held patches as operator
commit `9ce6c2361`, stamped `689116c57`, installed on all three runners).
None is at100 and none UNKNOWN. All P0/P1/Kritisch/Wichtig/Hoch findings
remain0.7.0, mapped to existing ACs. Ten distinct second-run outcomes were
added; no earlier identity disappeared. [Finding ledger](../../specs/sprint-alfred-epic/evidence/greenfield-second-run-2026-10-25/README.md).
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

**D166 PROJ-A handovers (2026-10-26, PO blocked in the consumer session):** the
three PROJ-A files (D1-D26) are distilled into seven backlog items and seven
matrix rows; P0 first: D25 dispatch on Windows
(`2026-10-26-dispatch-authority-store-check-fails-on-windows.md`), D6, D7 complex.
P2/P3 and D26 live in the session-friction backlog item of 2026-10-26
(0.7.1). Consumer acceptance test for P0: a Windows feature run from draft to the
first Goldfish dispatch without manual `icacls`, `git mv` or `discard-feature`.
PROJ-A ran on a build before S1-S3/S5/S7a; D2, D3, D5 and the D6 cause need a
live confirmation on the installed candidate.

