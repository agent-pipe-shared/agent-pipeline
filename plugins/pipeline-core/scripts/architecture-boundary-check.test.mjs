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
  measureArchitecture,
  owningModules,
  previewArchitectureBoundaries,
} from "./architecture-boundary-check.mjs";

const SCRIPT = fileURLToPath(new URL("./architecture-boundary-check.mjs", import.meta.url));
const roots = [];
after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

function concept(id, ownedPaths, allowedDependencies = [], entryPoints = []) {
  const list = (values) => (values.length ? `\n${values.map((value) => `  - ${value}`).join("\n")}` : " []");
  return `---\ntype: Governed Module\nid: ${id}\nresponsibility: ${id} module\nnonResponsibilities: []\nownedPaths:${list(ownedPaths)}\npublicContracts: []\nallowedDependencies:${list(allowedDependencies)}\nauthorityEffects: []\nverificationEntryPoints:${list(entryPoints)}\nadrReferences: []\n---\n\n# ${id}\n`;
}

function fixture({ modules = { app: ["src/app/**"], lib: ["src/lib/**"] }, deps = { app: ["lib"] }, entries = {}, files = {}, policy = null, map = true } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "arch-boundary-"));
  roots.push(root);
  const write = (rel, text) => { mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); writeFileSync(path.join(root, rel), text); };
  if (map) {
    write("architecture/map/index.md", "# Map\n");
    for (const [id, owned] of Object.entries(modules)) write(`architecture/map/${id}.md`, concept(id, owned, deps[id] ?? [], entries[id] ?? []));
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

test("ABC13 every verdict states what the check does not see, in the result and on the human output", () => {
  const root = fixture({ files: { "src/app/main.mjs": "export {};\n", "src/lib/x.mjs": "export {};\n" } });
  const result = checkArchitectureBoundaries({ rootDir: root });
  assert.match(result.coverage, /Not seen: runtime or browser globals, HTML and CSS references/u);
  const run = spawnSync(process.execPath, [SCRIPT, "--root", root], { encoding: "utf8" });
  assert.match(run.stdout, /Not seen: runtime or browser globals/u);
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

// G20-36 (AC-108): the map is measured against the implemented code, with the observation budgets reported per module.
test("ABC10 the measurement names the module and file of a forbidden import and reports each module's real dependencies and size", () => {
  const root = fixture({ deps: { app: [] }, files: { "src/app/main.mjs": 'import { x } from "../lib/x.mjs";\n', "src/lib/x.mjs": lines(3) } });
  const result = measureArchitecture({ rootDir: root });
  assert.equal(result.status, "findings");
  assert.equal(exitCodeForBoundaryCheck(result), 1);
  assert.deepEqual(result.violations.map((violation) => [violation.rule, violation.module, violation.file, violation.target]), [["forbidden-dependency", "app", "src/app/main.mjs", "src/lib/x.mjs"]]);
  assert.equal(result.measurement.schema, "pipeline.architecture-measurement.v1");
  assert.deepEqual(result.measurement.budgets, { maxFileLines: 500, maxModuleLines: 2500, source: "default" });
  const app = result.measurement.modules.find((entry) => entry.id === "app");
  assert.deepEqual([app.measuredDependencies, app.allowedDependencies, app.sourceFiles, app.sourceLines], [["lib"], [], 1, 1]);
  assert.deepEqual(app.budget, { maxFileLines: 500, maxModuleLines: 2500 });
  assert.equal(result.measurement.modules.find((entry) => entry.id === "lib").sourceLines, 3);
  assert.equal(Object.hasOwn(result, "_observed"), false);
  assert.equal(measureArchitecture({ rootDir: fixture({ map: false, files: { "src/x.mjs": "export {};\n" } }) }).status, "not-applicable");
});

// CGF-08 / CGF-23 (AC-108): the blocking verdict names its candidate, observation date, scope and effect, and the open report-only
// classes (the size budgets) are listed next to a PASS instead of being hidden by it.
test("ABC12 the verdict carries candidate, date, scope, blocking effect and currency; open size budgets sit beside a PASS", () => {
  const model = JSON.stringify({ schema: "pipeline.fitness-model.v1", profileId: "p", revision: 1, modules: ["app", "lib"], allowedBoundaryCrossings: [], sizeBudgets: { maxFileLines: 3, maxModuleLines: 4 } });
  const root = fixture({ files: { "architecture/fitness-model.json": model, "src/app/main.mjs": 'import { x } from "../lib/x.mjs";\n', "src/lib/x.mjs": lines(5) } });
  const candidate = "a".repeat(40);
  const seams = { readCandidate: () => candidate, now: () => new Date("2026-11-09T10:00:00.000Z") };
  const measured = measureArchitecture({ rootDir: root }, seams);
  assert.equal(measured.status, "pass");
  assert.equal(measured.verdict.schema, "pipeline.architecture-verdict-label.v1");
  assert.deepEqual([measured.verdict.source, measured.verdict.verdict, measured.verdict.effect, measured.verdict.currency, measured.verdict.candidate, measured.verdict.observedAt],
    ["architecture-boundary-check", "pass", "blocking", "current", candidate, "2026-11-09T10:00:00.000Z"]);
  for (const rule of ["unowned-path", "forbidden-dependency", "over-line-bound"]) assert.ok(measured.verdict.scope.includes(rule), measured.verdict.scope);
  assert.deepEqual(measured.verdict.reportOnlyOpen, [{ classId: "size-budget", open: 2, detail: "2 over-budget entries, advisory" }]);
  // The plain check does not measure budgets, so it lists none; a candidate it cannot read leaves the verdict unobserved, never current.
  const plain = checkArchitectureBoundaries({ rootDir: root }, { readCandidate: () => null, now: seams.now });
  assert.deepEqual([plain.verdict.reportOnlyOpen, plain.verdict.candidate, plain.verdict.currency], [[], null, "unobserved"]);
  assert.equal(Object.hasOwn(measured, "_observed"), false, "the public measurement still hides the internal observation");
});

test("ABC11 budgets carried by the fitness model are reported per module and stay advisory", () => {
  const model = JSON.stringify({ schema: "pipeline.fitness-model.v1", profileId: "p", revision: 1, modules: ["app", "lib"], allowedBoundaryCrossings: [], sizeBudgets: { maxFileLines: 3, maxModuleLines: 4 } });
  const root = fixture({ files: { "architecture/fitness-model.json": model, "src/app/main.mjs": 'import { x } from "../lib/x.mjs";\n', "src/lib/x.mjs": lines(5) } });
  const result = measureArchitecture({ rootDir: root });
  assert.equal(result.status, "pass", "an over-budget file is reported, never a boundary finding");
  assert.deepEqual(result.measurement.budgets, { maxFileLines: 3, maxModuleLines: 4, source: "fitness-model" });
  const lib = result.measurement.modules.find((entry) => entry.id === "lib");
  assert.deepEqual(lib.budget, { maxFileLines: 3, maxModuleLines: 4 });
  assert.deepEqual(lib.overBudget, [{ scope: "file", path: "src/lib/x.mjs", lines: 5, budget: 3 }, { scope: "module", path: null, lines: 5, budget: 4 }]);
  assert.deepEqual(result.measurement.modules.find((entry) => entry.id === "app").overBudget, []);
});

test("ABC14 the preview checks the tracked tree against the PROPOSED design, names file, module and rule, and writes nothing", () => {
  // No architecture/map exists yet (it appears only after the PO signs the design): that is exactly the state the preview is for.
  const root = fixture({ map: false, files: {
    "src/app/main.mjs": 'import { x } from "../lib/x.mjs";\n',
    "src/lib/x.mjs": "export const x = 1;\n",
    "tools/loose.mjs": "export {};\n",
  } });
  const proposal = (allowed) => ({ ok: true, modules: [{ id: "app", ownedPaths: ["src/app/**"], allowedDependencies: allowed }, { id: "lib", ownedPaths: ["src/lib/**"], allowedDependencies: [] }] });
  const before = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).stdout;
  const closed = previewArchitectureBoundaries({ rootDir: root, prd: "specs/f/prd.md" }, { readPrdModules: () => proposal([]) });
  assert.equal(closed.schema, "pipeline.architecture-boundary-preview.v1");
  assert.equal(closed.status, "findings");
  assert.deepEqual(rules(closed), [["forbidden-dependency", "src/app/main.mjs", "src/lib/x.mjs"], ["unowned-path", "tools/loose.mjs", null]]);
  assert.match(closed.violations[0].detail, /module app imports src\/lib\/x\.mjs of module lib, which is not in its allowedDependencies \[\]/u);
  assert.match(closed.scope, /not an approval, nothing is written, no signature is needed/u);
  assert.equal(exitCodeForBoundaryCheck(closed), 1);
  // The same tree passes once the proposed design lets app depend on lib and owns the loose file; the permission is read from the proposal, never from a map.
  const open = previewArchitectureBoundaries({ rootDir: root, prd: "specs/f/prd.md" }, { readPrdModules: () => ({ ok: true, modules: [{ id: "app", ownedPaths: ["src/app/**", "tools/**"], allowedDependencies: ["lib"] }, { id: "lib", ownedPaths: ["src/lib/**"], allowedDependencies: [] }] }) });
  assert.equal(open.status, "pass", JSON.stringify(open.violations));
  assert.equal(exitCodeForBoundaryCheck(open), 0);
  assert.equal(existsSync(path.join(root, "architecture")), false, "the preview creates no map");
  assert.equal(spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).stdout, before, "the preview changes nothing in the tree");
});

test("ABC16 the preview reads the proposed modules from a real PRD design block and finds an import its allowedDependencies do not permit", () => {
  const module = (id, allowedDependencies) => ({ id, responsibility: `the ${id} module`, nonResponsibilities: [], ownedPaths: [`src/${id}/**`], publicContracts: [`src/${id}/index.mjs`], allowedDependencies, authorityEffects: [], verificationEntryPoints: [`tests/${id}.test.mjs`], adrReferences: [] });
  const prd = (allowedForApi) => `# PRD\n\n\`\`\`pipeline-architecture-design\n${JSON.stringify({
    schema: "pipeline.architecture-design.v1", repositoryKind: "greenfield",
    disposition: { decision: "approved-scoped", scope: ["specs/", "src/", "tests/", "architecture/"], rationale: "fixture" },
    modules: [module("core", []), module("api", allowedForApi)],
    implementationSurface: ["src/core/index.mjs", "src/api/index.mjs"],
    fitnessModel: { schema: "pipeline.fitness-model.v1", profileId: "fixture", revision: 1, allowedBoundaryCrossings: [], antiFragmentationPolicy: { minimumModuleFiles: 1 } },
  }, null, 2)}\n\`\`\`\n`;
  const root = fixture({ map: false, files: {
    "src/core/index.mjs": "export const core = 1;\n",
    "src/api/index.mjs": 'import { core } from "../core/index.mjs";\nexport const api = core;\n',
    "specs/prd.md": prd([]),
    "specs/prd-open.md": prd(["core"]),
  } });
  const closed = previewArchitectureBoundaries({ rootDir: root, prd: "specs/prd.md" });
  assert.equal(closed.status, "findings", JSON.stringify(closed));
  assert.deepEqual(rules(closed), [["forbidden-dependency", "src/api/index.mjs", "src/core/index.mjs"]]);
  assert.equal(closed.counts.modules, 2);
  const open = previewArchitectureBoundaries({ rootDir: root, prd: "specs/prd-open.md" });
  assert.equal(open.status, "pass", JSON.stringify(open));
  const cli = spawnSync(process.execPath, [SCRIPT, "--root", root, "--preview-prd", "specs/prd.md"], { encoding: "utf8" });
  assert.equal(cli.status, 1, cli.stdout + cli.stderr);
  assert.match(cli.stdout, /\[forbidden-dependency\] module api imports src\/core\/index\.mjs of module core/u);
});

test("ABC15 the preview names a PRD it cannot read as a typed refusal, never a pass, and --preview-prd excludes --write-policy", () => {
  const root = fixture({ map: false, files: { "src/app/main.mjs": "export {};\n" } });
  const missing = previewArchitectureBoundaries({ rootDir: root, prd: "specs/none/prd.md" });
  assert.equal(missing.status, "design-unavailable");
  assert.equal(missing.code, "DBG-MODULE-PLAN-UNREADABLE");
  assert.equal(exitCodeForBoundaryCheck(missing), 2);
  const cli = spawnSync(process.execPath, [SCRIPT, "--root", root, "--preview-prd", "specs/none/prd.md"], { encoding: "utf8" });
  assert.equal(cli.status, 2, cli.stdout + cli.stderr);
  assert.match(cli.stdout, /Architecture boundary PREVIEW against the proposed design of specs\/none\/prd\.md: design-unavailable/u);
  assert.match(cli.stdout, /DBG-MODULE-PLAN-UNREADABLE/u);
  const both = spawnSync(process.execPath, [SCRIPT, "--root", root, "--preview-prd", "specs/none/prd.md", "--write-policy"], { encoding: "utf8" });
  assert.equal(both.status, 2);
  assert.equal(existsSync(path.join(root, BOUNDARY_POLICY_PATH)), false, "nothing is written");
});

// C31-M3 (L2, AC-112): a test file counts to the module it tests, derived on read from what the checker sees; nothing is stored and no exception is written.
test("M3-01 a test file named after its module, inside a directory named after it, mirroring an owned file or declared as an entry point is owned by that module", () => {
  const root = fixture({
    entries: { app: ["tests/e2e/flow.test.mjs"] },
    files: {
      "src/app/main.mjs": "export {};\n", "src/lib/x.mjs": "export {};\n",
      "tests/app.test.mjs": "export {};\n", "tests/lib/x.test.mjs": "export {};\n", "tests/main.test.mjs": "export {};\n", "tests/e2e/flow.test.mjs": "export {};\n",
    },
  });
  const result = checkArchitectureBoundaries({ rootDir: root });
  assert.equal(result.status, "pass", JSON.stringify(result.violations));
  assert.equal(result.counts.sourceFiles, 6);
  assert.deepEqual([...result._measured.usage].map(([id, row]) => [id, row.files]).sort(), [["app", 4], ["lib", 2]], "each test counts to its module");
  assert.equal(existsSync(path.join(root, BOUNDARY_POLICY_PATH)), false, "no exception or policy is stored for a test");
});

test("M3-02 a test that maps to two modules stays ambiguous-ownership, a test that maps to none and a non-test file stay unowned-path", () => {
  const root = fixture({
    files: {
      "src/app/shared.mjs": "export {};\n", "src/lib/shared.mjs": "export {};\n",
      "tests/shared.test.mjs": "export {};\n", "tests/orphan.test.mjs": "export {};\n", "tools/loose.mjs": "export {};\n",
    },
  });
  const result = checkArchitectureBoundaries({ rootDir: root });
  assert.deepEqual(rules(result), [
    ["unowned-path", "tests/orphan.test.mjs", null], ["ambiguous-ownership", "tests/shared.test.mjs", null], ["unowned-path", "tools/loose.mjs", null],
  ]);
  assert.equal(result.violations.find((violation) => violation.file === "tests/shared.test.mjs").module, "app, lib");
});

test("M3-03 a derived-owned test is held to its module's allowedDependencies like any owned file", () => {
  const files = { "src/app/main.mjs": "export {};\n", "src/lib/x.mjs": "export {};\n", "tests/app.test.mjs": 'import "../src/lib/x.mjs";\n' };
  assert.equal(checkArchitectureBoundaries({ rootDir: fixture({ files }) }).status, "pass");
  const refused = checkArchitectureBoundaries({ rootDir: fixture({ deps: { app: [] }, files }) });
  assert.deepEqual(rules(refused), [["forbidden-dependency", "tests/app.test.mjs", "src/lib/x.mjs"]]);
});

// C31-M3 (L11, AC-112): the baseline policy materialize-architecture writes for the non-module path classes.
const design = await import("../lib/architecture-design.mjs");
const m3Modules = (owned) => Object.entries(owned).map(([id, ownedPaths]) => ({ id, ownedPaths }));

test("M3-04 the baseline policy covers docs and static assets, never a path a module owns, and a second --write-policy changes no byte", () => {
  const policy = design.baselineBoundaryPolicy(m3Modules({ app: ["src/**", "tests/**", "docs/contract.md"] }));
  assert.equal(policy.schema, BOUNDARY_POLICY_SCHEMA);
  assert.equal(policy.lineBound, DEFAULT_LINE_BOUND);
  assert.deepEqual(policy.exceptions, []);
  assert.deepEqual(policy.excludedPaths.map((entry) => entry.pattern), ["docs/**", "public/**", "static/**", "assets/**"], "an owned document does not hide the docs class");
  const files = { "src/main.mjs": "export {};\n", "public/app.js": "export {};\n", "docs/contracts/schema.mjs": "export {};\n", "docs/adr/0001.mjs": "export {};\n" };
  const before = fixture({ modules: { app: ["src/**", "tests/**", "docs/contract.md"] }, deps: {}, files });
  assert.deepEqual(rules(checkArchitectureBoundaries({ rootDir: before })).map(([rule]) => rule), ["unowned-path", "unowned-path", "unowned-path"], "without the policy the check is red");
  const root = fixture({ modules: { app: ["src/**", "tests/**", "docs/contract.md"] }, deps: {}, files, policy });
  const covered = checkArchitectureBoundaries({ rootDir: root });
  assert.equal(covered.status, "pass", JSON.stringify(covered.violations));
  const bytes = readFileSync(path.join(root, BOUNDARY_POLICY_PATH), "utf8");
  const again = spawnSync(process.execPath, [SCRIPT, "--root", root, "--write-policy"], { encoding: "utf8" });
  assert.equal(again.status, 1);
  assert.match(again.stderr, /never overwritten/u);
  assert.equal(readFileSync(path.join(root, BOUNDARY_POLICY_PATH), "utf8"), bytes, "the manual route is a no-op over a written policy");
});

test("M3-05 a class a module owns source in is left out, and a map with no module-less class gets no policy", () => {
  const web = design.baselineBoundaryPolicy(m3Modules({ app: ["src/**"], web: ["public/**", "docs/guide.mjs"] }));
  assert.deepEqual(web.excludedPaths.map((entry) => entry.pattern), ["static/**", "assets/**"], "public/** and docs/ (an owned source file) stay checked");
  const root = fixture({ modules: { app: ["src/**"], web: ["public/**"] }, deps: {}, files: { "public/big.js": lines(DEFAULT_LINE_BOUND + 1) }, policy: web });
  assert.deepEqual(rules(checkArchitectureBoundaries({ rootDir: root })), [["over-line-bound", "public/big.js", null]], "an owned tree keeps its line bound");
  assert.equal(design.baselineBoundaryPolicy(m3Modules({ app: ["docs/**", "public/**", "static/**", "assets/**"] })), null, "nothing left to cover writes nothing");
});
