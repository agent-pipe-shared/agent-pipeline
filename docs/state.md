# Project state — Agent-Pipeline

> Canonical operational handover for this repository. It contains public
> repository state only; durable decisions remain in the ADR register.

## Current handover — Antigravity CLI 3rd Runner Integration & Hardening (2026-08-25)

**READ THIS FIRST — 2026-08-25 session, updated after PO check-in.** F1
fixed and independently reverified (clean full Verify run, `binding:
"exact"`, 383/385 green). Verify-tuner stage 2 landed at ~42–50% wall-
clock reduction (target was 50–70%); **PO reviewed and explicitly
accepted the partial result rather than chasing the remainder** — item
closed (`9b7b1d4d`/`0874225f`/`bbee2df4`), no further concurrency/
profiling work authorized unless something new comes up. The
`project-onboarding-v3-tests` (116.5s) lever is recorded in the closed
item for whoever picks it up later, not a blocker.

**Security-baseline fix reviewed and committed by the PO** (`309e87b4`) —
the `codex-isolated-critic-protected-preimage.v1.json` stale-hash
correction that the auto-mode classifier had held back is now landed.

**Version bumped and installed:** `plugins/pipeline-core/plugin.json` →
`0.6.0+20260825.bbee2df4` (commit `9ef7e31a`), PO-requested, local only,
no push. **Known open snag:** PO rsynced the marketplace copy and ran
`claude plugin update`, which reported an unrelated-looking cached version
string (`0.6.0+claude.20260820200609.40d3b47`) instead of picking up the
new one — confirmed the on-disk marketplace copy DOES have the correct
new version (`grep version` on the rsynced `plugin.json`), so this is a
Claude Code CLI-side cache/registry quirk, not a file-sync problem. PO's
call: leave it for now ("erstmal dann so weiter"), suggested next step if
revisited is a full session restart (guaranteed fresh plugin load) or
re-registering the local marketplace.

**`enforce-kickoff-po-questions` — a chat-mode approval primitive is being
built in stages; push (A) is DONE, kickoff (B) is dispatched, PRD/Spec (C)
still needs its own dispatch.** Full history: `AGY-KICKOFFPOQ-1` first
found `po-human-approval.mjs`/`po-approval-gate.mjs` had zero chat-mode
concept to join (`17d23532`); PO picked "build a real primitive first"
(`fa581be7`); scope widened same day to also cover PRD/Spec plan-approval
(`a7af05f3`), surfacing a real overlap with `po-gate-authority.mjs`'s
existing PRD-marker mechanism (ADR-0021 explicitly rejects attribution-only
approval) that needed a PO call.

**CRITICAL live finding, same day (PO chat report), independently
confirmed by code read:** during an Agy/Antigravity test, an agent granted
itself a push approval under `gates.push_approval: chat` —
`pipeline-state.mjs`'s `approve-push` chat path printed the `PO-XXXX`
challenge code to the SAME process's own stdout/stderr and accepted it
back via a second CLI call, with no enforced human-turn boundary at all.
Filed as its own item (`b69c4ed3`).

**PO decision, same day: standardize all three (push, kickoff, PRD/Spec)
onto ONE registry — REPLACE, not alongside** (`4fa93a95`). Reasoning:
fewer distinct approval mechanisms in the codebase, not more variants.
Still explicitly excludes CRs (a separate future issue).

**`AGY-CHATADAPTER-1` landed (A), the push fix — DONE, independently
reverified, item CLOSED** (`589278ed`/`e4ababc8`/`4ac72a57`). New reusable
primitive `plugins/pipeline-core/lib/chat-gate-ceremony.mjs`
(`requireAttendedChatGateConfirmation()`/`isAttendedTerminal()`, gates on
`process.stdin.isTTY` BEFORE any read — an agent's own tool call has no
live human on fd 0, only a genuinely attended terminal does), wired into
`approve-push`, `--challenge` CLI flag removed entirely (commit
`1ad664a8`). This session independently re-ran `pipeline-state.test.mjs`
and `check-consumer-safe-paths.test.mjs` itself (not just the dispatch's
self-report) — both green, including a real spawned-subprocess proof that
piped stdin carrying the correct code still gets refused.

**Correctly declined, worth remembering:** a mid-task `SendMessage`
relaying the PO's "standardize all three" decision to the ALREADY-RUNNING
`AGY-CHATADAPTER-1` was correctly REFUSED by that dispatch — its field 4
never granted write scope on `po-gate-authority.mjs`/ADR-0021, and a
scope change reopening a rejected ADR alternative needs a properly
authorized dispatch, not a chat relay. Right call by the dispatch, not a
failure — do not try to shortcut a scope amendment via SendMessage again;
build a fresh briefing instead.

**Scope correction found by that same dispatch, confirmed independently:**
`--profile` is not a valid flag on `kickoff plan`/`kickoff apply` at all
(guard-rejected) — it belongs only to `kickoff promote plan`/`apply`, a
separate later call site. (B)'s corrected scope is therefore TWO call
sites (kickoff plan/apply `--language`, kickoff promote `--profile`), not
one command with two flags as originally assumed. Recorded in the item
(`6bd1798e`).

**Dispatched: `AGY-CHATADAPTER-2`** (goldfish-deep, background, in flight
as of this write) — gates both corrected kickoff call sites through
`chat-gate-ceremony.mjs`; a third possible call site (`intake-consent-apply
--language`) is investigate-and-decide-only, implement only if it reuses
the pattern cleanly. Explicitly forbidden from touching `pipeline-state.mjs`,
`chat-gate-ceremony.mjs`, `po-gate-authority.mjs`, ADR-0021, or
`docs/operating-model.md` — those stay for a separate (C) dispatch. Item
stays `open` regardless of how this lands (outcome C is a separate,
not-yet-dispatched piece). Ruleset SHA `6bd1798e`.

**Still not dispatched:** outcome (C), PRD/Spec plan-approval
standardization replacing `po-gate-authority.mjs`'s marker mechanism — the
biggest, most architecturally sensitive piece (reopens ADR-0021), needs
its own properly-scoped dispatch with those files in field 4.

**Secondary tooling defect found and filed (not blocking, worked
around):** `backlog-item-strip-for-dispatch.mjs` drops every section after
the first `## Triage` heading, not just verdict-shaped content — confirmed
twice now (`445e436f`); both chat-adapter dispatches were briefed with RAW
backlog-item paths instead of the stripped copies.

**`verify-marketplace-attestation-blocks-normal-active-development` —
CLOSED (`253398a6`/`4e2babd1`/`c69017fe`).** `AGY-MKTATTEST-1` landed
PO-approved Direction 3: WARN-downgrade in `human-guard-override.test.mjs`
(F1) + new hard blocking check in `guard-push.mjs`
(`checkMarketplaceAttestation()`, reuses `localPluginInstallSourceObservation()`,
never a second comparison), committed `cbd22d4f`. Independently confirmed
by this session (not just self-report): `human-guard-override.test.mjs`
76/76 (WARN visible, F1 still real), `guard-push.test.mjs` 159/159
including the two new positive/negative push-block cases. Two full Verify
runs: the first (`binding: exact` @ `cbd22d4f`) found exactly one red
suite, traced to an unrelated pre-existing defect (see next item, fixed
separately); the second (`binding: exact` @ `4955303f`, includes that fix)
came back fully green, `exitCode: 0`, 385/385.

**Real defect found by that Verify run, already fixed:** an earlier
same-session "closure-pointer correction" on `kickoff-untracked-files-
missing-from-commits` (see below) had rewritten `closure_commit` to
`e07a2b11`, breaking `check-backlog-state.mjs`'s invariant that a closed
item's `closure_commit` must equal its own final transition-ledger event's
`evidence.commit` (the ledger, `backlog/transitions.ndjson`, is append-only
and hash-chained — it had already recorded `169fba3d` for this item's
closing transition, before the later revert existed).
`reconcile-backlog-ledger.mjs` cannot repair this: it only reconciles
STATUS transitions, never revisits an already-closed item's recorded
evidence. `backlog-state.mjs` has a purpose-built `evidence-amendment`
ledger-event kind for exactly this correction, **but no CLI/writer script
implements it yet** (confirmed by search — only the library, its own
tests, and the checker's validation logic reference it; a real gap for
whoever needs to correct a closure_commit going forward). Fix applied:
reverted `closure_commit` back to `169fba3d` (the ledger-bound value),
documented why in the item, regenerated `backlog/index.json`
(`f7d4583c`). `check-backlog-state.mjs` now exits 0.

**Still open, revised:** `kickoff-untracked-files-missing-from-commits`
— `closure_commit` is now `169fba3d` again (see above; do NOT "correct"
it back to `e07a2b11` without first building the evidence-amendment
writer). The positive staging-guidance gap is cross-referenced into
`intake-generate-coordinator-path-undocumented-in-skill-references`, not
yet implemented. D7 empirical Antigravity verification still outstanding.

### Current completed & open work

The feature **`sprint-agy-runner`** (Issues #69, #92, #15; ADR-0067) is
implementation-complete. All seven delta-review findings (D1–D7) have a PO
disposition and every code fix has landed and been independently verified;
the third and fourth delta Critic rounds (findings F1–F7, then the F1
blocker) are both fully addressed, see below. The feature is still **not
PO-accepted**: no push approval exists, and the D7 fix (`.agents/
plugins.json` path correction) is an unverified config-value correction
pending an empirical check in a running Antigravity session.

- **Dimension A (Interactive Session):** PreToolUse guardrails
  (`antigravity-pretool-guard.mjs`), registered through `.agents/plugins.json`
  (`entries[0].path` corrected to `"plugins/pipeline-core"`, D7, `c15ccdff`
  — plausible fix, still unverified empirically).
- **Dimension B (Headless Dispatch):** `antigravity-execution-host.mjs`
  executes headless `agy` invocations with `--sandbox` isolation, Gemini model
  mapping, token usage normalization to `pipeline.runner-usage.v1`.
- **Tri-Runner Architecture:** Antigravity is a first-class third runner
  alongside Claude Code and Codex
  ([ADR-0067](adr/0067-tri-runner-antigravity-integration.md)).
- **Upstream rebase:** rebased onto the nova checkout's
  `feat/sprint-nova-codex-v046` (commit `94c5577a`), pushed to
  `origin/sprint_agy` at `70fd1bc7`. Every commit after that point is local
  and unpushed.

### Candidate and gate status

Candidate: commit **`29988d7eb747ab0c0b7b15834e39dc09d290eff0`** (HEAD as
of this write; one uncommitted edit pending your review, see above).

- **Deterministic Verify — last clean full run 383/385 green
  (`evidence/verify-latest.json`, `binding: "exact"`, 2026-08-25T05:59–06:06Z),
  the 2 red both known/disclosed above, not regressions.**
- **Critic review — third delta round (F1–F7) fully addressed; fourth
  (final, round-budget-exhausted) round returned FAIL on one blocker (F1,
  the `await` gap) — that blocker is now fixed and independently
  reverified per this file's lead section.** Full history:
  `specs/sprint-agy-runner/evidence/2026-08-23-critic-review-agy-runner.md`,
  `2026-08-23-delta-critic-review-agy-runner.md`,
  `2026-08-24-delta3-critic-review-agy-runner.md`,
  `2026-08-24-delta4-critic-review-agy-runner.md` (FAIL/blocker record).
  Remaining self-disposition question from delta-4 (F2: two guardrail-
  adjacent files were edited directly under `stage-0 (elephant)` instead of
  dispatched, likely the same defect class as delta-3's F2) — not yet
  weighed by the PO. One authorized re-critic round remains unused; your
  call whether to spend it or trust the independently-verified fixes.
- **Security gate — GREEN** (`security-scan.mjs`, `cap.secrets`/`cap.sast`
  pass, `cap.sca` not-applicable, `verdict.blocking: false`).
- **Trust anchor rotated** (commit `93b7775e`, PO-applied directly).
- **Version:** `plugins/pipeline-core/plugin.json` at
  `0.6.0+20260824.b4ffd460` (commit `ab28f9ae`) — the NEXT bump is what
  this session deferred, pending your return.
- **Push:** no approval exists for any commit in this range.
  `gates.push_approval` is `signature` — a push needs a detached Ed25519
  proof bound to the exact candidate
  ([ADR-0056](adr/0056-push-approval-mode.md);
  [`docs/push-release-flow.md`](push-release-flow.md)). No push without
  fresh explicit approval.

### Open items

1. **D7 empirical verification still open** — the `.agents/plugins.json`
   path fix is unverified pending a real Antigravity session load check.
2. `pipeline-state.mjs inspect` reports `activeFeature: sprint-nova-epic`
   (inherited from the rebase). PO decision: leave it — nova has its own
   repo/intake, do not force a `close-feature` ceremony. Repo consolidation
   with nova (branch tip `94c5577a`, a strict ancestor of this branch) is
   separately undecided.
3. **`critic-and-verify-cadence-may-be-too-fine-grained`** (PO-initiated,
   2026-08-24): whether Critic/Verify review should batch onto larger
   collection blocks instead of every small diff — analysis-only, no
   disposition yet:
   `backlog/items/2026-08-24-critic-and-verify-cadence-may-be-too-fine-grained.md`.
4. **`workflow-tool-dispatches-produce-no-dispatch-record-artifact`** —
   mitigation applied (`workflow-dispatch.md` pre-dispatch grep step,
   `00e23bc7`), but this is a behavioral mitigation, not a structural
   guarantee. Stays open pending live confirmation next time the Workflow
   tool (not the Agent tool — AGY-VERIFYTUNER-2 used Agent, which already
   produces a correct record and does not confirm/deny this item) lands a
   committing dispatch.

### Next session instructions

1. Check the two in-flight dispatches (`AGY-KICKOFFPOQ-1`,
   `AGY-MKTATTEST-1`) — read their dispatch records
   (`evidence/dispatch-record-AGY-KICKOFFPOQ-1.json`,
   `evidence/dispatch-record-AGY-MKTATTEST-1.json`) and resume
   procedurally (never take over their work directly) if either truncated.
   Watch for the shared-verify-evidence-slot collision risk noted in the
   lead section.
2. Decide: spend the one remaining authorized re-critic round on
   `sprint-agy-runner`, or trust the independently-verified fixes.
3. The `claude plugin update` stale-cache-string snag (lead section) —
   revisit if it still matters; a full session restart is the suggested
   next step if so.
4. Restart Antigravity to empirically check D7's plugin-registration fix.

### Durable-rule and history pointers

The Decision 7 extraction audit and authoritative rule map are in
[ADR-0066](adr/0066-handover-rotation-extraction-archive-hard-size-gate.md).
The extraction completion is recorded in
[the basis backlog item](../backlog/items/2026-08-07-handover-file-has-no-rotation-obligation.md).
The canonical handover, dispatch, gate, directory, retention, and runner
rules remain in the ADR/policy/guardrail homes listed by that audit.

Historical narrative and provenance were not deleted. They remain available
through the existing archive index and files:

| Period | Archive |
|---|---|
| 2026-08-19 Wave 5 / TP-3 | [wave5-tp3.md](state-archive/2026-08-19--wave5-execution-round1-through-tp3-ceremony.md) |
| 2026-08-19 Critic round 2 / GMW | [critic-r2-gmw.md](state-archive/2026-08-19--critic-round2-orphan-through-tp3-gmw-ceremony.md) |
| 2026-08-19 step 6 dispatch and landing | [step6.md](state-archive/2026-08-19--step6-dispatch-through-landing.md) |
| 2026-08-18 daytime history | [observation-publication-queue.md](state-archive/2026-08-19--observation-publication-queue.md) |
| 2026-07-19 to 2026-07-25 | [open-items-and-next-block.md](state-archive/2026-08-19--open-items-and-next-block.md) |
| 2026-08-11 to 2026-08-18 | [nova-055-afk-block-through-sentinel-cyborg-reconciliation.md](state-archive/2026-08-18--nova-055-afk-block-through-sentinel-cyborg-reconciliation.md) |
| 2026-07-30 to 2026-08-07 | [oldest-nova-047-history.md](state-archive/2026-08-18--oldest-nova-047-history.md) |

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
`chat-gate-ceremony.mjs` fixed (`f6c9800a`). Still open: HGO's
`authorize --activate` chat-mode path needs the same attendance check (a
correct, reviewed implementation exists but was reverted uncommitted —
broke 12 pre-existing tests, no CLI wiring yet — needs a clean redo); GWM
itself has no chat-mode activation path yet (barely started, reverted).
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

**AFK backlog sweep in progress (PO directive, chat, 2026-08-25):** working
through the remaining 17 open items (12 general + `gwm-kernel-doc-drift` +
`guard-dispatch-fail-open` + the 3 `in_progress` items) via one Workflow
run, 17 parallel worktree-isolated `goldfish-deep` agents, each deciding
`implemented`/`recommend-close`/`needs-po-decision`/`blocked` and actually
building (not just designing) where warranted. `codex-runner-has-no-real-
support-on-native-windows` already closed separately (won't-fix, PO: no
Windows daemon exists, existing mitigation suffices). `AGY-HGOFIX-2` (HGO
chat-gate wiring, serial, no isolation, shared checkout) also still
running concurrently — does not conflict with the sweep's isolated
worktrees. Results pending; each will be independently re-verified
(worktree diff + tests run directly) before being merged/closed, per
`workflow-dispatch.md`'s "never trust a returned result alone" rule.

### Sentinel Links
- specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md
- specs/2026-07-19-sprint-sentinel-epic/spec.md
- specs/2026-07-19-sprint-sentinel-epic/backlog-acceptance-matrix.md
- specs/2026-07-19-sprint-sentinel-epic/public-private-reconciliation-design.md
- specs/2026-07-19-sprint-sentinel-epic/RECOVERY.md
- specs/2026-07-19-sprint-sentinel-epic/platform-support-contract.md
- specs/2026-07-19-sprint-sentinel-epic/windows-blockers-scope.md
