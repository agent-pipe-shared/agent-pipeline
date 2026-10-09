# ADOPT-P0: architecture-adoption prerequisites (partial measurement, closing-allowance handover)

Dispatch ADOPT-P0-20261009 (goldfish-implementor, Sonnet 5.5 / medium), candidate `3f7708289`. Read-only: `prepare` and
`apply` were NOT run; nothing under `architecture/` or `project/` was touched. Independent review: pending. PO acceptance:
pending. The 35-call budget ended before items 3, 5 and 6 were measured; they are listed with the exact commands to run.

## Answers

| # | Question | Answer | Command / source | Exit |
|---|----------|--------|------------------|------|
| 1 | Signature CLI for kind `architecture-adoption` | **Partial gap.** `node plugins/pipeline-core/scripts/po-human-approval.mjs sign-intent --repo-root <repo-root> [--directory <external-dir>] --intent-sha256 <request.intent.sha256>` signs any 64-hex digest (static read, `po-human-approval.mjs:2003-2196`) and writes `<external-dir>/proof-<sha>.json` (`:2159-2165`). `--request` is NOT usable: it demands a top-level `intentSha256` (`:2045`), but the adoption request (`pipeline.adoption-approval-request.v1`) carries `intent.sha256`, so it fails with "--request JSON must carry an intentSha256 field". No adoption-specific disclosure describer exists (the PO would see the generic unresolved-record fallback). The signed proof shape (`intentSha256`, `keyReference`, `publicKey`, `signatureBase64`) equals the existing deferral proof in `adoption-state.json`. | static read; `status --json` below | n/a (static) |
| 1b | Request file production | `prepare` only prints JSON to stdout (`architecture-adoption.mjs:486-489`); `apply --request/--proof` read JSON files (`:466-469`). Under the closed shell grammar no redirect is admitted, so the file must be written by a Node helper or `capture-evidence.mjs` (header lines: not verified). Gap, same slice as 1. | static read | n/a |
| 2 | `origin` and fingerprint version | `origin` exists: `git@github-share:agent-pipe-shared/agent-pipeline.git`. Fingerprint will be v2, origin-based (normalised `github-share/agent-pipe-shared/agent-pipeline`, `architecture-adoption-authority.mjs:20-25`), not the path-bound fallback. The existing deferral keeps its legacy v1 fingerprint, accepted for `deferred` only (`:30-33`). | `git remote -v` | 0 |
| 3 | Map currency vs HEAD | **Not measured.** Preflight reports `physicalMap.status: present-unvalidated`. Candidate commands: `node plugins/pipeline-core/scripts/module-inventory.mjs` (argv not read) and `node plugins/pipeline-core/scripts/architecture-fitness.mjs` (argv parsed at line 1088, not read). | `pipeline-start-preflight.mjs` | 0 |
| 4 | `AGENTS.md` pointer | Present: lines 20 and 24 link `architecture/map/index.md`. | `rg -n "AGENTS\|architecture/map" AGENTS.md` | 0 |
| 5 | `fitness-model.json`, `baseline.json` validity | **Not measured.** Validators exist: `plugins/pipeline-core/scripts/architecture-baseline.mjs` (baseline); `inspectArchitectureEntryReadiness` in `lib/architecture-entry-readiness.mjs:273-287` (both). Argv not read. | n/a | n/a |
| 6 | `set-phase implementation` / push-currency crossed before the interim stamp | **Not measured** (needs `project/pipeline-state.json`, not read). Static finding from ADOPT-D stands: the gates fire only on `pipeline-state.mjs set-phase --phase implementation`; push-currency call site `hooks/guard-push.mjs:146` not traced. | n/a | n/a |
| 0 | Baseline state | `deferred`, scope `specs/sprint-alfred-epic/`, `reviewDate` 2026-10-20, decisionRef `po-0.7.0-release-defer-2026-09-20`. | `node plugins/pipeline-core/scripts/architecture-adoption.mjs status --json` | 0 |

## Quiet-window command sequence (all from the repository root; swarm quiet from step 1 to the end of step 4)

Valid only after the slices below. `<ISO>` is a canonical `YYYY-MM-DDTHH:MM:SS.000Z` timestamp chosen at step 1 and reused
verbatim.

1. `node plugins/pipeline-core/scripts/architecture-adoption.mjs prepare --decision approved-scoped --scope specs/sprint-alfred-epic/ --scope architecture/map --scope project/pipeline.json --scope pipeline.user.yaml --rationale "<identical text>" --decision-ref "Ruling 162" --decided-at <ISO>` (no `--review-date`, no `--expires`). Write its stdout to `scratch/adoption-request.json` through a Node helper (gap 1b); read `intent.sha256` from it.
2. PO signs (attended): `node plugins/pipeline-core/scripts/po-human-approval.mjs sign-intent --repo-root <repo-root> --intent-sha256 <intent.sha256>`; copy `<external-dir>/proof-<intent.sha256>.json` to `scratch/adoption-proof.json` (or, after the signing-CLI slice, `--request scratch/adoption-request.json` mirrors it automatically).
3. `node plugins/pipeline-core/scripts/architecture-adoption.mjs apply --decision approved-scoped --scope specs/sprint-alfred-epic/ --scope architecture/map --scope project/pipeline.json --scope pipeline.user.yaml --rationale "<identical text>" --decision-ref "Ruling 162" --request scratch/adoption-request.json --proof scratch/adoption-proof.json --by <name> --json` (flags byte-identical to step 1; `--decided-at` is taken from the signed request).
4. Commit `architecture/adoption-state.json`.
5. Readback: `architecture-adoption.mjs status --json`, `architecture-adoption.mjs check --json --scope specs/sprint-alfred-epic/`, preflight `architectureOrientation`.

## Slices still needed before the ceremony

- **ADOPT-SIGN-CLI (F, production):** make `sign-intent --request` accept `pipeline.adoption-approval-request.v1` (read `intent.sha256`, add a disclosure describer showing decision, scope, candidate), mirror the proof into `scratch/`. Plus a test-only slice first (QG-04).
- **ADOPT-REQ-FILE (F):** an `architecture-adoption.mjs prepare --out <scratch path>` (or equivalent) so the request file needs no redirect. May share the slice above.
- **ADOPT-P0b (measure):** finish items 3, 5, 6 with the commands named above (read their argv first).
- **ADOPT-P1 (map refresh):** only if P0b shows the map stale.

## Deviations

Budget ended before items 3, 5, 6; no command was run for items 1 and 1b (static reading only).
