# G30-VERIFY-REGISTRATION — inert-clone handoff

Targeted delivery: **green**. The new clone was based on committed `272d0f668fd594138b8afa308c826e092353ce4c`. I composed the G28 Source patch, first fix-wave registration patch, `scratch/g20-metadata-only-overlay.patch`, and G30 mid-session Source patch in that order, each through `node scripts/apply-diff.mjs <absolute patch path>`. The [owned overlay](g30-verify-registration.patch) is relative to all four imported fixtures and contains exactly four paths:

1. `harness/verify-suites.json` — append the exact `mid-session-hook-refresh-tests` suite with MSH001–002 and the existing 65536-byte required budget.
2. `harness/config/verify-case-completion.v1.json` — add its sorted `required` classification.
3. `docs/product-capability-inventory.json` — assign its Verify surface once to `deterministic-verification`.
4. `plugins/pipeline-core/scripts/mid-session-hook-refresh.test.mjs` — add the standard MSH001–002 completion wrapper.

Both original assertion bodies and their order are unchanged. All earlier G28/G20 registrations and DAU/OBC augmentations remain fixture context, excluded from this overlay. No exclusion, historical policy rewrite, product behavior edit, or budget reduction was made. K156's changing Source/test was untouched.

## Machine-written checks

Every command below ran from the composed clone at the required host boundary through `node plugins/pipeline-core/scripts/capture-evidence.mjs --out scratch/agent-out/g30-verify-registration/<capture> --label <label> -- <command>`. Each capture records command and actual exit.

| Exact wrapped command | Exit | Capture |
|---|---:|---|
| `node harness/scripts/check-verify-suite-registration.mjs` | 0 | `registration.json` |
| `node harness/scripts/check-verify-case-completion.mjs` | 0 | `completion.json` |
| `node harness/scripts/check-verify-suite-append.mjs` | 0 | `append-history.json` |
| `node --test harness/scripts/check-consumer-safe-paths.test.mjs` | 0 | `consumer-safe.json` |
| `node --test plugins/pipeline-core/scripts/mid-session-hook-refresh.test.mjs` | 0; MSH001–002 passed | `mid-session.json` |

Earlier fix-wave registration work had initial sandbox `spawnSync node EPERM` and successful host reruns. G20 and this G30 phase used the host boundary from their first targeted check. No separate quick route exists.

## Deliberately unchanged and open

Nothing committed; main, actual account state, K156 Source, and imported fixture files beyond the permitted G30 test recording wrapper were not changed by this owned overlay. Integrated Full Verify, independent batch review, native qualification, and PO acceptance remain pending with the parent.
