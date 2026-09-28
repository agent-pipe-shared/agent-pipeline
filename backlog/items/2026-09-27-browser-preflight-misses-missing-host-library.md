---
schema: pipeline.backlog-item.v1
id: pipeline.browser-preflight-misses-missing-host-library
type: defect
owner: pipeline
status: open
created: 2026-09-27
sprint: alfred
done_when: manual
source: "PO-supplied Agy consumer test-results/*/error-context.md, 2026-09-27; direct 0.7 browser-evidence-preflight.mjs run against the same private fixture returned BEP-BROWSER-E2E-READY despite missing libnspr4.so."
---

# Browser preflight reports ready when Chromium cannot load a host library

The Agy Playwright test logs show Chromium failing to start because
`libnspr4.so` is unavailable. The current 0.7 browser preflight checks only
for the Playwright package and Chromium executable. A direct invocation
against that same consumer root returned `status: ready`,
`BEP-BROWSER-E2E-READY`, exit 0. This is a reproduced false readiness signal,
not a failing product test. The earlier browser-provisioning backlog item
covered missing package/executable cases, not this case.

## Direction

Probe browser launchability or an equivalently reliable host-dependency
condition before returning ready. Report missing host dependencies with a
typed, actionable result, without installing packages or downloading a
browser. Make the consumer test/release path consume the preflight result.

## Acceptance

A fixture with an existing Chromium executable and a missing required shared
library cannot return ready. The result distinguishes host unavailability
from a product-test failure; a required `browser-e2e` class cannot pass on a
degraded substitute. The Agy consumer scenario is read back after repair.

## Triage

- **Decision:** pending
- **Assignment:** Alfred candidate verification
- **Date:** 2026-09-27

## Codex preparation (2026-09-28)

`scratch/browser-preflight-source.patch` prepares actual local Chromium launch
and close, typed host-dependency/start failures, a bounded outer probe, seven
canonical fixture tests and registration in source Verify. Seven scratch
fixtures pass, including an existing executable with missing shared library,
generic launch and close failures, nonzero degraded fallback, probe timeout
and static evidence that does not launch a browser. These tests use local
Playwright-shaped fixtures; they are not actual product browser tests.

The patch is incorporated into `scratch/0.7-virtual-integration.patch`.
All 47 proposed JavaScript files in the 55-file aggregate pass syntax checks,
relative dependency checks succeed, and Git dry application passes. Canonical
implementation and consumer replay remain pending. Per the PO's current scope,
active host validation is limited to Codex; this does not claim a fresh Agy
replay or close this item.
