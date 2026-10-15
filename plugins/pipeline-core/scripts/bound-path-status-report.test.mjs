// SPDX-License-Identifier: SUL-1.0
//
// Tests for the warn-only bound-path close report. Fixtures are throwaway git
// repositories under the repository's scratch/.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..");
const CLI = join(HERE, "bound-path-status-report.mjs");
const TRACKED = "specs/f/evidence/design-workflow/pkg.json";
const IGNORED = "evidence/design-course/f/pkg.json";
const UNTRACKED = "specs/f/evidence/design-workflow/new.json";

const git = (cwd, ...args) => execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
function put(root, rel, text) {
  const target = join(root, ...rel.split("/"));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
}
function makeRepo(t) {
  mkdirSync(join(REPO, "scratch"), { recursive: true });
  const root = mkdtempSync(join(REPO, "scratch", "bound-path-report-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, "init", "-q");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.invalid");
  put(root, ".gitignore", "/evidence/\n/scratch/\n");
  put(root, TRACKED, "{}\n");
  git(root, "add", "--", ".gitignore", TRACKED);
  git(root, "commit", "-q", "-m", "fixture");
  return root;
}
const stateFor = (path) => ({ planPresentation: { designWorkflowPackagePath: path }, planApproval: { designWorkflowPackagePath: path } });
function run(root, state) {
  put(root, "project/state.json", JSON.stringify(state));
  const before = git(root, "status", "--porcelain");
  const r = spawnSync(process.execPath, [CLI, "--root", root, "--state", "project/state.json"], { encoding: "utf8" });
  assert.equal(git(root, "status", "--porcelain"), before, "report must not write");
  const lines = r.stdout.trimEnd().split("\n");
  return { status: r.status, stdout: r.stdout, json: JSON.parse(lines.at(-1)), stderr: r.stderr };
}

test("tracked clean bound path reports ok and exits 0", (t) => {
  const root = makeRepo(t);
  const r = run(root, stateFor(TRACKED));
  assert.equal(r.status, 0);
  assert.equal(r.json.ok, true);
  assert.match(r.stdout, new RegExp(`${TRACKED.replaceAll(".", "\\.")} -- tracked`, "u"));
});

test("ignored bound path is flagged DWP-BOUND-PATH-IGNORED and still exits 0", (t) => {
  const root = makeRepo(t);
  put(root, IGNORED, "{}\n");
  const r = run(root, stateFor(IGNORED));
  assert.equal(r.status, 0);
  assert.equal(r.json.ok, false);
  assert.deepEqual(r.json.failures, [{ code: "DWP-BOUND-PATH-IGNORED", path: IGNORED }]);
  assert.match(r.stdout, /FAIL DWP-BOUND-PATH-IGNORED/u);
});

test("untracked bound path is flagged DWP-BOUND-PATH-UNTRACKED and still exits 0", (t) => {
  const root = makeRepo(t);
  put(root, UNTRACKED, "{}\n");
  const r = run(root, stateFor(UNTRACKED));
  assert.equal(r.status, 0);
  assert.deepEqual(r.json.failures, [{ code: "DWP-BOUND-PATH-UNTRACKED", path: UNTRACKED }]);
});

test("missing arguments or unreadable state never fail the close", (t) => {
  const bad = spawnSync(process.execPath, [CLI], { encoding: "utf8" });
  assert.equal(bad.status, 0);
  const root = makeRepo(t);
  put(root, "project/pipeline-state.json", "not json");
  const r = spawnSync(process.execPath, [CLI, "--root", root], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout.trim().split("\n").at(-1)).ok, false);
});
