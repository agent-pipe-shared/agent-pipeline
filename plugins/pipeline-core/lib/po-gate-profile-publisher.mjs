// SPDX-License-Identifier: SUL-1.0

import { createHash, randomUUID as nodeRandomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, sep } from "node:path";

import {
  PO_GATE_PROFILE_RECEIPT_RELATIVE_PATH,
  createPoGateProfileReceipt,
  derivePoGateRepositoryFingerprint,
  poGateProfileReceiptPath,
  validatePoGateProfileForRepository,
  resolvePoGateRepositoryTopology,
  serializePoGateProfileReceipt,
  validatePoGateLanguageProjection,
} from "./po-gate-authority.mjs";
import { assessWindowsPrivatePath, hardenWindowsPrivateDirectory } from "./windows-private-state.mjs";

const DEPENDENCY_KEYS = Object.freeze(["io", "now", "randomUUID", "resolveTopology"]);
const IO_KEYS = Object.freeze([
  "chmodSync",
  "closeSync",
  "existsSync",
  "fsyncSync",
  "linkSync",
  "lstatSync",
  "mkdirSync",
  "openSync",
  "realpathSync",
  "renameSync",
  "unlinkSync",
  "writeFileSync",
]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value, allowed) {
  return isPlainObject(value) && Object.keys(value).every((key) => allowed.includes(key));
}

function dependencies(overrides) {
  if (!hasOnlyKeys(overrides, DEPENDENCY_KEYS)) return null;
  const ioOverrides = overrides.io ?? {};
  if (!hasOnlyKeys(ioOverrides, IO_KEYS)) return null;
  const io = {
    chmodSync,
    closeSync,
    existsSync,
    fsyncSync,
    linkSync,
    lstatSync,
    mkdirSync,
    openSync,
    realpathSync,
    renameSync,
    unlinkSync,
    writeFileSync,
    ...ioOverrides,
  };
  if (Object.values(io).some((value) => typeof value !== "function")) return null;
  const selected = {
    io,
    now: overrides.now ?? (() => new Date().toISOString()),
    randomUUID: overrides.randomUUID ?? nodeRandomUUID,
    resolveTopology: overrides.resolveTopology ?? resolvePoGateRepositoryTopology,
  };
  return Object.values(selected).slice(1).every((value) => typeof value === "function") ? selected : null;
}

function rejected(code, reason) {
  return { ok: false, code, reason };
}

function physicalDirectory(path, io) {
  if (typeof path !== "string" || path.includes("\0")) throw new Error("unsafe directory");
  const canonical = io.realpathSync(path);
  if (!isAbsolute(canonical)) throw new Error("unsafe directory");
  const info = io.lstatSync(canonical);
  if (!info.isDirectory() || info.isSymbolicLink() || io.realpathSync(canonical) !== canonical) {
    throw new Error("unsafe directory");
  }
  return canonical;
}

function isInside(root, candidate) {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function ensurePhysicalPrivateDirectory(commonDir, relativeDirectory, io) {
  const common = physicalDirectory(commonDir, io);
  let cursor = common;
  for (const component of relativeDirectory.split(/[\\/]/u).filter(Boolean)) {
    cursor = join(cursor, component);
    const existed = io.existsSync(cursor);
    if (!existed) io.mkdirSync(cursor, { mode: 0o700 });
    const info = io.lstatSync(cursor);
    if (!info.isDirectory() || info.isSymbolicLink() || io.realpathSync(cursor) !== cursor) {
      throw new Error("unsafe local receipt directory");
    }
    if (process.platform === "win32") {
      const state = existed ? assessWindowsPrivatePath(cursor) : hardenWindowsPrivateDirectory(cursor);
      if (state.status !== "secure") throw new Error("Windows receipt directory assurance unavailable");
    }
  }
  if (!isInside(common, cursor)) throw new Error("receipt directory escaped Git common directory");
  return { common, parent: cursor };
}

function unsupportedDirectoryDurability(error) {
  return process.platform === "win32"
    && (error?.code === "EPERM" || error?.code === "EINVAL"
      || error?.code === "EISDIR" || error?.code === "EACCES"
      || error?.code === "ENOTSUP");
}
function syncDirectory(path, io) {
  // Directory durability is a hard POSIX flush; native Windows raises EPERM/EINVAL
  // on directory handles. The preceding regular-file fsync is the hard durability
  // guarantee; parent-directory durability is best-effort on Windows and its typed-
  // unavailable outcome is not a failure.
  let descriptor;
  try {
    descriptor = io.openSync(path, constants.O_RDONLY);
  } catch (error) {
    if (unsupportedDirectoryDurability(error)) return;
    throw error;
  }
  try {
    io.fsyncSync(descriptor);
  } catch (error) {
    if (unsupportedDirectoryDurability(error)) return;
    throw error;
  } finally {
    io.closeSync(descriptor);
  }
}

/**
 * Publish the canonical primary checkout's validated PO-language projection.
 *
 * The v1 receipt is machine-local below the physical Git common directory and
 * therefore retains canonicalPrimaryRoot for compatibility with the existing
 * authority validator. Returned values never expose that path or any input.
 */
function publishReceipt({
  rootDir,
  userYamlText,
  runtimeYamlText,
  updatedAt = undefined,
  initialOnly = false,
} = {}, dependencyOverrides = {}) {
  const deps = dependencies(dependencyOverrides);
  if (deps === null) {
    return rejected("PO-PROFILE-DEPENDENCIES-INVALID", "publisher dependencies are invalid");
  }

  const projection = validatePoGateLanguageProjection(userYamlText, runtimeYamlText);
  if (!projection.ok) {
    return rejected("PO-PROFILE-PROJECTION-INVALID", projection.reason);
  }

  let topology;
  let canonicalRoot;
  try {
    topology = deps.resolveTopology(rootDir);
    canonicalRoot = physicalDirectory(rootDir, deps.io);
    const primaryRoot = physicalDirectory(topology.primaryRoot, deps.io);
    const repositoryRoot = physicalDirectory(topology.repoRoot, deps.io);
    physicalDirectory(topology.gitCommonDir, deps.io);
    if (canonicalRoot !== primaryRoot || repositoryRoot !== primaryRoot) {
      return rejected("PO-PROFILE-NOT-PRIMARY", "the publisher must run from the canonical primary checkout");
    }
  } catch (error) {
    return rejected("PO-PROFILE-TOPOLOGY-INVALID", "repository topology is unavailable");
  }

  let temporary = null;
  let published = false;
  try {
    const receipt = createPoGateProfileReceipt({
      repositoryFingerprint: derivePoGateRepositoryFingerprint({
        gitCommonDir: topology.gitCommonDir,
        primaryRoot: topology.primaryRoot,
      }),
      primaryRoot: topology.primaryRoot,
      sourceBytes: userYamlText,
      runtimeBytes: runtimeYamlText,
      updatedAt: updatedAt ?? deps.now(),
    });
    const target = poGateProfileReceiptPath(topology.gitCommonDir);
    const relativeParent = dirname(PO_GATE_PROFILE_RECEIPT_RELATIVE_PATH).split(sep).join("/");
    const { common, parent } = ensurePhysicalPrivateDirectory(topology.gitCommonDir, relativeParent, deps.io);
    if (!isInside(common, target) || dirname(target) !== parent) throw new Error("unsafe receipt target");
    if (deps.io.existsSync(target)) {
      if (initialOnly) {
        return rejected(
          "PO-PROFILE-RECEIPT-INITIAL-CONFLICT",
          "an existing PO profile receipt must not be replaced by kickoff initialization",
        );
      }
      const current = deps.io.lstatSync(target);
      if (!current.isFile() || current.isSymbolicLink() || deps.io.realpathSync(target) !== target) {
        throw new Error("unsafe receipt target");
      }
    }

    const nonce = deps.randomUUID();
    if (typeof nonce !== "string" || !/^[A-Za-z0-9-]{1,128}$/u.test(nonce)) throw new Error("unsafe temporary name");
    temporary = join(parent, `.profile-receipt.${process.pid}.${nonce}.tmp`);
    const serializedReceipt = serializePoGateProfileReceipt(receipt);
    const descriptor = deps.io.openSync(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    try {
      deps.io.writeFileSync(descriptor, serializedReceipt);
      deps.io.fsyncSync(descriptor);
    } finally {
      deps.io.closeSync(descriptor);
    }
    deps.io.chmodSync(temporary, 0o600);
    if (initialOnly) {
      try {
        deps.io.linkSync(temporary, target);
      } catch (error) {
        if (error?.code === "EEXIST") {
          const conflict = new Error("receipt appeared during kickoff initialization");
          conflict.code = "PO-PROFILE-RECEIPT-INITIAL-CONFLICT";
          throw conflict;
        }
        throw error;
      }
      deps.io.unlinkSync(temporary);
      temporary = null;
    } else {
      deps.io.renameSync(temporary, target);
      temporary = null;
    }
    published = true;
    if (process.platform === "win32" && assessWindowsPrivatePath(target).status !== "secure") {
      throw new Error("Windows receipt file assurance unavailable");
    }
    syncDirectory(parent, deps.io);
    return {
      ok: true,
      code: "PO-PROFILE-RECEIPT-PUBLISHED",
      humanFacing: receipt.humanFacing,
      receiptSha256: createHash("sha256").update(serializedReceipt).digest("hex"),
    };
  } catch (error) {
    if (temporary !== null && deps.io.existsSync(temporary)) {
      try {
        deps.io.unlinkSync(temporary);
      } catch {
        // Best-effort cleanup of an unpublished temporary file.
      }
    }
    if (published) {
      return rejected(
        "PO-PROFILE-RECEIPT-DURABILITY-UNKNOWN",
        "the atomic receipt rename succeeded but directory durability could not be confirmed",
      );
    }
    if (initialOnly && error?.code === "PO-PROFILE-RECEIPT-INITIAL-CONFLICT") {
      return rejected(
        "PO-PROFILE-RECEIPT-INITIAL-CONFLICT",
        "an existing PO profile receipt must not be replaced by kickoff initialization",
      );
    }
    return rejected(
      "PO-PROFILE-RECEIPT-WRITE-FAILED",
      "the common profile receipt could not be published atomically",
    );
  }
}

/** Publish a profile receipt only when the kickoff has no receipt yet.
 *
 * A valid existing receipt is replay-safe. Any stale, malformed, or raced
 * receipt is deliberately left untouched for the explicit repair workflow.
 */
export function initializePoGateProfileReceipt({
  rootDir,
  userYamlText,
  runtimeYamlText,
  updatedAt = undefined,
} = {}, dependencyOverrides = {}) {
  const current = validatePoGateProfileForRepository({ repoRoot: rootDir });
  if (current.ok) {
    return {
      ok: true,
      code: "PO-PROFILE-RECEIPT-INITIAL-CURRENT",
      humanFacing: current.value.humanFacing,
      receiptSha256: current.value.receiptSha256,
    };
  }
  return publishReceipt({
    rootDir,
    userYamlText,
    runtimeYamlText,
    updatedAt,
    initialOnly: true,
  }, dependencyOverrides);
}

export function publishPoGateProfileReceipt(options = {}, dependencyOverrides = {}) {
  return publishReceipt(options, dependencyOverrides);
}
