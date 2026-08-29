---
schema: pipeline.backlog-item.v1
id: pipeline.every-gate-binds-the-whole-tree-so-any-later-commit-voids-it
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-16
sprint: nova
source: "PO, 2026-08-16 push-flow analysis: 'der push ist durch zu viele sachen viel zu schwierig und umständlich geworden. Man kann nicht zeitnah einfach mal pushen selbst nach freigabe nicht.' Named Block F in that session and agreed for filing; the measurements below were taken in the same session."
done_when: manual
---

# Every gate binds the whole tree, so any following commit voids it and all work serializes

## What binds today

Verify evidence, security evidence, and a push approval each bind one exact
commit. `checkEvidenceFreshness` requires both `exitCode === 0` and
`commit === sourceCommit`; a recorded approval names the exact candidate
commit. None of the three records *what it actually read* — the binding is to
the commit as a whole, not to the inputs the gate consumed.

## The consequence, as it played out in one session

Any commit landing after a gate ran voids that gate's result, regardless of
what the commit touched. In the 2026-08-16 session this dictated the entire
work order: no commit could land while a Critic was reading evidence; the
version stamp had to be the last commit before the plugin was copied; backlog
filing, handover folding, and the stamp all had to be frozen before verify ran.
With verify at 269 suites, the working rule collapsed to one committer at a
time — which is also the shape of two already-filed defects
(`2026-08-07-parallel-goldfish-dispatches-race-on-shared-checkout.md`,
`2026-08-12-shared-verify-evidence-slot-corrupted-by-concurrent-dispatches.md`).
Those two are about mechanism collisions; this item is about the binding rule
that makes serialization necessary even when no collision occurs.

## Why the obvious narrowing is unsound here

The tempting fix — "documentation changes are inert, exempt them" — is false in
this repository, and measurably so: **four registered gates read the handover
file `docs/state.md` as an input.** A docs-only commit can therefore change a
gate's verdict. Any exemption keyed on file type rather than on declared inputs
would be a guarantee the repository does not actually hold.

## Direction, not a design

Each gate declares the paths it reads. The binding envelope of a gate result is
the union of its declared inputs. A following commit whose diff touches nothing
in that envelope preserves the binding; one that touches it voids the result,
exactly as today.

Two consequences worth naming before anyone implements this:

1. The same declaration enables selective suite execution — the lever is shared
   with the verify-growth item filed alongside this one. One mechanism, two
   problems.
2. The declaration must be verified, not trusted. A gate that reads a path it
   did not declare has to fail, or the envelope is a lie and the binding is
   weaker than the one it replaced.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred — owned by a dedicated future design round, not this AFK block.
- **Rationale:** the item explicitly scopes itself as "Direction, not a design" — declaring per-gate input paths, verifying declarations rather than trusting them, and sharing the lever with the verify-growth item (`pipeline.verify-has-grown-to-269-suites-with-no-recorded-cost`, itself only partly accepted this same block for exactly the reason that its own part 3, selective-vs-full tiering, "trades away a real guarantee" and needs a PO-visible decision) are real architecture questions, not a same-session patch. Rushing an implementation here risks exactly the "envelope is a lie" failure mode the item itself warns against (consequence 2). This also touches the push/release gate chain directly, which is Critic-mandatory/Design-tier surface per MP-07 — not proportionate for an unattended AFK block to design and accept unilaterally.
- **Assignment (if accepted):** a future dedicated design session, paired with `pipeline.verify-has-grown-to-269-suites-with-no-recorded-cost` (shared mechanism: per-suite/per-gate declared inputs). Not folded into the 0.5.5 candidate.
- **Date:** 2026-08-16

### Update, 2026-08-17 — the dedicated design round happened; `docs/adr/0065-...md`, proposed

Found: the item's own proposed "envelope" shape doesn't actually work
(the union of 269 suites' inputs is nearly the whole tree; the commit that
motivated this item would still have voided the run). The real fix finishes
the already-tested per-suite declared-input mechanism in
`verify-resume.mjs`/`verify-journal.mjs` rather than inventing a new one —
full reasoning, evidence citations and an open PO question (cross-candidate
reuse for push/release-bound runs) in the ADR. `proposed`, not accepted —
awaiting PO review like ADR-0064.

### Update, 2026-08-17 (continued) — ADR-0065 accepted and candidate (a) implemented, Critic-passed

The PO returned and approved both proposed ADRs ("okay Freigabe für meine
Entscheidungen erteilt setze alles um"). `docs/adr/0065-...md` is now
`accepted`. Candidate (a) of its own Follow-up (break the three whole-tree
coupling sites in `verify-journal.mjs`/`verify-resume.mjs`, behaviour
provably unchanged) landed (`3580b41f`), independently re-verified with a
real double full `verify.mjs` run proving same-candidate reuse still works,
and passed a mandatory T1 Critic review together with ADR-0064's
implementation. Candidate (b) (Tier-B runtime-enforced narrowing, piloted on
one small non-spawning suite) is dispatched and in flight as
`NVA-ADR65B-1`. Candidate (c) (bulk narrowing of further suites) remains
not started. This item still stays open until (b) and (c) both land and this
gate's own binding is demonstrably cheap in the general case, not just for
one pilot suite.

### Progress, 2026-08-19

Candidate (b) confirmed landed (trailer `NVA-ADR65B-1`, several commits).
`NVA-BL-ADR65C-1` (goldfish-implementor, worktree-isolated) started
candidate (c): `recovery-preview-attestation-tests` promoted to a Tier-B
declared-input entry (the suite's module has zero imports of its own, so
its declared two files are provably its entire real input; no
`--allow-fs-write` needed). Commit `79a0aaba` (cherry-picked from the
dispatch's worktree, commit `7e067746`). 18/18 `verify-journal.test.mjs`,
13/13 `recovery-preview-attestation.test.mjs`.

**Still not "the general case"** — one more suite narrowed, ~264 remain
Tier A. The dispatch scanned and rejected 3 further candidates as not a
clean fit for the current pattern: `route-receipt-tests` (multi-file/JSON-config
dependency chain, needs its own declaration shape design) and
`afk-ledger-tests`/`state-budget-tests` (both write outside the repo tree
via `os.tmpdir()`, not a fit for the current scratch-clean Tier-B model
without a `--allow-fs-write` design extension). Item stays `open`.

### Progress, 2026-08-19 (continued, `NVA-W5-ADR65C-2`)

`control-catalog-schema-tests` promoted to a Tier-B declared-input entry:
`control-catalog-schema.mjs` has zero imports of its own (pure module, no
fs/child_process), and its test file imports only `node:assert/strict`
plus this one module — no fs, no child_process, no `os.tmpdir()` — so its
entire real input is these two files; no `--allow-fs-write` needed. Confirmed
live under the real Node `--permission` model with exactly the two declared
files (`--allow-fs-read` on each), no others. 19/19
`verify-journal.test.mjs`, 1/1 `control-catalog-schema.test.mjs`.

A repo-wide scan (all registered `*.test.mjs` suites with a 1:1 source
file) found 15 total zero-import-source candidates beyond the 3 already
promoted; of those, 11 remain unpromoted after this dispatch because
either the test file itself imports `node:fs` (`control-waiver-lifecycle-tests`,
`dispatch-policy-tests` — read fixtures from outside the two-file pattern)
or the source/test pair imports a second source module that itself is not
zero-import (`security-evidence-fixture-matrix-tests` pulls in
`security-evidence-evaluator.mjs`, which is not a clean fit — not
inspected further this dispatch) or were simply not reached given the
tool budget: `stack-run-outcome-tests`, `sdlc-run-graph-tests`,
`sdlc-efficiency-metrics-tests`, `check-ownership-tests`,
`parallel-dispatch-planner-tests`, `critic-packet-governance-tests`,
`backlog-dispatch-reference-tests`, `control-catalog-migration-tests`
each showed the same clean two-file, zero-fs/zero-cp shape as
`control-catalog-schema-tests` in the same scan and are good candidates
for the next dispatch in this series. Item stays `open`.

### Progress, 2026-08-25 (`AGY-SWEEP-every-gate-binds-whole-tree`)

Continuing the series with two more of the eight candidates named above:
`control-catalog-migration-tests` and `critic-packet-governance-tests`
promoted to Tier-B declared-input entries (commit `5313fcf6`) -- both
zero-import source/test pairs, confirmed live under a real
`node --permission --allow-fs-read=<src> --allow-fs-read=<test> <test>`
run against only their two declared files, no other grant needed.

Two of the eight (`check-ownership-tests`, `sdlc-efficiency-metrics-tests`)
were tried first and rejected: both pass the same live-permission check,
but their source pair lives under `harness/scripts/`, outside the plugin
tree, and `check-consumer-safe-paths.test.mjs` (AC-11) correctly fails a
`plugins/pipeline-core/` file (this table lives in
`plugins/pipeline-core/scripts/verify-journal.mjs`) naming a source-only
path outside that tree as consumer-unsafe. This is a real constraint on the
series, not specific to these two suites: **any future candidate whose
source file lives outside `plugins/pipeline-core/` cannot be added to this
table**, however clean its import shape, without first solving the
consumer-safe-paths conflict (e.g. a second, harness-only declared-input
table, or relocating `verify-journal.mjs`'s Tier-B lookup outside the
plugin tree) -- worth flagging explicitly for whoever designs candidate
(c)'s "general case" treatment, since `harness/scripts/*` suites
(`sdlc-run-graph-tests`, `sdlc-efficiency-metrics-tests`,
`check-ownership-tests`, `stack-run-outcome-tests` is actually under
`plugins/pipeline-core/lib/` and unaffected) are a meaningful fraction of
the remaining pool.

`parallel-dispatch-planner-tests` and `backlog-dispatch-reference-tests`
(both under `plugins/pipeline-core/lib/`, same clean import shape,
confirmed by import audit but not live-permission-tested this dispatch)
remain good candidates for the next one. Item stays `open` -- still not
"the general case": 6 suites now Tier B, roughly 262 remain Tier A, and the
harness-vs-plugin-tree boundary above is unresolved.

### Progress, 2026-08-29 (`NVA-W2-TIERBDECL`)

`parallel-dispatch-planner-tests` promoted to a Tier-B declared-input entry
(same shape again): `parallel-dispatch-planner.mjs` has zero imports of its
own, and its test file imports only `node:assert/strict` plus this one
module -- confirmed by a real
`node --permission --allow-fs-read=<src> --allow-fs-read=<test> <test>` run
(10/10 checks passed, no other grant). `verify-journal.test.mjs` still
passes unchanged (35/35), and
`harness/scripts/check-consumer-safe-paths.test.mjs` still passes (9/9)
since this table stays self-referencing inside `plugins/pipeline-core/`.
`backlog-dispatch-reference-tests` remains an unstarted candidate for the
next dispatch in this series. Item stays `open` -- still not "the general
case": 7 suites now Tier B, roughly 261 remain Tier A.
