# TR-J-D: the five native preflight reds (partial diagnosis, 2026-10-09)

Status: COMPLETE for all five cases. Section A (three onboarding-gate cases) came from TR-J-D; section B (two owner-runtime
cases) was added by TR-J-D2-20261009. Read-only; no code or test was edited.

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

## B. The two owner-runtime cases (diagnosed by TR-J-D2-20261009, read-only)

Line-number note: the native capture (`evidence/TR-J-T-20261009/preflight-native-after.txt`) reports the cases at
`pipeline-start-preflight.test.mjs:1852` and `:1905`; in the current working tree the same two tests start at `:1873` and
`:1926` (assertion at `:1898`, TypeError site at `:1954`). The file shifted by 21 lines after the capture; names are
unchanged. Cited lines below are the current ones.

Observed natively (win32), single case, re-run in this dispatch:
`node --test --test-name-pattern "another session's LIVE descriptor surfaces" plugins/pipeline-core/scripts/pipeline-start-preflight.test.mjs`
exits 1: `afterOther.concurrentSessionWarning` is `null`, expected the `live` warning (assertion at test `:1898`).

### B1. Shared cause for both cases: the win32/Linux divergence is one line

`plugins/pipeline-core/lib/worktree-lifecycle.mjs:559`:
`if (!Number.isSafeInteger(pid) || pid < 1 || process.platform !== "linux") return null;` in `localProcessStartIdentity`.
Process start identity is read only from `/proc/<pid>/stat` (`:561`), so on any non-Linux platform it is `null`.

Chain (all `file:line` read):

1. `worktree-lifecycle.mjs:567-574` `localProcessOwnerRuntime` returns `null` when the start identity is `null`.
2. `worktree-lifecycle.mjs:642` `startSessionDescriptor` stores `ownerRuntime: localProcessOwnerRuntime(options.ownerPid ?? process.pid)`.
   On win32 every freshly registered descriptor therefore carries `ownerRuntime: null`.
3. `worktree-lifecycle.mjs:715` `inspectSessionOwnerRuntime`: `if (loaded.ownerRuntime === null) return { ...base, status: "unavailable" }`.
4. `pipeline-start-preflight.mjs:846-878` `observeConcurrentSessionWarning` (called at `:1415`) warns only on
   `owner.status === "live"` (`:868`); `unavailable` falls through to `return null`.
   - Case 1 (`:1873`): "another session's LIVE descriptor surfaces a warning" gets `null` at `:1898`. Observed.
   - Case 2 (`:1926`): the test builds `notLive`/`reused` by mutating the descriptor JSON. At `:1954` it does
     `reusedDescriptor.ownerRuntime.processStartId = ...` on the `null` `ownerRuntime`, hence
     `TypeError: Cannot read properties of null (reading 'processStartId')` (the capture shows the same site as `:1933:92`).

On Linux (WSL) `/proc/<pid>/stat` exists, `ownerRuntime` is non-null, both cases are green (Ruling 113).

Design intent is explicit, not accidental: the fail-closed `unavailable` status on non-Linux is already asserted by the sibling
suite, `plugins/pipeline-core/lib/worktree-lifecycle.test.mjs:818`
(`assert.equal(live.status, process.platform === "linux" ? "live" : "unavailable")`, platform-branched at `:821`). The
preflight test file has no `process.platform` branch and no `skip:` anywhere (grep: 0 matches), so it silently assumes Linux.

### Classification (both): host limitation, surfacing as a test defect (no product defect)

- Product: not a defect. A concurrent-session warning that cannot prove liveness degrades to no warning by design
  (`worktree-lifecycle.mjs:559`, the module's "unobserved rather than guessed" contract at `:703`).
- Test: the two cases require a platform capability (Linux `/proc` start identity) and do not declare it. That is the defect.
  This is not a live-repo leak: the fixture is a fresh `mkdtemp` git repo (`buildConcurrencyRepoFixture`, `:1857`).
- Out of scope here and not claimed: whether Windows should get a real start-identity source (for example via a Win32 process
  creation time). That would be a product feature slice and needs a PO ruling; it is not required to make the suite honest.

### Proposed slice (test-only, target `plugins/pipeline-core/scripts/pipeline-start-preflight.test.mjs`)

Add `{ skip: process.platform !== "linux" ? "owner-runtime start identity is Linux-only (worktree-lifecycle.mjs:559)" : false }`
as the options argument to the two `test(...)` calls at `:1873` and `:1926`, mirroring the platform branch already in
`worktree-lifecycle.test.mjs:818-821`. Optional, preferred: add one positive non-Linux case asserting that
`observeConcurrentSessionWarning` returns `null` when the other descriptor's `ownerRuntime` is `null`, so win32 still
covers the fail-closed behaviour instead of only skipping. Both are test-only; a skip must not be applied to the
two descriptor-free cases that follow, which are green natively (capture lines 76-77). QG-04: the test edit is its own dispatch, separate from any fix.
Note this pattern changes skipped-count on win32 (+2), which any native baseline comparison must expect.

## Not changed / not verified

- No edit anywhere. The Linux-side observation was not re-run; WSL green is taken from Ruling 113 in
  `specs/sprint-alfred-epic/plans/0.7-execution-order.md`.
- `evidence/TR-J-T-20261009/preflight-native-after.txt` was grepped only for assertion headers; the 19 native reds there include
  cases outside the five in scope.
