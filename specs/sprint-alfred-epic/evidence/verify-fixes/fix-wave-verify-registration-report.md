# FIX-WAVE-VERIFY-REGISTRATION — owned inert-clone report

Targeted delivery: **green** on the inert clone based on committed `5815d42c9a1da897a3659d354f943be526b36ad3`. Nothing committed; no Full Verify or acceptance claim.

## Composition and changed paths

I imported `specs/sprint-alfred-epic/evidence/verify-fixes/g28-portable-evidence-proposal.patch` into `scratch/clones/fix-wave-verify-registration` with `node scripts/apply-diff.mjs <absolute G28 patch path>`. The eight G28 Source paths were fixture context. `owned-registration.patch` contains only the following nine owned changes relative to that composed fixture:

1. `harness/verify-suites.json` — append five exact test suite registrations with required case policies.
2. `harness/config/verify-case-completion-augmentations.v1.json` — previous-policy-digest-bound DAU001–003 and OBC001–308 monotone extensions; both retain 65536-byte budgets.
3. `harness/config/verify-case-completion.v1.json` — classify the five new suites as required.
4. `docs/product-capability-inventory.json` — assign each new Verify surface exactly once; audit-pack to `audit-and-evidence-cli`, four others to `deterministic-verification`.
5. `plugins/pipeline-core/lib/guard/audit-pack-command-admission.test.mjs` — add the required APC001–003 recording wrapper to the imported G28 witness.
6. `plugins/pipeline-core/lib/guard/g23-read-help.test.mjs` — add G23C001–003 recording.
7. `plugins/pipeline-core/lib/pins/antigravity-design-phase-scripts-refused-in-draft.test.mjs` — add K152C001–005 recording.
8. `plugins/pipeline-core/scripts/po-human-approval.signing-handoff.test.mjs` — add PHS001–004 recording.
9. `plugins/pipeline-core/scripts/security-remote-identity.test.mjs` — add SRI001–002 recording.

The five test assertion bodies and their case order are unchanged. Existing `verify-suites.json` rows, completion registry entries, and prior policies were not rewritten; only new rows or monotone augmentations were added. No exclusions were added.

## Machine-written targeted evidence

Each command below was run from the inert clone through `node plugins/pipeline-core/scripts/capture-evidence.mjs --out scratch/agent-out/fix-wave-verify-registration/<capture> --label <label> -- <command>`. The capture records command, scope, candidate and actual exit.

| Exact wrapped command | Exit | Capture |
|---|---:|---|
| `node harness/scripts/check-verify-suite-registration.mjs` | 0 | `registration.json` |
| `node harness/scripts/check-verify-case-completion.mjs` | 0 | `completion.json` |
| `node harness/scripts/check-verify-suite-append.mjs` | 0 | `append-history.json` |
| `node --test harness/scripts/check-verify-case-completion-augmentation-policy.test.mjs harness/scripts/verify-case-completion-augmentation.test.mjs` | 0 | `augmentation-policy-tests.json` |
| `node --test harness/scripts/check-verify-suite-append.test.mjs` | 0 | `append-policy-tests.json` |
| `node --test harness/scripts/check-consumer-safe-paths.test.mjs` | 0 | `consumer-safe.json` |
| `node scratch/check-fix-wave-case-inventory.mjs` | 0 | `source-case-inventory.json` |
| `node --test plugins/pipeline-core/lib/guard/audit-pack-command-admission.test.mjs plugins/pipeline-core/lib/guard/g23-read-help.test.mjs plugins/pipeline-core/lib/pins/antigravity-design-phase-scripts-refused-in-draft.test.mjs plugins/pipeline-core/scripts/po-human-approval.signing-handoff.test.mjs plugins/pipeline-core/scripts/security-remote-identity.test.mjs` | 0; 17 cases | `five-witnesses.json` |

The first three capture attempts in the sandbox failed to launch a child `node` process (`spawnSync node EPERM`), so they established no check result. Preflight specified `host-boundary-from-first-call`; the same checks were rerun at the host boundary and produced the captured exits above. Before capability assignment, registration reported five uncategorized new surfaces (zero unregistered); the final captured registration check exited 0.

## Deliberately unchanged and open

No product Source, historical Verify suite row, assertion, exclusion, hash pin, live authority, main checkout, or other worker's files were changed by this owned patch. Integrated Full Verify, independent Critic batch review, native qualification, and PO acceptance remain with the parent and are pending. There is no configured quick-check route to report as passed.
