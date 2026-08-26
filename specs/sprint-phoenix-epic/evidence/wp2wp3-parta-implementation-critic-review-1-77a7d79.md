# Critic review 1 (implementation): WP2-WP3 Part A (bootstrap self-application origin/content allowlist)

**Reviewer:** pipeline-core:critic, functional-equivalent-read-only lane, requested route claude-opus-5 at max. Effective model identity: unknown.
**Reviewed object:** commits `99396a7`, `57636b2`, `cc11803`, `77a7d79` (enumerated, confirmed exactly these four via `git rev-list`), base `ed22bcc`. Scope: design §A.1-§A.7 only (Part B out of scope, correctly absent).
**Verdict: FAIL** — F1/F2 blocker, F3/F4 major, F5/F6 minor.

## Findings

### F1 — blocker: the SKILL.md edit pushes the mandatory bootstrap payload over its own 15,000-byte budget, breaking a registered Verify suite

`skills/pipeline-start/SKILL.md` grows from 14,613 to 15,094 bytes across this diff. The registered suite `bootstrap-payload-measure-cli-tests` (`harness/scripts/verify.mjs:401`) asserts `SKILL.md` bytes + envelope stay within `BOOTSTRAP_PAYLOAD_MAX_BYTES = 15_000`. Reproduced directly: `node plugins/pipeline-core/scripts/bootstrap-payload-measure.test.mjs` → exit 1, `AssertionError: false !== true`.

### F2 — blocker: the new attestation can never succeed against the real installed plugin layout, permanently disabling bootstrap Step 0

`observePipelineStartPreflight` calls the observer self-referentially against `pluginRoot`, which for an installed plugin is `~/.claude/plugins/cache/<marketplace>/pipeline-core/<version>` — no `.git` directory. `resolveSourceLayout`/`observeGit` require one. So `attestationFailed` is permanently true for every real installed copy, `status` is permanently `plugin-refresh-required`, and per this diff's own SKILL.md Step 0 edit, an advisory `nextAction` means "nothing to execute, proceed to Step 2" — so the mandatory V4 onboarding action (`project-onboarding-v3.mjs inspect`) never runs, in any session, once this ships. Reproduced directly against the real installed root (`/home/skar667/.claude/plugins/cache/agent-pipeline-local/pipeline-core/0.5.2`, confirmed no `.git`): `observePublicCoreIdentity(...)` → `{"status":"rejected","reasonCodes":["SNT-A2-SOURCE-LAYOUT-INVALID"]}`. This is not the disclosed "advisory newly appearing on some sessions" (design §A.6) — the design's own "unverified assumption" (a real marketplace-git install preserves `.git` at the plugin root) is false, verified in one command, and was not checked before implementation.

### F3 — major: the new test suite is not registered in the Verify gate

`public-core-origin-allowlist.test.mjs` is created but never added to `verify.mjs`'s suite list, unlike every sibling `lib/*.test.mjs`. The only test protecting the gate-deciding, GS-8-guarded allowlist constant never runs in the gate.

### F4 — major: the per-runner default observer selection has zero test coverage

Every one of the 27 `pipeline-start-preflight.test.mjs` cases injects a stub `observe`; none exercises the real `runner === "codex" ? observeCodexPublicCoreIdentity : observePublicCoreIdentity` default path — the exact line F2's real-world failure lives in. 27/27 green while the production default path was never run.

### F5 — minor: a sibling Verify suite became non-hermetic (spawns a subprocess, hashes the whole plugin tree)

`bootstrap-payload-measure.test.mjs` calls `observePipelineStartPreflight` with no `observe` override, so it now performs a real observation (subprocess + full recursive tree hash) on every Verify run — host-state-dependent, not fixture-dependent.

### F6 — minor: GS-8 protects the constant but not the test that pins it

`public-core-origin-allowlist.test.mjs`'s own assertions (exact-2, exact-URLs) are not GATE_STRENGTH-protected, so an agent session can relax them even though it cannot edit the constant directly. Compounds F3.

## Trajectory check

**Verdict: inconsistent.** The real `verify.mjs` run recorded for this candidate ran ZERO suites (`verify-journal` threw `VERIFY-CLEANUP-REGISTRATION-REQUIRED` before planning any — confirmed pre-existing and unrelated to this diff, so not itself a finding). The supplementary evidence artifact substituting for it does not cover `bootstrap-payload-measure-cli-tests` (the one registered suite this diff actually breaks, F1) and names two `guard-gate-strength*` test files that do not exist in the candidate tree (evidence gathered against a different, non-candidate tree). Everything independently reproducible (the 27/27 pipeline-start-preflight run, commit/tree binding, authorship trailers) checked out consistent.

## Verdict

**FAIL**, two blockers. F2 is the significant one: it is not a coding mistake inside an otherwise-sound approach, it is the design's own flagged "unverified assumption" turning out false for the real installed-plugin layout — the self-referential git-based attestation mechanism, as specified, cannot work for a marketplace-installed (non-git) plugin copy at all.
