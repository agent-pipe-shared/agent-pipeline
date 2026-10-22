// SPDX-License-Identifier: SUL-1.0
// Purpose: run named test files one after the other inside a directory with a PRIVATE TMPDIR outside every git repository.
// Usage:   node scripts/run-in.mjs <dir> <label> <test-file>...     (<dir> is "." for the main checkout; test paths are relative to <dir>)
// Inputs:  the test files; the sibling helper scripts/run-quiet.mjs of the repository that holds THIS script (it does the
//          private-TMPDIR run and the count summary).
// Output:  counts and failing case names only (printed by run-quiet.mjs); exit code of the run.
// Data:    none persisted here (run-quiet keeps its private TMPDIRs under <home>/pipeline-test-tmp/<label>).
//          Read-only toward tracked files (the tests themselves may write under their own temp dirs).
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const [dir, label, ...files] = process.argv.slice(2);
if (!dir || !label || files.length === 0) { console.error("usage: run-in.mjs <dir> <label> <test-file>..."); process.exit(2); }
const runQuiet = join(dirname(fileURLToPath(import.meta.url)), "run-quiet.mjs");
const r = spawnSync(process.execPath, [runQuiet, label, ...files], { cwd: resolve(dir), stdio: "inherit" });
process.exit(r.status ?? 1);
