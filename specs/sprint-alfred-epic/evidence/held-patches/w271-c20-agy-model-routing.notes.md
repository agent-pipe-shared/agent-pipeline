# w271: an Antigravity native child records the model it resolved instead of being refused, and each role is routed to the PO's model choice (candidate 20, G20-43, AC-108)

Base: `15a85d597` (the candidate-20 build chain head). Built in the slice clone `scratch/agent-out/s-agym`. One held patch (two clone commits); `git apply --check` in the real repository fails until the chain is applied in order.
Closest criterion: AC-108 (PRD and Spec unchanged).

STATUS: implementation complete in the clone, targeted checks green. No full Verify, no Critic review, no PO acceptance. The patch does NOT contain the root `pipeline.user.yaml` change that the new registry bytes require (see "Needed outside this patch").

## What the patch changes

1. `lib/agy-native-goldfish.mjs` `evaluateNativeChildCall`: a child whose resolved `modelName` differs from the registry's Antigravity cell is ADMITTED. The verdict carries `modelCheck = { status: "match"|"mismatch", resolved, expected: { duty, value } }`
   and, on a mismatch, one `notice` line. Binding, descriptor and every other check are unchanged (an ambiguous or invalid binding still denies). The measured facts (alias does not select a model; no Model inherits the session) are in the header.
2. `hooks/antigravity-pretool-guard.mjs`: on a `notice` the adapter prints ONE stderr diagnostic line `code=agy-native-child-model-mismatch child=... resolved=... expected=... duty=...` and allows. No new import.
3. `config/runner-profiles-v3.json`, Antigravity cells only: `mechanic` is `gemini-3.8-flash-low` / `low` (implement `flash-medium`/medium and deep `flash-high`/high already matched the routing); `critic_normal` and `critic_high_risk` are
   `{ kind: "alias", value: "inherit" }` (effort kept `high`). Claude and Codex cells are byte-identical.
4. `lib/model-role-route-source.mjs` `AGY_NATIVE_TIERS`: `duty.deep` is `flash` (was `pro`), the two Critic duties are `inherit` (was `pro`). `lib/model-family-authority.mjs` admits `inherit` as a closed `nativeTier` value.
   `lib/dispatch-model-enforcement.mjs`: a duty whose tier is `inherit` is admitted with NO Model (absent, empty or `inherit`) and an explicit alias is refused with `DISPATCH-MODEL-DUTY-MISMATCH` and the repair "omit Model";
   `inherit` is NOT added to `ANTIGRAVITY_NATIVE_MODELS`, so `dispatch-briefing.mjs` still accepts only `flash_lite|flash|pro` and now yields `flash` for all three Goldfish roles (no change to that script).
5. Tests (QG-04, restated in place with a G20-43 comment, every other assertion kept): the pin `lib/pins/antigravity-native-goldfish-dispatch-needs-consent-and-has-no-parent-binding.test.mjs` (the denial case is now an admit + record + one notice case with a match case and a still-denied ambiguous binding; new routing case),
   `lib/dispatch-model-enforcement.test.mjs` (DME12 restated, DME13 new), `lib/runner-profiles-v3.test.mjs`, `scripts/check-routing-projections.test.mjs` (RP38).

## Evidence (clone, one suite at a time, all GREEN)

pin 13/13, dispatch-model-enforcement 13/13, runner-profiles-v3 1/1, check-routing-projections 1/1 (56 checks) -- the last only with the `pipeline.user.yaml` change below applied in the clone. RED before the first production edit: `scratch/agent-out/w271-red-{pin,dme,rp}.txt`.

## Needed outside this patch (stop condition: file outside scope)

`pipeline.user.yaml` (repository root, a gate-strength file, so a human-guard-override edit) pins the registry: `core_registry_sha256` must equal the sha256 of `plugins/pipeline-core/config/runner-profiles-v3.json`, and its `routing.duties` must mirror the registry (`validatePipelineUserV3`).
Without it `check-routing-projections` RP14 ("committed projections match authority") is RED. Exact change (verified: with it RP14 and RP38 are green in the clone):
`core_registry_sha256: "20ee1ddb3fc4d717cc3fd93e6f22898611cb1737c41601fda1ed0d48cb4a9d4a"` (this value holds for the registry bytes of this patch; recompute with `sha256sum` if the registry is touched again);
`routing.duties.mechanic.antigravity`: `effort: "low"`, `selector.value: "gemini-3.8-flash-low"`;
`routing.duties.critic_normal.antigravity` and `routing.duties.critic_high_risk.antigravity`: `selector: { kind: "alias", value: "inherit" }`.

## Evidence, second pass (clone, one suite at a time, GREEN)

Docs: `skills/pipeline-start/references/antigravity-native-dispatch.md` now states the measured Model behaviour and the routing (third clone commit). dispatch-briefing 162/162, guard-dispatch-model 5/5, antigravity-native-dispatch-coordinator 25/25, antigravity-native-dispatch-pretool 11/11,
agy-native-implementation-admission 13/13, model-role-dispatch-select 11/11, model-role-session 39/39, agent-model-registry 17/17, advisory-receipt 7/7, model-family-authority 10/10, GMWKC01 (guard-maintenance-window-kernel-closure) 1/1. None needed a restatement.
The Antigravity guard suite (`hooks/antigravity-pretool-guard.test.mjs`, one file-level test, about 14 minutes) was RED once on four Critic-dispatch cases that passed `Model: "pro"` for a Critic (now refused, "omit Model") plus GS-1 (an ENOTEMPTY in its own temporary-directory cleanup while other
commands ran in the clone). The `prepareNative` helper and the multi-subagent Critic fixture were restated in place (Critic passes no Model; `goldfish-deep` passes `flash`, a fourth clone commit); the full file then ran GREEN (1/1, including GS-1).
Final patch = four clone commits on base `15a85d597`; `pipeline.user.yaml` stays out (see above). Status: targeted delivery green in the clone with the yaml change carried by the Elephant; batch Critic review and PO acceptance pending.

## Not changed / not done

The record target: no per-child store exists at hook time today, so "recorded" means the typed verdict field plus the one stderr line (it fires on every mismatching child hook call, and the hook fires twice per call; no de-duplication state was invented).
Not done: the `pipeline.user.yaml` change (carried by the Elephant).

## Not proven

No real Antigravity host run; the routing rests on the M4c/M10 measurement quoted in the briefing.
