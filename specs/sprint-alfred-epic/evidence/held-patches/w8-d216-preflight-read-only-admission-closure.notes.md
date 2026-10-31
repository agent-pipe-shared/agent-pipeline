# W8-D216 preflight read-only admission closure: STOPPED, no patch (scope burst)

Dispatch W8-D216-PREFLIGHT-READ-ONLY-ADMISSION-CLOSURE-20261031, candidate 682b489cb7be11d1480f0b770ffda6dc2bbada5a.
Outcome: checkpoint. No production file, no test and no patch was changed. This file is the only change.

## Why the work stopped

Stop condition (briefing field 5): "The smallest write-free closure needs more than 4 module splits outside the allowed
files". Measured on the STACKED clone (N35, CIB/D213, D215, chain-walk, D214-walk and suite-registration patches applied).

## Measurements

- Preflight closure today: 362 modules, 132 name a write API (measured with `scratch/agent-out/gst33-closure.mjs`).
  The single edge that pulls them in is `scripts/critic-dispatch-preflight.mjs` line 25
  (`import { evaluateReviewAdmission } from "./check-critic-skip-coverage.mjs"`), used once at line 498.
- Closure of the pure helpers that `evaluateReviewAdmissionCore` needs
  (`critic-skip-decision`, `critic-disposition-addendum`, `dispatch-record`, `governance-event`, `commit-message-policy`,
  `review-economy`): 7 modules, 0 write APIs. These can move into a read-only module without any split.
- `check-runner-manifest-parity` (used only by the signed-import path, not by `evaluateReviewAdmission`): 0 write APIs; it
  stays in the old file.
- Four dependencies of the core path carry the weight. Each is in the allowed files, but each reaches the write-capable
  world through its own imports, so a read half inside `lib/review-admission-read.mjs` is not enough:

| Core-path need | Allowed module that owns it | Reaches (outside the allowed files) |
|---|---|---|
| `readBoundConsumedCriticReceipt` (every addendum-covered record) | `lib/critic-verify-lifecycle.mjs` | `scripts/critic-packet-preflight.mjs` (writeFileSync, mkdirSync, rmSync, renameSync, unlinkSync, openSync, chmodSync), `scripts/session-critic-finalizer.mjs` (writeFileSync, mkdirSync, rmSync, openSync, chmodSync) |
| `loadResidualAcceptanceDepsForPacket` (D217, N35 A) | `lib/critic-verify-readiness.mjs` (NOT in the allowed files) | itself (mkdirSync, renameSync, unlinkSync, openSync), `lib/critical-action-authorization.mjs` (writeFileSync, mkdirSync, renameSync, unlinkSync, openSync), and `critic-packet-preflight` again |
| `readHistoricalFreshReviewAdmission`, `historicalFreshReviewPacketBinding`, `historicalFreshReviewCaptureFacts` | `lib/historical-fresh-review-admission.mjs` | `scripts/po-human-approval.mjs` (resolvePoKeyDirectory; writeFileSync, mkdirSync, rmSync, openSync, chmodSync), `lib/po-gate-authority.mjs` (openSync), `lib/project-authority.mjs` (writeFileSync, mkdirSync, rmSync, renameSync, unlinkSync, openSync, copyFileSync), `lib/critical-human-proof-policy.mjs` (writeFileSync, mkdirSync) |
| `readPortableAgyAuthorshipExport` | `lib/portable-agy-authorship-export.mjs` | `lib/worktree-lifecycle.mjs` (writeFileSync, mkdirSync, rmSync, renameSync, unlinkSync, openSync), `lib/agy-host-observed-store.mjs` (mkdirSync, unlinkSync, openSync), `lib/critical-human-proof-policy.mjs`, and `lib/agy-host-commit-admission.mjs` -> `lib/native-goldfish-host-state.mjs` (mkdirSync, renameSync, unlinkSync, openSync) |
| `verifyQualityPackageIntegrationPostCommit` (abandoned-v3 index) | `lib/signed-quality-package.mjs` | `lib/critical-human-proof-policy.mjs` only (closure of 8 modules; its own writers are in the same file) |

## Modules outside the allowed files that would each need a read/write split

1. `lib/critic-verify-readiness.mjs` (mkdirSync, renameSync, unlinkSync, openSync)
2. `lib/critical-action-authorization.mjs` (writeFileSync, mkdirSync, renameSync, unlinkSync, openSync)
3. `scripts/critic-packet-preflight.mjs` (writeFileSync, mkdirSync, rmSync, renameSync, unlinkSync, openSync, chmodSync)
4. `scripts/session-critic-finalizer.mjs` (writeFileSync, mkdirSync, rmSync, openSync, chmodSync)
5. `scripts/po-human-approval.mjs` (writeFileSync, mkdirSync, rmSync, openSync, chmodSync)
6. `lib/po-gate-authority.mjs` (openSync)
7. `lib/project-authority.mjs` (writeFileSync, mkdirSync, rmSync, renameSync, unlinkSync, openSync, copyFileSync)
8. `lib/critical-human-proof-policy.mjs` (writeFileSync, mkdirSync)
9. `lib/worktree-lifecycle.mjs` (writeFileSync, mkdirSync, rmSync, renameSync, unlinkSync, openSync)
10. `lib/agy-host-observed-store.mjs` (mkdirSync, unlinkSync, openSync)
11. `lib/native-goldfish-host-state.mjs`, reached through `lib/agy-host-commit-admission.mjs` (mkdirSync, renameSync, unlinkSync, openSync)

Eleven splits outside the allowed files against a limit of four. A split also may not stay inside the write scope: the
scope names exactly one new module (`lib/review-admission-read.mjs`), so every read half of these eleven would have to be
folded into that one module or into new files the scope does not name.

`lib/critic-review-lineage.mjs`, `lib/critic-review-lineage-core.mjs`, `lib/po-approval-proof.mjs`,
`lib/windows-private-state.mjs`, `lib/agy-host-observed-receipt.mjs` and `lib/agy-host-commit-admission.mjs` itself name
no write API; they were counted only as pass-through edges.

## Options for the coordinator (a judgment call, not mine)

- A. Widen the scope to the eleven modules and accept a large mechanical split (read halves in the new module, old
  files re-export). It keeps the preflight's admission result identical to `evaluateReviewAdmission` for every caller.
- B. Give the preflight a narrower admission that injects the three heavy readers (receipt reader, residual loader,
  historical reader) instead of importing them. The read-only module would then carry the core and the 7-module helper
  closure, and the preflight would pass the readers from a caller that is allowed to be write-capable. This changes what
  the preflight itself can see unless every preflight caller supplies the readers; it needs a PO decision on D216.
- C. Take `scripts/critic-dispatch-preflight.mjs` out of `GATE_STRENGTH_SHELL_READ_ONLY_SCRIPTS` (rejected by the briefing:
  no change of that list).

No third GST33 exception, no change of GST33 / GST33b, and no hiding of a module from the name scan was attempted.

## Verification state

No suite was run: nothing was edited, so there is no red to turn green and no baseline comparison to make. The only runs
were the closure measurements above (`gst33-closure.mjs` on the clone, and two read-only probes kept in the scratch area
of the repository).
