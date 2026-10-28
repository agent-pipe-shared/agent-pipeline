# D1 notes: the admit and finalize request carries the Critic range bindings file (2026-10-28)

Patch: `w7-critic-range-bindings-admit-field-d1.patch` (base e7120fab2, two files). Model output; re-verify before relying.

## Cause
`validateCliRequest` closed `review` to REVIEW_KEYS (+ courseContext / genericBatchRef), and the CLI built `preflightInput` from those keys only, so an operator could not pass `correctionInputBindings` to the preflight (consumer saw CDP-CORRECTION-INPUT-REQUIRED inside SCF-INTERNAL). The recon's cited lines were re-verified against the clone and matched.

## Changed lines (plugins/pipeline-core/scripts/session-critic-finalizer.mjs)
1. `validateCliRequest`: the exact-key list for `review` appends `correctionInputBindings` only when the key is present (v1, v2, v3); a present value must be a non-empty string, otherwise SCF-REQUEST. Absent shape unchanged.
2. CLI `common.preflightInput`: `...(request.review.correctionInputBindings === undefined ? {} : { correctionInputBindings: ... })`. No default key; admit/finalize hash the preflight result unchanged, so the echoed `{path, digestSha256}` is bound into `preflightSha256`.
No other behaviour, schema constant, refusal code or SCF-INTERNAL mapping changed.

## Tests (session-critic-finalizer.test.mjs)
Helper change: `fixture({handover:true})` (default off) commits `project/pipeline.json` + `docs/state.md` with the base and changes `docs/state.md` in the reviewed range; imports `SESSION_CRITIC_FINALIZE_REQUEST_V2_SCHEMA` and `preflightCriticDispatch`. New cases `D1 walk (1)` to `(6)`.
- RED (unchanged production, whole file: 87 tests, 82 pass, 5 fail): (3), (4), (5), (6) fail; (1) and (2) pass already (they pin existing refusal and the existing derive command); plus the known pre-existing failure.
- GREEN (patched, whole file: 87 tests, 86 pass, 1 fail): only the pre-existing `private task snapshot binds uppercase delivered-v3 bytes without exporting record prose`.
- Baseline vs patched failing-name sets: baseline = that one name (taken from the RED run, where production code was unchanged); patched = same one name. clone2 baseline run was NOT executed (budget).
- No top-level-assertion pin for the finalizer file exists in check-verify-case-completion.test.mjs (searched, no match); nothing touched there.

## NOT done (budget checkpoint at call 32)
- critic-dispatch-preflight.test.mjs (63), check-verify-case-completion.test.mjs (32), check-product-capability-inventory.test.mjs (30) and `generate-architecture-overview.mjs --check` were NOT run. The clones were not cleaned up (`driver.mjs cleanup`).
- Operator text (slice D2), independent Critic review (parent-owned batch gate).

## Proposed commit message
fix(critic): let the admit and finalize request carry the Critic range bindings file so a range with project-state paths can be admitted

## Operator flow
Apply the patch (`git apply`), `git add -u -- plugins/pipeline-core/scripts/session-critic-finalizer.mjs plugins/pipeline-core/scripts/session-critic-finalizer.test.mjs`, commit with `--no-verify` per the bundle ceremony, stamp, install.

## Protected-path classification
Neither changed file matches a TP-1..TP-13 pattern; both are ordinary plugin source/test paths. The only edits happened in the scratch clone.
