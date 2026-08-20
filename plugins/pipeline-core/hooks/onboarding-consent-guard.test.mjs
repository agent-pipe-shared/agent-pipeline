#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { evaluateLifecycleReadyGuard } from "./guard-lifecycle-ready.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "onboarding-consent-guard-"));
  mkdirSync(join(root, ".claude"));
  return root;
}

test("blocks ungoverned Edit, Write, and NotebookEdit until the session marker exists", () => {
  for (const [toolName, field] of [["Edit", "file_path"], ["Write", "file_path"], ["NotebookEdit", "notebook_path"]]) {
    const root = fixture();
    try {
      const input = { tool_name: toolName, session_id: "s1", tool_input: { [field]: "src/app.js" } };
      const blocked = evaluateLifecycleReadyGuard(input, { projectDir: root });
      assert.equal(blocked.exitCode, 2, toolName);
      assert.match(blocked.stderr, /GUARD-ONBOARDING-CONSENT-REQUIRED/u, toolName);
      assert.match(blocked.stderr, /onboarding-consent-mark\.mjs.*record/u, toolName);
      assert.match(blocked.stderr, /retry the identical write action/u, toolName);

      writeFileSync(join(root, ".claude", ".pipeline-install-consent-s1.json"), "{}\n");
      assert.deepEqual(evaluateLifecycleReadyGuard(input, { projectDir: root }), { exitCode: 0, stderr: "" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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
