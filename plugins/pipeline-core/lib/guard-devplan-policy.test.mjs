// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { devPlanGateVerdict, evaluateStagedDevPlanPaths, isCriticScratchNotesPath } from "./guard-devplan-policy.mjs";

function lifecycleFixture({ phase = "design", planApproved = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "staged-devplan-policy-"));
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(join(root, ".claude", "pipeline.yaml"),
    "schema: pipeline.manifest.v0\ngates:\n  dev-plan:\n    mode: blocking\n    type: human\n");
  writeFileSync(join(root, ".claude", "pipeline-state.json"), JSON.stringify({
    schema: "pipeline.state.v0",
    activeFeature: { id: "staged-fixture", planPath: ".claude/plans/plan.md", phase },
    planApproved,
  }));
  return root;
}

test("isCriticScratchNotesPath identifies critic notes and dispatch scratch paths", () => {
  assert.equal(isCriticScratchNotesPath("scratch/dispatch/TASK-1/critic-notes.md"), true);
  assert.equal(isCriticScratchNotesPath("scratch/dispatch/TASK-1/repro.js"), true);
  assert.equal(isCriticScratchNotesPath("scratch/sub/critic-notes.md"), true);
  assert.equal(isCriticScratchNotesPath("src/index.js"), false);
});

test("devPlanGateVerdict unconditionally admits scratch/dispatch/TASK-1/critic-notes.md during all phases", () => {
  const result = devPlanGateVerdict({
    filePath: "scratch/dispatch/TASK-1/critic-notes.md",
    projectDir: process.cwd(),
  });
  assert.equal(result.verdict, "allow");
});

test("staged lifecycle policy blocks indirect implementation and package outputs but preserves allowed ordinary commits", () => {
  const root = lifecycleFixture();
  try {
    const blocked = evaluateStagedDevPlanPaths({ projectDir: root, stagedPaths: ["src/game.js", "package.json"] });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, "PIPELINE-STAGED-LIFECYCLE-BLOCKED");
    assert.deepEqual(blocked.findings.map(({ path, code }) => [path, code]), [
      ["src/game.js", "GUARD-DEVPLAN-LIFECYCLE"],
      ["package.json", "GUARD-DEVPLAN-LIFECYCLE"],
    ]);

    const ordinary = evaluateStagedDevPlanPaths({ projectDir: root, stagedPaths: ["docs/notes.md", "scratch/generated.json"] });
    assert.deepEqual(ordinary, { ok: true, code: "PIPELINE-STAGED-LIFECYCLE-ALLOW", findings: [] });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("staged lifecycle policy adds no independent approval gate after the existing policy allows a source commit", () => {
  const root = lifecycleFixture();
  try {
    const seen = [];
    const result = evaluateStagedDevPlanPaths({
      projectDir: root,
      stagedPaths: ["src/game.js"],
      devPlanGateVerdictFn(input) { seen.push(input); return { verdict: "allow" }; },
    });
    assert.deepEqual(result, { ok: true, code: "PIPELINE-STAGED-LIFECYCLE-ALLOW", findings: [] });
    assert.deepEqual(seen, [{ filePath: "src/game.js", projectDir: root }]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("staged lifecycle policy independently refuses disabling hooks and fails closed on incomplete observations", () => {
  const root = lifecycleFixture();
  try {
    const disabled = evaluateStagedDevPlanPaths({
      projectDir: root,
      stagedPaths: [".claude/settings.json"],
      stagedContentByPath: { ".claude/settings.json": '{"disableAllHooks":true}\n' },
      baselineContentByPath: { ".claude/settings.json": null },
    });
    assert.equal(disabled.ok, false);
    assert.equal(disabled.code, "PIPELINE-STAGED-LIFECYCLE-BLOCKED");
    assert.equal(disabled.findings[0].code, "PIPELINE-HOOKS-DISABLE-FORBIDDEN");

    const enabled = evaluateStagedDevPlanPaths({
      projectDir: root,
      stagedPaths: [".claude/settings.json"],
      stagedContentByPath: { ".claude/settings.json": '{"disableAllHooks":false}\n' },
      baselineContentByPath: { ".claude/settings.json": null },
    });
    assert.deepEqual(enabled, { ok: true, code: "PIPELINE-STAGED-LIFECYCLE-ALLOW", findings: [] });

    for (const invalid of [
      evaluateStagedDevPlanPaths({ projectDir: root, stagedPaths: ["../outside.js"] }),
      evaluateStagedDevPlanPaths({ projectDir: root, stagedPaths: [".claude/settings.json"] }),
      evaluateStagedDevPlanPaths({ projectDir: root, stagedPaths: ["src/game.js"], devPlanGateVerdictFn() { throw new Error("unavailable"); } }),
    ]) {
      assert.equal(invalid.ok, false);
      assert.equal(invalid.code, "PIPELINE-STAGED-LIFECYCLE-UNAVAILABLE");
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("staged settings preserve hook authority while allowing unrelated settings and detect deletion", () => {
  const root = lifecycleFixture();
  const path = ".claude/settings.local.json";
  const baseline = JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Write", hooks: [{ command: "node guard.mjs" }] }] }, permissions: { allow: [] } });
  try {
    const unrelatedChange = evaluateStagedDevPlanPaths({
      projectDir: root,
      stagedPaths: [path],
      baselineContentByPath: { [path]: baseline },
      stagedContentByPath: { [path]: JSON.stringify({ hooks: JSON.parse(baseline).hooks, permissions: { allow: ["Bash"] } }) },
    });
    assert.equal(unrelatedChange.ok, true);

    const replaced = evaluateStagedDevPlanPaths({
      projectDir: root,
      stagedPaths: [path],
      baselineContentByPath: { [path]: baseline },
      stagedContentByPath: { [path]: JSON.stringify({ permissions: { allow: [] } }) },
    });
    assert.equal(replaced.ok, false);
    assert.equal(replaced.findings[0].code, "PIPELINE-HOOKS-SETTINGS-CHANGE-FORBIDDEN");

    const deleted = evaluateStagedDevPlanPaths({
      projectDir: root,
      stagedPaths: [path],
      baselineContentByPath: { [path]: baseline },
      stagedContentByPath: { [path]: null },
    });
    assert.equal(deleted.ok, false);
    assert.equal(deleted.findings[0].code, "PIPELINE-HOOKS-SETTINGS-CHANGE-FORBIDDEN");

    const firstPermissions = evaluateStagedDevPlanPaths({
      projectDir: root,
      stagedPaths: [path],
      baselineContentByPath: { [path]: null },
      stagedContentByPath: { [path]: JSON.stringify({ permissions: { allow: ["Bash"] } }) },
    });
    assert.equal(firstPermissions.ok, true, "a first settings file with no hook authority is not a new gate");

    const firstHooks = evaluateStagedDevPlanPaths({
      projectDir: root,
      stagedPaths: [path],
      baselineContentByPath: { [path]: null },
      stagedContentByPath: { [path]: JSON.stringify({ hooks: { PreToolUse: ["unverified hook"] } }) },
    });
    assert.equal(firstHooks.ok, false);
    assert.equal(firstHooks.findings[0].code, "PIPELINE-HOOKS-SETTINGS-CHANGE-FORBIDDEN");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
