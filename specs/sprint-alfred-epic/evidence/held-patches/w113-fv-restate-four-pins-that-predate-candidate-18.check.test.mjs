// Held-patch check for w113: four pins that predate candidate 18. It does not run git apply: the patch is a delta on the applied candidate 18 tree.
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PATCH = join(HERE, "w113-fv-restate-four-pins-that-predate-candidate-18.patch");
const ALLOWED = [
  "harness/scripts/pipeline-state.test.mjs",
  "plugins/pipeline-core/scripts/pipeline-start-preflight-antigravity-hard-enforcement.test.mjs",
  "plugins/pipeline-core/scripts/check-backlog-state.test.mjs",
  "plugins/pipeline-core/lib/pins/orphan-descriptor-recovery-never-offers-the-running-session.test.mjs",
];

test("w113: the patch exists and is non-empty", () => {
  assert.ok(existsSync(PATCH), "patch file is missing");
  assert.ok(statSync(PATCH).size > 0, "patch file is empty");
});

test("w113: the patch touches only the four test files", () => {
  const text = readFileSync(PATCH, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0, "patch has no diff header");
  for (const file of files) assert.ok(ALLOWED.includes(file), `patch touches an unexpected file: ${file}`);
  for (const allowed of ALLOWED) assert.ok(files.includes(allowed), `patch misses ${allowed}`);
});

test("w113: the protected Critic preimage pin is not touched", () => {
  const text = readFileSync(PATCH, "utf8");
  assert.doesNotMatch(text, /codex-isolated-critic-protected-preimage/u);
});
