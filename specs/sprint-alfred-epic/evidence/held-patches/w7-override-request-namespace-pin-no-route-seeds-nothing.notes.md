# W7-OVERRIDE-NAMESPACE-PIN -- notes (state: HELD, test-only, built by the Elephant in a scratch clone)

Candidate `f7e08669c`. Patch: `w7-override-request-namespace-pin-no-route-seeds-nothing.patch` (one new test file, `git apply --check` exit 0). Backlog item: `2026-10-26-guard-denials-fill-the-override-request-namespace.md` (AC-160).

## What it settles

The matrix row's open point "check the remaining no-route refusal classes for request seeding" is answered by measurement, not by a code change. A probe ran representative denials through the real lifecycle guard in a fresh git repository each and counted files under `.git/agent-pipeline/human-guard-overrides/requests`:

- **No override route, 0 requests:** `GUARD-READ-SCOPE-OUTSIDE-ROOT` (read outside the root), `GUARD-READ-CREDENTIAL-TARGET`, `GUARD-READ-COMMAND-UNSUPPORTED` (unsupported read flag), `GUARD-LIFECYCLE-NOT-READY` (plain `rm`, inline `node -e`, a cross-repository command in a not-ready session).
- **Override offered, exactly 1 request:** `GUARD-PARSE-UNSUPPORTED` (`;`), `GUARD-REDIRECT-UNAPPROVED`, `GUARD-OPERATOR-UNAPPROVED`, `GUARD-CROSS-REPO-MUTATION` (write), `GUARD-EVIDENCE-HOST-PATH`.

The new test file `lib/guard/no-route-denials-seed-no-override-request.test.mjs` (NRS01, NRS02) pins both lists, so a later change cannot start seeding for a no-route class. It passes on the unchanged candidate; there is no production change, so there is no RED step.

## Not covered

- Denials of the other hooks (`guard-testpath`, `guard-gate-strength`, Codex and Antigravity guards) are not probed here; only the lifecycle guard's ten `humanOverrideRoute` call sites were read, and the five classes of the probe cover the codes the Bash and Write lanes produce. The dev-plan and test-path shell lanes were not probed.
- Full Verify, batch Critic and PO acceptance remain pending. The test file sits under a guarded test path, so the PO applies the patch in the same ceremony as the others.
