# Signed quality package d6d2a8b2 — how it was built (tooling copies)

Landed in `380eb7faa` (base `878050884`), intent
`d6d2a8b2cab7a4c831e85830b9627891b813c5fc10c50994e73b1b4b92a08ee8`: S2 package 1 plus verify-registration package 1
(`../../design/s2-package-1/`, `../../design/verify-registration-package-1/`). These are verbatim copies of the
working scripts so the next package can be built the same way on any device; they originally lived in ignored
`scratch/`. They are evidence of the route, not shipped tooling (a tracked builder is an R3 item).

| File | Original location | Role |
|---|---|---|
| `build-intent.mjs` | `scratch/QP1/build.mjs` | Exports the five target files from HEAD, applies the facade copy and the six staged patches with GNU `patch -p1`, renders a git-style unified diff, computes `expectedDigests` and `intentSha256`, writes the intent and a `*-request.json` for `sign-intent --request`. Requires a clean tree; run from the repository root after copying it back to `scratch/QP1/`. |
| `check-intent.mjs` | `scratch/QP1/check.mjs` | Self-check: HEAD equals `baseCommit`, the digest recomputes, `git apply --check --whitespace=error` passes. |
| `regproof-driver.mjs`, `regproof-checks.mjs` | `scratch/REGADD/` | The both-order proof behind `../night-2026-10-05/regproof-regadd-result.json`. |

Ceremony as run on 2026-10-06 (Claude × native Windows × own repo): PO `po-human-approval.mjs sign-intent --request
scratch/QP1/qp1-request.json` (about 10 minutes before the passphrase prompt), PO materializer `apply`, Elephant
`git add` of the five paths, PO materializer `authorize-commit` (the agent route is refused with
`GUARD-GATE-STRENGTH-SHELL`), Elephant commit with `Dispatch: quality-package-<sha> (integration)`. Not exercised:
Codex, Antigravity, WSL, macOS, consumer repositories.
