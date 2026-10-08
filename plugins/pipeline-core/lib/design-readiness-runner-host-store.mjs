// SPDX-License-Identifier: SUL-1.0

/** Repository-private, immutable host observations for non-Codex readiness runs. */
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync, constants, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync,
  realpathSync, unlinkSync, writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { canonicalJson } from "./codex-sandbox-compatibility.mjs";
import { parseStrictJson } from "./governance-event.mjs";
import { fsyncDirectoryDurable } from "./fs-durability.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const OID = /^[a-f0-9]{40,64}$/u;
const ID = /^drh_[a-f0-9]{32}$/u;
const RUNNERS = new Set(["claude", "antigravity"]);
const NAMES = ["input", "prd", "spec", "design", "traceability"];
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };

function exact(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function sameFile(left, right) {
  return left.isFile() === right.isFile() && left.dev === right.dev && left.ino === right.ino
    && left.mode === right.mode && left.nlink === right.nlink && left.size === right.size
    && left.mtimeNs === right.mtimeNs;
}

function validateRecord(record, { repoFingerprint, receiptId } = {}) {
  const keys = ["schema", "receiptId", "runner", "repoFingerprint", "dispatchId", "candidate", "sources", "route", "executableSha256", "requestSha256", "responseSha256", "dutyReceiptSha256", "child", "createdAt"];
  if (!exact(record, keys) || record.schema !== "pipeline.design-readiness-runner-host-receipt.v1"
    || !ID.test(record.receiptId ?? "") || (receiptId !== undefined && record.receiptId !== receiptId)
    || !RUNNERS.has(record.runner) || !SHA256.test(record.repoFingerprint ?? "")
    || (repoFingerprint !== undefined && record.repoFingerprint !== repoFingerprint)
    || typeof record.dispatchId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(record.dispatchId)
    || !exact(record.candidate, ["commit", "tree"]) || !OID.test(record.candidate.commit ?? "") || !OID.test(record.candidate.tree ?? "")
    || !exact(record.sources, NAMES) || NAMES.some((name) => !exact(record.sources[name], ["path", "sha256"])
      || typeof record.sources[name].path !== "string" || !SHA256.test(record.sources[name].sha256 ?? ""))
    || new Set(NAMES.map((name) => record.sources[name].path)).size !== NAMES.length
    || !exact(record.route, ["model", "effort", "sourceSha256", "candidateCommit"])
    || typeof record.route.model !== "string" || !record.route.model
    || typeof record.route.effort !== "string" || !record.route.effort
    || !SHA256.test(record.route.sourceSha256 ?? "") || record.route.candidateCommit !== record.candidate.commit
    || !SHA256.test(record.executableSha256 ?? "") || !SHA256.test(record.requestSha256 ?? "")
    || !SHA256.test(record.responseSha256 ?? "") || !SHA256.test(record.dutyReceiptSha256 ?? "")
    || !exact(record.child, ["started", "exitCode", "signal", "stdoutStatus", "writeToolsObserved"])
    || record.child.started !== true || record.child.exitCode !== 0 || record.child.signal !== null
    || record.child.stdoutStatus !== "complete" || record.child.writeToolsObserved !== false
    || typeof record.createdAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(record.createdAt)
    || !Number.isFinite(Date.parse(record.createdAt))) return false;
  return true;
}

function checkedDirectory(path, { create = false, privateMode = true } = {}) {
  if (create) {
    try { mkdirSync(path, { mode: 0o700 }); }
    catch (error) { if (error?.code !== "EEXIST") throw error; }
  }
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(path) !== path
    || (privateMode && process.platform !== "win32" && (stat.mode & 0o077) !== 0)) fail("DRHS-UNSAFE-DIRECTORY");
}

function ensurePrivatePath(gitCommonDir, repoFingerprint) {
  const common = realpathSync(gitCommonDir);
  if (common !== gitCommonDir) fail("DRHS-UNSAFE-COMMON-DIR");
  const root = join(common, "agent-pipeline");
  const readiness = join(root, "design-readiness");
  const repository = join(readiness, repoFingerprint);
  checkedDirectory(root, { create: true, privateMode: false });
  checkedDirectory(readiness, { create: true });
  checkedDirectory(repository, { create: true });
  return repository;
}

function readPrivate(path, expected) {
  let descriptor;
  try {
    const before = lstatSync(path, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
      || (process.platform !== "win32" && (before.mode & 0o077n) !== 0n)) return null;
    descriptor = openSync(path, constants.O_RDONLY | (process.platform === "win32" ? 0 : (constants.O_NOFOLLOW ?? 0)));
    const opened = fstatSync(descriptor, { bigint: true });
    if (!sameFile(before, opened)) return null;
    const raw = readFileSync(descriptor);
    const afterDescriptor = fstatSync(descriptor, { bigint: true });
    const afterPath = lstatSync(path, { bigint: true });
    if (!sameFile(opened, afterDescriptor) || !sameFile(afterDescriptor, afterPath)
      || afterPath.isSymbolicLink() || afterPath.nlink !== 1n
      || (process.platform !== "win32" && (afterPath.mode & 0o077n) !== 0n)) return null;
    const value = parseStrictJson(raw);
    if (!validateRecord(value, expected) || !raw.equals(Buffer.from(canonicalJson(value), "utf8"))) return null;
    return { value, sha256: digest(raw) };
  } catch { return null; }
  finally { if (descriptor !== undefined) try { closeSync(descriptor); } catch { /* descriptor already closed */ } }
}

/**
 * Creates a repository-private write-once store. Records are local
 * host-observation receipts, not provider attestations or portable evidence.
 */
export function createDesignReadinessRunnerHostStore({ gitCommonDir, repoFingerprint } = {}) {
  if (typeof gitCommonDir !== "string" || !/^[a-f0-9]{64}$/u.test(repoFingerprint ?? "")) fail("DRHS-INPUT");
  const directory = ensurePrivatePath(gitCommonDir, repoFingerprint);
  const pathFor = (receiptId) => {
    if (!ID.test(receiptId ?? "")) fail("DRHS-ID");
    return join(directory, `${receiptId}.json`);
  };
  return Object.freeze({
    read(receiptId) { return readPrivate(pathFor(receiptId), { repoFingerprint, receiptId }); },
    write(record) {
      if (!validateRecord(record, { repoFingerprint })) fail("DRHS-RECORD-INVALID");
      const path = pathFor(record.receiptId);
      checkedDirectory(directory);
      const raw = Buffer.from(canonicalJson(record), "utf8");
      const temporary = join(directory, `.${record.receiptId}.${randomUUID()}.tmp`);
      let descriptor;
      let linked = false;
      let directoryDurability = "confirmed";
      try {
        descriptor = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
          | (process.platform === "win32" ? 0 : (constants.O_NOFOLLOW ?? 0)), 0o600);
        writeFileSync(descriptor, raw);
        fsyncSync(descriptor);
        closeSync(descriptor);
        descriptor = undefined;
        linkSync(temporary, path);
        linked = true;
        unlinkSync(temporary);
        try {
          fsyncDirectoryDurable(directory);
        } catch (error) {
          directoryDurability = ["EINVAL", "ENOTSUP", "EISDIR", "EPERM"].includes(error?.code) ? "unsupported" : "unknown";
        }
      } catch (error) {
        if (error?.code === "EEXIST" && !linked) fail("DRHS-ALREADY-EXISTS");
        throw error;
      } finally {
        if (descriptor !== undefined) closeSync(descriptor);
        try { unlinkSync(temporary); } catch { /* temporary already unlinked or never created */ }
      }
      const readback = readPrivate(path, { repoFingerprint, receiptId: record.receiptId });
      if (!readback || !raw.equals(Buffer.from(canonicalJson(readback.value), "utf8"))) fail("DRHS-WRITE-READBACK");
      return { path, sha256: readback.sha256, directoryDurability };
    },
  });
}

export function designReadinessRunnerHostReceiptSha256(record) {
  if (!validateRecord(record)) fail("DRHS-RECORD-INVALID");
  return digest(Buffer.from(canonicalJson(record), "utf8"));
}
