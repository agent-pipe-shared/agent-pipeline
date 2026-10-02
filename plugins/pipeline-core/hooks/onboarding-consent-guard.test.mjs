#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { evaluateLifecycleReadyGuard } from "./guard-lifecycle-ready.mjs";
import { createGovernanceScopeController } from "../lib/governance-scope.mjs";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";

const cases = [];
function test(name, run) {
  const id = `ONCG${String(cases.length + 1).padStart(3, "0")}`;
  cases.push({ id, name, run: async (...args) => {
    try { return await run(...args); }
    catch (error) { process.stderr.write(`${id} ${name}: ${error?.stack ?? error}\n`); throw error; }
  } });
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "onboarding-consent-guard-"));
  mkdirSync(join(root, ".claude"));
  return root;
}

test("marker-only folder stays inactive before and after an empty session consent marker", () => {
  for (const [toolName, field] of [["Edit", "file_path"], ["Write", "file_path"], ["NotebookEdit", "notebook_path"]]) {
    const root = fixture();
    try {
      const input = { tool_name: toolName, session_id: "s1", tool_input: { [field]: "src/app.js" } };
      const scope = createGovernanceScopeController({ hostStateRoot: join(root, "host-state") });
      assert.equal(scope.observe({ rootDir: root }).state, "inactive", toolName);
      assert.deepEqual(evaluateLifecycleReadyGuard(input, { projectDir: root }), { exitCode: 0, stderr: "" });

      writeFileSync(join(root, ".claude", ".pipeline-install-consent-s1.json"), "{}\n");
      assert.equal(scope.observe({ rootDir: root }).state, "inactive", toolName);
      assert.deepEqual(evaluateLifecycleReadyGuard(input, { projectDir: root }), { exitCode: 0, stderr: "" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("active Git enrollment refuses missing readiness despite an empty consent marker", () => {
  const root = fixture();
  try {
    const env = { ...process.env };
    for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR"]) delete env[name];
    for (const args of [["init", "--quiet", "--template="], ["config", "user.name", "Fixture"],
      ["config", "user.email", "fixture@example.invalid"], ["commit", "--allow-empty", "-m", "fixture"]]) {
      const result = spawnSync("git", args, { cwd: root, env, encoding: "utf8", timeout: 5000, shell: false });
      assert.equal(result.status, 0, JSON.stringify({ args, stderr: result.stderr, error: result.error?.code }));
    }
    const controller = createGovernanceScopeController({ hostStateRoot: join(root, "host-state") });
    const plan = controller.planDecision({ rootDir: root, decision: "enroll", by: "Synthetic fixture" });
    const active = controller.applyDecision(plan, { activate: true, planSha256: plan.planSha256 });
    assert.equal(active.state, "active");

    const input = { tool_name: "Edit", session_id: "s1", tool_input: { file_path: "src/app.js" } };
    const blocked = evaluateLifecycleReadyGuard(input, { projectDir: root });
    assert.equal(blocked.exitCode, 2);
    assert.match(blocked.stderr, /GUARD-LIFECYCLE-NOT-READY/u);
    assert.doesNotMatch(blocked.stderr, /GUARD-ONBOARDING-CONSENT-REQUIRED/u);

    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(join(root, ".claude", ".pipeline-install-consent-s1.json"), "{}\n");
    assert.equal(controller.observe({ rootDir: root }).state, "active");
    const stillBlocked = evaluateLifecycleReadyGuard(input, { projectDir: root });
    assert.equal(stillBlocked.exitCode, 2);
    assert.match(stillBlocked.stderr, /GUARD-LIFECYCLE-NOT-READY/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("leaves Bash and missing-session writes fail-open in ungoverned folders", () => {
  const writeRoot = fixture();
  const bashRoot = fixture();
  try {
    assert.deepEqual(evaluateLifecycleReadyGuard({ tool_name: "Edit", tool_input: { file_path: "src/app.js" } }, {
      projectDir: writeRoot,
    }), { exitCode: 0, stderr: "" });
    assert.deepEqual(evaluateLifecycleReadyGuard({ tool_name: "Bash", tool_input: { command: "printf unchanged" } }, {
      projectDir: bashRoot,
    }), { exitCode: 0, stderr: "" });
  } finally {
    rmSync(writeRoot, { recursive: true, force: true });
    rmSync(bashRoot, { recursive: true, force: true });
  }
});

registerTestCaseCompletion({ cases, fd: 3, maxBytes: 8192 });
