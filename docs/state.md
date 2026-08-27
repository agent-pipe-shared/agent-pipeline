# Project state — Agent-Pipeline

> Canonical operational handover for this repository. It contains public
> repository state only; durable decisions remain in the ADR register.

## Archived history

| Date range | Summary | Archive |
|---|---|---|
| 2026-08-19 through 2026-08-23 | Phoenix-line checkpoints 61-71 (2026-08-19 through 2026-08-23), preserved verbatim as history after the Nova merge made the Nova line authoritative. | [docs/state-archive/2026-08-27--phoenix-checkpoints-61-71.md](state-archive/2026-08-27--phoenix-checkpoints-61-71.md) |
| through 2026-08-19 | First real rotation: everything from the 2026-08-08 restart checkpoint through the inherited Nova/Cyborg-release history and every older era down to the open-items tail — extraction pass completed first (original pre-rotation line range 4977–19155; see the archive file's own provenance section and the ADR-0064 addendum dated 2026-08-19) | [state-archive/2026-08-19--pre-restart-and-nova-inherited-history.md](state-archive/2026-08-19--pre-restart-and-nova-inherited-history.md) |
| 2026-08-11 to 2026-08-19 | Checkpoints 1-60 (2026-08-11 through 2026-08-19 checkpoint 60): superseded session narrative; durable decisions already live in ADRs/backlog/guardrails per this repo's own standing convention, not uniquely in this prose. | [docs/state-archive/2026-08-19--checkpoints-1-through-60.md](state-archive/2026-08-19--checkpoints-1-through-60.md) |
| 2026-08-26 | 2026-08-25 Antigravity chat-gate-ceremony standardization, verify-tuner stage 2 acceptance, sprint-agy-runner delta4 Critic fix and candidate status | [docs/state-archive/2026-08-26--agy-runner-2026-08-25-handover.md](state-archive/2026-08-26--agy-runner-2026-08-25-handover.md) |

## Current handover — ledger-merge capability, ADR renumbering, handover rotation (2026-08-27)

**READ THIS FIRST.** Three connected pieces of work, all committed, all on
`feat/sprint-nova-codex-v046`.

**1. The backlog ledger can now be merged across parallel sprints** — the
capability the Phoenix merge proved missing. [ADR-0068](adr/0068-backlog-ledger-merge-semantics.md)
records the decision; the defect it fixes was a contradiction sitting unnoticed
in one module, because it is invisible while nothing moves: chain validation
demanded an amendment's `from`/`to` equal the item's CURRENT status, while
supersession recognition and the planners demanded the status frozen in a
registry. Both readings coincide until a second line advances the item, and then
they are mutually unsatisfiable. An amendment is now status-neutral and binds
its target by `entryHash` rather than physical position. All 38 Phoenix
reachability amendments migrated; the measurement that matters is that the same
append took `check-backlog-state.mjs` from 13 findings to 73 before the change
and leaves it unchanged after. `backlog-state.test.mjs` 55/55 including BS26,
which can finally exercise what it was written for. Commits `87203a08`,
`e8e65eb4`, `14f028bb`, `72c1c48d`, `086c3430`.

**2. The six duplicate ADR numbers the merge produced are being resolved.**
[ADR-0069](adr/0069-adr-numbers-are-allocated-at-acceptance.md): numbers are
allocated at ACCEPTANCE, never at drafting, and carry no sprint prefix. Five of
six done — 0062→0071, 0064→0073, 0065→0074, 0066→0075, 0061→0070. **0063 is
still open** and is the largest (97 files, ~185 ambiguous bare references);
expect `repository-directory-contract` to keep the number on reference load.

**3. `docs/state.md` is editable again** — it was 48,825 bytes against its own
30,000-byte cap, which blocked every session that follows the bootstrap
protocol. Checkpoints 61–71 rotated to `docs/state-archive/2026-08-27--phoenix-checkpoints-61-71.md` (`da70d0df`).

### Still open, in order

1. **Collision 0063 → 0072.** The only remaining `DUPLICATE-NUMBER` finding.
2. **Register `check-adr-consistency.mjs` in `verify.mjs`** (ADR-0069 D3). The
   checker already existed and already worked; `verify.mjs` simply never ran it,
   which is why six collisions could land unreported. Do this AFTER 0063, or
   Verify goes red by design.
3. **BS25/BS26 durability** (ADR-0068 D6, not yet written): three positional
   lookups remain (`backlog-state.mjs:1326`, `:1504`, and the test's fixture).
   Two can bind by `entryHash`; `amendsSequence` has no hash in its event shape
   and needs an additive `amendsEntryHash`. The test fixture must stay
   positional — it needs a contiguous valid chain — so the prefix invariant
   becomes a NAMED check instead of a silent assumption.
4. **Full `verify.mjs` run** once the above land.

### Recommended for this candidate (Nova A), everything else Nova B

- `handover-file-exceeds-its-own-size-cap` — **done above**, close it.
- `long-dispatches-truncate-before-emitting-their-report` — hit **five times**
  in the 2026-08-27 session alone; two dispatches lost their report entirely and
  one nearly lost its work. The closing-allowance fix is already designed.
- `existing-repos-drift-on-agy-pipeline-user-yaml-update` — adoption blocker for
  every existing repo once 0.6.0 ships.
- `gitleaks-content-fingerprint-breaks-on-any-line-insertion` — presents as an
  unexplained blocking secret scan.
- `antigravity-hard-enforcement-layer-has-two-fail-open-paths` — **PO
  instruction 2026-08-27: the agy security items belong in the candidate.** The
  residual path is not small: the entire Antigravity hard-enforcement layer
  (PreToolUse guards, mandatory-bootstrap hard block) is inert whenever the
  daemon cannot resolve `node`, and it fails SILENTLY because the hook that
  would report it is the one that does not run. Its own QG-06 review horizon
  (`due: 2026-08-30`) is three days out.

Five further items are finished but not closed (ledger-merge, BS26,
claude-start-time, tp-guard-restore, intake-generate-coordinator — the last is a
status/Triage contradiction). Closing them is bookkeeping, but until it happens
every backlog overview is wrong.

### Ledger discipline — extracted 2026-08-27, applies to the closures above

Both rules existed ONLY in the rotated checkpoints and are now filed
(`f5a77841`): a `reconcile-backlog-ledger.mjs --activate` result is committed
ALONE, because GG-22 inspects the whole staged index rather than the commit's
pathspec; and `check-backlog-state.mjs` runs BEFORE committing a ledger change,
since an uncommitted bad reconciliation is undone with `git checkout --` on the
three projection files while a committed one needs the heavy evidence-amendment
machinery. `closure_commit` needs a FULL lowercase OID.

## Prior handover — sprint_agy fetch, fast-forward, and clean local candidate (2026-08-26)

**READ THIS FIRST — 2026-08-26 session.** PO instruction: fetch the newest
Nova state from `origin` branch `sprint_agy` (same remote,
`agent-pipe-shared/agent-pipeline` — already registered as both `origin`
and `upstream`; not a separate/third-party remote) into this checkout and
build a clean local candidate. `git merge-base feat/sprint-nova-codex-v046
origin/sprint_agy` equaled this branch's exact prior tip (`0d5a6e6b`), so
`origin/sprint_agy` was a strict fast-forward descendant, not a divergent
branch — no merge conflicts, nothing to reconcile by hand. Fast-forwarded
cleanly (`git merge --ff-only`), 271 commits, bringing in the full
tri-runner Antigravity/Agy integration (ADR-0067, `specs/sprint-agy-runner/`,
`plugins/pipeline-core/hooks/antigravity-*`, `install-agy.mjs`,
`pipeline.user.yaml` schema bump) plus the 2026-08-19→2026-08-26 backlog
history already summarized in the prior handover section below.

**Local plugin refresh was required before bootstrap would go ready again**
(`docs/claude-local-plugin-development.md`'s documented, deliberately
operator-only step): the fetch bumped `plugins/pipeline-core`'s schema/
manifest past what the session's enforcing local-marketplace copy
(`~/agent-pipeline-local-marketplace`, stale since the 2026-08-19 stamp)
recognized (`pipeline.user.yaml is not a valid V3 source`,
`project-onboarding-v3.mjs plan-source-recovery` returned `unrepairable`
with no agent-executable `nextAction`). The PO ran the prescribed
`cp -a .../plugins/pipeline-core ~/agent-pipeline-local-marketplace/plugins/`
+ `claude plugin update pipeline-core@agent-pipeline-local --scope user`
+ `/reload-plugins` themselves (this is intentionally not agent-executable —
GUARD-CROSS-REPO-MUTATION refuses a session writing into its own enforcing
plugin root); bootstrap was green again immediately after.

**First full Verify on the fetched tip found one genuine, pre-existing gap
— not a merge artifact, not a new regression.** `origin/sprint_agy`'s own
tip carried two 2026-08-26 `docs(backlog): record ...` filing commits
(`2b68ec79`, `1ebec15f`, for
`existing-repos-drift-on-agy-pipeline-user-yaml-update-no-migration` and
`push-approval-record-always-trails-the-signed-commit`) with no
`chore(backlog): reconcile ledger` follow-up — the pattern every other
filing commit in that branch's own history paired one-for-one. Confirmed
via `reconcile-backlog-ledger.mjs` (plan mode: "Would record 2
transition(s)"), fixed via the sanctioned writer (`--activate`), committed
separately (`75de5950`, `chore(backlog): reconcile ledger for the two
2026-08-26 filing commits`). Note for whoever next fetches from
`sprint_agy`: if this branch continues, watch for the same
filing-without-reconciliation gap at its new tip.

**Candidate stamped and independently reverified clean twice.** Both
runner manifests bumped to `0.6.0+{claude,codex}.20260826182242.75de595`
(commit `3268fcd8`) — the Antigravity manifest
(`plugins/pipeline-core/plugin.json`, `0.6.0+20260825.bbee2df4`) was left
as-is: the documented local-candidate stamp convention
(`docs/claude-local-plugin-development.md`) only names the Claude/Codex
manifests, and Verify already passed clean without touching it. **Full
Verify: 385/385 suites, exit 0, twice** (once directly after the ledger
fix, once again after the manifest stamp) — no known/accepted exceptions
outstanding this time (the prior `human-guard-override-tests`
marketplace-mirror exception from the 2026-08-19 handover did not recur).
Confirmed genuinely parallel: the bounded async worker pool
(`AGY-VERIFYTUNER-1/2`, default concurrency 8) ran the 385-suite set in
~2m17s, with multiple suites' `startedAt` timestamps within ~500ms of each
other before any had completed.

**Not yet done at that point:** push, push-approval ceremony, Critic review
of the fetched range. See the release-readiness block immediately below —
superseded by it, kept here for the exact 385/385 evidence trail.

### Release-readiness follow-up (same 2026-08-26 session, continued)

**PO correction: 0.6.0 is a combined Nova+Phoenix release number, not a
Nova-only one** — Phoenix ([ADR-0043](adr/0043-post-go-live-sprint-model.md),
evidence/governance/decisions/audit-export/traceability) runs alongside
Nova per the PO's 2026-08-17 sprint order and was intended to land together
under 0.6.0. Do not release this candidate as "0.6.0" alone without
resolving that with the PO first; do not use "0.5.7" either (not a real
target — `VERSION` and every stamp already say 0.6.0). Undecided as of this
writing: intake Phoenix now and release combined, or release Nova alone
under a different number. **Nova B is confirmed NOT a blocker either way**
— `specs/sprint-nova-epic/plans/nova-b.md` slice B3-A scoped Nova B's own
Agy touchpoint as a deliberate non-functional stub only, explicitly
deferring the real Agy work to "#69's later dedicated AGY sprint" — which
is exactly the `sprint-agy-runner` work just fetched. Nova B and Agy are
independently scoped and independently releasable.

**PO instruction: before deciding release timing, re-triage TODAY (not at
their 2026-08-30 due dates) the 3 open Antigravity QG-06 residual-risk
items, then run Critic + re-Critic.** Disposition:

- `antigravity-hard-enforcement-layer-has-two-fail-open-paths` — point 1
  (swallowed-error write) was already fixed (`3ae43380`, pre-existing).
  Point 2 (daemon can't resolve `node` on `$PATH` → hook never fires, no
  in-repo fix possible) got a NEW observability mitigation: dispatched
  `AGY-HARDENFORCE-DETECT-1` (goldfish-deep, non-isolated/shared-tree —
  truncated once at the 50-turn cliff mid-task with real uncommitted work
  in the tree, resumed via a purely-procedural SendMessage per
  `workflow-dispatch.md`'s recovery pattern, then committed
  `ab347a74` "feat(preflight): detect whether the Antigravity
  hard-enforcement hook fired this session"). **Not yet independently
  re-verified by the Elephant** (DoD/Verify/final report from the resumed
  leg still outstanding as of this note) — do not treat as landed until
  that lands and is checked.
- `antigravity-plugin-registration-points-one-level-above-the-plugin-root`
  and `antigravity-sandbox-containment-push-escape-route-unclosed` — both
  CLOSED directly by the Elephant (no code work possible/warranted: item 2's
  fix was already applied and semantically correct per the installer,
  remaining acceptance criterion needs a live Antigravity runner no session
  here has; item 3's real fix needs its own properly-scoped security design,
  not an ad hoc dispatch, and the risk is already fully disclosed in
  `specs/sprint-agy-runner/spec.md` sec.8.2/sec.9 row 8). Commits:
  `2b6680ed` (closure narrative), `3009e13f` (closure metadata),
  `f7bc54c4` (ledger reconciliation).

**A 4th, separate item surfaced by the PO mid-session and judged more
release-relevant than the original 3** (affects every existing
already-onboarded consumer repo, not just Antigravity adopters):
`existing-repos-drift-on-agy-pipeline-user-yaml-update-no-migration`
(filed 2026-08-26, explicitly "undesigned" — no confirmed repro). The
Elephant's own quick check found the JSON-schema diff itself
backward-compatible (enum widening only: `runners.enabled`/`default` gained
`antigravity`, `critic_export.rules[].provider` gained `google`; no new
`required` fields) and `runtime.targetsSha256` unchanged before/after the
fetch — pointing toward "no actual break at the schema layer" but NOT yet
proof, since the item names two other candidate mechanisms
(chat-gate-ceremony standardization; per-repo push-approval-mode
confirmation pre-filled from the machine default) not yet checked. PO
instruction: scope AND fix in parallel with the above. Dispatched
`AGY-CALIBRATION-MIGRATION-1` (goldfish-deep, **worktree-isolated** —
correctly required since `AGY-HARDENFORCE-DETECT-1` above was actively
committing in the shared main tree at dispatch time;
`.claude/worktrees/agent-<id>` landed on the expected stale
`0d5a6e6b` base per the known worktree-provisioning trap, briefing carried
the mandatory self-heal instruction to `f7bc54c4c5415f894c900b8240084feb8e797e6a`).
Briefed to reach one of two honest outcomes: (A) a real break exists →
build a scoped detection+migration path, or (B) no break reproduces →
land a backward-compatibility-pinning regression test and write up the
evidence, not to force a migration mechanism for an unconfirmed problem.
**Result not yet known as of this note — dispatch was in progress.**

**Also filed this session, needs a real home:**
`sendmessage-mid-task-scope-relay-rule-has-no-durable-home` — a durable
operational rule (found during the ADR-0066 extraction pass that rotated
the 2026-08-25 handover section below) that has no home in
`docs/operating-model.md` or `workflow-dispatch.md` yet: a PO decision that
widens a running dispatch's scope must not be relayed via `SendMessage` —
build a fresh, properly-scoped briefing instead.

**Next steps once both dispatches land (not done yet):** (1) Elephant
independently re-verifies each dispatch's DoD/Verify claims directly
(never trust the returned report alone — check `git log`/`git status`/run
the suites), per `workflow-dispatch.md`'s "never trust a returned result"
rule. (2) Reconcile `AGY-HARDENFORCE-DETECT-1`'s and (if it closes
anything) `AGY-CALIBRATION-MIGRATION-1`'s backlog-item Triage/closure
directly (Elephant work, not delegated). (3) Run one more full
`node harness/scripts/verify.mjs` on the combined result. (4) Dispatch an
independent Critic review over the full accumulated range since
`0d5a6e6b` (271 fetched commits + every commit this session made:
ledger fixes, manifest stamp, the two closures, the handover rotation, and
whatever these two dispatches land) — capped at 2 Critic rounds per this
repo's own working practice; self-verify a 3rd-round rework instead of a
3rd Critic dispatch. (5) Only then return to the PO with a release
recommendation, including the still-open Nova+Phoenix version-number
question above.

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

