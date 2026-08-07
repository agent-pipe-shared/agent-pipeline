# Closure evidence: three GS-6-unblocked backlog fixes (Nova GWM session)

## What this closes

Three small, previously fully-diagnosed defects were blocked on GS-6 (this
checkout being the live-enforcing plugin root in earlier sessions). Today's
session found the live-enforcing root is now the separate local marketplace
directory instead, so GS-6 no longer blocks edits to this checkout — each fix
was dispatched to a fresh Goldfish and independently verified by the Elephant
before this closure.

## `local-worker-supervisor-cli-suite-flakes-under-full-verify`

Commit `577c515404e2bd4c94f890c9cd7009ac93b66d1d`. `waitForRecord()` in
`plugins/pipeline-core/scripts/local-worker-supervisor.test.mjs` now wraps its
`JSON.parse(readFileSync(...))` in try/catch, treating a parse failure as
"not written yet, keep polling" — mirroring `readBoundedJson()`'s existing
production pattern. Reproduce-first was explicitly waived for the final
dispatch (a prior session already reproduced the race deterministically once,
6 concurrent copies, 1/6 failed at LWSC04; two further live-reproduction
attempts in this session, 12 concurrent runs total, could not re-trigger the
low-probability window). Verification: `node --test
plugins/pipeline-core/scripts/local-worker-supervisor.test.mjs` → 9/9 checks
passed, exit 0.

## `release-preflight-cli-base-commit-not-peeled`

Commit `5e20b854afc1f499d1376c43558565389e375c59`. `buildReleasePreflight()`
in `plugins/pipeline-core/scripts/release-preflight-cli.mjs` now resolves
`base.commit` via `${baseCommit}^{commit}`, mirroring the existing `^{tree}`
peel on `base.tree`. RED evidence: a scratch repro confirmed the unfixed code
returned the tag object's own OID (`a1bccf2b01441a48196469436492cc254f7c4fe1`)
instead of the commit it points to
(`ed1432ee433804a599ff1ed6a3751632477a9cb7`). GREEN: `node --test
plugins/pipeline-core/scripts/release-preflight-cli.test.mjs` → 10/10 passed,
exit 0, including the new RPC10 regression fixture (annotated tag as
`--base`).

## `backlog-ledger-closure-reason-misleading`

Commit `19c5bf0f2e2eb0835c1980edaacdae26316934f0`.
`plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs` now selects a
distinct `CLOSED_REASON` for `"to": "closed"` transitions (correctly
describing a sync to the item's own pre-existing, evidence-bound closure
record) instead of the generic "no closure claimed" `REASON` used for
non-closing transitions. Verification: `node --test
plugins/pipeline-core/scripts/reconcile-backlog-ledger.test.mjs` → 12/12
passed, exit 0; `node plugins/pipeline-core/scripts/check-backlog-state.mjs`
→ "Backlog state, transition ledger, closure evidence, and generated
projections are valid."

## Independent Elephant verification

Each commit's diff was read directly (not taken from the dispatched Goldfish's
self-report alone) and each cited test command was independently re-run
against the landed commit before this closure was recorded.
