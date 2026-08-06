#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * A write-capable tool that no matcher names is not gated at all.
 *
 * Found 2026-08-06 while auditing the PO's requirement that only a genuinely successful
 * bootstrap may leave repository write access behind. `NotebookEdit` writes `.ipynb` files
 * and appeared in NO `hooks.json` matcher, so it reached none of the four write guards. It
 * had a second, independent half: every path guard reads `tool_input.file_path`, while
 * NotebookEdit names its target `notebook_path` -- so widening the matcher alone would
 * still have produced an empty path and a fail-open exit 0.
 *
 * Both halves are asserted here, because the recurring failure in this repository is a
 * control that is correct but unreachable, or reachable but blind.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { writeTargetPath } from "../lib/tool-write-target.mjs";

const HOOKS = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(HOOKS, "..");
const roots = [];

/** A repository the Pipeline governs, but with no ready onboarding behind it. */
function governedNotReady() {
  const base = mkdtempSync(join(tmpdir(), "notebook-coverage-"));
  roots.push(base);
  writeFileSync(join(base, "pipeline.user.yaml"), 'schema: "pipeline.user.v3"\n');
  return base;
}

function ask(guard, toolName, toolInput, root, argv = []) {
  const result = spawnSync(process.execPath, [join(HOOKS, guard), ...argv], {
    input: JSON.stringify({ tool_name: toolName, tool_input: toolInput, cwd: root }),
    encoding: "utf8",
    cwd: root,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  return { blocked: result.status !== 0, status: result.status, stderr: result.stderr ?? "" };
}

/** Executable text only -- these assertions are about behaviour, not about prose. */
function code(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .split("\n")
    .filter((line) => !/^\s*\/\//u.test(line))
    .join("\n");
}

let passed = 0;
let failed = 0;
function check(name, callback) {
  try { callback(); console.log(`PASS ${name}`); passed += 1; }
  catch (error) { console.error(`FAIL ${name}: ${error.message}`); failed += 1; }
}

try {
  check("NB01 writeTargetPath prefers file_path, accepts notebook_path, else empty", () => {
    assert.equal(writeTargetPath({ file_path: "a.mjs" }), "a.mjs");
    assert.equal(writeTargetPath({ notebook_path: "a.ipynb" }), "a.ipynb");
    assert.equal(writeTargetPath({ file_path: "a.mjs", notebook_path: "b.ipynb" }), "a.mjs");
    // An empty or non-string file_path must not shadow a usable notebook_path.
    assert.equal(writeTargetPath({ file_path: "", notebook_path: "b.ipynb" }), "b.ipynb");
    assert.equal(writeTargetPath({ file_path: 7, notebook_path: "b.ipynb" }), "b.ipynb");
    for (const value of [null, undefined, "", 0, [], { command: "ls" }]) {
      assert.equal(writeTargetPath(value), "", `input ${JSON.stringify(value)}`);
    }
  });

  check("NB02 every write matcher in hooks.json names NotebookEdit", () => {
    // The half that did not exist: correct guards that the tool call never reached.
    const hooks = JSON.parse(readFileSync(join(HOOKS, "hooks.json"), "utf8"));
    const writeMatchers = (hooks.hooks?.PreToolUse ?? [])
      .map((entry) => String(entry.matcher))
      .filter((matcher) => matcher.includes("Edit") || matcher.includes("Write"));
    assert.ok(writeMatchers.length >= 3, `expected the write matchers, found ${writeMatchers.length}`);
    for (const matcher of writeMatchers) {
      assert.ok(matcher.split("|").includes("NotebookEdit"),
        `matcher "${matcher}" does not name NotebookEdit`);
    }
  });

  check("NB03 a NotebookEdit in a governed repo without a ready bootstrap is refused", () => {
    // This is the PO requirement stated as a test: no ready bootstrap, no write.
    const root = governedNotReady();
    const notebook = ask("guard-lifecycle-ready.mjs", "NotebookEdit",
      { notebook_path: join(root, "analysis.ipynb") }, root, ["--runner", "claude"]);
    assert.equal(notebook.blocked, true, "NotebookEdit reached the disk without a ready bootstrap");
    assert.match(notebook.stderr, /GUARD-LIFECYCLE-NOT-READY/u);
  });

  check("NB04 NotebookEdit is treated exactly like Edit by the admission gate", () => {
    const root = governedNotReady();
    const target = join(root, "analysis.ipynb");
    const edit = ask("guard-lifecycle-ready.mjs", "Edit", { file_path: target }, root, ["--runner", "claude"]);
    const notebook = ask("guard-lifecycle-ready.mjs", "NotebookEdit", { notebook_path: target }, root, ["--runner", "claude"]);
    assert.equal(notebook.status, edit.status, "NotebookEdit and Edit disagree on the same target");
    assert.equal(notebook.stderr, edit.stderr, "NotebookEdit and Edit give different reasons");
  });

  check("NB05 a NotebookEdit with no usable path fails closed rather than allowing", () => {
    const root = governedNotReady();
    for (const toolInput of [{}, { notebook_path: "" }, { notebook_path: 42 }]) {
      const result = ask("guard-lifecycle-ready.mjs", "NotebookEdit", toolInput, root, ["--runner", "claude"]);
      assert.equal(result.blocked, true, `${JSON.stringify(toolInput)} was allowed`);
    }
  });

  check("NB06 guard-gate-strength sees a NotebookEdit target (GS-6)", () => {
    const base = mkdtempSync(join(tmpdir(), "notebook-gs6-"));
    roots.push(base);
    const { blocked, stderr } = ask("guard-gate-strength.mjs", "NotebookEdit",
      { notebook_path: join(PLUGIN_ROOT, "hooks", "notes.ipynb") }, base);
    assert.equal(blocked, true, "a notebook inside the live plugin root must be refused");
    assert.match(stderr, /GS-6/u);
  });

  check("NB07 no write guard reads tool_input.file_path directly any more", () => {
    // Stops the class returning one guard at a time: a bare file_path read is blind to
    // NotebookEdit, and blindness here means fail-open.
    for (const name of ["guard-testpath.mjs", "guard-devplan.mjs", "guard-gate-strength.mjs", "guard-lifecycle-ready.mjs"]) {
      const source = code(readFileSync(join(HOOKS, name), "utf8"));
      assert.ok(source.includes("writeTargetPath"), `${name} does not use the shared write-target reader`);
      assert.doesNotMatch(source, /tool_input\?\.file_path|tool_input\.file_path/u,
        `${name} still reads tool_input.file_path directly`);
    }
  });

  check("NB08 the shared reader is the only place naming notebook_path", () => {
    const owners = readdirSync(HOOKS)
      .filter((name) => name.endsWith(".mjs") && !name.endsWith(".test.mjs"))
      .filter((name) => code(readFileSync(join(HOOKS, name), "utf8")).includes("notebook_path"));
    assert.deepEqual(owners, [], `hooks should read the target through the lib, not inline: ${owners}`);
  });

  console.log(`\nnotebook-write-coverage: ${passed} passed, ${failed} failed`);
} finally {
  for (const entry of roots) rmSync(entry, { recursive: true, force: true });
}
process.exit(failed === 0 ? 0 : 1);
