#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { parseVerifyInvocation, renderVerifyCommand, resolveSelfVerifySelection } from "./self-verify-selection.mjs";

assert.deepEqual(parseVerifyInvocation([], {}), { mode: "work", base: null, reuseReceipts: true });
assert.deepEqual(parseVerifyInvocation(["--mode", "critic", "--base=main", "--no-reuse"], {}), { mode: "critic", base: "main", reuseReceipts: false });
assert.equal(renderVerifyCommand({ mode: "push", base: "abc", reuseReceipts: true }), "node harness/scripts/verify.mjs --mode push --base abc");
assert.equal(renderVerifyCommand({ mode: "push", base: "abc", reuseReceipts: false }), "node harness/scripts/verify.mjs --mode push --base abc --no-reuse");
assert.throws(() => parseVerifyInvocation(["--unknown"], {}), /VERIFY-ARGUMENT/u);

const suites = [
  { name: "doc-contract-tests", file: "/repo/doc.test.mjs" },
  { name: "source-tests", file: "/repo/source.test.mjs" },
];
const spawn = (command, args) => {
  if (args[0] === "rev-parse") return { status: 0, stdout: "basecommit\n" };
  if (args[0] === "merge-base") return { status: 0, stdout: "" };
  if (args[0] === "diff") return { status: 0, stdout: "docs/guide.md\0" };
  throw new Error("unexpected git call");
};
const docs = resolveSelfVerifySelection({ repoRoot: "/repo", candidateCommit: "candidate", registeredSuites: suites, invocation: { mode: "critic", base: "main" }, spawn });
assert.equal(docs.selection.execution, "impacted");
assert.deepEqual(docs.suites.map((suite) => suite.name), ["doc-contract-tests"]);

const unknownSpawn = (command, args) => args[0] === "rev-parse"
  ? { status: 0, stdout: "basecommit\n" }
  : args[0] === "merge-base" ? { status: 0, stdout: "" } : { status: 0, stdout: "unknown.bin\0" };
const unknown = resolveSelfVerifySelection({ repoRoot: "/repo", candidateCommit: "candidate", registeredSuites: suites, invocation: { mode: "push", base: "main" }, spawn: unknownSpawn });
assert.equal(unknown.selection.execution, "full");
assert.equal(unknown.suites.length, 2);

const equalBase = resolveSelfVerifySelection({
  repoRoot: "/repo", candidateCommit: "candidate", registeredSuites: suites, invocation: { mode: "push", base: "HEAD" },
  spawn: (command, args) => args[0] === "rev-parse" ? { status: 0, stdout: "candidate\n" } : (() => { throw new Error("unexpected git call"); })(),
});
assert.equal(equalBase.selection.execution, "full");
assert.equal(equalBase.selection.fallbackReason, "invalid-base");
assert.equal(equalBase.suites.length, 2);

const unrelatedBase = resolveSelfVerifySelection({
  repoRoot: "/repo", candidateCommit: "candidate", registeredSuites: suites, invocation: { mode: "push", base: "other" },
  spawn: (command, args) => args[0] === "rev-parse" ? { status: 0, stdout: "other\n" } : { status: 1, stdout: "" },
});
assert.equal(unrelatedBase.selection.execution, "full");
assert.equal(unrelatedBase.selection.fallbackReason, "invalid-base");

const release = resolveSelfVerifySelection({ repoRoot: "/repo", candidateCommit: "candidate", registeredSuites: suites, invocation: { mode: "release", base: null }, spawn });
assert.equal(release.selection.execution, "full");
assert.equal(release.suites.length, 2);

console.log("self-verify-selection: 13 tests passed");
