#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { closeSync, mkdtempSync, openSync, readFileSync } from "node:fs";
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
