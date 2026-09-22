import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
