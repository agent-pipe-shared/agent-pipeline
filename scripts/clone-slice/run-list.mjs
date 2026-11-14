// SPDX-License-Identifier: SUL-1.0
// Purpose: run scripts/run-parallel.mjs of a clone over the test paths listed in a file (one per line, # comments skipped). run-parallel needs a clean committed clone.
// Usage:   node scratch/agent-out/c29/run-list.mjs <workers> <label> <clone> <list-file> [<extra-test>...]   (copy from scripts/clone-slice/ first)
// Data:    none itself; run-parallel writes its own clones and logs.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
const [workers, label, clone, list, ...extra] = process.argv.slice(2);
const files = [...new Set([...readFileSync(list, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")), ...extra])];
const result = spawnSync(process.execPath, [`${clone}/scripts/run-parallel.mjs`, workers, label, "--src", clone, ...files], { stdio: "inherit" });
process.exit(result.status ?? 1);
