// SPDX-License-Identifier: SUL-1.0
/** Private runner-hook correlation state for native Goldfish host commits. */
import { createHash } from "node:crypto";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { closeSync, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync,
  openSync, readFileSync, readdirSync, realpathSync, unlinkSync, writeSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseStrictJson } from "./governance-event.mjs";
import { captureAgyHostCommitBaseline, agyHostGitEnvironment } from "./agy-host-commit-admission.mjs";
import { resolveGitCommonDir } from "./po-key-directory.mjs";
import { parseNativeGoldfishBriefing } from "./native-goldfish-host-return.mjs";

export const NATIVE_GOLDFISH_HOST_STATE_SCHEMA = "pipeline.native-goldfish-host-state.v1";
export const NATIVE_GOLDFISH_CODEX_START_BINDING_TTL_MS = 120_000;
const RUNNERS = new Set(["claude", "codex"]);
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SHA = /^[a-f0-9]{64}$/u;
const OID = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
const MAX_BYTES = 128 * 1024;
const SUBDIRS = ["agent-pipeline", "run", "native-goldfish-host-commit"];

function fail(code) { return { ok: false, code }; }
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function exact(value, keys) { return value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join(",") === [...keys].sort().join(","); }
function safeRunner(value) { return RUNNERS.has(value); }
function safeCorrelation(value) { return typeof value === "string" && value.length > 0 && value.length <= 512; }
function key(kind, runner, value) { return `${kind}-${runner}-${digest(value)}.json`; }

function privateDirectory(commonDir, create) {
  if (typeof commonDir !== "string" || !commonDir.startsWith("/")) throw new Error("NGHS-ROOT");
  let path = resolve(commonDir);
  const root = lstatSync(path);
  if (!root.isDirectory() || root.isSymbolicLink() || realpathSync(path) !== path) throw new Error("NGHS-ROOT");
  for (const component of SUBDIRS) {
    path = join(path, component);
    if (create) {
      try { mkdirSync(path, { mode: 0o700 }); }
      catch (error) { if (error?.code !== "EEXIST") throw error; }
    }
    const entry = lstatSync(path);
    if (!entry.isDirectory() || entry.isSymbolicLink() || realpathSync(path) !== path) throw new Error("NGHS-DIRECTORY");
  }
  return path;
}

function writeExclusive(commonDir, name, value) {
  const path = privateDirectory(commonDir, true);
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  if (bytes.length > MAX_BYTES) throw new Error("NGHS-SIZE");
  const temp = `.${name}.${randomBytes(16).toString("hex")}.tmp`;
  let tempFd; let targetFd;
  try {
    tempFd = openSync(join(path, temp), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
      | (constants.O_NOFOLLOW ?? 0), 0o600);
    let offset = 0;
    while (offset < bytes.length) {
      const written = writeSync(tempFd, bytes, offset, bytes.length - offset, offset);
      if (!Number.isSafeInteger(written) || written <= 0) throw new Error("NGHS-WRITE");
      offset += written;
    }
    fsyncSync(tempFd);
    const source = fstatSync(tempFd);
    linkSync(join(path, temp), join(path, name));
    targetFd = openSync(join(path, name), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const published = fstatSync(targetFd);
    if (source.dev !== published.dev || source.ino !== published.ino || published.size !== bytes.length) throw new Error("NGHS-PUBLISH");
    const readback = readFileSync(targetFd);
    const after = fstatSync(targetFd);
    const target = lstatSync(join(path, name));
    if (after.dev !== published.dev || after.ino !== published.ino || after.size !== published.size
      || after.mtimeMs !== published.mtimeMs || target.isSymbolicLink()
      || target.dev !== published.dev || target.ino !== published.ino || !readback.equals(bytes)) throw new Error("NGHS-READBACK");
    return { ok: true, code: "NGHS-STORED", sha256: digest(bytes), path: join(...SUBDIRS, name) };
  } finally {
    if (tempFd !== undefined) closeSync(tempFd);
    if (targetFd !== undefined) closeSync(targetFd);
    try { unlinkSync(join(path, temp)); } catch {}
  }
}

function readPrivate(commonDir, name) {
  const path = privateDirectory(commonDir, false);
  const target = join(path, name);
  const before = lstatSync(target);
  if (!before.isFile() || before.isSymbolicLink() || before.size < 1 || before.size > MAX_BYTES) throw new Error("NGHS-TARGET");
  const fd = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(fd);
    if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) throw new Error("NGHS-RACE");
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size
      || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs || bytes.length !== opened.size) throw new Error("NGHS-RACE");
    const value = parseStrictJson(bytes);
    return { value, bytes, sha256: digest(bytes) };
  } finally { closeSync(fd); }
}

function git(root, args) {
  const run = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8", shell: false, timeout: 10_000, maxBuffer: 1024 * 1024,
    env: agyHostGitEnvironment(),
  });
  return run.error || run.status !== 0 ? null : run.stdout.trim();
}

function toolFields(runner, input) {
  const tool = input?.tool_input ?? {};
  if (runner === "claude") {
    if (!["Agent", "Task"].includes(input?.tool_name)) return null;
    const role = tool.subagent_type ?? tool.subagentType ?? "";
    const prompt = tool.prompt;
    return { correlation: input.tool_use_id, sessionId: input.session_id, role, prompt,
      runInBackground: tool.run_in_background };
  }
  if (input?.tool_name !== "spawn_agent") return null;
  const role = tool.agent_type ?? tool.agentType ?? "default";
  const prompt = tool.message ?? tool.prompt;
  return { correlation: input.tool_use_id, sessionId: input.session_id, role, prompt };
}

/** Capture a closed pre-launch binding; unmarked dispatches are intentionally untouched. */
export function prepareNativeGoldfishHostState({ root, runner, input } = {}, dependencies = {}) {
  if (!safeRunner(runner)) return fail("NGHS-RUNNER");
  const fields = toolFields(runner, input);
  if (!fields || !safeCorrelation(fields.correlation) || !ID.test(fields.sessionId ?? "")) return { ok: true, code: "NGHS-NOT-APPLICABLE" };
  const hostMarkers = ["<!-- pipeline-native-goldfish-host-commit:v1", "<!-- pipeline-native-goldfish-host-commit:v2"];
  if (typeof fields.prompt !== "string" || !hostMarkers.some((marker) => fields.prompt.includes(marker))) return { ok: true, code: "NGHS-NOT-APPLICABLE" };
  const parsed = parseNativeGoldfishBriefing(fields.prompt);
  if (!parsed.ok) return fail(parsed.code);
  if (runner === "claude" && fields.runInBackground !== false) return fail("NGHS-CLAUDE-FOREGROUND-REQUIRED");
  const binding = parsed.binding;
  if (binding.runner !== runner) return fail("NGHS-RUNNER-MISMATCH");
  const role = fields.role.startsWith("pipeline-core:") ? fields.role : `pipeline-core:${fields.role}`;
  const nativeTypeMatches = binding.adapterVersion === 2 && runner === "codex"
    ? fields.role === binding.nativeAgentType : role === binding.role;
  if (!nativeTypeMatches) return fail("NGHS-ROLE-MISMATCH");
  const physicalRoot = realpathSync(resolve(root ?? input.cwd ?? process.cwd()));
  const readGit = dependencies.git ?? git;
  const head = readGit(physicalRoot, ["rev-parse", "--verify", "HEAD^{commit}"]);
  const tree = readGit(physicalRoot, ["rev-parse", "--verify", "HEAD^{tree}"]);
  if (head !== binding.candidateCommit || tree !== binding.candidateTree) return fail("NGHS-CANDIDATE-MISMATCH");
  const resultPath = `scratch/.native-host-return-${binding.dispatchId}.json`;
  const captured = (dependencies.captureBaseline ?? captureAgyHostCommitBaseline)({ root: physicalRoot,
    candidateCommit: head, resultPath });
  if (!captured?.ok) return fail(captured?.code ?? "NGHS-BASELINE");
  const commonDir = (dependencies.resolveCommonDir ?? resolveGitCommonDir)(physicalRoot);
  if (typeof commonDir !== "string") return fail("NGHS-COMMON-DIR");
  const state = {
    schema: NATIVE_GOLDFISH_HOST_STATE_SCHEMA, runner, sessionId: fields.sessionId,
    toolUseId: fields.correlation, agentId: null, role: binding.role,
    binding, root: physicalRoot, commonDir, resultPath, baseline: captured.baseline,
    createdAtMs: (dependencies.nowEpochMs ?? Date.now)(),
  };
  const stored = writeExclusive(commonDir, key("pending", runner, `${fields.sessionId}\0${fields.correlation}`), state);
  return stored.ok ? { ...stored, runner, dispatchId: binding.dispatchId } : stored;
}

/** Codex's SubagentStart lacks tool_use_id: permit only one exact waiting native dispatch. */
export function bindNativeCodexStart({ commonDir, input, nowEpochMs = Date.now() } = {}) {
  if (!ID.test(input?.session_id ?? "") || !ID.test(input?.agent_id ?? "")
    || input?.hook_event_name !== "SubagentStart" || !Number.isSafeInteger(nowEpochMs) || nowEpochMs < 0) return fail("NGHS-CODEX-START-INPUT");
  const dir = privateDirectory(commonDir, false);
  const observedAgentType = typeof input.agent_type === "string" ? input.agent_type : "";
  const expectedRole = observedAgentType.replace(/^pipeline-core:/u, "");
  const expectedModel = typeof input.model === "string" ? input.model : "";
  const claimedPendingFiles = new Set();
  for (const filename of readdirSync(dir)) {
    if (!filename.startsWith("agent-codex-") || !filename.endsWith(".json")) continue;
    try {
      const { value } = readPrivate(commonDir, filename);
      if (exact(value, ["schema", "runner", "sessionId", "agentId", "pendingFile", "pendingSha256", "agentType", "createdAtMs"])
        && value.schema === "pipeline.native-goldfish-host-agent-binding.v1"
        && value.runner === "codex" && value.sessionId === input.session_id
        && ID.test(value.agentId ?? "") && SHA.test(value.pendingSha256 ?? "")
        && typeof value.pendingFile === "string" && value.pendingFile.startsWith("pending-codex-")
        && value.pendingFile.endsWith(".json")) claimedPendingFiles.add(value.pendingFile);
    } catch { /* unreadable private association cannot claim a pending dispatch */ }
  }
  const candidates = [];
  for (const filename of readdirSync(dir)) {
    if (!filename.startsWith("pending-codex-") || !filename.endsWith(".json")) continue;
    if (claimedPendingFiles.has(filename)) continue;
    try {
      const { value } = readPrivate(commonDir, filename);
      if (value.schema === NATIVE_GOLDFISH_HOST_STATE_SCHEMA && value.runner === "codex"
        && value.sessionId === input.session_id
        && (value.binding.adapterVersion === 2 ? value.binding.nativeAgentType === observedAgentType : value.binding.agentType === expectedRole)
        && value.binding.model === expectedModel && value.agentId === null
        && Number.isSafeInteger(value.createdAtMs) && nowEpochMs >= value.createdAtMs
        && nowEpochMs - value.createdAtMs <= NATIVE_GOLDFISH_CODEX_START_BINDING_TTL_MS) {
        candidates.push({ filename, value });
      }
    } catch { /* corrupt private evidence is never a match */ }
  }
  if (candidates.length !== 1) return fail(candidates.length === 0 ? "NGHS-CODEX-START-UNBOUND" : "NGHS-CODEX-START-AMBIGUOUS");
  const pending = candidates[0];
  const association = { schema: "pipeline.native-goldfish-host-agent-binding.v1", runner: "codex",
    sessionId: input.session_id, agentId: input.agent_id,
    pendingFile: pending.filename, pendingSha256: digest(Buffer.from(`${JSON.stringify(pending.value, null, 2)}\n`, "utf8")),
    agentType: pending.value.binding?.adapterVersion === 2 ? observedAgentType : expectedRole, createdAtMs: nowEpochMs };
  try { return writeExclusive(commonDir, key("agent", "codex", `${input.session_id}\0${input.agent_id}`), association); }
  catch { return fail("NGHS-CODEX-ASSOCIATION-WRITE"); }
}

/** Read the pending Claude or Codex dispatch selected by the exact stop event. */
export function readNativeGoldfishPending({ commonDir, runner, sessionId, correlationId } = {}) {
  if (!safeRunner(runner) || !ID.test(sessionId ?? "") || !safeCorrelation(correlationId)) return fail("NGHS-READ-INPUT");
  try {
    const stored = readPrivate(commonDir, key("pending", runner, `${sessionId}\0${correlationId}`));
    const state = stored.value;
    if (state.schema !== NATIVE_GOLDFISH_HOST_STATE_SCHEMA || state.runner !== runner
      || state.sessionId !== sessionId || state.toolUseId !== correlationId
      || !state.binding || !OID.test(state.binding.candidateCommit ?? "")) return fail("NGHS-READ-BINDING");
    return { ok: true, code: "NGHS-PENDING-READ", state, sha256: stored.sha256 };
  } catch { return fail("NGHS-PENDING-MISSING"); }
}

/** Resolve Codex's SubagentStop only through its write-once agent-start binding. */
export function readNativeCodexPending({ commonDir, input } = {}) {
  if (input?.hook_event_name !== "SubagentStop" || !ID.test(input?.session_id ?? "")
    || !ID.test(input?.agent_id ?? "")) return fail("NGHS-CODEX-READ-INPUT");
  try {
    const association = readPrivate(commonDir, key("agent", "codex", `${input.session_id}\0${input.agent_id}`)).value;
    if (!exact(association, ["schema", "runner", "sessionId", "agentId", "pendingFile", "pendingSha256", "agentType", "createdAtMs"])
      || association.schema !== "pipeline.native-goldfish-host-agent-binding.v1"
      || association.runner !== "codex" || association.sessionId !== input.session_id
      || association.agentId !== input.agent_id || !SHA.test(association.pendingSha256 ?? "")) return fail("NGHS-CODEX-ASSOCIATION");
    const pending = readPrivate(commonDir, association.pendingFile);
    if (pending.sha256 !== association.pendingSha256 || pending.value.schema !== NATIVE_GOLDFISH_HOST_STATE_SCHEMA
      || pending.value.runner !== "codex" || pending.value.sessionId !== input.session_id
      || (pending.value.binding?.adapterVersion === 2
        ? pending.value.binding?.nativeAgentType !== association.agentType
        : pending.value.binding?.agentType !== association.agentType.replace(/^pipeline-core:/u, ""))) return fail("NGHS-CODEX-PENDING-BINDING");
    return { ok: true, code: "NGHS-CODEX-PENDING-READ", state: { ...pending.value, agentId: input.agent_id }, sha256: pending.sha256 };
  } catch { return fail("NGHS-CODEX-PENDING-MISSING"); }
}

export const nativeGoldfishHostStateInternals = Object.freeze({ key, privateDirectory, readPrivate, writeExclusive, toolFields, git });
