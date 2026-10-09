# TR-J-D: the five native preflight reds (partial diagnosis, 2026-10-09)

Status: PARTIAL. The dispatch hit its 80 % budget checkpoint after tracing the three onboarding-gate cases. The two
owner-runtime cases (`:1852`, `:1905`) are **not reached**. Read-only; no code or test was edited.

## A. The shared cause of `:1544`, `:1572`, `:1720` (traced, observed natively)

Observed single-case run (win32, native):
`node --test --test-name-pattern "an unattested origin keeps plugin refresh required and returns a non-executable advisory" plugins/pipeline-core/scripts/pipeline-start-preflight.test.mjs`
fails at `pipeline-start-preflight.test.mjs:226` (`assertRefreshAdvisory`). Actual `nextAction` is the
`onboarding-init.mjs --root <repo-root> --runner codex` command; expected is the `plugin-refresh-advisory` advisory.

Chain (all `file:line` verified by reading):

1. The three tests call `preflight({...})` (helper `:196-213`). Neither the helper nor the cases pass `cwd` or
   `requireProjectOnboardingReadyFn`. The helper injects hermetic stand-ins for clone provisioning, governance scope,
   architecture decisions and the public-core observation, but NOT for the onboarding-readiness gate.
2. `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs:1035` defaults `cwd = process.cwd()` and `:1043` defaults
   `requireProjectOnboardingReadyFn = requireProjectOnboardingReady` (imported from
   `plugins/pipeline-core/lib/project-onboarding-ready-gate.mjs`). So the real gate runs against the LIVE checkout.
3. `pipeline-start-preflight.mjs:1439-1447`: for status `plugin-refresh-required` the real gate is asked
   `requireProjectOnboardingReadyFn({ rootDir: cwd, intent: "bootstrap", runner })`. A `PORG-NOT-READY` throw sets
   `projectOnboardingNotReady = true`.
4. `pipeline-start-preflight.mjs:1609-1630`: `status === "plugin-refresh-required" && projectOnboardingNotReady` selects the
   `onboarding-init` command and skips the advisory arm at `:1655-1666`. That is the observed value.
5. Why the live gate says not-ready natively: the read-only
   `node plugins/pipeline-core/scripts/project-onboarding-v3.mjs inspect --root <repo-root> --intent bootstrap --runner codex`
   returns `status: "runtime-attestation-required"`, diagnostic `restart_required`: "the current Codex projection has no
   native effective-runtime readback" (message source: `plugins/pipeline-core/lib/project-onboarding-v3.mjs:5425`;
   `runtime-attestation-required` is in the gate's non-ready list, `project-onboarding-ready-gate.mjs:41`). `runner` is
   `codex` because the test passes `env: {}`, so no Claude signal is present.

Why win32 and Linux differ: the verdict depends on the live machine's Codex runtime projection/readback state in the
checkout the test happens to run in, not on anything in the fixture. WSL observed green (76/0/2 per Ruling 113), native red.
The exact production line that reads the host state and branches on platform/readback was NOT reached
(`plugins/pipeline-core/lib/project-onboarding-v3.mjs` around `:5425`, to be read next). Hypothesis, unverified: the
readback receipt is absent on the native checkout and present (or not demanded) in the WSL checkout.

### Classification (all three): test defect, the fixture leaks the live repo

The assertions test the plugin-refresh arm of the `nextAction` ladder, which is a function of status plus the onboarding
verdict. The test never fixes the onboarding verdict, so the outcome is the PO machine's onboarding state. Not a product
defect: with the gate not-ready, the production code at `:1609` does what its comment (`NVA-K-DRIVERREACH`) specifies.

### Proposed slice (test-only, target `plugins/pipeline-core/scripts/pipeline-start-preflight.test.mjs`)

In the `preflight()` helper (`:196-213`), default `requireProjectOnboardingReadyFn` to the same hermetic ready stand-in the
file already uses at `:366`, `:395`, `:421`, `:495`, `:543` (`() => ({ schema: "pipeline.project-onboarding-ready-gate.v1",
status: "ready", intent: "bootstrap" })`), still overridable by `...options`. This is one line and fixes all three. Check
that cases at `:567-672`, which pass their own `requireProjectOnboardingReadyFn`, still override it (they spread after).
Open question for the next dispatch: whether a small number of cases in the file rely on the real gate by omission.

## B. `:1852` (`concurrentSessionWarning` null at about :1877) and `:1905` (`ownerRuntime` null at about :1933)

NOT REACHED. Entry points for the next dispatch: `pipeline-start-preflight.mjs:1415`
(`observeConcurrentSessionWarning({ startPath: cwd, currentSessionId })`), the same `cwd = process.cwd()` default, and the
`ownerRuntime` computation. Likely the same fixture-leak pattern (live `.git/agent-pipeline/run` state) or a win32 path /
process-liveness divergence; this is a guess, not a finding. Classification: undetermined. Proposed slice: undetermined.

## Not changed / not verified

- No edit anywhere. The Linux-side observation was not re-run; WSL green is taken from Ruling 113 in
  `specs/sprint-alfred-epic/plans/0.7-execution-order.md`.
- `evidence/TR-J-T-20261009/preflight-native-after.txt` was grepped only for assertion headers; the 19 native reds there include
  cases outside the five in scope.
