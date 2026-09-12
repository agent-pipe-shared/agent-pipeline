// SPDX-License-Identifier: SUL-1.0

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants, fstatSync, fsyncSync, lstatSync, mkdirSync,
  openSync, readFileSync, readSync, realpathSync, writeSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { shellWord } from "./project-onboarding-v3.mjs";
import { renderHumanCopySafeCommand } from "./copy-safe-command.mjs";
import {
  HUMAN_TERMINAL_ACTION_CATALOG_PATH,
  buildRegisteredHumanTerminalAction,
  humanTerminalActionCatalogEntry,
  hasRegisteredHumanTerminalActionReadback,
  loadHumanTerminalActionCatalog,
  readbackRegisteredHumanTerminalAction,
  registeredHumanTerminalActionBuilderIdentity,
} from "./human-terminal-action-catalog.mjs";

export const HUMAN_TERMINAL_ACTION_INSTANCE_SCHEMA = "pipeline.human-terminal-action-instance.v1";
export const HUMAN_TERMINAL_ACTION_RESULT_SCHEMA = "pipeline.human-terminal-action-result.v1";
export const HUMAN_TERMINAL_ACTION_RECEIPT_SCHEMA = "pipeline.human-terminal-action-receipt.v2";
const SHA256 = /^[a-f0-9]{64}$/u;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const MAX_REQUEST_BYTES = 1024 * 1024;
const BOUNDARY_KEYS = ["codexToolCallPermitted", "executionBoundary", "invocation"];
const INSTANCE_KEYS = [
  "builderId", "builderOutput", "builderOutputSha256", "builderSourceSha256", "boundary",
  "candidate", "catalogSha256", "createdAt", "instanceId", "platform", "recordSha256",
  "repositoryRoot", "revision", "runner", "schema", "templateId", "values", "expectedReadback",
];

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function sha(value) {
  return createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : canonical(value)).digest("hex");
}

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function recordDigest(value) {
  const { recordSha256: _ignored, ...unsigned } = value;
  return sha(unsigned);
}

function observeCandidate(root, spawn = spawnSync) {
  const read = (args) => {
    const result = spawn("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (result.status !== 0 || result.signal !== null) throw new Error("HTA-CANDIDATE-UNAVAILABLE");
    return result.stdout.trim();
  };
  const commit = read(["rev-parse", "HEAD"]);
  const tree = read(["rev-parse", "HEAD^{tree}"]);
  if (read(["status", "--porcelain=v1"]) !== "") throw new Error("HTA-CANDIDATE-DIRTY");
  if (!/^[a-f0-9]{40,64}$/u.test(commit) || !/^[a-f0-9]{40,64}$/u.test(tree)) throw new Error("HTA-CANDIDATE-INVALID");
  return { commit, tree };
}

function validateValues(entry, values) {
  if (!values || typeof values !== "object" || Array.isArray(values)) return "HTA-VALUES-SHAPE";
  const slots = new Map(entry.slots.map((slot) => [slot.name, slot]));
  for (const key of Object.keys(values)) if (!slots.has(key)) return `HTA-VALUES-UNKNOWN:${key}`;
  for (const slot of entry.slots) {
    if (slot.required && (typeof values[slot.name] !== "string" || values[slot.name].length === 0)) return `HTA-VALUES-MISSING:${slot.name}`;
    if (!Object.hasOwn(values, slot.name)) continue;
    const value = values[slot.name];
    if (typeof value !== "string" || value.includes("\0") || /[\r\n]/u.test(value)) return `HTA-VALUES-TYPE:${slot.name}`;
    if (["absolute-directory", "absolute-file"].includes(slot.type) && !isAbsolute(value)) return `HTA-VALUES-ABSOLUTE:${slot.name}`;
    if (slot.type === "repo-relative-path" && (isAbsolute(value) || value === "" || value.split(/[\\/]/u).includes(".."))) return `HTA-VALUES-REPO-PATH:${slot.name}`;
    if (slot.type === "sha256" && !SHA256.test(value)) return `HTA-VALUES-SHA256:${slot.name}`;
    if (slot.type === "git-oid" && !/^[a-f0-9]{40,64}$/u.test(value)) return `HTA-VALUES-GIT-OID:${slot.name}`;
    if (slot.type === "safe-id" && !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/u.test(value)) return `HTA-VALUES-SAFE-ID:${slot.name}`;
    if (slot.type === "plugin-version" && !/^[A-Za-z0-9][A-Za-z0-9.+_-]{0,127}$/u.test(value)) return `HTA-VALUES-PLUGIN-VERSION:${slot.name}`;
    if (slot.type === "human-name" && value.trim() === "") return `HTA-VALUES-HUMAN-NAME:${slot.name}`;
    if (slot.type === "runner" && !["claude", "codex", "antigravity"].includes(value)) return `HTA-VALUES-RUNNER:${slot.name}`;
    if (slot.type === "iso8601" && !Number.isFinite(Date.parse(value))) return `HTA-VALUES-ISO8601:${slot.name}`;
    if (slot.type === "enum" && !slot.enum.includes(value)) return `HTA-VALUES-ENUM:${slot.name}`;
  }
  return null;
}

function privateDirectory(path, create = false) {
  if (create) mkdirSync(path, { recursive: true, mode: 0o700 });
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(path) !== resolve(path)
    || (stat.mode & 0o777) !== 0o700 || stat.uid !== process.getuid()) throw new Error("HTA-PRIVATE-DIRECTORY");
}

function writeExclusive(path, bytes, mode) {
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | O_NOFOLLOW, mode);
  try {
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
    fsyncSync(fd);
  } finally { closeSync(fd); }
  chmodSync(path, mode);
}

function readPrivateFile(path, mode) {
  const before = lstatSync(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
    || Number(before.mode & 0o777n) !== mode || before.uid !== BigInt(process.getuid())
    || before.size > BigInt(MAX_REQUEST_BYTES)) throw new Error("HTA-PRIVATE-FILE");
  const fd = openSync(path, constants.O_RDONLY | O_NOFOLLOW);
  try {
    const opened = fstatSync(fd, { bigint: true });
    if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) throw new Error("HTA-FILE-RACE");
    const bytes = Buffer.alloc(Number(opened.size));
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (count === 0) break;
      offset += count;
    }
    if (offset !== bytes.length) throw new Error("HTA-FILE-TRUNCATED");
    const after = fstatSync(fd, { bigint: true });
    if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size) throw new Error("HTA-FILE-RACE");
    return bytes;
  } finally { closeSync(fd); }
}

function supportedBoundary(boundary) {
  return exactKeys(boundary, BOUNDARY_KEYS)
    && ["host", "external-terminal", "attended-external-terminal"].includes(boundary.executionBoundary)
    && boundary.invocation === "user-copy-only"
    && boundary.codexToolCallPermitted === false;
}

function launcherBytes(scriptPath, requestPath, requestSha256) {
  return `#!/bin/sh\nset -eu\nexec ${[process.execPath, scriptPath, "run", "--request", requestPath, "--request-sha256", requestSha256].map(shellWord).join(" ")}\n`;
}

function instanceError(value) {
  if (!exactKeys(value, INSTANCE_KEYS)) return "HTA-INSTANCE-SHAPE";
  if (value.schema !== HUMAN_TERMINAL_ACTION_INSTANCE_SCHEMA || !/^[a-f0-9]{24}$/u.test(value.instanceId ?? "")) return "HTA-INSTANCE-SCHEMA";
  if (!/^[a-z][a-z0-9-]{0,95}$/u.test(value.templateId ?? "")
    || !/^[a-z][a-z0-9-]{0,95}$/u.test(value.builderId ?? "")
    || !Number.isSafeInteger(value.revision) || value.revision < 1
    || !["claude", "codex", "antigravity"].includes(value.runner)
    || typeof value.repositoryRoot !== "string" || value.repositoryRoot.length === 0
    || !Number.isFinite(Date.parse(value.createdAt ?? ""))) return "HTA-INSTANCE-FIELDS";
  if (!exactKeys(value.candidate, ["commit", "tree"])
    || ![value.candidate.commit, value.candidate.tree].every((item) => /^[a-f0-9]{40,64}$/u.test(item ?? ""))) return "HTA-INSTANCE-CANDIDATE";
  if (!value.values || typeof value.values !== "object" || Array.isArray(value.values)
    || Object.values(value.values).some((item) => typeof item !== "string")) return "HTA-INSTANCE-VALUES";
  if (!exactKeys(value.expectedReadback, ["schema", "code", "command"])
    || (value.expectedReadback.schema !== null && (typeof value.expectedReadback.schema !== "string" || value.expectedReadback.schema.length === 0))
    || typeof value.expectedReadback.code !== "string" || value.expectedReadback.code.length === 0
    || typeof value.expectedReadback.command !== "string" || value.expectedReadback.command.length === 0) return "HTA-INSTANCE-READBACK";
  if (!exactKeys(value.builderOutput, ["executable", "argv", "command", "copyCommand"])
    || typeof value.builderOutput.executable !== "string" || value.builderOutput.executable.length === 0
    || !Array.isArray(value.builderOutput.argv) || value.builderOutput.argv.length === 0
    || value.builderOutput.argv.some((item) => typeof item !== "string")
    || typeof value.builderOutput.command !== "string" || value.builderOutput.command.length === 0
    || !exactKeys(value.builderOutput.copyCommand, ["maxColumns", "posix", "powershell", "cmd"])
    || !Number.isSafeInteger(value.builderOutput.copyCommand.maxColumns) || value.builderOutput.copyCommand.maxColumns < 1
    || !["posix", "powershell", "cmd"].every((key) => value.builderOutput.copyCommand[key] === null || typeof value.builderOutput.copyCommand[key] === "string")) return "HTA-INSTANCE-BUILDER-OUTPUT";
  if (![value.catalogSha256, value.builderSourceSha256, value.builderOutputSha256, value.recordSha256].every((item) => SHA256.test(item ?? ""))) return "HTA-INSTANCE-DIGEST";
  if (value.platform !== "posix" || !supportedBoundary(value.boundary)) return "HTA-INSTANCE-BOUNDARY";
  if (sha(value.builderOutput) !== value.builderOutputSha256 || recordDigest(value) !== value.recordSha256) return "HTA-INSTANCE-INTEGRITY";
  return null;
}

export function prepareHumanTerminalAction(input, deps = {}) {
  if ((deps.platform ?? process.platform) === "win32" || input?.platform !== "posix") return { schema: HUMAN_TERMINAL_ACTION_RESULT_SCHEMA, status: "unsupported", code: "HTA-PREPARE-PLATFORM-UNSUPPORTED" };
  const catalog = deps.catalog ?? loadHumanTerminalActionCatalog();
  let entry;
  try { entry = humanTerminalActionCatalogEntry(input.templateId, catalog); }
  catch (error) { return { schema: HUMAN_TERMINAL_ACTION_RESULT_SCHEMA, status: "refused", code: error.message }; }
  if (!entry.runners.includes(input.runner) || !entry.platforms.includes("posix")) return { schema: HUMAN_TERMINAL_ACTION_RESULT_SCHEMA, status: "unsupported", code: "HTA-PREPARE-TARGET-UNSUPPORTED" };
  if (!supportedBoundary(entry.boundary)) return { schema: HUMAN_TERMINAL_ACTION_RESULT_SCHEMA, status: "refused", code: "HTA-PREPARE-BOUNDARY-UNATTESTED" };
  const valueError = validateValues(entry, input.values);
  if (valueError) return { schema: HUMAN_TERMINAL_ACTION_RESULT_SCHEMA, status: "needs-input", code: valueError };
  let root;
  try { root = realpathSync(resolve(input.rootDir)); } catch { return { schema: HUMAN_TERMINAL_ACTION_RESULT_SCHEMA, status: "refused", code: "HTA-ROOT-UNAVAILABLE" }; }
  if (root !== resolve(input.rootDir)) return { schema: HUMAN_TERMINAL_ACTION_RESULT_SCHEMA, status: "refused", code: "HTA-ROOT-ALIAS" };
  const build = deps.build ?? buildRegisteredHumanTerminalAction;
  const built = build(entry.builderId, input.values);
  if (canonical(built.boundary) !== canonical(entry.boundary)) return { schema: HUMAN_TERMINAL_ACTION_RESULT_SCHEMA, status: "refused", code: "HTA-PREPARE-BOUNDARY-DRIFT" };
  const catalogBytes = deps.catalogBytes ?? readFileSync(HUMAN_TERMINAL_ACTION_CATALOG_PATH);
  const builderIdentity = (deps.builderIdentity ?? registeredHumanTerminalActionBuilderIdentity)(entry.builderId);
  const candidate = (deps.observeCandidate ?? observeCandidate)(root);
  const instanceId = (deps.randomBytes ?? randomBytes)(12).toString("hex");
  const createdAt = new Date(deps.nowMs ?? Date.now()).toISOString();
  const request = {
    schema: HUMAN_TERMINAL_ACTION_INSTANCE_SCHEMA, instanceId, templateId: entry.templateId,
    revision: entry.revision, builderId: entry.builderId, catalogSha256: sha(catalogBytes),
    builderSourceSha256: builderIdentity.sourceSha256, runner: input.runner, platform: "posix",
    repositoryRoot: root, candidate, values: { ...input.values }, builderOutput: built.output,
    builderOutputSha256: sha(built.output), boundary: built.boundary,
    expectedReadback: structuredClone(entry.expectedReadback), createdAt, recordSha256: "",
  };
  request.recordSha256 = recordDigest(request);
  const base = join(root, "scratch", "human-terminal-actions");
  const directory = join(base, instanceId);
  try {
    privateDirectory(base, true);
    mkdirSync(directory, { mode: 0o700 });
    privateDirectory(directory);
    const requestPath = join(directory, "request.json");
    const launcherPath = join(directory, "run-in-terminal.sh");
    writeExclusive(requestPath, Buffer.from(`${JSON.stringify(request, null, 2)}\n`), 0o600);
    writeExclusive(launcherPath, Buffer.from(launcherBytes(deps.scriptPath ?? fileURLToPath(new URL("../scripts/human-terminal-action.mjs", import.meta.url)), requestPath, request.recordSha256)), 0o700);
    const rendered = renderHumanCopySafeCommand({
      label: "run prepared human action",
      executable: "/bin/sh",
      argv: [launcherPath],
      platform: "posix",
    });
    const readback = inspectHumanTerminalAction({ requestPath, requestSha256: request.recordSha256 }, deps);
    if (readback.status !== "inspected") throw new Error(`HTA-PREPARE-READBACK:${readback.code}`);
    return {
      schema: HUMAN_TERMINAL_ACTION_RESULT_SCHEMA,
      status: "prepared",
      code: "HTA-PREPARED",
      requestPath,
      launcherPath,
      requestSha256: request.recordSha256,
      launch: { ...entry.boundary, copyCommand: rendered.copyCommand, text: rendered.text },
    };
  } catch (error) {
    return { schema: HUMAN_TERMINAL_ACTION_RESULT_SCHEMA, status: "refused", code: error.message };
  }
}

export function inspectHumanTerminalAction({ requestPath, requestSha256 }, deps = {}) {
  if ((deps.platform ?? process.platform) === "win32") {
    return { schema: HUMAN_TERMINAL_ACTION_RESULT_SCHEMA, status: "unsupported", code: "HTA-INSPECT-PLATFORM-UNSUPPORTED" };
  }
  try {
    if (!SHA256.test(requestSha256 ?? "")) throw new Error("HTA-REQUEST-DIGEST");
    const directory = dirname(resolve(requestPath));
    privateDirectory(dirname(directory));
    privateDirectory(directory);
    const bytes = readPrivateFile(resolve(requestPath), 0o600);
    const request = JSON.parse(bytes);
    const error = instanceError(request);
    if (error) throw new Error(error);
    const repositoryRoot = realpathSync(resolve(request.repositoryRoot));
    if (repositoryRoot !== resolve(request.repositoryRoot)
      || resolve(requestPath) !== join(repositoryRoot, "scratch", "human-terminal-actions", request.instanceId, "request.json")) {
      throw new Error("HTA-REQUEST-LOCATION");
    }
    if (request.recordSha256 !== requestSha256) throw new Error("HTA-REQUEST-DIGEST-MISMATCH");
    const launcherPath = join(directory, "run-in-terminal.sh");
    const launcher = readPrivateFile(launcherPath, 0o700);
    const expectedLauncher = launcherBytes(
      deps.scriptPath ?? fileURLToPath(new URL("../scripts/human-terminal-action.mjs", import.meta.url)),
      resolve(requestPath),
      request.recordSha256,
    );
    if (!launcher.equals(Buffer.from(expectedLauncher))) throw new Error("HTA-LAUNCHER-DRIFT");
    const catalogBytes = deps.catalogBytes ?? readFileSync(HUMAN_TERMINAL_ACTION_CATALOG_PATH);
    if (sha(catalogBytes) !== request.catalogSha256) throw new Error("HTA-CATALOG-DRIFT");
    const identity = (deps.builderIdentity ?? registeredHumanTerminalActionBuilderIdentity)(request.builderId);
    if (identity.sourceSha256 !== request.builderSourceSha256) throw new Error("HTA-BUILDER-DRIFT");
    const catalog = deps.catalog ?? loadHumanTerminalActionCatalog();
    const entry = humanTerminalActionCatalogEntry(request.templateId, catalog);
    if (entry.builderId !== request.builderId) throw new Error("HTA-TEMPLATE-BUILDER-DRIFT");
    if (canonical(entry.boundary) !== canonical(request.boundary)) throw new Error("HTA-TEMPLATE-BOUNDARY-DRIFT");
    if (!entry.runners.includes(request.runner)) throw new Error("HTA-TEMPLATE-RUNNER-DRIFT");
    if (!entry.platforms.includes(request.platform)) throw new Error("HTA-TEMPLATE-PLATFORM-DRIFT");
    const valueError = validateValues(entry, request.values);
    if (valueError) throw new Error(valueError);
    if (entry.revision !== request.revision
      || canonical(entry.expectedReadback) !== canonical(request.expectedReadback)) throw new Error("HTA-TEMPLATE-DRIFT");
    const built = (deps.build ?? buildRegisteredHumanTerminalAction)(entry.builderId, request.values);
    if (sha(built.output) !== request.builderOutputSha256 || canonical(built.boundary) !== canonical(request.boundary)) throw new Error("HTA-BUILDER-OUTPUT-DRIFT");
    return { schema: HUMAN_TERMINAL_ACTION_RESULT_SCHEMA, status: "inspected", code: "HTA-INSPECTED", request };
  } catch (error) {
    return { schema: HUMAN_TERMINAL_ACTION_RESULT_SCHEMA, status: "refused", code: error.message };
  }
}

export function runHumanTerminalAction(input, deps = {}) {
  const inspected = inspectHumanTerminalAction(input, deps);
  if (inspected.status !== "inspected") return inspected;
  const request = inspected.request;
  const caller = deps.callerEvidence ?? null;
  if (!caller?.trusted || caller.executionBoundary !== request.boundary.executionBoundary
    || caller.invocation !== "user-copy-only" || caller.codexToolCallPermitted !== false || caller.attendedTty !== true) {
    return { schema: HUMAN_TERMINAL_ACTION_RESULT_SCHEMA, status: "refused", code: "HTA-RUN-INVOCATION-FORBIDDEN" };
  }
  // Readback is part of the authority boundary, not optional telemetry. Refuse
  // before the mutating child can start when the producer has not supplied its
  // independent adapter. Once the child has succeeded, however, an adapter
  // failure is an unknown outcome that requires reconciliation, never a safe
  // retry.
  let readbackAdapter = deps.readback;
  if (readbackAdapter === undefined && hasRegisteredHumanTerminalActionReadback(request.builderId)) {
    readbackAdapter = ({ request: current }) => readbackRegisteredHumanTerminalAction(
      current.builderId, { request: current, values: current.values },
    );
  }
  if (typeof readbackAdapter !== "function") {
    return { schema: HUMAN_TERMINAL_ACTION_RESULT_SCHEMA, status: "refused", code: "HTA-RUN-READBACK-UNAVAILABLE" };
  }
  const candidate = (deps.observeCandidate ?? observeCandidate)(request.repositoryRoot);
  if (canonical(candidate) !== canonical(request.candidate)) return { schema: HUMAN_TERMINAL_ACTION_RESULT_SCHEMA, status: "refused", code: "HTA-RUN-CANDIDATE-DRIFT" };
  const spawn = deps.spawn ?? spawnSync;
  const result = spawn(request.builderOutput.executable, request.builderOutput.argv, {
    shell: false,
    stdio: "inherit",
  });
  if (result.status !== 0 || result.signal !== null) return { schema: HUMAN_TERMINAL_ACTION_RESULT_SCHEMA, status: "failed", code: "HTA-RUN-CHILD-FAILED", exitCode: result.status, signal: result.signal };
  let readback = null;
  try { readback = readbackAdapter({ request, expected: request.expectedReadback }); }
  catch { readback = null; }
  const readbackMatches = readback?.status === "verified"
    && readback.code === request.expectedReadback.code
    && readback.schema === request.expectedReadback.schema;
  const readbackStatus = readback === null ? "absent"
    : readback.status !== "verified" ? "failed" : readbackMatches ? "verified" : "mismatched";
  const outcomeKnown = readbackMatches;
  const receipt = {
    schema: HUMAN_TERMINAL_ACTION_RECEIPT_SCHEMA,
    status: outcomeKnown ? "completed" : "outcome-unknown",
    code: outcomeKnown ? "HTA-RUN-COMPLETED" : "HTA-RUN-MANUAL-RECONCILIATION",
    instanceId: request.instanceId, templateId: request.templateId, revision: request.revision,
    requestSha256: request.recordSha256, valuesSha256: sha(request.values), candidateSha256: sha(request.candidate),
    exitCode: 0, outcomeKnown, retrySafe: false, mutationMayHaveOccurred: true,
    resultSchema: outcomeKnown ? readback.schema : null,
    resultCode: outcomeKnown ? readback.code : null,
    readbackStatus, readbackSha256: sha(readback), recordSha256: "",
  };
  receipt.recordSha256 = recordDigest(receipt);
  try {
    const resultPath = join(dirname(resolve(input.requestPath)), "result.json");
    writeExclusive(resultPath, Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`), 0o600);
    const persisted = JSON.parse(readPrivateFile(resultPath, 0o600));
    if (!exactKeys(persisted, Object.keys(receipt)) || persisted.recordSha256 !== recordDigest(persisted)) throw new Error("HTA-RESULT-READBACK");
  }
  catch (error) {
    return {
      schema: HUMAN_TERMINAL_ACTION_RESULT_SCHEMA,
      status: "outcome-unknown",
      code: "HTA-RUN-MANUAL-RECONCILIATION",
      reason: error.message,
      outcomeKnown: false,
      retrySafe: false,
      mutationMayHaveOccurred: true,
    };
  }
  return receipt;
}
