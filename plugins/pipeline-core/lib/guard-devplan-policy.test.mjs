// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { completedFeaturePackageEditDenial, devPlanGateVerdict, evaluateStagedDevPlanPaths, isCriticScratchNotesPath } from "./guard-devplan-policy.mjs";

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

test("C21F: a feature package at verifying or completed refuses a hand edit and names the one-shot route; earlier states and other files stay with the gate", () => {
  const root = mkdtempSync(join(tmpdir(), "package-hand-edit-"));
  try {
    mkdirSync(join(root, "specs", "feature-abc"), { recursive: true });
    const manifest = join(root, "specs", "feature-abc", "lifecycle.json");
    for (const state of ["verifying", "completed"]) {
      writeFileSync(manifest, JSON.stringify({ state }));
      for (const filePath of ["specs/feature-abc/lifecycle.json", manifest, "specs\\feature-abc\\lifecycle.json"]) {
        const result = devPlanGateVerdict({ filePath, projectDir: root });
        assert.equal(result.verdict, "block", `${state} ${filePath}`);
        assert.match(result.reason, /GUARD-FEATURE-PACKAGE-HAND-EDIT/u);
        assert.match(result.reason, /--one-shot/u);
      }
    }
    for (const state of ["draft", "approved", "implementing"]) {
      writeFileSync(manifest, JSON.stringify({ state }));
      assert.equal(completedFeaturePackageEditDenial("specs/feature-abc/lifecycle.json", root), null, state);
    }
    writeFileSync(manifest, "not json");
    assert.equal(completedFeaturePackageEditDenial("specs/feature-abc/lifecycle.json", root), null, "unreadable stays with the gate");
    writeFileSync(manifest, JSON.stringify({ state: "completed" }));
    assert.equal(completedFeaturePackageEditDenial("specs/feature-abc/spec.md", root), null);
    assert.equal(completedFeaturePackageEditDenial("specs/feature-abc/nested/lifecycle.json", root), null);
    // The commit boundary: the writer's own output at completed is committable, the edit lanes keep the refusal.
    assert.equal(devPlanGateVerdict({ filePath: "specs/feature-abc/lifecycle.json", projectDir: root, stagedCommit: true }).verdict, "allow");
    assert.deepEqual(evaluateStagedDevPlanPaths({ projectDir: root, stagedPaths: ["specs/feature-abc/lifecycle.json"] }), { ok: true, code: "PIPELINE-STAGED-LIFECYCLE-ALLOW", findings: [] });
    assert.equal(devPlanGateVerdict({ filePath: "specs/feature-abc/lifecycle.json", projectDir: root }).verdict, "block");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

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

test("the generated Codex projection is committable in a draft lifecycle, and no other path under .codex is", () => {
  const root = lifecycleFixture();
  try {
    const generated = [".codex/config.toml", ".codex/agents/implementor.toml", ".codex/agents/critic.toml", ".codex/agents/consult-advisor.toml"];
    assert.deepEqual(evaluateStagedDevPlanPaths({ projectDir: root, stagedPaths: generated }), { ok: true, code: "PIPELINE-STAGED-LIFECYCLE-ALLOW", findings: [] });
    for (const path of [".codex/agents/other.toml", ".codex/hooks.mjs", "sub/.codex/config.toml"]) {
      const result = evaluateStagedDevPlanPaths({ projectDir: root, stagedPaths: [path] });
      assert.equal(result.code, "PIPELINE-STAGED-LIFECYCLE-BLOCKED", path);
    }
    assert.equal(devPlanGateVerdict({ filePath: ".codex/config.toml", projectDir: root }).verdict, "block", "the write lane stays closed");
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
    assert.deepEqual(seen, [{ filePath: "src/game.js", projectDir: root, stagedCommit: true }]);
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
