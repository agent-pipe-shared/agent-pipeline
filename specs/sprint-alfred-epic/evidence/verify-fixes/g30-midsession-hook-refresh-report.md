# G30 mid-session trusted hook refresh — inert qualification

Base: `8ac8893456ac6ba0c1b57b6042365da85df8e2ec` in `scratch/clones/g30-midsession-hook-refresh`, a descendant of `ca5639436`. Main tracked files and installed account/runtime data were read-only. Targeted delivery: green, synthetic fixture qualification only. No native host binding, opening record, attestation, install or integration is claimed.

## 1. DoD results and evidence

- Trusted stale source -> refresh -> current readback: passed for pre-commit, commit-msg and pre-push using real installer methods and absolute snapshot bindings. `node plugins/pipeline-core/scripts/capture-evidence.mjs --out scratch/g30-mid-session-targeted.json --label g30-mid-session-targeted -- node --test plugins/pipeline-core/scripts/mid-session-hook-refresh.test.mjs`, wrapped exit 0, 2/2 cases. Artifact: `scratch/clones/g30-midsession-hook-refresh/scratch/g30-mid-session-targeted.json`.
- Tampered hook and untrusted symlink source: passed. The tampered hook was skipped; the two remaining upgrades failed on source integrity; all original hook bytes were preserved. Same targeted command/artifact, exit 0.
- Consumer safe paths: passed. `node plugins/pipeline-core/scripts/capture-evidence.mjs --out scratch/g30-consumer-safe.json --label g30-consumer-safe -- node --test harness/scripts/check-consumer-safe-paths.test.mjs`, wrapped exit 0, 9/9. Artifact: `scratch/clones/g30-midsession-hook-refresh/scratch/g30-consumer-safe.json`.
- Staged diff check: passed. `node plugins/pipeline-core/scripts/capture-evidence.mjs --out scratch/g30-staged-diff-check.json --label g30-staged-diff-check -- git diff --cached --check`, wrapped exit 0. Artifact: `scratch/clones/g30-midsession-hook-refresh/scratch/g30-staged-diff-check.json`.
- Quick route: unavailable in briefing. Project resource headroom: unknown; no criterion-bound measurement was supplied. Integrated Full Verify and Critic: parent-owned, pending.

## 2. Changed files

- `plugins/pipeline-core/scripts/mid-session-hook-refresh.test.mjs`: adds a scratch-contained behavioral fixture for a ready-session source update and refusal paths. The existing production code satisfied the fixture. Exact staged diff: `scratch/agent-out/g30-midsession-hook-refresh/candidate.patch`.

## 3. Deliberately not changed

Production refresh/installer/source-integrity code, prior acceptance examiners, live hooks and runtime snapshots, main checkout, calibration and private State.

## 4. Deviations

No RED-to-GREEN code fix was needed; the new behavioral regression passed against the original code. The clone's exact-path commit failed with `Author identity unknown` (exit 128); no identity was invented or configured. The test remains staged and uncommitted in the inert clone. `git diff --cached --binary --output=...` was guard-refused; `candidate.patch` was generated from read-only `git diff --cached --binary` output and validated by `git apply --reverse --check` (exit 0).

## 5. Open items

Verify: integrated Full Verify pending. Independent review: batch Critic pending. Manual/native runtime check: pending; the fixture does not attest a real ready session or installed account. PO acceptance: open. Parent must integrate the staged test with an authorized commit identity/route; if the parent performs the commit act, use `Commit-Act: orchestrator`. No resource compliance claim or quick PASS is made.

## Parent isolation readback

The worker traced the invoked installer paths after review: Git derives commonDir and hook paths from the disposable fixture repository, and the test checks containment before applyInstall. Installer artifacts and snapshots remain below that Git common directory; source trees are below fixture scratch. The fixture renders hooks but never executes them. The injected readiness seam avoids account provisioning. No invoked path uses userInfo().homedir, .apsp or address-root repair. The Windows ACL branch was not exercised on Linux. HOME redirection alone was not used as the isolation argument.
