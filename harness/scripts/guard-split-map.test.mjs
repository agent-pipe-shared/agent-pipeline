// SPDX-License-Identifier: SUL-1.0
/**
 * Unit tests for guard-split-map.mjs (plan stage S2-00, the guard-split extractor).
 *
 * Every test runs on a small synthetic fixture module, never on the real guard: the
 * fixture exercises the lexer cases that matter (regex literal with a slash in a class,
 * template literal with nested expressions, object keys that are not references, aliased
 * and mid-file imports, import.meta.url sites) and the three whitelisted transforms.
 * Each of extract / check / graph has a negative case (missing declaration, duplicate,
 * non-whitelisted byte change, back-edge, cycle). Temporary files live in a directory
 * created under os.tmpdir() and removed afterwards.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildPlan, checkGraph, checkModules, exportSurface, extractModule, parseMap, scanSource } from "./guard-split-map.mjs";

const SCRIPT = fileURLToPath(new URL("./guard-split-map.mjs", import.meta.url));
const tmpRoots = [];
function tmp() {
  const dir = mkdtempSync(join(tmpdir(), "guard-split-map-"));
  tmpRoots.push(dir);
  return dir;
}
after(() => {
  for (const dir of tmpRoots) rmSync(dir, { recursive: true, force: true });
});

const FIXTURE_SOURCE = [
  "#!/usr/bin/env node",
  "// SPDX-License-Identifier: SUL-1.0",
  'import { dirname, join, resolve } from "node:path";',
  'import { fileURLToPath } from "node:url";',
  'import { readFileSync as rf } from "node:fs";',
  'import { helper } from "../lib/helper.mjs";',
  'import { isDirectInvocation } from "../lib/entrypoint.mjs";',
  "",
  "// The early exit stays in the facade.",
  'if (isDirectInvocation(import.meta.url) && process.env.FX_EXIT === "1") process.exit(0);',
  "",
  'const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");',
  'const TOOL_SCRIPT = fileURLToPath(new URL("../scripts/tool.mjs", import.meta.url));',
  "export const LIMIT = 3;",
  "const PATTERN = /^a\\/b[/]c$/u; // a regex literal with a slash inside a class",
  "",
  "/** Joins a path under the root. */",
  "export function pathHelper(p) {",
  "  const half = LIMIT / 2 / 1;",
  "  return join(ROOT, `${p}/${LIMIT}/${rf.name}`) + half + TOOL_SCRIPT;",
  "}",
  "",
  "function keyOnly(obj) {",
  "  return { verdict: obj.verdict, LIMIT: 2 };",
  "}",
  "",
  "function verdict(code, extra = {}) {",
  "  return { blocked: true, code, ...extra };",
  "}",
  "",
  "export function middle(x) {",
  "  return verdict(`M-${x}`, { n: pathHelper(x), helper });",
  "}",
  "",
  "export function top(command) {",
  '  if (PATTERN.test(command)) return verdict("P");',
  "  return middle(command);",
  "}",
  "",
  "export function main(argv = []) {",
  '  return top(argv.join(" "));',
  "}",
  "",
  "if (isDirectInvocation(import.meta.url)) process.exitCode = main(process.argv.slice(2)).blocked ? 1 : 0;",
  "",
].join("\n");

const FIXTURE_MAP = {
  schema: "pipeline.guard-split-map.v1",
  source: "pkg/hooks/guard.mjs",
  baseSha: "fixture",
  moduleDir: "pkg/lib/guard",
  facade: "pkg/hooks/guard.mjs",
  modules: { leaf: { layer: 0 }, core: { layer: 1 }, lane: { layer: 2 }, gate: { layer: 3 }, facade: { layer: 4 } },
  declarations: {
    ROOT: "leaf",
    TOOL_SCRIPT: "leaf",
    LIMIT: "leaf",
    PATTERN: "leaf",
    pathHelper: "leaf",
    keyOnly: "leaf",
    verdict: "core",
    middle: "lane",
    top: "gate",
    main: "facade",
  },
};
const clone = (value) => JSON.parse(JSON.stringify(value));
const MODULES = ["leaf", "core", "lane", "gate", "facade"];

function extractAll(model = scanSource(FIXTURE_SOURCE), map = FIXTURE_MAP) {
  return Object.fromEntries(MODULES.map((name) => [name, extractModule(model, map, name).text]));
}

describe("scanSource", () => {
  const model = scanSource(FIXTURE_SOURCE);
  test("finds every declaration, statement and import exactly once", () => {
    const names = model.units.filter((u) => u.kind === "declaration").map((u) => u.name);
    assert.deepEqual(names, ["ROOT", "TOOL_SCRIPT", "LIMIT", "PATTERN", "pathHelper", "keyOnly", "verdict", "middle", "top", "main"]);
    assert.equal(model.units.filter((u) => u.kind === "statement").length, 2);
    assert.equal(model.units.filter((u) => u.kind === "import").length, 5);
  });
  test("a regex literal containing a slash inside a class does not derail the lexer", () => {
    const pattern = model.units.find((u) => u.name === "PATTERN");
    assert.match(pattern.body, /^const PATTERN = \/\^a\\\/b\[\/\]c\$\/u; \/\/ a regex literal/);
  });
  test("a comment block and the declaration keep their bytes (comment attached to the next declaration)", () => {
    const helperUnit = model.units.find((u) => u.name === "pathHelper");
    assert.ok(helperUnit.lead.startsWith("/** Joins a path under the root. */"));
    assert.ok(helperUnit.exported);
  });
  test("template literal expressions count as references; object keys and property names do not", () => {
    const path = model.units.find((u) => u.name === "pathHelper");
    assert.ok(path.idents.has("LIMIT") && path.idents.has("ROOT") && path.idents.has("rf"));
    const keyOnly = model.units.find((u) => u.name === "keyOnly");
    assert.equal(keyOnly.idents.has("verdict"), false);
    assert.equal(keyOnly.idents.has("LIMIT"), false);
  });
});

describe("plan and completeness", () => {
  test("every declaration mapped once: the completeness line", () => {
    const plan = buildPlan(scanSource(FIXTURE_SOURCE), FIXTURE_MAP);
    assert.deepEqual([plan.unmapped, plan.stale, plan.doubleMapped], [[], [], []]);
    assert.equal(plan.line, "10 declarations at base, 10 mapped, 0 unmapped, 0 double-mapped");
  });
  test("negative: an unmapped declaration, a stale entry and a duplicate JSON key are all reported", () => {
    const map = clone(FIXTURE_MAP);
    delete map.declarations.top;
    map.declarations.ghost = "leaf";
    const plan = buildPlan(scanSource(FIXTURE_SOURCE), map);
    assert.deepEqual(plan.unmapped, ["top"]);
    assert.deepEqual(plan.stale, ["ghost"]);
    const parsed = parseMap('{"declarations": {"a": "x", "b": "y", "a": "z"}}');
    assert.deepEqual(parsed.duplicateKeys.map((d) => d.key), ["a"]);
    const dup = buildPlan(scanSource(FIXTURE_SOURCE), { ...clone(FIXTURE_MAP) }, parsed.duplicateKeys);
    assert.equal(dup.doubleMapped.length, 1);
    assert.match(dup.line, /1 double-mapped/);
  });
});

describe("extract", () => {
  const model = scanSource(FIXTURE_SOURCE);
  const all = extractAll(model);
  test("a module starts with the SPDX line and carries a computed import header", () => {
    assert.ok(all.leaf.startsWith("// SPDX-License-Identifier: SUL-1.0\n"));
    assert.match(all.leaf, /import \{ dirname, join, resolve \} from "node:path";/);
    assert.match(all.leaf, /import \{ fileURLToPath \} from "node:url";/);
    assert.match(all.leaf, /import \{ readFileSync as rf \} from "node:fs";/);
    assert.doesNotMatch(all.leaf, /helper\.mjs/);
    assert.match(all.lane, /import \{ helper \} from "\.\.\/helper\.mjs";/);
    assert.match(all.lane, /import \{ verdict \} from "\.\/core\.mjs";/);
    assert.match(all.lane, /import \{ pathHelper \} from "\.\/leaf\.mjs";/);
  });
  test("whitelist (b): import.meta.url specifier depth is rewritten, nothing else", () => {
    assert.match(all.leaf, /const ROOT = resolve\(dirname\(fileURLToPath\(import\.meta\.url\)\), "\.\.\/\.\."\);/);
    assert.match(all.leaf, /new URL\("\.\.\/\.\.\/scripts\/tool\.mjs", import\.meta\.url\)/);
    assert.equal(extractModule(model, FIXTURE_MAP, "leaf").importMetaSites, 2);
  });
  test("whitelist (a): export only where a consumer exists or the base exported it", () => {
    assert.match(all.core, /export function verdict/);
    assert.doesNotMatch(all.leaf, /export const ROOT/);
    assert.doesNotMatch(all.leaf, /export function keyOnly/);
    assert.match(all.leaf, /export const LIMIT = 3;/);
    assert.match(all.leaf, /export function pathHelper/);
    assert.match(all.leaf, /\/\*\* Joins a path under the root\. \*\/\nexport function pathHelper/);
  });
  test("the facade keeps import.meta.url, the statements in order, and re-exports the base surface", () => {
    assert.ok(all.facade.startsWith("#!/usr/bin/env node\n// SPDX-License-Identifier: SUL-1.0\n"));
    assert.match(all.facade, /import \{ top \} from "\.\.\/lib\/guard\/gate\.mjs";/);
    assert.match(all.facade, /export \{ LIMIT, pathHelper \} from "\.\.\/lib\/guard\/leaf\.mjs";/);
    assert.match(all.facade, /export \{ middle \} from "\.\.\/lib\/guard\/lane\.mjs";/);
    assert.match(all.facade, /export function main\(/);
    const early = all.facade.indexOf("process.exit(0)");
    const mainAt = all.facade.indexOf("export function main(");
    const direct = all.facade.indexOf("process.exitCode = main");
    assert.ok(early > 0 && early < mainAt && mainAt < direct);
    assert.match(all.facade, /isDirectInvocation\(import\.meta\.url\) && process\.env\.FX_EXIT/);
    assert.doesNotMatch(all.facade, /\.\.\/\.\.\/scripts/);
  });
  test("negative: an import.meta.url use outside the two recognised shapes is refused, not guessed", () => {
    const source = ['import { x } from "node:y";', "const BAD = x(import.meta.url);", ""].join("\n");
    const bad = scanSource(source);
    const map = { ...clone(FIXTURE_MAP), source: "pkg/hooks/guard.mjs", declarations: { BAD: "leaf" }, modules: { leaf: { layer: 0 }, facade: { layer: 1 } } };
    assert.throws(() => extractModule(bad, map, "leaf"), /import\.meta\.url/);
  });
});

describe("check", () => {
  const model = scanSource(FIXTURE_SOURCE);
  test("all five modules byte-identical modulo the whitelist: ok", () => {
    const result = checkModules(model, FIXTURE_MAP, extractAll(model), { complete: true });
    assert.equal(result.ok, true);
    assert.deepEqual([result.misses, result.duplicates, result.diffs, result.misplaced], [[], [], [], []]);
    assert.equal(result.verbatimDeclarations, 10);
    assert.equal(result.verbatimStatements, 2);
  });
  test("partial coverage: absent modules are 'not yet extracted', not a failure; --complete makes it one", () => {
    const only = { leaf: extractAll(model).leaf };
    const partial = checkModules(model, FIXTURE_MAP, only, { complete: false });
    assert.equal(partial.ok, true);
    assert.equal(partial.modules.core.status, "not-yet-extracted");
    assert.equal(partial.modules.leaf.status, "present");
    assert.equal(checkModules(model, FIXTURE_MAP, only, { complete: true }).ok, false);
  });
  test("negative: a missing declaration is reported", () => {
    const files = extractAll(model);
    files.core = files.core.replace(/export function verdict[\s\S]*?\n}\n/, "");
    const result = checkModules(model, FIXTURE_MAP, files);
    assert.equal(result.ok, false);
    assert.ok(result.misses.some((m) => m.name === "verdict" && m.module === "core"));
  });
  test("negative: a duplicate across two modules is reported", () => {
    const files = extractAll(model);
    files.lane += `\n${files.core.slice(files.core.indexOf("export function verdict"))}`;
    const result = checkModules(model, FIXTURE_MAP, files);
    assert.equal(result.ok, false);
    assert.ok(result.duplicates.some((d) => d.name === "verdict"));
  });
  test("negative: a non-whitelisted byte change is a diff", () => {
    const files = extractAll(model);
    files.core = files.core.replace("blocked: true", "blocked: false");
    const result = checkModules(model, FIXTURE_MAP, files);
    assert.equal(result.ok, false);
    assert.ok(result.diffs.some((d) => d.name === "verdict" && d.kind === "byte-diff"));
  });
  test("negative: an import.meta.url specifier left at the base depth is a diff", () => {
    const files = extractAll(model);
    files.leaf = files.leaf.replace('"../../scripts/tool.mjs"', '"../scripts/tool.mjs"');
    const result = checkModules(model, FIXTURE_MAP, files);
    assert.equal(result.ok, false);
    assert.ok(result.diffs.some((d) => d.name === "TOOL_SCRIPT"));
  });
  test("negative: a facade statement that changed is a diff", () => {
    const files = extractAll(model);
    files.facade = files.facade.replace('=== "1") process.exit(0)', '=== "2") process.exit(0)');
    const result = checkModules(model, FIXTURE_MAP, files);
    assert.equal(result.ok, false);
    assert.ok(result.diffs.some((d) => d.kind === "statement-diff"));
  });
});

describe("graph", () => {
  const model = scanSource(FIXTURE_SOURCE);
  test("the fixture layering holds: no back-edge, no cycle, object keys create no edge", () => {
    const result = checkGraph(model, FIXTURE_MAP);
    assert.equal(result.ok, true);
    assert.deepEqual([result.backEdges, result.cycles], [[], []]);
    assert.equal(result.edges.some((e) => e.from === "leaf"), false);
    assert.deepEqual(result.modules.lane.importsFrom, { core: ["verdict"], leaf: ["pathHelper"] });
    assert.match(result.summary, /0 back-edges, 0 cycles/);
  });
  test("negative: a back-edge into a higher layer is reported", () => {
    const map = clone(FIXTURE_MAP);
    map.declarations.pathHelper = "gate";
    const result = checkGraph(model, map);
    assert.equal(result.ok, false);
    assert.ok(result.backEdges.some((e) => e.from === "lane" && e.to === "gate" && e.names.includes("pathHelper")));
  });
  test("negative: a cycle between two modules is reported", () => {
    const source = ["export function a() { return b(); }", "export function b() { return a(); }", ""].join("\n");
    const map = {
      ...clone(FIXTURE_MAP),
      modules: { m1: { layer: 1 }, m2: { layer: 1 }, facade: { layer: 2 } },
      declarations: { a: "m1", b: "m2" },
    };
    const result = checkGraph(scanSource(source), map);
    assert.equal(result.ok, false);
    assert.equal(result.cycles.length, 1);
    assert.deepEqual([...result.cycles[0]].sort(), ["m1", "m2"]);
  });
});

describe("export-surface", () => {
  test("lists the sorted export names with typeof", async () => {
    const dir = tmp();
    const file = join(dir, "surface.mjs");
    writeFileSync(file, "export const a = 1;\nexport function b() {}\nexport class C {}\nexport const s = 'x';\n");
    const surface = await exportSurface(file);
    assert.deepEqual(surface, [
      { name: "C", type: "function" },
      { name: "a", type: "number" },
      { name: "b", type: "function" },
      { name: "s", type: "string" },
    ]);
  });
});

describe("command line (reads the base blob through git show)", () => {
  test("graph, extract and check end to end, and a corrupted module turns check red", () => {
    const repo = tmp();
    mkdirSync(join(repo, "pkg", "hooks"), { recursive: true });
    writeFileSync(join(repo, "pkg", "hooks", "guard.mjs"), FIXTURE_SOURCE);
    writeFileSync(join(repo, "map.json"), `${JSON.stringify(FIXTURE_MAP, null, 2)}\n`);
    const git = (...args) => spawnSync("git", ["-C", repo, "-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" });
    assert.equal(git("init", "-q").status, 0);
    assert.equal(git("add", "pkg").status, 0);
    assert.equal(git("commit", "-q", "-m", "fixture").status, 0);
    const sha = git("rev-parse", "HEAD").stdout.trim();
    const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args, "--repo", repo, "--map", join(repo, "map.json")], { encoding: "utf8" });

    const graph = run("graph", "--base", sha);
    assert.equal(graph.status, 0, graph.stdout + graph.stderr);
    assert.match(graph.stdout, /0 back-edges, 0 cycles/);

    const outDir = join(repo, "out");
    mkdirSync(outDir);
    for (const name of MODULES) {
      const step = run("extract", "--base", sha, "--module", name, "--out", join(outDir, `${name}.mjs`));
      assert.equal(step.status, 0, step.stdout + step.stderr);
    }
    const resultFile = join(repo, "result.json");
    const check = run("check", "--base", sha, "--dir", outDir, "--out", resultFile, "--complete");
    assert.equal(check.status, 0, check.stdout + check.stderr);
    assert.match(check.stdout, /10 declarations at base, 10 mapped, 0 unmapped, 0 double-mapped/);
    assert.equal(JSON.parse(readFileSync(resultFile, "utf8")).ok, true);

    const corrupted = readFileSync(join(outDir, "core.mjs"), "utf8").replace("blocked: true", "blocked: false");
    writeFileSync(join(outDir, "core.mjs"), corrupted);
    const red = run("check", "--base", sha, "--dir", outDir, "--out", resultFile);
    assert.notEqual(red.status, 0);
    assert.equal(JSON.parse(readFileSync(resultFile, "utf8")).ok, false);
  });
});
