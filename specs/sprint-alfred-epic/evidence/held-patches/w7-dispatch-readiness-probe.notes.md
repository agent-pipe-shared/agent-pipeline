# Dispatch readiness probe: `dispatch-briefing.mjs probe` (Goldfish W7-DISPATCH-READINESS-PROBE-20261030)

Held patch `w7-dispatch-readiness-probe.patch`, built in a scratch clone at candidate c7508bf6c. Nothing applied; the host commits.

## Behaviour

`probe --package <package.json> [--root <dir>]` runs, read-only, the checks a dispatch of that package meets and collects every failure:

1. `package-fields` / `package-paths` / `calibration`: the collector and checks `build` already uses (the field collector yields one combined finding listing all field problems).
2. `binding`: the same `generateDispatchBinding` path as `build`, with a collector (`deps.softRefusals`). Queue-row (NOT-READY, DRIFT x2), RECON-REQUIRED, SCOPE-OVERLAP, CHECK-NOT-TEST, CHECK-COMMAND-UNKNOWN and CHECK-COMMAND-PATH-WRITABLE are recorded and the generator continues; any other refusal is recorded as the one remaining finding of the binding and later dependent checks are named under `skipped`. Without the collector `soft` is `refuse`, so `build` and `binding` refuse exactly as before.
3. `tool-budget`: D193 estimate above the tier cap without a grant route (`budgetDecision`).
4. `plan-approval`: `observeCurrentPlanApprovalForCalibration({rootDir})` (seam `deps.observePlanApproval`); code plus `staleApprovalRepair(code)`.
5. `registry-lock`: reads the lock with the existing `inspectSessionAuthorityLock` reader (seam `deps.registryLock`); held by a dead owner names the `routine-repair.mjs run heal --root ... --reason ...` repair, live/unjudged names the wait/release route; an unobservable lock is a finding of kind `skipped`, never a pass. Never taken, never reserved.

Output `{schema: pipeline.dispatch-readiness-probe.v1, ok, ready, findings:[{code, check, message, repair, kind}], warnings, skipped?, dispatchCall (only when ready)}`; exit 0 ready, 2 otherwise (the CLI tail reads `ok`). Warnings (build's three sources) stay in `warnings`.

## Evidence (clone, driver logs under scratch/agent-out/w7probe)

- RED before production edit: 15 new probe cases fail (`red0.*.log`).
- Clone: dispatch-briefing suite 131/131 (`c1.*.log`); baseline clone2: 116/116 (`base1.*.log`); failing-name sets both empty.
- Revert proof: with the production file reverted, exactly the 15 probe cases fail; restored byte-equal.
- Patch apply-check on the plain candidate: exit 0.

## Deviations / limits

- `dispatchCall.prompt` for probe names the briefing file `build --out` writes (build's no-`--out` wording would point at a `text` field the probe has none of); tool, subagent_type and model are produced by the same helper as build.
- Field problems form one finding (the lib collector throws one combined refusal; splitting it needs `lib/dispatch-briefing-build.mjs`, out of scope).
- Not done: bootstrap (`pipeline-start`) wiring of the probe; live run against a real repository, Full Verify, Critic, PO acceptance.
