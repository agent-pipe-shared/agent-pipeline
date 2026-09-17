---
schema: pipeline.backlog-item.v1
id: pipeline.codex-runtime-fixture-assumes-wsl2-in-ci
type: defect
owner: pipeline
status: open
created: 2026-09-17
source: "GitHub Actions Verify run 35263935526 for released commit f8cc1b2297b5b6a2ef2d64a2dd43f4a76ec37f31: only codex-sandbox-runtime-tests failed. Local source inspection and the targeted 15/15 regression run identified the WSL2-only fixture assumption."
sprint: nova-b
done_when: manual
---

# The Codex sandbox runtime fixture treats a fake CLI test as a WSL2 host proof

## Description

The published 0.6.2 commit passed local qualification but its external Verify
failed solely in `codex-sandbox-runtime-tests`.  The native Critic fixture
uses a fake executable and protocol, but reached the production
`observeNativeHost()` check, which intentionally refuses a non-WSL2 host.
GitHub's Ubuntu runner is not a WSL2 host, so the test was not portable.

## Triggering situation

The 0.6.2 public release was already tagged when GitHub Actions run
35263935526 completed red.  A local repair candidate separates the fixture's
synthetic host tuple from the production default and replaces `/usr/bin/env
node` fake-CLI shebangs with `process.execPath`; its direct regression suite
passes 15/15.  It has not been pushed, so a real Actions confirmation is still
required.

## Affected artifact

`plugins/pipeline-core/scripts/codex-native-critic-preflight.mjs`,
`plugins/pipeline-core/scripts/codex-sandbox-runtime.test.mjs`, and the
offline Verify workflow's reduced PATH contract.

## Proposal

Keep the production default host observation fail-closed.  Make only the
protocol fixture inject its declared synthetic host identity, and keep fake
CLIs independent of ambient PATH.  Add a regression that proves the
production entry point still calls real host observation when no test
dependency is supplied.  Confirm the repair with an ordinary GitHub Actions
Verify run before closing this item.

## Triage

- **Decision:** accepted; implementation candidate `de3ccdc4` with its
  reconciliation record at `b86ceb28` is local only pending full candidate
  qualification and external CI readback.
- **Assignment (if accepted):** Nova B post-release CI correction.
- **Date:** 2026-09-17
