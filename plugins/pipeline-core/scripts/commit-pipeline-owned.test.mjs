// SPDX-License-Identifier: SUL-1.0
// K98 (PO decision 2026-10-23, row 7/7): a CPO-FOREIGN-CHANGES refusal for the push-approval record
// names the working form. Message-only: no new write right, the refusal code and shape stay.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { commitPipelineOwned } from "./commit-pipeline-owned.mjs";

function refusedFor(statusOut) {
  const root = mkdtempSync(join(tmpdir(), "cpo-k98-"));
  const spawn = (_cmd, args) => (args.includes("status")
    ? { status: 0, stdout: statusOut, stderr: "" }
    : { status: 0, stdout: "", stderr: "" });
  return commitPipelineOwned(["--root", root, "--agent"], { spawn });
}

test("K98 row 7/7: the push-approval record refusal names the fold and the admitted trailer form", () => {
  const result = refusedFor(" M project/pipeline-state.json\n");
  assert.equal(result.status, "refused");
  assert.equal(result.code, "CPO-FOREIGN-CHANGES");
  assert.deepEqual(result.owned, []);
  assert.deepEqual(result.others, ["project/pipeline-state.json"]);
  assert.match(result.reason, /push-prepare/u);
  assert.match(result.reason, /do not commit it by hand/u);
  assert.match(result.reason, /Dispatch: stage-0 \(elephant\)/u);
});

function runWith(statusOut) {
  const root = mkdtempSync(join(tmpdir(), "cpo-untracked-"));
  const calls = [];
  const spawn = (_cmd, args) => {
    calls.push(args.slice(2));
    if (args.includes("status")) return { status: 0, stdout: statusOut, stderr: "" };
    if (args.includes("rev-parse")) return { status: 0, stdout: "a".repeat(40) + "\n", stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };
  return { result: commitPipelineOwned(["--root", root, "--agent"], { spawn }), calls };
}

test("an untracked foreign file is listed as untouched and the owned queue is still committed by its own path", () => {
  const { result, calls } = runWith("?? docs/report.md\n M specs/feature/slice-queue.json\n");
  assert.equal(result.status, "committed");
  assert.deepEqual(result.owned, ["specs/feature/slice-queue.json"]);
  assert.deepEqual(result.untouched, ["docs/report.md"]);
  const add = calls.find((args) => args[0] === "add"), commit = calls.find((args) => args[0] === "commit");
  assert.deepEqual(add.slice(add.indexOf("--") + 1), ["specs/feature/slice-queue.json"]);
  assert.deepEqual(commit.slice(commit.indexOf("--") + 1), ["specs/feature/slice-queue.json"]);
});

test("a modified tracked foreign file still refuses, and the untracked one is named apart from it", () => {
  const { result, calls } = runWith(" M src/app.mjs\n?? docs/report.md\n M specs/feature/slice-queue.json\n");
  assert.equal(result.status, "refused");
  assert.equal(result.code, "CPO-FOREIGN-CHANGES");
  assert.deepEqual(result.others, ["src/app.mjs"]);
  assert.deepEqual(result.untouched, ["docs/report.md"]);
  assert.equal(calls.some((args) => args[0] === "commit" || args[0] === "add"), false);
});

test("K98 row 7/7: a refusal for any other foreign file keeps the plain reason", () => {
  const result = refusedFor(" M other.txt\n");
  assert.equal(result.code, "CPO-FOREIGN-CHANGES");
  assert.doesNotMatch(result.reason, /push-prepare/u);
  assert.match(result.reason, /commits only the Pipeline's own state files/u);
});
