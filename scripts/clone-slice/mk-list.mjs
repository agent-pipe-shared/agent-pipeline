// SPDX-License-Identifier: SUL-1.0
// Purpose: the repo-wide test list of a clone for the pass after a rehearsal: every tracked harness/scripts/check-*.test.mjs and plugins/pipeline-core/lib/pins/*.test.mjs (feed it to run-list.mjs together with the changed suites as extra arguments).
// Usage:   node scratch/agent-out/mk-list.mjs <clone> <out-list>   (copy from scripts/clone-slice/ first)
// Data:    read-only toward the clone; writes <out-list>.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const [clone, out] = process.argv.slice(2);
const tracked = execFileSync("git", ["-C", clone, "ls-files", "*.test.mjs"], { encoding: "utf8", maxBuffer: 64 << 20 }).split("\n").filter(Boolean);
const picked = tracked.filter((p) => /^harness\/scripts\/check-[^/]*\.test\.mjs$/u.test(p) || /^plugins\/pipeline-core\/lib\/pins\/[^/]*\.test\.mjs$/u.test(p));
writeFileSync(out, `${picked.join("\n")}\n`);
console.log(`written ${picked.length}`);
