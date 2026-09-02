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

`main` moved `dd1eb9ee..6262d408`. Tag `v0.6.1` and the GitHub release both
point at `6262d408`. The approval audit is committed at `57235b83`, after the
push, never between `approve-push` and `git push`.

Three PO signatures were spent getting here, and two of them are worth
remembering:

1. **The audit ledger had to be repaired before any override could work at
   all.** A torn append on 2026-08-20 left `audit.head.json` covering 282
   entries against a ledger of 283, so `verifiedAuditEntries()` refused, and
   every human-guard-override route in this repository had been failing closed
   for thirteen days. Nothing announced it: the denial text said
   `code=HGO-AUDIT` under every refusal, in a line that reads as boilerplate.
   The first signature of the night was spent on a ceremony that could not
   complete, because `prepare-for-signature` built a full, valid ceremony while
   the code already knew the ledger would not authenticate. Filed as
   `pipeline.a-torn-audit-append-has-disabled-every-human-guard-override-since-august-20`.
2. **The second registered the rebase-authority suite in `verify.mjs`** (TP-3,
   no in-session route), and **the third approved the push to `main`.**

**`main` was pushed under an explicit repository-admin bypass**, added by the PO
to the `protect-main` ruleset, and GitHub recorded it rather than admitting it
silently. The circle it broke: `main` requires a passing `verify` status check on
the pushed commit, and the workflow triggers only on a push to `main`, a PR
against `main`, or an explicit dispatch — so a commit that has never reached a
remote ref cannot acquire the status it needs to reach one. Breaking it without
the bypass costs two further signatures, because ADR-0077's per-destination
approval storage is accepted and **not implemented**: a second `approve-push`
overwrites the first. `deletion`, `non_fast_forward` and the status requirement
remain active for everyone else.

**The bypass stays for 0.6.1 — PO decision, 2026-09-02 — and the circle behind
it must be closed before the next release.** The reason first given for keeping
it does not hold, and is corrected here rather than left standing: a
`workflow_dispatch` run attaches a check named exactly `verify` to the head
commit of the ref it runs on (measured — `266d691f` carries one). The bypass-free
route therefore exists and is the intended gate: push the candidate to a feature
branch, dispatch `verify` on it, then push that same SHA to `main` with the
status already on it. What the bypass buys is one signature per release, not
access. It is a standing admin-only weakening of the `verify` requirement, held
deliberately, not an open task waiting on a green run.

The tag was cut with `gh release create`, not a tag push: `approve-push`'s
destination regex only matches `refs/heads/*`, so `git push origin <tag>` is
refused however it is signed, and `docs/push-release-flow.md`'s release addendum
names `gh release create` as the agent-executable route because it calls the API
and structurally is not a push.

Closed since: `CHANGELOG.md` records 0.6.1 (`f0290fe8`); `stable` is deleted;
and ruleset `protect-release-tags` (id 22072995) blocks deletion and
non-fast-forward on `refs/tags/v*` with **no bypass actor at all** — not even an
admin can move a release tag without editing that ruleset first.

**CI was red on the released commit. Two of the three are fixed on `nova`, and
`main` still carries the failing status.** Run `33595311782` on `6262d408`
failed on three suites, all green locally, each filed as its own item
(`5bbf1517`).

- `guard-lifecycle-ready` — fixed at `216ff054`. The test now supplies its own
  `true`; the workflow's five-symlink `PATH` was deliberately NOT widened a
  sixth time, because the assertion under test is that the guard's published
  continuation finishes a rebase, not that the host ships coreutils. The argv
  reaching git is byte-identical to before. Route chosen by the Elephant, not
  left to the dispatch.
- `codex-onboarding-capabilities` — fixed at `ae8da7b8`. `treeSnapshot`
  tolerates an entry that vanishes between `readdirSync` and `lstatSync`, and
  excludes `*.lock` narrowly under `.git/` and `.git/objects/` — proven narrow
  by three boundary shapes, not asserted in a comment. Both defects were fixed,
  because tolerating the crash alone leaves a lock file in one snapshot of a
  before/after pair and the comparison still fails.
- `LWSC04` — **deliberately not fixed** (`7cc0b649` records why). Measured by
  reading: `lease` sits inside `recordSha256`, `lastHeartbeatMonotonicMs` inside
  `lease`, the heartbeat rewrites it every second, and `cancel` demands digest
  equality. No caller that must spawn a process can win that compare-and-swap,
  so repairing only the test would turn the suite green and hide the problem
  from every real client. Needs its own briefed dispatch with independent review.

Both fixes were verified independently of the dispatch reports; full verify is
green at `7cc0b649` — 506 suites, exit 0, security scan included.

The `PATH` finding is the third instance of one pattern — `openssl`, the runner
executables, now `true` — and its item asks for one sweep rather than a fourth
discovery one CI run at a time.

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

### In flight — the rebase deadlock, reported from a second session

A session rebasing `feat/sprint-alfred` onto `6262d408` is deadlocked: the
resolved rebase authority names `project/pipeline-state.json` as its conflict
path and advertises the resolution shapes, then two later checks in the same
evaluation refuse every one of them. Filed as
`pipeline.the-rebase-authority-is-resolved-and-advertised-but-not-executable`
(`26ce76a9`). **The PO wants only the Pipeline defect fixed and a new candidate
on `main`; the Alfred checkout and its running rebase are not to be touched.**

Landed: `10d11e58` — both reliefs keyed on the resolver's own
`conflictPaths`/command predicates, and an admission notice, because a lifecycle
gate that suspends itself silently is indistinguishable in an audit from one
that was never armed. 219/219, re-measured by the Elephant, not taken from the
dispatch report.

Critic round 1 (guardrail class, higher-capability model) returned eight
findings. Three were dispatcher-side and are closed in `e67968f0`; the registry
is `backlog/evidence/2026-09-02-nva-rebdead-1-findings.md` (`508211f9`).

**F1 is refuted and its fix reverted (`43413349`).** `apply_patch` was never
blocked: `evaluateLifecycleReadyGuardCore:4311` admits any tool name outside
`SHELL_TOOLS`/`WRITE_TOOLS` unconditionally, and `guard-apply-patch.mjs` closes
that by never forwarding a raw `apply_patch` — it synthesizes an `Edit` per
touched path, which the pre-existing relief already admitted. The revert is
deliberate rather than tidiness: the reverted code added branches no call can
reach, presenting a second apparent enforcement boundary in a file whose
companion documents its translation loop as the sole one.

**Still open: F5, F7, F8, then a second Critic round and full verify.** F5 is the
substantive one and its design decision is already made and recorded in the
rework briefing: narrow the readiness relief to the exact `lifecycleStatus` an
unparseable state file produces — measured, not guessed — instead of the whole
`PORG-NOT-READY` + `intent: "session"` family. As shipped it silently makes the
narrower `restart-required` sibling unreachable. The earlier wording
"re-base readiness on `orig-head`" named the goal, not the mechanism.

Two process facts belong with this, both measured today:

- **`docs/push-release-flow.md`'s GIT-01 admitted-type list has no `revert`,**
  though Conventional Commits defines it. The revert above is typed `fix` and
  says so in its own message. Not filed as an item pending a PO word.
- **Three dispatches hit the `maxTurns: 80` cliff in one block, one losing every
  trace of its work** — clean tree, no commit, no artifact, one log entry, ~193k
  tokens. Filed as
  `pipeline.documenting-the-maxturns-cliff-did-not-stop-dispatches-falling-off-it`
  (`02303be0`), deliberately a new item rather than reopening the 2026-08-25
  closure whose remedy was documentary and demonstrably does not hold. The
  session's own correction — one concern per dispatch, budget 25 — is applied
  from `NVA-REBDEAD-F1` onward.

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

