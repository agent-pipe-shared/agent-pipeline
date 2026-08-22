# Project state — Agent-Pipeline

> Canonical operational handover for this repository. It contains public
> repository state only; durable decisions remain in the ADR register.

## Current handover — local Nova 0.6.0 candidate preparation (2026-08-20)

### Current open work

The requested candidate remains **`0.6.0`**. The local candidate is a
build-metadata checkpoint, not a semver patch bump and not an official
published release. The backlog is currently **38 open / 3 in progress / 260
closed**; **34** non-closed items are deferred to Alfred, Nightwing, Phoenix,
Nova B, or later scope and are not Nova-A release work.

Nova-A-relevant work still recorded here:

- in progress: `pipeline.afk-assumption-mode` and
  `pipeline.session-keep-awake` (candidate/release pending);
- in progress, design-only: `pipeline.execution-model-switchback` (no
  implementation dispatch started);
- open: `pipeline.happy-path-turn-and-wall-clock-cost-is-not-externally-defensible`,
  `pipeline.kickoff-promotion-cleanup-readback-has-no-in-session-recovery`,
  `pipeline.long-dispatches-truncate-before-emitting-their-report`, and
  `pipeline.verify-has-grown-to-269-suites-with-no-recorded-cost`.

The next session should refresh the local user-scope
`pipeline-core@agent-pipeline-local` marketplace/cache and reload or restart
before relying on newly installed hook code or manifest versions. The push
approval ceremony remains open; no push or release operation is performed by
this handover task.

### Candidate and gate status

The functional candidate is commit
`40d3b474770d8eec612b4c2ea39399044a3fca88`, tree
`c037981ceeae357363513d442ca5e20cafae84e8`. The recorded Verify run
`verify-1787256261778-c1dbffc59f30c426` covered 383 registered suites and
retained disclosed non-zero results: the known
`human-guard-override-tests` host/marketplace exception, historical backlog
state drift findings, and a transient full-run security-scan error. The
isolated security scan was subsequently clean; OSV was skipped because this
repository has no package sources. This remains a local-install checkpoint
with disclosed exceptions.

The final Nova-A T1 Critic review still carries an unresolved FAIL; round 2
was orphaned and round 3 remains open. A prior handover recorded a PO-directed
push ceremony as in progress; this current handover makes no new push or
release claim and does not authorize one. It also does not claim a new Verify
result, a passed Critic gate, or Full Verify.

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
