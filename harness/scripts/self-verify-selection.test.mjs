#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { buildSelfVerifyGovernanceSource, parseVerifyInvocation, renderVerifyCommand, resolveSelfVerifySelection } from "./self-verify-selection.mjs";

assert.deepEqual(parseVerifyInvocation([], {}), { mode: "work", base: null, eventOutPath: null, reuseReceipts: true });
assert.deepEqual(parseVerifyInvocation(["--mode", "critic", "--base=main", "--event-out", "evidence/actions/verify.json", "--no-reuse"], {}), { mode: "critic", base: "main", eventOutPath: "evidence/actions/verify.json", reuseReceipts: false });
assert.deepEqual(parseVerifyInvocation([], { PIPELINE_VERIFY_EVENT_OUT: "evidence/actions/env.json" }), { mode: "work", base: null, eventOutPath: "evidence/actions/env.json", reuseReceipts: true });
assert.equal(renderVerifyCommand({ mode: "push", base: "abc", eventOutPath: null, reuseReceipts: true }), "node harness/scripts/verify.mjs --mode push --base abc");
assert.equal(renderVerifyCommand({ mode: "push", base: "abc", eventOutPath: "evidence/actions/verify.json", reuseReceipts: false }), "node harness/scripts/verify.mjs --mode push --base abc --event-out evidence/actions/verify.json --no-reuse");
assert.throws(() => parseVerifyInvocation(["--unknown"], {}), /VERIFY-ARGUMENT/u);

const exactCandidate = { status: "clean", commit: "a".repeat(40), tree: "b".repeat(40) };
const terminalEvidence = { schema: "pipeline.verify-evidence.v0", exitCode: 0 };
const passedSource = buildSelfVerifyGovernanceSource({ evidence: terminalEvidence, startedCandidate: exactCandidate, finishedCandidate: structuredClone(exactCandidate), overallExitCode: 0 });
assert.equal(passedSource.outcome, "passed");
assert.equal(passedSource.terminalEvidenceSha256, createHash("sha256").update(`${JSON.stringify(terminalEvidence, null, 2)}\n`).digest("hex"));
assert.equal(buildSelfVerifyGovernanceSource({ evidence: { ...terminalEvidence, exitCode: 3 }, startedCandidate: exactCandidate, finishedCandidate: structuredClone(exactCandidate), overallExitCode: 3 }).outcome, "failed");
assert.equal(buildSelfVerifyGovernanceSource({ evidence: terminalEvidence, startedCandidate: exactCandidate, finishedCandidate: { ...exactCandidate, tree: "c".repeat(40) }, overallExitCode: 0 }), null);

const suites = [
  { name: "doc-contract-tests", file: "/repo/doc.test.mjs" },
  { name: "guard-lifecycle-ready-tests", file: "/repo/lifecycle.test.mjs" },
  { name: "lifecycle-recovery-contract-tests", file: "/repo/lifecycle-contract.test.mjs" },
  { name: "installed-plugin-attestation-host-tests", file: "/repo/attestation.test.mjs" },
  { name: "lifecycle-gate-satisfiability-tests", file: "/repo/lifecycle-gate.test.mjs" },
  { name: "lifecycle-ready-enforcement-tests", file: "/repo/lifecycle-enforcement.test.mjs" },
  { name: "pipeline-start-preflight-tests", file: "/repo/preflight.test.mjs" },
  { name: "project-onboarding-ready-gate-tests", file: "/repo/onboarding-gate.test.mjs" },
  { name: "project-onboarding-v3-tests", file: "/repo/onboarding.test.mjs" },
  { name: "settings-allowlist-merge-tests", file: "/repo/settings.test.mjs" },
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

const lifecycleSpawn = (command, args) => {
  if (args[0] === "rev-parse") return { status: 0, stdout: "basecommit\n" };
  if (args[0] === "merge-base") return { status: 0, stdout: "" };
  if (args[0] === "diff") return { status: 0, stdout: "plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs\0" };
  throw new Error("unexpected git call");
};
const lifecycle = resolveSelfVerifySelection({ repoRoot: "/repo", candidateCommit: "candidate", registeredSuites: suites, invocation: { mode: "critic", base: "main" }, spawn: lifecycleSpawn });
assert.equal(lifecycle.selection.execution, "impacted");
assert.deepEqual(lifecycle.selection.matchedAreaIds, ["lifecycle-recovery"]);
assert.deepEqual(lifecycle.suites.map((suite) => suite.name), [
  "doc-contract-tests",
  "guard-lifecycle-ready-tests",
  "lifecycle-recovery-contract-tests",
  "installed-plugin-attestation-host-tests",
  "lifecycle-gate-satisfiability-tests",
  "lifecycle-ready-enforcement-tests",
  "pipeline-start-preflight-tests",
  "project-onboarding-ready-gate-tests",
  "project-onboarding-v3-tests",
  "settings-allowlist-merge-tests",
]);

const unknownSpawn = (command, args) => args[0] === "rev-parse"
  ? { status: 0, stdout: "basecommit\n" }
  : args[0] === "merge-base" ? { status: 0, stdout: "" } : { status: 0, stdout: "unknown.bin\0" };
const unknown = resolveSelfVerifySelection({ repoRoot: "/repo", candidateCommit: "candidate", registeredSuites: suites, invocation: { mode: "push", base: "main" }, spawn: unknownSpawn });
assert.equal(unknown.selection.execution, "full");
assert.equal(unknown.suites.length, suites.length);

const equalBase = resolveSelfVerifySelection({
  repoRoot: "/repo", candidateCommit: "candidate", registeredSuites: suites, invocation: { mode: "push", base: "HEAD" },
  spawn: (command, args) => args[0] === "rev-parse" ? { status: 0, stdout: "candidate\n" } : (() => { throw new Error("unexpected git call"); })(),
});
assert.equal(equalBase.selection.execution, "full");
assert.equal(equalBase.selection.fallbackReason, "invalid-base");
assert.equal(equalBase.suites.length, suites.length);

const unrelatedBase = resolveSelfVerifySelection({
  repoRoot: "/repo", candidateCommit: "candidate", registeredSuites: suites, invocation: { mode: "push", base: "other" },
  spawn: (command, args) => args[0] === "rev-parse" ? { status: 0, stdout: "other\n" } : { status: 1, stdout: "" },
});
assert.equal(unrelatedBase.selection.execution, "full");
assert.equal(unrelatedBase.selection.fallbackReason, "invalid-base");

const release = resolveSelfVerifySelection({ repoRoot: "/repo", candidateCommit: "candidate", registeredSuites: suites, invocation: { mode: "release", base: null }, spawn });
assert.equal(release.selection.execution, "full");
assert.equal(release.suites.length, suites.length);

console.log("self-verify-selection: 23 tests passed");
