# Held patch notes: R8 carrier pin, async-settlement case count, security provenance reds

Patch: `w7-r8-carrier-pin-async-count-security-provenance-reds.patch`, cut against the candidate-13 stack (candidate commit 6faa56cc0 plus the candidate-13 held patches). Dispatch W7-R8-CARRIER-PIN-ASYNC-COUNT-SECURITY-PROVENANCE-REDS-20261031. Backlog item: `backlog/items/2026-10-30-pre-existing-reds-hide-new-cases.md` (item 8).

All three pins were red identically on plain HEAD. Each red was traced to a decided contract change in the code the pin exercises. Every item is a case (a) restatement: the pin's intent is kept, the fixture or the pinned numbers follow the decided contract. No production file changed, so the guard-dispatch write-carrier rule is not loosened and the downstream-caller sweep is not applicable.

Changed files (all test files; no new test file, nothing to register in the Verify suite list):

- `plugins/pipeline-core/lib/pins/dispatch-guard-rejects-built-in-capitalized-agent-types.test.mjs`
- `plugins/pipeline-core/lib/pins/onboarding-test-runner-reports-async-pass-before-settlement.test.mjs`
- `plugins/pipeline-core/lib/pins/security-scanner-failure-provenance.test.mjs`

## 1. Capitalized built-in agent types (A1, A2, A3 CLI cases)

Observed: four hook-CLI cases got `DISPATCH-WRITE-CARRIER-REQUIRED` instead of the expected admission or `APB-ROLE-UNPARSEABLE`.

Deciding commits: `a0feac3a4` (introduced `writeCapableCarrierAdmission` in `guard-dispatch.mjs`) and `90fa209cf` (PO decision D185, 2026-10-29: "the guard order stays and the tests follow"; the write-carrier check runs before the role, prompt and Advisor checks).

Contract now: `writeCapableCarrierAdmission` admits a shipped read-only pipeline role, the Codex `explorer` and the direct-transport `Explore`, plus the three `pipeline-core:goldfish-*` carriers. Everything else (`Plan`, `general-purpose`, an unknown or unparseable role) is refused with `DISPATCH-WRITE-CARRIER-REQUIRED` before any APB check.

Restatement, intent kept (capitalized built-in types are recognized by the role normalization and never produce an `APB-*` denial):

- `Explore` direct Agent call: still pinned as admitted, exit 0, no `APB-`.
- `Plan` and `general-purpose` direct Agent calls: now pinned as exit 2, `DISPATCH-WRITE-CARRIER-REQUIRED`, no `APB-` code. Names changed from "... is admitted" to "... is recognised (no APB- denial) and refused only by the write-carrier rule".
- Workflow batch of Explore, Plan and general-purpose: pinned as exit 2, carrier code, no `APB-`. Note that in a Workflow the transport is `workflow`, and the carrier rule admits `Explore` only on the `direct` transport, so the whole batch is refused at its first dispatch; `Plan` and `general-purpose` alone are not the sole cause.
- A3 CLI (`bad role`): now pinned as exit 2, carrier code, and no `APB-DISPATCH-INVALID`.

Deliberate assertion removal (QG-04 justification): the A3 CLI case no longer asserts `APB-ROLE-UNPARSEABLE` and no longer asserts the message names `"bad role"`. The carrier refusal text is generic and names no type, and the carrier check runs first by D185, so neither can be produced at the hook. The own code and the value-naming message remain pinned at module level by the unchanged `A3 module: an invalid role gets APB-ROLE-UNPARSEABLE naming the value` case. The CLI-level reachability of `APB-ROLE-UNPARSEABLE` is therefore no longer covered; that coverage moved to the module level with the guard order.

Untouched: the A2 "never reports the misleading Advisor denial" CLI case, all module-level cases, the three RED mirror cases. Case count unchanged (14).

## 2. Onboarding async-settlement pin: declared case count

Observed: pin stated 216 declared cases, 12 children, 18 each; `project-onboarding-v3.test.mjs` now declares 240. Failing: the A3 receipt cases (receipts carry `declaredCount`) and the A4 count case, 6 in total.

Deciding commit: `4013ab2ce` (feat(onboarding): route back to an install after project-uninstall) moved `EXPECTED_CASE_COUNT` to 240; the suite records that twelve callbacks were added so the closed partition keeps an integer share (228 + 12 = 240 = 12 x 20).

Restatement, intent kept (the children partition the declared corpus exactly once and a wrong declared count is refused):

- `SHARDS`, `CHUNKS` and `EXPECTED` are read from the suite's own declarations (`SHARD_COUNT`, `CHUNK_COUNT`, `EXPECTED_CASE_COUNT`) in the suite source, so the next batch of cases does not re-red this pin.
- The cross-check stays independent: A4 still asserts that the registered corpus length equals the declared constant, that ids are unique, that indices are 0..n-1, that each child gets an equal integer share (new explicit divisibility assertion) and that every case is owned exactly once.
- "wrong declared count" invalid-receipt case: `215` became `EXPECTED - 1` (same intent, count-neutral).
- The A4 case name lost the literal "216 ... 18 each"; header comments updated. Nothing deleted.

Case count unchanged (12).

## 3. Security scanner failure provenance (P1 to P4 public producer and CLI cases)

Observed: the public producer and CLI cases reported `ERROR/candidate_snapshot` (`remote-missing`) and exit 2 because the pin's fixture project has no git remote. Three cases red.

Deciding commit: `537d5c85d` (fix(pipeline): bind security evidence to the effective push remote; dispatch G32-SECURITY-REMOTE) makes the candidate snapshot require exactly one effective push remote (`resolveSecurityRemoteIdentity`, reasons `remote-missing` and `remote-ambiguous`). It is the same in the main checkout, so this is a contract change, not a fresh-clone effect.

Restatement, intent kept (provenance, distinguishable failure cases and exit codes of the public producer and CLI): `producerFixture` now adds `origin` with an `example.invalid` URL before the fixture commit, exactly as `security-scan.test.mjs` `commitFixture` does. No assertion changed.

Case count unchanged (13).

## Evidence summary (logs are in the scratch clones, not tracked)

- Baseline run of the three pins on the unchanged candidate (run label `base1`): capitalized pin 4 red, onboarding pin red (receipt cases and A4), security pin 3 red.
- Edited clone (run label `c1`): the three pins green (14, 12 and 13 tests, 0 fail); `guard-dispatch.test.mjs` 81 of 81, `security-remote-identity.test.mjs` 2 of 2 and `check-verify-case-completion.test.mjs` 32 of 32, identical to the baseline run (`base2`).
- Revert proof: no production file changed, so the driver revert mode does not apply; the proof that the cases fail without the change is the `base1` baseline run of the original pins on the unchanged candidate.
- Downstream sweep: not applicable (no production function changed).
- Pinned counts in `check-verify-case-completion.test.mjs`: not moved.
