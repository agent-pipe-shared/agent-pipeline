#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Import-only regression: an installed Phoenix entry must link without checkout harness files. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";

function snapshot(root, prefix = "") {
  const entries = [];
  for (const name of readdirSync(join(root, prefix)).sort()) {
    const relative = join(prefix, name);
    const path = join(root, relative);
    const stat = lstatSync(path);
    assert.equal(stat.isSymbolicLink(), false, `standalone fixture must not escape through a symlink: ${relative}`);
    if (stat.isDirectory()) {
      entries.push([relative, "directory"]);
      entries.push(...snapshot(root, relative));
    } else {
      assert.equal(stat.isFile(), true, `unsupported package entry: ${relative}`);
      entries.push([relative, createHash("sha256").update(readFileSync(path)).digest("hex")]);
    }
  }
  return entries;
}

const cases = [{ id: "PHARI001", name: "Phoenix authority revision imports from a standalone real plugin package without writer execution", run: (t) => {
  const source = resolve(process.env.PIPELINE_PHOENIX_PACKAGE_ROOT ?? "plugins/pipeline-core");
  const scratch = resolve("scratch/alfred-phoenix-package-regression-fixtures-20261011");
  mkdirSync(scratch, { recursive: true });
  const fixture = mkdtempSync(join(scratch, "package-"));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const installed = join(fixture, "installed", "pipeline-core");
  cpSync(source, installed, { recursive: true, dereference: false });
  const home = join(fixture, "empty-home");
  mkdirSync(home);
  const entry = join(installed, "scripts", "phoenix-authority-revision.mjs");
  const writer = join(installed, "scripts", "pipeline-state.mjs");
  assert.equal(existsSync(entry), true, "real Phoenix entry must be packaged");
  assert.equal(existsSync(writer), true, "real canonical state writer must be packaged");
  assert.equal(existsSync(join(fixture, "harness")), false, "no external checkout harness may mask the defect");
  const before = snapshot(fixture);
  // No argv are passed to either imported entry, and neither exported run is called.
  // Node permissions deny filesystem writes, reads outside the fixture and child execution.
  const program = `
    const revision = await import(${JSON.stringify(pathToFileURL(entry).href)});
    const writer = await import(${JSON.stringify(pathToFileURL(writer).href)});
    if (typeof revision.run !== "function" || typeof writer.run !== "function") {
      throw new Error("Phoenix and its genuine canonical writer must export run");
    }
    process.stdout.write(JSON.stringify({ revisionRun: typeof revision.run, writerRun: typeof writer.run }) + "\\n");
  `;
  const child = spawnSync(process.execPath, ["--permission", `--allow-fs-read=${fixture}`, "--input-type=module", "--eval", program], {
    cwd: fixture,
    env: { ...process.env, NODE_OPTIONS: "", HOME: home, USERPROFILE: home },
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 1024 * 1024,
    shell: false,
  });
  assert.deepEqual(snapshot(fixture), before, "import must leave all fixture bytes and paths unchanged");
  assert.ifError(child.error);
  assert.equal(child.signal, null, `import child terminated: ${child.stderr}`);
  assert.equal(child.status, 0, `standalone Phoenix entry failed to import:\n${child.stderr}`);
  assert.deepEqual(JSON.parse(child.stdout), { revisionRun: "function", writerRun: "function" });
} }];

registerTestCaseCompletion({
  cases,
  fd: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD ?? 3),
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? 4096),
});
