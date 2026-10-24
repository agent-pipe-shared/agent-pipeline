# G22 portable dependency preparation

Bootstrap check passed: ruleset 961616d408f8f37b60b38f52700c21e2b87c353250a141e725f3d10b9a74df4d loaded · Project agent-pipeline · Calibration project/pipeline.json · State briefing G22-PORTABLE-DEPENDENCY-PREPARATION/2026-10-24 · Role Goldfish

## 1. DoD and evidence

Targeted delivery: green in the inert clone based on `f2aee4ec2456b11db56e26bba0d5fba9690ed240`. The cumulative `--commit` patch prepares a clean exact candidate from committed `package.json`, `package-lock.json`, and `packageManager: npm@x.y.z`, using fixed `npm ci --ignore-scripts --no-audit --no-fund` arguments before Verify. The preparation uses the existing Windows npm shim planner, resolves the launcher away from the candidate worktree, and spawns with `shell: false`. Semantic dependency-map comparison now accepts reordered JSON keys while refusing changed names/versions. No real npm, network, lifecycle script, host module copy, or account was used.

- RED: `node plugins/pipeline-core/scripts/capture-evidence.mjs --out scratch/g22-portable-keyorder-red.json --label g22-portable-keyorder-red -- node --test --test-name-pattern=prepares plugins/pipeline-core/scripts/verify-evidence-producer.test.mjs`; exit 1. The original string comparison refused an equivalent reordered lock map. Artifact copied here.
- GREEN: `node plugins/pipeline-core/scripts/capture-evidence.mjs --out scratch/g22-portable-producer-final.json --label g22-portable-producer-final -- node --test plugins/pipeline-core/scripts/verify-evidence-producer.test.mjs`; exit 0, 41/41. Artifact copied here. Scope: Verify producer; owner: G22 Goldfish.
- GREEN: `node plugins/pipeline-core/scripts/capture-evidence.mjs --out scratch/g22-portable-consumer-safe.json --label g22-portable-consumer-safe -- node --test harness/scripts/check-consumer-safe-paths.test.mjs`; exit 0, 9/9. Artifact copied here. Scope: consumer path safety; owner: G22 Goldfish.
- GREEN portable planner: `node plugins/pipeline-core/scripts/capture-evidence.mjs --out scratch/g22-portable-windows-planner.json --label g22-portable-windows-planner -- node --test plugins/pipeline-core/lib/pins/capture-evidence-does-not-normalize-windows-npm-launch.test.mjs`; exit 0, 9 passed, 2 native Windows cases skipped. Artifact copied here. Scope: existing launch boundary; owner: G22 Goldfish.
- Retained first run: `g22-original-40-case-green.json` is the previous 40/40 producer capture; `g22-portable-focused-green.json` is the current focused capture, exit 0.

No separate quick route is configured. Project resource headroom remains unknown because no candidate-bound limit and measurement observations were supplied; no measurement PASS is claimed. Integrated Full Verify, independent Critic review and PO acceptance were not run here.

## 2. Changed files

- `plugins/pipeline-core/lib/commit-worktree-dependencies.mjs`: candidate-bound npm preparation, semantic lock comparison, and reuse of the Windows npm launch planner.
- `plugins/pipeline-core/scripts/verify-evidence-producer.mjs`: prepares dependencies before Verify in the detached commit worktree.
- `plugins/pipeline-core/scripts/verify-evidence-producer.test.mjs`: behavioral fixture and pure Windows vector tests, preserving the original acceptance cases.

`change.patch` is the exact cumulative three-file diff from the base. Changes remain uncommitted in the inert clone; nothing committed and main was not edited. No native author, model, installed runtime, or Windows execution claim is made.

## 3. Deliberately not changed / open items

G17 Critic host/session, G21 Result/close coordinator, K156 State, guard grammar, capture-evidence implementation, PRD/Spec and no-Critic close remain untouched. Native Windows npm execution remains unqualified on this Linux host. The supported setup is intentionally limited to exact-version npm lockfiles; other package managers and builds requiring lifecycle scripts need explicit recovery. Whole integrated Verify: pending. Independent review: pending/deferred to coordinator batch. PO acceptance: open.

CONTINUATION CARD -- done: cumulative three-file patch, retained original 40-case evidence, key-order RED and 41/41 plus consumer/planner GREEN; remaining: integrate patch, run native Windows qualification, integrated Verify, required Critic batch and PO acceptance; next step: coordinator reviews `change.patch` and captured evidence.
