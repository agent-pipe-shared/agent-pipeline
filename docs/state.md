# Project state — Agent-Pipeline

> Canonical operational handover for this repository. It contains public
> repository state only; durable decisions remain in the ADR register.

## Archived history

| Date range | Summary | Archive |
|---|---|---|
| through 2026-08-19 | First real rotation: everything from the 2026-08-08 restart checkpoint through the inherited Nova/Cyborg-release history and every older era down to the open-items tail — extraction pass completed first (original pre-rotation line range 4977–19155; see the archive file's own provenance section and the ADR-0064 addendum dated 2026-08-19) | [state-archive/2026-08-19--pre-restart-and-nova-inherited-history.md](state-archive/2026-08-19--pre-restart-and-nova-inherited-history.md) |
| 2026-08-11 to 2026-08-19 | Checkpoints 1-60 (2026-08-11 through 2026-08-19 checkpoint 60): superseded session narrative; durable decisions already live in ADRs/backlog/guardrails per this repo's own standing convention, not uniquely in this prose. | [docs/state-archive/2026-08-19--checkpoints-1-through-60.md](state-archive/2026-08-19--checkpoints-1-through-60.md) |
| 2026-08-26 | 2026-08-25 Antigravity chat-gate-ceremony standardization, verify-tuner stage 2 acceptance, sprint-agy-runner delta4 Critic fix and candidate status | [docs/state-archive/2026-08-26--agy-runner-2026-08-25-handover.md](state-archive/2026-08-26--agy-runner-2026-08-25-handover.md) |

## Current handover — sprint_agy fetch, fast-forward, and clean local candidate (2026-08-26)

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

## CHECKPOINT — 2026-08-23 (71): checkpoint 70's work committed and pushed; local plugin/pipeline.user.yaml version-skew fixed on the way (READ THIS FIRST)

Checkpoint 70's work was still uncommitted at session start (PC switch). Committed atomically this session (`sprint_phoenix`, oldest first): `ed428603`/`8fb869e0`/`bd2806cb` (trailing grep-pipe `&&`-chain fix + ledger reconciliation), `a0e2424a` (PO triage: 2 closures + 4 Sentinel deferrals), `40fe7258`/`1b60318d` (hgo-cli-side-granted closure), `887ac164` (HGO governance/events drift-preimage fix), `36edb0e8` (pipeline.user.yaml: adopted antigravity runner + google critic-export rule from sibling `agy` checkout, PO-approved), `c8d97515` (tracked `specs/sprint-phoenix-epic/evidence/`), plus this checkpoint.

**Bootstrap blocker found+fixed:** locally-installed marketplace plugin (`0.6.0+claude.20260820200609.40d3b47`) requires an `antigravity` runner this repo's `pipeline.user.yaml` didn't declare → `source_invalid`/`unrepairable`, no in-session fix possible (file is GS-protected). Fixed by adopting the newer schema from the `agy` sibling checkout. **Still open:** no repo-side fix for the version-skew itself; may recur if the marketplace plugin advances again.

**Gotcha for next session:** `reconcile-backlog-ledger.mjs --activate` output must be committed in its own commit (GG-22 checks the full staged index, not the commit's pathspec) and needs `closure_commit` filled in on each closed item first.

**Next:** `harness/scripts/security-scan.mjs` (not under `plugins/pipeline-core/scripts/`) against this clean tree, then `docs/push-release-flow.md`'s signature ceremony.

## CHECKPOINT — 2026-08-23 (70): Phoenix backlog sweep complete — all open items resolved (READ THIS FIRST)

**Backlog items resolved and closed:**
1. `hgo-ceremony-should-reduce-po-involvement-to-only-the-external-signing-step`: **Closed** (`eabc96b6` + unit test verification in `guard-human-override.test.mjs`).
2. `hgo-author-repair-digest-withholding-is-bypassable-by-reading-the-request-store`: **Closed** (PO re-scoping confirmed, comment correction landed in `7473f6c9`).
3. `readonly-and-chain-grep-pipe-trailing-stage-not-implemented`: **Implemented and Closed** (`isBoundedReadOnlyAndChain` in `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` now evaluates per-segment and admits a trailing `isBoundedGrepPipeline`; unit test fixtures added in `guard-lifecycle-ready.test.mjs`).
4. `hgo-cli-side-granted-wiring-conflicts-with-arm-time-drift-check`: **PO Decision (Option 1) implemented** — `filterGovernanceEventsStatus` in `plugins/pipeline-core/lib/human-guard-override.mjs` excludes `governance/events/**` from the `statusSha256` drift check preimage, enabling fail-closed ledger appends before arming without triggering `HGO-DRIFT`. Unit test coverage added in `human-guard-override.test.mjs`.
5. `spec-retention-on-close`: **Closed** (`00fcc336` + `governance/spec-retention.json` + `check-spec-retention.mjs` fail-closed Verify gates).

**Sentinel-era baseline triage (4 deferred):**
All 4 Sentinel recovery placeholder items (`documentation-information-architecture`, `dual-channel-publication`, `regulated-document-hooks`, `stateful-design-contract-template`) triaged and set to `status: deferred`.

**Open backlog items remaining: 0** (full backlog sweep complete).

---

## CHECKPOINT — 2026-08-19 (68): full Verify GREEN (406/406) and security-scan CLEAN; moving to the push-approval ceremony (READ THIS FIRST)

**Full `harness/scripts/verify.mjs` is fully green: 406/406 suites, exit 0**, including `security-scan=0`. One real fix landed on the way: a gitleaks false positive on `governance/events/human/3-evt-gmw-revoke-....json`'s own `idempotencyKey` field (same class as the prior attribution-key false positive), fixed via `.gitleaksignore` content-fingerprint entry (`44245bf5`), independently confirmed via a standalone `security-scan.mjs` run before re-running full Verify.

**Operational note, not a code defect:** the first full-Verify attempt after the gitleaksignore fix hung for 30+ minutes on `session-cleanup-binding-tests` — diagnosed as CPU contention from an unrelated, concurrent Claude Code session's own heavy test run in the sibling Nova repo (confirmed via `ps aux`; that suite passed standalone in 5.4s once isolated). The orphaned `verify.mjs` process (still alive despite `TaskStop` reporting success) was killed directly; a retry completed cleanly. Two config-file gates required `git stash push -u`/`pop` around each run: both `verify.mjs`'s own candidate preflight and `security-scan.mjs`'s candidate snapshot refuse on ANY working-tree dirt (tracked or untracked), including this repo's own standing-dirty `dispatch-record.json`/`project/pipeline-state.json` files — not previously exercised this explicitly in this session's checkpoints.

**Next:** the push-approval ceremony (`gates.push_approval: signature`, `docs/push-release-flow.md`) at this exact candidate, then `git push origin sprint_phoenix` — the PO's "clean cut and push" instruction, final step.

---

## CHECKPOINT — 2026-08-19 (69): PUSHED — `origin/sprint_phoenix` now at `85b718cf`; session ends here, PC switch, next session fetches fresh (READ THIS FIRST)

**Push completed, all 5 layers.** Push candidate `85b718cf` (checkpoint 67 + a doc-reconciliation record on top): full Verify 406/406 green, `security-scan` clean, Layer 1b `check-doc-reconciliation.mjs` passed (5 ADRs checked: 0012/0045/0056/0058/0066, all "checked, no change needed" — see `docs/doc-reconciliation.md`). PO ran `authorize-critical` (first attempt failed on a real bug — `--expires-at` needs the EXACT `new Date(x).toISOString()` round-trip form including milliseconds, the push-release-flow.md doc's "normalized, not rejected" claim is wrong for this CLI validation path, not yet corrected in the doc — worth a small follow-up fix); corrected timestamp succeeded. Layer 4 (`pipeline-state.mjs approve-push`) and Layer 5 (`git push origin sprint_phoenix:refs/heads/sprint_phoenix`) both ran clean. **Verified: `git rev-parse origin/sprint_phoenix` = `85b718cfc71d5127da6d5214e81ef1f2ce2d3d47`, matching local HEAD exactly** (plus this checkpoint's own commit and the gitleaks-item closure below, both pushed after).

**Backlog bookkeeping gap found and partly fixed:** the pre-push goal check (Stop-hook) correctly caught that 2 already-fixed items were never marked closed in their own files (real fixes had landed same-session, only the backlog metadata lagged) — `2026-08-19-gitleaks-false-positive-in-guard-maintenance-window-attribution-key-generation-tag.md` closed this checkpoint (`c3bf83b7` fixed it originally, `8f336c7d` closes the bookkeeping).

**9 open items remain, not yet individually triaged this checkpoint — the next session's first job:**
- `hgo-author-repair-digest-withholding-is-bypassable-by-reading-the-request-store` (2026-08-19) — **investigated, largely already done**: the PO's own "Correction (this fix)" (the misleading digest-withholding comment) landed in `7473f6c9` ("digest-withholding comment correction"). Only "Candidate 4" (an explicit role-contract prohibition against reading `.git/agent-pipeline/human-guard-overrides/requests/**`) is still unactioned — grepped `roles/`, no such prohibition exists yet. Framed as optional ("cheap... still stands") in the PO's own triage, not mandatory. Likely closeable citing `7473f6c9`, with candidate 4 either done in the same pass or split to its own tiny item.
- `hgo-ceremony-should-reduce-po-involvement-to-only-the-external-signing-step` (2026-08-19) — **investigated, substantively implemented**: `eabc96b6` ("add HGO prepare-for-signature + refreeze-plan CLI") implements Proposal option 1 exactly (collapses plan→prepare-authorization→emit-signature-digest into one `prepare-for-signature` subcommand emitting ready-to-copy commands). Option 2 (can the Elephant run it directly, bypassing the Auto Mode classifier) was never tried/confirmed either way. Needs a close-or-narrow pass, not a full implementation.
- `hgo-cli-side-granted-wiring-conflicts-with-arm-time-drift-check` (2026-08-19) — real, undecided architectural question (3 candidate directions disclosed, none evaluated) — needs a PO decision.
- `readonly-and-chain-grep-pipe-trailing-stage-not-implemented` (2026-08-19) — deliberately deferred sub-scope of the closed shell-grammar item, real remaining work, not yet dispatched.
- `spec-retention-on-close` (2026-07-20) — not reinvestigated this checkpoint.
- `documentation-information-architecture`, `dual-channel-publication`, `regulated-document-hooks`, `stateful-design-contract-template` (all 2026-07-19, "Sentinel recovery baseline; no completion claim") — pattern strongly suggests these are accepted, intentional Sentinel-era carryover explicitly not required for Phoenix's own gates, but this was NOT freshly re-confirmed this checkpoint — verify against the Sentinel recovery record before assuming.

**PO instruction, this exact moment:** stopping work on this machine for a PC switch; next session on the other machine starts with a fresh fetch of this exact pushed state. No further work performed after this checkpoint — commit and push only.

---

## CHECKPOINT — 2026-08-19 (67): shell-grammar topic CLOSED (round-2 Critic PASS, backlog item closed); handover rotated (checkpoints 1-60 archived, file was over its size cap); starting the PO's "clean cut and push" sequence (READ THIS FIRST)

**Round-2 delta Critic: PASS.** F1/F2/F3 all independently re-derived and verified by the Critic through direct source/git reading (not taken on trust from the dispatch record) — mkdir-chain narrowing sound against traversal/symlink/case-sensitivity, the new test proves both directions on a genuinely governed root, the F3 doc-comment correction corroborated against the backlog item's own accepted Proposal text and the real follow-up commit `74ba2c75`. One **minor** finding: the goldfish's own verify evidence covered only `guard-lifecycle-ready.test.mjs` (48/48), not the project's single declared verify gate — disposed directly by folding into the full verify run next, not a 3rd dispatch.

**Backlog item closed:** `2026-08-19-closed-shell-grammar-still-rejects-common-readonly-composition.md` (`8247ae10`) — Proposal points 1-3 done and Critic-passed; the grep-pipe-as-trailing-stage sub-scope stays split into its own open item (`2026-08-19-readonly-and-chain-grep-pipe-trailing-stage-not-implemented.md`).

**Handover rotated.** `docs/state.md` hit its hard size cap (572597 bytes vs. a 30000-byte cap) while writing this checkpoint. Checkpoints 1 through 60 (2026-08-11 through the 2026-08-19 checkpoint-60 entry) archived to `docs/state-archive/2026-08-19--checkpoints-1-through-60.md` via `handover-rotate.mjs` (ADR-0066) — content preserved verbatim, not deleted. Extraction-pass judgment applied before rotating: this repo's standing convention throughout the session has been to file durable decisions as ADRs/backlog items/guardrail changes as they happen, never to leave them uniquely in checkpoint prose, so the archived narrative carries no unique durable rule. Also fixed in passing: the prior rotation's archive-history table used a different 4-column schema than this tool's 3-column format — merging them without a fix would have produced a malformed table; normalized to one consistent 3-column shape (small mechanical fix, both rows' content preserved).

**Shell-grammar topic is now fully closed** per the PO's own criterion set in their "clean cut and push" instruction. Proceeding directly to that instruction now: fresh full `harness/scripts/verify.mjs` → `security-scan.mjs` → push-approval ceremony (signature mode) → `git push origin sprint_phoenix`. Noted in passing, not yet acted on: `.claude/worktrees/` carries a large number of stale worktree directories from past Workflow runs — worth a cleanup pass but not a push blocker.

---

## CHECKPOINT — 2026-08-19 (66): shell-grammar Critic rework (F1/F2/F3) landed and independently re-verified; commit misattributed to `329ac49c` (documented, not history-rewritten); round-2 delta Critic next

**Rework `PHX-WP-READONLY-GRAMMAR-WIDEN-CRITIC-FIX1` complete, all 3 findings addressed.** F1 (blocker): `mkdir -p` admission narrowed from generic `isProjectWritePath` to exactly `scratch/`/`.claude/worktrees/` via new `CHAIN_ELIGIBLE_MKDIR_PREFIXES`/`isChainEligibleMkdirTarget` — independently grepped present in `guard-lifecycle-ready.mjs`. F2: new test proves both directions (admit narrowed target, refuse `guardrails/`) on a genuinely GOVERNED root, with a verified-stronger deviation from the literal spec — the guard refuses at the closed-grammar tokenizer layer for ANY `&&`, before `requireProjectOnboardingReadyFn` is ever reached in either direction, so "mock invocation observed" isn't achievable; the test asserts the stronger unconditional-refusal guarantee instead, with an explanatory in-test comment. F3: comment corrected from "unbriefed" to "accepted but deferred." Independently re-ran `node --test plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` myself: 48/48 pass.

**Commit-attribution defect found and NOT silently fixed.** The dispatch's own `git add`+`git commit` on its 2 files (`guard-lifecycle-ready.mjs`, `.test.mjs`) raced against this session's own commit and landed inside `329ac49c` ("docs(phoenix): close the two guard-hook registration backlog items") instead of its own commit — confirmed via `git show --stat 329ac49c`. Content is correct and at HEAD; only the commit boundary/message/trailers are wrong (missing `Dispatch: PHX-WP-READONLY-GRAMMAR-WIDEN-CRITIC-FIX1 (goldfish)`, subject doesn't mention the shell-grammar fix). Attempted a clean local split (`git reset --soft ac1afc86` then three separate re-commits) since both `329ac49c` and `6114e6f8` are still unpushed (`origin/sprint_phoenix` HEAD is `8a92d377`, well behind) — the auto-mode classifier blocked the `reset --soft` itself. Decision: do not fight the classifier for a cosmetic attribution fix with zero functional impact; document it here instead and move on. Ledger/backlog-closure evidence integrity is unaffected (those commits' own SHAs are unchanged).

**Next:** dispatch the round-2 delta Critic re-review (round 2 of the ~2-round budget, F1/F2/F3 as bare labels only). If PASS or only minor findings (dispose directly, no 3rd dispatch): proceed straight to the PO's "clean cut and push" instruction — fresh full Verify, `security-scan.mjs`, push-approval ceremony, `git push origin sprint_phoenix`.

---

## CHECKPOINT — 2026-08-19 (65): hook registration DONE, both backlog items closed, GMW window closed cleanly; 3 of 4 pre-existing reds now green

**Hook registration complete.** The V2 dispatch's own edit was correct for `verify.mjs` but hit a NEW, unrelated pre-existing gap in `docs/product-capability-inventory.json` (`guard-maintenance-window-cli-tests` — registered in `verify.mjs` from earlier GMW work, never added to the inventory) that made its own DoD check unsatisfiable regardless of how correct its briefed diff was — a scoping miss in how the item was briefed, not a dispatch failure. Diagnosed directly (a small Node script diffing `discoverSurfaces()` against the declared inventory) and split into two honest commits: `14bebfe6` (the goldfish's actual briefed diff, `Commit-Act: orchestrator` since the dispatch itself truncated before its own commit step) and `81cbba4f` (the Elephant's own isolated one-entry fix for the unrelated gap). Both `verify-suite-registration-check` and `check-product-capability-inventory.test.mjs` (16/16) now genuinely pass. Both backlog items closed with real evidence (`329ac49c`).

**GMW ceremony fully landed and cleaned up.** Three portable ledger events now committed (`24acc653` request+grant, `ac1afc86` the close/revoke) — closed the window immediately once its TP-3 scope was no longer needed (the still-in-flight shell-grammar rework only touches `guard-lifecycle-ready.mjs`, not `verify.mjs`).

**Status of the 4 original pre-existing reds: 3 fixed, 1 still open.** `spec-retention-check` ✅, `security-scan`'s gitleaks finding ✅, `verify-suite-registration-check` + `product-capability-inventory-tests` ✅ (this checkpoint) — only `security-scan`'s OTHER scanners (osv-scanner/semgrep/license-check) and a fresh full-gate run remain to confirm.

**Still in flight:** `PHX-WP-READONLY-GRAMMAR-WIDEN-CRITIC-FIX1` (fixing Critic round-1's blocker+2 major findings on the shell-grammar commit).

**PO instruction, this window:** once the shell-grammar topic is fully closed (rework verified, round-2 delta Critic disposed), do a clean cut here and push the current state to `origin/sprint_phoenix` — the promised final-gates sequence (fresh full Verify → `security-scan.mjs` → push-approval ceremony → push) is the literal next step after that, not a separate later ask.

---

## CHECKPOINT — 2026-08-19 (64): PO signed and installed the TP-3 maintenance window; Critic round 1 on the shell-grammar fix FAIL (1 blocker, 2 major) — rework dispatched; hook-registration retry in flight (READ THIS FIRST)

**Maintenance window ceremony completed.** The PO ran `guard-maintenance-window.mjs prepare` themselves (first attempt defaulted to the wrong plan/spec — Nova's, not Phoenix's, caught before signing and redone correctly), signed the intent digest externally via `po-human-approval.mjs sign-intent` (the generic signer this script already provides, `~/agent-pipeline-po-nova`), and `install`ed it. Window active: scope `TP-3`, bound to `2786fe64`, ~1.9h TTL from install. `PHX-WP-VERIFY-REGISTER-GUARD-HOOKS-V2` re-dispatched immediately to use it — in flight at this checkpoint.

**Critic round 1 on `b3153385` (shell-grammar widening): FAIL.** Finding 1 (**blocker**): `isChainEligibleSegment`'s `mkdir -p` branch admitted ANY in-repo path via the generic `isProjectWritePath`, not the backlog item's required narrower scratch/worktree set — proven live: a not-onboarding-ready governed session could `mkdir` anywhere in the repo (including `guardrails/`) via a two-clause `&&`-chain, bypassing the onboarding-readiness gate entirely. Finding 2 (major): the new regression test used an UNGOVERNED temp root, so it never actually exercised the bypass path Finding 1 lives in — vacuous, explaining how the bug shipped under 47/47 green. Finding 3 (major): the backlog's explicitly-accepted "grep-pipe as a trailing chain stage" requirement was not implemented, and the code's own comment mischaracterized it as "unbriefed" when it was PO-accepted scope.

**Rework dispatched** (`PHX-WP-READONLY-GRAMMAR-WIDEN-CRITIC-FIX1`, goldfish-deep): narrows the `mkdir -p` admission to exactly `scratch/`/`.claude/worktrees/`, adds a governed-root regression test proving both the narrowed admit and the still-refused case, corrects the F3 comment from "unbriefed" to "accepted but deferred." F3's actual implementation (the grep-pipe trailing stage itself) is deliberately NOT bundled into this rework — split into its own tracked item (`2026-08-19-readonly-and-chain-grep-pipe-trailing-stage-not-implemented.md`, `74ba2c75`) so the blocker fix isn't held up by a separate, riskier parser extension. In flight at this checkpoint.

**Next step:** await both in-flight dispatches. Hook-registration: verify + commit, watch the window's remaining TTL. Shell-grammar rework: this is round 1 of the ~2-round Critic budget — a round-2 delta re-review is appropriate once the fix lands (not a 3rd from-scratch review); dispose any further minor findings directly per round-cap policy rather than a 3rd dispatch.

---

## CHECKPOINT — 2026-08-19 (63): `closed-shell-grammar-still-rejects-common-readonly-composition` implemented (`b3153385`), independently re-verified, Critic review in flight; PO maintenance-window gate still the binding blocker (READ THIS FIRST)

**Shell grammar widened**, dispatched (`PHX-WP-READONLY-GRAMMAR-WIDEN`, goldfish-deep) and landed as `b3153385`: `guard-lifecycle-ready.mjs` now admits (a) a small explicit `&&`-chain allowlist (`git rev-parse`/`log` restricted-flags/`status`, `echo`, `ls`, `mkdir -p` restricted to already-writable paths) and (b) a trailing `2>/dev/null`/`2>nul` redirect on an already-admitted command. Disclosed boundaries drawn, not silently assumed: `2>&1` NOT admitted (shared tokenizer limitation, out of this dispatch's file scope), a chain ending in a pipe NOT admitted, `git log --all`/format/author/path flags excluded. Independently re-verified by the Elephant: commit trailer correct, file scope matches exactly (2 files), `node --test plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` re-run directly — 47/47 pass. Loose evidence/dispatch-record files the goldfish left at repo root were tidied into `scratch/` (ADR-0063 directory contract) before Critic dispatch.

**Critic review dispatched** (guardrail-tier, mandatory per this session's own established practice for every `guard-*.mjs` change) — in flight at this checkpoint, verdict not yet known.

**PO conversation, same window:** the PO asked live where the maintenance-window signature request was — clarified that only the `prepare` step (which builds the unsigned request) had been attempted, and it was blocked by the auto-mode classifier as a sensitive action; handed the PO the exact `prepare` command to run themselves via `!` (bypasses the classifier since it becomes the PO's own action), pending their external Ed25519 key.

**Next step:** await the Critic verdict on `b3153385` (fix any findings, or accept a clean pass). The PO maintenance-window ceremony (checkpoint 60/61's exact commands) remains the sole blocker for `PHX-WP-VERIFY-REGISTER-GUARD-HOOKS` and, downstream, the promised final-gates sequence (fresh full Verify → `security-scan.mjs` → new push-approval ceremony → push).

---

## CHECKPOINT — 2026-08-19 (62): closed `gmw-hgo-evidence-must-reach-the-phoenix-audit-ledger` (`e5b3af60`) — it had decided-but-unapplied closure text; split the real remaining gap into its own item (READ THIS FIRST)

**Found and fixed a decided-but-unapplied closure.** The item's own history (extensive, five progress notes across four dispatches, 2026-08-07 through 2026-08-19) already concluded "closing this item as partially delivered" — but the frontmatter still said `status: open`; the narrative decision was never actually applied to the record. Applied it: `status: closed`, evidence citing `b1c57d2c` (H-AC-12 amendment), `3504b707`/`bdd4517c` (GMW ledger emission), `025f9e1a` (HGO hook-side emission), `bce05e53` (HGO hook-side test coverage) — all four commits independently re-verified to exist and match their claimed content, not trusted from the item's own prose.

**Split out the one real remaining gap:** `backlog/items/2026-08-19-hgo-cli-side-granted-wiring-conflicts-with-arm-time-drift-check.md` — HGO's CLI-side `granted` ledger emission was attempted three times across this item's history and correctly reverted each time it got close: it's a genuine architectural conflict (fail-closed-arming per the design's §8.1 vs. the arm-time `HGO-DRIFT` re-derivation in `human-guard-override.mjs`), proven live via a full deny→authorize→consume round-trip test, not a scoping gap a tighter Goldfish briefing would fix. Needs a PO design decision among 3 disclosed candidate directions before any further dispatch attempts it.

**Process note for future ledger work:** hit and self-corrected a real mistake here — ran `reconcile-backlog-ledger.mjs --activate` once before fixing the closure item's `closure_commit` to a full Git OID (schema requires full lowercase SHA, not abbreviated), which baked the wrong short SHA into the hash-chained `transitions.ndjson`. Since the ledger is append-only/hash-chained by design, the fix was NOT to hand-patch the bad entry (would break the chain) — it was to `git checkout --` the still-uncommitted ledger projection files (transitions.ndjson/index.json/STATUS.md) back to their last-committed state and re-run reconciliation cleanly against the now-correct item file. This only works because the bad entries had never been committed; had they landed, this would need `check-backlog-state.mjs`'s dedicated evidence-amendment machinery instead (`planBacklogEvidenceAmendment`), which is a much heavier, JSON-Result-bound mechanism — reason to `check-backlog-state.mjs` BEFORE committing ledger changes, always.

**Next step:** the maintenance-window PO gate from checkpoint 60/61 is still the binding blocker for the final-gates sequence. While waiting, more Phoenix-scope backlog can be worked — `backlog/items/2026-08-19-closed-shell-grammar-still-rejects-common-readonly-composition.md` was next in the previously-stated order.

---

## CHECKPOINT — 2026-08-19 (61): gitleaks false positive fixed directly (`c3bf83b7`); 2 of 4 pre-existing reds now green, 2 still blocked on the PO's maintenance-window signature (READ THIS FIRST)

**`security-scan`'s gitleaks finding fixed** (`c3bf83b7`) — dispatched Goldfish `PHX-WP-GITLEAKS-ATTRIBUTION-KEY-FP` correctly stopped (per its stop conditions) rather than guess: the backlog item's own markdown had quoted the flagged line verbatim, creating a second live gitleaks finding at its own path, which the briefing hadn't scoped for. Disposed directly (small, mechanical, well under the EL-16 threshold): added the `content-v1` suppression entry for the real source finding, computed via the adapter's own `gitleaksContentAuthorityLine()` export (not hand-typed); reworded the backlog item's quote to avoid the `KEY...="..."` shape gitleaks matches on, rather than adding a second suppression entry the repo would keep needing to regenerate on every future rewording. Verified via the adapter's own `run()` against an isolated copy of just the three affected files: PASS, 0 findings.

**Status of the 4 pre-existing reds now: 2 fixed, 2 blocked.** `spec-retention-check` ✅ (checkpoint 60), `security-scan`'s gitleaks finding ✅ (this checkpoint). `verify-suite-registration-check` and `product-capability-inventory-tests` ❌ — both need the same `verify.mjs` edit, which is gated by `guard-testpath` TP-3 behind an expired maintenance window (checkpoint 60's finding still stands: needs a fresh PO signature ceremony).

**Next step:** get the PO's maintenance-window signature for the hook-registration fix (checkpoint 60 has the exact `prepare`/`install` commands); re-dispatch `PHX-WP-VERIFY-REGISTER-GUARD-HOOKS` once unblocked (the target edit is already fully scoped — `verify.mjs:352-353`, plus the `docs/product-capability-inventory.json` sibling-shape entries). Once all 4 are green, run the final-gates sequence — fresh full Verify → `security-scan.mjs` → new push-approval ceremony → push.

---
