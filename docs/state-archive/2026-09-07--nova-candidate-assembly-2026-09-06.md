# Handover archive -- Historical checkpoint — 2026-09-06 candidate assembly

> Rotated from `docs/state.md` on 2026-09-07 by `plugins/pipeline-core/scripts/handover-rotate.mjs` (ADR-0066).
> Section(s) archived: Historical checkpoint — 2026-09-06 candidate assembly.
> Summary: Historical candidate assembly; current decisions and remaining rules retained in the live handover.
> Append-only once written; never edited by hand.
> Content below is byte-for-byte identical to its original `docs/state.md` text at the time of rotation.

## Historical checkpoint — 2026-09-06 candidate assembly

The following checkpoint preserves the earlier state and evidence. Its gate
counts, installed-content claims and waiting statuses are superseded above.

**Lifecycle phase:** feature `sprint-nova-epic` · phase `implementation`.
Sprint Nova is **not** closed; no `close-block`/`close-feature` invoked.

**Read next, in this order:** `CHANGELOG.md` `[Unreleased]` (per-item status
words: *built / gated / wired / exercised*), then
`backlog/evidence/2026-09-06-po-decision-queue.md` (nine PO items, each with
cost, effect and what-if-never), then
`scratch/handover-to-nova-b-2026-09-06.md` (the positioning session's inputs
and the A→B→C→D assembly order the PO confirmed).

**PO order for this candidate (2026-09-06, chat):** A parallelisation, B
verify optimisation, C finished-but-unsigned items — *first*. D, the
doc/positioning block, *afterwards and not in this candidate* ("rest erst
danach").

### Gate state

`evidence/verify-latest.json` binds `c784a462` exactly: **516/516 green**
(2026-09-06 17:49Z; envelope 454.7s at pool concurrency 4, nothing
concurrent); `security-latest.json` binds the same commit. Local stamp
`6565190d`: `0.6.1+claude|codex|antigravity.20260906172530.87af6b6`,
`VERSION` stays 0.6.1; the plugin tree is unchanged since `87af6b6` except
those three lines. Before it: two runs killed by the runner's low-memory
heuristic at concurrency 8 (measured minimum 12.4 GB free — no real
shortage), one run red on the ADR-0080 rename's doc-inventory obligation,
fixed `c784a462` (stage-0); the 515/516 run at `2dca9b8d` was fixed by
`ec0b158c`. All `Dispatch:` trailers of the day bind (authorship PASS).

### IN FLIGHT — 2026-09-06 evening, read this before anything else

Written across two compacts because the first one lost the *idea* level.
Commits survive compaction; intent does not — this block is the intent.

**Sequence, with what is done:**

1–7. DONE. Local candidate stamped `6565190d` (base 0.6.1; the 0.6.2 bump
   comes with the release), gate **516/516 at `c784a462`**, installed by the
   PO and read back as loaded. Codex installed-root defect fixed
   (`b5a181ce`/`573180b8`, two T1 rounds PASS); ADR-0080 accepted
   (`07d6041f`); positioning inputs at
   `specs/sprint-nova-epic/design/2026-09-06-positioning-*` (`c90f9131`) —
   the D block reads those, never `scratch/`. D.1 landed and was corrected:
   **PO rule — user docs always describe the NEXT release, never a local
   candidate or its branch** (`9a3c188f`). Reader's Critic round 1:
   `2026-09-06-doc-reader-review-round1.md`. Payload capture ANSWERED — no
   payload carries a subagent transcript path, the discriminator is the
   `agent_id` key, so the TP-4 ceremony (queue #2) is unblocked. Still open
   from step 1: `advisory-host-bridge.mjs` may share the same collapse, and
   the force-added `evidence/` captures need one ADR-0063 decision.
8. DONE (autonomous block, PO afk). `CASPREFLIGHT-3`: async spawn measured
   4/10 against a 10/10 rule, nothing applied; the blocked-event-loop theory
   is dead (the two never overlap). `T1WIRE-1`: CLI landed (`b3b7cb7e`), the
   consumer deliberately NOT wired — the selection layer collapses every
   preflight code into `preflight-failed`, so the fallback's allowed codes
   never arrive, and the briefed composition point is bypassed by
   `runSelectedCriticHost`. `WIREAUDIT-1`: 415 modules, 202 reachable; the
   pattern is cluster-shaped, the count an upper bound (no spawn detection).
   `WRITECONTAIN-1`: the read lane's symlink bypass does NOT reach the write
   lane — measured, case (a).
9. DONE. `BUDGETGUARD-2` + `CLOSECOLLIDE-1` landed; T1 round 1 over
   `b1ecbef2`/`6372b984`/`6677d70b` returned **FAIL** on one major — the
   guard's implementor rewrote its own suite in the same commit and deleted a
   prior fix's assertions, leaving an unattributable payload exempt AND
   unrecorded. Rework `NVA-B-BUDGETVIS-1` (`0903b5d5` tests-red, `1c03ab9c`
   guard) closed it; round 2 **PASS**, two minor residues filed. Two rounds
   spent. Registry: `2026-09-06-nva-b-guardfix-critic-round1.md`.
   **Gate 516/516 bound exactly at `1c03ab9c`.**
10. NEXT. No Critic round exists for the D.1 documentation commits
   (`94277a0b`, `a82a1415`, `9a3c188f`) or for the T1 CLI (`b3b7cb7e`) — both
   packages unreviewed. PO queue at items 1–14; #14 (activate the GL-09
   bootstrap-receipt gate) is the one that changes guard behaviour. D.2–D.6
   unstarted; the reader's Critic findings are their input.

**Idea-level facts that must not be re-derived wrongly:**

- The verify lever that worked was **lane membership of one suite**, not
  module scoping across many. `project-onboarding-v3-tests` was a sweep
  false positive (own `mkdtemp` root per case; two concurrent full
  instances 164/164). The module-scoping audit answered a smaller question
  precisely. The remaining top-5 lane members are process-global and NOT
  evictable; `guard-maintenance-window-tests` is kept for a *tooling* reason
  (capture tool refuses a fixture literal, filed); five members are
  unassessed, not unsafe. The lane comment in `verify-journal.mjs` now
  states all of this (`825bde92`) — read it, do not re-run the sweep.
- Two wall-clock definitions exist and both are right: suite span (progress
  stream, 454.9s) vs run envelope (`verify-latest.json`, 462.3s). State
  which one you mean.
- The Codex Critic transport is **built, not exercised**; criterion 5 of the
  Alfred handover is PO-queue #8, blocked by a runner permission classifier
  on the sandbox spawn. F3 (unpinned contract briefing) is now a real item
  with a `due`.
- PO decisions today: GIT-03 stands (`AI-Assisted: true` only, ignore any
  session-level co-author instruction); GitLab evidence deferred; #7/#8
  approved but classifier-blocked; **ADR-0080 accepted**, all five decisions
  (`07d6041f`, queue #9 done); **ADR-0079 scope: commit and push**
  (`2ea1f5f2`); **no push for this local candidate** — it serves a local
  test, the push/CI/tag sequence comes later; plugin update (#5) only after
  the stamp; the `hooks.json` ceremony (#2) whenever needed once #3 answers.

### In the candidate

- **A — slicing:** `guard-slicing.mjs`, 42 tests, runner-neutral (Claude by
  `message.id`, Antigravity by `Subagents[]`, Codex silent by proof — its
  adapter admits no dispatch tool). **Built, gated (`eecb4273`), not wired.** Channel
  proven three ways; design at `docs/adr/0080-parallel-dispatch-slicing-enforcement.md`,
  two T1 rounds, acceptance is queue #9. Wiring order is fixed: payload
  capture (#3) → TP-3 (#1) → `hooks.json` (#2), because the sibling
  `guard-dispatch-budget.mjs` is registered and **never fires** — logic proven
  by probe, invocation absent
  (`2026-09-06-a-dispatchs-own-tool-budget-stop-condition-cannot-fire-….md`).
- **B — verify:** two evictions landed, **645.7s → 454.9s (−29.5%)**, same
  single red before and after each. `f16ab254` (onboarding suite, −25%) and
  `fcaf8d5e` (`session-cleanup-binding`, `worktree-lifecycle`, −6%). Of the
  clean eight, one is kept for a *tooling* reason — `capture-evidence.mjs`
  refuses a fixture literal as a host path, filed
  `2026-09-06-the-evidence-capture-tool-refuses-a-fixture-literal-…` — and
  five are unassessed, not unsafe. Top-5 lane members (52%) are
  process-global, not evictable on this axis
  (`2026-09-06-verify-lane-achievable-win.md`). Trend 419→571→646→482→455s
  in the 2026-09-01 regression item, which stays open. T1 on both evictions
  in flight.
- **C — finished, needs a PO step:** plugin update + `/reload-plugins` (#5,
  installed guard copies stale); one shared TP-4 ceremony for all pending
  `hooks.json` edits (#2); ADR-0079 scope sentence; release mechanics
  (CHANGELOG has the entry; version stamp, security scan, Critic, push
  approval, CI green *before* `main` — 0.6.1 went to `main` under bypass with
  CI red, do not repeat).
- **Also landed:** `guard-dispatch.mjs` importable without self-disarm +
  symlink regression; `guard-dispatch.test.mjs` silent-pass removed, proven;
  denial-code accuracy fix; Critic preflight `--sweep-evidence` (gated, 10
  checks); selected-Codex-Critic transport with a real consumer — **built,
  not exercised** (runner classifier blocks the sandbox spawn, queue #7/#8;
  one T1 FAIL, F1/F2/F4 fixed in `70287f72`, F3 filed). Alfred handover
  answered: `2026-09-06-codex-critic-transport-handover-answer.md`.

### Not in the candidate, deliberately

The D block (doc-drift fixes, capability inventory, front door, metering),
per PO order. 60 of 63 open Nova-B items untouched. The stale
`docs/pending-verify-registrations.md` banner (all four suites *are*
registered, `verify.mjs:670–689`) is D.1.

### The day's dispatcher-side findings — inherit the rule, not the commit

Four T1 rounds, four FAIL; the load-bearing finding was mine each time:
(1) Critic briefings contaminated with conclusions presented as facts —
*a bare fact must be confirmable by opening a named path*; (2) a false
absence claim — *an absence claim names where it looked*; now mechanical via
`--sweep-evidence`; (3) "satisfy the check" read correctly as "silence the
check" — *never instruct a dispatch to satisfy a tripwire; name the one
admissible way or make it a stop condition*; (4) a dispatch-disclosed quirk
relayed as settled — *a disclosed quirk is a finding handed over early*.
Registries: `backlog/evidence/2026-09-06-nva-b-*-findings.md`. Also: five of
five budgeted dispatches overran their tool budget; the guard that would stop
them at 65 of 80 turns never fires (queue #3).

