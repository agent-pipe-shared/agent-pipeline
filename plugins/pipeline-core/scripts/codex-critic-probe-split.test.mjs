#!/usr/bin/env node
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { writeFile } from "node:fs/promises";
import { PassThrough } from "node:stream";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveSubNonce, findBoundAttemptEvent, findBoundDenialEvent, runProbeSplit } from "./codex-critic-probe-split.mjs";

let passed = 0;
function check(name, fn) { fn(); passed += 1; process.stdout.write(`PASS  ${name}\n`); }
const parent = "a".repeat(32);
const taskId = "phase2-codex-critic-isolation";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
check("derived sub-nonces are deterministic and task-bound", () => {
  const file = deriveSubNonce(parent, taskId, "file-write-probe"); const shell = deriveSubNonce(parent, taskId, "shell-write-probe");
  assert.match(file, /^[0-9a-f]{32}$/u); assert.notEqual(file, shell); assert.equal(file, deriveSubNonce(parent, taskId, "file-write-probe"));
  assert.notEqual(file, deriveSubNonce(parent, "another-task", "file-write-probe"));
});
check("unknown task types and malformed parent nonce fail closed", () => {
  assert.throws(() => deriveSubNonce("short", taskId, "file-write-probe")); assert.throws(() => deriveSubNonce(parent, taskId, "unknown"));
});
check("only a task-specific structured tool event binds an exact attempt marker", () => {
  const marker = "FILE-PROBE-abc.txt";
  const thread = { order: 1, stream: "stdout", text: JSON.stringify({ type: "thread.started", thread_id: "thread-1" }) };
  assert.equal(findBoundAttemptEvent([thread, { order: 2, stream: "stdout", text: `plain ${marker}` }], { taskType: "file-write-probe", marker }), null);
  assert.equal(findBoundAttemptEvent([thread, { order: 2, stream: "stdout", text: JSON.stringify({ type: "item.started", item: { id: "wrong", type: "command_execution", command: marker } }) }], { taskType: "file-write-probe", marker }), null);
  const event = findBoundAttemptEvent([thread, { order: 2, stream: "stdout", text: JSON.stringify({ type: "item.started", item: { id: "file-1", type: "file_change", path: marker } }) }], { taskType: "file-write-probe", marker });
  assert.match(event.hash, /^[0-9a-f]{64}$/u); assert.match(event.threadSha256, /^[0-9a-f]{64}$/u); assert.equal(event.id, "file-1");
});
check("denial is task-specific, ordered, and bound to the exact attempt", () => {
  const attempt = { id: "file-1", order: 2 };
  assert.equal(findBoundDenialEvent([{ order: 1, stream: "stderr", text: "ERROR codex_core::tools::router: error=patch rejected: writing is blocked by read-only sandbox" }], { taskType: "file-write-probe", attempt }), null);
  assert.equal(findBoundDenialEvent([{ order: 3, stream: "stderr", text: "ERROR codex_core::tools::router: error=command rejected: writing is blocked by read-only sandbox" }], { taskType: "file-write-probe", attempt }), null);
  assert.equal(findBoundDenialEvent([{ order: 3, stream: "stdout", text: JSON.stringify({ type: "item.completed", item: { id: "other", type: "file_change", error: "ERROR codex_core::tools::router: error=patch rejected: writing is blocked by read-only sandbox" } }) }], { taskType: "file-write-probe", attempt }), null);
  const denial = findBoundDenialEvent([{ order: 3, stream: "stdout", text: JSON.stringify({ type: "item.completed", item: { id: "file-1", type: "file_change", error: "ERROR codex_core::tools::router: error=patch rejected: writing is blocked by read-only sandbox" } }) }], { taskType: "file-write-probe", attempt });
  assert.match(denial.hash, /^[0-9a-f]{64}$/u); assert.equal(denial.id, "file-1");
});
function fakeSpawn() {
  return (_command, args) => {
    const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.pid = null;
    let prompt = "";
    child.stdin.on("data", (chunk) => { prompt += chunk; });
    child.stdin.on("finish", () => {
      queueMicrotask(async () => {
        const outputPath = args[args.indexOf("--output-last-message") + 1];
        const file = /overwrite (\/[^\s]+FILE-PROBE-[0-9a-f]+\.txt)/u.exec(prompt)?.[1];
        const shell = /overwrite (\/[^\s]+SHELL-PROBE-[0-9a-f]+\.txt)/u.exec(prompt)?.[1];
        if (file || shell) {
          const marker = file ?? shell;
          const id = file ? "file-probe" : "shell-probe";
          const type = file ? "file_change" : "command_execution";
          child.stdout.write(`${JSON.stringify({ type: "thread.started", thread_id: `thread-${id}` })}\n`);
          child.stdout.write(`${JSON.stringify({ type: "item.started", item: { id, type, target: marker } })}\n`);
          child.stdout.write(`${JSON.stringify({ type: "item.completed", item: { id, type, error: `ERROR codex_core::tools::router: error=${file ? "patch" : "command"} rejected: writing is blocked by read-only sandbox` } })}\n`);
        } else {
          await writeFile(outputPath, JSON.stringify({ findings: [], deliberately_not_flagged: [], trajectory_verdict: "consistent", trajectory_evidence: "synthetic", briefing_violations: [], pass: true }));
        }
        child.stdout.end(); child.stderr.end(); child.emit("exit", 0, null);
      });
    });
    return child;
  };
}
await (async () => {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  try {
    const result = await runProbeSplit({ repoRoot: root, candidateCommit: head, artifactPaths: ["plugins/pipeline-core/scripts/critic-verdict.schema.json"], spawn: fakeSpawn(), leaseMs: 2_000 });
    check("three-run aggregate requires both completed probes and the final verdict", () => {
      assert.equal(result.ok, true); assert.deepEqual(result.envelope.runs.map((run) => run.outcome), ["probe-completed", "probe-completed", "pass"]);
      assert.notEqual(result.envelope.runs[0].subNonce, result.envelope.runs[1].subNonce);
      assert.equal(result.envelope.runs[0].coordinatorTermination, "coordinator-terminated-after-bound-denial");
      assert.match(result.envelope.runs[1].attemptEventSha256, /^[0-9a-f]{64}$/u);
      for (const run of result.envelope.runs) assert.equal(run.canaries.fixtureBeforeSha256, run.canaries.fixtureAfterSha256);
    });
    let terminationCalls = 0;
    const cleanupResult = await runProbeSplit({
      repoRoot: root, candidateCommit: head, artifactPaths: ["plugins/pipeline-core/scripts/critic-verdict.schema.json"], spawn: fakeSpawn(), leaseMs: 2_000,
      terminate: async (child) => { terminationCalls += 1; child.emit("exit", null, "SIGTERM"); }, isTreeAlive: () => false,
    });
    check("positive probe evidence actively terminates only the owned process path", () => {
      assert.equal(cleanupResult.ok, true); assert.equal(terminationCalls, 2);
      assert.equal(cleanupResult.envelope.runs[0].process.ownedProcessTreeGone, true);
    });
    const failedSpawn = await runProbeSplit({
      repoRoot: root, candidateCommit: head, artifactPaths: ["plugins/pipeline-core/scripts/critic-verdict.schema.json"],
      spawn: () => { throw new Error("private-path-or-secret-must-not-escape"); },
    });
    check("spawn failure is categorical and sanitizes local exception text", () => {
      assert.equal(failedSpawn.ok, false); assert.equal(failedSpawn.envelope.runs[0].failure, "spawn-failed");
      assert.equal(JSON.stringify(failedSpawn.envelope).includes("private-path-or-secret"), false);
    });
  } catch (error) {
    check("three-run aggregate requires both completed probes and the final verdict", () => { throw error; });
  }
})();
process.stdout.write(`\n${passed}/${passed} checks passed.\n`);
