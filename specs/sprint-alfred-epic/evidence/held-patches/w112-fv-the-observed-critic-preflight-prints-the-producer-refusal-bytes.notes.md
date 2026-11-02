# w112 - the observed Critic preflight prints the producer's refusal bytes

## What

`observe-critic-preflight.mjs` promises to return the exact direct-CLI protocol bytes, but its refusal line was rebuilt as a bare `{schema, status, code}` and dropped every `reason` and detail the producer carries. Since candidate 17 (`CDP-EVIDENCE-REQUIRED` now carries a reason) the two printed different stderr bytes. The producer gets one exported builder, `criticDispatchPreflightRefusalLine`, used by its own CLI catch block and by the observed controller, so the two cannot differ again.

## Why

Found by the Full Verify (two red cases of `observe-critic-preflight-tests`, already red at the candidate 17 base). A real, small product defect: an observed run hid the reason a refusal gives.

## Verification (orchestrator, in a clone at the applied candidate 18 tree)

`observe-critic-preflight.test.mjs` 3/3 and `critic-dispatch-preflight.test.mjs` green. Patch applies to HEAD (`apply --check` exit 0).

## Apply order

After w111.

## Not proven

The sweep form (`--sweep-evidence`) is not run through the observed controller and is unchanged.
