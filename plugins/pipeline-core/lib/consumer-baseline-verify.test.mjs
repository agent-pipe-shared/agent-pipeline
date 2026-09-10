#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { inspectConsumerBaseline } from "./consumer-baseline-verify.mjs";

const files = new Map([
  ["README.md", "# Fine\n"],
  ["data.json", "{\"ok\":true}\n"],
]);
const deps = {
  git: () => [...files.keys()].join("\0") + "\0",
  readFile: (path) => files.get(path.split("/").at(-1)),
  spawn: () => ({ status: 0, error: null }),
};
let result = inspectConsumerBaseline("/tmp/example", deps);
assert.equal(result.status, "passed");
assert.deepEqual(result.inventory, { trackedFiles: 2, textFiles: 2, jsonFiles: 1 });

files.set("data.json", "{");
result = inspectConsumerBaseline("/tmp/example", deps);
assert.equal(result.status, "failed");
assert.deepEqual(result.findings, [{ code: "invalid-json", path: "data.json" }]);

files.set("README.md", "<<<<<<< ours\n=======\n>>>>>>> theirs\n");
result = inspectConsumerBaseline("/tmp/example", deps);
assert.equal(result.findings.some((finding) => finding.code === "merge-conflict-marker"), true);

console.log("consumer-baseline-verify: 5 tests passed");
