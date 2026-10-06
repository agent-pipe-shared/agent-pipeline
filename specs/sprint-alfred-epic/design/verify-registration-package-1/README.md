# Verify registration package 1 — test-suite registrations (staged for the PO signature)

Registers the tonight-slice test suites in Verify, with the case-completion dispositions and inventory surfaces they
need. Separate from the S2 guard-split package [`../s2-package-1/`](../s2-package-1/README.md).

## Artifacts

| Artifact | Target path | Protection |
|---|---|---|
| `test-registrations.patch` | `harness/scripts/verify.mjs` | TP-3 |
| `case-completion-dispositions.patch` | `harness/config/verify-case-completion.v1.json` | not protected (no PB entry in `plugins/pipeline-core/protected-baseline.json` and no TP entry matches it) |
| `inventory-surfaces.patch` | `docs/product-capability-inventory.json` | not protected |

## Suite table

| Test file | Suite | caseCompletion | Disposition |
|---|---|---|---|
| `plugins/pipeline-core/hooks/guard-push-checkpoint-approval.test.mjs` | `guard-push-checkpoint-approval-tests` | none | no |
| `plugins/pipeline-core/lib/checkpoint-push-approval.test.mjs` | `checkpoint-push-approval-tests` | none | no |
| `plugins/pipeline-core/lib/fanout-ledger.test.mjs` | `fanout-ledger-tests` | FL01..FL08 (8 ids) | yes (required) |
| `plugins/pipeline-core/lib/fanout-governor.test.mjs` | `fanout-governor-tests` | FG01..FG33 (33 ids) | yes (required) |
| `plugins/pipeline-core/lib/slice-queue.test.mjs` | `slice-queue-tests` | SQ01..SQ34 (34 ids) | yes (required) |
| `plugins/pipeline-core/scripts/slice-queue.test.mjs` | `slice-queue-cli-tests` | SC01..SC14 (14 ids) | yes (required) |
| `plugins/pipeline-core/hooks/stop-fanout.test.mjs` | `stop-fanout-tests` | SF01..SF23 (23 ids) | yes (required) |
| `plugins/pipeline-core/hooks/guard-dispatch-fanout.test.mjs` | `guard-dispatch-fanout-tests` | none | no |
| `plugins/pipeline-core/skills/close-block/close-block-fanout-report.test.mjs` | `close-block-fanout-report-tests` | none | no |
| `plugins/pipeline-core/hooks/post-compact-reground.fanout.test.mjs` | `post-compact-reground-fanout-tests` | none | no |
| `plugins/pipeline-core/lib/runtime-handover-projection.win-path.test.mjs` | `runtime-handover-projection-win-path-tests` | RHPW001..RHPW002 (2 ids) | yes (required) |
| `plugins/pipeline-core/lib/project-onboarding-v3.flap.test.mjs` | `project-onboarding-v3-flap-tests` | none | no |
| `plugins/pipeline-core/scripts/pipeline-start-preflight.session-intent.test.mjs` | `pipeline-start-preflight-session-intent-tests` | none | no |
| `plugins/pipeline-core/scripts/pipeline-start-preflight.path-spelling.test.mjs` | `pipeline-start-preflight-path-spelling-tests` | none | no |
| `plugins/pipeline-core/lib/hardened-private-directory.test.mjs` | `hardened-private-directory-tests` | none | no |
| `plugins/pipeline-core/scripts/verify-journal.drvfs-hint.test.mjs` | `nova-verify-journal-drvfs-hint-tests` | none | no |
| `plugins/pipeline-core/lib/governance-event-store.win-fsync.test.mjs` | `governance-event-store-win-fsync-tests` | none | no |
| `plugins/pipeline-core/scripts/security-adapters/gitleaks.windows-suppression.test.mjs` | `gitleaks-windows-suppression-tests` | none | no |
| `plugins/pipeline-core/hooks/guard-push-gitleaks-prefix.test.mjs` | `guard-push-gitleaks-prefix-tests` | none | no |
| `plugins/pipeline-core/lib/design-advisor-provenance.flap3.test.mjs` | `design-advisor-provenance-flap3-tests` | none | no |
| `plugins/pipeline-core/scripts/hook-refresh-detection.test.mjs` | `hook-refresh-detection-tests` | none | no |
| `plugins/pipeline-core/scripts/clone-hook-readiness.rollback.test.mjs` | `clone-hook-readiness-rollback-tests` | CHRB001..CHRB009 (9 ids) | yes (required) |
| `plugins/pipeline-core/scripts/hook-currentness.digest-once.test.mjs` | `hook-currentness-digest-once-tests` | none | no |

## Deferred pair

`hardened-private-directory-install-tests` and `gitleaks-repair-ignore-cli-tests` are NOT registered here. Both are
`node-test-single` suites without the `registerTestCaseCompletion` protocol, and the case-completion checker rejects a
vulnerable suite without a disposition. PO question Q11 decides between migrating both test files to the protocol and a
different disposition.

## Apply order inside the package

`test-registrations.patch` → `case-completion-dispositions.patch` → `inventory-surfaces.patch`
→ `node harness/scripts/check-verify-suite-registration.mjs` → `node harness/scripts/check-verify-case-completion.mjs`.

The first checker exits 2 after this package by design (two deferred files stay UNREGISTERED until Q11 is decided);
the second exits 0. See "Expected end state" below.

## Independence and the inventory hunk split

Independent of the S2 package. Both apply orders were measured on fresh `git archive` exports of HEAD (GNU `patch -p1`):
every patch step exited 0 (no rejects) in both orders, and the five patched target files are byte-identical in the two
orders. Evidence, both machine-written:
[`../../evidence/night-2026-10-05/regproof-result.json`](../../evidence/night-2026-10-05/regproof-result.json) (S2
package first) and
[`../../evidence/night-2026-10-05/regproof-reverse-result.json`](../../evidence/night-2026-10-05/regproof-reverse-result.json)
(registration package first, plus an S2-first re-run for the comparison). The whole-export digests of the two orders
differ only in two `.orig` backup files that GNU `patch` writes beside `verify.mjs` and the inventory when a hunk
applies with an offset; the reverse JSON therefore reads `identicalEndState: false` under its strict whole-export
definition and `comparison.targetsIdentical: true` for the patched targets.
The two may be signed under one `sign-intent` or separately. `inventory-surfaces.patch` was deliberately split: one
hunk was divided so that it no longer straddles the insertion point of the S2 package's inventory patch.

## Registry location

Both registries are valid for a new suite, so the entries in `test-registrations.patch` (all in `verify.mjs`) sit in
an accepted registry:

- `check-verify-suite-registration.mjs` builds its entry list from the `verify.mjs` arrays AND from
  `harness/verify-suites.json`; an UNREGISTERED finding fires only when a file is in neither. Its header text says
  "registered in verify.mjs" but the code accepts both.
- The Verify runner merges both: after `TEST_SUITES` it loads `verify-suites.json` and pushes each declared suite, with
  its `caseCompletion`, into `TEST_SUITES`.
- `verify-suites.json` entries must additionally carry `invariantPinned` and `nonOverlapNote`; `verify.mjs` entries do
  not. `clone-hook-readiness-tests` lives in the JSON, which is why the new clone-hook / hook-refresh suites have no
  related neighbour in `verify.mjs` and were appended at the end of the array.
- A case-completion policy is written INLINE in the registration entry. `harness/config/verify-case-completion.v1.json`
  is a separate disposition list (`required` / `legacy-process-only`) keyed by suite name and path.

## Disposition rationale

- A disposition entry is needed for exactly the seven suites above marked `yes (required)`; `classifyVulnerableSuite`
  (`check-verify-case-completion.mjs`) returns null for the other sixteen.
- All seven are classified `top-level-assertions` (assertions >= 2, no `node:test` import): fanout-ledger,
  fanout-governor, slice-queue, slice-queue-cli, stop-fanout, runtime-handover-projection-win-path and
  clone-hook-readiness-rollback. New registrations may only start as `required` (`LEGACY-NEW`).
- A `required` entry demands an inline `caseCompletion` policy in the registration and the
  `registerTestCaseCompletion` protocol in the test source.
- The two deferred suites are `node-test-single` with no protocol: no clean disposition exists without migrating the
  test file or a PO decision (Q11).
- Every suite needs one `verify-phase:` surface in exactly one capability of the inventory; most sit with their sibling
  tests in `deterministic-verification`, the exceptions follow the owner of the code under test
  (`continuity-and-handover`, `governance-event-ledger`, `setup-and-runtime-projection`). The capability is a product
  judgement; the PO may move a surface as long as it stays in exactly one capability.

## Expected end state (measured)

Measured on a fresh `git archive` export of HEAD with this package and the S2 package both applied, in either order
([`../../evidence/night-2026-10-05/regproof-result.json`](../../evidence/night-2026-10-05/regproof-result.json) and
[`../../evidence/night-2026-10-05/regproof-reverse-result.json`](../../evidence/night-2026-10-05/regproof-reverse-result.json)):

- `check-verify-case-completion`: **exit 0** (registry valid, 297 entries before and 304 after the seven dispositions).
- `check-verify-suite-registration`: **exit 2**, exactly two findings, both UNREGISTERED, both the deferred Q11 pair:
  `plugins/pipeline-core/lib/hardened-private-directory.install.test.mjs` and
  `plugins/pipeline-core/scripts/gitleaks-repair-ignore.cli.test.mjs`. No `UNCATEGORIZED-VERIFY-SURFACE`, no duplicate
  inventory surface.
- Applied alone, this package leaves four UNREGISTERED findings: the Q11 pair plus the two S2 surfaces
  (`harness/scripts/guard-split-map.test.mjs`, `plugins/pipeline-core/lib/guard/guard-split-contract.test.mjs`), which
  the S2 package registers.

The exit-2 state is a tolerated red state per QG-06: **reason** — PO question Q11 is open (migrate both test files to
the `registerTestCaseCompletion` protocol, or a different disposition); **owner** — PO decision, the Elephant
implements the chosen route; **expiry** — before the 0.7.0 release candidate.
