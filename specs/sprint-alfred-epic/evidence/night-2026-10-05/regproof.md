# REGPROOF: end state of the two staged packages on a full export of HEAD

Machine-written source: [`regproof-result.json`](regproof-result.json) (schema `pipeline.alfred.regproof.v1`, written by the driver, never edited by hand). This note only restates it; there is no interpretation beyond "exit 0 / exit N with these lines".

## What was run

One driver run, one pass, no step skipped (`stoppedAt: null`). HEAD exported: `bcdeab014db38e645256c1455a882a5a3ecc31db`; Node `v24.19.0`; GNU tar 1.35; GNU patch 2.7.6; platform `win32`. The driver uses `child_process.spawnSync` with no shell; the export directory is shown as `<tree>`, the repository root as `<repo>` (the JSON holds no absolute host path: `residualHostPathCheck.hits` = 0, `fallbackRedactions` = 0).

1. `git rev-parse HEAD`, `git archive --format=tar`, extract into a fresh directory.
2. Both checkers on the unpatched export (checker code from the repository, `--root <tree>`).
3. S2 package: `protected-baseline.patch`, the facade copied over `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`, `verify-registration.patch`, `inventory-surfaces.patch`; both checkers ("after S2").
4. Registration package: `test-registrations.patch`, `case-completion-dispositions.patch`, `inventory-surfaces.patch`; both checkers ("after both").
5. After both: `node --check` on the patched `harness/scripts/verify.mjs` and on the facade, then `node --test` on `guard-split-contract.test.mjs` from the export.

All seven patch/copy steps exited 0. `patch` reported hunk offsets (1 to 2 lines) in `test-registrations.patch` and in the registration package's `inventory-surfaces.patch`, and no fuzz and no rejects (`offsetOrFuzzLines` per step in the JSON).

## Checker exit codes per stage

| Stage | `check-verify-suite-registration.mjs` | `check-verify-case-completion.mjs` |
|---|---|---|
| baseline (unpatched export of HEAD) | exit 2 (27 findings) | exit 0 |
| after S2 package | exit 2 (25 findings) | exit 0 |
| after both packages | exit 2 (2 findings) | exit 0 |

Case-completion stdout when exit 0: baseline and after S2 `Verify case-completion registry valid: 297 entries, 290 conservatively classified suites.`; after both `Verify case-completion registry valid: 304 entries, 297 conservatively classified suites.`

## Extra checks after both

- `node --check <tree>/harness/scripts/verify.mjs`: exit 0.
- `node --check <tree>/plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`: exit 0.
- `node --test <tree>/plugins/pipeline-core/lib/guard/guard-split-contract.test.mjs`: exit 0. Reported lines, verbatim from `highlightLines`/`stdoutTail`:
  - `✔ GSC04 once the facade is wired to lib/guard it is a thin facade of at most 500 lines (0.5389ms)`
  - `ℹ tests 5`, `ℹ pass 5`, `ℹ fail 0`, `ℹ skipped 0`
- The facade copied into the export is 75 lines (4832 bytes); the file it replaced was 437003 bytes (`s2-facade-copy.detail`).

## Non-zero exits: finding lines verbatim from the JSON

### check-verify-suite-registration, baseline: exit 2 (stderr, 28 lines, all within the 40-line tail)

```
UNREGISTERED harness/scripts/guard-split-map.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/hooks/guard-dispatch-fanout.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/hooks/guard-push-checkpoint-approval.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/hooks/guard-push-gitleaks-prefix.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/hooks/post-compact-reground.fanout.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/hooks/stop-fanout.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/lib/checkpoint-push-approval.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/lib/design-advisor-provenance.flap3.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/lib/fanout-governor.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/lib/fanout-ledger.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/lib/governance-event-store.win-fsync.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/lib/guard/guard-split-contract.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/lib/hardened-private-directory.install.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/lib/hardened-private-directory.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/lib/project-onboarding-v3.flap.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/lib/runtime-handover-projection.win-path.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/lib/slice-queue.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/scripts/clone-hook-readiness.rollback.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/scripts/gitleaks-repair-ignore.cli.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/scripts/hook-currentness.digest-once.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/scripts/hook-refresh-detection.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/scripts/pipeline-start-preflight.path-spelling.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/scripts/pipeline-start-preflight.session-intent.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/scripts/security-adapters/gitleaks.windows-suppression.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/scripts/slice-queue.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/scripts/verify-journal.drvfs-hint.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/skills/close-block/close-block-fanout-report.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
Verify suite registration check failed: 27 finding(s) (27 unregistered, 0 honoured exclusion(s), 0 uncategorized and 0 duplicate inventory surface(s), 0 malformed, 0 expired).
```

### check-verify-suite-registration, after S2: exit 2 (stderr, 26 lines, all within the 40-line tail)

```
UNREGISTERED plugins/pipeline-core/hooks/guard-dispatch-fanout.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/hooks/guard-push-checkpoint-approval.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/hooks/guard-push-gitleaks-prefix.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/hooks/post-compact-reground.fanout.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/hooks/stop-fanout.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/lib/checkpoint-push-approval.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/lib/design-advisor-provenance.flap3.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/lib/fanout-governor.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/lib/fanout-ledger.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/lib/governance-event-store.win-fsync.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/lib/hardened-private-directory.install.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/lib/hardened-private-directory.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/lib/project-onboarding-v3.flap.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/lib/runtime-handover-projection.win-path.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/lib/slice-queue.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/scripts/clone-hook-readiness.rollback.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/scripts/gitleaks-repair-ignore.cli.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/scripts/hook-currentness.digest-once.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/scripts/hook-refresh-detection.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/scripts/pipeline-start-preflight.path-spelling.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/scripts/pipeline-start-preflight.session-intent.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/scripts/security-adapters/gitleaks.windows-suppression.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/scripts/slice-queue.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/scripts/verify-journal.drvfs-hint.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/skills/close-block/close-block-fanout-report.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
Verify suite registration check failed: 25 finding(s) (25 unregistered, 0 honoured exclusion(s), 0 uncategorized and 0 duplicate inventory surface(s), 0 malformed, 0 expired).
```

### check-verify-suite-registration, after both: exit 2 (stderr, 3 lines)

```
UNREGISTERED plugins/pipeline-core/lib/hardened-private-directory.install.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
UNREGISTERED plugins/pipeline-core/scripts/gitleaks-repair-ignore.cli.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
Verify suite registration check failed: 2 finding(s) (2 unregistered, 0 honoured exclusion(s), 0 uncategorized and 0 duplicate inventory surface(s), 0 malformed, 0 expired).
```

`check-verify-case-completion.mjs` exited 0 at all three stages (no finding lines).
