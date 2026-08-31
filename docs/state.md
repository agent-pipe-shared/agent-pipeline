# Project state — Agent-Pipeline

> Canonical operational handover for this repository. It contains public
> repository state only; durable decisions remain in the ADR register.

## Archived history

| Date range | Summary | Archive |
|---|---|---|
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

## Current handover — 0.6.0 is an interim release; Nova B continues after it (2026-08-31)

**Sprint Nova is NOT closed.** The PO's explicit instruction this session:
0.6.0 ships as an interim state so Nova B can continue on top of it. No
`close-block`, no `close-feature`, no close coordinator — a release is a
handover event here, not a lifecycle close.

**The backlog release condition is satisfied, and the earlier plan to reach it
was wrong twice over.** Measured by cross-tabulating status against sprint (not
inherited): open = alfred 19 · batman 2 · nightwing 26 · nova-b 26, i.e. exactly
the four intended planning windows, with `check-backlog-sprint-assignment.mjs`
reporting `undeclared and open (failing): 0`. Sprint Phoenix is already at 0.

The pass the prior session planned — close four 2026-07-19 placeholders, move
six defects to `nova-b`, one to `alfred` — was **unnecessary** (all 11 items are
already `status: deferred`, never `open`, so they never counted against the
condition) and **impossible** (`FORWARD_TRANSITIONS`, `backlog-state.mjs:54`,
defines successors only for `open` and `in_progress`, so `deferred` and
`rejected` are terminal; and `open -> closed` is not a legal transition at all,
while `closed` requires a `closure_commit` OID plus a tracked `closure_evidence`
path that a never-implemented placeholder cannot honestly supply).

That has a consequence worth keeping: four defects re-verified as still present
in code sit in terminal `deferred` and are invisible to every mechanical check,
because the sprint gate only fails on `undeclared AND open`. Filed as
`backlog/items/2026-08-31-a-deferred-item-is-terminal-so-a-live-defect-can-be-parked-invisibly.md`.

**The exhaustive privacy sweep ran and returned FAIL; the PO disposed of it as
disclosed-unremediated.** Verdict persisted as a tracked artifact at
`specs/sprint-phoenix-epic/evidence/privacy-sweep-critic-review-4defe09e.md`.

- **F1 (major):** `privacy-review.md` §3 rule 11 requires restricted-store
  implementation to live only in files listed in Spec §§7.3-7.4 and states "No
  separate restricted-store implementation file is authorized by this design",
  yet `human-decision-attribution.mjs`, its test and its schema are absent from
  that inventory. Contract drift, not rogue implementation: the increment was
  authorized and closed, and the implementation itself is privacy-conservative.
- **F2 (major):** §5's sign-off is bound to commit `643c7d06` / tree `449465e5`,
  while the restricted-store surface has materially changed since.
  **No valid privacy sign-off covers the 0.6.0 candidate.** Anyone reading §5's
  Status line as satisfied is relying on a stale binding.

**PO decision, 2026-08-31: disclose, do not remediate.** Both are filed as open
`nova-b` items. Remediation would mean editing `specs/sprint-phoenix-epic/spec.md`
and `design/privacy-review.md`, both of which are sha256-bound in that epic's
`lifecycle.json` (the spec's recorded digest `5eeef75c…` matches its current
bytes exactly), i.e. retroactively rewriting a closed epic's authority record
plus its digest index. The release-preflight registers `critic` among its five
`FINAL_GATES` as `pending` and reads no verdict artifact, so this is
mechanically reachable — it is a recorded judgement, not a bypass.

**The recorded release sequence was wrong about the manifest stamp, and this
corrects it.** `release-preflight-cli.mjs:65` names three version surfaces —
`VERSION`, `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json` — and
`observeVersion` requires every manifest to equal the literal contents of
`VERSION` exactly. The local-candidate `+claude.…`/`+codex.…` build stamps
therefore do NOT agree and would derive `version-decision-mismatch`. Stripping
them is correct and safe: `git show v0.5.4:…/.claude-plugin/plugin.json` carries
the bare `0.5.4`, and `codex-pretool-guard.test.mjs` only validates the stamp's
shape `if (buildMetadata !== null)` while asserting `baseVersion === VERSION`.

Both manifests are TRACKED, so stamping is a commit — and every commit voids
both the candidate-bound verify evidence and the Critic's candidate binding.
**The stamp belongs in the pre-verify batch, not after the Critic** as the
2026-08-30 handover recorded. The corrected order is: all commits → security
scan → full verify → Critic on the final candidate → signature ceremony → push
the feature branch → CI against the pushed ref → `main`, tag, release.

**The 2026-08-30 emergency push is disposed of as a documented waiver** (PO
decision, 2026-08-31). Both branches were pushed with `--no-verify`, no
`approve-push` and no Ed25519 proof. It left no trace in the hook's audit path
for a structural reason: there was no pre-push hook at all — preflight reported
`prePushHook: "absent"`, `unbackedGate: true` while the repository declared
`gates.push: blocking`. The hook is installed since 2026-08-31 on the PO's
explicit instruction, who also stated that `git push --no-verify` deliberately
remains available as git's own escape. No retroactive approval record is
created: an approval entry for an act that had none at execution time is exactly
the shape `approve-push` exists to prevent.

**A resume-hint trap, hit live and reversed.** A `--resume` restart PRESERVES the
session id, so a card captured before the restart and consumed after it records
capture and consumption under ONE session id — externally indistinguishable from
the false F12/F13 case the check exists to catch, regardless of whether
re-grounding genuinely happened. `consume` was recorded this session and then
reversed to `discard`; `resume-consumption-check` is green via
`RH-CHECK-NO-CARD`, which asserts nothing about any session having read
anything. Note `resume-hint.mjs` documents the receipt more narrowly than the
checker does: "A receipt below proves the card's bytes were READ; it never
proves they were understood or acted on." Filed as
`backlog/items/2026-08-31-a-captured-resume-hint-card-reds-the-verify-gate.md`.

**Three consecutive Goldfish dispatches hit the harness `maxTurns: 50` cliff**,
including one briefed with a deliberately reduced 30-call cap. In every case the
work was substantially done and only the closing handover was lost; each was
recovered by inspecting the tree directly and resuming with a
closing-allowance-only message. The briefed tool budget is not a mechanism —
`maxTurns` is. Treat a briefed cap as advisory and the cliff as real.

### Carried forward, because none of these has another home

- **AK-6** is ready to re-dispatch against `pipeline-user-v3.schema.json` (the
  first attempt used the pre-v3 schema and would have flagged a correct
  calibration as drifted; withdrawn `1d6dec55`, scaffolding kept at `8316dbd8`).
- **A standing authorization the mechanism cannot honour.** Spec §8 grants a
  standing Nova authorization to lift TP-1/TP-3/TP-5 for an exact task, but
  `guard-testpath` reads `gates.push_approval`, this repository is on `signature`,
  and that mode has no in-session activation step. Whether §8 promises more than
  the guard delivers, or the guard should know about §8, is an open design
  question that read as a blocker to three sessions in one night.
- **BS25/BS26 durability** (ADR-0068 D6): three positional ledger lookups remain
  (`backlog-state.mjs:1326`, `:1504`, the test fixture); two can bind by
  `entryHash`, `amendsSequence` needs an additive `amendsEntryHash`, and the
  fixture must stay positional, so the prefix invariant becomes a named check.
- **The Antigravity hard-enforcement layer's two fail-open paths:** the layer is
  inert whenever the daemon cannot resolve `node`, and it fails silently, because
  the hook that would report it is the one that does not run.
- **Two of the four documented reasons for `security: off` are stale**
  (`c67397d7`). What actually blocks is the v2 verdict's three offending required
  capabilities plus a license allowlist resolving only inside this repository.
- **Codex restarts where a resume would do.** The barrier's contract requires "a
  ticket proving a fresh *Codex* process re-read those bytes" — a new process, not
  a new conversation — so by that contract a resume clears it and keeps context.
  The one empirical fact it turns on is unmeasured: whether `codex resume`
  re-reads `.codex/*`. Measure that before changing any instruction.
- **The sibling defect shape, still unfiled:** *a change to A creates an obligation
  at B, and only a later gate run reveals it.* Editing a doc staled its vendored
  copy; regenerating that copy tripped the consumer-path scanner; extending the
  Critic search surface invalidated a security baseline pinned to it; registering
  five suites silently invalidated the capability inventory. Each is a missing
  coupling, not carelessness. Its primary shape (*named but not admitted*,
  *admitted but not named*, *published but not consumed*) is filed as `a33ea0cc`;
  this sibling is not.
- **The PO's acceptance bar, verbatim, because it is what "done" means:**
  *"1. ich bestätige, dass die pipeline installiert werden soll 2. ich beantworte
  eine reihe anfragen fürs onboarding (modus, author, etc.) 3. ich gebe PRD frei
  4. ich verlange den push 5. ich signiere den push"*. Touch 3 carries an open
  quality question, not a defect: what the PO releases is a staging draft that is a
  verbatim intake transcript until an agent authors the product framing, and
  nothing forces that authoring step.
- **Retrospective follow-up items #7 and #8** stay deferred to Nova B per PO.
- **The Critic 1+1 run on the sandbox-quickfix delta returned FAIL, unresolved,
  with no Round 3 dispatched.** 1 major — `roles/elephant.md` stage-0 fast-path
  violated by a self-committed fix to `check-consumer-safe-paths.mjs`; 1 minor —
  `observeRunner()` untested, filed. Both were self-verified and documented, no
  functional defect found, but the FAIL itself is still unresolved.
- **`f7ab9b42` (NVA-DOC060) has had no independent Critic review.** Implementation
  complete (user-facing documentation aligned with the real 0.6.0 three-runner
  state); the diff has not been through an independent Critic pass.
- **Two unanswered NVA-CIVERIFY questions, carried to the Critic and still open:**
  (i) the change lets ANY session-less checkout self-provision a binding, a plain
  local clone included, where the previous behaviour was an outright refusal —
  intended, or to be narrowed? (ii) a `guard-lifecycle-ready.test.mjs` failure in
  its own reproduction log whose expected paths point into `scratch/ci-repro/…` —
  clone-nesting artifact, or real? The release review found no code defect in the
  change itself, so (i) is the question that remains genuinely open.
- **`guard-lifecycle-ready-tests` / `NOVA-LCR-HGO-1`:** the copy-safe renderer's
  wrap column is path-length sensitive, so at a long enough checkout path a
  denial no longer visibly names `guard-human-override.mjs` — possibly an
  ADR-0059 Decision 4 violation in real consumer projects rather than a test
  artifact. Two deep-path clones fail, three short-path runs pass. Filed as
  `backlog/items/2026-08-31-copy-safe-renderer-wrap-point-is-path-length-sensitive.md`;
  the outside-repository short-path data point is still missing.

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
- For this task, Nova B is explicitly out of scope.

**Last updated:** 2026-08-25 — chat-gate-ceremony standardization
(`enforce-kickoff-po-questions`, PO decision: standardize push/kickoff/
PRD-Spec approval onto ONE mechanism, `plugins/pipeline-core/lib/
chat-gate-ceremony.mjs`). Landed and independently reverified this session:
(A) push self-approval fix (closed), (B) kickoff `--language`/`--profile`
gate (closed), (C) PRD/Spec acknowledgement gate (`po-authority-
acknowledge-apply` now requires the ceremony, commits `01b10848`
cherry-picked + `550b21d7`), push-approval preference now confirmed
per-repository pre-filled from the machine default instead of asked once
and never applied (closed, commit `cefd5dcb`). GWM kernel-closure gap for
`chat-gate-ceremony.mjs` fixed (`f6c9800a`). **HGO's `authorize --activate`
chat-mode path now DONE** (`AGY-HGOFIX-2`, commit `69d608fe`,
independently reverified 76/76): `authorizeHumanGuardOverride()` requires
the attended-chat-gate confirmation in chat mode, unchanged in signature
mode. Its own collateral regression (3 dependent test files calling the
now-gated function in chat mode without the seam) was chased down:
`guard-lifecycle-ready.test.mjs` fixed (`AGY-HGOFIX-3`, commit `60805fab`,
127/127). **Still open:** `guard-gate-strength.test.mjs` (4 tests,
GST21/25/26/27) and `guard-testpath-override.test.mjs` (4 tests,
OT10/11/12/13) stay regressed — both are empirically confirmed TP-6/TP-7
guard-protected test paths with no in-session override route
(`status=author-repair-required`); fixing them needs a human-run
author-repair ceremony or a follow-up dispatch scoped with that authority.
GWM itself has no chat-mode activation path yet (barely started, reverted,
not picked back up — not blocking anything currently in flight).
**Live incident this session, recovered, filed:**
`isolation: "worktree"` (Agent tool) never actually created a separate
worktree — three parallel dispatches raced on the shared checkout, causing
three zero-commit truncations and a detached-HEAD incident (a self-heal
step ran `git checkout --detach` against the shared tree). No work lost;
recovered by hand (cherry-pick + selective revert). See backlog:
`2026-08-25-workflow-tool-isolation-worktree-never-created-a-worktree-this-session.md`.
**Until that's resolved, dispatch serially in this repo, not via
`isolation: "worktree"`.** Also filed this session: a confirmed, reproduced
`guard-dispatch.mjs` fail-open on the Antigravity `Subagents`/`TypeName`/
`Prompt` payload shape (live defect, not theoretical); a GWM
kernel-doc/code enumeration drift (13 undocumented entries); a general
"guards are tool-level, not OS-level sandboxing" idea (Nova B, deferred).
**Correction/narrower finding after further testing:** the broken mechanism
was specifically the Agent tool's own `isolation: "worktree"` parameter —
the **Workflow tool**'s `agent()` `opts.isolation: 'worktree'` DOES create
real separate worktrees (confirmed live via `git worktree list` showing
distinct `.claude/worktrees/wf_*` entries), matching
`workflow-dispatch.md`'s own documented live-tested behavior. Prefer the
Workflow tool for any future worktree-isolated parallel dispatch in this
repo; the Agent-tool-direct path stays suspect until separately verified.

**AFK backlog sweep — COMPLETE and reconciled (PO directive, chat,
2026-08-25).** `codex-runner-has-no-real-support-on-native-windows` closed
separately first (won't-fix, PO: no Windows daemon exists, existing
mitigation suffices). The 17-item Workflow-tool sweep (Run ID
`wf_3ec6e465-da5`) landed; 8 of 17 agents failed to call `StructuredOutput`
(harness-level truncation) but several still committed real work in their
worktree — every one of the 17 worktrees was individually checked via
`git worktree list`/diff, not just the returned JSON, per
`workflow-dispatch.md`'s "never trust a returned result alone" rule.
Reconciled onto `sprint_agy`: **6 fixes cherry-picked and independently
re-verified** (own test suite run directly, not the dispatch's self-report)
— a real Antigravity `Subagents`-payload dispatch-guard bypass fix (15/15,
matches the live-reproduced finding from earlier this session), the GWM
kernel-doc/code enumeration drift (13 missing entries, 3/3 incl. new
GMWKC03 regression guard), a `backlog-strip-for-dispatch` section-dropping
bug fix (12/12), a `verify.mjs` Tier-B promotion for two more suites
(35/35), a goldfish/critic template hardening against silent turn-end
abandonment (the exact `long-dispatches-truncate` failure mode this same
sweep run itself hit for 8/17 agents — 4/4+36/36), and the missing
`intake-generate`/`bootstrap-bind` coordinator skill-reference doc. Plus 6
Triage-only re-triage/correction notes (stale-claim corrections, evidence
re-checks) and one doc-only workflow-dispatch policy addition. Closed with
fresh evidence: `orchestrator-authored-production-commits-have-no-
deterministic-control` (GIT-01/GG-22 confirmed live, 230/230; its
undelivered Part B split into its own item,
`2026-08-25-verify-range-mode-registration-for-orchestrator-commit-
control.md`), `guard-dispatch-fails-open-on-the-antigravity-subagents-
payload-shape`, `gwm-kernel-doc-enumeration-diverges-from-the-code-array`.
**One post-merge regression caught and fixed on the integrated tree**
(not present in any individual worktree): the new
`docs/human-authorization-inventory.md` doc was unclassified in
`governance/observation-doc-governance.json`'s inventory, tripping
`check-doc-contracts.test.mjs`'s observation-governance pass
(`OG-DOC-UNCLASSIFIED`) — fixed, 36/36 green (`02014041`). **Confirmed
still blocked, re-verified live rather than trusted from inheritance:**
`mp22-orchestrator-self-implementation-has-no-enforcement` (Sprint Alfred),
`regulated-document-hooks` (Sprint Phoenix HAW-E batch),
`session-keep-awake` + `afk-assumption-mode` (both bound to the Nova A
candidate freeze), `kickoff-promotion-cleanup-readback` (needs a dedicated
authorized pass touching `human-guard-override.mjs`/
`codex-pretool-guard.mjs`), `scratch-cleanup-mechanism` (points 1 and 3
remain genuinely open). Backlog ledger reconciled (`6d62f964`); security
scan and `check-backlog-state.mjs` both clean on the final tree; all 17
sweep worktrees removed. 25 commits landed this reconciliation pass.

**Pushed, 2026-08-26.** The two remaining chat-gate regressions from
`AGY-HGOFIX-2` are now closed. TP-6 (`guard-gate-strength.test.mjs`) and
TP-7 (`guard-testpath-override.test.mjs`) are Pipeline plugin source with
NO in-session override route at all — `pipeline-author-repair` mode is
structurally unreachable in this repo's self-application topology
(`plugins/pipeline-core` has no independent git toplevel of its own,
confirmed live); `repair-map.mjs` itself reports `command: (none)` for
`HGO-AUTHOR-ROOT-REQUIRED`. The PO applied the same `dependencies` seam
directly in their own terminal, outside this session, via a script this
session prepared with pre/post verification (`6f073ecf`); independently
re-verified here (36/36, 19/19, plus 76/76 and 127/127 no-regression
checks). A full `verify.mjs` run ahead of the push then caught a FOURTH,
previously-unflagged chat-gate regression the two prior dispatches never
covered: `codex-pretool-guard.test.mjs` (2 failures) arms its capability
via a real detached subprocess spawn of `guard-human-override.mjs`, which
can never satisfy an attended-terminal check by design — fixed by calling
the CLI's exported `main()` in-process instead, injecting the identical
test-only seam (`1a2dbb0a`). Also found and fixed: the machine-scoped
`poKeyDirectory` (`~/.agent-pipeline/machine.json`, outside repo scope)
still pointed at a stale key directory from 2026-08-10 that no longer
matches the pinned trust anchor — the code deliberately refuses to
auto-overwrite this once set (by design, prevents silent key-directory
swaps), so it needed explicit PO confirmation, given, then corrected by
hand. Full `verify.mjs` 385/385 green, security scan clean, push-prepare
fully green, PO signed via `authorize-critical` in their own terminal.
Pushed `origin/sprint_agy`: `2887e774..1a2dbb0a` (214 commits,
fast-forward). `pipeline-state.mjs approve-push` recorded the approval
before the push ran.

### Sentinel Links

Retained per `backlog/items/2026-07-20-spec-retention-on-close.md`,
enforced by `governance/spec-retention.json` + `check-spec-retention.mjs` —
keep linking all seven; do not prune (note carried over from the Phoenix
line's own checkpoint 71, see the history section below).

- specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md
- specs/2026-07-19-sprint-sentinel-epic/spec.md
- specs/2026-07-19-sprint-sentinel-epic/backlog-acceptance-matrix.md
- specs/2026-07-19-sprint-sentinel-epic/public-private-reconciliation-design.md
- specs/2026-07-19-sprint-sentinel-epic/RECOVERY.md
- specs/2026-07-19-sprint-sentinel-epic/platform-support-contract.md
- specs/2026-07-19-sprint-sentinel-epic/windows-blockers-scope.md

---

## Phoenix-line history (superseded by the Nova line above — preserved in full, not deleted)

> **Nova is the active state.** Below is `sprint_phoenix`'s own handover
> exactly as it stood at that branch's last checkpoint (71, 2026-08-23)
> before this merge — kept in full per PO instruction, as HISTORY. Any
> "(READ THIS FIRST)"/"Next step" text inside it was live only on the
> Phoenix line; the "Current handover" section above is the live one now.
> Phoenix's own "Archived history" table and Sentinel-links list are
> already folded into the sections above, not repeated here.

**Last updated (Phoenix line):** 2026-08-23 (checkpoint 71)

---
