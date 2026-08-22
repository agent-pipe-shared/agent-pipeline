# Project state — Agent-Pipeline

> Canonical operational handover for this repository. It contains public
> repository state only; durable decisions remain in the ADR register.

## Current handover — Antigravity CLI 3rd Runner Integration & Hardening (2026-08-23)

### Current completed & open work

The feature **`sprint-agy-runner`** (Issues #69, #92, #15; ADR-0067) is **fully implemented, hardened, and verified**:
- **Dimension A (Interactive Session):** PreToolUse guardrails (`antigravity-pretool-guard.mjs`) and `.agents/hooks.json` enforce command grammar, workspace containment, phase-gating, and git push guards with exit code 2.
- **Dimension B (Headless Dispatch):** `antigravity-execution-host.mjs` executes headless `agy` invocations with `--sandbox` isolation, Gemini model mapping, and token usage normalization to `pipeline.runner-usage.v1`.
- **Tri-Runner Architecture:** Antigravity is a first-class third runner alongside Claude Code and Codex ([ADR-0067](adr/0067-tri-runner-antigravity-integration.md)).
- **Upstream Rebase & Push:** Rebased cleanly onto `/home/skar667/src/agent-pipeline-shared_nova` (`feat/sprint-nova-codex-v046`, commit `94c5577a`) and pushed to `origin/feat/agy_nova`.

### Candidate and gate status

The current candidate is commit **`a43ca0fd8af35982e36b817f914016bfd1548e69`**, tree **`76f4284f829aee5737a682d05e7896b93dfaabaf`**.
- **Deterministic Verify:** Full `node harness/scripts/verify.mjs` run executed **385 registered suites**, all **385 passed (0 failed, exit code 0)**, recorded in `evidence/verify-latest.json`.
- **T1 Critic Review:** Independent Critic Review (`critic` subagent) completed with **`PASS`** (0 findings, trajectory consistent, all 11 audit gates deliberately verified).
- **Human Approval Request:** Bound detached push request generated at `/tmp/external-dir/request-422b265c4f08-critical-push.json`.

### Next session instructions

1. Restart the Antigravity session (CLI `agy` or IDE reload).
2. Run `agy --execute "/pipeline-start"` to initialize the runtime context and activate client-side hooks.

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
