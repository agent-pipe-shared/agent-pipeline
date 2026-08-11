// SPDX-License-Identifier: SUL-1.0
// NVA-A8-RUNNER "feature" workload: fixed assertions against a fixed pure function, no I/O
// beyond writing result.txt. Deterministic by construction.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { clampToRange } from "./lib.mjs";

const dir = dirname(fileURLToPath(import.meta.url));
assert.equal(clampToRange(5, 0, 10), 5);
assert.equal(clampToRange(-5, 0, 10), 0);
assert.equal(clampToRange(15, 0, 10), 10);
writeFileSync(join(dir, "result.txt"), "feature:ok");
