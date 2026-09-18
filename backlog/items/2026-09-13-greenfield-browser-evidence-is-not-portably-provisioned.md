---
schema: pipeline.backlog-item.v1
id: pipeline.greenfield-browser-evidence-is-not-portably-provisioned
type: workflow-improvement
owner: pipeline
status: open
done_when: manual
created: 2026-09-13
sprint: nova-b
tracking: "Nova B — all three reports distinguish valid static/offline verification from unavailable browser evidence, but the consumer path does not make that capability gap early and actionable."
source: "evidence/pipeline-analysis-agy-062-103.md; evidence/pipeline-analysis-claude-session-2026-09-13.md; evidence/pipeline-retrospective-2026-09-13.md."
---

# Greenfield projects cannot reliably obtain the browser evidence their product claims invite

The external Greenfield-runner reports describe a disposable browser fixture
that could be checked with static or offline suites, while Playwright/browser
execution was unavailable in some runners because dependencies or a browser
were absent.  The resulting evidence is honest, but the capability gap is
discovered late and differs by runner.  This repository contains the pipeline,
not that fixture: the fixture is intentionally deleted after each runner test
and is not a product, release artifact, or supported application here.

## Direction

Provide a portable browser-evidence preflight that either prepares the required
dependency/browser through an authorized host boundary or records a typed
degraded-evidence result before implementation starts.  Product claims and
release criteria must then consume that result explicitly.

## Acceptance criteria

- The preflight distinguishes unavailable tooling from a failed browser test.
- It never installs dependencies or downloads browsers without the applicable
  host/PO authority.
- Consumer verification and CI can reproduce the selected evidence mode.

## Progress — 2026-09-18

Commit pending from this worktree adds the first, intentionally narrow
building block: `browser-evidence-preflight.mjs`.  It probes only a locally
resolved `@playwright/test` or `playwright` package and its Chromium
executable; it never runs a product test, installs a dependency, or downloads
a browser.  Its typed result distinguishes a missing package, missing
Chromium, and an unavailable probe from a product-test failure.  A caller
must name `browser-e2e` or an explicit weaker class (`offline-behaviour` or
`static`); when a browser is
unavailable, a declared weaker class is emitted as `degraded` with a non-zero
exit, never as a browser-E2E success.  A later consumer must consciously read
and accept that typed state; an ordinary CI step cannot silently pass it.
An unused fallback beside an already-declared non-browser class is likewise
rejected rather than silently ignored.

Focused coverage is kept in the already registered toolchain-preflight suite:
it pins the no-test/no-install contract, unavailable-versus-failed semantics,
an explicit fallback, and strict CLI arguments. PO decision D2 now requires
`browser-e2e` for public browser claims and makes `degraded` publication
blocking. The remaining acceptance scope is consumer and release/push-gate
integration of that decision; this item therefore stays open.

Host readback of this repository's new preflight returned
`BEP-PLAYWRIGHT-PACKAGE-UNAVAILABLE`: no Playwright package was resolved, no
browser test ran, and no installation was attempted.  That is the exact typed
absence the Greenfield reports had previously discovered only after product
work; it is not represented as a red browser-test result.
