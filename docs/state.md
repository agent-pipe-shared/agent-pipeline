# Project state — Agent-Pipeline

> Canonical operational handover for this repository. It contains public
> repository state only; durable decisions remain in the ADR register.

## Current handover — Antigravity CLI 3rd Runner Integration & Hardening (2026-08-24)

### Current completed & open work

The feature **`sprint-agy-runner`** (Issues #69, #92, #15; ADR-0067) is
implementation-complete. All seven delta-review findings (D1–D7) have a PO
disposition and every code fix has landed and been independently verified.
Deterministic Verify is green. The feature is still **not PO-accepted**: no
push approval exists, and the D7 fix ("very likely" root cause of the
Antigravity load gap) is an unverified config-value correction pending an
empirical check in a running Antigravity session.

- **Dimension A (Interactive Session):** PreToolUse guardrails
  (`antigravity-pretool-guard.mjs`), registered for Antigravity through
  `.agents/plugins.json`. `entries[0].path` was corrected from `"plugins"` to
  `"plugins/pipeline-core"` (D7, commit `c15ccdff`) — plausible root cause of
  the load gap, but unverified: no running Antigravity session confirmed it
  empirically this session.
- **Dimension B (Headless Dispatch):** `antigravity-execution-host.mjs`
  executes headless `agy` invocations with `--sandbox` isolation, Gemini model
  mapping, and token usage normalization to `pipeline.runner-usage.v1`.
- **Tri-Runner Architecture:** Antigravity is a first-class third runner
  alongside Claude Code and Codex
  ([ADR-0067](adr/0067-tri-runner-antigravity-integration.md)).
- **Upstream rebase:** rebased onto the nova checkout's
  `feat/sprint-nova-codex-v046` (commit `94c5577a`) and pushed to
  `origin/sprint_agy`, which stands at `70fd1bc7`. Every commit after that
  point is local and unpushed.

### Candidate and gate status

Candidate: commit **`96581b7f651cebc56f72107a218f0c2a0e851ef2`**, tree
**`8644f26c8d0e3e07a7eec7387d98cc3649b41e29`**. That is the commit the final
Verify run bound to.

- **Deterministic Verify — 384/385 green; the 1 red is a known,
  already-disclosed environmental issue, not a code defect.**
  `node harness/scripts/verify.mjs` bound the candidate exactly at start and
  finish (`binding: "exact"`), 385 registered suites. Evidence:
  `evidence/verify-latest.json`.
  - `antigravity-pretool-guard-tests`: **green** (independently re-run too,
    42/42) — confirms the `AGY-FIX3-HARDENING` fix (F1/F2/F6) below.
  - `backlog-state-check`: **green** (the `f07b22f4` taxonomy-type fix holds).
  - `test-tmpdir-budget-tests`: **green**.
  - `human-guard-override-tests`: **RED again** — the marketplace copy
    (`~/agent-pipeline-local-marketplace/plugins/pipeline-core`) drifted
    from this checkout again the moment `96581b7f` touched
    `plugins/pipeline-core/hooks/antigravity-pretool-guard.mjs` (confirmed
    via `diff -rq`, 2 files differ). It was rsynced clean once already this
    session (at `f07b22f4`) and needs another rsync — this is exactly the
    friction the design-defect backlog item below describes; ran the full
    gate anyway rather than blocking on it, since the PO was AFK and this
    is a known non-functional cause, not a fresh regression:
    [backlog item](../backlog/items/2026-08-24-verify-marketplace-attestation-blocks-normal-active-development.md).
  - **Next session/PO action: rsync the marketplace copy again, then
    re-run Verify once for a clean 385/385 confirmation** before treating
    this candidate as gate-clean.
- **Critic review — FAIL, then fully addressed, no re-critic run yet.** The
  first full review of `92037494..51dd7fc6` returned FAIL (3 blockers, 9
  majors, 7 minors;
  `specs/sprint-agy-runner/evidence/2026-08-23-critic-review-agy-runner.md`).
  A correction wave addressed every finding; F2, F14 and the historical half
  of F10 have no code remedy and are PO-accepted as closed. The bounded delta
  review of the correction range then returned **FAIL** as well — 5 majors, 2
  minors, no proven blocker:
  `specs/sprint-agy-runner/evidence/2026-08-23-delta-critic-review-agy-runner.md`.
  **The PO disposed of all seven delta findings on 2026-08-24** (recorded in
  that same file's "PO disposition, 2026-08-24" section): D1, D2, D3, D4 and
  D6 fixed in code (commits `1b55b98c`, `30e0adcc`, `06483053`, `4244ad7a` +
  the signature-ceremony D4 test coverage, `42196d50`); D7 fixed as an
  unverified config correction (`c15ccdff`); D5 accepted as closed (same
  disposition class as the first review's F2 — unrewritable historical
  authorship gaps, GIT-05 forbids rewriting history to add a `Dispatch:`
  trailer retroactively).
  **A third, delta-scoped Critic review ran on 2026-08-24 and also returned
  FAIL** — 4 majors, 3 minors, route `claude-opus-5 at max`:
  `specs/sprint-agy-runner/evidence/2026-08-24-delta3-critic-review-agy-runner.md`.
  Two majors are regressions the D-fix wave itself introduced or left open
  (F1: the D2 regex fix over-corrected into a new false-negative that lets
  markdown-prefixed prose steer past the Contamination Rule; F2: the D3 fix
  repairs only the local regex check — `guard-dispatch.mjs`, the nested
  guard that actually runs contamination/task-frame checks, still only ever
  sees `Subagents[0]`, so a Critic at index ≥1 still skips it entirely).
  F1/F2 plus F6 (residual shell inline-exec forms D6 didn't enumerate:
  `bash -lc`, `zsh -c`, `dash -c`) are **fixed and independently verified**
  — `AGY-FIX3-HARDENING` (goldfish-deep), commit `96581b7f`, 42/42
  `antigravity-pretool-guard.test.mjs` cases and 9/9
  `check-consumer-safe-paths.test.mjs` cases re-run directly by the
  Elephant, not only trusted from the dispatch report. F7 (a stale
  `spec.md` Wave 3 reference to the retired
  `.agents/hooks.json` generator) is fixed (commit `c077ac7f`). **F3, F4,
  and F5 are explicitly NOT self-dispositioned and need a PO decision:**
  F3 — five `AGY-FIX2-*` goldfish-trailer commits have no
  `evidence/dispatch-record-*.json` (the dispatches genuinely ran via the
  Workflow tool this session, but that path evidently doesn't produce the
  standard dispatch-record artifact `dispatch-authorship-verify.mjs`
  expects — a tooling gap, not fabricated authorship, but unresolved); F4 —
  the D4 test-coverage commit (`4244ad7a`, 78 lines of new TP-5 test
  infrastructure) was labelled `stage-0 (elephant)` but doesn't fit the
  actual stage-0 criteria (≤~25 diff lines, no test-file change) — a real
  process misclassification by this session, not repairable after the fact
  without rewriting history (GIT-05); F5 — the `stage-0` fast-path
  citation ("`docs/operating-model.md` §3.3") is broken across ~20 files
  including vendored plugin copies (the section doesn't exist; the real
  definition lives inline in `roles/elephant.md`) — too large a blast
  radius to fix unsupervised for a minor finding, left for a dedicated
  dispatch.
  This is the third of at most four allowed Critic rounds on this package —
  one further round remains after the next correction lands.
- **Security gate — GREEN.** `security-scan.mjs` passed as suite 385/385 in
  the full Verify run above: `cap.secrets` pass, `cap.sast` pass, `cap.sca`
  not-applicable, `verdict.blocking: false`, license-check PASS.
- **Trust anchor rotated.** The PO's local signing key had been regenerated
  on 2026-08-17 on a different machine without the committed trust anchor
  (`project/critical-human-proof.json`) being updated; the PO applied the
  rotation directly in their own terminal (commit `93b7775e`), the same route
  as the file's two prior rotations — a signature cannot bootstrap trust in
  the very key it would need to already trust.
- **Version bumped:** `plugins/pipeline-core/plugin.json` to
  `0.6.0+20260824.b4ffd460` (commit `ab28f9ae`), PO-approved to follow the
  review round.
- **Push:** no approval exists for any commit in this range. `gates.push_approval`
  is `signature`, so a push needs a detached Ed25519 proof bound to the exact
  candidate ([ADR-0056](adr/0056-push-approval-mode.md);
  [`docs/push-release-flow.md`](push-release-flow.md)). PO's standing
  instruction: no push without fresh explicit approval, and (this session)
  save a nova rebase if this candidate turns out to be sound
  ("nach erfolgreichem Kandidaten sparen wir uns ggf. nova rebase").

### Open items

1. **Marketplace rsync confirmed done by the PO (chat, 2026-08-24) and
   independently confirmed clean (`diff -rq`, no output).** A final,
   uninterrupted full Verify run for a clean 385/385 confirmation is still
   outstanding — a background run was started and then deliberately killed
   this session before finishing (candidate-drift false-failure risk once
   further commits landed; correctly identified before it could burn 13
   minutes for nothing) — then superseded by the verify-tuner/backlog-triage
   work below. Re-run once no more tree mutation is planned. After a clean
   run: dispatch the fourth (final, round-budget-capped) delta Critic review
   scoped to the diff since `fdd98727` (the third review's reviewed head) —
   via `templates/prompts/critic-review.md`, never freehand. F1/F2/F6
   (`AGY-FIX3-HARDENING`, commit `96581b7f`) are already independently
   verified (42/42 + 9/9 suites re-run directly).
2. **F3/F4/F5 dispositions: RESOLVED.** The PO accepted the Elephant's
   recommendation for all three (2026-08-24). Recorded in
   `specs/sprint-agy-runner/evidence/2026-08-24-delta3-critic-review-agy-runner.md`
   ("PO disposition, 2026-08-24 (round 3, F3/F4/F5)"): F3 and F4 accepted as
   disclosed gaps (same class as D5, no code remedy); F3's underlying
   tooling gap (Workflow-tool dispatches producing no
   `dispatch-record-<TASK_ID>.json`) is tracked as its own item,
   `backlog/items/2026-08-24-workflow-tool-dispatches-produce-no-dispatch-record-artifact.md`;
   F5 gets a real fix (add the missing `operating-model.md` §3.3 section)
   rather than a mechanical ~20-file citation sweep — not yet dispatched.
3. **D7 empirical verification is still open.** The `.agents/plugins.json`
   path fix is unverified pending a real Antigravity session load check —
   next-session instructions below.
4. `pipeline-state.mjs inspect` reports `activeFeature: sprint-nova-epic`,
   inherited from the rebase; it does not name this feature. PO decision:
   leave it — nova has its own repo and its own intake happens later, do not
   force a `close-feature` ceremony for this.
5. Repo consolidation between this checkout and nova is undecided. The nova
   branch tip `94c5577a` is a strict ancestor of this branch.
6. `specs/sprint-agy-runner/prd_agy-runner.md` §2 was corrected to reference
   `.agents/plugins.json` instead of the stale `hooks.json` name (commit
   `e7110c7d`); `spec.md`'s equivalent stale Wave 3 reference is fixed too
   (commit `c077ac7f`, delta-3 review F7).
7. **Marketplace-attestation-inside-Verify is a design defect, not fixed
   yet** — it fails the deterministic gate on ordinary active development of
   this very repo, not only on real drift:
   [backlog item](../backlog/items/2026-08-24-verify-marketplace-attestation-blocks-normal-active-development.md).
   PO flagged this as needing an actual fix, not just documentation.
8. **`verify.mjs` parallelization: Advisor-reviewed design now exists,
   implementation not started.** Recorded directly in the backlog item
   (`## Advisor-reviewed design, 2026-08-24`):
   [backlog item](../backlog/items/2026-08-24-verify-mjs-runs-385-suites-strictly-sequentially.md).
   TP-3 confirmed to protect only `harness/scripts/verify.mjs`, so the
   rewrite lands almost entirely in `verify-journal.mjs` (no ceremony); one
   contiguous `await` edit needed in `verify.mjs` itself. Design covers the
   pooling mechanism, `steps[]`/journal-digest determinism, a mechanically-
   derived serial lane, and a staged rollout (land at concurrency=1 first).
   Next step: a `goldfish-deep` dispatch for stage 1 of that rollout — not
   done this session. Note: a parallel attempt to route the design through
   the dedicated `pipeline-core:consult-advisor` agent was stopped after 27
   minutes with no output, per the PO's live call on cost/benefit; the
   design instead comes from a direct `advisor()` consultation, independently
   cross-checked against source by the Elephant.
9. **The briefed subagent tool-budget/`maxTurns`-cliff mismatch: parts 1+2
   fixed this session** (commit `eccbdadd`) — both dispatch templates'
   base-cap defaults now fit safely under their real `maxTurns` cliffs and
   name the cliff explicitly; applied to the vendored plugin copies too.
   Part 3 (whether `maxTurns: 50`/`30` is enough at all) deliberately not
   touched, needs measurement first:
   `backlog/items/2026-08-23-briefed-tool-budget-sits-below-an-unannounced-harness-maxturns-cliff.md`.
10. Orchestrator notes and Critic dispatch scratch share one `scratch/`
   directory, so verdict-bearing material sits where a dispatched Critic is
   guaranteed to look — accepted, queued as its own small scoped dispatch,
   not done this session:
   `backlog/items/2026-08-23-elephant-notes-and-critic-scratch-share-one-directory.md`.
11. **Meta/process feedback from the PO, carried forward (not a repo defect):**
    sessions spend too long on silent orientation (read/grep archaeology)
    before starting visible work; a session should batch reads and narrate
    briefly rather than disappearing for minutes per turn.
12. **New backlog item, PO-initiated (2026-08-24): whether Critic/Verify
    review cadence should batch onto larger collection blocks instead of
    running on every small diff**, since fine-grained review reliably
    triggers a re-review round and small fixes end up costing hours —
    analysis-only item, no disposition yet:
    `backlog/items/2026-08-24-critic-and-verify-cadence-may-be-too-fine-grained.md`.
13. **Backlog triage pass completed this session (2026-08-24)** over all 12
    non-deferred open items not already covered above (`docs(backlog):
    triage the open, non-deferred backlog items`, commit `581f5ac3`, plus
    follow-ups). One item closed
    (`2026-08-10-happy-path-turn-and-wall-clock-cost-is-not-externally-defensible.md`
    — both remaining concrete pieces confirmed already fixed on re-check,
    including catching and correcting one initially-wrong claim about a
    SKILL.md pointer before it became a stale record). Two QG-06
    residual-risk records confirmed still within their own review horizon
    (not expired: `2026-08-23-antigravity-hard-enforcement-layer-has-two-fail-open-paths.md`,
    `2026-08-23-antigravity-sandbox-containment-push-escape-route-unclosed.md`).
    One item's premise (`2026-08-21-kickoff-staging-directory-mismatch.md`)
    turned out on closer read to conflate two distinct onboarding
    mechanisms (`specs/kickoff-*` vs. `project/.onboarding-staging/`) —
    deferred pending that confirmation rather than fixed on the original
    framing. `2026-08-16-verify-has-grown-to-269-suites-with-no-recorded-cost.md`
    confirmed complementary to, not a duplicate of, item 8 above, with a
    fresh-run synergy noted. Two items already fully triaged/scheduled
    into the separate Nova A track needed no session action
    (`2026-08-09-kickoff-promotion-cleanup-readback-has-no-in-session-recovery.md`,
    `2026-08-08-long-dispatches-truncate-before-emitting-their-report.md`).

### Next session instructions

1. Restart the Antigravity session (CLI `agy` or IDE reload) to empirically
   check whether D7's `.agents/plugins.json` fix actually makes the
   PreToolUse enforcement layer load.
2. Run a final, uninterrupted full Verify for a clean 385/385 confirmation
   (marketplace rsync already confirmed clean), then dispatch the fourth
   (final round-budget slot) delta-scoped Critic review before any push is
   considered.
3. Dispatch the F5 fix (add the missing `operating-model.md` §3.3 section)
   — recommendation accepted by the PO, not yet executed.
4. Dispatch stage 1 of the verify-parallelization rollout (pool at
   concurrency=1, per the Advisor-reviewed design in open item 8) to a
   `goldfish-deep` task.

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

**Last updated:** 2026-08-24 — D1–D7 disposed and fixed, marketplace
resynced, trust anchor rotated, version bumped, backlog-state fix landed;
third delta Critic review ran and returned FAIL (F1–F7); F1/F2/F6/F7 fixed
and independently verified (`AGY-FIX3-HARDENING`, commit `96581b7f`);
Verify 384/385 (only the known marketplace-drift check red, needs another
rsync — not a code defect); F3/F4/F5 need a PO decision, not yet
self-dispositioned; fourth and final delta Critic round still pending.

### Sentinel Links
- specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md
- specs/2026-07-19-sprint-sentinel-epic/spec.md
- specs/2026-07-19-sprint-sentinel-epic/backlog-acceptance-matrix.md
- specs/2026-07-19-sprint-sentinel-epic/public-private-reconciliation-design.md
- specs/2026-07-19-sprint-sentinel-epic/RECOVERY.md
- specs/2026-07-19-sprint-sentinel-epic/platform-support-contract.md
- specs/2026-07-19-sprint-sentinel-epic/windows-blockers-scope.md
