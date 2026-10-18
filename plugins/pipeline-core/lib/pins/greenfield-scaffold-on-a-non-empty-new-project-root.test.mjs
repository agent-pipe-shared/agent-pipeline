// SPDX-License-Identifier: SUL-1.0
//
// ALF-H2-PF19 / AC-127: pin for backlog item pipeline.claude-windows-greenfield-lifecycle-not-walkable (finding PF19).
//
// A real new project whose folder already held the PO's concept documents (plus a .gitignore and a
// first commit) was classified `existing-unmanaged`, so the portable seed applied WITHOUT the
// greenfield architecture scaffold (architecture/map/*, AGENTS.md) and the intake route later
// dead-ended. The seed now treats an `existing-unmanaged` root as greenfield-equivalent when a
// bounded read-only walk finds NO architecture/ entry, NO AGENTS.md, NO package/build manifest and
// NO source-code file; anything else (and any walk that cannot finish) keeps the existing-project
// behaviour and says so loudly in the plan.
//
//   (a) git + one commit + concept folder (.md/.pdf/.png/Zone.Identifier) + .gitignore -> planned, written byte-exact
//   (b) the same plus package.json -> not planned, reason names it, nothing is written, lifecycle plan says so
//   (c) the same plus src/app.ts -> not planned
//   (d) an empty root -> unchanged (planned, fresh-root)
//   (e) an existing AGENTS.md -> not planned (and the file is never overwritten)
//   (f) a walk over the entry bound / over the depth bound -> not planned
//   (g) a source file that appears between plan and apply -> the apply refuses, nothing is written
//   (h) the pure classifier: the manifest list, the extension list, symlinks and unreadable trees
//
// Fixtures are real temp roots under the repository's scratch/ (host fact, as in the sibling pins) with real Git.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { initialGreenfieldAgentEntryTarget, initialGreenfieldMapTargets } from "../architecture-map-scaffold.mjs";
import * as onboarding from "../project-onboarding-v3.mjs";

const { applyProjectOnboardingV3, planProjectOnboardingLifecycleV4, planProjectOnboardingV3 } = onboarding;

const here = dirname(fileURLToPath(import.meta.url));
const scratchBase = join(resolve(here, "../../../.."), "scratch");
mkdirSync(scratchBase, { recursive: true });
const made = [];
after(() => { for (const root of made) rmSync(root, { recursive: true, force: true }); });

const RUNNER = "claude";
const SCAFFOLD_PATHS = ["architecture/map/index.md", "architecture/map/inventory.json", "AGENTS.md"];
const SCAFFOLD = [...initialGreenfieldMapTargets("fresh"), initialGreenfieldAgentEntryTarget("fresh")];
const BASE_FILES = {
  "README.md": "# Concept\n",
  ".gitignore": "node_modules/\n",
  "concept/vision.md": "# Vision\n\nA local keyboard game.\n",
  "concept/market-analysis.pdf": Buffer.from("%PDF-1.4\n%fixture\n"),
  "concept/mockup.png": Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  // Not a directory architecture/ entry at the root: a nested documentation folder never collides with the scaffold.
  "docs/architecture/sketch.md": "# Sketch\n",
};

function git(root, ...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args[0]}: ${result.stderr}`);
}

function write(root, relative, content) {
  mkdirSync(dirname(join(root, relative)), { recursive: true });
  writeFileSync(join(root, relative), content);
}

function plainRoot() {
  const root = mkdtempSync(join(scratchBase, "pin-gf-seed-"));
  made.push(root);
  return root;
}

/** A new project folder: documents and a .gitignore, one commit, nothing else. */
function committedRoot(extra = {}) {
  const root = plainRoot();
  for (const [relative, content] of Object.entries({ ...BASE_FILES, ...extra })) write(root, relative, content);
  // An NTFS colon name is an alternate data stream, not a directory entry: only create the WSL/Linux artifact there.
  if (process.platform !== "win32") write(root, "concept/market-analysis.pdf:Zone.Identifier", "[ZoneTransfer]\nZoneId=3\n");
  for (const args of [["init", "-q", "--initial-branch=main"], ["config", "user.email", "pin@example.invalid"], ["config", "user.name", "pin fixture"], ["config", "commit.gpgsign", "false"], ["add", "-A"], ["commit", "-q", "--no-verify", "-m", "seed"]]) git(root, ...args);
  return root;
}

const plan = (root) => planProjectOnboardingV3({ rootDir: root, runner: RUNNER });
const targetPaths = (value) => value.targets.map((target) => target.path);
const scaffoldTargets = (value) => targetPaths(value).filter((path) => SCAFFOLD_PATHS.includes(path));
const diagnosticCodes = (value) => (value.diagnostics ?? []).map((entry) => entry.code);

function assertNotPlanned(value, { reason, path }) {
  assert.equal(value.status, "ready", JSON.stringify(value.diagnostics));
  assert.equal(value.state, "existing-unmanaged");
  assert.deepEqual(Object.keys(value.greenfieldScaffold ?? {}).sort(), ["path", "reason", "status"], "the scaffold decision is a closed field");
  assert.equal(value.greenfieldScaffold.status, "not-planned");
  assert.equal(value.greenfieldScaffold.reason, reason);
  assert.equal(value.greenfieldScaffold.path, path);
  assert.deepEqual(scaffoldTargets(value), [], "a root that is not greenfield-equivalent never gets a scaffold target");
  const entry = (value.diagnostics ?? []).find((item) => item.code === "greenfield_scaffold_not_planned");
  assert.ok(entry, "the plan states loudly that no scaffold will be written");
  assert.ok(entry.message.includes(path), `the diagnostic names the disqualifying path ${path}: ${entry.message}`);
}

test("the greenfield-equivalence bounds and classifier are exported", () => {
  assert.equal(Number.isInteger(onboarding.GREENFIELD_WALK_BOUNDS?.maxEntries), true);
  assert.equal(Number.isInteger(onboarding.GREENFIELD_WALK_BOUNDS?.maxDepth), true);
  assert.equal(typeof onboarding.classifyGreenfieldWalk, "function");
});

test("(a) a committed folder holding only documents is planned a scaffold, and apply writes it byte-exact", () => {
  const root = committedRoot();
  const value = plan(root);
  assert.equal(value.status, "ready", JSON.stringify(value.diagnostics));
  assert.equal(value.state, "existing-unmanaged");
  assert.deepEqual(value.greenfieldScaffold, { status: "planned", reason: "greenfield-equivalent-existing-root", path: null });
  assert.deepEqual(scaffoldTargets(value).sort(), [...SCAFFOLD_PATHS].sort());
  assert.deepEqual(value.diagnostics ?? [], [], "a planned scaffold raises no not-planned diagnostic");
  assert.equal(targetPaths(value).includes(".gitignore"), false, "the project's own .gitignore is never a target");
  const before = readFileSync(join(root, "concept/vision.md"), "utf8");
  const applied = applyProjectOnboardingV3(value, { rootDir: root, activate: true });
  assert.equal(applied.status, "applied", JSON.stringify(applied.diagnostics));
  for (const target of SCAFFOLD) assert.equal(readFileSync(join(root, target.path), "utf8"), target.bytes, target.path);
  assert.equal(readFileSync(join(root, "concept/vision.md"), "utf8"), before, "the PO's documents are untouched");
});

test("(b) a package.json disqualifies the scaffold, names itself, and apply writes no architecture/ or AGENTS.md", () => {
  const root = committedRoot({ "package.json": "{\"name\":\"app\"}\n" });
  const value = plan(root);
  assertNotPlanned(value, { reason: "package-or-build-manifest", path: "package.json" });
  const lifecycle = planProjectOnboardingLifecycleV4({ rootDir: root, operation: "portable", runner: RUNNER });
  assert.ok(diagnosticCodes(lifecycle).includes("greenfield_scaffold_not_planned"), "the PO-facing lifecycle plan carries the same statement before apply");
  const applied = applyProjectOnboardingV3(value, { rootDir: root, activate: true });
  assert.equal(applied.status, "applied", JSON.stringify(applied.diagnostics));
  assert.equal(existsSync(join(root, "architecture")), false);
  assert.equal(existsSync(join(root, "AGENTS.md")), false);
});

test("(c) a source file anywhere in the tree disqualifies the scaffold", () => {
  const root = committedRoot({ "src/app.ts": "export const app = 1;\n" });
  assertNotPlanned(plan(root), { reason: "source-code-file", path: "src/app.ts" });
});

test("(d) an empty root is unchanged: planned as a fresh root", () => {
  const root = plainRoot();
  const value = plan(root);
  assert.equal(value.status, "ready", JSON.stringify(value.diagnostics));
  assert.equal(value.state, "fresh");
  assert.deepEqual(value.greenfieldScaffold, { status: "planned", reason: "fresh-root", path: null });
  assert.deepEqual(scaffoldTargets(value).sort(), [...SCAFFOLD_PATHS].sort());
  assert.deepEqual(targetPaths(value).slice(0, 3), SCAFFOLD_PATHS, "the publication order is unchanged: map first, then the entry pointer");
});

test("(e) an existing AGENTS.md disqualifies the scaffold and is never overwritten", () => {
  const root = committedRoot({ "AGENTS.md": "# Mine\n" });
  const value = plan(root);
  assertNotPlanned(value, { reason: "existing-agent-entry", path: "AGENTS.md" });
  assert.equal(applyProjectOnboardingV3(value, { rootDir: root, activate: true }).status, "applied");
  assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), "# Mine\n");
});

test("(e2) an existing architecture/ entry disqualifies the scaffold", () => {
  const root = committedRoot({ "architecture/notes.md": "# Notes\n" });
  assertNotPlanned(plan(root), { reason: "existing-architecture-entry", path: "architecture" });
});

test("(f) a walk over the entry bound is not greenfield-equivalent", () => {
  const { maxEntries } = onboarding.GREENFIELD_WALK_BOUNDS;
  const extra = {};
  for (let index = 0; index <= maxEntries; index += 1) extra[`concept/bulk/note-${String(index).padStart(5, "0")}.md`] = "";
  const root = committedRoot(extra);
  const value = plan(root);
  assert.equal(value.status, "ready", JSON.stringify(value.diagnostics));
  assert.equal(value.greenfieldScaffold.status, "not-planned");
  assert.equal(value.greenfieldScaffold.reason, "walk-bound-exceeded");
  assert.deepEqual(scaffoldTargets(value), []);
  assert.ok(diagnosticCodes(value).includes("greenfield_scaffold_not_planned"));
});

test("(f2) a walk over the depth bound is not greenfield-equivalent, one exactly at the bound still is", () => {
  const { maxDepth } = onboarding.GREENFIELD_WALK_BOUNDS;
  const nest = (directories) => `${Array.from({ length: directories }, (_, index) => `d${index}`).join("/")}/notes.md`;
  const over = plan(committedRoot({ [nest(maxDepth)]: "deep\n" }));
  assert.equal(over.greenfieldScaffold.status, "not-planned");
  assert.equal(over.greenfieldScaffold.reason, "walk-bound-exceeded");
  assert.deepEqual(scaffoldTargets(over), []);
  const atBound = plan(committedRoot({ [nest(maxDepth - 1)]: "deep\n" }));
  assert.equal(atBound.greenfieldScaffold.status, "planned");
});

test("(g) a source file that appears between plan and apply makes the apply refuse and write nothing", () => {
  const root = committedRoot();
  const value = plan(root);
  assert.equal(value.greenfieldScaffold.status, "planned");
  write(root, "src/late.ts", "export const late = 1;\n");
  const applied = applyProjectOnboardingV3(value, { rootDir: root, activate: true });
  assert.notEqual(applied.status, "applied");
  assert.match(JSON.stringify(applied.diagnostics), /greenfield/u);
  assert.equal(existsSync(join(root, "architecture")), false);
  assert.equal(existsSync(join(root, "AGENTS.md")), false);
  assert.equal(existsSync(join(root, "pipeline.user.yaml")), false);
});

test("(h) the pure classifier fails toward the existing-project behaviour", () => {
  const classify = onboarding.classifyGreenfieldWalk;
  const walk = (...paths) => ({ entries: paths.map(([path, kind = "file"]) => ({ path, kind })), incomplete: null });
  assert.deepEqual(classify(walk(["notes.md"], ["concept", "directory"], ["concept/a.pdf"], ["a.pdf:Zone.Identifier"], [".gitignore"], ["README"], ["docs/architecture/x.md"])), { status: "planned", reason: "greenfield-equivalent-existing-root", path: null });
  for (const manifest of ["package.json", "pyproject.toml", "requirements.txt", "go.mod", "Cargo.toml", "pom.xml", "build.gradle", "build.gradle.kts", "composer.json", "Gemfile", "App.csproj", "App.sln", "sub/package.json"]) {
    assert.deepEqual(classify(walk([manifest])), { status: "not-planned", reason: "package-or-build-manifest", path: manifest }, manifest);
  }
  for (const extension of "js mjs cjs ts tsx jsx py rb go rs java kt kts cs php swift c h cc cpp hpp m mm scala vue svelte sql sh ps1 dart lua".split(" ")) {
    const path = `pkg/file.${extension}`;
    assert.deepEqual(classify(walk([path])), { status: "not-planned", reason: "source-code-file", path }, path);
  }
  assert.equal(classify(walk(["PKG/MAIN.PY"])).reason, "source-code-file", "extensions are matched case-insensitively");
  assert.equal(classify(walk(["notes", "directory"], ["directory-named.js", "directory"])).status, "planned", "only files are judged by name");
  assert.deepEqual(classify(walk(["link", "symlink"])), { status: "not-planned", reason: "unsupported-entry-type", path: "link" });
  assert.deepEqual(classify(walk(["pipe", "other"])), { status: "not-planned", reason: "unsupported-entry-type", path: "pipe" });
  assert.deepEqual(classify({ entries: [], incomplete: "unreadable" }), { status: "not-planned", reason: "walk-incomplete", path: null });
  assert.deepEqual(classify({ entries: [], incomplete: "entries" }), { status: "not-planned", reason: "walk-bound-exceeded", path: null });
  assert.deepEqual(classify({ entries: [], incomplete: "depth" }), { status: "not-planned", reason: "walk-bound-exceeded", path: null });
  assert.equal(classify({ entries: [{ path: "a/b/x.ts", kind: "file" }], incomplete: "depth" }).reason, "source-code-file", "a real disqualifier seen before the bound is the reported reason");
  assert.equal(classify(walk(["src/a.ts"], ["architecture", "directory"], ["AGENTS.md"])).reason, "existing-architecture-entry", "root-level collisions are reported first, in a fixed order");
  assert.equal(classify(walk(["agents.md"])).reason, "existing-agent-entry", "a case-insensitive filesystem would collide with AGENTS.md");
});
