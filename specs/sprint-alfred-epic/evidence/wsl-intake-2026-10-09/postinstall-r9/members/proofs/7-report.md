# ALFRED bootstrap remaining fixture reconciliation R1

## 1. Result per DoD

The owned scratch postimage contains test-only prerequisite fixes for the three requested fixture cases. The Antigravity hard-enforcement suite passes 23/23. The installed-plugin host suite passes 9/9, including IPH09 through the actual pre-commit and commit-msg installer APIs and the real preflight assessment; its FD3 completion capture is terminal and complete.

The two requested bootstrap-source-attestation cases pass in the postimage. The entire suite is 14/15 under the required own-scratch fixture environment because the unchanged no-Git unenrolled case returns `hook-provisioning-blocked` instead of `pipeline-governance-inactive`. The same no-Git result occurs in the unchanged source test under that exact environment, so it is recorded as an environment-sensitive baseline limitation and left untouched.

## 2. Evidence

Candidate identity remains `e87ac5f1d7071570636719a60b1649004c6e7955` / tree `013330771fd44316db8e9b0702a5c93f33e0f903`. Installed preflight was `ready` at ruleset SHA `b7115494a79c3271c224c51d0bd388b0ccfff931a4ae11a0cd6a7eb19ce0b88d`.

The recorded preimage RED logs are retained unchanged:

| Suite | Recorded result | Log SHA-256 |
|---|---|---|
| Antigravity hard enforcement | 21 pass / 2 fail: case 329 ready fixture lacked current mandatory hooks; case 466 key set omitted `mandatoryHookReadiness` | `848d9530a2f0bd8e5e38147a2a0948cf2db389d2cb4f65d7111a392bd433fb0d` |
| Bootstrap source acceptance | 13 pass / 2 fail: PX0-AC-10 at 231 and PX0-AC-17 at 478 lacked current mandatory hooks | `91ddf1f7b7475a4ca221f7d3e8f1ec86b472f9f1154d2d5bb93dc99e47df1ea9` |
| Installed-plugin host | 8 pass / 1 fail: IPH09 fixture lacked actual mandatory hooks | `1d45a2c99840055f357cf99aa57a407dd7f5acf9be96ddc712d92e8d832719e7` |

The postimage hard-enforcement run used direct Node with `TMPDIR` and `GIT_CEILING_DIRECTORIES` both set to the owned `fixtures/` directory: 23 pass / 0 fail. Bootstrap source acceptance under the same host-authorized environment: 14 pass / 1 fail; the two requested cases pass, while the unchanged no-Git unenrolled case has the same `hook-provisioning-blocked` result in the unchanged source run (12 pass / 3 fail, including the two original hook-prerequisite failures). No assertion was removed, skipped, renamed, or repinned.

The first sandbox acceptance attempt produced `GS-RETIREMENT-READBACK-EMPTY` from a nested Node readback before the targeted assertion. That attempt is retained as a failed sandbox observation, not as product evidence. Repeating in the authorized host boundary removed that failure for the two requested cases. The host suite's first postimage attempt found a missing copied root wrapper; after adding the tracked public `install-agy.mjs` entrypoint, the host suite passed 9/9.

The host suite was executed by direct Node with its actual FD3 completion API. Its FD3 capture records DECLARED, all nine DISPOSED pass events, and TERMINAL with counts `{ pass: 9, fail: 0, skip: 0, todo: 0 }`; capture SHA-256: `e2830014c9629b9685628b572bfa9e43d46dd38dc19881b560834f5c47a41e6e`.

Direct Node stdout captures under the same owned-scratch `TMPDIR` and Git ceiling:

| Capture | Result | SHA-256 |
|---|---|---|
| `pipeline-start-preflight-antigravity-hard-enforcement.postimage.green.log` | 23/23 pass | `2a5c47f8ba84788abd158ad49bba2b72b371a7244c1d908ac832d157a0bf2bcf` |
| `bootstrap-source-attestation-acceptance.postimage.host.log` | 14/15 pass; requested cases pass, no-Git unenrolled case retains its baseline environment failure | `c169c90366530da2952e4110fe9553414b4cb91a6750472a0b8955e9cdd65041` |
| `bootstrap-source-attestation-acceptance.source.host.log` | 12/15 pass under the same environment; the no-Git failure matches postimage and the two target cases retain their original hook failures | `023b3c2a60a7e32d3585fe7eb6485cfc82b5dc6321fb026bc0a7aad75d659f99` |

The Git index SHA-256 is `e93206365af0b7c02fc630f90f1a85e9a405e9c35fc35cb7d78854a28ce65e52`; committed HEAD/tree match the candidate above. A concurrent out-of-scope working-tree modification to `plugins/pipeline-core/scripts/codex-isolated-critic-contract.mjs` appeared after the initial clean status; it was not touched. Therefore this reports the index and candidate identity, not a clean whole-worktree assertion.

## 3. Changed files

Only owned scratch files were changed:

- `postimage/plugins/pipeline-core/scripts/pipeline-start-preflight-antigravity-hard-enforcement.test.mjs` — adds an explicit complete current `checkCloneProvisioningFn` fixture for its pure preflight cases and updates the exact output key projection.
- `postimage/plugins/pipeline-core/lib/bootstrap-source-attestation-acceptance.test.mjs` — injects the same current readiness observation for PX0-AC-10 and PX0-AC-17 pure cases, preserving their source-identity and ambiguity assertions.
- `postimage/plugins/pipeline-core/scripts/installed-plugin-attestation-host.test.mjs` — provisions current hooks in disposable Git fixtures with the existing installer APIs and asserts preflight readiness.
- `postimage/install-agy.mjs` — copied tracked public root entrypoint required by the host test's existing relative-layout assertion.
- `run-direct-node-fd3.mjs`, `run-direct-node-capture.mjs`, captured logs, and `installed-plugin-attestation-host.fd3.jsonl` — owned-scratch runners and actual command evidence.

Postimage hashes:

| Path | SHA-256 |
|---|---|
| `postimage/plugins/pipeline-core/scripts/pipeline-start-preflight-antigravity-hard-enforcement.test.mjs` | `1e94747e89becd06a089198e8feaed1d26c3057325660965d77c290f5cf03c51` |
| `postimage/plugins/pipeline-core/lib/bootstrap-source-attestation-acceptance.test.mjs` | `5bd3120655e3485b9daafe2bd07da9634d05ac0a59b536c49852d255dd274d17` |
| `postimage/plugins/pipeline-core/scripts/installed-plugin-attestation-host.test.mjs` | `db7265d0e76caa64216ef1a5466a619aa7ae323d4b34bc9c315416a1abd8bc60` |
| `postimage/install-agy.mjs` | `0b1524675c2a27390593e8553dd8baf27c78eefd7da17b2c9beaa2267f6c8b2c` |

## 4. Deliberately not changed

No production source, live hooks, settings, cache, plugin installation, or main-repository file was edited. The fixed pre-push fixture remains byte-identical at SHA-256 `123a911e9561c9dc36708232925ebef0bcb25aab4ed45d92b2ec92eb553b221d`. Existing foreign, declined, source-identity, missing-advisory-prepush, and callback assertions remain present.

## 5. Deviations and limits

The no-Git unenrolled acceptance case fails in both the original source and postimage only when test roots are placed beneath the required owned scratch fixture parent. The failure predates the postimage edits under this exact environment; resolving it would broaden this fixture-only duty, so its assertion and production behavior were left unchanged. The initial sandbox nested-Node failure and the missing-wrapper postimage failure are separately retained in the evidence above.

## 6. Open items

The parent coordinator can validate the acceptance suite in its combined candidate environment. Independent review and PO acceptance remain pending. No Full Verify rerun, production change, or closure is claimed.
