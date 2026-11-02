# w98 — the close drive reads back the quality artefacts of the change and an audit-index command lists them (candidate 18, row C18-10)

Chain order: this patch is a delta on top of w79 and w93 (it edits `close-coordinator.mjs` and `close-chain-guide.mjs` as they stand after those two). Apply w79, then w93, then this patch; it does NOT apply to a checkout that lacks them.
The criterion binding AC-239 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## What it adds

- `lib/close-quality-readback.mjs`: `closeQualityReadback({ featureId, handoverPath, readers })` returns a closed, ordered list of rows `{ id, status, evidence, remedy }` for exactly `security-scan`, `adr-decision`,
  `architecture-fitness`, `critic-report-file`, `handover-freshness`; status is `present`, `missing`, `not-applicable` or `unknown`. Every reader is injected; a reader that is absent or throws gives `unknown`, never `present`.
  The module never writes, never runs a scan and never calls the network. The existence/currency rule of each row is one sentence in the module header. The freshness bound is the named constant `HANDOVER_FRESHNESS_BOUND_MS` (24 h).
  `buildAuditIndex(...)` builds the audit index of one change.
- `close-coordinator.mjs drive` and `drive --dry-run` print the rows under a new `qualityReadback` key (read-only). `audit-index --root <root> --lifecycle <id>` is a new read-only subcommand (also in `--help`): it prints PRD, Spec, plan,
  verify evidence, Critic reports, security-scan evidence, fitness evidence, push threat model and the quality rows, with the sha256 of each file that exists; it writes no file.
- `close-chain-guide.mjs`: optional input `qualityReadback` (same shape as `pushThreatModel`); every `missing` row becomes an agent action `quality-<id>` before `candidate-frozen`, carrying the remedy (or "no sanctioned command" text when there is none). `unknown` and `not-applicable` list nothing.
- It is advice, not a gate: no new refusal code on the close path.

## Signals used

- security-scan: `evidence/security-latest.v2.json` and `.verdict.json` (what `check-close-security-completeness.mjs` reads). Remedy `security-scan.mjs` (no flags claimed).
- adr-decision: the typed architecture impact stored on the close coordinator (`architecture-decision-added|superseded` needs a record in `docs/adr`; the other typed impacts are `not-applicable`; none stored yet is `unknown`).
- architecture-fitness: a `rigorHistory` entry of Pipeline State for the feature that carries a `fitnessProjection`. `architecture-fitness.mjs` itself leaves no file, so this is the only recorded-run signal; the remedy names `architecture-fitness.mjs --root <root> --check`, which only reports a run (recording happens through the rigor observation).
- critic-report-file: `specs/<feature>/evidence/critic/<packetId>/report.md`; the remedy is `session-critic-finalizer.mjs export --root <root> --request <request.json>`.
- handover-freshness: the calibrated `handover` path of `project/pipeline.json` (default `docs/state.md`); last update is the worktree mtime when the file is modified, otherwise its last commit time, compared with the HEAD commit time.

## Tests

- New suite `plugins/pipeline-core/lib/close-quality-readback.test.mjs` (8 cases, written red against a stub first): one case per row id for present, missing with remedy and unknown, plus the audit index. It needs registration in `harness/verify-suites.json` and the capability inventory (the Elephant registers it).
- `close-coordinator.test.mjs`: 50 of 50 (49 existing unchanged, 1 new process case: `qualityReadback` on drive and dry run, the missing row as an action before the freeze, `audit-index` output and no write). `close-chain-guide.test.mjs`: 9 of 9 (1 new). `check-consumer-safe-paths.test.mjs`: 9 of 9.
- No existing pin on the drive output keys moved; nothing was restated or weakened.

## Not changed / not proven

- `harness/verify-suites.json`, the capability inventory, `session-critic-finalizer.mjs`, `check-close-security-completeness.mjs`, `architecture-fitness.mjs` untouched.
- The verify-evidence path (`evidence/verify-latest.json`), the plan path (`specs/<feature>/plan.md`) and the fitness-evidence path (`architecture/baseline.json`) in the audit index are conventions of this slice, not read from an owning module; a file at another name shows `sha256: null`. Not proven against a real consumer run.
- The `architecture-fitness` signal depends on rigor history, which exists only after a rigor observation; elsewhere the row is `missing` or `unknown`.
- Only the module suite was recorded red before its implementation; the guide case and the coordinator process case were written after their production edits.
- The full Verify run was not made.
