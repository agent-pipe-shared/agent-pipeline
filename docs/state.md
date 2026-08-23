# Project state — Agent-Pipeline

> Canonical operational handover for this repository. It contains public
> repository state only; durable decisions remain in the ADR register.

## Current handover — Antigravity CLI 3rd Runner Integration & Hardening (2026-08-23)

### Current completed & open work

The feature **`sprint-agy-runner`** (Issues #69, #92, #15; ADR-0067) is
implementation-complete. It is **not** verified, not review-cleared and not
PO-accepted: the required gate is red and the delta Critic review returned FAIL.
- **Dimension A (Interactive Session):** PreToolUse guardrails
  (`antigravity-pretool-guard.mjs`), registered for Antigravity through
  `.agents/plugins.json`. Whether that registration actually loads is the open
  question recorded as D7 below.
- **Dimension B (Headless Dispatch):** `antigravity-execution-host.mjs`
  executes headless `agy` invocations with `--sandbox` isolation, Gemini model
  mapping, and token usage normalization to `pipeline.runner-usage.v1`.
- **Tri-Runner Architecture:** Antigravity is a first-class third runner
  alongside Claude Code and Codex
  ([ADR-0067](adr/0067-tri-runner-antigravity-integration.md)).
- **Upstream rebase:** rebased onto the nova checkout's
  `feat/sprint-nova-codex-v046` (commit `94c5577a`) and pushed to
  `origin/sprint_agy`, which stands at `70fd1bc7`. Every commit after that point
  is local and unpushed.

### Candidate and gate status

Candidate: commit **`ea1432e96904f13f52cf591678b239d2f6a6d563`**, tree
**`ba4df6fc5ad6661f021e9129dfac2cc07c58525b`**. That is the commit both the
Verify run and the delta Critic review bound to. The commits after it are the
documentation of this review round — the two review records, this handover, two
backlog items and their ledger reconciliation — and contain no product change.
A handover that names its own candidate can never be the candidate it names, so
the gap is stated rather than chased.

- **Deterministic Verify — RED.** `node harness/scripts/verify.mjs` bound the
  candidate exactly at start and finish (`binding: "exact"`), 385 registered
  suites and 385 terminal receipts. **384 passed, 1 failed:**
  `human-guard-override-tests`. The failing case asserts that this machine's
  local marketplace plugin-tree copy is byte-identical to this checkout
  (`HGO-EXTERNAL-MARKETPLACE`). 18 files diverge. It is pre-existing drift, not
  a regression from the correction wave: `guard-apply-patch.mjs` diverges too,
  and its last change `dc84c177` is an ancestor of the reviewed base. The gate
  cannot go green until the marketplace resync happens, which makes the resync a
  gate dependency rather than the independent follow-up it was planned as.
- **Critic review — FAIL.** The first full review of `92037494..51dd7fc6`
  returned FAIL (3 blockers, 9 majors, 7 minors;
  `specs/sprint-agy-runner/evidence/2026-08-23-critic-review-agy-runner.md`). A
  correction wave of seven Goldfish dispatches plus Elephant-authored records
  addressed every finding; F2, F14 and the historical half of F10 have no code
  remedy and are PO-accepted as closed, disclosed in that record. The bounded
  delta review of the correction range then returned **FAIL** as well — 5
  majors, 2 minors, no proven blocker:
  `specs/sprint-agy-runner/evidence/2026-08-23-delta-critic-review-agy-runner.md`.
- **Security gate — GREEN.** `security-scan.mjs` run after the review-round
  commits: `cap.secrets` pass, `cap.sast` pass, `cap.sca` not-applicable,
  `verdict.blocking: false`, license-check PASS. Evidence in
  `evidence/security-latest.v2.verdict.json`.
- **Push:** no approval exists for any commit in this range. `gates.push_approval`
  is `signature`, so a push needs a detached Ed25519 proof bound to the exact
  candidate ([ADR-0056](adr/0056-push-approval-mode.md);
  [`docs/push-release-flow.md`](push-release-flow.md)).

### Open items

1. **D7 — the Antigravity enforcement layer is very likely not loading, and it
   is the most urgent item here.** `.agents/plugins.json` registers
   `"path": "plugins"`, but `install-agy.mjs` defines that field as a plugin
   root — the directory holding `plugin.json`, which is `plugins/pipeline-core`.
   `48591844` once bypassed this file entirely "for reliable loading". If the
   entry does not resolve, the whole PreToolUse layer fails open, which is a
   live candidate root cause both for the push escape the PO observed and for
   F10, whose mechanism the first review had to leave unexplained. No fix was
   applied because relative-path support is unverifiable without a running
   Antigravity runner, and the alternatives (absolute path, relative path,
   writing `.agents/hooks.json` directly) trade off against CLAUDE.md's
   machine-path rule. PO decision required. Full analysis in the delta review
   record and in
   [the backlog item](../backlog/items/2026-08-23-antigravity-plugin-registration-points-one-level-above-the-plugin-root.md).
2. **Delta-review findings D1–D6** are unaddressed. Fixing them creates further
   unreviewed commits, which collides with the PO's standing instruction of one
   review round without a re-critic. Sequencing is a PO decision.
3. **Marketplace resync and version bump**, PO-approved to follow the review,
   now also required for a green gate (see above). The local marketplace is
   machine-wide and also serves the nova checkout.
4. `pipeline-state.mjs inspect` reports `activeFeature: sprint-nova-epic`,
   inherited from the rebase; it does not name this feature.
5. Repo consolidation between this checkout and nova is undecided. The nova
   branch tip `94c5577a` is a strict ancestor of this branch.
6. `specs/sprint-agy-runner/prd_agy-runner.md` §2 still names `hooks.json` in
   `.agents/`; the file was migrated to `plugins.json` in `ffa55f78`. The PRD is
   the approved design artifact and predates the reviewed range, so it was left
   for a PO decision rather than edited.
7. A verify suite that asserts on a path outside the repository makes the
   deterministic gate machine-dependent: the same commit is green or red
   depending on marketplace state. Design question for the gate, separate from
   the resync itself.
8. The briefed subagent tool budget sits below an unannounced harness `maxTurns`
   cliff:
   `backlog/items/2026-08-23-briefed-tool-budget-sits-below-an-unannounced-harness-maxturns-cliff.md`.
9. Orchestrator notes and Critic dispatch scratch share one `scratch/`
   directory, so verdict-bearing material sits where a dispatched Critic is
   guaranteed to look:
   `backlog/items/2026-08-23-elephant-notes-and-critic-scratch-share-one-directory.md`.

### Next session instructions

1. Restart the Antigravity session (CLI `agy` or IDE reload).
2. Run `agy --execute "/pipeline-start"` to initialize the runtime context and
   activate client-side hooks.

### Durable-rule and history pointers

The Decision 7 extraction audit and authoritative rule map are in
[ADR-0066](adr/0066-handover-rotation-extraction-archive-hard-size-gate.md.
The extraction completion is recorded in
[the basis backlog item](../backlog/items/2026-08-07-handover-file-has-no-rotation-obligation.md.
The canonical handover, dispatch, gate, directory, retention, and runner
rules remain in the ADR/policy/guardrail homes listed by that audit.

Historical narrative and provenance were not deleted. They remain available
through the existing archive index and files:

| Period | Archive |
|---|---|
| 2026-08-19 Wave 5 / TP-3 | [wave5-tp3.md](state-archive/2026-08-19--wave5-execution-round1-through-tp3-ceremony.md |
| 2026-08-19 Critic round 2 / GMW | [critic-r2-gmw.md](state-archive/2026-08-19--critic-round2-orphan-through-tp3-gmw-ceremony.md |
| 2026-08-19 step 6 dispatch and landing | [step6.md](state-archive/2026-08-19--step6-dispatch-through-landing.md |
| 2026-08-18 daytime history | [observation-publication-queue.md](state-archive/2026-08-19--observation-publication-queue.md |
| 2026-07-19 to 2026-07-25 | [open-items-and-next-block.md](state-archive/2026-08-19--open-items-and-next-block.md |
| 2026-08-11 to 2026-08-18 | [nova-055-afk-block-through-sentinel-cyborg-reconciliation.md](state-archive/2026-08-18--nova-055-afk-block-through-sentinel-cyborg-reconciliation.md |
| 2026-07-30 to 2026-08-07 | [oldest-nova-047-history.md](state-archive/2026-08-18--oldest-nova-047-history.md |

## Operational head

- Project calibration: [`project/pipeline.json`](../project/pipeline.json).
- Required gate: `node harness/scripts/verify.mjs`.
- Formal decisions: [`docs/adr/README.md`](adr/README.md; no state-local
  override is active.
- No reusable full-bootstrap receipt is stored publicly; run the full
  bootstrap. Machine-local installation details and private receipts are not
  versioned here.
- Active Sentinel authority and retention are governed by
  `governance/spec-retention.json` and the linked recovery package; no
  completion or go-live claim is made by this handover.
- For this task, Nova B is explicitly out of scope.

**Last updated:** 2026-08-20 — Decision 7 extraction audit completed and the
handover item closed; no rotation or extraction marker was written.

### Sentinel Links
- specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md
- specs/2026-07-19-sprint-sentinel-epic/spec.md
- specs/2026-07-19-sprint-sentinel-epic/backlog-acceptance-matrix.md
- specs/2026-07-19-sprint-sentinel-epic/public-private-reconciliation-design.md
- specs/2026-07-19-sprint-sentinel-epic/RECOVERY.md
- specs/2026-07-19-sprint-sentinel-epic/platform-support-contract.md
- specs/2026-07-19-sprint-sentinel-epic/windows-blockers-scope.md
