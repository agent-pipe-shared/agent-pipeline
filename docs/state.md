# Project state — Agent-Pipeline

> Canonical operational handover for this repository. It contains public
> repository state only; durable decisions remain in the ADR register.

## Archived history

| Date range | Summary | Archive |
|---|---|---|
| 2026-09-01 | The 2026-08-31 interim-release handover: the 0.6.0 candidate pushed to nova and stopped one step short of main, the nine ordered PO terminal actions, the privacy sweep disposition, and the carried-forward open questions. Extraction pass performed first and recorded in the survey behind commit 53262b1d; its homeless durable rules and still-live carry-forwards were re-stated in the 2026-09-01 handover. | [docs/state-archive/2026-09-01--current-handover-0-6-0-is-an-interim-release-nova-b-continue.md](state-archive/2026-09-01--current-handover-0-6-0-is-an-interim-release-nova-b-continue.md) |
| 2026-08-25 to 2026-08-26 | The 2026-08-25/26 chat-gate-ceremony standardization block: AGY-HGOFIX-2/3, the four chat-gate regressions and their closure, the Agent-tool worktree-isolation incident, the 17-agent AFK sweep and its reconciliation, and the 2026-08-26 sprint_agy push. Extraction pass performed first: every durable rule in it already lives in CLAUDE.md or its own backlog item; the single carry-forward with no home (GWM has no chat-mode activation path) was moved into the current handover before rotation. | [docs/state-archive/2026-09-01--chat-gate-standardization-and-afk-sweep.md](state-archive/2026-09-01--chat-gate-standardization-and-afk-sweep.md) |
| 2026-08-23 | The Phoenix-line pointer block: a preamble stating that Nova became the authoritative line and that Phoenix's own checkpoints 61-71 are history. Its content was already archived separately and indexed; the block itself carried no live carry-forward. | [docs/state-archive/2026-09-01--phoenix-line-pointer-block.md](state-archive/2026-09-01--phoenix-line-pointer-block.md) |
| 2026-08-31 | The CI release blocker: diagnosis, the measured repair at ed491309, the PO decision to repair rather than bypass, and the inverted push-before-CI sequencing. Its live carry-forwards were extracted into the 2026-08-31 release handover before rotation. | [docs/state-archive/2026-08-31--ci-release-blocker-diagnosed-and-repaired.md](state-archive/2026-08-31--ci-release-blocker-diagnosed-and-repaired.md) |
| 2026-08-31 | The 2026-08-30 block: the 6a93fec2 candidate stamp at 501/503, the six closed retrospective follow-up items, ADR-0076, and the unapproved emergency push of both branches. Its two live carry-forwards -- retro items 7 and 8 deferred to Nova B, and the unresolved Critic FAIL on the sandbox quickfix -- were extracted into the 2026-08-31 handover first. | [docs/state-archive/2026-08-31--prior-current-handover-nova-0-6-0-local-candidate-stamped-re.md](state-archive/2026-08-31--prior-current-handover-nova-0-6-0-local-candidate-stamped-re.md) |
| 2026-08-31 | The 2026-08-28 three-runner greenfield block: rounds A-U2, the ready-gate blocker T, the 2+2 Critic round, and the candidate's state on the night of 2026-08-28/29. Its still-live carry-forward items were extracted into the 2026-08-31 handover before rotation. | [docs/state-archive/2026-08-31--prior-current-handover-the-three-runner-greenfield-findings-.md](state-archive/2026-08-31--prior-current-handover-the-three-runner-greenfield-findings-.md) |
| 2026-08-28 | Ledger merge across parallel sprints (ADR-0068), ADR renumbering at acceptance (ADR-0069), and the first handover rotation; its four live open items -- ADR collision 0063, the unregistered check-adr-consistency, BS25/BS26 durability, and the Nova A candidate list -- are carried forward to the current handover. | [docs/state-archive/2026-08-28--earlier-handover-ledger-merge-capability-adr-renumbering-han.md](state-archive/2026-08-28--earlier-handover-ledger-merge-capability-adr-renumbering-han.md) |
| 2026-08-28 | Verify green 471/471 in one run at candidate 5fd963fc; EP07 tree-dirtying cause named and fixed; +build stamp convention restored; AK-5 closed, AK-6 ready to re-dispatch; the open 0.6.0 combined-release decision carried forward to the current handover. | [docs/state-archive/2026-08-28--prior-handover-verify-is-green-in-one-run-candidate-0-6-0-lo.md](state-archive/2026-08-28--prior-handover-verify-is-green-in-one-run-candidate-0-6-0-lo.md) |
| 2026-08-27 | sprint_agy fetch, fast-forward, and the 2026-08-26 clean local candidate | [docs/state-archive/2026-08-27--prior-handover-sprint-agy-fetch-fast-forward-and-clean-local.md](state-archive/2026-08-27--prior-handover-sprint-agy-fetch-fast-forward-and-clean-local.md) |
| 2026-08-19 through 2026-08-23 | Phoenix-line checkpoints 61-71 (2026-08-19 through 2026-08-23), preserved verbatim as history after the Nova merge made the Nova line authoritative. | [docs/state-archive/2026-08-27--phoenix-checkpoints-61-71.md](state-archive/2026-08-27--phoenix-checkpoints-61-71.md) |
| through 2026-08-19 | First real rotation: everything from the 2026-08-08 restart checkpoint through the inherited Nova/Cyborg-release history and every older era down to the open-items tail — extraction pass completed first (original pre-rotation line range 4977–19155; see the archive file's own provenance section and the ADR-0064 addendum dated 2026-08-19) | [state-archive/2026-08-19--pre-restart-and-nova-inherited-history.md](state-archive/2026-08-19--pre-restart-and-nova-inherited-history.md) |
| 2026-08-11 to 2026-08-19 | Checkpoints 1-60 (2026-08-11 through 2026-08-19 checkpoint 60): superseded session narrative; durable decisions already live in ADRs/backlog/guardrails per this repo's own standing convention, not uniquely in this prose. | [docs/state-archive/2026-08-19--checkpoints-1-through-60.md](state-archive/2026-08-19--checkpoints-1-through-60.md) |
| 2026-08-26 | 2026-08-25 Antigravity chat-gate-ceremony standardization, verify-tuner stage 2 acceptance, sprint-agy-runner delta4 Critic fix and candidate status | [docs/state-archive/2026-08-26--agy-runner-2026-08-25-handover.md](state-archive/2026-08-26--agy-runner-2026-08-25-handover.md) |

## Current handover — 2026-09-01: the autonomous Nova B block

PO mandate for the day: work items needing no PO interaction until ~17:00, then
freeze, verify, and hand back a push-ready HEAD. Sprint Nova is **not** closed —
the release is being run as a handover event, not a lifecycle close. No
`close-block` and no `close-feature` have been invoked, deliberately.

### Where the release stands

0.6.0 is pushed to `nova` and stopped one step short of `main`. Verified
directly: no local `main`, `remotes/origin/stable` still present, no `v0.6*`
tag. **None of the nine ordered PO terminal actions has landed** — marketplace
re-sync, verify + `push-prepare`, the `nova` signature, the CI loop, the `main`
signature, tag + release, deleting `stable`, creating the release-tag ruleset,
and the TP-5/TP-3 maintenance window, in that order.

Two operational warnings belong with that list, because neither has a home
outside this file:

- `push-prepare`'s printed `authorize-critical` command carries an
  `--expires-at` window. Re-run `push-prepare` immediately before signing;
  never reuse an earlier printout. `docs/push-release-flow.md` documents the
  field's parsing behaviour but not this warning.
- The maintenance window's scope has grown beyond the TP-5 release-adapter
  carve-out: it now also owes four suite registrations and the promotion of
  `check-suite-registration.mjs` itself to a gate step. All TP-3.

### The day's work

**Landed:** `GIT-10`, the backlog-state-checker discipline, corrected after
review (`6c9f581f`, `1c2d2681`); a per-session trim of repeated grammar denials
(`1314edec`) and its per-subagent re-keying (`15bb3599`); `effort` added to two
dispatch-record field enumerations (`6ce146f4`, `601dc035`); the copy-safe
renderer's wrap point no longer splits a path (`6ea2add3`) with its pin
strengthened after review (`e2b8afa1`); handover-size enforcement at the commit
boundary (`54fb5006`) with its blob-size read repaired after review
(`7bca7f5d`). Vendored canon regenerated four times by hand — every canon
dispatch is forbidden to touch `plugins/pipeline-core/**`, so the obligation
falls to the Elephant and skipping it reproduces a red gate.

**Nine Critic rounds.** Caught before shipping: a guardrail stating a trigger
the code does not implement; an ADR asserting an enforcement the guard does not
perform; a calibration path that commits while reporting failure; a
push-approval-gate bypass; a guardrail presenting an accepted DRIFT baseline
that in fact contains a live open defect; a size check that reads a blob's full
content through a 1 MiB pipe and so blocks the very shrink it tells the reader
to perform; and a test pin whose concatenated assertion masks a per-renderer
regression.

**Twelve items filed**, each from measurement. Beyond today: a Critic has no
writable location for its own report, so findings survive only by
hand-transcription; the `advisor` prohibition in briefings is unenforced; ledger
event 403 stores an abbreviated OID the hash chain blocks repairing in place;
and the push-authority surface cannot be bounded by static enumeration — a
114-file import closure was refuted by a `join()`-built spawn a `new URL(...)`
regex cannot see.

One filed item records a **refutation**, not a defect: the hypothesis that an
onboarding test depends on a clean outer working tree was measured directly and
did not hold. It is filed so the question is not silently re-asked.

### Recurring dispatcher errors, recorded because they recurred

- **Contaminated Critic input, four rounds.** The implementor's dispatch record
  embeds completion-report prose. Every round quarantined it and re-derived from
  source. Remedy applied on the last round only: hand an authorship-only
  projection (`taskId`, `agentType`, `dispatcher`, `commits`).
- **Freehand dispatch briefings.** Two dispatches were built without filling
  `critic-review.md` / `goldfish-task.md` and were refused by `guard-dispatch`.
  The guard caught what the rule already forbids.
- **A half-applied re-verification.** A rework was briefed after checking only
  one of the two homes a rule could have landed in. It had landed in the other.
- **An overstatement to the PO**, caught by a Critic: two findings were relayed
  as independent when they are in tension.
- **Three `maxTurns` cliffs.** Dispatches were cut off at their harness limit
  mid-work. Briefed tool budgets are behaviour rules; `maxTurns` is a real cliff.

### Durable rules carried forward — these have no other home

Extracted from the 2026-08-31 section before its rotation. Each was searched for
in `CLAUDE.md`, `docs/adr/`, `guardrails/` and `backlog/items/` and found in
none of them.

1. **The corrected release sequence:** all commits → security scan → full verify
   → Critic on the final candidate → signature ceremony → push the feature
   branch → CI against the pushed ref → `main`, tag, release. The
   version-manifest stamp belongs in the pre-verify batch, not after the Critic.
   `docs/push-release-flow.md` documents which layer runs as whom, never this
   ordering.
2. **`git push --no-verify` deliberately remains available** as git's own escape
   route (PO instruction), and **no retroactive `approve-push` record is created
   for a push that had none at execution time** — that is exactly the shape
   `approve-push` exists to prevent. This sits in unresolved tension with
   `guardrails/git.md` GG-17, which states the opposite as a guard-enforced MUST
   NOT with no carve-out. The tension itself is unrecorded and needs a PO
   decision.
3. **A `resume-hint` receipt proves only that a card's bytes were read**, never
   that they were understood or acted on — and a `--resume` restart preserves
   the session id, so capture-then-consumption under one session id is
   externally indistinguishable from the false re-grounding case the checker
   exists to catch.
4. **"GS-6" does not resolve.** The rule cited under that id — a
   mutation-adjacent action inside a repository the agent may not write outside
   of is a human-only step — has no text anywhere in `guardrails/`, `CLAUDE.md`
   or `docs/adr/`. Either the id is stale or the rule was never given a home.

### Still-live open questions carried forward

Each was checked against `backlog/STATUS.md` and the git log; where liveness
could not be positively established, that is said rather than glossed.

- `project-onboarding-v3-tests` fails in CI and is **not explained**; its only
  local failure is an unrelated slow-mount hang.
- Four defects re-verified as still present sit in terminal `deferred` status,
  invisible to every mechanical sprint-gate check.
- The privacy sweep FAIL is disposed of as disclosed-unremediated; both findings
  (contract drift, a sign-off bound to a superseded candidate) remain open. A
  privacy re-review covering the current candidate is recommended after the
  freeze and would resolve both.
- GWM has no chat-mode activation path. **No item was ever filed** for this.
- AK-6 is recorded as ready to re-dispatch against
  `pipeline-user-v3.schema.json`. Nothing shows it ran; liveness established
  only by absence of evidence — the weakest entry here.
- The standing Nova authorization in Spec §8 to lift TP-1/TP-3/TP-5 for an exact
  task **cannot be honoured**: `guard-testpath` reads `gates.push_approval`,
  this repo is `signature`, and that mode has no in-session activation step.
  Recorded only here; no filed item.
- BS25/BS26 durability: three positional ledger lookups remain in
  `backlog-state.mjs`; two can bind by `entryHash`, `amendsSequence` needs an
  additive `amendsEntryHash`. The cited line numbers were not re-verified.
- Two of the four documented reasons for `security: off` are stale; what
  actually blocks is the v2 verdict's three offending required capabilities plus
  a license allowlist resolving only inside this repository. No filed item.
- Codex restarts: whether `codex resume` re-reads `.codex/*` is **unmeasured**.
  Measure before changing any instruction.
- The sibling defect shape — a change to A creates an obligation at B, revealed
  only by a later gate run — is still unfiled as a general pattern.
- Also live, established by keyword search only: the PO's acceptance-bar
  question ("nothing forces the authoring step"); retrospective follow-up items
  #7 and #8, deferred to Nova B; the sandbox-quickfix Critic FAIL (1 major, 1
  minor) left unresolved; the `f7ab9b42`/NVA-DOC060 gap with no independent
  Critic review; and the two open NVA-CIVERIFY questions.

Dropped on rotation as genuinely resolved: the Antigravity hard-enforcement
layer's two fail-open paths, closed by `ab347a74`, which built the self-check
the item's own proposal named.

### Owed, not started

- An **ADR and register entry** for the marketplace-attestation narrowing
  decision (EL-04). Not written today on purpose: the decision stands, but its
  implementation route was refuted this session, and an ADR whose mechanism is
  known broken would record a plan nobody can follow. The refutation is filed as
  its own item; the ADR waits for a workable enumeration.
- The authorship-only dispatch-record projection, applied once by hand, is not
  yet a mechanism.

## Operational head

- Project calibration: [`project/pipeline.json`](../project/pipeline.json).
- Required gate: `node harness/scripts/verify.mjs`.
- Formal decisions: [`docs/adr/README.md`](adr/README.md); no state-local
  override is active.
- No reusable full-bootstrap receipt is stored publicly; run the full
  bootstrap. Machine-local installation details and private receipts are not
  versioned here.
- Active Sentinel authority and retention are governed by
  `governance/spec-retention.json` and the linked recovery package; no
  completion or go-live claim is made by this handover.
- Nova B is the active line of work; 0.6.0 ships as an interim release.

### Sentinel Links

Retained per `backlog/items/2026-07-20-spec-retention-on-close.md`,
enforced by `governance/spec-retention.json` + `check-spec-retention.mjs` —
keep linking all seven; do not prune (note carried over from the Phoenix
line's own checkpoint 71).

- specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md
- specs/2026-07-19-sprint-sentinel-epic/spec.md
- specs/2026-07-19-sprint-sentinel-epic/backlog-acceptance-matrix.md
- specs/2026-07-19-sprint-sentinel-epic/public-private-reconciliation-design.md
- specs/2026-07-19-sprint-sentinel-epic/RECOVERY.md
- specs/2026-07-19-sprint-sentinel-epic/platform-support-contract.md
- specs/2026-07-19-sprint-sentinel-epic/windows-blockers-scope.md

