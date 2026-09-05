# Project state — Agent-Pipeline

> Canonical operational handover for this repository. It contains public
> repository state only; durable decisions remain in the ADR register.

## Archived history

| Date range | Summary | Archive |
|---|---|---|
| 2026-09-02 | The 0.6.0-to-0.6.1 release run, the overnight Nova B block, and the four dispatcher errors it recurred: superseded by the 0.6.1 release entry. | [docs/state-archive/2026-09-02--where-the-release-stands-interim-update-2026-09-01-evening.md](state-archive/2026-09-02--where-the-release-stands-interim-update-2026-09-01-evening.md) |
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

## Current handover — 2026-09-01/02: the autonomous Nova B block

**Lifecycle phase:** feature `sprint-nova-epic` · phase `implementation`

PO mandate for the day: work items needing no PO interaction until ~17:00, then
freeze, verify, and hand back a push-ready HEAD. Sprint Nova is **not** closed —
the release is being run as a handover event, not a lifecycle close. No
`close-block` and no `close-feature` have been invoked, deliberately.

## Durable rules carried forward — these have no other home

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
   `approve-push` exists to prevent. This sat in unresolved tension with
   `guardrails/git.md` GG-17, which states the opposite as a guard-enforced MUST
   NOT with no carve-out. **That tension is resolved — 2026-09-01, PO decision,
   [ADR-0079](adr/0079-hook-bypass-is-never-agent-overridable.md)** — and this
   entry's former closing line ("unrecorded and needs a PO decision") was stale.
   A PO's own deliberate `--no-verify` push in their own terminal remains a
   conscious human exception outside Pipeline authority; through the Pipeline it
   is never permitted and the guard must catch it.
3. **A `resume-hint` receipt proves only that a card's bytes were read**, never
   that they were understood or acted on — and a `--resume` restart preserves
   the session id, so capture-then-consumption under one session id is
   externally indistinguishable from the false re-grounding case the checker
   exists to catch.
4. **"GS-6" does not resolve.** The rule cited under that id — a
   mutation-adjacent action inside a repository the agent may not write outside
   of is a human-only step — has no text anywhere in `guardrails/`, `CLAUDE.md`
   or `docs/adr/`. Either the id is stale or the rule was never given a home.

Extracted 2026-09-02 from the section rotated that day, each re-checked against
its candidate home before being carried rather than assumed homeless.

5. **`push-prepare`'s printed `authorize-critical` command carries an
   `--expires-at` window: re-run `push-prepare` immediately before signing, and
   never reuse an earlier printout.** Verified 2026-09-02:
   `docs/push-release-flow.md` names the flag three times and documents that the
   value is normalized rather than rejected (line 201), but states this
   operational warning nowhere.
6. **TP-5 owes nothing until something re-establishes it.** A "TP-5
   release-adapter carve-out" was carried in this file's predecessor and in
   several session summaries and could not be substantiated on 2026-09-01: no
   backlog item names it, the TP-5 window item is closed, and the TP-3/4/5/6/7
   restoration item is closed with the rules confirmed `armed`. What the
   maintenance window still owes is four suite registrations plus promoting
   `check-suite-registration.mjs` itself to a gate step — all TP-3, i.e. editing
   `harness/scripts/verify.mjs`, for which signature mode admits no in-session
   override. All four suites were measured green standalone, so the gap is that
   the gate does not re-run them, not that the behaviour is unverified; the
   guards are armed regardless of whether their suites are registered.
7. **A Critic's input must be an authorship-only projection of a dispatch
   record**, never the record itself: `taskId`, `agentType`, `dispatcher`,
   `commits` and nothing more. An implementor's record embeds its own
   completion-report prose, which contaminated four consecutive Critic rounds
   before the projection was applied. Verified 2026-09-02: neither `CLAUDE.md`
   nor `templates/prompts/critic-review.md` nor `roles/critic.md` contains this
   rule in any form.

### Still-live open questions carried forward

Each was checked against `backlog/STATUS.md` and the git log; where liveness
could not be positively established, that is said rather than glossed.

- ~~`project-onboarding-v3-tests` fails in CI and is not explained.~~ **Closed
  2026-09-02.** The cause was inode reuse on ext4 versus tmpfs, fixed at
  `9a7c309b`; the suite reported zero in CI run `33595311782`. Struck rather
  than deleted, because this line stood as "not explained" through several
  handovers and a later reader should see that it was answered, not dropped.
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

### 0.6.1 is released — 2026-09-02

`main` moved `dd1eb9ee..6262d408`, tag `v0.6.1`/GitHub release at `6262d408`,
`CHANGELOG.md` records it (`f0290fe8`). Pushed under an explicit,
PO-decided repository-admin bypass on `protect-main` (stays for 0.6.1; the
bypass-free route — dispatch `verify` on a feature branch first, then push
that same SHA to `main` — is the intended fix before the next release).
`protect-release-tags` (id 22072995) has no bypass actor at all.

Two incidents worth their own durable record, both filed as their own
backlog items rather than restated here: a torn audit-ledger append had
disabled every human-guard-override route for 13 days
(`pipeline.a-torn-audit-append-has-disabled-every-human-guard-override-since-august-20`),
and CI ran red on the released commit for three suites, two fixed since
(`216ff054`, `ae8da7b8`), one deliberately not
(`backlog/items/2026-09-02-worker-cancellation-is-denied-when-the-record-digest-ages-between-read-and-cancel.md`,
LWSC04 — needs its own briefed dispatch with independent review). Full
verify green at `7cc0b649`, 506 suites.

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

### Closed — the rebase deadlock reported from a second session

Fixed, reviewed and closed 2026-09-03 (`e152183e`), verify green 506/506. Its
own Triage section already carries the three findings worth remembering
(F1 refuted by measurement, F5's first rework rejected, Round-2 F1 an
unremedied lifecycle violation of mine) — read
`backlog/items/2026-09-02-the-rebase-authority-is-resolved-and-advertised-but-not-executable.md`
rather than this pointer.

### 2026-09-04: verify.mjs evidence-slot fix — ceremony status (NVA-B-EVSLOTFIX-1)

The atomic-write fix for the shared `evidence/verify-latest.json` slot
(`backlog/items/2026-08-12-shared-verify-evidence-slot-corrupted-by-concurrent-dispatches.md`)
is split into five TP-3 blocks on `harness/scripts/verify.mjs`, each landed via
its own PO Ed25519 signature ceremony (ADR-0059) because a single Edit call
covers only one contiguous region.

- **Blocks A (imports) and B (evidencePath/writeEvidence/runId) landed and
  committed at `61dc7fc5`.** Both ceremonies completed end-to-end; the commit
  message records their request/plan hashes.
- **Block C is prepared but unsigned.** Wires the new `runId` into the
  `runVerifyJournal` call site (around line 851):
  ```js
  // old:
            verifyRun = await runVerifyJournal({
              gitCommonDir: gitCommonDirectory(),
              repoRoot,
  // new:
            verifyRun = await runVerifyJournal({
              gitCommonDir: gitCommonDirectory(),
              runId,
              repoRoot,
  ```
  The request was seeded and re-seeded 8 times between 11:24 and 16:29 UTC on
  2026-09-04 (window 8 expired at 16:29:08Z), each window closing with no PO
  signature — `proof-manual.json` stayed frozen at 12:52:50 the entire time.
  Re-seeding was stopped after window 8 per the "seed a ceremony only when the
  PO can sign immediately" rule (CLAUDE.md, `guard-testpath.mjs`
  admission-failure note): seeding a 9th window with the PO unavailable only
  risks a stale-window signature burning a passphrase entry for nothing.
  Resumes on the PO's say-so — start with a fresh denied Edit (the block above
  is the exact old/new text) to seed a new request, never reuse
  `fc296c8f30133f8cd399ef4b45f08ff843aaecf42fa4c22d37cc46022f94ad18`.
- **Block D is drafted, not yet seeded.** Extends the final log line:
  ```js
  // old:
  console.log(`\nEvidence written: ${evidencePath}`);
  // new:
  console.log(`\nEvidence written: ${evidencePath} (run record: ${runEvidencePath})`);
  ```
- **Block E is drafted, not yet seeded.** Registers two new suites in the
  same `TEST_SUITES` array (confirmed one contiguous array, lines 199-765 —
  merged 2026-09-04 from a separate Block F to save a PO passphrase entry,
  since array order is confirmed irrelevant to `duplicateSuiteIds`/
  `check-verify-suite-registration.mjs`): `verify-evidence-writer.test.mjs`
  (the runId wiring, Blocks A-C) and `dispatch-record-strip-for-critic.test.mjs`
  (a Critic finding, F2, on the unrelated `NVA-B-CRITICINPUT-1/2` package —
  its rework dispatch correctly stopped at this same TP-3 boundary rather
  than route around it):
  ```js
  // old:
    { name: "pre-gate-tests", file: join(scriptDir, "pre-gate.test.mjs") },
    { name: "capture-evidence-tests", file: join(pluginScriptsDir, "capture-evidence.test.mjs") },
  ];
  // new:
    { name: "pre-gate-tests", file: join(scriptDir, "pre-gate.test.mjs") },
    { name: "capture-evidence-tests", file: join(pluginScriptsDir, "capture-evidence.test.mjs") },
    { name: "verify-evidence-writer-tests", file: join(scriptDir, "verify-evidence-writer.test.mjs") },
    { name: "dispatch-record-strip-for-critic-tests", file: join(libDir, "dispatch-record-strip-for-critic.test.mjs") },
  ];
  ```
  `NVA-B-CRITICINPUT-1/2` (commits `a5e264a8`, `fa8362a2`, `00036dcf`,
  `d2fb4495`, `4e204dae`) is one correction commit into its one allowed
  rework round (`harness/review-protocol.md`) — F1/F3/F4 fixed and
  re-verified; F2 needs this registration landed before the remaining
  fresh re-Critic round runs. Neutral findings registry for that round:
  `backlog/evidence/2026-09-04-nva-b-criticinput-findings.md`.

Tree is clean at `4e204dae` (or later — check `git rev-parse HEAD`) with no
outstanding ceremony. After C/D/E land:
`node --test harness/scripts/verify-evidence-writer.test.mjs`, then a full
`node harness/scripts/verify.mjs` run bound to the final HEAD, then close the
2026-08-12 backlog item above.

### 2026-09-05/06: worktree-liveness item closed, PO-decided scope

`NVA-B-WTLIVE-1` (mechanism, `1ebf80d5`) → `bb8347e4` reverted (`d818dcf1`)
after a T1 Critic FAIL (repo-wide unattended deletion) → PO decided the
scope (Pipeline-owned paths only: `.claude/worktrees/`, `branch/`,
`branch/detached/`) → `NVA-B-WTLIVE-2` (`baf1ad71`, `eca3e170`) → a second
T1 finding (allowlist anchored to the running worktree, not the true
primary checkout) → per the two-round cap, `NVA-B-WTLIVE-3` (`b2d8ccf1`,
`05bdf6a9`) fixed it, self-verified by the Elephant (35/35 + 13/13 + 9/9
green). Closed. F3 (`resolveMainWorktreePath` misidentification from a
linked worktree) stays open, separately tracked, non-blocking. Full detail:
`2026-09-01-a-fresh-worktree-is-indistinguishable-from-an-abandoned-one.md`.

## PO decisions and todos — collected during the autonomous run, not waited on

Per the PO's 2026-09-02 instruction. None blocks further Nova-B work.

1. **A machine-specific path is in published history.** `79bc79b8` carries this
   machine's repository path seven times in an evidence artifact; the working
   tree was sanitised in `68c164e8` but the bytes remain. The only remedy is a
   history rewrite, which the guard union forbids — so this is a PO call on an
   accepted exposure, not a task. Prevention is filed as its own item.
2. **Hook-bypass override removal (ADR-0079) needs one PO sentence:** does the
   decision cover `git commit` and `git push`, or push only? Also scheduled for
   the maintenance window, and its test file is TP-1 protected.
3. **Vendored-canon drift** names two options and decides neither. The effective
   one is a pre-commit hook — new enforcement surface, which a standing
   constraint holds back until the current diff is reviewed.
4. **Three `hooks.json` edits await one shared TP-4 ceremony** rather than three:
   the worktree-isolation matcher, the resume-hint delivery hook, and the
   handover-size guard's registration. Deliberately not seeded — a ceremony is
   seeded only when the PO can sign immediately.
5. **GIT-01 does not admit `revert`.** Deliberate or oversight? Two reverts this
   week were committed as `fix` with the reason in the body.
6. **Nova B is 68 open items, not the 19 the STATUS.md tracking column shows.**
   The authoritative field is `sprint: nova-b` in frontmatter. Recorded because
   "work the Nova B backlog" and "work 68 items" are different asks.

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

