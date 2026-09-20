# CI Verification Evidence — Codex Runtime Fixture WSL2 Assumption Repair

**Backlog Item:** `pipeline.codex-runtime-fixture-assumes-wsl2-in-ci`
**Date:** 2026-09-18
**Author:** Antigravity (Elephant orchestrator)
**Verified CI Run:** GitHub Actions run `35335056284`, job `105567860510`
**Verified Commit:** `bca8f61571f8f6ce9bdae740bc1ecb11ca6dba6d` (ancestor of HEAD `55cea86fcc30e2251d9f3b4dbc76b6f190bc81d1`)
**Target Runner:** GitHub Hosted Runner (`ubuntu-latest`)

## Summary

Backlog item `pipeline.codex-runtime-fixture-assumes-wsl2-in-ci` reported that `codex-sandbox-runtime-tests` failed in CI run `35263935526` because the fixture relied on `observeNativeHost()` expecting a WSL2 environment. On GitHub Ubuntu runners, this caused `codex-sandbox-runtime-tests` to fail.

The repair was implemented across commits:
- `de3ccdc44c5c2d338bf3bc72aa5e3d748d53372c`: separated synthetic host tuple from production default and replaced shebangs with `process.execPath`.
- `8b4aa6aa98c73654fd21703ea8143d26e4dcd2f5`: added repository-scratch fixture correction for `local-supervisor-state.test.mjs`.

## CI Readback

The repair was pushed and qualified externally in GitHub Actions:
- **Run ID:** `35335056284`
- **Job ID:** `105567860510`
- **Job Name:** `verify`
- **Result:** Success (green, 0 exit code, duration 8m1s)
- **Log confirmation:** `codex-sandbox-runtime-tests` (15/15 cases) and `local-worker-supervisor-tests` (25/25 cases) passed with exit 0 under synthetic Ubuntu CI environment.

All acceptance criteria are satisfied.
