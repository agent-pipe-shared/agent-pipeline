# Project state — Agent-Pipeline

> Canonical operational handover for this repository. It contains public
> repository state only; durable decisions remain in the ADR register.

## Archived history

| Date range | Summary | Archive |
|---|---|---|
| 2026-08-31 | The 2026-08-30 block: the 6a93fec2 candidate stamp at 501/503, the six closed retrospective follow-up items, ADR-0076, and the unapproved emergency push of both branches. Its two live carry-forwards -- retro items 7 and 8 deferred to Nova B, and the unresolved Critic FAIL on the sandbox quickfix -- were extracted into the 2026-08-31 handover first. | [docs/state-archive/2026-08-31--prior-current-handover-nova-0-6-0-local-candidate-stamped-re.md](state-archive/2026-08-31--prior-current-handover-nova-0-6-0-local-candidate-stamped-re.md) |
| 2026-08-31 | The 2026-08-28 three-runner greenfield block: rounds A-U2, the ready-gate blocker T, the 2+2 Critic round, and the candidate's state on the night of 2026-08-28/29. Its still-live carry-forward items were extracted into the 2026-08-31 handover before rotation. | [docs/state-archive/2026-08-31--prior-current-handover-the-three-runner-greenfield-findings-.md](state-archive/2026-08-31--prior-current-handover-the-three-runner-greenfield-findings-.md) |
| 2026-08-28 | Ledger merge across parallel sprints (ADR-0068), ADR renumbering at acceptance (ADR-0069), and the first handover rotation; its four live open items -- ADR collision 0063, the unregistered check-adr-consistency, BS25/BS26 durability, and the Nova A candidate list -- are carried forward to the current handover. | [docs/state-archive/2026-08-28--earlier-handover-ledger-merge-capability-adr-renumbering-han.md](state-archive/2026-08-28--earlier-handover-ledger-merge-capability-adr-renumbering-han.md) |
| 2026-08-28 | Verify green 471/471 in one run at candidate 5fd963fc; EP07 tree-dirtying cause named and fixed; +build stamp convention restored; AK-5 closed, AK-6 ready to re-dispatch; the open 0.6.0 combined-release decision carried forward to the current handover. | [docs/state-archive/2026-08-28--prior-handover-verify-is-green-in-one-run-candidate-0-6-0-lo.md](state-archive/2026-08-28--prior-handover-verify-is-green-in-one-run-candidate-0-6-0-lo.md) |
| 2026-08-27 | sprint_agy fetch, fast-forward, and the 2026-08-26 clean local candidate | [docs/state-archive/2026-08-27--prior-handover-sprint-agy-fetch-fast-forward-and-clean-local.md](state-archive/2026-08-27--prior-handover-sprint-agy-fetch-fast-forward-and-clean-local.md) |
| 2026-08-19 through 2026-08-23 | Phoenix-line checkpoints 61-71 (2026-08-19 through 2026-08-23), preserved verbatim as history after the Nova merge made the Nova line authoritative. | [docs/state-archive/2026-08-27--phoenix-checkpoints-61-71.md](state-archive/2026-08-27--phoenix-checkpoints-61-71.md) |
| through 2026-08-19 | First real rotation: everything from the 2026-08-08 restart checkpoint through the inherited Nova/Cyborg-release history and every older era down to the open-items tail — extraction pass completed first (original pre-rotation line range 4977–19155; see the archive file's own provenance section and the ADR-0064 addendum dated 2026-08-19) | [state-archive/2026-08-19--pre-restart-and-nova-inherited-history.md](state-archive/2026-08-19--pre-restart-and-nova-inherited-history.md) |
| 2026-08-11 to 2026-08-19 | Checkpoints 1-60 (2026-08-11 through 2026-08-19 checkpoint 60): superseded session narrative; durable decisions already live in ADRs/backlog/guardrails per this repo's own standing convention, not uniquely in this prose. | [docs/state-archive/2026-08-19--checkpoints-1-through-60.md](state-archive/2026-08-19--checkpoints-1-through-60.md) |
| 2026-08-26 | 2026-08-25 Antigravity chat-gate-ceremony standardization, verify-tuner stage 2 acceptance, sprint-agy-runner delta4 Critic fix and candidate status | [docs/state-archive/2026-08-26--agy-runner-2026-08-25-handover.md](state-archive/2026-08-26--agy-runner-2026-08-25-handover.md) |

## Current handover — the release is blocked by CI, not by the candidate (2026-08-31)

**Verify is green on this machine, twice.** `dfd26254` and `f7ab9b42` (tree
`5f4d7042`): each 505/505, exit 0, binding `exact`, clean start and finish. The
two entries red on the other machine on 2026-08-30
(`pipeline-state-rebind-runner-tests`, `verify-suite-registration-check`) pass
here; the first is environment-dependent by its own description, so this is a
different environment, not a fix.

**The backlog already satisfies the release condition — measured, not inherited.**
563 items: 476 closed, 3 rejected, 11 deferred, 0 in progress, **73 open**. Every
one of the 73 open items belongs to one of the four intended planning windows —
nightwing 26, nova-b 26, alfred 19, batman 2 — and
`check-backlog-sprint-assignment.mjs` independently reports `undeclared and open
(failing): 0`. The only items outside those windows are the 11 `deferred` ones,
which declare no sprint; admissible, because the gate requires a sprint
declaration only for `status: open`. `check-backlog-state.mjs` exits 0. Two
non-blocking DRIFT findings remain by construction: ledger event 403's
`evidence.commit` is not a full 40-character lowercase OID, and
`pipeline.codex-read-only-steps-escalate-individually-instead-of-once`'s
`closure_commit` does not equal its final ledger `evidence.commit`.

**The 0.6.0 scope question the prior handovers carried as open is closed in the
artifacts.** `464c9c13` and `0644964f` landed the combined Nova+Phoenix framing
into `CHANGELOG.md`, `docs/whats-new-0.6.0.md`, `README.md`, `docs/overview.md`
and `docs/usage.md`; `VERSION` is `0.6.0`. Not reopened here.

**The release is blocked, and the blocker is an unmeasured interaction between two
individually correct changes.** Every link measured this session:

| Date | Event |
|---|---|
| 2026-07-27 | Last GREEN CI `verify` runs — four, all `pull_request` events, ~2 min each |
| 2026-08-01 | `2fc537d0` adds the hard `VERIFY-CLEANUP-REGISTRATION-REQUIRED` requirement to `verify-journal.mjs`: a run needs a bound onboarding session cleanup |
| from 2026-08-02 | EVERY CI run aborts after 8-29s at exactly that first step. Never green since |
| 2026-08-28 | `required_status_checks` → context `verify` added to the `protect-main` ruleset |
| 2026-08-31 | A `workflow_dispatch` run against the branch tip reproduces it: `VERIFY-JOURNAL-FAILED: VERIFY-CLEANUP-REGISTRATION-REQUIRED`, `verify-journal=1 -> exit 1`, 29s |

`protect-main` is `enforcement: active`, `bypass_actors: []`,
`current_user_can_bypass: "never"`. **Nothing currently reaches `main`** — not a
push, not a PR merge, not the repository owner. The ruleset requires a check the
harness has been structurally unable to produce for four weeks.

`backlog/items/2026-08-07-verify-gate-unreachable-without-a-session-cleanup-binding.md`
describes this exact abort and was closed on 2026-08-18 with the disposition "run
Verify from a session or worktree that has a binding" — right for a local agent
session, structurally inapplicable to a GitHub Actions runner, which has no
Pipeline session at all. The ruleset rule landed ten days after that closure.

**PO decision (`AskUserQuestion`, 2026-08-31): repair CI.** Explicitly not chosen:
removing `required_status_checks` from the ruleset (fast, but discards a
protection added three days earlier), and releasing without `main` via
`gh release create --target <feature-branch-sha>` (bypasses the ruleset
structurally, but leaves `main`/`stable` at 0.5.4, so a consumer installing from
the default branch still gets 0.5.4 — a label without distribution).

**The repair landed and was independently measured** (`ed491309`, NVA-CIVERIFY,
goldfish-deep). `registerBoundVerifyRun` no longer aborts when no bound cleanup
exists: on a genuinely `unbound`, neutral-tier state with no other active session
descriptor, it self-provisions a real session descriptor and a **private** binding
(`.git/agent-pipeline/**`, never the tracked authority file — the new
`bindEphemeralPrivateCleanup` refuses outright if a bind would land on tracked
storage), then satisfies the SAME sealed-receipt validation an ordinary session
does. Nothing was weakened: every other precondition still falls back to the
original refusal. **Elephant's own verification, not the dispatch's claim:** a
fresh clone at `ed491309` runs `verify.mjs` past `verify-journal` and into the
suites (index 439/505 observed), where the same clone previously aborted in 0.5s
with zero suites started. The previously unmeasured question — whether a plain
checkout reaches the neutral/private path — is answered yes, empirically.

**Two things that dispatch did NOT deliver.** It ended its turn waiting on a
background job it had started itself — the exact anti-pattern its briefing
forbids — so its record stays at `outcome: "committed-pending-report"` with no
final report. Unanswered, and therefore carried to the Critic: (1) the change lets
ANY session-less checkout self-provision a binding, a plain local clone included,
where the previous behavior was an outright refusal — intended, or to be narrowed?
(2) a `guard-lifecycle-ready.test.mjs` failure in its own reproduction log whose
expected paths point into `scratch/ci-repro/…` — clone-nesting artifact, or real?

**Sequencing consequence, and it inverts the obvious order.** A real CI proof
needs the commit on the remote, and `workflow_dispatch` can only run against a
pushed ref. But the feature branch is NOT covered by `protect-main`, so its push
needs only the ordinary signature ceremony, no green check. Therefore: push the
feature branch first, THEN dispatch CI against it, and only then is `main`
reachable for a tag and release. The push-approval ceremony comes BEFORE the CI
proof, not after — the fresh-clone result above is the strongest evidence
obtainable before a push, and it is not a CI result (the clone has a full PATH;
CI restricts it to `node`/`git`/`bash`/`sh`).

**Carried out of the rotated 2026-08-30 block, because neither has another home:**
retrospective follow-up items #7 and #8 stay deferred to Nova B per PO; and the
Critic 1+1 run on the sandbox-quickfix delta returned **FAIL** (1 major —
`roles/elephant.md` stage-0 fast-path violated by a self-committed fix to
`check-consumer-safe-paths.mjs`; 1 minor — `observeRunner()` untested, filed) with
**no Round 3 dispatched**; both were self-verified and documented, no functional
defect, but the FAIL is unresolved.

The closed item's own instruction was honoured: the repair does not weaken the
preflight or the registration check.

**User-facing documentation aligned with the real 0.6.0 state** (`f7ab9b42`,
NVA-DOC060, goldfish-implementor; diff collected by reading it, not from the
dispatch's report). `README.md`, `SETUP.md` and `PIPELINE_FLOW.md` still described
a two-runner, pre-Driver, Hawkeye-era picture while `docs/whats-new-0.6.0.md`,
`docs/overview.md`, `docs/usage.md` and `docs/README.md` already stated the real
candidate. Five corrections, detailed in the commit message: three-runner route
claims in `README.md`/`SETUP.md` with every "not proof of observed model identity"
qualifier retained; `SETUP.md` section B led by the guided Greenfield Driver;
`PIPELINE_FLOW.md`'s support boundary rewritten from the HAW-S/U/B/C package list
to the actual 0.6.0 boundary; an orphaned fragment removed from
`docs/runner-support.md`; the `1b`/`1c` heading order fixed. German reference
sections below the `DE-REFERENCE-BELOW` marker updated to match. Per PO
instruction a high-level accuracy pass only — detailed user documentation stays
Sprint Nightwing's work. **Implementation complete; no independent Critic review
of this diff has run.**

**The pre-push hook is now installed** (`.git/hooks/pre-push`, on the PO's
explicit instruction, who also stated that `git push --no-verify` stays
deliberately available as git's own escape). Until today this repository declared
`gates.push: blocking` with no git-layer hook behind it — preflight reported
`prePushHook: "absent"`, `unbackedGate: true`. That is why the 2026-08-30
emergency push left no trace in the hook's audit path: there was no hook for
`--no-verify` to bypass.

**Two items recorded as deliberately overridden or still open, not silently
dropped:** (1) the PO's standing instruction — "STOP after this stamp and wait for
the PO's own greenfield happy-path re-test before any push-approval ceremony" — is
**superseded by the PO's explicit release instruction of 2026-08-31**, a
deliberate override recorded as such; (2) the 2026-08-30 emergency push of both
branches (`--no-verify`, no `approve-push`, no Ed25519 proof) still has **no
retroactive disposition** and remains unreconciled.

**`docs/push-release-flow.md` is stale at Layer 6:** it states the ruleset
"currently enforces `deletion` and `non_fast_forward`". Since 2026-08-28 it also
enforces `required_status_checks` on context `verify`.

**Next:** full Verify at `ed491309`; then the independent Critic review of the
candidate (`release-preflight-cli.mjs` lists `critic` among its five
`FINAL_GATES`; none has run for this candidate), carrying the two unanswered
NVA-CIVERIFY questions above; then the final stamp of both runner manifests; then
the push-approval ceremony for the FEATURE BRANCH; then CI against the pushed ref;
and only then `main`, the tag and the release.

**Two PO decisions are outstanding and neither blocks the next step:** whether the
2026-08-30 emergency push gets a retroactive record or a documented waiver, and
whether the non-exhaustive 2026-08-17 privacy-review sweep runs before the push
ceremony — that item's own trigger ("before this branch is next pushed") is now
reached, so skipping it needs to be a recorded decision rather than an omission.
A fresh code-verified triage of all 11 deferred backlog items, with per-item
recommendations, is held in `scratch/deferred-items-triage-20260831.md`; the
`sprint:` frontmatter pass it proposes has not been applied.

### Carried forward from the rotated 2026-08-28 handover, because none has another home

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
