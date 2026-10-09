#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  TEST_CASE_COMPLETION_SCHEMA,
  createTestCaseCompletionRecorder,
  registerTestCaseCompletion,
  writeTestCaseCompletionBytes,
} from "./test-case-completion.mjs";

const fixture = process.env.PIPELINE_TCC_FIXTURE ?? "";

if (fixture !== "") {
  const cases = fixture === "dual-signal"
    ? [
      { id: "DS01", name: "rejects dual runtime disposition", run: (context) => { context.skip("first"); context.todo("second"); } },
      { id: "DS02", name: "still runs after dual disposition", run: () => {} },
    ]
    : [
      { id: "FX01", name: "fails first", run: () => { throw new Error("intentional fixture failure"); } },
      { id: "FX02", name: "is skipped", mode: "skip", run: () => { throw new Error("skip callback must not run"); } },
      { id: "FX03", name: "still runs last", run: () => { process.stdout.write("LATER-CASE-RAN\n"); } },
    ];
  registerTestCaseCompletion({
    fd: 3,
    maxBytes: 16_384,
    cases,
  });
} else {
  function channel() {
    const directory = mkdtempSync(join(tmpdir(), "pipeline-tcc-"));
    const path = join(directory, "completion.jsonl");
    const fd = openSync(path, "w+");
    return { fd, path };
  }

  function records(path) {
    return readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map((row) => JSON.parse(row));
  }

  test("rejects duplicate, unstable, and invalid declared ids before emitting bytes", () => {
    for (const [caseIds, code] of [
      [["TC01", "TC01"], "TCC-CASE-DUPLICATE"],
      [["TC02", "TC01"], "TCC-CASE-ORDER"],
      [["bad id"], "TCC-CASE-ID"],
    ]) {
      const output = channel();
      assert.throws(
        () => createTestCaseCompletionRecorder({ fd: output.fd, maxBytes: 4_096, caseIds }),
        (error) => error?.code === code,
      );
      closeSync(output.fd);
      assert.equal(readFileSync(output.path, "utf8"), "");
    }
  });

  test("rejects unknown and duplicate disposal without forging extra records", () => {
    const output = channel();
    const recorder = createTestCaseCompletionRecorder({ fd: output.fd, maxBytes: 4_096, caseIds: ["TC01", "TC02"] });
    assert.throws(() => recorder.dispose("TC99", "pass"), { code: "TCC-DISPOSE-UNKNOWN" });
    recorder.dispose("TC01", "pass");
    assert.throws(() => recorder.dispose("TC01", "fail"), { code: "TCC-DISPOSE-DUPLICATE" });
    recorder.dispose("TC02", "todo");
    closeSync(output.fd);
    const observed = records(output.path);
    assert.deepEqual(observed.map((entry) => entry.event), ["DECLARED", "DISPOSED", "DISPOSED", "TERMINAL"]);
    assert.deepEqual(observed.at(-1).counts, { pass: 1, fail: 0, skip: 0, todo: 1 });
    assert.equal(observed.at(-1).schema, TEST_CASE_COMPLETION_SCHEMA);
    assert.equal(observed.at(-1).declaredCount, 2);
    assert.equal(observed.at(-1).disposedCount, 2);
  });

  test("fails closed when the explicitly configured inherited descriptor is missing", () => {
    const output = channel();
    closeSync(output.fd);
    assert.throws(
      () => createTestCaseCompletionRecorder({ fd: output.fd, maxBytes: 4_096, caseIds: ["TC01"] }),
      { code: "TCC-FD-WRITE" },
    );
  });

  test("retries short descriptor writes with exact offsets and rejects zero progress", () => {
    const source = Buffer.from("completion-bytes", "utf8");
    const chunks = [];
    const calls = [];
    const written = writeTestCaseCompletionBytes(99, source, (_fd, bytes, offset, length) => {
      const count = Math.min(2, length);
      calls.push({ offset, length });
      chunks.push(Buffer.from(bytes.subarray(offset, offset + count)));
      return count;
    });
    assert.equal(written, source.length);
    assert.deepEqual(Buffer.concat(chunks), source);
    assert.deepEqual(calls.map(({ offset }) => offset), Array.from({ length: Math.ceil(source.length / 2) }, (_, index) => index * 2));
    assert.throws(
      () => writeTestCaseCompletionBytes(99, source, () => 0),
      { code: "TCC-FD-SHORT-WRITE" },
    );
  });

  test("one early failure stays red while later siblings dispose and terminal remains complete", () => {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      encoding: "utf8",
      env: { ...process.env, PIPELINE_TCC_FIXTURE: "early-failure" },
      stdio: ["ignore", "pipe", "pipe", "pipe"],
      timeout: 10_000,
    });
    assert.notEqual(child.status, 0);
    const observed = String(child.output[3]).trim().split("\n").map((row) => JSON.parse(row));
    assert.deepEqual(observed.map((entry) => entry.event), ["DECLARED", "DISPOSED", "DISPOSED", "DISPOSED", "TERMINAL"]);
    assert.deepEqual(observed.filter((entry) => entry.event === "DISPOSED").map(({ id, disposition }) => ({ id, disposition })), [
      { id: "FX01", disposition: "fail" },
      { id: "FX02", disposition: "skip" },
      { id: "FX03", disposition: "pass" },
    ]);
    assert.deepEqual(observed.at(-1).counts, { pass: 1, fail: 1, skip: 1, todo: 0 });
  });

  test("dual runtime skip and todo remains red and is disposed as fail", () => {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      encoding: "utf8",
      env: { ...process.env, PIPELINE_TCC_FIXTURE: "dual-signal" },
      stdio: ["ignore", "pipe", "pipe", "pipe"],
      timeout: 10_000,
    });
    assert.notEqual(child.status, 0);
    const observed = String(child.output[3]).trim().split("\n").map((row) => JSON.parse(row));
    assert.deepEqual(observed.filter((entry) => entry.event === "DISPOSED").map(({ id, disposition }) => ({ id, disposition })), [
      { id: "DS01", disposition: "fail" },
      { id: "DS02", disposition: "pass" },
    ]);
    assert.deepEqual(observed.at(-1).counts, { pass: 1, fail: 1, skip: 0, todo: 0 });
  });

  const helperUrl = new URL("./test-case-completion.mjs", import.meta.url).href;

  // Runs a tiny completion-fd suite as a plain single file. The child inherits no descriptor 3,
  // which is exactly the state `node <file>` / `node --test <file>` leave a suite in outside the
  // Verify runner. Verify signals itself to a suite child through PIPELINE_VERIFY_CASE_COMPLETION_FD
  // (set by verify-journal.mjs next to the descriptor it opens); `verifySignal` toggles that variable.
  //
  // `fd3: true` (default false, which leaves every existing call exactly as it was) gives the child a
  // descriptor 3 that the parent owns: a temp file opened "w+" and passed in stdio slot 3. The parent
  // closes it after the child exits and returns what the child wrote as `fd3` (a string, "" for no bytes).
  // `fd3Probe` is the child's own fstat of descriptor 3 ("file" when it really arrived as a regular
  // file), so a zero-byte result can be told apart from a descriptor that never reached the child.
  function runPlainFixtureSuite({ verifySignal, fd3 = false }) {
    const directory = mkdtempSync(join(tmpdir(), "pipeline-tcc-"));
    try {
      const marks = join(directory, "case-marks.txt");
      const registration = join(directory, "registration-error.txt");
      const probe = join(directory, "fd3-probe.txt");
      const channelPath = join(directory, "fd3-channel.jsonl");
      const suite = join(directory, "plain-suite.mjs");
      writeFileSync(suite, [
        `import { appendFileSync, writeFileSync${fd3 ? ", fstatSync" : ""} } from "node:fs";`,
        `import { registerTestCaseCompletion } from ${JSON.stringify(helperUrl)};`,
        `const mark = (id) => appendFileSync(${JSON.stringify(marks)}, id + "\\n");`,
        ...(fd3 ? [
          `try { writeFileSync(${JSON.stringify(probe)}, fstatSync(3).isFile() ? "file" : "other"); } catch (error) { writeFileSync(${JSON.stringify(probe)}, "absent:" + error?.code); }`,
        ] : []),
        "try {",
        "  registerTestCaseCompletion({",
        "    fd: 3,",
        "    maxBytes: 16_384,",
        "    cases: [",
        '      { id: "PR01", name: "first case passes", run: () => { mark("PR01"); } },',
        '      { id: "PR02", name: "second case is skipped", mode: "skip", run: () => { throw new Error("skip callback must not run"); } },',
        '      { id: "PR03", name: "last case passes", run: () => { mark("PR03"); } },',
        "    ],",
        "  });",
        "} catch (error) {",
        `  writeFileSync(${JSON.stringify(registration)}, String(error?.code));`,
        "  throw error;",
        "}",
        "",
      ].join("\n"));
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
      const channelFd = fd3 ? openSync(channelPath, "w+") : null;
      let child;
      try {
        child = spawnSync(process.execPath, [suite], {
          encoding: "utf8",
          cwd: directory,
          env,
          stdio: fd3 ? ["ignore", "pipe", "pipe", channelFd] : ["ignore", "pipe", "pipe"],
          timeout: 30_000,
        });
      } finally {
        // Closed before the directory removal below: an open handle would block it on Windows.
        if (channelFd !== null) closeSync(channelFd);
      }
      const read = (path) => {
        try { return readFileSync(path, "utf8"); } catch { return null; }
      };
      return {
        status: child.status,
        stdout: child.stdout ?? "",
        stderr: child.stderr ?? "",
        marks: read(marks),
        registrationError: read(registration),
        fd3: fd3 ? read(channelPath) : null,
        fd3Probe: fd3 ? read(probe) : null,
      };
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }

  test("outside Verify a completion suite runs as a plain single file and reports its cases", () => {
    const run = runPlainFixtureSuite({ verifySignal: false });
    assert.equal(run.registrationError, null, `registration must not throw without the Verify signal: ${run.stderr}`);
    assert.equal(run.status, 0, `a plain single-file run must exit 0: ${run.stderr}`);
    assert.equal(run.marks, "PR01\nPR03\n", "both runnable cases must execute and the skipped case must not");
    for (const id of ["PR01", "PR02", "PR03"]) {
      assert.match(run.stdout, new RegExp(id, "u"), `the per-case result for ${id} must be reported`);
    }
  });

  test("inside Verify an unwritable completion descriptor still fails closed with TCC-FD-WRITE", () => {
    const run = runPlainFixtureSuite({ verifySignal: true });
    assert.notEqual(run.status, 0, "the suite must die when Verify promised a descriptor that is not writable");
    assert.equal(run.registrationError, "TCC-FD-WRITE");
    assert.match(run.stderr, /TCC-FD-WRITE/u);
    assert.equal(run.marks, null, "no case may run once registration failed closed");
  });

  // Ruling 107 (TOILRES T33). The two pins above leave descriptor 3 to chance: no fd 3 at all. A real
  // run does not: under WSL descriptor 3 is one Node itself owns (a write fails EINVAL, TCC-FD-WRITE),
  // and under any runner it can be a writable channel nobody announced. Without the Verify signal the
  // recorder has no claim on descriptor 3, so the next two pins give the child a real, writable one.
  // The assumption, named here because Ruling 107 allows both a pipe and a temp file: a regular file
  // is used as the channel so the parent can read back exactly what arrived.
  test("outside Verify a descriptor 3 nobody announced receives no completion bytes", () => {
    const run = runPlainFixtureSuite({ verifySignal: false, fd3: true });
    assert.equal(run.fd3Probe, "file", `descriptor 3 must reach the child as a regular file, or a zero-byte result proves nothing: ${run.stderr}`);
    assert.equal(run.registrationError, null, `registration must not throw without the Verify signal: ${run.stderr}`);
    assert.equal(run.status, 0, `a plain single-file run must exit 0: ${run.stderr}`);
    assert.equal(run.marks, "PR01\nPR03\n", "both runnable cases must execute and the skipped case must not");
    for (const id of ["PR01", "PR02", "PR03"]) {
      assert.match(run.stdout, new RegExp(id, "u"), `the per-case result for ${id} must be reported`);
    }
    assert.equal(run.fd3, "", "without the Verify signal the recorder must leave an unannounced descriptor 3 untouched");
  });

  test("inside Verify a writable descriptor 3 receives the complete declared-to-terminal stream", () => {
    const run = runPlainFixtureSuite({ verifySignal: true, fd3: true });
    assert.equal(run.fd3Probe, "file", `descriptor 3 must reach the child as a regular file: ${run.stderr}`);
    assert.equal(run.registrationError, null, `registration must not throw with a writable descriptor: ${run.stderr}`);
    assert.equal(run.status, 0, `the suite must exit 0 when its descriptor is writable: ${run.stderr}`);
    assert.equal(run.marks, "PR01\nPR03\n", "both runnable cases must execute and the skipped case must not");
    const observed = run.fd3.trim().split("\n").filter(Boolean).map((row) => JSON.parse(row));
    assert.deepEqual(observed.map((entry) => entry.event), ["DECLARED", "DISPOSED", "DISPOSED", "DISPOSED", "TERMINAL"]);
    assert.ok(observed.every((entry) => entry.schema === TEST_CASE_COMPLETION_SCHEMA), "every record carries the completion schema");
    assert.deepEqual(
      observed.filter((entry) => entry.event === "DISPOSED").map(({ id, ordinal, disposition }) => ({ id, ordinal, disposition })),
      [
        { id: "PR01", ordinal: 0, disposition: "pass" },
        { id: "PR02", ordinal: 1, disposition: "skip" },
        { id: "PR03", ordinal: 2, disposition: "pass" },
      ],
    );
    const terminal = observed.at(-1);
    assert.deepEqual(terminal.caseIds, ["PR01", "PR02", "PR03"]);
    assert.equal(terminal.declaredCount, 3);
    assert.equal(terminal.disposedCount, 3);
    assert.deepEqual(terminal.counts, { pass: 2, fail: 0, skip: 1, todo: 0 });
    assert.equal(terminal.caseSetSha256, observed[0].caseSetSha256, "declaration and terminal bind the same case set");
  });

  test("preflights the complete bounded stream before declaration and emits within the accepted cap", () => {
    const rejected = channel();
    assert.throws(
      () => createTestCaseCompletionRecorder({ fd: rejected.fd, maxBytes: 512, caseIds: Array.from({ length: 20 }, (_, index) => `TC${String(index).padStart(2, "0")}`) }),
      { code: "TCC-OUTPUT-BOUND" },
    );
    closeSync(rejected.fd);
    assert.equal(readFileSync(rejected.path, "utf8"), "");

    const accepted = channel();
    const recorder = createTestCaseCompletionRecorder({ fd: accepted.fd, maxBytes: 4_096, caseIds: ["TC01", "TC02"] });
    recorder.dispose("TC01", "fail");
    recorder.dispose("TC02", "skip");
    closeSync(accepted.fd);
    assert.ok(Buffer.byteLength(readFileSync(accepted.path)) <= 4_096);
  });
}
