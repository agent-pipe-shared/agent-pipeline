#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";

import { CONTROL_DECOMPOSITION_POLICY, buildNativeProbeProgram, parseProbeResult, resolveCodexBinary, runControlDecomposition, toolFreeJsonl } from "./codex-isolation-control-decomposition.mjs";

let passed = 0;
function check(name, fn) { fn(); passed += 1; process.stdout.write(`PASS  ${name}\n`); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

check("native probe program deterministically carries both denied write categories", () => {
  const program = buildNativeProbeProgram();
  assert.match(program, /fixture-canary/u); assert.match(program, /external-canary/u); assert.match(program, /permission-denied/u);
  assert.deepEqual(parseProbeResult(Buffer.from(JSON.stringify({ schema: "pipeline.codex-native-sandbox-probe.v1", writes: [
    { category: "fixture-canary", outcome: "denied", errorCategory: "permission-denied" },
    { category: "external-canary", outcome: "denied", errorCategory: "permission-denied" },
  ] }) + "\n")), { writes: [
    { category: "fixture-canary", outcome: "denied", errorCategory: "permission-denied" },
    { category: "external-canary", outcome: "denied", errorCategory: "permission-denied" },
  ] });
  assert.equal(parseProbeResult(Buffer.from("{}\n")), null);
});

check("tool-free JSONL admits lifecycle reasoning and final messages only", () => {
  const clean = [
    { type: "thread.started" }, { type: "turn.started" }, { type: "item.started", item: { type: "reasoning" } },
    { type: "item.completed", item: { type: "agent_message" } }, { type: "turn.completed" },
  ].map(JSON.stringify).join("\n");
  assert.equal(toolFreeJsonl(Buffer.from(clean)), true);
  assert.equal(toolFreeJsonl(Buffer.from(`${clean}\n${JSON.stringify({ type: "item.started", item: { type: "command_execution" } })}`)), false);
  assert.equal(toolFreeJsonl(Buffer.from("not-json\n")), false);
});

const temp = await mkdtemp(path.join(os.tmpdir(), "codex-control-test-"));
try {
  const fake = path.join(temp, "codex");
  await writeFile(fake, "#!/bin/sh\necho codex-cli 0.144.4\n"); await chmod(fake, 0o700);
  const resolved = await resolveCodexBinary({ pathEnv: temp });
  check("binary resolution produces an absolute executable", () => assert.equal(resolved, fake));
  await assert.rejects(() => resolveCodexBinary({ pathEnv: "" }));
  passed += 1; process.stdout.write("PASS  binary resolution rejects an empty PATH\n");
} finally { await rm(temp, { recursive: true, force: true }); }

function fakeSpawn() {
  return (_command, args) => {
    const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => true;
    queueMicrotask(async () => {
      if (args[0] === "sandbox") {
        child.stdout.write(`${JSON.stringify({ schema: "pipeline.codex-native-sandbox-probe.v1", writes: [
          { category: "fixture-canary", outcome: "denied", errorCategory: "permission-denied" },
          { category: "external-canary", outcome: "denied", errorCategory: "permission-denied" },
        ] })}\n`);
      } else {
        const outputPath = args[args.indexOf("--output-last-message") + 1];
        await writeFile(outputPath, JSON.stringify({ findings: [], deliberately_not_flagged: [], trajectory_verdict: "consistent", trajectory_evidence: "synthetic", briefing_violations: [], pass: true }));
        child.stdout.write(`${JSON.stringify({ type: "thread.started" })}\n${JSON.stringify({ type: "item.started", item: { type: "reasoning" } })}\n${JSON.stringify({ type: "item.completed", item: { type: "agent_message" } })}\n${JSON.stringify({ type: "turn.completed" })}\n`);
      }
      child.stdout.end(); child.stderr.end(); child.emit("exit", 0, null);
    });
    return child;
  };
}

await (async () => {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const result = await runControlDecomposition({
    repoRoot: root, candidateCommit: head,
    artifactPaths: ["plugins/pipeline-core/scripts/critic-verdict.schema.json"],
    spawn: fakeSpawn(),
  });
  check("same resolved binary binds deterministic probe and tool-free final critic", () => {
    assert.equal(result.ok, true); assert.equal(result.envelope.sandbox.sameBinary, true);
    assert.equal(result.envelope.sandbox.mechanism, CONTROL_DECOMPOSITION_POLICY.mechanism);
    assert.equal(result.envelope.probe.ok, true); assert.equal(result.envelope.probe.canaries.fixtureUnchanged, true);
    assert.equal(result.envelope.final.ok, true); assert.equal(result.envelope.final.stream.toolFree, true);
    assert.match(result.envelope.sandbox.binarySha256, /^[0-9a-f]{64}$/u);
  });
})();

process.stdout.write(`\n${passed}/${passed} checks passed.\n`);
