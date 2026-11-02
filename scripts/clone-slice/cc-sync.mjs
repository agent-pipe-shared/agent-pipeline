// Purpose: bring the case-completion policy of the given suites in line with what the suites DECLARE when run the Full Verify way (plain `node <file>`,
// descriptor 3 = a file). Where the policy lives decides what is edited: an augmentation row (in place; its previousPolicySha256 stays), else a NEW augmentation
// row bound to the sha256 of the source policy (harness/verify-suites.json row or the inline policy of harness/scripts/verify.mjs). A source policy is never
// edited. Only a strict extension of the existing case ids is written; anything else is reported and left alone (candidate 18, w114).
// Usage: node scripts/clone-slice/cc-sync.mjs <clone-dir> <suite>=<test file> ...
// Env: CC_RESET=1 first restores the two policy files from git in the clone; CC_REUSE=1 reads the descriptor 3 file a previous run left in
//      <clone-dir>/scratch/cc-<suite>.out instead of running the suite (only valid if that run finished; a truncated file gives a wrong policy).
// Writes: harness/verify-suites.json (rewritten unchanged) and harness/config/verify-case-completion-augmentations.v1.json in the clone, plus the .out files.
import { spawnSync } from "node:child_process";
import { openSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [cloneArg, ...pairs] = process.argv.slice(2);
if (!cloneArg || pairs.length === 0) {
  console.error("usage: node scripts/clone-slice/cc-sync.mjs <clone-dir> <suite>=<test file> ...");
  process.exit(2);
}
const clone = resolve(cloneArg);
const suitesPath = join(clone, "harness/verify-suites.json");
const augPath = join(clone, "harness/config/verify-case-completion-augmentations.v1.json");
if (process.env.CC_RESET === "1") spawnSync("git", ["-C", clone, "checkout", "--", "harness/verify-suites.json", "harness/config/verify-case-completion-augmentations.v1.json"], { stdio: "inherit" });
const readJson = (p) => { const text = readFileSync(p, "utf8"); const value = JSON.parse(text); if (`${JSON.stringify(value, null, 2)}\n` !== text) throw new Error(`format drift: ${p}`); return value; };
const suites = readJson(suitesPath);
const aug = readJson(augPath);
const source = readFileSync(join(clone, "harness/scripts/verify.mjs"), "utf8");
const { verifyCaseCompletionPolicySha256 } = await import(pathToFileURL(join(clone, "plugins/pipeline-core/lib/verify-case-completion-receipt.mjs")).href);
const nodeBinary = realpathSync(process.execPath);
function inlinePolicy(name) {
  const at = source.indexOf(`name: "${name}"`);
  if (at < 0) return null;
  const slice = source.slice(at, source.indexOf("\n", at));
  if (!slice.includes("caseCompletion")) return null;
  let ids = [...(slice.match(/caseIds:\s*\[([^\]]*)\]/u)?.[1] ?? "").matchAll(/"([^"]+)"/gu)].map((m) => m[1]);
  const g = slice.match(/Array\.from\(\{\s*length:\s*(\d+)\s*\}[^`]*`([A-Za-z]+)\$\{String\(index \+ 1\)\.padStart\((\d)/u);
  if (g) ids = Array.from({ length: Number(g[1]) }, (_, i) => `${g[2]}${String(i + 1).padStart(Number(g[3]), "0")}`);
  return { schema: "pipeline.verify-case-completion-policy.v1", caseIds: ids, maxBytes: Number(slice.match(/maxBytes:\s*([\d_]+)/u)?.[1]?.replaceAll("_", "") ?? 65536) };
}
const isExtension = (prev, next) => { if (next.length <= prev.length) return false; let j = 0; for (const id of prev) { while (j < next.length && next[j] !== id) j++; if (j === next.length) return false; j++; } return true; };
for (const pair of pairs) {
  const [name, file] = pair.split("=");
  const suiteRow = (suites.suites ?? []).find((s) => s.name === name);
  const augRow = aug.augmentations.find((s) => s.name === name);
  const inline = inlinePolicy(name);
  // Precedent: a source policy (verify-suites.json or inline) is never edited; the extension is an augmentation row bound to the sha256 of that source policy.
  const source0 = suiteRow?.caseCompletion ?? inline;
  const where = augRow ? "augmentation row" : suiteRow?.caseCompletion ? "verify-suites.json source + new augmentation" : inline ? "inline source + new augmentation" : "none";
  const current = augRow?.caseCompletion ?? source0;
  const ccPath = join(clone, "scratch", `cc-${name}.out`);
  const fd = process.env.CC_REUSE === "1" ? -1 : openSync(ccPath, "w+");
  const env = { ...process.env, PATH: `${dirname(nodeBinary)}${delimiter}${process.env.PATH ?? ""}`, PIPELINE_VERIFY_CASE_COMPLETION_FD: "3", PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES: String(current?.maxBytes ?? 65536) };
  delete env.NODE_TEST_CONTEXT;
  const started = Date.now();
  const run = process.env.CC_REUSE === "1" ? { status: 0 } : spawnSync(nodeBinary, [file], { cwd: clone, env, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe", fd] });
  const declared = readFileSync(ccPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((e) => e.event === "DECLARED")?.caseIds;
  const secs = Math.round((Date.now() - started) / 1000);
  if (run.status !== 0 || !Array.isArray(declared)) { console.log(`${name}: SKIPPED (exit ${run.status}, declared ${Array.isArray(declared) ? declared.length : "none"}, ${secs}s)`); continue; }
  if (current && JSON.stringify(current.caseIds) === JSON.stringify(declared)) { console.log(`${name}: already in line (${declared.length} ids, ${where}, ${secs}s)`); continue; }
  if (current && !isExtension(current.caseIds, declared)) { console.log(`${name}: NOT AN EXTENSION (policy ${current.caseIds.length}, declared ${declared.length}); left alone`); continue; }
  const next = { schema: "pipeline.verify-case-completion-policy.v1", caseIds: declared, maxBytes: current?.maxBytes ?? 65536 };
  if (augRow) augRow.caseCompletion = next;
  else if (source0) aug.augmentations.push({ name, file, caseCompletion: next, previousPolicySha256: verifyCaseCompletionPolicySha256(source0) });
  else { console.log(`${name}: no policy anywhere; left alone`); continue; }
  console.log(`${name}: ${current?.caseIds.length ?? 0} -> ${declared.length} ids (${where}, ${secs}s)`);
}
writeFileSync(suitesPath, `${JSON.stringify(suites, null, 2)}\n`);
writeFileSync(augPath, `${JSON.stringify(aug, null, 2)}\n`);
