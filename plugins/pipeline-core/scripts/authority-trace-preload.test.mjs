#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * authority-trace-preload.mjs -- the opt-in hook trace. The preload runs in a CHILD node process (it is loaded by --import), so
 * these cases spawn real children and read what they leave behind; nothing is imported in process.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";

import { AUTHORITY_TRACE_PRELOAD_PATH } from "./authority-trace-preload.mjs";

const dir = mkdtempSync(join(tmpdir(), "authority-trace-preload-"));
after(() => rmSync(dir, { recursive: true, force: true }));
const hook = join(dir, "fake-hook.mjs");
writeFileSync(hook, "process.exit(Number(process.env.FAKE_EXIT ?? 0));\n");
const preload = pathToFileURL(AUTHORITY_TRACE_PRELOAD_PATH).href;

function runHook(env) {
  const clean = { ...process.env };
  delete clean.PIPELINE_AUTHORITY_TRACE; delete clean.PIPELINE_AUTHORITY_TRACE_FILE; delete clean.NODE_OPTIONS;
  return spawnSync(process.execPath, ["--import", preload, hook], { encoding: "utf8", env: { ...clean, ...env } });
}

test("APT1 without PIPELINE_AUTHORITY_TRACE=1 nothing is written anywhere", () => {
  const file = join(dir, "off.jsonl");
  for (const value of [undefined, "0", "true"]) {
    const res = runHook({ PIPELINE_AUTHORITY_TRACE_FILE: file, ...(value === undefined ? {} : { PIPELINE_AUTHORITY_TRACE: value }) });
    assert.equal(res.status, 0);
    assert.equal(res.stderr, "");
  }
  assert.equal(existsSync(file), false);
});

test("APT2 with the switch and a file, a process that exits 2 leaves one v1 line naming the hook, the exit code and the counters", () => {
  const file = join(dir, "on.jsonl");
  const res = runHook({ PIPELINE_AUTHORITY_TRACE: "1", PIPELINE_AUTHORITY_TRACE_FILE: file, FAKE_EXIT: "2" });
  assert.equal(res.status, 2, "the diagnostic must not change the exit code it observes");
  const lines = readFileSync(file, "utf8").trim().split("\n");
  assert.equal(lines.length, 1);
  const trace = JSON.parse(lines[0]);
  assert.equal(trace.schema, "pipeline.hook-authority-trace.v1");
  assert.equal(trace.hook, "fake-hook.mjs");
  assert.equal(trace.exitCode, 2);
  assert.equal(Number.isInteger(trace.pid) && trace.pid > 0, true);
  assert.deepEqual(trace.counters, { custody: true, observed: true, authority: true }, "the three counter modules must load");
  assert.deepEqual(trace.custodyInspections, { count: 0, ms: 0, maxMs: 0 });
  assert.deepEqual(trace.nativeObservations, { count: 0, ms: 0, maxMs: 0, failed: 0, byOperation: {} });
  assert.deepEqual(trace.authorityMemo, { hits: 0, misses: 0, size: 0 });
});

test("APT4 a COPY of the file elsewhere reads the counters of the plugin named by PIPELINE_AUTHORITY_TRACE_PLUGIN_ROOT, and none without it", () => {
  const copy = join(dir, "copy-of-preload.mjs");
  copyFileSync(AUTHORITY_TRACE_PRELOAD_PATH, copy);
  const pluginRoot = dirname(dirname(AUTHORITY_TRACE_PRELOAD_PATH));
  const withRoot = join(dir, "copy-with-root.jsonl"), withoutRoot = join(dir, "copy-without-root.jsonl");
  const run = (file, extra) => spawnSync(process.execPath, ["--import", pathToFileURL(copy).href, hook], {
    encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "", PIPELINE_AUTHORITY_TRACE: "1", PIPELINE_AUTHORITY_TRACE_FILE: file, ...extra },
  });
  assert.equal(run(withRoot, { PIPELINE_AUTHORITY_TRACE_PLUGIN_ROOT: pluginRoot }).status, 0);
  assert.deepEqual(JSON.parse(readFileSync(withRoot, "utf8")).counters, { custody: true, observed: true, authority: true });
  assert.equal(run(withoutRoot, {}).status, 0, "a copy without the root still exits cleanly");
  assert.deepEqual(JSON.parse(readFileSync(withoutRoot, "utf8")).counters, { custody: false, observed: false, authority: false }, "no counter module is reachable from the copy's own directory");
});

test("APT3 several processes append, one line each, and without a file the line goes to stderr", () => {
  const file = join(dir, "many.jsonl");
  for (let i = 0; i < 3; i += 1) runHook({ PIPELINE_AUTHORITY_TRACE: "1", PIPELINE_AUTHORITY_TRACE_FILE: file });
  assert.equal(readFileSync(file, "utf8").trim().split("\n").length, 3);
  const res = runHook({ PIPELINE_AUTHORITY_TRACE: "1" });
  assert.equal(res.status, 0);
  assert.match(res.stderr, /^AUTHORITY-TRACE \{"schema":"pipeline\.hook-authority-trace\.v1"/u);
});

// ---- hook-side installer (lib/authority-trace-hook.mjs): the hooks of an Agent dispatch emit the trace themselves ----
const installerUrl = pathToFileURL(join(dirname(dirname(AUTHORITY_TRACE_PRELOAD_PATH)), "lib", "authority-trace-hook.mjs")).href;
const hooksDir = join(dirname(dirname(AUTHORITY_TRACE_PRELOAD_PATH)), "hooks");
const installerChild = join(dir, "installer-child.mjs");
writeFileSync(installerChild, `const { installHookAuthorityTrace } = await import(${JSON.stringify(installerUrl)});\nawait installHookAuthorityTrace({ hook: "child-hook" });\nawait installHookAuthorityTrace({ hook: "child-hook" });\nprocess.exit(Number(process.env.FAKE_EXIT ?? 0));\n`);

function envFor(extra) {
  const clean = { ...process.env };
  delete clean.PIPELINE_AUTHORITY_TRACE; delete clean.PIPELINE_AUTHORITY_TRACE_FILE; delete clean.NODE_OPTIONS;
  return { ...clean, ...extra };
}

test("APT5 variable unset: the installer registers nothing and a child writes nothing", () => {
  const file = join(dir, "inst-off.jsonl");
  for (const value of [undefined, "0", "true"]) {
    const res = spawnSync(process.execPath, [installerChild], { encoding: "utf8", env: envFor({ PIPELINE_AUTHORITY_TRACE_FILE: file, ...(value === undefined ? {} : { PIPELINE_AUTHORITY_TRACE: value }) }) });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.stderr, "");
  }
  assert.equal(existsSync(file), false);
});

test("APT6 variable 1 with a file: a child importing the installer (called twice) writes exactly one valid line naming the hook", () => {
  const file = join(dir, "inst-on.jsonl");
  const res = spawnSync(process.execPath, [installerChild], { encoding: "utf8", env: envFor({ PIPELINE_AUTHORITY_TRACE: "1", PIPELINE_AUTHORITY_TRACE_FILE: file, FAKE_EXIT: "3" }) });
  assert.equal(res.status, 3, "exit code unchanged");
  const lines = readFileSync(file, "utf8").trim().split("\n");
  assert.equal(lines.length, 1);
  const trace = JSON.parse(lines[0]);
  assert.equal(trace.schema, "pipeline.hook-authority-trace.v1");
  assert.equal(trace.hook, "child-hook");
  assert.equal(trace.exitCode, 3);
  assert.equal(typeof trace.wallMs, "number");
  assert.deepEqual(trace.counters, { custody: true, observed: true, authority: true });
});

test("APT7 the preload plus an installer call in one process writes ONE line", () => {
  const file = join(dir, "both.jsonl");
  const res = spawnSync(process.execPath, ["--import", preload, installerChild], { encoding: "utf8", env: envFor({ PIPELINE_AUTHORITY_TRACE: "1", PIPELINE_AUTHORITY_TRACE_FILE: file }) });
  assert.equal(res.status, 0, res.stderr);
  assert.equal(readFileSync(file, "utf8").trim().split("\n").length, 1);
});

test("APT8 each Agent PreToolUse hook script appends a trace line when the variable is set, even on empty input", () => {
  const project = mkdtempSync(join(tmpdir(), "authority-trace-hook-project-"));
  try {
    for (const name of ["guard-lifecycle-ready", "guard-dispatch", "guard-dispatch-budget", "guard-worktree-isolation"]) {
      const file = join(dir, `hook-${name}.jsonl`);
      spawnSync(process.execPath, [join(hooksDir, `${name}.mjs`)], {
        encoding: "utf8", input: "", cwd: project,
        env: envFor({ PIPELINE_AUTHORITY_TRACE: "1", PIPELINE_AUTHORITY_TRACE_FILE: file, CLAUDE_PROJECT_DIR: project }),
      });
      assert.equal(existsSync(file), true, `${name} wrote no trace`);
      const lines = readFileSync(file, "utf8").trim().split("\n");
      assert.equal(lines.length, 1, `${name} wrote ${lines.length} lines`);
      assert.equal(JSON.parse(lines[0]).hook, `${name}.mjs`);
      const off = join(dir, `hook-off-${name}.jsonl`);
      const res = spawnSync(process.execPath, [join(hooksDir, `${name}.mjs`)], { encoding: "utf8", input: "", cwd: project, env: envFor({ PIPELINE_AUTHORITY_TRACE_FILE: off, CLAUDE_PROJECT_DIR: project }) });
      assert.equal(existsSync(off), false, `${name} wrote with the variable unset`);
      assert.equal(res.stderr.includes("AUTHORITY-TRACE"), false);
    }
  } finally { rmSync(project, { recursive: true, force: true }); }
});

test("APT9 an unwritable trace file is swallowed and the exit code is unchanged", () => {
  const res = spawnSync(process.execPath, [installerChild], { encoding: "utf8", env: envFor({ PIPELINE_AUTHORITY_TRACE: "1", PIPELINE_AUTHORITY_TRACE_FILE: join(dir, "no-such-dir", "x.jsonl"), FAKE_EXIT: "4" }) });
  assert.equal(res.status, 4);
  assert.equal(res.stderr, "");
});
