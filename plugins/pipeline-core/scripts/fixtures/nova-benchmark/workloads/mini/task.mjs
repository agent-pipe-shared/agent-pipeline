// SPDX-License-Identifier: SUL-1.0
// NVA-A8-RUNNER "mini" workload: fixed pure expression, no I/O beyond writing result.txt.
// Deterministic by construction -- no Math.random, no Date.now, no network, no stdin.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const result = { sum: 2 + 2, product: 6 * 7 };
writeFileSync(join(dir, "result.txt"), JSON.stringify(result));
