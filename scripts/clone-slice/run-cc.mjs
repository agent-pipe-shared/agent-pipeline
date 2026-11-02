// Purpose: run ONE suite the way the Full Verify does for case completion (plain `node <file>` with descriptor 3 a file), then validate the emitted stream
// against the EFFECTIVE policy (the augmentation row when one exists, else the inline policy of harness/scripts/verify.mjs) with the clone's own parser,
// and print the parser's verdict plus the id difference. Why: run alone with `node --test` no descriptor is announced and nothing is checked, so a suite that
// declares more case ids than its policy lists looks green alone and is rejected in the Full Verify (VERIFY-CASE-COMPLETION-DECLARATION; candidate 18, w114).
// Usage: node scripts/clone-slice/run-cc.mjs <clone-dir> <suite name> <test file>
// Writes: <clone-dir>/scratch/cc-<suite>.out (the raw descriptor 3 stream). Run it for every suite a candidate grew, one at a time.
import { spawnSync } from "node:child_process";
import { openSync, readFileSync, realpathSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [cloneArg, suite, file] = process.argv.slice(2);
if (!cloneArg || !suite || !file) {
  console.error("usage: node scripts/clone-slice/run-cc.mjs <clone-dir> <suite name> <test file>");
  process.exit(2);
}
const clone = resolve(cloneArg);
const source = readFileSync(join(clone, "harness/scripts/verify.mjs"), "utf8");
const at = source.indexOf(`name: "${suite}"`);
const slice = at < 0 ? "" : source.slice(at, source.indexOf("\n", at));
let inline = [...(slice.match(/caseIds:\s*\[([^\]]*)\]/u)?.[1] ?? "").matchAll(/"([^"]+)"/gu)].map((m) => m[1]);
const generated = slice.match(/Array\.from\(\{\s*length:\s*(\d+)\s*\}[^`]*`([A-Za-z]+)\$\{String\(index \+ 1\)\.padStart\((\d)/u);
if (generated) inline = Array.from({ length: Number(generated[1]) }, (_, i) => `${generated[2]}${String(i + 1).padStart(Number(generated[3]), "0")}`);
const aug = JSON.parse(readFileSync(join(clone, "harness/config/verify-case-completion-augmentations.v1.json"), "utf8")).augmentations.find((row) => row.name === suite);
const policy = aug ? aug.caseCompletion : { schema: "pipeline.verify-case-completion-policy.v1", caseIds: inline, maxBytes: 65536 };
const nodeBinary = realpathSync(process.execPath);
const env = { ...process.env, PATH: `${dirname(nodeBinary)}${delimiter}${process.env.PATH ?? ""}`, PIPELINE_VERIFY_CASE_COMPLETION_FD: "3", PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES: String(policy.maxBytes) };
delete env.NODE_TEST_CONTEXT;
const ccPath = join(clone, "scratch", `cc-${suite}.out`);
const ccFd = openSync(ccPath, "w+");
const r = spawnSync(nodeBinary, [file], { cwd: clone, env, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe", ccFd] });
const bytes = readFileSync(ccPath);
const { parseVerifyCaseCompletion } = await import(pathToFileURL(join(clone, "plugins/pipeline-core/lib/verify-case-completion-receipt.mjs")).href);
let verdict = "accepted";
try { parseVerifyCaseCompletion(bytes, policy); } catch (error) { verdict = `REJECTED: ${error.message}`; }
const emitted = [...new Set([...bytes.toString("utf8").matchAll(/"([A-Z]{2,6}\d{2,3})"/gu)].map((m) => m[1]))];
const short = (ids) => (ids.length > 10 ? `${ids.slice(0, 10).join(",")}… (${ids.length})` : ids.join(",") || "none");
console.log(`${suite}: exit ${r.status}; policy ${aug ? "augmentation" : "inline"} ${policy.caseIds.length} ids; emitted ${emitted.length}; ${verdict}; unregistered: ${short(emitted.filter((id) => !policy.caseIds.includes(id)))}; missing: ${short(policy.caseIds.filter((id) => !emitted.includes(id)))}`);
