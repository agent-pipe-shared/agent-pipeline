// SPDX-License-Identifier: SUL-1.0
// NVA-A8-RUNNER "migration" workload: one fixed deterministic transform (uppercase every
// string value, sort object keys) applied to a fixed input.json, compared byte-for-byte to a
// fixed expected.json. Deterministic by construction -- the transform is designed to always
// match (a correctness-harness exercise, not a bug hunt).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(dir, "input.json"), "utf8"));
const expected = readFileSync(join(dir, "expected.json"), "utf8");

const sorted = {};
for (const key of Object.keys(input).sort()) {
  const value = input[key];
  sorted[key] = typeof value === "string" ? value.toUpperCase() : value;
}
const actual = `${JSON.stringify(sorted, null, 2)}\n`;

if (actual !== expected) {
  throw new Error("migration transform did not match expected.json byte-for-byte");
}
writeFileSync(join(dir, "result.txt"), "migration:match");
