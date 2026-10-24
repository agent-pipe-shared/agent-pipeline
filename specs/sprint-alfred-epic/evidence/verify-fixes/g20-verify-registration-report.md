# G20-VERIFY-REGISTRATION — inert-clone handoff

Targeted delivery: **green**. Clone `scratch/clones/g20-verify-registration` was created from committed `8ac8893456ac6ba0c1b57b6042365da85df8e2ec`. I composed, in order, the existing G28 Source patch, the earlier fix-wave registration patch, and `scratch/agent-out/g20-bounded-guard-qualification/g20-bounded-guard-qualification.patch`, each through `node scripts/apply-diff.mjs <absolute patch path>`. The [owned overlay](g20-verify-registration.patch) is relative to that complete fixture and has five paths only:

1. `harness/verify-suites.json` — append the two exact G20 witness registrations and ordered 65536-byte required completion policies.
2. `harness/config/verify-case-completion.v1.json` — add two sorted `required` classifications.
3. `docs/product-capability-inventory.json` — assign both new Verify surfaces once to `deterministic-verification`.
4. `plugins/pipeline-core/lib/publication-review-requirement.test.mjs` — add PRR001–004 standard completion recording.
5. `plugins/pipeline-core/scripts/publication-guard-candidate.test.mjs` — add PGC001 standard completion recording.

The two G20 assertion bodies and case order are unchanged. Earlier five-suite registration and DAU/OBC augmentation bytes remain fixture context, excluded from the owned overlay. The changed existing close pin and `push-prepare` test have no adopted required case-completion policy, so no existing-policy extension or recording edit was made. No exclusion or budget reduction was added.

## Machine-written checks

All commands ran from the composed clone through `node plugins/pipeline-core/scripts/capture-evidence.mjs --out scratch/agent-out/g20-verify-registration/<capture> --label <label> -- <command>` at the preflight-required host boundary. Each capture records the exact command and actual exit.

| Exact wrapped command | Exit | Capture |
|---|---:|---|
| `node harness/scripts/check-verify-suite-registration.mjs` | 0 | `registration.json` |
| `node harness/scripts/check-verify-case-completion.mjs` | 0 | `completion.json` |
| `node harness/scripts/check-verify-suite-append.mjs` | 0 | `append-history.json` |
| `node --test harness/scripts/check-consumer-safe-paths.test.mjs` | 0 | `consumer-safe.json` |
| `node --test plugins/pipeline-core/lib/publication-review-requirement.test.mjs plugins/pipeline-core/scripts/publication-guard-candidate.test.mjs` | 0; PRR001–004 and PGC001 passed | `g20-witnesses.json` |

The preceding fix-wave registration phase initially hit sandbox `spawnSync node EPERM` and reran its checks successfully at the host boundary. This phase submitted every targeted check to that boundary from its first call; no G20 check had an EPERM retry. No separate quick route exists.

## Deliberately unchanged and open

No product behavior, existing acceptance assertion, historical suite row, prior completion policy, earlier overlay, main checkout, or actual account state was changed by this owned overlay. Nothing committed. Integrated Full Verify, independent batch review, native qualification, and PO acceptance remain pending with the parent.
