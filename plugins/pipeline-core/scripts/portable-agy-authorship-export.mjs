#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Prepare a bounded PO signing request, then publish only its verified export. */
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { closeSync, constants, existsSync, fstatSync, fsyncSync, linkSync, lstatSync,
  mkdirSync, openSync, readFileSync, realpathSync, statSync, unlinkSync, writeSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { agyHostGitEnvironment } from "../lib/agy-host-commit-admission.mjs";
import { isSafeTaskId } from "../lib/dispatch-record.mjs";
import { parseStrictJson } from "../lib/governance-event.mjs";
import { canonical } from "../lib/po-approval-proof.mjs";
import { PORTABLE_AGY_AUTHORSHIP_EXPORT_SCHEMA, portableAgyAuthorshipRequest,
  preparePortableAgyAuthorshipExport, validatePortableAgyAuthorshipRequest,
  verifyPortableAgyAuthorshipExport } from "../lib/portable-agy-authorship-export.mjs";

const POLICY = "project/critical-human-proof.json";
const MAX_REQUEST = 128 * 1024;
const MAX_PROOF = 16 * 1024;
function fail(code) { return { ok: false, code }; }

function parseArgs(argv) {
  if (!Array.isArray(argv) || argv.length !== 5 || !["prepare", "check", "publish"].includes(argv[0])) return null;
  const values = {};
  for (let i = 1; i < argv.length; i += 2) {
    if (!["--root", "--task-id"].includes(argv[i]) || Object.hasOwn(values, argv[i])) return null;
    values[argv[i]] = argv[i + 1];
  }
  if (!isAbsolute(values["--root"] ?? "") || !isSafeTaskId(values["--task-id"])) return null;
  return { action: argv[0], root: values["--root"], taskId: values["--task-id"] };
}

function physicalRoot(root) {
  const canonicalRoot = realpathSync(root);
  return canonicalRoot === resolve(root) ? canonicalRoot : null;
}

function requestPath(root, taskId) {
  return join(root, "scratch", `agy-authorship-export-request-${createHash("sha256").update(taskId).digest("hex")}.json`);
}

function proofPath(request) {
  const name = basename(request);
  if (!name.startsWith("agy-authorship-export-request-")) throw new Error("invalid request name");
  return join(dirname(request), name.replace("agy-authorship-export-request-", "agy-authorship-export-proof-"));
}

export function physicalDirectory(root, relativePath, { create = false } = {}) {
  let current = root;
  for (const part of relativePath.split("/")) {
    current = join(current, part);
    if (create && !existsSync(current)) mkdirSync(current, { mode: 0o700 });
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("directory is not physical");
  }
  return current;
}

function sameInode(left, right) {
  return String(left.dev) === String(right.dev) && String(left.ino) === String(right.ino);
}

function inPinnedDirectory(path, action) {
  const expected = lstatSync(path);
  if (!expected.isDirectory() || expected.isSymbolicLink()) throw new Error("directory is not physical");
  const previous = process.cwd();
  process.chdir(path);
  try {
    if (!sameInode(expected, statSync("."))) throw new Error("directory changed while pinning");
    const result = action();
    if (!sameInode(expected, lstatSync(path))) throw new Error("directory changed after operation");
    return result;
  } finally { process.chdir(previous); }
}

export function readPhysicalJson(path, maxBytes) {
  return inPinnedDirectory(dirname(path), () => readPinnedJson(basename(path), maxBytes));
}

function readPinnedJson(name, maxBytes) {
  const stat = lstatSync(name);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > maxBytes) {
    throw new Error("artifact is not a bounded physical file");
  }
  const fd = openSync(name, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(fd);
    if (before.dev !== stat.dev || before.ino !== stat.ino || before.size !== stat.size) {
      throw new Error("artifact changed before read");
    }
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size
      || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs
      || bytes.length !== before.size) throw new Error("artifact changed during read");
    return { value: parseStrictJson(bytes), bytes };
  } finally { closeSync(fd); }
}

function syncDirectory() {
  let fd;
  try {
    fd = openSync(".", constants.O_RDONLY);
    fsyncSync(fd);
  } catch (error) {
    if (!["EPERM", "EINVAL", "EISDIR", "EACCES", "ENOTSUP", "EBADF"].includes(error?.code)) throw error;
  } finally { if (fd !== undefined) closeSync(fd); }
}

/** Exclusive, inode-checked publication; never reads a substituted target. */
export function publishExclusiveAgyExportArtifact(path, bytes, mode) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_REQUEST
    || ![0o600, 0o644].includes(mode)) throw new TypeError("bounded publication input required");
  return inPinnedDirectory(dirname(path), () => {
    const target = basename(path);
    if (target === "." || target === ".." || target.includes("/") || target.includes("\\")) {
      throw new Error("invalid target name");
    }
    const temporary = `.agy-export-${randomBytes(16).toString("hex")}.tmp`;
    let fd;
    let targetFd;
    try {
      fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
        | (constants.O_NOFOLLOW ?? 0), mode);
      let written = 0;
      while (written < bytes.length) {
        const count = writeSync(fd, bytes, written, bytes.length - written, written);
        if (!Number.isSafeInteger(count) || count <= 0) throw new Error("publication write incomplete");
        written += count;
      }
      fsyncSync(fd);
      const source = fstatSync(fd);
      linkSync(temporary, target);
      targetFd = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      const admitted = fstatSync(targetFd);
      if (!sameInode(source, admitted) || admitted.size !== bytes.length) {
        throw new Error("publication target replaced");
      }
      unlinkSync(temporary);
      syncDirectory();
      const readback = readFileSync(targetFd);
      const final = fstatSync(targetFd);
      const pathStat = lstatSync(target);
      if (!pathStat.isFile() || pathStat.isSymbolicLink() || !sameInode(admitted, final)
        || !sameInode(pathStat, final) || final.size !== admitted.size
        || final.mtimeMs !== admitted.mtimeMs || !readback.equals(bytes)) {
        throw new Error("publication readback changed");
      }
    } finally {
      if (targetFd !== undefined) closeSync(targetFd);
      if (fd !== undefined) closeSync(fd);
      try { unlinkSync(temporary); } catch {}
    }
  });
}

function committedAnchors(root, parent) {
  const raw = execFileSync("git", ["-C", root, "show", `${parent}:${POLICY}`], {
    encoding: "utf8", timeout: 10_000, maxBuffer: 1024 * 1024,
    env: { ...agyHostGitEnvironment(), GIT_OPTIONAL_LOCKS: "0", GIT_CONFIG_NOSYSTEM: "1" },
    stdio: ["ignore", "pipe", "ignore"],
  });
  const policy = parseStrictJson(raw);
  return policy?.schema === "pipeline.critical-human-proof-policy.v3" ? policy.trustAnchors : null;
}

export async function runPortableAgyAuthorshipExport(argv = process.argv.slice(2), dependencies = {}) {
  const args = parseArgs(argv);
  if (!args) return fail("AGY-EXPORT-USAGE");
  let root;
  try { root = physicalRoot(args.root); }
  catch { return fail("AGY-EXPORT-ROOT"); }
  if (!root) return fail("AGY-EXPORT-ROOT-ALIAS");
  // The injected preparer is only a test seam. Direct CLI invocation always
  // reopens the local Git, private host receipt and Critic evidence itself.
  const prepared = await (dependencies.prepare ?? preparePortableAgyAuthorshipExport)({ root, taskId: args.taskId });
  if (!prepared.ok) return fail(prepared.code);
  const request = portableAgyAuthorshipRequest(prepared);
  const path = requestPath(root, args.taskId);
  if (args.action === "prepare") {
    const expectedBytes = Buffer.from(`${canonical(request)}\n`, "utf8");
    try {
      physicalDirectory(root, "scratch", { create: true });
      publishExclusiveAgyExportArtifact(path, expectedBytes, 0o600);
    } catch (error) {
      if (error?.code !== "EEXIST") return fail("AGY-EXPORT-REQUEST-WRITE");
      // A retry of the same admitted subject needs no second signing intent.
      // A different or aliased file is never replaced or accepted.
      try {
        if (!readPhysicalJson(path, MAX_REQUEST).bytes.equals(expectedBytes)) {
          return fail("AGY-EXPORT-REQUEST-DRIFT");
        }
      } catch { return fail("AGY-EXPORT-REQUEST-DRIFT"); }
    }
    return { ok: true, code: "AGY-EXPORT-SIGNATURE-REQUEST-READY",
      requestPath: path, intentSha256: request.intentSha256,
      authoredCommit: request.subject.authoredCommit, exportPath: request.exportPath };
  }
  if (args.action === "check") {
    try {
      physicalDirectory(root, "scratch");
      const stored = readPhysicalJson(path, MAX_REQUEST);
      if (!stored.bytes.equals(Buffer.from(`${canonical(stored.value)}\n`, "utf8"))
        || !validatePortableAgyAuthorshipRequest(stored.value)
        || canonical(stored.value) !== canonical(request)) return fail("AGY-EXPORT-REQUEST-DRIFT");
      return { ok: true, code: "AGY-EXPORT-LOCAL-PASS-BOUND",
        requestPath: path, intentSha256: request.intentSha256 };
    } catch { return fail("AGY-EXPORT-REQUEST-UNAVAILABLE"); }
  }
  let storedRequest;
  let proof;
  try {
    physicalDirectory(root, "scratch");
    const requestFile = readPhysicalJson(path, MAX_REQUEST);
    if (!requestFile.bytes.equals(Buffer.from(`${canonical(requestFile.value)}\n`, "utf8"))) {
      return fail("AGY-EXPORT-REQUEST-BYTES");
    }
    storedRequest = requestFile.value;
    proof = readPhysicalJson(proofPath(path), MAX_PROOF).value;
  } catch { return fail("AGY-EXPORT-REQUEST-OR-PROOF-UNAVAILABLE"); }
  if (!validatePortableAgyAuthorshipRequest(storedRequest)
    || canonical(storedRequest) !== canonical(request)) return fail("AGY-EXPORT-REQUEST-DRIFT");
  let anchors;
  try { anchors = committedAnchors(root, request.subject.parentCommit); }
  catch { return fail("AGY-EXPORT-TRUST-ANCHOR-UNAVAILABLE"); }
  const exportRecord = { schema: PORTABLE_AGY_AUTHORSHIP_EXPORT_SCHEMA,
    subject: request.subject, approvalIntent: request.approvalIntent, proof };
  const checked = verifyPortableAgyAuthorshipExport({ exportRecord,
    taskId: args.taskId, commit: request.subject.authoredCommit,
    tree: request.subject.authoredTree, parent: request.subject.parentCommit,
    changedPaths: request.subject.changedPaths, trustAnchors: anchors });
  if (!checked.ok) return fail("AGY-EXPORT-PROOF-INVALID");
  const expectedExportBytes = Buffer.from(`${canonical(exportRecord)}\n`, "utf8");
  let alreadyPublished = false;
  try {
    physicalDirectory(root, "project/agy-authorship-exports", { create: true });
    const target = join(root, request.exportPath);
    try { publishExclusiveAgyExportArtifact(target, expectedExportBytes, 0o644); }
    catch (error) {
      if (error?.code !== "EEXIST") return fail("AGY-EXPORT-PUBLICATION-FAILED");
      try {
        if (!readPhysicalJson(target, MAX_REQUEST).bytes.equals(expectedExportBytes)) {
          return fail("AGY-EXPORT-PUBLICATION-DRIFT");
        }
        alreadyPublished = true;
      } catch { return fail("AGY-EXPORT-PUBLICATION-DRIFT"); }
    }
    return { ok: true, code: alreadyPublished ? "AGY-EXPORT-ALREADY-PUBLISHED" : "AGY-EXPORT-PUBLISHED-UNCOMMITTED", exportPath: target,
      authoredCommit: request.subject.authoredCommit, signer: checked.signer };
  } catch { return fail("AGY-EXPORT-PUBLICATION-FAILED"); }
}

if (isDirectInvocation(import.meta.url)) {
  runPortableAgyAuthorshipExport().then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  }, () => {
    process.stderr.write("AGY-EXPORT-FAILED\n");
    process.exitCode = 1;
  });
}
