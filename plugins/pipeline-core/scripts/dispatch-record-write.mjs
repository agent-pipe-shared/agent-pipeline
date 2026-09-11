#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { randomBytes, createHash } from "node:crypto";
import { closeSync, constants, existsSync, fstatSync, fsyncSync, linkSync, lstatSync, openSync, readFileSync, realpathSync, statSync, unlinkSync, writeSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { normalizeDispatchRecordPath, validateDispatchRecord } from "../lib/dispatch-record.mjs";
import { compareRecordedModel } from "../lib/agent-model-registry.mjs";

const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const REQUEST_SCHEMA = "pipeline.dispatch-record-write-request.v1";
const RECEIPT_SCHEMA = "pipeline.dispatch-record-write-receipt.v1";

function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail("request-shape", `${label} is not closed`);
}
function inside(root, path) {
  const rel = relative(root, path);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${"/"}`) && !rel.startsWith("..\\");
}
function physicalRoot(path) {
  const absolute = resolve(path);
  const info = lstatSync(absolute);
  if (!info.isDirectory() || info.isSymbolicLink()) fail("repo-root", "repository root is not a physical directory");
  return realpathSync(absolute);
}
function sameIdentity(left, right) { return String(left.dev) === String(right.dev) && String(left.ino) === String(right.ino); }
function sameSnapshot(left, right) {
  return sameIdentity(left, right) && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}
function sameFileContentSnapshot(left, right) {
  return sameIdentity(left, right) && left.size === right.size && left.mtimeMs === right.mtimeMs;
}
function pinnedDirectory(path, afterPinned, action) {
  const expected = lstatSync(path);
  if (!expected.isDirectory() || expected.isSymbolicLink()) fail("path-race", "directory changed before pinning");
  const saved = process.cwd();
  process.chdir(path);
  try {
    const pinned = statSync(".");
    if (!sameIdentity(expected, pinned)) fail("path-race", "directory identity changed while pinning");
    if (typeof afterPinned === "function") afterPinned({ path, identity: { dev: String(pinned.dev), ino: String(pinned.ino) } });
    return action();
  } finally { process.chdir(saved); }
}
function readPhysicalRequest(root, relativePath, dependencies) {
  const normalized = normalizeDispatchRecordPath(relativePath, "request path");
  const absolute = resolve(root, normalized);
  const parent = dirname(absolute);
  const parentInfo = lstatSync(parent);
  if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink() || !inside(root, realpathSync(parent))) fail("request-path", "request parent is not a physical repository-local directory");
  return pinnedDirectory(parent, dependencies.afterRequestDirectoryPinned, () => {
    const name = basename(absolute);
    const expected = lstatSync(name);
    if (!expected.isFile() || expected.isSymbolicLink() || expected.size === 0 || expected.size > MAX_REQUEST_BYTES) fail("request-path", "request is not a bounded physical file");
    const noFollow = constants.O_NOFOLLOW ?? 0;
    const fd = (dependencies.openSync ?? openSync)(name, constants.O_RDONLY | noFollow);
    try {
      const before = (dependencies.fstatSync ?? fstatSync)(fd);
      if (!before.isFile() || !sameIdentity(expected, before) || before.size !== expected.size) fail("path-race", "request changed before descriptor admission");
      const raw = (dependencies.readFileSync ?? readFileSync)(fd);
      const after = (dependencies.fstatSync ?? fstatSync)(fd);
      if (!sameSnapshot(before, after) || raw.length !== before.size) fail("path-race", "request changed while reading");
      return raw;
    } finally { (dependencies.closeSync ?? closeSync)(fd); }
  });
}
function physicalParent(root, target) {
  const parent = dirname(target);
  const info = lstatSync(parent);
  if (!info.isDirectory() || info.isSymbolicLink() || !inside(root, realpathSync(parent))) fail("target-path", "target parent is not a physical repository-local directory");
  return parent;
}
function completeWrite(fd, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const count = writeSync(fd, bytes, offset, bytes.length - offset, offset);
    if (!Number.isSafeInteger(count) || count <= 0) fail("write-incomplete", "dispatch record write made no progress");
    offset += count;
  }
}
function syncDirectory(path, dependencies) {
  let fd;
  try {
    fd = (dependencies.openDirectorySync ?? openSync)(path, "r");
    (dependencies.fsyncSync ?? fsyncSync)(fd);
  } catch (error) {
    if (!["EPERM", "EINVAL", "EISDIR", "EACCES", "ENOTSUP", "EBADF"].includes(error?.code)) throw error;
  } finally { if (fd !== undefined) (dependencies.closeSync ?? closeSync)(fd); }
}
function decodeJson(buffer) {
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(buffer); } catch { fail("request-json", "dispatch record request is not valid UTF-8"); }
  let at = 0;
  const ws = () => { while (/\s/u.test(text[at] ?? "")) at += 1; };
  const string = () => {
    if (text[at] !== '"') fail("request-json", `invalid JSON string at byte ${at}`);
    const start = at++;
    while (at < text.length) {
      const char = text[at++];
      if (char === "\\") { at += 1; continue; }
      if (char === '"') { try { return JSON.parse(text.slice(start, at)); } catch { fail("request-json", `invalid JSON string at byte ${start}`); } }
    }
    fail("request-json", `unterminated JSON string at byte ${start}`);
  };
  const value = () => {
    ws();
    if (text[at] === "{") {
      at += 1; ws(); const keys = new Set();
      if (text[at] === "}") { at += 1; return; }
      while (true) {
        const key = string(); if (keys.has(key)) fail("request-json", `duplicate JSON key: ${key}`); keys.add(key); ws();
        if (text[at++] !== ":") fail("request-json", `expected ':' at byte ${at - 1}`);
        value(); ws(); const delimiter = text[at++]; if (delimiter === "}") return; if (delimiter !== ",") fail("request-json", `expected ',' or '}' at byte ${at - 1}`); ws();
      }
    }
    if (text[at] === "[") {
      at += 1; ws(); if (text[at] === "]") { at += 1; return; }
      while (true) { value(); ws(); const delimiter = text[at++]; if (delimiter === "]") return; if (delimiter !== ",") fail("request-json", `expected ',' or ']' at byte ${at - 1}`); }
    }
    if (text[at] === '"') { string(); return; }
    const token = text.slice(at).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u)?.[0];
    if (!token) fail("request-json", `invalid JSON value at byte ${at}`); at += token.length;
  };
  value(); ws(); if (at !== text.length) fail("request-json", `unexpected data after JSON at byte ${at}`);
  return JSON.parse(text);
}

export function writeDispatchRecord({ repoRoot, requestPath }, dependencies = {}) {
  const root = physicalRoot(repoRoot);
  const requestRaw = readPhysicalRequest(root, requestPath, dependencies);
  if (requestRaw.length === 0 || requestRaw.length > MAX_REQUEST_BYTES) fail("request-size", "dispatch record request is empty or oversized");
  let request;
  try { request = decodeJson(requestRaw); } catch (error) { if (error?.code === "request-json") throw error; fail("request-json", "dispatch record request is not JSON"); }
  exactKeys(request, ["schema", "target", "record"], "dispatch record write request");
  if (request.schema !== REQUEST_SCHEMA) fail("request-schema", `request schema must be ${REQUEST_SCHEMA}`);
  const record = validateDispatchRecord(request.record);
  const modelCheck = compareRecordedModel(record);
  if (modelCheck.classification !== "model-matches") fail("record-model", `record model/effort is not bound to agentType without caller authority: ${modelCheck.reason}`);
  const targetRelative = normalizeDispatchRecordPath(request.target, "target path");
  const expected = `evidence/dispatch-record-${record.taskId}.json`;
  if (targetRelative !== expected) fail("target-path", `target must exactly match ${expected}`);
  const target = resolve(root, targetRelative);
  const parent = physicalParent(root, target);
  const bytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`, "utf8");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const nonce = (dependencies.randomBytes ?? randomBytes)(16).toString("hex");
  const temporaryName = `.${record.taskId}.${nonce}.dispatch-record.tmp`;
  const targetName = basename(target);
  pinnedDirectory(parent, dependencies.afterTargetDirectoryPinned, () => {
    if (existsSync(targetName)) fail("target-exists", "dispatch record target already exists");
    let fd;
    let targetFd;
    try {
      fd = (dependencies.openSync ?? openSync)(temporaryName, "wx", 0o600);
      (dependencies.completeWrite ?? completeWrite)(fd, bytes);
      (dependencies.fsyncSync ?? fsyncSync)(fd);
      const sourceIdentity = (dependencies.fstatSync ?? fstatSync)(fd);
      (dependencies.linkSync ?? linkSync)(temporaryName, targetName);
      const noFollow = constants.O_NOFOLLOW ?? 0;
      targetFd = (dependencies.openSync ?? openSync)(targetName, constants.O_RDONLY | noFollow);
      const targetIdentity = (dependencies.fstatSync ?? fstatSync)(targetFd);
      if (!sameIdentity(sourceIdentity, targetIdentity) || sourceIdentity.size !== bytes.length) fail("publication-race", "published target is not the validated temporary inode");
      (dependencies.closeSync ?? closeSync)(fd); fd = undefined;
      (dependencies.unlinkSync ?? unlinkSync)(temporaryName);
      (dependencies.syncDirectory ?? syncDirectory)(".", dependencies);
      const readback = (dependencies.readFileSync ?? readFileSync)(targetFd);
      const finalIdentity = (dependencies.fstatSync ?? fstatSync)(targetFd);
      const targetInfo = lstatSync(targetName);
      if (!targetInfo.isFile() || targetInfo.isSymbolicLink() || !sameFileContentSnapshot(targetIdentity, finalIdentity) || !sameIdentity(targetInfo, finalIdentity)
        || !readback.equals(bytes) || createHash("sha256").update(readback).digest("hex") !== digest) fail("readback", "dispatch record publication readback failed");
      (dependencies.closeSync ?? closeSync)(targetFd); targetFd = undefined;
    } catch (error) {
      if (fd !== undefined) try { (dependencies.closeSync ?? closeSync)(fd); } catch {}
      if (targetFd !== undefined) try { (dependencies.closeSync ?? closeSync)(targetFd); } catch {}
      try { if (existsSync(temporaryName)) (dependencies.unlinkSync ?? unlinkSync)(temporaryName); } catch {}
      throw error;
    }
  });
  return { schema: RECEIPT_SCHEMA, target: targetRelative, sha256: digest, bytes: bytes.length };
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]; const value = argv[index + 1];
    if (!["--repo-root", "--request"].includes(key) || !value || Object.hasOwn(values, key)) fail("usage", "usage: dispatch-record-write.mjs --repo-root <path> --request <repo-relative-json>");
    values[key] = value;
  }
  if (!values["--repo-root"] || !values["--request"]) fail("usage", "usage: dispatch-record-write.mjs --repo-root <path> --request <repo-relative-json>");
  return { repoRoot: values["--repo-root"], requestPath: values["--request"] };
}
if (isDirectInvocation(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(writeDispatchRecord(parseArgs(process.argv.slice(2))))}\n`); }
  catch (error) { process.stderr.write(`DISPATCH-RECORD-WRITE-FAILED: ${error.code ?? "error"}: ${error.message}\n`); process.exitCode = 2; }
}
