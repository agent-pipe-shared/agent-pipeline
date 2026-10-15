// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin: pipeline.kernel-closure-check-masks-violations-after-the-first (AC-206).
 *
 * Acceptance (backlog/items/2026-10-05-...):
 *   A1. The check reports ALL violations per run, not only the first.
 *   A2. A red ratchet blocks the candidate stamp (here: a red ratchet exits non-zero as a CLI).
 *
 * The closure checker lives inside guard-maintenance-window-kernel-closure.test.mjs (not exported), so
 * this pin drives the REAL file two ways: (a) as a CLI on the live repository, and (b) as a scratch
 * MIRROR of the same source text with one extra check injected before its summary line. The mirror runs
 * the production kernelClosureViolations code unchanged; the mutant mirror shows the pin can fail (RED).
 * Production is never edited. Fixtures live under scratch/ (host fact: no OS temp dir).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const LIB = join(REPO_ROOT, "plugins", "pipeline-core", "lib");
const REAL = join(LIB, "guard-maintenance-window-kernel-closure.test.mjs");
const SCRATCH = join(REPO_ROOT, "scratch", "kernel-closure-pin");
const realSource = readFileSync(REAL, "utf8");

// Three independent violation kinds in one run: two stray edges in ONE file, a dynamic import with no
// table entry, and a listed-but-missing file. A first-violation-only checker reports exactly one.
const INJECTED_MULTI = `
check("PIN-MULTI all violations in one run", () => {
  const sources = new Map([
    ["k/a.mjs", 'import "./s1.mjs";\\nimport "./s2.mjs";\\nexport const d = (n) => import(n);'],
    ["k/s1.mjs", "export const s1 = 1;"],
    ["k/s2.mjs", "export const s2 = 1;"],
  ]);
  const roots = ["k/a.mjs", "k/ghost.mjs"];
  const v = kernelClosureViolations({ roots, kernelSet: new Set(roots), loadSource: (p) => sources.get(p) ?? null, dynamicEdges: {} });
  assert.equal(v.length, 4, v.join("\\n"));
  assert.equal(v.filter((m) => m.includes("NOT in NEVER_LIFTABLE_KERNEL_PATHS")).length, 2);
  assert.ok(v.some((m) => m.includes("dynamic import() the static scanner cannot classify")));
  assert.ok(v.some((m) => m.includes("k/ghost.mjs is listed")));
  assert.throws(() => assertKernelClosed(v), (e) => /\\(4 violation\\(s\\)\\)/.test(e.message) && e.message.includes("s1.mjs") && e.message.includes("s2.mjs") && e.message.includes("ghost"));
});
`;
const INJECTED_RED = `check("PIN-RED ratchet is red", () => { throw new Error("deliberate red ratchet"); });\n`;

function mirror(name, { inject, mutate }) {
  mkdirSync(SCRATCH, { recursive: true });
  let src = realSource;
  src = src.replace('from "./guard-maintenance-window.mjs"', `from ${JSON.stringify(pathToFileURL(join(LIB, "guard-maintenance-window.mjs")).href)}`);
  src = src.replace('from "./consumer-verify.mjs"', `from ${JSON.stringify(pathToFileURL(join(LIB, "consumer-verify.mjs")).href)}`);
  const rootLine = 'const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");';
  assert.ok(src.includes(rootLine), "REPO_ROOT line found");
  src = src.replace(rootLine, `const REPO_ROOT = ${JSON.stringify(REPO_ROOT)};`);
  if (mutate) {
    assert.ok(src.includes(mutate.from), "mutation anchor found");
    src = src.replace(mutate.from, mutate.to);
  }
  const marker = "console.log(`\\nguard-maintenance-window-kernel-closure:";
  assert.ok(src.includes(marker), "summary marker found");
  src = src.replace(marker, `${inject}\n${marker}`);
  const file = join(SCRATCH, `${name}.mjs`);
  writeFileSync(file, src);
  return spawnSync(process.execPath, [file], { encoding: "utf8" });
}

test("A1/A2 real closure test passes as a CLI on the live repo (GMWKC01 closed, GMWKC08 multi-report green)", () => {
  const r = spawnSync(process.execPath, [REAL], { encoding: "utf8" });
  assert.match(r.stdout, /PASS GMWKC08 /);
  assert.match(r.stdout, /PASS GMWKC09 /);
  // State-agnostic on the live kernel list: green means exit 0; red means the ONE GMWKC01 failure
  // lists every violation (count > 1 on today's source) and the CLI exits 1 (A1 + A2 on live source).
  if (r.status === 0) {
    assert.match(r.stdout, /PASS GMWKC01 /);
    return;
  }
  assert.equal(r.status, 1);
  const m = /NEVER_LIFTABLE_KERNEL_PATHS is not transitively closed \((\d+) violation\(s\)\):\n([\s\S]*?)\n\s*\n/.exec(r.stderr + r.stdout) ?? /not transitively closed \((\d+) violation\(s\)\)/.exec(r.stderr + r.stdout);
  assert.ok(m, "red GMWKC01 carries a violation count");
  assert.ok(Number(m[1]) > 1, `live red ratchet lists all violations in one run, not only the first (${m[1]})`);
});

test("A1 production collector reports ALL violations of one run (mirror of the real source, injected multi-violation fixture)", () => {
  const r = mirror("multi-green", { inject: INJECTED_MULTI });
  // Exit status is not asserted here: the mirror also runs the live GMWKC01, which may be red.
  assert.match(r.stdout, /PASS PIN-MULTI/, r.stdout + r.stderr);
});

test("A1 RED control: a first-violation-only mutant of the walker fails the same fixture (the pin can fail)", () => {
  const r = mirror("multi-red", {
    inject: INJECTED_MULTI,
    mutate: {
      from: "const resolved = resolveRepoRelative(relPath, spec);",
      to: "const resolved = resolveRepoRelative(relPath, spec); if (violations.length > 0) return violations;",
    },
  });
  assert.match(r.stdout + r.stderr, /FAIL PIN-MULTI/, "mutant must be caught by the injected check");
  assert.notEqual(r.status, 0);
});

test("A1 the production source collects (no early return/throw in the walker) and keeps the no-collector throw", () => {
  const walker = realSource.slice(realSource.indexOf("function kernelClosureViolations"), realSource.indexOf("function assertKernelClosed"));
  assert.ok(!/return violations;[\s\S]*while/.test(walker.split("while (queue.length > 0)")[0]), "no return before the loop");
  assert.ok(!/\bthrow\b/.test(walker), "the walker never throws on a violation; it collects");
  assert.match(realSource, /if \(Array\.isArray\(violations\)\) \{\s*violations\.push\(message\);\s*return;\s*\}\s*throw new Error\(message\);/);
});

test("A2 a red ratchet exits non-zero as a CLI (mirror with a deliberately red check), and the real file wires the exit code", () => {
  assert.match(realSource, /process\.exit\(failed === 0 \? 0 : 1\)/);
  const r = mirror("ratchet-red", { inject: INJECTED_RED });
  assert.match(r.stderr, /FAIL PIN-RED/);
  assert.equal(r.status, 1);
});

test("cleanup scratch mirror", () => {
  rmSync(SCRATCH, { recursive: true, force: true });
});
