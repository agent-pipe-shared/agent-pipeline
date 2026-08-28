# Project state — Agent-Pipeline

> Canonical operational handover for this repository. It contains public
> repository state only; durable decisions remain in the ADR register.

## Archived history

| Date range | Summary | Archive |
|---|---|---|
| 2026-08-28 | The complete sprint-alfred-epic design phase: epic switch, six measured lifecycle gaps, two Critic cycles plus the gate-1 rejection and rework, the six PO decisions, the doctrine graduation and the PO plan approval | [docs/state-archive/2026-08-28--current-handover-alfred-clone-sprint-alfred-epic-opened-in-d.md](state-archive/2026-08-28--current-handover-alfred-clone-sprint-alfred-epic-opened-in-d.md) |
| 2026-08-28 | Phoenix-line handover pointer stub; its body was rotated earlier and lives in the archive already | [docs/state-archive/2026-08-28--phoenix-line-history-superseded-by-the-nova-line-above-prese.md](state-archive/2026-08-28--phoenix-line-history-superseded-by-the-nova-line-above-prese.md) |
| 2026-08-28 | 0.6.0 local candidate green in one run (EP07 root cause fixed); AK status incl. the unwireable AK-5 guard; open combined-release decision carried forward into the current handover | [docs/state-archive/2026-08-28--prior-handover-verify-is-green-in-one-run-candidate-0-6-0-lo.md](state-archive/2026-08-28--prior-handover-verify-is-green-in-one-run-candidate-0-6-0-lo.md) |
| 2026-08-28 | Nova line: backlog-ledger merge semantics (ADR-0068), ADR renumbering (ADR-0069) and the first handover rotation | [docs/state-archive/2026-08-28--prior-handover-ledger-merge-capability-adr-renumbering-hando.md](state-archive/2026-08-28--prior-handover-ledger-merge-capability-adr-renumbering-hando.md) |
| 2026-08-27 | sprint_agy fetch, fast-forward, and the 2026-08-26 clean local candidate | [docs/state-archive/2026-08-27--prior-handover-sprint-agy-fetch-fast-forward-and-clean-local.md](state-archive/2026-08-27--prior-handover-sprint-agy-fetch-fast-forward-and-clean-local.md) |
| 2026-08-19 through 2026-08-23 | Phoenix-line checkpoints 61-71 (2026-08-19 through 2026-08-23), preserved verbatim as history after the Nova merge made the Nova line authoritative. | [docs/state-archive/2026-08-27--phoenix-checkpoints-61-71.md](state-archive/2026-08-27--phoenix-checkpoints-61-71.md) |
| through 2026-08-19 | First real rotation: everything from the 2026-08-08 restart checkpoint through the inherited Nova/Cyborg-release history and every older era down to the open-items tail — extraction pass completed first (original pre-rotation line range 4977–19155; see the archive file's own provenance section and the ADR-0064 addendum dated 2026-08-19) | [state-archive/2026-08-19--pre-restart-and-nova-inherited-history.md](state-archive/2026-08-19--pre-restart-and-nova-inherited-history.md) |
| 2026-08-11 to 2026-08-19 | Checkpoints 1-60 (2026-08-11 through 2026-08-19 checkpoint 60): superseded session narrative; durable decisions already live in ADRs/backlog/guardrails per this repo's own standing convention, not uniquely in this prose. | [docs/state-archive/2026-08-19--checkpoints-1-through-60.md](state-archive/2026-08-19--checkpoints-1-through-60.md) |
| 2026-08-26 | 2026-08-25 Antigravity chat-gate-ceremony standardization, verify-tuner stage 2 acceptance, sprint-agy-runner delta4 Critic fix and candidate status | [docs/state-archive/2026-08-26--agy-runner-2026-08-25-handover.md](state-archive/2026-08-26--agy-runner-2026-08-25-handover.md) |

## Current handover — sprint-alfred-epic: plan APPROVED, phase implementation (2026-08-28)

**READ THIS FIRST on `feat/sprint-alfred`.** The design phase is closed. The
PO approved the plan on 2026-08-28 (`approve-plan --by "PO"`, 11:29:48Z),
scope bound to `specs/sprint-alfred-epic/prd_sprint-alfred-epic.md`
(`aa730465…`) + `spec.md` (`6e6c8713…`), profile `epic`; phase then set to
`implementation` (lifecycle `implementing`, `f54770ce`). The full design
narrative — epic switch, six measured lifecycle gaps, three Critic cycles,
the gate-1 rejection and rework — is in
[`docs/state-archive/2026-08-28--current-handover-alfred-clone-sprint-alfred-epic-opened-in-d.md`](state-archive/2026-08-28--current-handover-alfred-clone-sprint-alfred-epic-opened-in-d.md).

**The approved shape.** The epic's center of gravity is agent-first
architecture; Tracks A/B/C are the substructure that makes Track D's claims
true, not a parallel mandate. The binding doctrine is
`specs/sprint-alfred-epic/design/agent-first-architecture.md`, named as the
PRD's **normative architecture basis**: every work package is designed,
implemented and reviewed against it, and a deviation needs a recorded
decision, never silent drift. All six PRD §9 decisions are answered
(decision 6, 2026-08-28: **the wave order stands** — D-track is not pulled
ahead of Wave 2, because D3's conformance claims are only honest on top of
A1/A2's measured enforcement; accepted cost is calendar visibility).

**Next: PRD §5 wave 0, in this order.**

**AK status.** AK-9/10/11 met (full green run; both manifests + `VERSION` at
0.6.0; every declared hook *wired* and byte-identical to the installed copy).
AK-14 filed for Nova B. **AK-5 is closed — this paragraph previously said the
opposite and was stale (corrected 2026-08-28).** It read: "the one true inert
guard — `guard-dispatch-budget.mjs` is built, 15/15, Verify-registered, but
`hooks/hooks.json` is on `NEVER_LIFTABLE_KERNEL_PATHS`, so no maintenance window
can wire it." It IS wired: `731ff1b8` added it to the PreToolUse manifest and
`1b45d6f9` then replaced a matcher that matched nothing. The installed manifest
carries three `guard-dispatch-budget.mjs` entries, byte-identical to the repo
copy. Left as a correction rather than a deletion because the false claim was
load-bearing — it named a blocker that no longer exists. **AK-6** is ready to re-dispatch
against `pipeline-user-v3.schema.json` (the first attempt used the pre-v3 schema
and would have flagged a correct calibration as drifted; withdrawn in `1d6dec55`,
scaffolding kept at `8316dbd8`).

**Live blockers and debts carried into implementation:**

- **Verify currently refuses** with `VERIFY-CLEANUP-REGISTRATION-REQUIRED`
  (no session identity to bind a cleanup descriptor). Irrelevant to design,
  **blocking for implementation** — resolve before the first candidate needs
  a green gate.
- **OPEN PO release decision:** 0.6.0 is a combined Nova+Phoenix number (PO
  2026-08-26, ADR-0043) — intake Phoenix and release combined, or release
  Nova alone under a different number. Blocks calling a *published* artifact
  "0.6.0"; local `0.6.0+…` candidates are unaffected.
- **AK-5:** `guard-dispatch-budget.mjs` is built and Verify-registered but
  unwireable — `hooks/hooks.json` is on `NEVER_LIFTABLE_KERNEL_PATHS`.
  Prepared PO hand-edit: `scratch/AK-5-hooks-json-patch-for-the-PO.md`.
- **AK-6** is ready to re-dispatch against `pipeline-user-v3.schema.json`
  (first attempt withdrawn `1d6dec55`, scaffolding kept `8316dbd8`).
- **Homeless durable content:** the 0.4.7-hotfix Result amendment text (owner
  + 2026-08-31 review date for the #21 worker-pool gap) survives only in
  `d545ae4a` and still needs a legitimate home in that backlog item — the
  review date is imminent.
- **Fold at next legitimate touch:** the post-compact reground observation
  (`PCR-CONTINUITY-MISSING` / `workResumptionAllowed: false` against a state
  the live observers accept) belongs in the `discard-feature` observer item;
  kept here to avoid ledger DRIFT noise.
- **Canon gap, unresolved by design:** no sanctioned `Dispatch:` trailer form
  exists for direct Elephant design commits. `stage-0 (elephant)` is bound to
  the operating-model §3.3 fast path, so stamping it on large authority work
  would be a false classification — worse than the honest `UNVERIFIABLE`
  `dispatch-authorship-verify` reports today. Item filed 2026-08-27.
- **Seven `sprint: alfred` defect items** filed by this design phase are part
  of the epic's own closure set (AC-13). The live count is **28**; read it
  with `check-backlog-sprint-assignment.mjs`, never from a written number.

**Session/machine facts.** Pipeline `0.6.0+claude.20260827211222.562aadb`
(local development). Session model Fable 5 at `max`, PO-set (MP-01 named
exception); the cheap-configuration switch moves to the next gate
presentation. PO trust anchor verified byte-identical to the configured
`local-po-key` (`2de20a39…`). Pre-push hook installed in this clone
(untracked, `.git/hooks`). Continuity revision 1.

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

