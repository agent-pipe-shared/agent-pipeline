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

## Current handover — Alfred clone: sprint-alfred-epic opened in design (2026-08-27, evening)

**READ THIS FIRST on the `feat/sprint-alfred` branch.** This clone switched its
machine state from the inherited `sprint-nova-epic` to **`sprint-alfred-epic`**
(phase `design`, `planApproved: false`) on PO release: `discard-feature --by
APS` (Nova continues in its own repo; the discard is an honest abandonment
record on this branch only, `discardedFeatures[0]`), then `set-feature`.
Base `a50c8093`; state transition committed as `0d0031ea`.

**The switch exposed two control-integrity defects, both filed with
`sprint: alfred` (commit `f8431081`, ledger `ef9fa2f7`):**

1. *A closed Result can be amended after close with no detection and no
   repair* — the 0.4.7-hotfix Result was amended by `d545ae4a` ten hours after
   its close; the Phoenix merge carried the drifted bytes here; an active
   continuity masked the pin mismatch for four weeks; the discard unmasked it
   as `continuity-damaged` with `plan-repair` honestly answering
   `continuity_repair_unavailable`. PO repaired by restoring the closed bytes
   (`git checkout d545ae4a^ -- specs/2026-07-27-agent-pipeline-0.4.7-hotfix/result.md`,
   committed `c3a9e203`). The amendment text (owner + 2026-08-31 review date
   for the #21 worker-pool gap) survives in `d545ae4a` and still needs a
   legitimate home in that backlog item.
2. *`discard-feature` writes a state shape `observeSessionCleanupState`
   rejects* — readiness `partial`, `guard-lifecycle-ready` then blocks every
   tool call including the `set-feature` that exits the condition;
   `plan-human-recovery` offers only non-mutating candidates. Escape: the PO
   ran `set-feature` in their own shell. Line-verified root cause in the item.

**Session facts:** pipeline 0.6.0+claude.20260827181725.5071b04
(local-development), onboarding `ready`/continuity `valid` re-verified after
the switch. Pre-push hook installed in this clone (untracked, `.git/hooks`).
PO trust anchor verified byte-identical to the configured
`local-po-key` (`2de20a39…`) — nothing to add. Push target later:
`git push -u origin feat/sprint-alfred:sprint_alfred`; rebase onto
`origin/main` only after Nova lands there, before implementation.

**Design phase is running under an explicit PO go** (2026-08-27, ahead of
Nova/Phoenix go-live — a deliberate PO decision deviating from ADR-0043's
"once Phoenix and Nova are live" ordering for the *design* work only; the
implementation start stays gated on the Nova rebase). Session model: Fable 5 at
effort `max`, PO-set for the design phase — the MP-01 named session exception;
the PO announced the one sanctioned gate switch to a cheaper configuration at
the PRD gate ("Haltepunkt"). Deliverable under construction:
`specs/sprint-alfred-epic/` (PRD, spec, acceptance, design analyses) from the 9
`sprint:alfred` GitHub issues (#99 #101–#106 #108 #109), 24 open
`sprint: alfred` backlog items, and external research — ≥1 independent Critic
round per design document before the PO gate. Known intake conflicts needing a
PO word at the gate: two items whose frontmatter says `alfred` but whose own
Triage prose says Nightwing (`2026-08-12-stale-checkout…`,
`2026-08-08-the-bootstrap-skill-grows…`), and
`2026-07-25-managed-onboarding-success-contract` (deferred, Alfred per this
branch's triage, Nova/general per the Phoenix-line cross-triage).
`#108`'s entry condition `#100` (P0, fail-closed push-approval absence) is
still OPEN on GitHub — tracked as an entry condition, outside Alfred.

**Design package + review round 1 (2026-08-27, late evening):** package
committed — intake analyses `74e5a4d4` (po-input, issue-intake,
backlog-intake, external-research), PRD/spec/acceptance `584acbda`, issue
snapshot + authoring record `56cda4c7`. Round-1 Critic reviews: 1A intakes
(claude-sonnet-5 at max) **PASS**, 2 minor findings; 1B PRD/spec/acceptance
(claude-opus-5 at max, ARCHITECTURE functional-equivalent lane) **FAIL**, 3
major + 7 minor. Every finding fixed or dispositioned in **`ea392b28`**
(PRD spec-sha256 marker recomputed, now `e57a2d1f…3223`); verbatim reports,
the neutral findings registry, and the disposition map persisted under
`specs/sprint-alfred-epic/evidence/critic/` (`007f9669`). Two further
process defects filed from the round (`553e43d7`, ledger `c2f3eeed`):
critic scratch-note persistence is structurally unavailable (defeats
CR-06-D truncation recovery), and no sanctioned `Dispatch:` trailer form
exists for direct Elephant design-phase commits. **Round 2** (delta
re-review per template item 4, claude-opus-5 at max, candidate `ea392b28`,
registry as neutral input): **FAIL** — 11/13 invariants resolved, but the
round-1 B-F3 fix had substituted a route the generated obligations doc rules
out for plugin source (`author-repair-required`, stop condition) — new major
R2-F1, plus three minors. Fixed in **`03d97ac5`** (TP-4 `$comment` edit
redesigned as a PO-performed act, pointer declared non-load-bearing with a
typed A2 residual when deferred; §B header re-dated; authoring-record fact
made evergreen; marker recomputed `4133223e…a503b6`). Round-2
report/registry/response persisted beside round 1. **Round 3** (delta,
claude-opus-5 at max, candidate `03d97ac5`, invariants R2-F1/R2-F2/R2-F4 +
marker; R2-F3 = standing trailer disposition, excluded) dispatched.

**Post-compact observation (extra evidence for defect 2 above):** after a
`/compact`, the SessionStart reground classifier reported
`PCR-CONTINUITY-MISSING` with `workResumptionAllowed: false` and
`dispatchEligibility CS-INVALID` against a state the live observers accept
(`inspect --intent session`: active feature, phase `design`, lifecycle
`draft`, `PLAN-LIFECYCLE-CURRENT`) — same root class (observer coverage of
the discarded→fresh-design shape), new surface (post-compact reground).
Recorded here instead of editing the committed item, to avoid ledger DRIFT
noise; fold into the item at its next legitimate touch.

**Round 4 (final): PASS**, scoped to `0181fe4b` — both invariants resolved;
the design-review cycle is closed at 4/4 rounds (cycle table + reviewed-
surface statement: `evidence/critic/round-4-response.md`, commit
`3f2fcb31`). Every design-authored document byte at head is Critic-reviewed.

**Road to submit-plan (three more measured lifecycle gaps, evening):**
(1) `PO-PROFILE-RECEIPT-INVALID` — the machine-local receipt never survives
a clone; republished via the typed route `setup.mjs --publish-po-profile`.
(2) `PLAN-SUBMIT-CONTINUITY-INVALID` — `set-feature` leaves no continuity;
bridged per the Phoenix-documented two-step workflow with `continuity-init`
(revision 0, design shape, authority bound to current PRD/spec digests;
state commit `ffb096a7`). (3) Items filed for both gap classes plus the
clone-provisioning class: `516a9392`, ledger `9b16de71`.
`submit-plan` now stops exactly at the intended PO gate:
**`PO-GATE-PRD-ACKNOWLEDGEMENT-MISSING`** — the PRD needs the PO's
acknowledgement marker `<!-- po-plan-acknowledged:
content-sound-and-spec-consistent -->` exactly once, a PO judgment no agent
may fabricate.

**Next (Haltepunkt presented, awaiting the PO):** 1. PO reviews the PRD
(EL-19) and answers PRD §9's five decisions; 2. on the PO's word, the
acknowledgement marker line is added to the PRD and committed; 3.
`pipeline-state.mjs submit-plan --by Elephant --profile epic` (rebinds
continuity authority to the acknowledged bytes itself); 4. PO approval
(`approve-plan`) and the MP-01 gate switch away from Fable-max. Standing
gate-visible items: the Dispatch-trailer canon gap (disposition in
`evidence/critic/round-1-response.md`) and the four defect items filed
today.

## Prior handover — 2026-09-01/02: the autonomous Nova B block

**Lifecycle phase:** feature `sprint-nova-epic` · phase `implementation`

PO mandate for the day: work items needing no PO interaction until ~17:00, then
freeze, verify, and hand back a push-ready HEAD. Sprint Nova is **not** closed —
the release is being run as a handover event, not a lifecycle close. No
`close-block` and no `close-feature` have been invoked, deliberately.

### Where the release stands — interim update, 2026-09-01 evening

**The version moved from 0.6.0 to 0.6.1 mid-evening. This is deliberate, not
scope creep.** 0.6.0 was stripped of its build cachebuster for release
(`9aa4c7ca`); once that landed, a local plugin reload became a silent no-op —
the registry keys its install directory on the version string, and an
unchanged string installs nothing. The PO needed the rebase-authority fix
(below) to actually reach a running session, which is only possible under
review, so the version moved forward and the cachebuster returned (`63fe8b64`).
0.6.0 as a distinct release is superseded by this decision, not completed.

**What landed, in order:**
- `feat/sprint-nova-codex-v046` is pushed and signed at `266d691f`
  (`56e91858..266d691f`), verified 505/505, security CLEAN. This is real and
  durable regardless of what happens to `main` tonight.
- A second, separate signature was obtained and verified for `refs/heads/main`
  at `1e025ed5`, but the push was **refused server-side** by GitHub's own
  ruleset on `main` (`GH013`, `required_status_checks` on context `verify`) —
  not by anything in this repository. The approval record is committed anyway
  (`a801e0fd`): the approval was genuinely given and verified; the ruleset,
  not the approval, is what stopped the push. `main` needs a fresh ceremony
  once CI is green, because the candidate will have moved.
- The CI failures are diagnosed and fixed. See the next section.
- The rebase work package, transcribed in full into
  `backlog/items/2026-09-01-an-authorized-rebase-demands-a-fresh-po-signature-after-every-conflict.md`,
  is built and has had its mandatory T1 round. See the next section.

### The overnight block, 2026-09-01/02 — what was built and what it cost

**The CI diagnosis, and it was not what it looked like.** Three suites were red
in run `33551001455` on `266d691f`. The decisive environment axis is neither
`PATH` nor `HOME` nor the spaces in a fixture directory name — an outside
analysis proposed the last of these twice and it is refuted by the suite
passing locally 158/158 with that identical name. It is the filesystem behind
`TMPDIR`. `applyProjectOnboardingManifestRepair`'s rollback decided ownership
of the file it deletes by `{dev, ino}` alone; ext4 reallocates the lowest free
inode in the block group, so a file created immediately after an `unlink`
commonly inherits the freed number, while tmpfs draws from a monotonic counter
and never reuses one. Local `/tmp` is tmpfs, the runner's is ext4. Fixed at
`9a7c309b` with a deterministic reuse-injection test. `onboarding-init-tests`
had a different cause — the suite isolated `HOME` but not `PATH` and was
asserting a property of the host — fixed at `8db2c988`.
`codex-onboarding-capabilities-tests` is **intermittent**: red once and green
once on the same commit, green locally in four environments. Unresolved, with a
filed candidate cause (`pipeline.inode-identity-decides-deletion-in-a-second-rollback-path`).

**The rebase authority is built and reviewed.** `95f16466` is the resolver:
authority read only from `orig-head`, never from the partially replayed working
tree, with every binding Requirement 1 names. `103463a3` wires it in and
`2f59b2bd` narrows an over-refusal found while wiring. All fourteen test cases —
five positive, seven negative, two from Requirement 5 — are real guard-level
tests against a genuinely conflicted rebase fixture, none dependency-injection
only. The T1 round found nothing in the mechanism: the relief sits at the final
verdict so it can only turn a block into an allow, and Requirement 4 is enforced
by absence from an allowlist rather than by a second list that can drift.

**Requirement 5 is a PO decision taken during the block** and is the reason the
package is usable at all: the authority is never opt-in, and every denial during
an active rebase names the route forward in its own text. Its carrier had to
split (`b5937a09`) — `pipeline.guard-retry-actions.v1` admits read-only
diagnostics only, so the mutating continuation rides as data and prose while
`retryActions` carries the read-only diagnostics that let a session see its own
conflict surface. Widening that envelope for convenience was rejected.

**Four Critic rounds ran (K, L, M, N).** Their measuring stick is tracked at
`backlog/evidence/2026-09-02-critic-rounds-k-to-n-index.md` — this was itself a
finding: gate-cited evidence had been living in gitignored `scratch/`, and a
green artifact was overwritten in place by a later red re-run, leaving a true
claim unsupportable. Findings closed across `3f92cae8`, `41dd0d8e`, `b90640c2`,
`7eb9192c`, `97d24673`, `9284f4b8`.

**One finding was a bypass this block itself introduced**, and it is the reason
to keep running these rounds: the `--exec` payload table keyed on exact literal
spellings sitting behind a verb that yields no other candidates, so
`git rebase --exe '<write command>'` produced no candidate at all. Measured with
real git 2.53.0 — `--exe`, `--ex`, `--exe=`, `--ex=` all execute the payload.
Fixed at `41dd0d8e` by inverting the table: the *safe* options are enumerated, so
an unknown one fails closed.

**None of the nine originally-ordered PO terminal actions for the 0.6.0
release plan has completed as originally scoped** — the plan itself has
changed. Original list, for continuity: marketplace re-sync (done), verify +
`push-prepare` (done, superseded twice by re-verification), the feature-branch
signature (done), the CI loop (in progress, red, being fixed), the `main`
signature (done once, push refused, will need repeating), tag + release
(blocked on `main`), deleting `stable`, creating the release-tag ruleset, and
the TP-5/TP-3 maintenance window.

Two operational warnings belong with that list, because neither has a home
outside this file:

- `push-prepare`'s printed `authorize-critical` command carries an
  `--expires-at` window. Re-run `push-prepare` immediately before signing;
  never reuse an earlier printout. `docs/push-release-flow.md` documents the
  field's parsing behaviour but not this warning.
- The maintenance window owes four suite registrations plus the promotion of
  `check-suite-registration.mjs` itself to a gate step. All TP-3 — editing
  `harness/scripts/verify.mjs`, for which no in-session override exists in
  signature mode. **A "TP-5 release-adapter carve-out" was carried in this
  file's predecessor and in several session summaries; it could not be
  substantiated on 2026-09-01.** No backlog item names it, the TP-5 window item
  is closed, and the TP-3/4/5/6/7 restoration item is closed with the rules
  confirmed `armed`. Treat TP-5 as owing nothing until something re-establishes
  it. All four unregistered suites were measured green standalone the same day,
  so the gap is that the gate does not re-run them, not that the behaviour is
  unverified — and the guards themselves are armed regardless of whether their
  suites are registered.

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

### What the PO owes this candidate — two signatures, in this order

Both are structurally closed to an agent. Nothing else in the release sequence
is waiting on a human.

1. **A human-guard override to register one suite in `harness/scripts/verify.mjs`.**
   `plugins/pipeline-core/lib/rebase-authority.test.mjs` exists, is green, and
   is not in the gate, so no CI or stop-hook run executes it. The line is
   `  { name: "rebase-authority-tests", file: join(libDir, "rebase-authority.test.mjs") },`.
   `verify.mjs` is TP-3 with no in-session override in signature mode. Seed the
   request with the exact intended Edit, build `plan`/`prepare-authorization`
   from that same request digest, and consume the signature the moment it
   arrives — no other tree mutation in between, or the bound `statusSha256`
   drifts and the signature is burned for nothing.
2. **The push approval for the candidate**, after the gates have run on it.
   `main`'s ruleset requires a green `verify` status check, so CI must be green
   on the pushed commit first; the previous attempt was refused server-side with
   `GH013` and cost a signature.

Two consequences of the release itself, worth stating so they are not
rediscovered: the build cachebuster is stripped when the tag is cut (the
convention and its cost are in `docs/claude-local-plugin-development.md`), and
installing the released `0.6.1` is what finally puts tonight's guard fixes into
the copy that actually executes. Two Critic rounds recorded that gap — the fixes
live in this checkout, not in the running plugin — and the release closes it.

### At the freeze — what the PO decides

- **Seven local commits carry no recognised `AI-Assisted: true`.** Git's trailer
  parser needs a blank line before the trailer block and none inside it; the
  hand-composed stage-0 messages get one of those two right. All seven are
  unpushed, so amending needs no force-push — but `CLAUDE.md` prohibits
  rewriting history without an unpushed carve-out, so it was not done. Three
  directions are in the item; the seventh instance, produced under an explicit
  briefing warning, refutes the "fix the habit" direction outright.
- **`GG-17` versus the PO's `--no-verify` instruction — resolved the same day;
  the carried-forward rule above states the question, this states the answer.**
  It was surfaced by the rotation's extraction pass, then put to the PO rather
  than settled by an agent picking a side. What the extraction pass got wrong on
  first reading is worth keeping: it read `guardrails/git.md` as the authority
  and reported an unresolved contradiction. `CLAUDE.md` already carried the
  answer — forbidden "not by asking", "never skip hooks" — and it was the
  guardrail that disagreed with it, not the other way round.
- **Resolved 2026-09-01 (PO decision, in session): hook-bypass is never
  agent-overridable ([ADR-0079](adr/0079-hook-bypass-is-never-agent-overridable.md)).**
  Pushing through the Pipeline with `--no-verify` is never permitted for the
  agent and carries no `OVERRIDE <rule-id>` route (`GG-17`…`GG-20`), following
  the `GIT-03` non-overridable precedent. The PO's own manual `--no-verify`
  push in their own terminal remains a documented human exception outside the
  Pipeline's authority — never retroactively legitimised, never agent-arranged.
  Implementation (correcting `guardrails/git.md` GIT-07 and moving `GG-17`…`GG-20`
  out of the overridable union) is filed as
  `backlog/items/2026-09-01-hook-bypass-rules-are-overridable-against-the-stated-policy.md`,
  scheduled for the maintenance window, not immediate.

The gate result for this candidate is in the machine-written
`evidence/verify-latest.json`, which names its own candidate commit and tree —
read that rather than trusting any prose claim about which HEAD was green.

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
