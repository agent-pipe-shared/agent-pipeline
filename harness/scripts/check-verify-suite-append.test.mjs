// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkVerifySuiteAppend } from "./check-verify-suite-append.mjs";

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "verify-suite-append-history-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const registry = (suites) => JSON.stringify({ schema: "pipeline.verify-suites.v1", suites });
  const suite = (name) => ({ name, file: `${name}.test.mjs` });
  const writeRegistry = (names) => writeFileSync(join(root, "harness", "verify-suites.json"),
    registry(names.map(suite)));
  const writeConfig = (protectedTestPaths) => writeFileSync(join(root, "project", "guard-config.json"),
    JSON.stringify({ protectedTestPaths }));
  const tp13 = { id: "TP-13", pattern: "harness/verify-suites\\.json$" };
  const commit = (message) => { git("add", "."); git("-c", "user.name=Test", "-c",
    "user.email=test@example.invalid", "commit", "-m", message); };
  try {
    mkdirSync(join(root, "harness"));
    mkdirSync(join(root, "project"));
    git("init", "-q");
    writeRegistry(["a"]);
    writeConfig([]);
    commit("initial");
    return run({ root, git, writeRegistry, writeConfig, tp13, commit });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("uncommitted TP-13 checks the exact proposed append, not merely a valid JSON file", () => fixture((f) => {
  f.writeConfig([f.tp13]);
  assert.equal(checkVerifySuiteAppend({ rootDir: f.root }).ok, true);
  f.writeRegistry(["a", "b"]);
  assert.deepEqual(checkVerifySuiteAppend({ rootDir: f.root }),
    { ok: true, code: "VSA-UNCOMMITTED-INTRODUCTION", checked: 1, appended: 1 });
  f.writeRegistry(["z", "b"]);
  assert.equal(checkVerifySuiteAppend({ rootDir: f.root }).code, "VSA-PRIOR-ENTRY-CHANGED");
}));

test("every committed edit after TP-13 is checked, even if a later append masks a rewrite", () => fixture((f) => {
  f.writeConfig([f.tp13]);
  f.writeRegistry(["a", "b"]);
  f.commit("introduce protected append");
  f.writeRegistry(["a", "b", "c"]);
  f.commit("another append");
  assert.deepEqual(checkVerifySuiteAppend({ rootDir: f.root }),
    { ok: true, code: "VSA-HISTORY-APPEND-ONLY", checked: 2 });
  f.writeRegistry(["z", "b", "c", "d"]);
  f.commit("rewrite old registration");
  f.writeRegistry(["z", "b", "c", "d", "e"]);
  f.commit("later append");
  assert.equal(checkVerifySuiteAppend({ rootDir: f.root }).code, "VSA-PRIOR-ENTRY-CHANGED");
}));
