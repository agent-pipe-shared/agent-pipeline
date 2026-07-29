// SPDX-License-Identifier: SUL-1.0

import { createHash, createHmac, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { parseGuardCommand } from "../hooks/guard-command-grammar.mjs";
import {
  assessWindowsPrivatePath,
  hardenWindowsPrivateDirectory,
} from "./windows-private-state.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9._-]{1,120}$/u;
const REQUEST_SCHEMA = "pipeline.human-guard-override-request.v1";
const PLAN_SCHEMA = "pipeline.human-guard-override-plan.v1";
const CAPABILITY_SCHEMA = "pipeline.human-guard-override-capability.v1";
const AUDIT_SCHEMA = "pipeline.human-guard-override-audit.v1";
const AUDIT_HEAD_SCHEMA = "pipeline.human-guard-override-audit-head.v1";
const MAX_REASON_BYTES = 500;
const DEFAULT_TTL_MS = 5 * 60_000;

export class HumanGuardOverrideError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "HumanGuardOverrideError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new HumanGuardOverrideError(code, message);
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (object(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha(value) {
  return createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value)
    ? value
    : canonical(value)).digest("hex");
}

function exactKeys(value, keys) {
  if (!object(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function git(root, args, spawn = spawnSync) {
  const result = spawn("git", args, { cwd: root, encoding: "utf8", shell: false, timeout: 5000 });
  if (result?.status !== 0 || result?.error) fail("HGO-GIT", "repository identity is unavailable");
  return String(result.stdout ?? "").trim();
}

function physicalRoot(root) {
  const physical = realpathSync(resolve(root));
  const info = lstatSync(physical);
  if (!info.isDirectory() || info.isSymbolicLink()) fail("HGO-ROOT", "repository root is not physical");
  return physical;
}

function topology(root, spawn = spawnSync) {
  const physical = physicalRoot(root);
  const top = realpathSync(git(physical, ["rev-parse", "--show-toplevel"], spawn));
  if (top !== physical) fail("HGO-ROOT", "override root must be the physical repository top");
  const rawCommon = git(physical, ["rev-parse", "--path-format=absolute", "--git-common-dir"], spawn);
  const common = realpathSync(isAbsolute(rawCommon) ? rawCommon : resolve(physical, rawCommon));
  const info = lstatSync(common);
  if (!info.isDirectory() || info.isSymbolicLink()) fail("HGO-COMMON-DIR", "Git common directory is unsafe");
  return { root: physical, common };
}

function secureDirectory(path, {
  platform = process.platform,
  assessWindowsPrivatePathFn = assessWindowsPrivatePath,
  hardenWindowsPrivateDirectoryFn = hardenWindowsPrivateDirectory,
} = {}) {
  const existed = existsSync(path);
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const info = lstatSync(path);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    fail("HGO-STORAGE", "override directory is unsafe");
  }
  if (platform === "win32") {
    const assurance = existed
      ? assessWindowsPrivatePathFn(path)
      : hardenWindowsPrivateDirectoryFn(path);
    if (assurance.status !== "secure") fail("HGO-DACL", "override directory DACL is not owner-private");
  } else if ((info.mode & 0o077) !== 0) {
    try { chmodSync(path, 0o700); } catch {}
    if ((lstatSync(path).mode & 0o077) !== 0) fail("HGO-PERMISSIONS", "override directory is not owner-private");
  }
  return path;
}

function storage(common) {
  const base = secureDirectory(join(common, "agent-pipeline", "human-guard-overrides"));
  return {
    base,
    requests: secureDirectory(join(base, "requests")),
    capabilities: secureDirectory(join(base, "capabilities")),
    locks: secureDirectory(join(base, "locks")),
    key: join(base, "audit.key"),
    audit: join(base, "audit.jsonl"),
    auditHead: join(base, "audit.head.json"),
    auditLock: join(base, "audit.lock"),
  };
}

function safePrivateFile(path, {
  absent = false,
  platform = process.platform,
  assessWindowsPrivatePathFn = assessWindowsPrivatePath,
} = {}) {
  if (!existsSync(path)) {
    if (absent) return null;
    fail("HGO-STORAGE", "required override file is missing");
  }
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) fail("HGO-STORAGE", "override file is unsafe");
  if (platform === "win32") {
    if (assessWindowsPrivatePathFn(path).status !== "secure") {
      fail("HGO-DACL", "override file DACL is not owner-private");
    }
  } else if ((info.mode & 0o077) !== 0) fail("HGO-PERMISSIONS", "override file is not owner-private");
  return info;
}

function writeExclusive(path, bytes) {
  const fd = openSync(path, "wx", 0o600);
  try { writeFileSync(fd, bytes); }
  finally { closeSync(fd); }
  safePrivateFile(path);
}

function writeAtomic(path, bytes) {
  const tmp = `${path}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    writeExclusive(tmp, bytes);
    renameSync(tmp, path);
    safePrivateFile(path);
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
}

function readJson(path) {
  safePrivateFile(path);
  let value;
  try { value = JSON.parse(readFileSync(path, "utf8")); }
  catch { fail("HGO-STORAGE", "override file is malformed"); }
  return value;
}

function pluginIdentity(pluginRoot) {
  const root = physicalRoot(pluginRoot);
  const manifestPath = join(root, ".codex-plugin", "plugin.json");
  const adapterPath = join(root, "hooks", "codex-pretool-guard.mjs");
  const grammarPath = join(root, "hooks", "guard-command-grammar.mjs");
  const policyPath = join(root, "lib", "human-guard-override.mjs");
  const windowsPrivatePath = join(root, "lib", "windows-private-state.mjs");
  const cliPath = join(root, "scripts", "guard-human-override.mjs");
  for (const path of [
    manifestPath,
    adapterPath,
    grammarPath,
    policyPath,
    windowsPrivatePath,
    cliPath,
  ]) {
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || realpathSync(path) !== path) {
      fail("HGO-PLUGIN", "loaded plugin file identity is unsafe");
    }
  }
  let manifest;
  try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")); }
  catch { fail("HGO-PLUGIN", "loaded plugin manifest is malformed"); }
  if (manifest?.name !== "pipeline-core" || typeof manifest.version !== "string") {
    fail("HGO-PLUGIN", "loaded plugin identity is invalid");
  }
  return {
    root,
    name: manifest.name,
    version: manifest.version,
    manifestSha256: sha(readFileSync(manifestPath)),
    adapterSha256: sha(readFileSync(adapterPath)),
    grammarSha256: sha(readFileSync(grammarPath)),
    policySha256: sha(readFileSync(policyPath)),
    windowsPrivateSha256: sha(readFileSync(windowsPrivatePath)),
    cliSha256: sha(readFileSync(cliPath)),
  };
}

function stateObservation(root) {
  const path = join(root, ".claude", "pipeline-state.json");
  if (!existsSync(path)) return { status: "absent", sha256: null, continuityRevision: null };
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || realpathSync(path) !== path) {
    fail("HGO-STATE", "Pipeline State identity is unsafe");
  }
  const bytes = readFileSync(path);
  let value;
  try { value = JSON.parse(bytes); } catch { fail("HGO-STATE", "Pipeline State is malformed"); }
  const revision = value?.continuity?.revision ?? null;
  if (revision !== null && (!Number.isSafeInteger(revision) || revision < 0)) {
    fail("HGO-STATE", "Pipeline Continuity revision is invalid");
  }
  return { status: "present", sha256: sha(bytes), continuityRevision: revision };
}

function repositoryObservation(root, spawn = spawnSync) {
  return {
    head: git(root, ["rev-parse", "HEAD"], spawn),
    tree: git(root, ["rev-parse", "HEAD^{tree}"], spawn),
    statusSha256: sha(git(root, ["status", "--porcelain=v1", "--untracked-files=all"], spawn)),
    state: stateObservation(root),
  };
}

function safePath(root, candidate) {
  if (typeof candidate !== "string" || candidate.trim() === "" || candidate.includes("\0")) return null;
  const absolute = resolve(root, candidate);
  const rel = relative(root, absolute).split("\\").join("/");
  if (rel === "" || rel === "." || rel === ".." || rel.startsWith("../") || isAbsolute(rel)) return null;
  let cursor = root;
  const components = rel.split("/");
  for (let index = 0; index < components.length; index += 1) {
    cursor = join(cursor, components[index]);
    if (!existsSync(cursor)) break;
    const info = lstatSync(cursor);
    if (info.isSymbolicLink()
      || realpathSync(cursor) !== cursor
      || (index < components.length - 1 && !info.isDirectory())
      || (index === components.length - 1 && info.isFile() && info.nlink !== 1)) {
      return null;
    }
  }
  return { absolute, relative: rel };
}

function protectedPath(path) {
  const normalized = path.toLowerCase();
  return normalized === ".claude/pipeline-state.json"
    || normalized.startsWith(".claude/pipeline-state.json.")
    || normalized === ".claude/pipeline.yaml"
    || normalized === ".claude/pipeline.json"
    || normalized === ".claude/settings.json"
    || normalized === ".claude/settings.local.json"
    || normalized === ".claude/guard-config.json"
    || normalized === ".claude/guard-override.log.jsonl"
    || normalized === "pipeline.user.yaml"
    || normalized === "plugins/pipeline-core" || normalized.startsWith("plugins/pipeline-core/")
    || normalized === ".agent-pipeline" || normalized.startsWith(".agent-pipeline/")
    || normalized === ".git" || normalized.startsWith(".git/")
    || normalized === ".codex" || normalized.startsWith(".codex/")
    || /(^|\/)(?:secrets?|credentials?|tokens?|id_rsa|id_ed25519)(?:[./_-]|$)/u.test(normalized);
}

function patchPaths(command) {
  if (typeof command !== "string" || !command.startsWith("*** Begin Patch\n") || !command.endsWith("*** End Patch")) return null;
  const paths = [];
  for (const line of command.split("\n")) {
    const match = line.match(/^\*\*\* (?:(?:Add|Update|Delete) File|Move to): (.+)$/u);
    if (match) paths.push(match[1]);
  }
  return paths.length > 0 ? paths : null;
}

function eligibility(root, toolName, toolInput) {
  const paths = [];
  const serialized = canonical(toolInput);
  if (/(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:token|password|secret)\s*[:=]\s*["']?[A-Za-z0-9+/_=-]{12,})/u.test(serialized)) {
    return { eligible: false, code: "HGO-NONOVERRIDABLE-SECRET" };
  }
  if (new Set(["Edit", "Write"]).has(toolName)) {
    const path = safePath(root, toolInput?.file_path);
    if (!path || protectedPath(path.relative)) return { eligible: false, code: "HGO-NONOVERRIDABLE-PATH" };
    paths.push(path.relative);
  } else if (toolName === "apply_patch") {
    const parsed = patchPaths(toolInput?.command);
    if (!parsed) return { eligible: false, code: "HGO-NONOVERRIDABLE-GRAMMAR" };
    for (const candidate of parsed) {
      const path = safePath(root, candidate);
      if (!path || protectedPath(path.relative)) return { eligible: false, code: "HGO-NONOVERRIDABLE-PATH" };
      paths.push(path.relative);
    }
  } else if (toolName === "Bash") {
    const command = String(toolInput?.command ?? "");
    const parsed = parseGuardCommand(command, root);
    if (parsed.parseStatus !== "accepted" || parsed.segments.length !== 1
      || parsed.operators.length !== 0 || parsed.redirects.length !== 0) {
      return { eligible: false, code: "HGO-NONOVERRIDABLE-GRAMMAR" };
    }
    const { executable, argv } = parsed.segments[0];
    const normalizedExecutable = executable.toLowerCase().replace(/\.exe$/u, "");
    const readOnlyDiagnostics = new Set([
      "cat", "grep", "head", "ls", "pwd", "sha256sum", "stat", "tail", "test", "true", "false", "wc",
    ]);
    const exactNodeCheck = normalizedExecutable === "node"
      && argv.length === 2
      && argv[0] === "--check"
      && typeof argv[1] === "string"
      && !argv[1].startsWith("-");
    if (!readOnlyDiagnostics.has(normalizedExecutable) && !exactNodeCheck) {
      return { eligible: false, code: "HGO-NONOVERRIDABLE-COMMAND" };
    }
    const candidateTokens = exactNodeCheck ? [argv[1]] : argv.filter((token) => !token.startsWith("-"));
    for (const token of candidateTokens) {
      const path = safePath(root, token);
      if (!path || protectedPath(path.relative)) return { eligible: false, code: "HGO-NONOVERRIDABLE-PATH" };
      paths.push(path.relative);
    }
  } else {
    return { eligible: false, code: "HGO-NONOVERRIDABLE-TOOL" };
  }
  return { eligible: true, paths: [...new Set(paths)].sort() };
}

function requestPath(paths, digest) {
  if (!SHA256.test(digest)) fail("HGO-DIGEST", "request digest is invalid");
  return join(paths.requests, `${digest}.json`);
}

function capabilityPath(paths, digest) {
  if (!SHA256.test(digest)) fail("HGO-DIGEST", "plan digest is invalid");
  return join(paths.capabilities, `${digest}.json`);
}

function key(paths, { create = false } = {}) {
  if (!existsSync(paths.key)) {
    if (!create) fail("HGO-AUDIT-KEY", "audit key is missing");
    writeExclusive(paths.key, randomBytes(32));
  }
  safePrivateFile(paths.key);
  const bytes = readFileSync(paths.key);
  if (bytes.length !== 32) fail("HGO-AUDIT", "audit key is invalid");
  return bytes;
}

function auditEntries(paths, secret) {
  if (!existsSync(paths.audit)) return [];
  safePrivateFile(paths.audit);
  const entries = [];
  let prior = "0".repeat(64);
  const lines = readFileSync(paths.audit, "utf8").split("\n").filter(Boolean);
  for (const line of lines) {
    let entry;
    try { entry = JSON.parse(line); } catch { fail("HGO-AUDIT", "audit ledger is malformed"); }
    if (!exactKeys(entry, ["schema", "sequence", "previousMac", "event", "mac"])
      || entry.schema !== AUDIT_SCHEMA || entry.sequence !== entries.length + 1
      || entry.previousMac !== prior || !object(entry.event) || !SHA256.test(entry.mac)) {
      fail("HGO-AUDIT", "audit ledger structure is invalid");
    }
    const expected = createHmac("sha256", secret).update(canonical({
      schema: entry.schema,
      sequence: entry.sequence,
      previousMac: entry.previousMac,
      event: entry.event,
    })).digest("hex");
    if (entry.mac !== expected) fail("HGO-AUDIT", "audit ledger authentication failed");
    entries.push(entry);
    prior = entry.mac;
  }
  return entries;
}

function auditHead(secret, entries, ledgerBytes) {
  const core = {
    schema: AUDIT_HEAD_SCHEMA,
    entries: entries.length,
    lastMac: entries.at(-1)?.mac ?? null,
    ledgerSha256: sha(ledgerBytes),
  };
  return {
    ...core,
    mac: createHmac("sha256", secret).update(canonical(core)).digest("hex"),
  };
}

function verifiedAuditEntries(paths, secret) {
  const hasAudit = existsSync(paths.audit);
  const hasHead = existsSync(paths.auditHead);
  if (hasAudit !== hasHead) fail("HGO-AUDIT", "audit ledger/head presence is inconsistent");
  if (!hasAudit) fail("HGO-AUDIT", "audit ledger/head are missing");
  const entries = auditEntries(paths, secret);
  const ledgerBytes = readFileSync(paths.audit);
  const head = readJson(paths.auditHead);
  const expected = auditHead(secret, entries, ledgerBytes);
  if (!exactKeys(head, ["schema", "entries", "lastMac", "ledgerSha256", "mac"])
    || canonical(head) !== canonical(expected)) {
    fail("HGO-AUDIT", "audit ledger head authentication failed");
  }
  return entries;
}

function appendAudit(paths, event) {
  let fd;
  try {
    fd = openSync(paths.auditLock, "wx", 0o600);
    const initialize = !existsSync(paths.key)
      && !existsSync(paths.audit)
      && !existsSync(paths.auditHead);
    const secret = key(paths, { create: initialize });
    const entries = initialize
      ? []
      : verifiedAuditEntries(paths, secret);
    const core = {
      schema: AUDIT_SCHEMA,
      sequence: entries.length + 1,
      previousMac: entries.at(-1)?.mac ?? "0".repeat(64),
      event,
    };
    const entry = { ...core, mac: createHmac("sha256", secret).update(canonical(core)).digest("hex") };
    const content = `${entries.map((item) => JSON.stringify(item)).join("\n")}${entries.length ? "\n" : ""}${JSON.stringify(entry)}\n`;
    const ledgerBytes = Buffer.from(content, "utf8");
    writeAtomic(paths.audit, ledgerBytes);
    writeAtomic(
      paths.auditHead,
      Buffer.from(`${JSON.stringify(auditHead(secret, [...entries, entry], ledgerBytes))}\n`, "utf8"),
    );
    return entry;
  } catch (error) {
    if (error?.code === "EEXIST") fail("HGO-AUDIT-LOCKED", "audit ledger is busy");
    throw error;
  } finally {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(paths.auditLock); } catch {}
  }
}

const CAPABILITY_KEYS = [
  "schema",
  "status",
  "root",
  "requestSha256",
  "planSha256",
  "selectionSha256",
  "reasonSha256",
  "plugin",
  "repository",
  "toolName",
  "toolInputSha256",
  "denials",
  "eligiblePaths",
  "authorizedAt",
  "expiresAt",
  "consumedAt",
  "mac",
];

function capabilityMac(secret, value) {
  const core = Object.fromEntries(
    Object.entries(value).filter(([name]) => name !== "mac"),
  );
  return createHmac("sha256", secret).update(canonical(core)).digest("hex");
}

function validatedCapability(paths, path) {
  const value = readJson(path);
  if (!exactKeys(value, CAPABILITY_KEYS)
    || value.schema !== CAPABILITY_SCHEMA
    || !new Set(["armed", "consumed"]).has(value.status)
    || !SHA256.test(value.requestSha256 ?? "")
    || !SHA256.test(value.planSha256 ?? "")
    || !SHA256.test(value.selectionSha256 ?? "")
    || !SHA256.test(value.reasonSha256 ?? "")
    || !SHA256.test(value.toolInputSha256 ?? "")
    || !SHA256.test(value.mac ?? "")
    || !(value.consumedAt === null || typeof value.consumedAt === "string")
    || value.mac !== capabilityMac(key(paths), value)) {
    fail("HGO-CAPABILITY", "override capability authentication failed");
  }
  return value;
}

function hasAuthorizedAuditEntry(paths, capability) {
  const entries = verifiedAuditEntries(paths, key(paths));
  return entries.some(({ event }) => event?.type === "authorized"
    && event.requestSha256 === capability.requestSha256
    && event.planSha256 === capability.planSha256
    && event.reasonSha256 === capability.reasonSha256
    && event.selectionSha256 === capability.selectionSha256
    && event.at === capability.authorizedAt);
}

function validatedRequest(paths, requestSha256) {
  const request = readJson(requestPath(paths, requestSha256));
  if (!exactKeys(request, ["schema", "root", "plugin", "repository", "toolName", "toolInputSha256", "denials", "eligiblePaths", "createdAt", "expiresAt"])
    || request.schema !== REQUEST_SCHEMA || request.root === undefined
    || !SHA256.test(request.toolInputSha256) || !Array.isArray(request.denials)
    || sha(request) !== requestSha256) fail("HGO-REQUEST", "override request is invalid");
  return request;
}

export function recordHumanGuardDenial({
  rootDir,
  pluginRoot,
  toolName,
  toolInput,
  denials,
  nowMs = Date.now(),
  ttlMs = DEFAULT_TTL_MS,
  spawn = spawnSync,
} = {}) {
  const repo = topology(rootDir, spawn);
  const eligible = eligibility(repo.root, toolName, toolInput);
  if (!eligible.eligible) return { status: "non-overridable", code: eligible.code };
  if (!Array.isArray(denials) || denials.length === 0) fail("HGO-DENIAL", "denial set is empty");
  const paths = storage(repo.common);
  const request = {
    schema: REQUEST_SCHEMA,
    root: repo.root,
    plugin: pluginIdentity(pluginRoot),
    repository: repositoryObservation(repo.root, spawn),
    toolName,
    toolInputSha256: sha(toolInput),
    denials: denials.map((denial) => ({
      guard: String(denial.guard),
      sha256: sha(String(denial.reason)),
    })).sort((left, right) => `${left.guard}:${left.sha256}`.localeCompare(`${right.guard}:${right.sha256}`)),
    eligiblePaths: eligible.paths,
    createdAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + ttlMs).toISOString(),
  };
  const requestSha256 = sha(request);
  const path = requestPath(paths, requestSha256);
  if (!existsSync(path)) writeExclusive(path, Buffer.from(`${JSON.stringify(request)}\n`, "utf8"));
  else if (sha(readJson(path)) !== requestSha256) fail("HGO-REQUEST", "request replay conflicts");
  appendAudit(paths, {
    type: "denied",
    at: new Date(nowMs).toISOString(),
    requestSha256,
    toolName,
    denialDigests: request.denials,
  });
  return { status: "planned", requestSha256 };
}

export function planHumanGuardOverride({
  rootDir,
  pluginRoot,
  requestSha256,
  nowMs = Date.now(),
  spawn = spawnSync,
  scriptPath,
} = {}) {
  const repo = topology(rootDir, spawn);
  const paths = storage(repo.common);
  const request = validatedRequest(paths, requestSha256);
  if (request.root !== repo.root || new Date(request.expiresAt).getTime() <= nowMs) fail("HGO-EXPIRED", "override request expired");
  const plugin = pluginIdentity(pluginRoot);
  const repository = repositoryObservation(repo.root, spawn);
  if (canonical(plugin) !== canonical(request.plugin) || canonical(repository) !== canonical(request.repository)) {
    fail("HGO-DRIFT", "override request preimage drifted");
  }
  const payload = {
    schema: PLAN_SCHEMA,
    status: "planned",
    root: repo.root,
    requestSha256,
    plugin,
    repository,
    toolName: request.toolName,
    toolInputSha256: request.toolInputSha256,
    denials: request.denials,
    eligiblePaths: request.eligiblePaths,
    expiresAt: request.expiresAt,
  };
  const planSha256 = sha(payload);
  return {
    ...payload,
    planSha256,
    prepareAuthorizationAction: {
      executable: process.execPath,
      argv: [
        scriptPath,
        "prepare-authorization",
        "--repo",
        repo.root,
        "--request-sha256",
        requestSha256,
        "--plan-sha256",
        planSha256,
        "--reason",
        "<human-reason>",
      ],
      mutation: false,
      requiresConfirmation: false,
    },
  };
}

export function prepareHumanGuardOverrideAuthorization({
  rootDir,
  pluginRoot,
  requestSha256,
  planSha256,
  reason,
  nowMs = Date.now(),
  spawn = spawnSync,
  scriptPath,
} = {}) {
  const reasonBytes = Buffer.from(String(reason ?? ""), "utf8");
  if (reasonBytes.length < 1 || reasonBytes.length > MAX_REASON_BYTES) {
    fail("HGO-REASON", "override reason is invalid");
  }
  const planned = planHumanGuardOverride({
    rootDir,
    pluginRoot,
    requestSha256,
    nowMs,
    spawn,
    scriptPath,
  });
  if (planned.planSha256 !== planSha256) {
    fail("HGO-PLAN", "override plan digest does not match");
  }
  const reasonSha256 = sha(reasonBytes);
  const selection = {
    schema: "pipeline.human-guard-override-authorization-selection.v1",
    requestSha256,
    planSha256,
    reasonSha256,
  };
  const selectionSha256 = sha(selection);
  return {
    ...selection,
    status: "prepared",
    selectionSha256,
    authorizeAction: {
      executable: process.execPath,
      argv: [
        scriptPath,
        "authorize",
        "--repo",
        planned.root,
        "--request-sha256",
        requestSha256,
        "--plan-sha256",
        planSha256,
        "--selection-sha256",
        selectionSha256,
        "--reason",
        String(reason),
        "--reason-sha256",
        reasonSha256,
        "--activate",
      ],
      mutation: true,
      requiresConfirmation: true,
    },
  };
}

export function authorizeHumanGuardOverride({
  rootDir,
  pluginRoot,
  requestSha256,
  planSha256,
  selectionSha256,
  reason,
  reasonSha256,
  activate = false,
  nowMs = Date.now(),
  spawn = spawnSync,
  scriptPath,
} = {}) {
  if (activate !== true) fail("HGO-ACTIVATION", "override authorization requires explicit activation");
  const reasonBytes = Buffer.from(String(reason ?? ""), "utf8");
  if (reasonBytes.length < 1 || reasonBytes.length > MAX_REASON_BYTES || sha(reasonBytes) !== reasonSha256) {
    fail("HGO-REASON", "override reason digest is invalid");
  }
  const prepared = prepareHumanGuardOverrideAuthorization({
    rootDir,
    pluginRoot,
    requestSha256,
    planSha256,
    reason,
    nowMs,
    spawn,
    scriptPath,
  });
  if (prepared.selectionSha256 !== selectionSha256
    || prepared.reasonSha256 !== reasonSha256) {
    fail("HGO-SELECTION", "override authorization selection digest does not match");
  }
  const planned = planHumanGuardOverride({
    rootDir,
    pluginRoot,
    requestSha256,
    nowMs,
    spawn,
    scriptPath,
  });
  const repo = topology(rootDir, spawn);
  const paths = storage(repo.common);
  const capabilityCore = {
    schema: CAPABILITY_SCHEMA,
    status: "armed",
    root: repo.root,
    requestSha256,
    planSha256,
    selectionSha256,
    reasonSha256,
    plugin: planned.plugin,
    repository: planned.repository,
    toolName: planned.toolName,
    toolInputSha256: planned.toolInputSha256,
    denials: planned.denials,
    eligiblePaths: planned.eligiblePaths,
    authorizedAt: new Date(nowMs).toISOString(),
    expiresAt: planned.expiresAt,
    consumedAt: null,
  };
  const capability = {
    ...capabilityCore,
    mac: capabilityMac(key(paths), capabilityCore),
  };
  const path = capabilityPath(paths, planSha256);
  if (existsSync(path)) {
    const prior = validatedCapability(paths, path);
    if (canonical(prior) === canonical(capability)) {
      if (!hasAuthorizedAuditEntry(paths, prior)) {
        appendAudit(paths, {
          type: "authorized",
          at: capability.authorizedAt,
          requestSha256,
          planSha256,
          reasonSha256,
          selectionSha256,
        });
      }
      return { schema: CAPABILITY_SCHEMA, status: "armed", planSha256, requestSha256, mutated: false };
    }
    fail("HGO-REPLAY", "override plan is already used or conflicts");
  }
  writeExclusive(path, Buffer.from(`${JSON.stringify(capability)}\n`, "utf8"));
  const owned = safePrivateFile(path);
  try {
    appendAudit(paths, {
      type: "authorized",
      at: capability.authorizedAt,
      requestSha256,
      planSha256,
      reasonSha256,
      selectionSha256,
    });
  } catch (error) {
    try {
      const observed = safePrivateFile(path);
      if (observed.dev === owned.dev && observed.ino === owned.ino) unlinkSync(path);
    } catch {}
    throw error;
  }
  return { schema: CAPABILITY_SCHEMA, status: "armed", planSha256, requestSha256, mutated: true };
}

export function consumeHumanGuardOverride({
  rootDir,
  pluginRoot,
  toolName,
  toolInput,
  denials,
  nowMs = Date.now(),
  spawn = spawnSync,
} = {}) {
  let repo;
  try { repo = topology(rootDir, spawn); } catch { return { status: "absent" }; }
  const paths = storage(repo.common);
  const toolInputSha256 = sha(toolInput);
  const denialDigests = denials.map((denial) => ({
    guard: String(denial.guard),
    sha256: sha(String(denial.reason)),
  })).sort((left, right) => `${left.guard}:${left.sha256}`.localeCompare(`${right.guard}:${right.sha256}`));
  const files = [];
  try {
    files.push(...readdirSync(paths.capabilities).filter((name) => name.endsWith(".json")).sort());
  } catch { return { status: "absent" }; }
  for (const name of files) {
    const planSha256 = name.slice(0, -5);
    if (!SHA256.test(planSha256)) continue;
    const path = capabilityPath(paths, planSha256);
    let capability;
    try { capability = validatedCapability(paths, path); }
    catch { return { status: "invalid", code: "HGO-CAPABILITY" }; }
    if (capability.status !== "armed" || capability.toolName !== toolName
      || capability.toolInputSha256 !== toolInputSha256
      || canonical(capability.denials) !== canonical(denialDigests)) continue;
    const lock = join(paths.locks, `${planSha256}.lock`);
    let lockFd;
    try { lockFd = openSync(lock, "wx", 0o600); }
    catch { return { status: "invalid", code: "HGO-CONCURRENT-CONSUME" }; }
    try {
      capability = validatedCapability(paths, path);
      let authorized = false;
      try { authorized = hasAuthorizedAuditEntry(paths, capability); }
      catch { return { status: "invalid", code: "HGO-AUDIT" }; }
      if (!authorized) {
        return { status: "invalid", code: "HGO-AUDIT" };
      }
      const plugin = pluginIdentity(pluginRoot);
      const repository = repositoryObservation(repo.root, spawn);
      const expired = new Date(capability.expiresAt).getTime() <= nowMs;
      const drifted = capability.status !== "armed" || capability.root !== repo.root
        || capability.toolName !== toolName || capability.toolInputSha256 !== toolInputSha256
        || canonical(capability.denials) !== canonical(denialDigests)
        || canonical(capability.plugin) !== canonical(plugin)
        || canonical(capability.repository) !== canonical(repository);
      if (expired || drifted) {
        appendAudit(paths, {
          type: expired ? "expired" : "rejected",
          at: new Date(nowMs).toISOString(),
          requestSha256: capability.requestSha256,
          planSha256,
          reasonSha256: capability.reasonSha256,
          code: expired ? "HGO-EXPIRED" : "HGO-DRIFT",
        });
        return { status: "invalid", code: expired ? "HGO-EXPIRED" : "HGO-DRIFT" };
      }
      const consumedCore = {
        ...capability,
        status: "consumed",
        consumedAt: new Date(nowMs).toISOString(),
      };
      delete consumedCore.mac;
      const consumed = {
        ...consumedCore,
        mac: capabilityMac(key(paths), consumedCore),
      };
      writeAtomic(path, Buffer.from(`${JSON.stringify(consumed)}\n`, "utf8"));
      appendAudit(paths, {
        type: "consumed",
        at: consumed.consumedAt,
        requestSha256: capability.requestSha256,
        planSha256,
        reasonSha256: capability.reasonSha256,
      });
      return { status: "consumed", planSha256, requestSha256: capability.requestSha256 };
    } finally {
      if (lockFd !== undefined) closeSync(lockFd);
      try { unlinkSync(lock); } catch {}
    }
  }
  return { status: "absent" };
}

export function verifyHumanGuardOverrideAudit({ rootDir, spawn = spawnSync } = {}) {
  const repo = topology(rootDir, spawn);
  const paths = storage(repo.common);
  const secret = key(paths);
  const entries = verifiedAuditEntries(paths, secret);
  return {
    schema: "pipeline.human-guard-override-audit-verification.v1",
    status: "valid",
    entries: entries.length,
    lastMac: entries.at(-1)?.mac ?? null,
  };
}

export const humanGuardOverrideInternals = {
  canonical,
  sha,
  eligibility,
  secureDirectory,
  safePrivateFile,
};
