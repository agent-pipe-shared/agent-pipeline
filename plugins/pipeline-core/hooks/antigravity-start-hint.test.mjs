import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = fileURLToPath(new URL("./antigravity-start-hint.mjs", import.meta.url));

test("antigravity-start-hint: relative workspace paths fail-closed", () => {
  const input = { invocationNum: 1, workspacePaths: ["."] };
  const res = spawnSync("node", [HOOK], { input: JSON.stringify(input), encoding: "utf8" });
  assert.equal(res.status, 0);
  assert.match(res.stderr, /AGY-REPOSITORY-CONTEXT-UNAVAILABLE/);
});

test("antigravity-start-hint: missing workspace paths fail-closed", () => {
  const input = { invocationNum: 1 };
  const res = spawnSync("node", [HOOK], { input: JSON.stringify(input), encoding: "utf8" });
  assert.equal(res.status, 0);
  assert.match(res.stderr, /AGY-REPOSITORY-CONTEXT-UNAVAILABLE/);
});

test("antigravity-start-hint: absolute ungoverned workspace remains an onboarding hint without creating Git", () => {
  const root = mkdtempSync(join(tmpdir(), "agy-start-hint-"));
  try {
    const input = { invocationNum: 1, workspacePaths: [root], conversationId: "fixture" };
    const res = spawnSync("node", [HOOK], { input: JSON.stringify(input), encoding: "utf8" });
    assert.equal(res.status, 0, res.stderr);
    const output = JSON.parse(res.stdout);
    assert.equal(typeof output.injectSteps?.[0]?.ephemeralMessage, "string");
    assert.match(output.injectSteps[0].ephemeralMessage, /pipeline-start|Pipeline/u);
    assert.equal(existsSync(join(root, ".git")), false, "an onboarding hint must not manufacture a Git control directory");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
