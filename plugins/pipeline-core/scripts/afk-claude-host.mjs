#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  SUPPORTED_ADAPTER,
  SUPPORTED_TOOLS,
  canonicalJson,
  canonicalJsonFile,
  sha256Raw,
  validateActivationReceipt,
} from "../lib/afk-assumption-mode.mjs";
import {
  createAfkWorkerRequest,
  validateAfkWorkerRequest,
  validateAfkWorkerResult,
} from "../lib/afk-capability-worker.mjs";
import { executeAfkEntryHostTransaction } from "../lib/afk-transaction-host.mjs";

const MAX_INPUT = 512 * 1024;
const SHA256 = /^[0-9a-f]{64}$/u;
const PREPARE_KEYS = ["receipt", "sequence", "dispatchId", "attempt", "current", "prior", "readSnapshot"];

export const EXIT = Object.freeze({ OK: 0, BLOCKED: 2 });

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return object(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function fail(code, detail = null, mutation = "none") {
  return { ok: false, code, detail, mutation };
}

function parseCanonical(raw) {
  const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw ?? "");
  if (bytes.length === 0 || bytes.length > MAX_INPUT || bytes.includes(0)) return null;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const value = JSON.parse(text);
    return text === canonicalJsonFile(value) ? value : null;
  } catch {
    return null;
  }
}

function git(root, args) {
  const result = spawnSync("git", ["-C", root, "--no-optional-locks", ...args], {
    encoding: "utf8",
    shell: false,
    timeout: 5000,
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
      GIT_TERMINAL_PROMPT: "0",
      GIT_PAGER: "cat",
    },
  });
  if (result.status !== 0 || result.error) throw new Error("trusted Git observation failed");
  return result.stdout.trim();
}

function commonDir(root) {
  const path = git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const absolute = realpathSync(isAbsolute(path) ? path : resolve(root, path));
  if (!lstatSync(absolute).isDirectory()) throw new Error("Git common directory unavailable");
  return absolute;
}

function observeCurrent(root, privateRef) {
  const objectFormat = git(root, ["rev-parse", "--show-object-format"]);
  const commit = git(root, ["rev-parse", "--verify", privateRef]);
  const tree = git(root, ["rev-parse", "--verify", `${privateRef}^{tree}`]);
  return { commit, tree, objectFormat };
}

function ensurePrivateDirectory(root, components) {
  let cursor = root;
  for (const component of components) {
    cursor = join(cursor, component);
    if (!existsSync(cursor)) mkdirSync(cursor, { mode: 0o700 });
    const info = lstatSync(cursor);
    if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(cursor) !== cursor) {
      throw new Error("unsafe request directory");
    }
    chmodSync(cursor, 0o700);
  }
  return cursor;
}

function requestPath(root, requestId) {
  if (!SHA256.test(requestId)) throw new Error("invalid request ID");
  const parent = ensurePrivateDirectory(commonDir(root), ["agent-pipeline", "afk", "worker-requests"]);
  return join(parent, `${requestId}.json`);
}

function fsyncFile(path) {
  const fd = openSync(path, constants.O_RDONLY);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function storePrepared(root, request) {
  const path = requestPath(root, request.requestSha256);
  const bytes = canonicalJsonFile(request);
  if (existsSync(path)) {
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink() || realpathSync(path) !== path
      || readFileSync(path, "utf8") !== bytes) throw new Error("request ID conflict");
    return;
  }
  writeFileSync(path, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(path, 0o600);
  fsyncFile(path);
  fsyncFile(dirname(path));
}

function loadPrepared(root, requestId) {
  const path = requestPath(root, requestId);
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || realpathSync(path) !== path || (info.mode & 0o777) !== 0o600) {
    throw new Error("unsafe prepared request");
  }
  const value = parseCanonical(readFileSync(path));
  if (value === null || !validateAfkWorkerRequest(value).ok || value.requestSha256 !== requestId) {
    throw new Error("invalid prepared request");
  }
  return value;
}

export function validateClaudeWorkerDefinition(bytes) {
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return false; }
  const lines = text.split(/\r?\n/u);
  if (lines[0] !== "---") return false;
  const end = lines.indexOf("---", 1);
  if (end < 2) return false;
  const frontmatter = lines.slice(1, end);
  const toolLines = frontmatter.filter((line) => /^tools:/u.test(line));
  if (toolLines.length !== 1) return false;
  const tools = toolLines[0].slice("tools:".length).split(",").map((value) => value.trim());
  if (tools.length !== SUPPORTED_TOOLS.length
    || new Set(tools).size !== tools.length
    || JSON.stringify([...tools].sort()) !== JSON.stringify(SUPPORTED_TOOLS)) return false;
  return !frontmatter.some((line) => /^(?:memory|permissionMode|mcpServers|hooks):/u.test(line));
}

function adapterBytes(root, readFile = readFileSync) {
  return readFile(join(root, "plugins", "pipeline-core", "agents", "afk-claude-worker.md"));
}

export async function prepareClaudeWorker(envelope, dependencies = {}) {
  if (!exactKeys(envelope, PREPARE_KEYS)) return fail("AFK-WORKER-PREPARE-INVALID");
  const receipt = validateActivationReceipt(envelope.receipt);
  if (!receipt.ok || envelope.receipt.surface.adapterId !== SUPPORTED_ADAPTER) return fail("AFK-WORKER-AUTHORITY-INVALID");
  let root;
  let definition;
  let observed;
  try {
    root = resolve(dependencies.root ?? process.cwd());
    definition = dependencies.adapterBytes ?? adapterBytes(root, dependencies.readFile);
    observed = dependencies.observeCurrent
      ? await dependencies.observeCurrent(envelope.receipt, root)
      : observeCurrent(root, `refs/agent-pipeline/afk/${envelope.receipt.activationId}`);
  } catch {
    return fail("AFK-WORKER-HOST-OBSERVATION-FAILED");
  }
  if (!validateClaudeWorkerDefinition(definition)
    || sha256Raw(definition) !== envelope.receipt.surface.adapterSha256
    || canonicalJson(observed) !== canonicalJson(envelope.current)) {
    return fail("AFK-WORKER-SURFACE-DRIFT");
  }
  const created = createAfkWorkerRequest({
    receipt: envelope.receipt,
    sequence: envelope.sequence,
    dispatchId: envelope.dispatchId,
    attempt: envelope.attempt,
    current: envelope.current,
    prior: envelope.prior,
    readSnapshot: envelope.readSnapshot,
    adapterSha256: sha256Raw(definition),
  });
  if (!created.ok) return created;
  try {
    await (dependencies.storePrepared ?? ((request) => storePrepared(root, request)))(created.request);
  } catch {
    return fail("AFK-WORKER-REQUEST-STORE-FAILED");
  }
  return { ok: true, code: "AFK-WORKER-REQUEST-PREPARED", mutation: "request-store", request: created.request };
}

export async function finalizeClaudeWorker(rawResult, requestId, dependencies = {}) {
  if (!SHA256.test(requestId)) return fail("AFK-WORKER-REQUEST-ID-INVALID");
  const value = parseCanonical(rawResult);
  if (value === null) return fail("AFK-WORKER-RESULT-INVALID");
  let root;
  let request;
  let definition;
  let observed;
  try {
    root = resolve(dependencies.root ?? process.cwd());
    request = await (dependencies.loadPrepared ?? ((id) => loadPrepared(root, id)))(requestId);
    definition = dependencies.adapterBytes ?? adapterBytes(root, dependencies.readFile);
    observed = dependencies.observeCurrent
      ? await dependencies.observeCurrent(request, root)
      : observeCurrent(root, request.privateRef);
  } catch {
    return fail("AFK-WORKER-PREPARED-REQUEST-UNAVAILABLE");
  }
  if (!validateClaudeWorkerDefinition(definition) || sha256Raw(definition) !== request.adapter.sha256
    || canonicalJson(observed) !== canonicalJson(request.current)) return fail("AFK-WORKER-SURFACE-DRIFT");
  const checked = validateAfkWorkerResult(value, request);
  if (!checked.ok) return checked;
  let transaction;
  try {
    const entryTransaction = dependencies.entryTransaction
      ?? ((input) => executeAfkEntryHostTransaction({
        root,
        ...input,
        recordedAt: (dependencies.now ? dependencies.now() : new Date()).toISOString(),
        refreshProjection: dependencies.refreshProjection,
      }));
    transaction = await entryTransaction({
      request,
      proposal: checked.proposal,
    });
  } catch {
    return fail("AFK-A3-TRANSACTION-FAILED", null, "unknown");
  }
  if (transaction?.ok !== true) {
    return fail(transaction?.code ?? "AFK-A3-TRANSACTION-FAILED", null,
      ["none", "wal"].includes(transaction?.mutation) ? transaction.mutation : "unknown");
  }
  return {
    ok: true,
    code: "AFK-WORKER-RESULT-RECORDED",
    mutation: "wal",
    requestSha256: request.requestSha256,
    resultSha256: value.resultSha256,
    status: transaction.status,
  };
}

function parseArgs(argv) {
  const command = argv[0];
  let root = null;
  let request = null;
  for (let index = 1; index < argv.length; index += 2) {
    if (argv[index] === "--root") root = argv[index + 1];
    else if (argv[index] === "--request") request = argv[index + 1];
    else return null;
  }
  if (!new Set(["prepare", "finalize"]).has(command) || !isAbsolute(root ?? "")) return null;
  if ((command === "finalize") !== SHA256.test(request ?? "")) return null;
  if (command === "prepare" && request !== null) return null;
  return { command, root: resolve(root), request };
}

async function readStdin(stream) {
  const chunks = [];
  let length = 0;
  for await (const chunk of stream) {
    length += chunk.length;
    if (length > MAX_INPUT) throw new Error("stdin too large");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const options = parseArgs(argv);
  if (options === null) {
    (io.stdout ?? process.stdout).write(canonicalJsonFile(fail("AFK-WORKER-USAGE")));
    return EXIT.BLOCKED;
  }
  let raw;
  try { raw = await readStdin(io.stdin ?? process.stdin); } catch {
    (io.stdout ?? process.stdout).write(canonicalJsonFile(fail("AFK-WORKER-INPUT-INVALID")));
    return EXIT.BLOCKED;
  }
  const dependencies = { root: options.root, ...(io.dependencies ?? {}) };
  const outcome = options.command === "prepare"
    ? await prepareClaudeWorker(parseCanonical(raw), dependencies)
    : await finalizeClaudeWorker(raw, options.request, dependencies);
  (io.stdout ?? process.stdout).write(canonicalJsonFile(outcome));
  return outcome.ok ? EXIT.OK : EXIT.BLOCKED;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
