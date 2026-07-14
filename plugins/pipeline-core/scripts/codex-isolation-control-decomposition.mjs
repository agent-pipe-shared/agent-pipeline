/**
 * Control-decomposed Phase-2 Codex isolation acceptance.
 *
 * The native sandbox probe does not involve a model.  The separately bound
 * final critic receives its review bundle on stdin and fails closed on any
 * observed tool item.  Returned evidence contains hashes and categories only.
 */
import { spawn as nodeSpawn, execFileSync as nodeExecFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateAgainstSchema } from "../lib/schema-lite.mjs";
import { buildCodexCriticInvocation, buildExactFixture, CODEX_CRITIC_POLICY } from "./codex-critic-isolation.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SCHEMA = path.join(SCRIPT_DIR, "critic-verdict.schema.json");
const MAX_RESULT_BYTES = 64 * 1024;
const MAX_STREAM_BYTES = 256 * 1024;
const DEFAULT_LEASE_MS = 120_000;
const PROBE_SCHEMA = "pipeline.codex-native-sandbox-probe.v1";
const CONTROL_POLICY = Object.freeze({
  schema: "pipeline.codex-isolation-control-decomposition.v1",
  nativeProbeProfile: ":read-only",
  criticSandbox: "read-only",
  approval: "never",
  leaseMs: DEFAULT_LEASE_MS,
  mechanism: "codex-provided-sandbox.v1",
});

function fail(message) { throw new Error(message); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function fullSha(value) { return typeof value === "string" && /^[0-9a-f]{40}$/u.test(value); }
function absolute(value, label) { if (!path.isAbsolute(value)) fail(`${label} must be absolute`); }
function deniedError(error) { return ["EACCES", "EPERM", "EROFS"].includes(error?.code) ? "permission-denied" : "other-error"; }

function bounded(target, chunk) {
  const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  if (target.bytes >= MAX_STREAM_BYTES) return;
  const slice = bytes.subarray(0, MAX_STREAM_BYTES - target.bytes);
  target.bytes += slice.length;
  target.parts.push(slice);
}

function localDiagnostic(stdout, stderr) {
  const text = (value) => Buffer.concat(value.parts).toString("utf8");
  const tail = (value) => text(value).slice(-2_000);
  return Object.freeze({
    stdoutBytes: stdout.bytes, stderrBytes: stderr.bytes,
    stdoutSha256: sha256(text(stdout)), stderrSha256: sha256(text(stderr)),
    stdoutTail: tail(stdout), stderrTail: tail(stderr),
  });
}

async function executable(candidate) {
  try { await access(candidate, constants.X_OK); return true; } catch { return false; }
}

/** Resolve and pin the binary actually placed on PATH without invoking a shell. */
export async function resolveCodexBinary({ pathEnv = process.env.PATH, platform = process.platform } = {}) {
  if (typeof pathEnv !== "string" || !pathEnv) fail("PATH is required to resolve Codex");
  const names = platform === "win32" ? ["codex.exe", "codex.cmd", "codex"] : ["codex"];
  for (const directory of pathEnv.split(path.delimiter)) {
    if (!directory) continue;
    for (const name of names) {
      const candidate = path.join(directory, name);
      if (await executable(candidate)) return realpath(candidate);
    }
  }
  fail("Codex binary is unavailable on PATH");
}

export function inspectCodexBinary({ codexBinary, execFileSync = nodeExecFileSync } = {}) {
  absolute(codexBinary, "codexBinary");
  let version;
  try { version = execFileSync(codexBinary, ["--version"], { encoding: "utf8", shell: false, stdio: ["ignore", "pipe", "pipe"] }).trim(); }
  catch { fail("Codex binary version inspection failed"); }
  if (!/^codex-cli\s+\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/u.test(version)) fail("Codex binary version is not recognized");
  return Object.freeze({ pathSha256: sha256(codexBinary), binarySha256: null, version, versionSha256: sha256(version) });
}

/**
 * Pin the two documented surfaces to one executable before a live probe.  This
 * is deliberately narrow: it proves the invoked binary advertises a native
 * Codex sandbox and that its exec mode exposes the read-only sandbox policy;
 * it does not infer host, network, or credential isolation.
 */
export function verifySandboxCongruence({ codexBinary, execFileSync = nodeExecFileSync } = {}) {
  absolute(codexBinary, "codexBinary");
  let sandboxHelp; let execHelp;
  try {
    sandboxHelp = execFileSync(codexBinary, ["sandbox", "--help"], { encoding: "utf8", shell: false, stdio: ["ignore", "pipe", "pipe"] });
    execHelp = execFileSync(codexBinary, ["exec", "--help"], { encoding: "utf8", shell: false, stdio: ["ignore", "pipe", "pipe"] });
  } catch { fail("Codex sandbox contract inspection failed"); }
  if (!/Run commands within a Codex-provided sandbox/u.test(sandboxHelp)) fail("Codex native sandbox contract is unavailable");
  if (!/Select\s+the\s+sandbox\s+policy\s+to\s+use\s+when\s+executing\s+model-generated\s+shell\s+commands/u.test(execHelp) || !/read-only/u.test(execHelp)) fail("Codex exec read-only sandbox contract is unavailable");
  return Object.freeze({ contractSha256: sha256(JSON.stringify({ sandbox: "codex-provided", exec: "read-only" })) });
}

async function completeCodexBinaryInspection(input) {
  const staticInfo = inspectCodexBinary(input);
  const info = await stat(input.codexBinary);
  if (!info.isFile()) fail("Codex binary is not a regular file");
  return Object.freeze({ ...staticInfo, binarySha256: sha256(await readFile(input.codexBinary)) });
}

export function buildNativeProbeProgram() {
  return [
    'import { writeFile } from "node:fs/promises";',
    'const [fixtureCanary, externalCanary] = process.argv.slice(-2);',
    'const normalize = (error) => ["EACCES", "EPERM", "EROFS"].includes(error?.code) ? "permission-denied" : "other-error";',
    'const attempt = async (category, target) => { try { await writeFile(target, "native-probe-write\\n", { flag: "w" }); return { category, outcome: "unexpected-success", errorCategory: null }; } catch (error) { return { category, outcome: "denied", errorCategory: normalize(error) }; } };',
    'const writes = await Promise.all([attempt("fixture-canary", fixtureCanary), attempt("external-canary", externalCanary)]);',
    `process.stdout.write(JSON.stringify({ schema: ${JSON.stringify(PROBE_SCHEMA)}, writes }) + "\\n");`,
  ].join("\n");
}

function parseProbeResult(stdout) {
  const lines = stdout.toString("utf8").split(/\r?\n/u).filter(Boolean);
  if (lines.length !== 1) return null;
  try {
    const value = JSON.parse(lines[0]);
    if (value?.schema !== PROBE_SCHEMA || !Array.isArray(value.writes) || value.writes.length !== 2) return null;
    const expected = ["fixture-canary", "external-canary"];
    for (let index = 0; index < expected.length; index += 1) {
      const item = value.writes[index];
      if (item?.category !== expected[index] || item.outcome !== "denied" || item.errorCategory !== "permission-denied") return null;
    }
    return Object.freeze({ writes: value.writes.map((item) => ({ category: item.category, outcome: item.outcome, errorCategory: item.errorCategory })) });
  } catch { return null; }
}

function invocationHash(command, args) { return sha256(JSON.stringify({ command, args })); }

async function awaitChild(child, { leaseMs, onHeartbeat, label }) {
  const stdout = { bytes: 0, parts: [] }; const stderr = { bytes: 0, parts: [] };
  child.stdout?.on("data", (chunk) => bounded(stdout, chunk));
  child.stderr?.on("data", (chunk) => bounded(stderr, chunk));
  const started = Date.now(); let timedOut = false; let terminal = null;
  const outcome = await new Promise((resolve) => {
    const timer = setTimeout(() => { timedOut = true; try { child.kill("SIGTERM"); } catch {} }, leaseMs);
    const heartbeat = setInterval(() => { try { onHeartbeat({ label, elapsedMs: Date.now() - started, stdoutBytes: stdout.bytes, stderrBytes: stderr.bytes }); } catch {} }, 5_000);
    const settle = (value) => { clearTimeout(timer); clearInterval(heartbeat); resolve(value); };
    child.once("error", () => settle({ code: null, signal: null, error: "process-error" }));
    child.once("exit", (code, signal) => settle({ code, signal, error: null }));
  });
  terminal = outcome;
  return Object.freeze({ terminal, timedOut, stdout: Buffer.concat(stdout.parts), stderr: Buffer.concat(stderr.parts), diagnostics: localDiagnostic(stdout, stderr) });
}

async function hashes(...files) {
  return Promise.all(files.map(async (file) => { const bytes = await readFile(file); return Object.freeze({ sha256: sha256(bytes), bytes: bytes.length }); }));
}

export async function runNativeSandboxProbe({ codexBinary, fixtureRoot, leaseMs = DEFAULT_LEASE_MS, spawn = nodeSpawn, onHeartbeat = () => {} } = {}) {
  absolute(codexBinary, "codexBinary"); absolute(fixtureRoot, "fixtureRoot");
  if (!Number.isInteger(leaseMs) || leaseMs < 1_000 || leaseMs > 900_000) fail("leaseMs is out of range");
  const coordinator = await mkdtemp(path.join(os.tmpdir(), "agent-pipeline-native-probe-"));
  const fixtureCanary = path.join(fixtureRoot, "native-probe-fixture-canary.txt");
  const externalCanary = path.join(coordinator, "native-probe-external-canary.txt");
  const program = buildNativeProbeProgram();
  await writeFile(fixtureCanary, "fixture-canary-before\n", { mode: 0o600 });
  await writeFile(externalCanary, "external-canary-before\n", { mode: 0o600 });
  const before = await hashes(fixtureCanary, externalCanary);
  // Keep the coordinator source in argv rather than a coordinator-only file:
  // :read-only may legitimately hide that temporary directory from the child.
  const args = ["sandbox", "-P", CONTROL_POLICY.nativeProbeProfile, "--", process.execPath, "-e", program, fixtureCanary, externalCanary];
  const invocationSha256 = invocationHash(codexBinary, args);
  let child;
  try { child = spawn(codexBinary, args, { cwd: fixtureRoot, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }); }
  catch { await rm(coordinator, { recursive: true, force: true }); await rm(fixtureCanary, { force: true }); return Object.freeze({ ok: false, category: "spawn-failed", invocationSha256, probeProgramSha256: sha256(program), cleanup: true }); }
  const execution = await awaitChild(child, { leaseMs, onHeartbeat, label: "native-sandbox-probe" });
  const after = await hashes(fixtureCanary, externalCanary);
  const result = execution.terminal.code === 0 && !execution.timedOut ? parseProbeResult(execution.stdout) : null;
  await rm(fixtureCanary, { force: true });
  await rm(coordinator, { recursive: true, force: true });
  const unchanged = before.every((value, index) => value.sha256 === after[index].sha256 && value.bytes === after[index].bytes);
  const ok = result !== null && unchanged;
  return Object.freeze({
    ok,
    category: ok ? "pass" : execution.timedOut ? "lease-timeout" : execution.terminal.code === 0 ? "invalid-probe-result" : "probe-process-failed",
    invocationSha256, probeProgramSha256: sha256(program),
    process: { exitCode: execution.terminal.code, signal: execution.terminal.signal, timedOut: execution.timedOut, error: execution.terminal.error },
    writes: result?.writes ?? null,
    canaries: { fixtureUnchanged: before[0].sha256 === after[0].sha256 && before[0].bytes === after[0].bytes, externalUnchanged: before[1].sha256 === after[1].sha256 && before[1].bytes === after[1].bytes },
    cleanup: true,
    diagnostics: execution.diagnostics,
  });
}

function reviewBundle(fixture) {
  return JSON.stringify({
    schema: "pipeline.codex-critic-review-bundle.v1",
    fixtureManifestSha256: fixture.manifestHash,
    candidateCommit: fixture.manifest.candidateCommit,
    candidateTree: fixture.manifest.tree,
    artifacts: fixture.manifest.artifacts,
  });
}

function toolFreeJsonl(stdout) {
  const lines = stdout.toString("utf8").split(/\r?\n/u).filter(Boolean);
  if (lines.length === 0) return false;
  const lifecycle = new Set(["thread.started", "thread.completed", "turn.started", "turn.completed"]);
  for (const line of lines) {
    let event; try { event = JSON.parse(line); } catch { return false; }
    if (lifecycle.has(event?.type)) continue;
    if ((event?.type === "item.started" || event?.type === "item.completed") && ["reasoning", "agent_message"].includes(event?.item?.type)) continue;
    return false;
  }
  return true;
}

export async function runToollessFinalCritic({ fixture, codexBinary, schemaPath = DEFAULT_SCHEMA, leaseMs = DEFAULT_LEASE_MS, spawn = nodeSpawn, env = process.env, onHeartbeat = () => {} } = {}) {
  if (!fixture?.root || !fixture?.manifest || !fixture.manifestHash) fail("verified fixture is required");
  absolute(codexBinary, "codexBinary"); absolute(schemaPath, "schemaPath");
  const coordinator = await mkdtemp(path.join(os.tmpdir(), "agent-pipeline-tool-free-critic-"));
  const resultPath = path.join(coordinator, "verdict.json");
  const invocation = buildCodexCriticInvocation({ fixtureRoot: fixture.root, schemaPath, resultPath, codexBinary, env });
  let child;
  try { child = spawn(invocation.command, invocation.args, invocation.options); }
  catch { await rm(coordinator, { recursive: true, force: true }); return Object.freeze({ ok: false, category: "spawn-failed", invocationSha256: invocationHash(invocation.command, invocation.args), verdictSha256: null, cleanup: true }); }
  child.stdin?.on("error", () => {});
  child.stdin?.end(`${reviewBundle(fixture)}\nYou are an independent tool-less read-only Codex Critic. Use only this stdin review bundle; do not use tools, files, shell, search, MCP, web, apps, or browsers. Return only the JSON object required by the output schema.\n`, "utf8");
  const execution = await awaitChild(child, { leaseMs, onHeartbeat, label: "tool-less-final-critic" });
  const bytes = await readFile(resultPath).catch(() => null);
  let verdict = null;
  try {
    if (!bytes || bytes.length > MAX_RESULT_BYTES) fail("invalid verdict result");
    verdict = JSON.parse(bytes.toString("utf8"));
    const schema = JSON.parse(await readFile(schemaPath, "utf8"));
    const checked = validateAgainstSchema(verdict, schema);
    if (!checked.valid || verdict.pass !== true || verdict.findings.some((finding) => ["blocker", "major"].includes(finding.severity))) fail("unclean verdict");
  } catch { verdict = null; }
  const streamToolFree = toolFreeJsonl(execution.stdout);
  await rm(coordinator, { recursive: true, force: true });
  const ok = execution.terminal.code === 0 && !execution.timedOut && streamToolFree && verdict !== null;
  return Object.freeze({
    ok, category: ok ? "pass" : execution.timedOut ? "lease-timeout" : streamToolFree ? "invalid-verdict" : "tool-event-or-invalid-stream",
    invocationSha256: invocationHash(invocation.command, invocation.args), verdictSha256: bytes ? sha256(bytes) : null,
    process: { exitCode: execution.terminal.code, signal: execution.terminal.signal, timedOut: execution.timedOut, error: execution.terminal.error },
    stream: { toolFree: streamToolFree }, cleanup: true,
    diagnostics: execution.diagnostics,
  });
}

function publicRun(run) {
  if (!run) return null;
  const { diagnostics, ...safe } = run;
  return safe;
}

export async function runControlDecomposition({ repoRoot, candidateCommit, artifactPaths, schemaPath = DEFAULT_SCHEMA, leaseMs = DEFAULT_LEASE_MS, pathEnv = process.env.PATH, spawn = nodeSpawn, execFileSync = nodeExecFileSync, env = process.env, onHeartbeat = () => {} } = {}) {
  if (!fullSha(candidateCommit)) fail("candidateCommit must be a full SHA");
  const codexBinary = await resolveCodexBinary({ pathEnv });
  const binary = await completeCodexBinaryInspection({ codexBinary, execFileSync });
  const congruence = verifySandboxCongruence({ codexBinary, execFileSync });
  const fixture = await buildExactFixture({ repoRoot, candidateCommit, artifactPaths });
  try {
    const probe = await runNativeSandboxProbe({ codexBinary, fixtureRoot: fixture.root, leaseMs, spawn, onHeartbeat });
    const final = probe.ok ? await runToollessFinalCritic({ fixture, codexBinary, schemaPath, leaseMs, spawn, env, onHeartbeat }) : null;
    const ok = probe.ok && final?.ok === true;
    return Object.freeze({
      ok,
      envelope: {
        schema: CONTROL_POLICY.schema, candidateCommit: fixture.manifest.candidateCommit, candidateTree: fixture.manifest.tree,
        fixtureManifestSha256: fixture.manifestHash, policySha256: sha256(JSON.stringify({ ...CONTROL_POLICY, critic: CODEX_CRITIC_POLICY })),
        sandbox: { mechanism: CONTROL_POLICY.mechanism, nativeProbeProfile: CONTROL_POLICY.nativeProbeProfile, criticSandbox: CONTROL_POLICY.criticSandbox, binarySha256: binary.binarySha256, versionSha256: binary.versionSha256, contractSha256: congruence.contractSha256, sameBinary: true },
        probe: publicRun(probe), final: publicRun(final),
      },
      localDiagnostics: Object.freeze({ probe: probe.diagnostics ?? null, final: final?.diagnostics ?? null }),
      reason: ok ? null : "control-decomposed isolation evidence is incomplete or failed",
    });
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}

export const CONTROL_DECOMPOSITION_POLICY = CONTROL_POLICY;
export { deniedError, parseProbeResult, toolFreeJsonl };
