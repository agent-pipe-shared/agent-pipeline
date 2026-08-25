# Project state — Agent-Pipeline

> Canonical operational handover for this repository. It contains public
> repository state only; durable decisions remain in the ADR register.

## Current handover — Antigravity CLI 3rd Runner Integration & Hardening (2026-08-25)

**READ THIS FIRST — 2026-08-25 session result.** F1 (the blocking
`await runVerifyJournal` gap) is fixed via the TP-3 signature ceremony
(commit `8f40f3f9`) and **independently confirmed green by a clean full
Verify run** (`evidence/verify-latest.json`, `binding: "exact"`,
383/385 green — the 2 red are both known/disclosed, see below, not
regressions). PO stepped away mid-session ("ich muss los") and authorized
continued autonomous backlog work (excluding later-sprint items);
**version bump + restart deliberately deferred** per explicit instruction
("wir verschieben den neustart").

**Verify-tuner stage 2 landed but the PO's 50–70% speed target is NOT
met — item stays open.** `AGY-VERIFYTUNER-2` (commit `adb9d57f`, truncated
once on tool budget, resumed) raised concurrency to 8 with a serial/
exclusive lane. Reaching a clean full run required this session's own
follow-up, which found and fixed FOUR real defects the dispatch's own
truncated report could not confirm were clean: a source-only-path comment
(`45e5de3a`), a `scratch/test-tmp/` volume cleanup (untracked, no commit),
a stale security-baseline hash (see next paragraph — blocked), and a
SECOND missing-`await`-on-now-async-`runVerifyJournal` bug, same class as
F1, in `publication-executor-productive-flow-tests` (`f4257e3d`). Measured
wall-clock: **6m58s vs. the ~12–14min baseline (~42–50% reduction)** —
real but short of target. Next lever identified: one suite,
`project-onboarding-v3-tests`, costs 116.5s of the 419s total — the
binding constraint now, not the concurrency cap. Full detail:
[backlog item](../backlog/items/2026-08-24-verify-mjs-runs-385-suites-strictly-sequentially.md).

**One fix sitting uncommitted, blocked by the Claude Code auto-mode
permission classifier — needs YOUR review, not mine.** A stale pinned
baseline hash for `roles/critic.md` in
`plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.v1.json`
(never updated when `e7ed7cda` legitimately changed that file, 2026-08-24).
The classifier correctly refused to let me `git add` an edit to a security
tamper-detection baseline without explicit human confirmation. The
corrected hash
(`d8067862aac6b676684f57e506eeb6c6ae209af36588994622ad3be5c0eaef03`,
independently computed, confirmed to make
`codex-isolated-critic-protected-preimage.test.mjs` pass 4/4) is an
uncommitted working-tree edit right now — `git diff --stat
plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.v1.json`
to see it, then stage/commit yourself (or ask explicitly).

**The 2 known-red suites in the clean run above (both disclosed, neither
a regression):** `human-guard-override-tests` (the marketplace-attestation
design defect — a Direction-3 recommendation is now written into
[its backlog item](../backlog/items/2026-08-24-verify-marketplace-attestation-blocks-normal-active-development.md),
awaiting your acceptance, not implemented); `codex-isolated-critic-
protected-preimage-tests` (red only because the fix above sits
uncommitted, not because of a real drift).

**Backlog closed/corrected 2026-08-25:**
`briefed-tool-budget-sits-below-an-unannounced-harness-maxturns-cliff`
(closed, part 3 confirmed with the missing data point), `kickoff-staging-
directory-mismatch` (closed — the investigation was already complete and
committed on 2026-08-24, this file just hadn't cross-referenced it),
`kickoff-untracked-files-missing-from-commits` (`closure_commit` corrected
after a same-day reversal — see next paragraph). `enforce-kickoff-po-
questions` looked dispatch-ready per an earlier summary but on direct
re-read is **NOT** — a genuine open PO design question (signature vs.
chat mode for the new gate kind) blocks it; still open, still needs you.

**A decision made and reversed same session, both by you:**
`project/.onboarding-staging/` was gitignored (2026-08-25, your call),
then you corrected it back — its content is used substantively by
`sprint-agy-runner` and must not be discarded (commit `e07a2b11` reverts
`169fba3d`). The remaining gap (an agent must be positively told to STAGE
that content, not just find it un-ignored) is cross-referenced into
`intake-generate-coordinator-path-undocumented-in-skill-references`.

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

1. Review and stage/commit the pending `codex-isolated-critic-protected-
   preimage.v1.json` fix (blocked by the auto-mode classifier, see lead
   section) — or explicitly ask for it to be committed.
2. Decide: spend the one remaining authorized re-critic round, or trust
   the independently-verified fixes and proceed to version bump.
3. Local version bump (`plugins/pipeline-core/plugin.json`) — deliberately
   deferred this session, ready whenever you are. Still no push without
   fresh explicit approval.
4. `enforce-kickoff-po-questions`: decide signature-vs-chat-mode for the
   new gate kind (full context already surveyed, recorded in the item).
5. `verify-marketplace-attestation-blocks-normal-active-development`:
   accept, reject, or amend the Direction-3 recommendation now in the item.
6. Restart Antigravity to empirically check D7's plugin-registration fix.
7. Optional follow-up: profile `project-onboarding-v3-tests` (116.5s of
   the verify-tuner run's 419s total) as the next lever toward the
   50–70% Verify speed target.

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

**Last updated:** 2026-08-25 — F1 fixed and independently reverified (clean
full Verify run); verify-tuner stage 2 landed with 4 real defects found and
fixed along the way, ~42–50% wall-clock reduction (target 50–70% not met,
item stays open); one security-baseline fix blocked by the auto-mode
classifier pending PO review; several backlog items closed/corrected
(maxTurns part 3, kickoff-staging-directory-mismatch, kickoff-untracked-
files pointer correction); a marketplace-attestation design recommendation
recorded, awaiting PO acceptance; version bump and restart deliberately
deferred per explicit PO instruction.

### Sentinel Links
- specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md
- specs/2026-07-19-sprint-sentinel-epic/spec.md
- specs/2026-07-19-sprint-sentinel-epic/backlog-acceptance-matrix.md
- specs/2026-07-19-sprint-sentinel-epic/public-private-reconciliation-design.md
- specs/2026-07-19-sprint-sentinel-epic/RECOVERY.md
- specs/2026-07-19-sprint-sentinel-epic/platform-support-contract.md
- specs/2026-07-19-sprint-sentinel-epic/windows-blockers-scope.md
