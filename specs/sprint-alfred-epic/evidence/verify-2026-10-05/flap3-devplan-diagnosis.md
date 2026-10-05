<!-- SPDX-License-Identifier: SUL-1.0 -->
# FLAP3 diagnosis: `DAA-DWP2-PHYSICAL-OR-GIT` flaps under concurrent agents

Dispatch FLAP3 (goldfish-deep), 2026-10-05, candidate `e664890a4`. Status: **diagnosis complete, probe-confirmed; fix status in the last section.** Independent review: pending.

## 1. Producer chain (file:line, in call order)

1. `plugins/pipeline-core/lib/guard-devplan-policy.mjs:145` - `designAdvisoryAdmission()` signature-mode branch returns `DAA-${verified.code}`. The first read at `:114` (`readApprovedDesignWorkflowPackage`) returns `workflow.code` UNprefixed (`:126`). So an observed `DAA-` prefix means the failing read was inside `verifyStoredDesignWorkflowPackageSignature` (a second, full re-read of the package), i.e. signature-mode approval.
2. `plugins/pipeline-core/lib/design-workflow-approval.mjs:145-150` and `:168-173` - re-read the package (twice more on that path) and pass the code through unchanged.
3. `plugins/pipeline-core/lib/design-workflow-package.mjs:472` - delegates v2 packages to `readDesignWorkflowPackageV2FromRepository`.
4. **`plugins/pipeline-core/lib/design-workflow-package-v2.mjs:142`** - the producer: `catch(e){return fail(e.message.startsWith('DWP2-') ? e.message : 'DWP2-PHYSICAL-OR-GIT')}`. Every exception that is not already `DWP2-` prefixed collapses into this one code, and the cause (`e.code`/`e.message`) is discarded. That is why the symptom is unattributable in the field.
5. **Transient operation (confirmed): `plugins/pipeline-core/lib/design-advisor-provenance.mjs:24`** inside `readAdvisorPhysicalBytes` (`:14-27`): every ancestor directory observed at `:18` (the walk is `[repoRoot, ...parent dirs]`, so the repo root itself is included) is re-`lstat`ed and compared with `identity()` (`:13`), which compares `dev, ino, mode, nlink, size, mtimeNs`. A directory's `mtimeNs` (and `size`/`nlink` on POSIX) changes on any sibling create/delete/rename. A single concurrent writer in an ancestor between `:18` and `:24` makes the function `throw Error('DAP-PHYSICAL-PARENT-DRIFT')`. That message is not `DWP2-` prefixed, so `:142` renders it as `DWP2-PHYSICAL-OR-GIT`.

## 2. Exposure surface

Package artifacts are physically read with `readAdvisorPhysicalBytes` many times per gate evaluation: `v2.mjs:100` (package), `:113` (context, receipt, report via `jsonFile`, `:42`), `:121` (source loop), `:132`/`:87` (readiness), plus the drift re-read of every file at `:131`/`:137`/`:86`/`:91`. With `verifyStoredDesignWorkflowPackageSignature` this is repeated. Roughly a dozen ancestor-walking reads per pass, several passes, each a fresh chance to catch a sibling write.

Operational trigger (inferred, not measured against the real private state, which this task may not read): every dispatched agent creates `evidence/dispatch-record-<ID>.json` as its opening act and the v2 placeholder path is `evidence/not-yet-produced.json`, so package artifacts conventionally live under `evidence/` - the exact directory that 6-10 concurrent agents churn. Which ancestor was churned in the live incidents can be confirmed by the Elephant from `planApproval.designWorkflowPackagePath` in the real state.

## 3. Probe (deterministic harness, temp dir only, no repo or private state)

`scratch/FLAP3/stress.test.mjs` (run: `node --test scratch/FLAP3/stress.test.mjs`, exit 0, machine-written `scratch/FLAP3/stress-result.json`; scratch is git-ignored, the numbers are copied here). One child process creates+deletes files in `evidence/` while the parent calls `readAdvisorPhysicalBytes(root,'evidence/pkg.json')` in a loop. Native Windows.

| sibling writer pace | calls | errors | error classes |
|---|---|---|---|
| tight loop | 1083 | 1083 | `DAP-PHYSICAL-PARENT-DRIFT` x1083 (100 %) |
| one op / 5 ms | 1186 | 121 | `DAP-PHYSICAL-PARENT-DRIFT` x121 (10.2 %) |
| no writer (baseline) | 423 | 0 | - |

So the only error class the sibling-write load produces is `DAP-PHYSICAL-PARENT-DRIFT`, exactly the one the catch-all relabels. Not touched or observed: `DAP-PHYSICAL-DRIFT`/`-OPEN` (file itself rewritten), `EBUSY/EPERM/EACCES` from scanners, git `execFileSync` timeouts/failures (`design-advisor-provenance.mjs:28-29`, `v2.mjs:47`) - these land in the same catch-all and are an unconfirmed second member of the class. The recommended fix deliberately leaves them fail-closed.

## 4. Fix proposal (precedent style: `d3c41ca5e`, `073a5a230`)

Bounded re-observation of exactly the confirmed transient class, fail-closed otherwise, in the one file that produces it (`design-advisor-provenance.mjs`):

- Split `readAdvisorPhysicalBytes` into the unchanged single-observation body plus an exported helper `reobserveAdvisorPhysicalDrift(read, {attempts=3, delaysMs=[50,100], sleep})`.
- Retry only when `err.message === 'DAP-PHYSICAL-PARENT-DRIFT'` (exact string); 3 attempts, 50 ms then 100 ms; on exhaustion re-throw the same error (identical to today's behaviour); any other error re-throws immediately, with no retry.
- Why this stays fail-closed: every retry discards all bytes of the inconsistent observation and re-runs the full walk (ancestor `lstat`/`isDirectory`/`isSymbolicLink`/`realpath` checks at `:18`, file identity at `:20-23`, ancestor recheck at `:24`); a genuinely swapped ancestor fails the fresh walk or the callers' `sha256` reference check (`jsonFile`, `v2.mjs:42`, and the cross-read `.equals` drift checks). The retry cannot make a stale or substituted artifact pass; it only re-takes a snapshot.
- Honest limit: sustained pace-0 churn of a package ancestor stays red (re-observation treats bursty churn, not a permanent writer).
- Optional (not applied, separate decision): `v2.mjs:142` should keep `e.code ?? e.message` as a non-authoritative `cause` so a future flap is attributable.

**Finding for the PO (not applied; security-predicate change, outside the briefed fix shape):** the ancestor predicate comparing `mtimeNs`/`size`/`nlink` is what turns benign sibling activity into an apparent swap. Narrowing it to `dev`/`ino`/`mode` + the existing `realpath`/`isDirectory`/`!isSymbolicLink` checks would remove the class instead of retrying it. On POSIX, `nlink` of a directory also changes when a sibling subdirectory is created, so the predicate is more fragile there, not less (WSL/macOS untested, host rule).

## 5. Protected-path status

- `plugins/pipeline-core/lib/design-advisor-provenance.mjs` (modified): matches none of TP-1..TP-13 (`templates/prompts/agent-obligations.md` section 2), is not named in `project/guard-config.json` (`cat | grep` for `provenance|design-workflow|design-advisor`: no match), and the Edit was admitted by every guard without a refusal. It is referenced by `harness/scripts/verify.mjs`, `harness/config/verify-case-completion.v1.json` and `plugins/pipeline-core/scripts/design-advisory-coordinator.mjs` (read-only references; none touched).
- `plugins/pipeline-core/lib/design-advisor-provenance.flap3.test.mjs` (new): matches no TP pattern; Write admitted. Not checked: whether `harness/verify-suites.json` (TP-13, protected, untouched) must list a new test file for the Verify gate to run it - for the Elephant.
- The other producer files named above (`design-workflow-package-v2.mjs`, `guard-devplan-policy.mjs`, `design-workflow-approval.mjs`) were only read.

## 6. Fix status

**Applied** (one unprotected lib file + one new test file, uncommitted):

- `design-advisor-provenance.mjs`: `readAdvisorPhysicalBytes` now wraps the unchanged single-observation body (`readAdvisorPhysicalBytesOnce`) in the new exported `reobserveAdvisorPhysicalDrift(read, {delaysMs:[50,100], sleep})`. Retries only `error.message === 'DAP-PHYSICAL-PARENT-DRIFT'`; 3 attempts; exhaustion and every other error re-throw the same error object.
- `design-advisor-provenance.flap3.test.mjs` (SPDX line 1): 7 checks. RED before the edit: 6 failed / 1 passed (`node --test plugins/pipeline-core/lib/design-advisor-provenance.flap3.test.mjs`, exit 1; the passing check is a behaviour guard that the real function still reads a file and fails closed on missing/escaping paths). GREEN after: 7/7.
- Regression: `node --test .../design-advisor-provenance.test.mjs` RC10C001-RC10C004 pass (4/4). `design-workflow-package-v2.test.mjs` is **not verifiable on native Windows**: its only case RC12C001 fails in fixture setup (`createCodexDesignReadinessHostStore`, `codex-design-readiness-host-store.mjs:66`: `process.platform !== 'linux'` -> `CRHS-INPUT`) before any package read; the stack never enters the provenance module. It needs WSL/Linux, which this dispatch may not use, so the v2 reader end-to-end remains unverified here.
- Stress probe after the fix (same harness, same machine, `scratch/FLAP3/stress.test.mjs`):

| sibling writer pace | before: errors / calls | after: errors / calls |
|---|---|---|
| one op / 5 ms | 121 / 1186 (10.2 %) | 3 / 202 (1.5 %) |
| tight loop | 1083 / 1083 (100 %) | 15 / 15 (100 %) |
| no writer | 0 / 423 | 0 / 374 |

The per-call failure rate under a hostile one-op-per-5-ms writer in the very ancestor drops about 7x but is not zero; sustained churn stays red, as designed. A real incident was a burst, which is what bounded re-observation treats. If the Elephant wants the class removed rather than reduced, take the PO finding in section 4 (narrow the ancestor predicate), which is the structurally correct repair.

**Not verified:** WSL/macOS (host rule), the real private-state flap (forbidden to read), git-spawn timeout members of the same catch-all, independent review (pending).
