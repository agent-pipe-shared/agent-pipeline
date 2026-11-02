// Held-patch check for w112: the observed Critic preflight prints the producer's refusal bytes. It does not run git apply: the patch is a delta on the applied candidate 18 tree.
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PATCH = join(HERE, "w112-fv-the-observed-critic-preflight-prints-the-producer-refusal-bytes.patch");
const ALLOWED = [
  "plugins/pipeline-core/scripts/critic-dispatch-preflight.mjs",
  "plugins/pipeline-core/scripts/observe-critic-preflight.mjs",
];

test("w112: the patch exists and is non-empty", () => {
  assert.ok(existsSync(PATCH), "patch file is missing");
  assert.ok(statSync(PATCH).size > 0, "patch file is empty");
});

test("w112: the patch touches only the producer and the observed controller", () => {
  const text = readFileSync(PATCH, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0, "patch has no diff header");
  for (const file of files) assert.ok(ALLOWED.includes(file), `patch touches an unexpected file: ${file}`);
});

test("w112: one shared refusal-line builder is exported and used by the observed controller", () => {
  const text = readFileSync(PATCH, "utf8");
  assert.match(text, /^\+export function criticDispatchPreflightRefusalLine\(/mu);
  assert.match(text, /^\+\s*return criticDispatchPreflightRefusalLine\(error\);$/mu);
});
