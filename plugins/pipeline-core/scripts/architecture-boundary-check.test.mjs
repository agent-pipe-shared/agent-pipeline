// SPDX-License-Identifier: SUL-1.0
// FB3-PF-54 first stage (D56 (1)): the map checked over the whole tracked tree. Each case builds a
// real Git fixture and drives the real loader, so a rule is proved against what `git ls-files` lists.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BOUNDARY_POLICY_PATH,
  BOUNDARY_POLICY_SCHEMA,
  DEFAULT_LINE_BOUND,
  checkArchitectureBoundaries,
  exitCodeForBoundaryCheck,
  owningModules,
} from "./architecture-boundary-check.mjs";

const SCRIPT = fileURLToPath(new URL("./architecture-boundary-check.mjs", import.meta.url));
const roots = [];
after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

function concept(id, ownedPaths, allowedDependencies = []) {
  const list = (values) => (values.length ? `\n${values.map((value) => `  - ${value}`).join("\n")}` : " []");
  return `---\ntype: Governed Module\nid: ${id}\nresponsibility: ${id} module\nnonResponsibilities: []\nownedPaths:${list(ownedPaths)}\npublicContracts: []\nallowedDependencies:${list(allowedDependencies)}\nauthorityEffects: []\nverificationEntryPoints: []\nadrReferences: []\n---\n\n# ${id}\n`;
}

function fixture({ modules = { app: ["src/app/**"], lib: ["src/lib/**"] }, deps = { app: ["lib"] }, files = {}, policy = null, map = true } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "arch-boundary-"));
  roots.push(root);
  const write = (rel, text) => { mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); writeFileSync(path.join(root, rel), text); };
  if (map) {
    write("architecture/map/index.md", "# Map\n");
    for (const [id, owned] of Object.entries(modules)) write(`architecture/map/${id}.md`, concept(id, owned, deps[id] ?? []));
  }
  for (const [rel, text] of Object.entries(files)) write(rel, text);
  if (policy) write(BOUNDARY_POLICY_PATH, JSON.stringify(policy));
  const git = (...args) => assert.equal(spawnSync("git", args, { cwd: root, encoding: "utf8" }).status, 0, args.join(" "));
  git("init", "-q");
  git("add", "-A");
  return root;
}

const lines = (count) => `${Array.from({ length: count }, (_unused, index) => `// ${index}`).join("\n")}\n`;
const rules = (result) => result.violations.map((violation) => [violation.rule, violation.file, violation.target ?? null]);

test("ABC01 a project without an architecture map is not-applicable, never failed", () => {
  const result = checkArchitectureBoundaries({ rootDir: fixture({ map: false, files: { "src/x.mjs": "export {};\n" } }) });
  assert.equal(result.status, "not-applicable");
  assert.equal(exitCodeForBoundaryCheck(result), 0);
});

test("ABC02 owned files importing along allowedDependencies pass; docs and package imports are out of scope", () => {
  const root = fixture({ files: {
    "src/app/main.mjs": 'import { x } from "../lib/x.mjs";\nimport fs from "node:fs";\nimport y from "left-pad";\n',
    "src/lib/x.mjs": 'import "./y.mjs";\nexport const x = 1;\n',
    "src/lib/y.mjs": "export {};\n",
    "README.md": "not a source file\n",
  } });
  const result = checkArchitectureBoundaries({ rootDir: root });
  assert.equal(result.status, "pass", JSON.stringify(result.violations));
  assert.equal(result.counts.sourceFiles, 3);
});

test("ABC03 an unowned file, an equal-length tie and a forbidden import each name file, module and rule", () => {
  const root = fixture({
    modules: { app: ["src/app/**"], lib: ["src/lib/**"], shadow: ["src/lib/**"] },
    deps: { app: [] },
    files: {
      "tools/loose.mjs": "export {};\n",
      "src/lib/x.mjs": "export {};\n",
      "src/app/main.mjs": 'import { x } from "../lib/x.mjs";\n',
    },
  });
  const result = checkArchitectureBoundaries({ rootDir: root });
  assert.equal(result.status, "findings");
  assert.equal(exitCodeForBoundaryCheck(result), 1);
  assert.deepEqual(rules(result), [["ambiguous-ownership", "src/lib/x.mjs", null], ["unowned-path", "tools/loose.mjs", null]],
    "an import into an ambiguously owned file is reported once, as the ownership finding");
  const ambiguous = result.violations.find((violation) => violation.rule === "ambiguous-ownership");
  assert.equal(ambiguous.module, "lib, shadow");
});

test("ABC04 a forbidden import and an import that leaves the project are findings", () => {
  const root = fixture({
    deps: { app: [] },
    files: {
      "src/lib/x.mjs": 'import "../../../outside.mjs";\nexport const x = 1;\n',
      "src/app/main.mjs": 'import { x } from "../lib/x.mjs";\nconst late = await import("../lib/x.mjs");\n',
    },
  });
  const result = checkArchitectureBoundaries({ rootDir: root });
  assert.deepEqual(rules(result), [["forbidden-dependency", "src/app/main.mjs", "src/lib/x.mjs"], ["forbidden-dependency", "src/lib/x.mjs", "../outside.mjs"]]);
  assert.match(result.violations[0].detail, /module app imports src\/lib\/x\.mjs of module lib, which is not in its allowedDependencies \[\]/u);
});

test("ABC05 the longest ownership pattern wins, as resolveModuleForPath decides", () => {
  const modules = [{ id: "core", ownedPaths: ["src/**"] }, { id: "guard", ownedPaths: ["src/guard/**"] }];
  assert.deepEqual(owningModules("src/guard/a.mjs", modules).map((mod) => mod.id), ["guard"]);
  assert.deepEqual(owningModules("src/b.mjs", modules).map((mod) => mod.id), ["core"]);
  assert.deepEqual(owningModules("other/c.mjs", modules), []);
});

test("ABC06 the line bound applies by default and an exception is a ratchet at its recorded maxLines", () => {
  const big = { "src/lib/big.mjs": lines(DEFAULT_LINE_BOUND + 1) };
  const plain = checkArchitectureBoundaries({ rootDir: fixture({ files: big }) });
  assert.deepEqual(rules(plain), [["over-line-bound", "src/lib/big.mjs", null]]);
  assert.equal(plain.violations[0].lines, DEFAULT_LINE_BOUND + 1);
  assert.equal(plain.violations[0].module, "lib");

  const accept = (maxLines) => ({ schema: BOUNDARY_POLICY_SCHEMA, lineBound: DEFAULT_LINE_BOUND, exceptions: [{ rule: "over-line-bound", path: "src/lib/big.mjs", maxLines, reason: "adopted" }] });
  const held = checkArchitectureBoundaries({ rootDir: fixture({ files: big, policy: accept(DEFAULT_LINE_BOUND + 1) }) });
  assert.equal(held.status, "pass");
  assert.equal(held.counts.excepted, 1);
  const grown = checkArchitectureBoundaries({ rootDir: fixture({ files: big, policy: accept(DEFAULT_LINE_BOUND) }) });
  assert.equal(grown.status, "findings");
  assert.match(grown.violations[0].detail, /past its accepted 1000 lines/u);
});

test("ABC07 a configured bound, excluded trees, accepted dependencies and stale exceptions", () => {
  const policy = {
    schema: BOUNDARY_POLICY_SCHEMA,
    lineBound: 3,
    excludedPaths: [{ pattern: "evidence/**", reason: "recorded evidence" }],
    exceptions: [
      { rule: "forbidden-dependency", path: "src/lib/x.mjs", target: "src/app/main.mjs", reason: "known back edge" },
      { rule: "unowned-path", path: "gone.mjs", reason: "removed since" },
    ],
  };
  const root = fixture({ policy, files: {
    "src/lib/x.mjs": 'import "../app/main.mjs";\n',
    "src/app/main.mjs": "a\nb\nc\nd\n",
    "evidence/copy.mjs": "a\nb\nc\nd\ne\n",
  } });
  const result = checkArchitectureBoundaries({ rootDir: root });
  assert.deepEqual(rules(result), [["over-line-bound", "src/app/main.mjs", null]]);
  assert.equal(result.counts.excepted, 1);
  assert.deepEqual(result.staleExceptions, [{ rule: "unowned-path", path: "gone.mjs" }]);
  assert.equal(result.counts.sourceFiles, 2, "an excluded tree is not a source of the project");
});

test("ABC08 an invalid policy, an invalid map and a missing Git tree are typed, never a pass", () => {
  for (const policy of [
    { schema: BOUNDARY_POLICY_SCHEMA, extra: true },
    { schema: "other" },
    { schema: BOUNDARY_POLICY_SCHEMA, exceptions: [{ rule: "over-line-bound", path: "a.mjs", reason: "no cap" }] },
    { schema: BOUNDARY_POLICY_SCHEMA, exceptions: [{ rule: "forbidden-dependency", path: "a.mjs", reason: "" , target: "b.mjs" }] },
    { schema: BOUNDARY_POLICY_SCHEMA, excludedPaths: [{ pattern: "x/**" }] },
  ]) {
    const result = checkArchitectureBoundaries({ rootDir: fixture({ policy }) });
    assert.equal(result.status, "policy-invalid", JSON.stringify(policy));
    assert.equal(exitCodeForBoundaryCheck(result), 1);
  }
  const root = fixture({ deps: { app: ["missing"] } });
  assert.equal(checkArchitectureBoundaries({ rootDir: root }).status, "map-invalid");
  const unavailable = checkArchitectureBoundaries({ rootDir: fixture() }, { listFiles: () => null });
  assert.equal(unavailable.status, "unavailable");
  assert.equal(exitCodeForBoundaryCheck(unavailable), 2);
});

test("ABC09 the CLI writes a first policy once, accepting the current violations, then passes", () => {
  const root = fixture({ deps: { app: [] }, files: { "src/app/main.mjs": 'import "../lib/x.mjs";\n', "src/lib/x.mjs": lines(DEFAULT_LINE_BOUND + 2), "loose.mjs": "x\n" } });
  const cli = (...args) => spawnSync(process.execPath, [SCRIPT, "--root", root, ...args], { encoding: "utf8" });
  assert.equal(cli().status, 1);
  const written = cli("--write-policy");
  assert.equal(written.status, 0, written.stderr);
  const policy = JSON.parse(readFileSync(path.join(root, BOUNDARY_POLICY_PATH), "utf8"));
  assert.deepEqual(policy.exceptions.map((entry) => [entry.rule, entry.path, entry.target ?? entry.maxLines ?? null]),
    [["unowned-path", "loose.mjs", null], ["forbidden-dependency", "src/app/main.mjs", "src/lib/x.mjs"], ["over-line-bound", "src/lib/x.mjs", DEFAULT_LINE_BOUND + 2]]);
  const again = cli("--write-policy");
  assert.equal(again.status, 1);
  assert.match(again.stderr, /never overwritten/u);
  const json = cli("--json");
  assert.equal(json.status, 0, json.stdout);
  assert.equal(JSON.parse(json.stdout).status, "pass");
  assert.equal(Object.hasOwn(JSON.parse(json.stdout), "_observed"), false);
  assert.equal(cli("--bogus").status, 2);
  assert.equal(existsSync(path.join(root, BOUNDARY_POLICY_PATH)), true);
});
