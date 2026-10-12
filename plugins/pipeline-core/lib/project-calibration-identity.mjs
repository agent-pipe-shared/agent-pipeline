// SPDX-License-Identifier: SUL-1.0
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { AUTHORITY_ARTIFACTS, resolveAuthorityArtifactPath } from "./project-authority.mjs";
import { repositoryPathIdentityOrSelf } from "./repository-path-identity.mjs";

const SCHEMA = "pipeline.project-calibration-identity.v1";
const ROOT_DOMAIN = "pipeline.project-calibration-root.v1\0";
const MAX_LABEL_BYTES = 512;
const MAX_CALIBRATION_BYTES = 1024 * 1024;
const SHA256 = /^[0-9a-f]{64}$/u;
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const hash = value => createHash("sha256").update(value).digest("hex");
function ioFor(deps) {
  return {
    existsSync: deps.existsSync ?? existsSync,
    lstatSync: deps.lstatSync ?? lstatSync,
    readFileSync: deps.readFileSync ?? readFileSync,
    realpathSync: deps.realpathSync ?? realpathSync,
  };
}
function validLabel(value) {
  return typeof value === "string" && value.trim() !== ""
    && Buffer.byteLength(value, "utf8") <= MAX_LABEL_BYTES
    && !/[\u0000-\u001f\u007f]/u.test(value);
}
function observeRoot(rootDir, io) {
  if (typeof rootDir !== "string" || rootDir.length === 0) throw new Error("root unavailable");
  const requested = resolve(rootDir);
  const requestedInfo = io.lstatSync(requested);
  if (!requestedInfo.isDirectory() || requestedInfo.isSymbolicLink()) throw new Error("root unavailable");
  const root = typeof io.realpathSync.native === "function"
    ? io.realpathSync.native(requested) : io.realpathSync(requested);
  if (typeof root !== "string") throw new Error("root unavailable");
  const physicalInfo = io.lstatSync(root);
  if (!physicalInfo.isDirectory() || physicalInfo.isSymbolicLink()) throw new Error("root unavailable");
  const project = basename(root);
  if (!validLabel(project)) throw new Error("root unavailable");
  return { root, project, rootSha256: hash(`${ROOT_DOMAIN}${repositoryPathIdentityOrSelf(root)}`) };
}

/** Factual selected-root label only; never accepts an independent project string. */
export function buildRootProjectCalibrationIdentity({ rootDir, deps = {} } = {}) {
  try {
    const current = observeRoot(rootDir, ioFor(deps));
    return Object.freeze({ schema: SCHEMA, status: "resolved", kind: "root-derived",
      project: current.project, rootSha256: current.rootSha256 });
  } catch {
    return Object.freeze({ schema: SCHEMA, status: "unavailable", kind: null,
      project: null, rootSha256: null, code: "PCI-ROOT-UNAVAILABLE" });
  }
}

function readBoundCalibration(root, relative, io) {
  if (![AUTHORITY_ARTIFACTS.calibration.neutral, AUTHORITY_ARTIFACTS.calibration.legacy].includes(relative)) {
    throw new Error("unbounded calibration");
  }
  let target = root;
  let before;
  const parts = relative.split("/");
  for (let index = 0; index < parts.length; index += 1) {
    target = join(target, parts[index]);
    let info;
    try { info = io.lstatSync(target); }
    catch (error) { if (error?.code === "ENOENT") return null; throw error; }
    if (info.isSymbolicLink() || (index < parts.length - 1 && !info.isDirectory())) {
      throw new Error("unsafe calibration");
    }
    if (index === parts.length - 1) before = info;
  }
  if (!before.isFile() || before.size > MAX_CALIBRATION_BYTES) throw new Error("unsafe calibration");
  const physical = typeof io.realpathSync.native === "function"
    ? io.realpathSync.native(target) : io.realpathSync(target);
  if (physical !== target) throw new Error("unsafe calibration");
  const bytes = io.readFileSync(target);
  const after = io.lstatSync(target);
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_CALIBRATION_BYTES || !after.isFile()
    || after.isSymbolicLink() || before.dev !== after.dev || before.ino !== after.ino
    || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs
    || before.nlink !== after.nlink || bytes.length !== after.size) throw new Error("unstable calibration");
  return bytes;
}
function unavailable(reason, code, rootSha256 = null, source = null) {
  return Object.freeze({ schema: SCHEMA, status: "unavailable", kind: null,
    project: null, rootSha256,
    configuredValue: Object.freeze({ status: "unavailable", reason }), source, code });
}
function resolved(current, project, kind, source, placeholder = false) {
  return Object.freeze({ schema: SCHEMA, status: "resolved", kind, project,
    rootSha256: current.rootSha256,
    configuredValue: Object.freeze({ status: placeholder ? "unavailable" : "selected",
      reason: placeholder ? "legacy-placeholder" : null }), source });
}

/**
 * Selected calibration is the only alias source. Root provenance is freshly
 * observed, not supplied by that JSON and not a replacement for Git/PO custody.
 * This reader creates no files, receipts, commands or authority.
 */
export function readProjectCalibrationIdentity({ rootDir = process.cwd(), deps = {} } = {}) {
  let io;
  let current;
  try { io = ioFor(deps); current = observeRoot(rootDir, io); }
  catch { return unavailable("root-unavailable", "PCI-ROOT-UNAVAILABLE"); }
  let artifact;
  try { artifact = resolveAuthorityArtifactPath("calibration", { rootDir: current.root }); }
  catch { return unavailable("authority-unavailable", "PCI-AUTHORITY-UNAVAILABLE", current.rootSha256); }
  if (!["ready", "missing"].includes(artifact.authorityStatus)
    || !["neutral", "legacy"].includes(artifact.source)
    || artifact.relPath !== AUTHORITY_ARTIFACTS.calibration[artifact.source]) {
    return unavailable("authority-unavailable", "PCI-AUTHORITY-UNAVAILABLE", current.rootSha256);
  }
  let bytes;
  let otherBytes;
  try {
    bytes = readBoundCalibration(current.root, artifact.relPath, io);
    if (bytes === null) return unavailable("calibration-missing", "PCI-CALIBRATION-MISSING", current.rootSha256);
    const other = artifact.source === "neutral" ? "legacy" : "neutral";
    otherBytes = readBoundCalibration(current.root, AUTHORITY_ARTIFACTS.calibration[other], io);
  } catch { return unavailable("calibration-unsafe", "PCI-CALIBRATION-UNSAFE", current.rootSha256); }
  const source = Object.freeze({ kind: artifact.source, path: artifact.relPath,
    sha256: hash(bytes), authorityStatus: artifact.authorityStatus });
  if (otherBytes !== null && !bytes.equals(otherBytes)) {
    return unavailable("calibration-drift", "PCI-CALIBRATION-DRIFT", current.rootSha256, source);
  }
  let calibration;
  try {
    const text = bytes.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(bytes)) throw new Error("invalid UTF8");
    calibration = JSON.parse(text);
    if (!object(calibration)) throw new Error("invalid calibration");
  } catch { return unavailable("calibration-invalid", "PCI-CALIBRATION-INVALID", current.rootSha256, source); }
  const project = calibration.project;
  if (project === undefined || project === null || (typeof project === "string" && project.trim() === "")) {
    return unavailable("project-missing", "PCI-PROJECT-MISSING", current.rootSha256, source);
  }
  if (!validLabel(project)) return unavailable("project-invalid", "PCI-PROJECT-INVALID", current.rootSha256, source);
  const metadata = calibration.projectIdentity;
  if (metadata !== undefined) {
    if (!object(metadata) || Object.keys(metadata).length !== 3
      || !["schema", "kind", "rootSha256"].every(key => Object.hasOwn(metadata, key))
      || metadata.schema !== SCHEMA || !["root-derived", "configured-alias"].includes(metadata.kind)
      || !SHA256.test(metadata.rootSha256 ?? "")) {
      return unavailable("metadata-invalid", "PCI-METADATA-INVALID", current.rootSha256, source);
    }
    if (metadata.rootSha256 !== current.rootSha256) {
      return unavailable("root-mismatch", "PCI-ROOT-MISMATCH", current.rootSha256, source);
    }
    if (metadata.kind === "root-derived" && project !== current.project) {
      return unavailable("name-mismatch", "PCI-NAME-MISMATCH", current.rootSha256, source);
    }
    return resolved(current, project, metadata.kind, source);
  }
  // The historical seed is unavailable as a configured identity. Its factual
  // physical-root replacement is a different observed source, even if the
  // real directory itself is legitimately called "new-project".
  if (project === "new-project") return resolved(current, current.project, "root-derived", source, true);
  return resolved(current, project, "configured-alias", source);
}
