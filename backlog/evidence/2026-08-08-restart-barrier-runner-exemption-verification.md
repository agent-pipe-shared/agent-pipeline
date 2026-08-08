# Independent verification that the Codex-only restart barrier no longer blocks a Claude onboarding

Date: 2026-08-08
Closes: `pipeline.onboarding-restart-flow-is-codex-only-not-runner-aware`,
`pipeline.restart-launch-is-codex-only-for-every-runner`
Closing commit: `864c7f1f84b5e0a874e360bf26e168fa92f14aaf` (dispatch RUNAUT-1)

## Why this file exists

A dispatch reported both items as already fixed and stopped without changing
anything. That is the same shape as a "pre-existing failure" claim, and two such
claims were wrong earlier the same night
(`backlog/items/2026-08-08-pre-existing-failure-is-a-claim-that-needs-evidence.md`).
The orchestrator therefore re-established the two load-bearing facts directly
rather than accepting the report.

## What was checked, and where

1. **A Claude chain no longer publishes a restart barrier at all.**
   `plugins/pipeline-core/lib/project-onboarding-v3.mjs:3809`

   ```js
   const barrierRequired = requiresNativeRuntimeReadback(beforeApply.runner);
   let persisted = null;
   if (barrierRequired) {
     ...prepareRuntimeRestartBinding(...)
   ```

   `prepareRuntimeRestartBinding` — and with it the whole ticket-bound clearing
   path — is unreachable when the predicate is false. This is the decisive fact:
   the gate the PO could not open is not merely routed differently, it is never
   created. The predicate is a closed membership test and fails closed, so an
   unnamed runner keeps the Codex-strength barrier rather than silently escaping
   it.

2. **`restartAction` branches on the runner.**
   `plugins/pipeline-core/lib/project-onboarding-v3.mjs:1572`

   ```js
   function restartAction(_root, barrierSha256, runner) {
     if (runner !== "codex") return externalOperatorRestartAction(runner);
   ```

   `externalOperatorRestartAction` (`:1600`) returns `kind: "external-operator"`
   with `requiresCurrentProcessExit: false` and guidance to end and resume the
   session at the same project root — it never names the Codex launcher and never
   spawns a subprocess.

## Suites on the verified tip

- `node --test plugins/pipeline-core/lib/project-onboarding-v3.test.mjs` — 107 passed, 0 failed, exit 0
- `node --test plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` — 51 passed, 0 failed, exit 0
- `node --test plugins/pipeline-core/lib/codex-onboarding-runtime.test.mjs` — 19 passed, 0 failed, exit 0

## Scope of this verification, stated precisely

This is a code-path verification on the branch tip, not a fresh end-to-end
greenfield onboarding run under the Claude runner. The PO's own installation test
of the next candidate is what closes that remaining gap, and it is the reason the
candidate is handed over before anything is proposed for `main`.

## What this does NOT close

The `runner = "codex"` parameter defaults across the onboarding module are
untouched by `864c7f1`. They are decided separately — fail-closed — in
`backlog/items/2026-08-07-absent-runner-flag-silently-defaults-to-codex.md`, and
that implementation is still outstanding.
