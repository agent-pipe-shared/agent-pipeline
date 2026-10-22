// SPDX-License-Identifier: SUL-1.0
// Purpose: stamp the three runner manifests of plugins/pipeline-core with a candidate version.
// Usage:   node scripts/stamp-candidate.mjs [--dry-run]     (run from the repository root)
// Inputs:  the clean, committed checkout (HEAD identity) and the three manifests
//          plugins/pipeline-core/.codex-plugin/plugin.json, .claude-plugin/plugin.json and plugin.json.
// Output:  JSON plan or result on stdout. Version format: <BASE_VERSION>+<runner>.<UTC yyyymmddhhmmss>.<7-char HEAD>.
// Data:    none besides the manifests. NOT read-only unless --dry-run: it rewrites the three manifests.
// Notes:   refuses any dirty or staged checkout; validates every manifest before the first write;
//          never installs (installation is the operator's marketplace procedure). The stamp commit
//          carries a Checkpoint-Intent trailer.
// Stamps source manifests only. Installation remains the operator's established
// GitHub-marketplace procedure. A stamp is a post-freeze operation: it refuses
// any dirty or staged checkout, derives its suffix from the frozen HEAD, and
// writes all runner manifests in one consistent format.
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// The semantic base every manifest must currently carry; change it when the candidate line moves on.
const BASE_VERSION = "0.7.0";
const USAGE = "usage: node scripts/stamp-candidate.mjs [--dry-run]";

const root = process.cwd();
const pluginPath = "plugins/pipeline-core";
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const unknown = args.filter(arg => arg !== "--dry-run");
if (unknown.length > 0) throw new Error(USAGE);

const MANIFESTS = Object.freeze({
  codex: { path: `${pluginPath}/.codex-plugin/plugin.json`, name: "pipeline-core" },
  claude: { path: `${pluginPath}/.claude-plugin/plugin.json`, name: "pipeline-core" },
  antigravity: { path: `${pluginPath}/plugin.json`, name: "agent-pipeline-core" },
});

function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
  return result.stdout.trim();
}

function readManifest({ path, name }, runner) {
  const value = JSON.parse(readFileSync(path, "utf8"));
  if (value.name !== name) throw new Error(`unexpected ${runner} manifest name`);
  const base = /^([0-9]+\.[0-9]+\.[0-9]+)(?:\+.*)?$/u.exec(value.version ?? "")?.[1];
  if (base !== BASE_VERSION) throw new Error(`unexpected ${runner} base version`);
  return { value, base };
}

const status = git(["status", "--porcelain"]);
if (status !== "") throw new Error("refusing to stamp a non-frozen checkout: commit or stash every tracked change first");
const shortCommit = git(["rev-parse", "--short=7", "HEAD"]);
if (!/^[a-f0-9]{7}$/u.test(shortCommit)) throw new Error("cannot derive a seven-character lowercase HEAD identity");
const timestamp = new Date().toISOString().replace(/[-:TZ.]/gu, "").slice(0, 14);
const candidateIdentity = `${timestamp}.${shortCommit}`;

// Validate every manifest before the first write. A malformed later runner
// must never leave Codex or Claude stamped to a different candidate.
const prepared = Object.entries(MANIFESTS).map(([runner, definition]) => {
  const { value, base } = readManifest(definition, runner);
  value.version = `${base}+${runner}.${candidateIdentity}`;
  return { runner, definition, value };
});
const stamped = {};
for (const { runner, definition, value } of prepared) {
  stamped[runner] = { name: value.name, version: value.version, path: definition.path };
  if (!dryRun) {
    const temporary = `${definition.path}.stamp-${process.pid}`;
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    renameSync(temporary, definition.path);
  }
}

console.log(JSON.stringify({
  status: dryRun ? "stamp-plan-all-runners" : "stamped-all-runners",
  timestamp,
  commit: shortCommit,
  candidateIdentity,
  manifests: stamped,
  installation: "not-performed",
}, null, 2));
