# Module-cluster reachability instrument

Date: 2026-09-12
Scope: Nova B, runner-neutral static analysis

The earlier scratch audit is now reproduced by a versioned instrument at
`harness/scripts/check-module-cluster-reachability.mjs` with focused tests.
It scans non-test modules below `plugins/pipeline-core/{hooks,lib,scripts}`,
discovers live hook, documented command and executable Verify roots, and follows
both module-load edges and statically resolvable Node child-process targets.
Unreachable modules are reported as connected clusters so a missing entry point
does not become one apparent defect per implementation file.

The instrument closes the largest known false-positive source in the 2026-09-06
measurement: `spawn`, `spawnSync`, `execFile`, `execFileSync` and `fork` edges
are recognized only when the call is bound to `node:child_process`. Local
functions with the same names do not create reachability. Documented command
matching uses path or filename token boundaries rather than substring matches.
Output order and diagnostic limits are deterministic.

Executable non-test Verify checks outside the subject directories are modeled
as graph-frontier roots and their imports are followed into plugin code. Test
registrations remain deliberately excluded as callers. Authoritative Critic
prompt templates are command roots. These rules removed false findings for the
generated Consumer Verify dispatcher and the Critic dispatch-record stripper
without treating tests or archive prose as product wiring. Local bounded-spawn
wrappers are resolved only when their finite target names and underlying
`node:child_process` binding can both be proven; this removed the false
`guard-apply-patch` finding and covers the corresponding Antigravity guard set.

## Current measurement

The 2026-09-12 checkout smoke returned the expected non-zero finding status and:

| Measure | Count |
|---|---:|
| Subject modules | 450 |
| Discovered roots | 110 |
| Static edges | 1,122 |
| Reachable modules | 251 |
| Unreachable modules | 199 |
| Nova-B readiness candidate clusters | 100 |
| Deferred native Codex execution clusters | 7 |

The 100 clusters are **classification candidates**, not 100 established product
defects. Static reachability proves that the modeled roots do not reach a
module; it does not decide whether that module is dormant, an internal library,
unfinished, or missing a caller. The checker is therefore not registered as a
blocking Verify step while that classification remains open.

## WSL/native boundary

The PO deferred actual Codex App-Server, sandbox, WSL IPC and native Critic
execution under WSL to a future native-Windows package. The audit reflects that
decision narrowly: only concrete launch, host, preflight, runtime and isolation
surfaces are classified as deferred. The current seven deferred clusters contain
16 modules.

Offline and runner-neutral code remains in Nova B even when its filename contains
`sandbox` or `native`. Focused regressions prove that
`codex-sandbox-select.mjs`, `codex-sandbox-compatibility.mjs`,
`codex-native-critic-policy.mjs` and `codex-native-critic-tools.mjs` remain
readiness candidates. Deferred nodes are split before weak-cluster formation so
an edge to a native launcher cannot swallow an offline policy cluster.

## Focused verification

- `node harness/scripts/check-module-cluster-reachability.test.mjs`: 15/15
  cases passing.
- `node --test harness/scripts/check-module-cluster-reachability.test.mjs`:
  registered Node test process exits cleanly.
- Real checkout smoke: deterministic result above, exit 2 because candidate
  clusters remain.
- `git diff --check`: passing.

This package supplies the repeatable measurement requested by
`pipeline.capability-is-built-tested-and-declared-ahead-of-anything-that-could-call-it`.
The item remains open until the candidate clusters are dispositioned and wanted
capabilities have a reachable caller.

## First semantic dispositions

The first candidates were checked against source headers, live prompt/Verify
roots, accepted ADRs and existing backlog items:

- The 31-module advisory/Critic/hardening component is mixed and cannot be
  dispositioned as one capability. `verify-topology-preflight.mjs` is not an
  executable Verify registration; only its test is registered, so that test
  cannot make `ai-assisted-hardening-gate.mjs` product-reachable.
- The AFK family has an inventory shipment claim but no live caller for
  `afk-activation.mjs` or the prepare/finalize host path: missing caller.
- `async-execution.mjs` and `credential-lease.mjs` are explicitly contract-only
  pending the separately authorized B2-I pilot: wanted offline contracts, no
  caller to invent in this package.
- `codex-native-critic-policy.mjs` and `codex-native-critic-tools.mjs` are wanted
  offline validation code whose runtime callers belong to the deferred native
  Windows package. Their offline quality stays in Nova B; absent WSL activation
  is nonblocking.
- `control-catalog-migration.mjs` and the four-document rendering component are
  explicit later-slice scaffolding. Their existing Cyborg/Hawkeye items own the
  integration rather than Nova B inventing a caller.
- `control-catalog-schema.mjs`, `control-evaluation-receipt.mjs`,
  `control-waiver-lifecycle.mjs` and `delivery-course.mjs` have accepted product
  obligations but no non-test consumer. These are concrete missing-caller
  candidates under the existing built-but-unwired item.

No new backlog item is created for these results; they refine the existing
reachability item and point later wiring batches at already-governed packages.
