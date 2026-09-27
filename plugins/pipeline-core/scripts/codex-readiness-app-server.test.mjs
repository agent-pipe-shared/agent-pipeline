// SPDX-License-Identifier: SUL-1.0
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { advisoryEvidenceBundleSha256, buildAdvisoryEvidenceBundle } from "../lib/advisory-lifecycle-v2.mjs";
import { invokeCodexReadinessAppServer } from "./codex-readiness-app-server.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const SOURCE_NAMES = ["input", "prd", "spec", "design", "traceability"];
const ROUTE = Object.freeze({ model: "gpt-6-luna", effort: "high", sourceSha256: "a".repeat(64), candidateCommit: "b".repeat(40) });

function fixture(reportCandidate = { commit: "b".repeat(40), tree: "c".repeat(40) }) {
  const root = mkdtempSync(join(tmpdir(), "codex-readiness-app-server-"));
  const repoRoot = join(root, "repo");
  const scratch = join(root, "scratch");
  mkdirSync(repoRoot, { mode: 0o700 });
  mkdirSync(scratch, { mode: 0o700 });
  const sources = Object.fromEntries(SOURCE_NAMES.map((name) => {
    const path = `specs/feature/${name}.md`;
    const content = Buffer.from(`# ${name}\nFixture evidence for readiness.\n`, "utf8");
    mkdirSync(join(repoRoot, "specs/feature"), { recursive: true });
    writeFileSync(join(repoRoot, path), content, { mode: 0o600 });
    return [name, { path, sha256: sha(content) }];
  }));
  const references = SOURCE_NAMES.map((name) => sources[name].path).sort();
  const evidenceBundle = buildAdvisoryEvidenceBundle(repoRoot, references);
  const dispatch = {
    queueRevision: 4,
    candidateCommit: "b".repeat(40),
    candidateTree: "c".repeat(40),
    referenceSetSha256: advisoryEvidenceBundleSha256(evidenceBundle),
  };
  const candidate = { commit: dispatch.candidateCommit, tree: dispatch.candidateTree };
  const report = {
    schema: "pipeline.design-readiness-receipt.v1",
    dispatchId: "DESIGN-READINESS-TEST-1",
    runner: "codex",
    candidate: reportCandidate,
    sources,
    outcome: "ready-for-po-review",
    findings: [],
    unresolvedChoices: [],
    summary: "Fixture report bound to the exact five design sources.",
  };
  const codexPath = join(root, "fake-codex");
  const fakeCodex = [
    "#!/usr/bin/env node",
    'import { createInterface } from "node:readline";',
    `const report = ${JSON.stringify(report)};`,
    `const model = ${JSON.stringify(ROUTE.model)};`,
    'const rl = createInterface({ input: process.stdin });',
    'const send = (value) => process.stdout.write(`${JSON.stringify(value)}\\n`);',
    'rl.on("line", (line) => {',
    '  const message = JSON.parse(line);',
    '  if (message.id === 1) send({ id: 1, result: { protocolVersion: "2026-01-01" } });',
    '  else if (message.method === "initialized") {}',
    '  else if (message.id === 2) send({ id: 2, result: { model, modelProvider: "openai", approvalPolicy: "never", thread: { id: "thread-test" } } });',
    '  else if (message.id === 3) {',
    '    send({ id: 3, result: { turn: { id: "turn-test" } } });',
    '    setImmediate(() => {',
    '      send({ method: "item/completed", params: { threadId: "thread-test", turnId: "turn-test", item: { type: "agentMessage", phase: "final_answer", text: JSON.stringify(report) } } });',
    '      send({ method: "turn/completed", params: { threadId: "thread-test", turn: { id: "turn-test", status: "completed" } } });',
    '    });',
    '  }',
    '});',
  ].join("\n");
  writeFileSync(codexPath, fakeCodex, { mode: 0o700 });
  chmodSync(codexPath, 0o700);
  const sandboxTransport = {
    selectionId: "css_abcdefghijklmnopqrstuvwxy2",
    selectionSha256: "d".repeat(64),
    repoFingerprint: "e".repeat(64),
    duty: "readiness",
    dispatch,
    requested: { runner: "codex", model: ROUTE.model },
    toolchain: { cliSha256: "f".repeat(64) },
    profile: { sha256: "1".repeat(64), base: ":read-only", network: { enabled: true }, scratchRootSha256: "2".repeat(64) },
    scratch: { repoRoot, path: scratch, sha256: "2".repeat(64), codexPath, sandboxStateJson: "{}", sandboxStateSha256: "3".repeat(64) },
  };
  return { root, repoRoot, sources, evidenceBundle, dispatch, candidate, report, sandboxTransport };
}

function dependencies(diagnostics = null) {
  return {
    buildSandboxInvocationFn: ({ payloadPath }) => ({ command: process.execPath, argv: [payloadPath] }),
    spawnFn(command, args, options) {
      const child = spawn(command, args, options);
      if (diagnostics) {
        child.stderr.on("data", (chunk) => diagnostics.push(chunk.toString("utf8")));
        child.stdout.on("data", (chunk) => diagnostics.push(chunk.toString("utf8")));
      }
      return child;
    },
  };
}

test("Codex app-server adapter accepts only a fresh completed schema-valid report bound to the exact candidate and sources", async (context) => {
  if (process.platform === "win32") return context.skip("fixture executable uses a POSIX shebang");
  const value = fixture();
  try {
    const diagnostics = [];
    const result = await invokeCodexReadinessAppServer({
      sandboxTransport: value.sandboxTransport,
      dispatchId: value.report.dispatchId,
      candidate: value.candidate,
      sources: value.sources,
      evidenceBundle: value.evidenceBundle,
      route: ROUTE,
    }, dependencies(diagnostics));
    assert.equal(result.status, "reviewed", JSON.stringify({ result, diagnostics: diagnostics.join("").slice(0, 2000) }));
    assert.deepEqual(result.report, value.report);
    assert.deepEqual(result.identity, { provider: "openai", modelId: ROUTE.model, effort: ROUTE.effort });
    assert.equal(result.sandboxExecution.terminal.childStarted, true);
    assert.equal(result.sandboxExecution.terminal.cleanupStatus, "complete");
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("Codex app-server adapter rejects a report for a different candidate without returning its contents", async (context) => {
  if (process.platform === "win32") return context.skip("fixture executable uses a POSIX shebang");
  const value = fixture({ commit: "9".repeat(40), tree: "a".repeat(40) });
  try {
    const result = await invokeCodexReadinessAppServer({
      sandboxTransport: value.sandboxTransport,
      dispatchId: value.report.dispatchId,
      candidate: value.candidate,
      sources: value.sources,
      evidenceBundle: value.evidenceBundle,
      route: ROUTE,
    }, dependencies());
    assert.deepEqual(result, { status: "unavailable", childStarted: true });
    assert.equal(Object.hasOwn(result, "report"), false);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("Codex app-server adapter classifies a synchronous selected-launch failure as no child", async (context) => {
  if (process.platform === "win32") return context.skip("fixture executable uses a POSIX shebang");
  const value = fixture();
  try {
    const result = await invokeCodexReadinessAppServer({
      sandboxTransport: value.sandboxTransport,
      dispatchId: value.report.dispatchId,
      candidate: value.candidate,
      sources: value.sources,
      evidenceBundle: value.evidenceBundle,
      route: ROUTE,
    }, { ...dependencies(), spawnFn() { throw new Error("launcher unavailable"); } });
    assert.deepEqual(result, { status: "unavailable", childStarted: false });
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});
