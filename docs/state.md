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

**`enforce-kickoff-po-questions`: `AGY-KICKOFFPOQ-1` stopped cleanly, no
code written** — its own stop condition fired: the `po-human-approval.mjs`/
`po-approval-gate.mjs` family (the ceremony the `chat`-mode direction named)
has zero chat-mode concept at all, and the one real chat ceremony in the
plugin (`pipeline-state.mjs`'s push `pendingPushChallenge`) is push-only
and still `forCommit`-bound — undercutting the original reason to prefer
`chat` over `signature` for a pre-first-commit gate. Findings + 3 options
recorded (`17d23532`). **PO picked option 1** (`fa581be7`): build a
genuine, reusable chat-mode gate-kind registry inside `po-human-approval.mjs`/
`po-approval-gate.mjs` FIRST, then add the kickoff-parameter kind to it —
not option 2 (copy the push one-off) or option 3 (fall back to
`signature`). **Not yet dispatched** — needs its own `goldfish-deep`
package built from `templates/prompts/goldfish-task.md`. Item stays `open`.

**`verify-marketplace-attestation-blocks-normal-active-development`
(Direction 3, PO-approved) — `AGY-MKTATTEST-1` substantially landed,
independently reverified:** WARN-downgrade in `human-guard-override.test.mjs`
(F1) + new hard blocking check in `guard-push.mjs`
(`checkMarketplaceAttestation()`, reuses `localPluginInstallSourceObservation()`,
never a second comparison), committed `cbd22d4f`. Independently confirmed
by this session (not just self-report): `human-guard-override.test.mjs`
76/76 (WARN visible, F1 still real), `guard-push.test.mjs` 159/159
including the two new positive/negative push-block cases. Its own full
Verify run (`binding: exact` @ `cbd22d4f`) found exactly one red suite —
traced to an unrelated pre-existing defect (see next item), not this
dispatch's own work. Resumed once (a clean self-paused wait, not a
truncation) to run one final clean Verify against current HEAD and produce
its completion report — in flight as of this write.

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

**Last updated:** 2026-08-25 — F1 fixed and independently reverified; PO
returned and cleared the backlog: accepted verify-tuner's partial result
(item closed), reviewed and committed the security-baseline fix, decided
`chat` mode for `enforce-kickoff-po-questions`, approved Direction 3 for
marketplace-attestation; both now dispatched (`AGY-KICKOFFPOQ-1`,
`AGY-MKTATTEST-1`, in flight); local version bumped to
`0.6.0+20260825.bbee2df4` and installed (a CLI-side update-cache display
quirk noted, not a real sync problem, deferred).

### Sentinel Links
- specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md
- specs/2026-07-19-sprint-sentinel-epic/spec.md
- specs/2026-07-19-sprint-sentinel-epic/backlog-acceptance-matrix.md
- specs/2026-07-19-sprint-sentinel-epic/public-private-reconciliation-design.md
- specs/2026-07-19-sprint-sentinel-epic/RECOVERY.md
- specs/2026-07-19-sprint-sentinel-epic/platform-support-contract.md
- specs/2026-07-19-sprint-sentinel-epic/windows-blockers-scope.md
