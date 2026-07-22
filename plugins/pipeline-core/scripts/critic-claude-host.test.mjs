#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { prepareCandidatePacket } from "./critic-packet-preflight.mjs";
import { hardenWindowsPrivateDirectory } from "../lib/windows-private-state.mjs";
import { buildNativeBareArgv, preflightNativeBare, runNativeBare, NativeBareError } from "./critic-native-bare.mjs";
import {
  CLAUDE_FALLBACK_ASSURANCE,
  CLAUDE_NATIVE_ASSURANCE,
  acceptClaudeFallback,
  executeClaudeNative,
  finalizeClaudePacketReview,
  prepareClaudePacketReview,
} from "./critic-claude-host.mjs";

let passed = 0;
function check(name, fn) { fn(); passed += 1; process.stdout.write(`PASS CLH${String(passed).padStart(2, "0")} ${name}\n`); }
function git(root, args) { return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", env: { LANG: "C", LC_ALL: "C", PATH: process.env.PATH ?? "" } }).trim(); }
function verdict() { return { findings: [], deliberately_not_flagged: ["packet"], trajectory_verdict: "consistent", trajectory_evidence: "checked", briefing_violations: [], pass: true }; }
function stream() { return `${JSON.stringify({ type: "result", result: JSON.stringify(verdict()) })}\n`; }
function files() {
  const root = mkdtempSync(join(tmpdir(), "native-bare-"));
  const executable = join(root, "claude"); const contract = join(root, "contract.md"); const schema = join(root, "schema.json");
  writeFileSync(executable, "fixture-binary\n"); chmodSync(executable, 0o700);
  writeFileSync(contract, "critic contract\n");
  writeFileSync(schema, JSON.stringify({ type: "object", required: ["findings", "deliberately_not_flagged", "trajectory_verdict", "trajectory_evidence", "briefing_violations", "pass"], additionalProperties: false, properties: { findings: { type: "array", items: { type: "object" } }, deliberately_not_flagged: { type: "array", items: { type: "string" } }, trajectory_verdict: { type: "string", enum: ["consistent", "inconsistent", "not verifiable"] }, trajectory_evidence: { type: "string" }, briefing_violations: { type: "array", items: { type: "string" } }, pass: { type: "boolean" } } }));
  return { root, executable, contract, schema };
}
function repository() {
  const root = mkdtempSync(join(tmpdir(), "claude-packet-"));
  git(root, ["init", "--quiet"]); git(root, ["config", "user.email", "test@example.invalid"]); git(root, ["config", "user.name", "Test"]);
  mkdirSync(join(root, "specs")); writeFileSync(join(root, "specs", "work.md"), "base\n"); git(root, ["add", "."]); git(root, ["commit", "--quiet", "-m", "base"]); const base = git(root, ["rev-parse", "HEAD"]);
  writeFileSync(join(root, "specs", "work.md"), "candidate\n"); git(root, ["add", "."]); git(root, ["commit", "--quiet", "-m", "candidate"]); const candidate = git(root, ["rev-parse", "HEAD"]);
  const control = join(root, git(root, ["rev-parse", "--git-common-dir"]), "agent-pipeline", "critic-packets"); mkdirSync(control, { recursive: true, mode: 0o700 }); chmodSync(join(control, ".."), 0o700); chmodSync(control, 0o700);
  // On native Windows, mkdir/chmod cannot establish the owner-only DACL the control
  // root contract requires; harden it the way a real caller's private root would be (no-op on POSIX).
  if (process.platform === "win32") hardenWindowsPrivateDirectory(control);
  const prepared = prepareCandidatePacket({ repoRoot: root, controlRoot: control, packetId: "7".repeat(32), taskId: "batman-claude", projectId: "pipeline", baseCommit: base, candidateCommit: candidate, rulesetOid: candidate,
    route: { routeId: "claude-critic", runner: "claude", adapter: "claude-host", provider: "anthropic", modelTier: "sonnet", effortTier: "max", assurance: "native-preferred", projectionDigest: "8".repeat(64) }, references: [{ kind: "spec", path: "specs/work.md" }] },
  { now: new Date("2026-07-18T12:00:00.000Z"), nonce: () => Buffer.alloc(32, 15) });
  return { root, control, prepared };
}

check("builds exact native argv with bare, CLI schema, fixed read-only tools and shell-free execution", () => {
  const argv = buildNativeBareArgv({ prompt: "p", checkoutRoot: "/repo", schemaText: "{}", model: "sonnet", effort: "max", contractPath: "/contract" });
  assert.deepEqual(argv.slice(0, 6), ["-p", "p", "--bare", "--add-dir", "/repo", "--output-format"]);
  assert.equal(argv.includes("--json-schema"), true); assert.deepEqual(argv.slice(argv.indexOf("--tools"), argv.indexOf("--tools") + 2), ["--tools", "Read,Grep,Glob"]);
});

check("preflights and reuses one exact executable identity without PATH or shell", () => {
  const f = files();
  try {
    const calls = [];
    const spawnFn = (command, args, options) => { calls.push({ command, args, options }); return { status: 0, stdout: stream(), stderr: "" }; };
    const handle = preflightNativeBare({ executablePath: f.executable, checkoutRoot: f.root, contractPath: f.contract, schemaPath: f.schema, model: "sonnet", effort: "max", routeDigest: "9".repeat(64), neutralCwd: f.root }, { spawnFn, now: new Date("2026-07-18T12:00:00.000Z") });
    const result = runNativeBare(handle, { checkoutRoot: f.root, prompt: "packet refs" }, { spawnFn });
    assert.equal(result.verdict.pass, true); assert.equal(calls.length, 2);
    assert.equal(calls.every((call) => call.command === handle.executable.realPath && call.options.shell === false && call.options.input === ""), true);
    assert.equal(calls.every((call) => call.options.env.PATH === undefined), true);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

check("does not turn timeout or verdict bytes into a fallback", () => {
  const f = files();
  try {
    const handle = preflightNativeBare({ executablePath: f.executable, checkoutRoot: f.root, contractPath: f.contract, schemaPath: f.schema, model: "sonnet", effort: "max", routeDigest: "a".repeat(64), neutralCwd: f.root }, { spawnFn: () => ({ status: 0, stdout: stream(), stderr: "" }), now: new Date("2026-07-18T12:00:00.000Z") });
    assert.throws(() => runNativeBare(handle, { checkoutRoot: f.root, prompt: "packet" }, { spawnFn: () => ({ status: null, stdout: "", stderr: "", error: { code: "ETIMEDOUT" } }) }), (error) => error instanceof NativeBareError && error.code === "CLH-TIMEOUT" && !error.preVerdict);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

check("uses exactly one explicitly weak fresh fallback for an allowlisted pre-verdict failure", () => {
  const repo = repository(); const f = files();
  try {
    const prepared = prepareClaudePacketReview({ controlRoot: repo.control, packetId: repo.prepared.packet.packetId, adapter: "claude-host", claimantNonce: "b".repeat(64), executablePath: join(f.root, "missing"), contractPath: f.contract, schemaPath: f.schema, neutralCwd: f.root }, { now: new Date("2026-07-18T12:01:00.000Z") });
    assert.equal(prepared.mode, "fallback"); assert.equal(prepared.fallback.assurance, CLAUDE_FALLBACK_ASSURANCE); assert.equal(prepared.fallback.freshContext, true);
    assert.equal(JSON.parse(readFileSync(join(repo.control, repo.prepared.packet.packetId, "export-fallback.json"), "utf8")).pipelineDecision, "authorized");
    const result = acceptClaudeFallback(prepared, { schema: "pipeline.claude-functional-fallback-return.v1", packetId: prepared.packet.packetId, packetDigest: prepared.packetDigest, assurance: CLAUDE_FALLBACK_ASSURANCE, freshContext: true, delegated: false, verdict: verdict() });
    const finalized = finalizeClaudePacketReview({ controlRoot: repo.control, prepared, result }, { now: new Date("2026-07-18T12:02:00.000Z") });
    assert.equal(finalized.code, "CLH-CONSUMED"); assert.equal(finalized.receipt.assurance, CLAUDE_FALLBACK_ASSURANCE);
  } finally { rmSync(repo.root, { recursive: true, force: true }); rmSync(f.root, { recursive: true, force: true }); }
});

check("keeps a successful native result in the stronger native class", () => {
  const repo = repository(); const f = files();
  try {
    const spawnFn = () => ({ status: 0, stdout: stream(), stderr: "" });
    const prepared = prepareClaudePacketReview({ controlRoot: repo.control, packetId: repo.prepared.packet.packetId, adapter: "claude-host", claimantNonce: "c".repeat(64), executablePath: f.executable, contractPath: f.contract, schemaPath: f.schema, neutralCwd: f.root }, { spawnFn, now: new Date("2026-07-18T12:01:00.000Z") });
    assert.equal(JSON.parse(readFileSync(join(repo.control, repo.prepared.packet.packetId, "export-native.json"), "utf8")).assuranceClass, CLAUDE_NATIVE_ASSURANCE);
    const result = executeClaudeNative(prepared, { spawnFn, now: new Date("2026-07-18T12:01:30.000Z") }); assert.equal(result.assurance, CLAUDE_NATIVE_ASSURANCE);
    const finalized = finalizeClaudePacketReview({ controlRoot: repo.control, prepared, result }, { now: new Date("2026-07-18T12:02:00.000Z") });
    assert.equal(finalized.receipt.assurance, CLAUDE_NATIVE_ASSURANCE);
  } finally { rmSync(repo.root, { recursive: true, force: true }); rmSync(f.root, { recursive: true, force: true }); }
});

check("reauthorizes a late native pre-verdict failure before exposing the weak fallback", () => {
  const repo = repository(); const f = files();
  try {
    const prepared = prepareClaudePacketReview({ controlRoot: repo.control, packetId: repo.prepared.packet.packetId, adapter: "claude-host", claimantNonce: "d".repeat(64), executablePath: f.executable, contractPath: f.contract, schemaPath: f.schema, neutralCwd: f.root }, { spawnFn: () => ({ status: 0, stdout: stream(), stderr: "" }), now: new Date("2026-07-18T12:01:00.000Z") });
    const result = executeClaudeNative(prepared, { spawnFn: () => ({ status: null, stdout: "", stderr: "", error: { code: "EIO", message: "fixture" } }), now: new Date("2026-07-18T12:01:30.000Z"), exportNow: new Date("2026-07-18T12:01:30.000Z") });
    assert.equal(result.mode, "fallback-required");
    assert.match(result.fallback.exportAuthorizationSha256, /^[a-f0-9]{64}$/u);
    assert.equal(JSON.parse(readFileSync(join(repo.control, repo.prepared.packet.packetId, "export-fallback.json"), "utf8")).assuranceClass, CLAUDE_FALLBACK_ASSURANCE);
  } finally { rmSync(repo.root, { recursive: true, force: true }); rmSync(f.root, { recursive: true, force: true }); }
});

check("rejects a result whose export digest is not the persisted authorization", () => {
  const repo = repository(); const f = files();
  try {
    const spawnFn = () => ({ status: 0, stdout: stream(), stderr: "" });
    const prepared = prepareClaudePacketReview({ controlRoot: repo.control, packetId: repo.prepared.packet.packetId, adapter: "claude-host", claimantNonce: "e".repeat(64), executablePath: f.executable, contractPath: f.contract, schemaPath: f.schema, neutralCwd: f.root }, { spawnFn, now: new Date("2026-07-18T12:01:00.000Z") });
    const result = { ...executeClaudeNative(prepared, { spawnFn, now: new Date("2026-07-18T12:01:30.000Z") }), exportAuthorizationSha256: "0".repeat(64) };
    assert.throws(() => finalizeClaudePacketReview({ controlRoot: repo.control, prepared, result }, { now: new Date("2026-07-18T12:02:00.000Z") }), (error) => error instanceof Error && error.code === "CLH-EXPORT");
  } finally { rmSync(repo.root, { recursive: true, force: true }); rmSync(f.root, { recursive: true, force: true }); }
});

check("blocks an expired packet immediately before native provider handoff", () => {
  const repo = repository(); const f = files();
  try {
    let calls = 0;
    const spawnFn = () => { calls += 1; return { status: 0, stdout: stream(), stderr: "" }; };
    const prepared = prepareClaudePacketReview({ controlRoot: repo.control, packetId: repo.prepared.packet.packetId, adapter: "claude-host", claimantNonce: "1".repeat(64), executablePath: f.executable, contractPath: f.contract, schemaPath: f.schema, neutralCwd: f.root }, { spawnFn, now: new Date("2026-07-18T12:01:00.000Z") });
    assert.equal(calls, 1);
    assert.throws(() => executeClaudeNative(prepared, { spawnFn, now: new Date("2026-07-18T12:15:00.001Z") }), (error) => error instanceof Error && error.code === "CPP-EXPIRED");
    assert.equal(calls, 1);
  } finally { rmSync(repo.root, { recursive: true, force: true }); rmSync(f.root, { recursive: true, force: true }); }
});

check("blocks prepared prompt drift immediately before native provider handoff", () => {
  const repo = repository(); const f = files();
  try {
    let calls = 0;
    const spawnFn = () => { calls += 1; return { status: 0, stdout: stream(), stderr: "" }; };
    const prepared = prepareClaudePacketReview({ controlRoot: repo.control, packetId: repo.prepared.packet.packetId, adapter: "claude-host", claimantNonce: "4".repeat(64), executablePath: f.executable, contractPath: f.contract, schemaPath: f.schema, neutralCwd: f.root }, { spawnFn, now: new Date("2026-07-18T12:01:00.000Z") });
    prepared.prompt = `${prepared.prompt}\nunauthorized widening`;
    assert.throws(() => executeClaudeNative(prepared, { spawnFn, now: new Date("2026-07-18T12:01:30.000Z") }), (error) => error instanceof Error && error.code === "CLH-PROMPT");
    assert.equal(calls, 1);
  } finally { rmSync(repo.root, { recursive: true, force: true }); rmSync(f.root, { recursive: true, force: true }); }
});

check("blocks candidate snapshot drift immediately before native provider handoff", () => {
  const repo = repository(); const f = files();
  try {
    let calls = 0;
    const spawnFn = () => { calls += 1; return { status: 0, stdout: stream(), stderr: "" }; };
    const prepared = prepareClaudePacketReview({ controlRoot: repo.control, packetId: repo.prepared.packet.packetId, adapter: "claude-host", claimantNonce: "2".repeat(64), executablePath: f.executable, contractPath: f.contract, schemaPath: f.schema, neutralCwd: f.root }, { spawnFn, now: new Date("2026-07-18T12:01:00.000Z") });
    writeFileSync(join(prepared.packet.checkout.realPath, "specs", "work.md"), "drifted after preparation\n");
    assert.throws(() => executeClaudeNative(prepared, { spawnFn, now: new Date("2026-07-18T12:01:30.000Z") }), (error) => error instanceof Error && error.code === "CPP-TREE");
    assert.equal(calls, 1);
  } finally { rmSync(repo.root, { recursive: true, force: true }); rmSync(f.root, { recursive: true, force: true }); }
});

check("blocks persisted export-authorization drift immediately before native provider handoff", () => {
  const repo = repository(); const f = files();
  try {
    let calls = 0;
    const spawnFn = () => { calls += 1; return { status: 0, stdout: stream(), stderr: "" }; };
    const prepared = prepareClaudePacketReview({ controlRoot: repo.control, packetId: repo.prepared.packet.packetId, adapter: "claude-host", claimantNonce: "3".repeat(64), executablePath: f.executable, contractPath: f.contract, schemaPath: f.schema, neutralCwd: f.root }, { spawnFn, now: new Date("2026-07-18T12:01:00.000Z") });
    const exportPath = join(repo.control, repo.prepared.packet.packetId, "export-native.json");
    const authorization = JSON.parse(readFileSync(exportPath, "utf8"));
    writeFileSync(exportPath, `${JSON.stringify({ ...authorization, packetSha256: "0".repeat(64) }, null, 2)}\n`);
    assert.throws(() => executeClaudeNative(prepared, { spawnFn, now: new Date("2026-07-18T12:01:30.000Z") }), (error) => error instanceof Error && error.code === "CPP-EXPORT");
    assert.equal(calls, 1);
  } finally { rmSync(repo.root, { recursive: true, force: true }); rmSync(f.root, { recursive: true, force: true }); }
});

check("closes the late fallback dispatch over runner, references and reason", () => {
  const repo = repository(); const f = files();
  try {
    const prepared = prepareClaudePacketReview({ controlRoot: repo.control, packetId: repo.prepared.packet.packetId, adapter: "claude-host", claimantNonce: "f".repeat(64), executablePath: f.executable, contractPath: f.contract, schemaPath: f.schema, neutralCwd: f.root }, { spawnFn: () => ({ status: 0, stdout: stream(), stderr: "" }), now: new Date("2026-07-18T12:01:00.000Z") });
    const fallbackRequired = executeClaudeNative(prepared, { spawnFn: () => ({ status: null, stdout: "", stderr: "", error: { code: "EIO", message: "fixture" } }), now: new Date("2026-07-18T12:01:30.000Z"), exportNow: new Date("2026-07-18T12:01:30.000Z") });
    const hostReturn = { schema: "pipeline.claude-functional-fallback-return.v1", packetId: prepared.packet.packetId, packetDigest: prepared.packetDigest, assurance: CLAUDE_FALLBACK_ASSURANCE, freshContext: true, delegated: false, verdict: verdict(), dispatch: fallbackRequired.fallback };
    assert.equal(acceptClaudeFallback(prepared, hostReturn).assurance, CLAUDE_FALLBACK_ASSURANCE);
    for (const dispatch of [
      { ...fallbackRequired.fallback, runner: "codex" },
      { ...fallbackRequired.fallback, references: [] },
      { ...fallbackRequired.fallback, reasonCode: "CLH-UNREGISTERED" },
    ]) assert.throws(() => acceptClaudeFallback(prepared, { ...hostReturn, dispatch }), (error) => error instanceof Error && error.code === "CLH-FALLBACK");
  } finally { rmSync(repo.root, { recursive: true, force: true }); rmSync(f.root, { recursive: true, force: true }); }
});

process.stdout.write(`${passed}/12 checks passed.\n`);
