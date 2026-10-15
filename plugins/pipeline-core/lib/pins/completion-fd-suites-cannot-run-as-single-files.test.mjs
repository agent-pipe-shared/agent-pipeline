#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.completion-fd-suites-cannot-run-as-single-files (AC-138).
// Acceptance points of the original item, each exercised through the real module / real suite:
//   A1 outside Verify (no PIPELINE_VERIFY_CASE_COMPLETION_FD) a suite with a hard-coded fd:3 registers
//      without TCC-FD-WRITE and runs its cases as a plain `node <file>` / `node --test <file>`.
//   A2 an unannounced descriptor 3 receives no completion bytes (stays untouched).
//   A3 Verify keeps the strict contract: signal present + unwritable descriptor => TCC-FD-WRITE,
//      and signal present + writable descriptor => full DECLARED..TERMINAL stream.
//   A4 a real suite with a fixed fd (hooks/post-compact-reground.test.mjs) runs as a single file.
//   A5 the case set is meaningful: it fails (RED) against a scratch mirror of the old behaviour.
// Fixtures live under the repository scratch/ directory (native Windows host rule), never the OS temp dir.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..", "..");
const modulePath = join(here, "..", "test-case-completion.mjs");
const realSuite = join(here, "..", "..", "hooks", "post-compact-reground.test.mjs");
const scratchRoot = join(repoRoot, "scratch");
mkdirSync(scratchRoot, { recursive: true });

function cleanEnv(verifySignal) {
  const env = { ...process.env };
  for (const name of [
    "NODE_TEST_CONTEXT",
    "PIPELINE_TCC_FIXTURE",
    "PIPELINE_VERIFY_CASE_COMPLETION_FD",
    "PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES",
  ]) delete env[name];
  if (verifySignal) {
    env.PIPELINE_VERIFY_CASE_COMPLETION_FD = "3";
    env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES = "16384";
  }
  return env;
}

// Runs a tiny hard-coded fd:3 suite as a plain single file against `helperPath`.
function runFixtureSuite({ helperPath = modulePath, verifySignal, fd3 = false }) {
  const directory = mkdtempSync(join(scratchRoot, "tcc-pin-"));
  try {
    const marks = join(directory, "marks.txt");
    const registration = join(directory, "registration-error.txt");
    const channelPath = join(directory, "fd3.jsonl");
    const suite = join(directory, "plain-suite.mjs");
    writeFileSync(suite, [
      'import { appendFileSync, writeFileSync } from "node:fs";',
      `import { registerTestCaseCompletion } from ${JSON.stringify(pathToFileURL(helperPath).href)};`,
      `const mark = (id) => appendFileSync(${JSON.stringify(marks)}, id + "\\n");`,
      "try {",
      "  registerTestCaseCompletion({ fd: 3, maxBytes: 16_384, cases: [",
      '    { id: "PR01", name: "first passes", run: () => { mark("PR01"); } },',
      '    { id: "PR02", name: "second skipped", mode: "skip", run: () => { throw new Error("must not run"); } },',
      '    { id: "PR03", name: "last passes", run: () => { mark("PR03"); } },',
      "  ] });",
      "} catch (error) {",
      `  writeFileSync(${JSON.stringify(registration)}, String(error?.code));`,
      "  throw error;",
      "}",
      "",
    ].join("\n"));
    const channelFd = fd3 ? openSync(channelPath, "w+") : null;
    let child;
    try {
      child = spawnSync(process.execPath, [suite], {
        encoding: "utf8",
        cwd: directory,
        env: cleanEnv(verifySignal),
        stdio: fd3 ? ["ignore", "pipe", "pipe", channelFd] : ["ignore", "pipe", "pipe"],
        timeout: 30_000,
      });
    } finally {
      if (channelFd !== null) closeSync(channelFd);
    }
    const read = (path) => { try { return readFileSync(path, "utf8"); } catch { return null; } };
    return {
      status: child.status,
      stdout: child.stdout ?? "",
      stderr: child.stderr ?? "",
      marks: read(marks),
      registrationError: read(registration),
      fd3: fd3 ? read(channelPath) : null,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("A1 outside Verify a hard-coded fd:3 suite runs as a plain single file and runs its cases", () => {
  const run = runFixtureSuite({ verifySignal: false });
  assert.equal(run.registrationError, null, `registration must not throw TCC-FD-WRITE: ${run.stderr}`);
  assert.equal(run.status, 0, `single-file run must exit 0: ${run.stderr}`);
  assert.equal(run.marks, "PR01\nPR03\n");
  for (const id of ["PR01", "PR02", "PR03"]) assert.match(run.stdout, new RegExp(id, "u"));
  assert.doesNotMatch(run.stderr, /TCC-FD-WRITE|EBADF/u);
});

test("A2 outside Verify an unannounced writable descriptor 3 receives no completion bytes", () => {
  const run = runFixtureSuite({ verifySignal: false, fd3: true });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.marks, "PR01\nPR03\n");
  assert.equal(run.fd3, "");
});

test("A3a inside Verify an unwritable descriptor still fails closed with TCC-FD-WRITE (strict contract kept)", () => {
  const run = runFixtureSuite({ verifySignal: true });
  assert.notEqual(run.status, 0);
  assert.equal(run.registrationError, "TCC-FD-WRITE");
  assert.equal(run.marks, null, "no case runs after strict registration failure");
});

test("A3b inside Verify a writable descriptor receives the complete DECLARED-to-TERMINAL stream", () => {
  const run = runFixtureSuite({ verifySignal: true, fd3: true });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.marks, "PR01\nPR03\n");
  const rows = run.fd3.trim().split("\n").filter(Boolean).map((row) => JSON.parse(row));
  assert.deepEqual(rows.map((row) => row.event), ["DECLARED", "DISPOSED", "DISPOSED", "DISPOSED", "TERMINAL"]);
  assert.deepEqual(rows.at(-1).counts, { pass: 2, fail: 0, skip: 1, todo: 0 });
});

test("A4 a real suite with a fixed fd (post-compact-reground) runs as `node --test <file>` without TCC-FD-WRITE", () => {
  const child = spawnSync(process.execPath, ["--test", realSuite], {
    encoding: "utf8",
    cwd: repoRoot,
    env: cleanEnv(false),
    timeout: 240_000,
  });
  const output = `${child.stdout}\n${child.stderr}`;
  assert.doesNotMatch(output, /TCC-FD-WRITE|EBADF/u);
  assert.match(output, /PCR001 /u, "cases of the suite actually ran");
  assert.match(output, /PCR028 /u, "the last case of the suite actually ran");
  assert.equal(child.status, 0, `the real suite must pass as a single file: ${output.slice(-800)}`);
});

test("A5 RED: against a scratch mirror with the old always-strict registration the plain run fails", () => {
  const source = readFileSync(modulePath, "utf8");
  const needle = "registrationRoute && !verifySignalled()";
  assert.ok(source.includes(needle), "production inert decision expression not found; mirror cannot be derived");
  const directory = mkdtempSync(join(scratchRoot, "tcc-pin-mirror-"));
  try {
    const mirror = join(directory, "test-case-completion-old.mjs");
    writeFileSync(mirror, source.replace(needle, "false"));
    const run = runFixtureSuite({ helperPath: mirror, verifySignal: false });
    assert.notEqual(run.status, 0, "old behaviour must make the single-file run fail");
    assert.equal(run.registrationError, "TCC-FD-WRITE");
    assert.equal(run.marks, null);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
