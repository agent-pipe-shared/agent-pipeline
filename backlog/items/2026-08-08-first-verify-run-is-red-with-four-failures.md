---
schema: pipeline.backlog-item.v1
id: pipeline.first-verify-run-is-red-with-four-failures
type: defect
owner: pipeline
status: open
created: 2026-08-08
source: "The first end-to-end verify run this repository has completed in some time, obtained after repairing a duplicate suite registration the 0.5.3 merge introduced. 256 of 260 steps pass; four fail. All four are pre-existing and were invisible while the gate could not start."
---

# The verify gate is red: four failures, uncovered the moment the gate could run again

## Description

`node harness/scripts/verify.mjs`, run in a detached worktree at `b3901b1` with a
clean tree and an exact candidate binding:

- exit **1**
- **260** registered steps, **260** terminal receipts — no step skipped
- **256 passed, 4 failed**, 3 m 02 s
- run id `verify-1786142281528-629c486b0b030457`; the full journal with all 260
  receipts and logs is under `.git/agent-pipeline/verify/runs/<run id>/`

Before the repair the count was **zero suites started**:
`plugins/pipeline-core/lib/verify-resume.mjs:114` throws
`Verify suite registration is invalid` on the first repeated suite id, before
planning anything. The 0.5.3 merge had auto-merged `harness/scripts/verify.mjs`
without conflict and left one suite registered twice. The gate was not slow, flaky
or partially green — it refused to plan, and every dispatch in that period honestly
recorded "verify not run" without anyone knowing what it would have said.

**That is the framing this item asks for: these four are not new breakage. They are
what a gate that could not start had stopped reporting.**

## The four failures

### 1. `authority-tier-agreement-check` — the tiers disagree about a protected path

`TIER-DRIFT protectedTestPaths: tiers disagree`. The `project/` authority tier
carries **TP-1…TP-11**; the `.claude/` tier carries only **TP-1…TP-10**. TP-11 is
the rule protecting the origin-allowlist test.

**Why this one is first:** a protected-test-path rule whose presence depends on
which authority tier a project resolves to is a guard that exists or not by accident
of layout. A project on the legacy tier would have that test unprotected while its
own configuration claims the family is complete — and nothing else in the family
would notice, because each tier validates internally.

It also touches the machinery Sprint-Phoenix residual R1 depends on: R1's
outstanding acceptance criterion adds a row to that same list.

### 2. `product-capability-inventory-tests`

`HAW-A02 accepts an attested receipt and an honest inventory-phase pending gate`:
`assert.equal(validated(inventory()).ok, true)` received `false`
(`harness/scripts/check-product-capability-inventory.test.mjs:124`). `HAW-A00` and
`HAW-A01` pass, so the validator works and one specific admissible shape is being
rejected.

### 3. `security-scan-tests`

`gitleaks ignore: Nova A1 no longer carries commit-bound legacy fingerprints` —
expected an empty set, found **13** fingerprints still pinned at commit `9dd9c5b1`,
across `backlog/transitions.ndjson`, three `backlog/receipts/*.json` and several
`specs/sprint-nova-epic/evidence/backlog/*` files. Every other security-scan
assertion passes.

**Read this one carefully before triaging it:** the assertion is that stale
commit-bound ignore entries have been cleaned up. Entries that outlive the commit
they were pinned to are suppressions nobody is re-justifying.

### 4. `backlog-state-check`

`ledger event N: evidence.commit is not a reachable local Git commit`. A contiguous
block points at one episode (a rebase, a squashed branch, a re-created history)
rather than N independent mistakes, so it likely has a single explanation and a
single repair.

**Corrected 2026-08-08, and the correction changes the reading.** This section
first recorded the range as "events **14 through 38** — a contiguous run of 25".
Re-run directly (`node plugins/pipeline-core/scripts/check-backlog-state.mjs`,
exit 2, 39 findings): the range is **events 1 through 38** — *every* event in the
ledger up to 38, plus one separate finding
(`pipeline.first-verify-run-is-red-with-four-failures has no transition-ledger
entry`, the mirror case this item's own filing created).

The original figure supported "one episode somewhere in the middle of the
history". The measured figure does not: a block starting at event **1** is not an
episode inside the history, it is the whole inherited chain.

**Diagnosed 2026-08-08. The first hypothesis was wrong and is withdrawn.** It
guessed at the 0.5.3 ledger reconciliation (`reconcile-backlog-ledger.mjs
--activate`, `6a5331d`). Measurement refutes that:

- The 38 failing events reference **8 distinct commits**, all of them
  `baseline-migration`, `license-boundary-recovery`, `po-license-disposition`,
  `close-retro`, `sentinel-backlog-recovery`, `sentinel-scope-extension` and
  `sentinel-windows-containment` — the Sentinel era, not the 0.5.3 merge. The
  merge's own 30 events (`35d9e11`) resolve fine, as do all 137 later ones.
- **The decisive check is the date.** This repository's history begins with a root
  commit `4375585` of 2026-07-09, *"chore: initial snapshot — Agent-Pipeline
  v0.1.0"* — a snapshot that discarded whatever came before it. If the missing
  SHAs were a rewritten prefix of *this* lineage they would predate that snapshot.
  They do not: the events are dated **2026-07-20**, eleven days after it, and
  1561 commits of this history sit around them.

**So they are not a lost prefix of this history — they belong to a different
one.** This is the public-core share repository; the ledger's early
`evidence.commit` values are the SHAs of a parallel (private) lineage, carried
across by the export along with the file. They will never resolve here, and no
amount of repairing the ledger will make them.

**That reframes the repair from data to definition.** The question is not "how do
we fix 38 events" but "what does `evidence.commit` mean in a repository that was
exported rather than grown". Two shapes, neither chosen here:

1. **Re-anchor** each pre-export event to the corresponding public-core commit —
   requires that a 1:1 correspondence exists and can be established, which nobody
   has verified.
2. **Teach the checker the boundary** — pre-export evidence is unverifiable *by
   construction*, not broken, and should be reported as such rather than as a
   failure. This keeps the assertion meaningful for everything after the export,
   which is the part where a dangling reference is a real defect.

Option 2 is the honest one if no correspondence exists; option 1 is better if one
does. **Establishing whether the correspondence exists is the next step, and it is
a measurement, not a decision.**

**A consequence nobody had connected to this suite.** `backlog/index.json` and
`backlog/STATUS.md` are generator output, and the generator (`--write`) fails
closed on these findings before it projects anything. Both files are therefore
frozen at a stale state for as long as this failure stands — one red suite is
silently holding two artifacts hostage, and neither shows any sign of it.

## Why this is one item and not four

They share exactly one thing, and it is the thing worth recording: **all four became
visible in the same instant, because a single duplicated line had been suppressing
the entire gate.** Triaging them individually is right; filing them separately would
lose the fact that the repository ran without gate coverage and could not tell.

The failures themselves are unrelated and should get separate owners.

## Triggering situation

2026-08-08, immediately after the duplicate suite registration was removed under a
human-signed Guard Maintenance Window. The dispatch that ran the gate was explicitly
forbidden to repair, skip or weaken any failing suite, and did not.

## Affected artifact

`harness/scripts/check-product-capability-inventory.test.mjs:124`; the
`protectedTestPaths` lists in both authority tiers; the gitleaks ignore
configuration and the 13 files it pins; `backlog/transitions.ndjson` events 14–38.
The run journal is at `.git/agent-pipeline/verify/runs/verify-1786142281528-629c486b0b030457/`.

## Proposal

**Owner: PO**, for assignment. Four separate repairs, one shared precondition.

1. **Keep the gate runnable.** Whatever else is decided, the duplicate-registration
   class must not recur silently: `verify.mjs` auto-merged *cleanly* and produced an
   invalid registration. A pre-commit or CI check that the registration arrays
   contain no duplicate name and no missing file would have caught it in the merge
   commit. Cheap, and it protects every future merge of two Pipeline branches.
2. **Triage failure 1 first.** It is a guard-family defect, not a test defect, and it
   is adjacent to work in flight.
3. **Failures 2–4 need reading before they need fixing.** Each is a suite asserting
   that some cleanup has happened; a green result reached by relaxing the assertion
   would be worse than the red.
4. **Do not bundle these with the unregistered-suite question**
   (`backlog/items/2026-08-07-ruleset-source-test-unregistered-in-the-verify-gate.md`).
   That one asks what *should* be in the gate; this one is about what the gate says
   now. Answering them together invites registering more suites to dilute a red.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
