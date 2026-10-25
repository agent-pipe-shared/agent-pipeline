# AGY native-tier repair owner report

## Result

Targeted delivery: **green** in isolated clone `scratch/clones/agy-native-tier-repair-fresh`, based on frozen candidate `821cd35c103e30a027ff5ea8f0a30f0362f40b8d` (tree `375d3dfc3f9e9abb477ce8756fd749a7d77e76b8`). Main was not edited. Nothing was committed. The repair-only overlay is `candidate.patch` (SHA-256 `e5231cbc2d07125d362c7c168e5528e0d282a8c4645dccec15e6a0a7dbd2bbf2`); it changes nine owned paths and is relative to the frozen candidate commit.

The Source route now carries a separate PO-approved Antigravity tier beside the concrete V3 selector: implement/mechanic/worker/readiness use `flash`; deep/critic/advisory/frontier use `pro`. Existing concrete CLI selectors remain intact. The native coordinator and public preparation CLI require explicit approved Model values for governed Pipeline entries, accept only the flat single-entry or existing batch form, and bind the call shape plus every native entry field (including Model and Workspace) into its candidate, expiry, digest, and one-use artifact. The pretool adapter normalizes both forms and rejects mixed shapes. The sealed implementation-consent path still denies direct native implementation launches without its live consent binding, before generic generated-briefing validation can mask that refusal.

No host-provided concrete model ID, effort, or actual native execution was observed. The selected native tiers are configuration selectors only. The preflight model-role observation was unavailable because of session-identity conflict.

## Verification evidence

All paths below resolve inside the isolated clone.

- `node --test plugins/pipeline-core/lib/dispatch-model-enforcement.test.mjs plugins/pipeline-core/lib/antigravity-native-dispatch-coordinator.test.mjs` — exit 0, 37 passed, including public flat CLI and mixed-shape cases; `scratch/clones/agy-native-tier-repair-fresh/scratch/agent-out/agy-native-tier-repair-fresh/model-coordinator-final5.json`.
- `node plugins/pipeline-core/hooks/antigravity-native-dispatch-pretool.test.mjs` — exit 0, 11 passed; exercises flat request file → public prepare CLI → actual flat hook call → replay denial, plus batch, mixed-form denial, expiry, and candidate drift; `scratch/clones/agy-native-tier-repair-fresh/scratch/agent-out/agy-native-tier-repair-fresh/native-pretool-final6.json`.
- `node plugins/pipeline-core/hooks/antigravity-pretool-guard.test.mjs` — exit 0, all 66 original shared adapter checks passed; prior RED retained; `scratch/clones/agy-native-tier-repair-fresh/scratch/agent-out/agy-native-tier-repair-fresh/original-pretool-adapter-final3.json`.
- `node harness/scripts/check-verify-suite-registration.mjs` — exit 0; `scratch/clones/agy-native-tier-repair-fresh/scratch/agent-out/agy-native-tier-repair-fresh/suite-registration-final.json`.
- `node harness/scripts/check-verify-case-completion.mjs` — exit 0; `scratch/clones/agy-native-tier-repair-fresh/scratch/agent-out/agy-native-tier-repair-fresh/case-completion-final2.json`.
- Completion FD streams: `node scratch/run-with-completion-fd.mjs plugins/pipeline-core/lib/antigravity-native-dispatch-coordinator.test.mjs` — exit 0, DECLARED/DISPOSED/TERMINAL = 25/25/25, 25 pass; `scratch/clones/agy-native-tier-repair-fresh/scratch/agent-out/agy-native-tier-repair-fresh/fd-coordinator.json`. `node scratch/run-with-completion-fd.mjs plugins/pipeline-core/hooks/antigravity-native-dispatch-pretool.test.mjs` — exit 0, DECLARED/DISPOSED/TERMINAL = 11/11/11, 11 pass; `scratch/clones/agy-native-tier-repair-fresh/scratch/agent-out/agy-native-tier-repair-fresh/fd-pretool.json`.
- `node --test harness/scripts/check-consumer-safe-paths.test.mjs` — exit 0, 9 passed; `scratch/clones/agy-native-tier-repair-fresh/scratch/agent-out/agy-native-tier-repair-fresh/consumer-safe-paths-final.json`.
- `node scratch/hash-repair-prepost.mjs` — exit 0; final nine-file SHA-256 preimage/postimage list at `scratch/clones/agy-native-tier-repair-fresh/scratch/agent-out/agy-native-tier-repair-fresh/prepost-hashes-final2.json`.

Original G13 red history remains unchanged: `scratch/agent-out/g18-agy-model-carrier-consistency/g18-five-existing.json` records the five original model-missing failures, exit 1. The full shared adapter run now passes after its fixture helper supplies explicit approved tiers and canonical Pipeline TypeNames; no original G13 assertion was edited or waived. The prior G18 resource report states no supplied product resource observations and headroom unknown: `scratch/agent-out/g18-agy-model-carrier-consistency/g18-resource-report.json`, exit 0. No separate quick-check route is configured.

## Changed paths

- `plugins/pipeline-core/lib/model-role-route-source.mjs` — publish explicit native tier metadata beside the concrete V3 routes.
- `plugins/pipeline-core/lib/dispatch-model-enforcement.mjs` — enforce approved native tiers for governed AGY roles and refuse missing, inherited, or mismatched selectors.
- `plugins/pipeline-core/lib/dispatch-model-enforcement.test.mjs` — retain existing model-route examiners and cover the separate native tier projection.
- `plugins/pipeline-core/lib/antigravity-native-dispatch-coordinator.mjs` — validate flat/batch shapes and tier values; bind shape, Model, Workspace, candidate, source, expiry, digest, and replay state.
- `plugins/pipeline-core/lib/antigravity-native-dispatch-coordinator.test.mjs` — cover public CLI flat output, mixed-form rejection, tier negatives, Model/Workspace tamper, and exact completion registration.
- `plugins/pipeline-core/scripts/antigravity-native-dispatch-prepare.mjs` — accept the closed flat request shape and return its flat invocation while preserving batch requests.
- `plugins/pipeline-core/hooks/antigravity-pretool-guard.mjs` — normalize flat and batch calls, carry each Model to ordinary dispatch admission, reject unsupported fields, and refuse native implementation before generic briefing validation.
- `plugins/pipeline-core/hooks/antigravity-native-dispatch-pretool.test.mjs` — exercise public flat CLI → actual hook, mixed-shape rejection, complete-array binding, and one-use checks.
- `plugins/pipeline-core/hooks/antigravity-pretool-guard.test.mjs` — change only native fixture inputs to explicit source-supported tiers/canonical Pipeline TypeNames so the original shared assertions exercise their intended paths.

Three older pretool fixture expectations for unrelated write-capable host-defined subagents were updated to assert the current `DISPATCH-WRITE-CARRIER-REQUIRED` policy. This keeps the existing Pipeline carrier boundary intact; it does not grant those callers native artifact authority. In the original 66-case shared suite, fixture inputs now use explicit `flash`/`pro` Model values and canonical `pipeline-core:` TypeNames; the original assertions remain intact. The direct implementation fixture is outside the item-governed generated-briefing boundary so the consent assertion checks the intended native refusal.

## Deliberately not changed

No V3 concrete model IDs, execution effort, native host attestation, G13 transport, PO-only discard protections, sealed implementation consent, schemas, specs, PRDs, ADRs, installer, or other runner behavior were changed. No private account/config/key access, paid model call, or native host call occurred.

## Deviations, friction, and open work

Read-only command spellings with repeated operands and a pipe were refused by the guard; exact audit recovery succeeded after an un-escalated attempt returned EPERM, and narrowed single-path reads then succeeded. A `git cat-file` spelling containing `^{commit}` was refused as shell syntax and was corrected to `git show`. One `nl | sed` read was refused; the single `sed` read succeeded. No write or scope escalation was attempted from these refusals.

Final integrated Verify/Security: **pending**. Independent frozen-batch review: **pending**. Manual installed-runner/native qualification: **pending**. PO acceptance: **open**. The project Coordinator owns those gates after integration.
