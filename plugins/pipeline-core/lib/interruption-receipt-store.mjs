// SPDX-License-Identifier: SUL-1.0
/**
 * Local interruption-store boundary.
 *
 * This is intentionally only the C1 read foundation.  In particular, it does
 * not initialise a collection or allocate any public identity.
 */
import * as fs from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { canonicalInvocationJson } from "./invocation-reliability.mjs";

const CREATE_SCHEMA = "pipeline.interruption-store-create-result.v1";
const OPERATION_SCHEMA = "pipeline.interruption-store-operation-result.v1";
const WRITE_SCHEMA = "pipeline.interruption-store-write-result.v1";
const SNAPSHOT_SCHEMA = "pipeline.interruption-store-snapshot-result.v1";
const REPORT_SCHEMA = "pipeline.interruption-store-report-result.v1";
const IO_KEYS = ["lstatSync", "realpathSync", "openSync", "fstatSync", "readSync", "writeSync", "fsyncSync", "closeSync", "mkdirSync", "linkSync", "unlinkSync", "rmdirSync", "opendirSync", "statfsSync"];
const ID = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const BACKEND_ID = "linux-node24.15.0-ef53-v1";
const EXT_TYPE = 0xef53n;
const STORE_KEYS = ["schema", "storeId", "layoutRevision"];
const OPERATION_KEYS = ["schema", "storeId", "operationId", "operationKind", "createdAt", "scope", "specSha256", "specPathSha256"];
const MARKER_KEYS = ["schema", "kind", "id", "storeId", "operationId", "operationSha256", "sequence", "previousEntrySha256", "lineageId", "firstObservedAt", "files"];
const FIXED_DIRECTORIES = [
  ["evidence"], ["evidence", "interruption-collection"], ["evidence", "interruption-collection", "store"],
  ["evidence", "interruption-collection", "entries"], ["evidence", "interruption-receipts"], ["telemetry"], ["telemetry", "interruptions"],
];

export const productionPorts = Object.freeze({
  io: Object.freeze(Object.fromEntries(IO_KEYS.map((key) => [key, fs[key]]))),
  clock: () => ({ value: new Date().toISOString(), status: "measured" }),
  randomId: () => randomUUID(),
  platform: ({ root }) => productionPlatform(root),
});

function shape(value, keys) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const ownKeys = Reflect.ownKeys(descriptors);
    if (ownKeys.length !== keys.length || !ownKeys.every((key) => typeof key === "string" && keys.includes(key))) return null;
    if (!keys.every((key) => Object.hasOwn(descriptors, key))) return null;
    if (!ownKeys.every((key) => Object.hasOwn(descriptors[key], "value") && descriptors[key].enumerable)) return null;
    return descriptors;
  } catch { return null; }
}

function validFactory(input, ports) {
  const inputFields = shape(input, ["root"]);
  if (!inputFields || typeof inputFields.root.value !== "string" || inputFields.root.value.length === 0
    || inputFields.root.value.length > 4096 || inputFields.root.value.includes("\0")) return null;
  const portFields = shape(ports, ["io", "clock", "randomId", "platform"]);
  if (!portFields || typeof portFields.clock.value !== "function" || typeof portFields.randomId.value !== "function"
    || typeof portFields.platform.value !== "function") return null;
  const ioFields = shape(portFields.io.value, IO_KEYS);
  if (!ioFields || !IO_KEYS.every((key) => typeof ioFields[key].value === "function")) return null;
  return { root: inputFields.root.value, io: portFields.io.value };
}

function result(schema, code, field) {
  return { schema, ok: false, code, [field]: null };
}
const operationResult = (code) => result(OPERATION_SCHEMA, code, "operation");
const snapshotResult = (code) => result(SNAPSHOT_SCHEMA, code, "snapshot");
const incompleteCreate = (code = "C1S-INCOMPLETE") => ({ schema: CREATE_SCHEMA, ok: false, code, handle: null });
const incompleteWrite = (code = "C1S-INCOMPLETE") => ({ schema: WRITE_SCHEMA, status: code === "C1S-SHAPE" ? "rejected" : "not-applicable", code, coreCode: null, eventId: null, lineageId: null, entrySha256: null });
const incompleteReport = (code = "C1S-INCOMPLETE") => ({ schema: REPORT_SCHEMA, status: code === "C1S-SHAPE" ? "rejected" : "unavailable", code, reportSha256: null, output: null });

function safeData(value, depth = 0, ancestors = new Set()) {
  if (depth > 16 || value === null || ["string", "boolean"].includes(typeof value)) return depth <= 16;
  if (typeof value === "number") return Number.isSafeInteger(value);
  if (typeof value !== "object" || ancestors.has(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value), array = Array.isArray(value);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
    if (!keys.every((key) => typeof key === "string" && Object.hasOwn(descriptors[key], "value")
      && (array && key === "length" || descriptors[key].enumerable))) return false;
    const length = array ? descriptors.length?.value : null;
    if (array && (!Number.isSafeInteger(length) || keys.length !== length + 1
      || !keys.every((key) => key === "length" || /^(?:0|[1-9][0-9]*)$/u.test(key) && Number(key) < length))) return false;
    ancestors.add(value);
    const valid = keys.filter((key) => key !== "length").every((key) => safeData(descriptors[key].value, depth + 1, ancestors));
    ancestors.delete(value);
    return valid;
  } catch { return false; }
}

function unavailableInput(value, keys) {
  const fields = shape(value, keys);
  return Boolean(fields && keys.every((key) => safeData(fields[key].value)));
}

function errorCode(error) {
  try {
    const descriptor = error !== null && typeof error === "object" ? Object.getOwnPropertyDescriptor(error, "code") : null;
    return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : null;
  } catch { return null; }
}

function lstat(io, path) {
  try { return { state: "present", stat: io.lstatSync(path, { bigint: true }) }; }
  catch (error) { return errorCode(error) === "ENOENT" ? { state: "absent" } : { state: "error" }; }
}

function directory(stat) { return stat.isDirectory() && !stat.isSymbolicLink(); }
function regular(stat) { return stat.isFile() && !stat.isSymbolicLink(); }

function contents(io, path) {
  let dir, state = "error";
  try {
    dir = io.opendirSync(path);
    state = dir.readSync() === null ? "empty" : "material";
  } catch { state = "error"; }
  finally {
    try { dir?.closeSync(); } catch { state = "error"; }
  }
  return state;
}

function inspectAbsentStore(root, io) {
  const rootStat = lstat(io, root);
  if (rootStat.state !== "present" || !directory(rootStat.stat)) return "C1S-ROOT";
  const evidence = lstat(io, join(root, "evidence"));
  if (evidence.state === "absent") return "C1S-NOT-FOUND";
  if (evidence.state !== "present" || !directory(evidence.stat)) return "C1S-ROOT";
  const collectionRoot = join(root, "evidence", "interruption-collection");
  const collection = lstat(io, collectionRoot);
  if (collection.state === "absent") return "C1S-NOT-FOUND";
  if (collection.state !== "present" || !directory(collection.stat)) return "C1S-ROOT";

  const lock = lstat(io, join(collectionRoot, ".writer-lock"));
  if (lock.state === "present") return directory(lock.stat) ? "C1S-LOCKED" : "C1S-ROOT";
  if (lock.state === "error") return "C1S-IO";

  const storeRoot = join(collectionRoot, "store");
  const store = lstat(io, storeRoot);
  if (store.state === "present" && !directory(store.stat)) return "C1S-ROOT";
  if (store.state === "error") return "C1S-IO";
  const marker = lstat(io, join(storeRoot, "commit.json"));
  if (marker.state === "present") return regular(marker.stat) ? "C1S-INCOMPLETE" : "C1S-ROOT";
  if (marker.state === "error") return "C1S-IO";

  if (store.state === "present") {
    const state = contents(io, storeRoot);
    if (state === "material") return "C1S-INCOMPLETE";
    if (state === "error") return "C1S-IO";
  }

  for (const path of [join(collectionRoot, "entries"), join(root, "evidence", "interruption-receipts"), join(root, "telemetry", "interruptions")]) {
    const candidate = lstat(io, path);
    if (candidate.state === "absent") continue;
    if (candidate.state !== "present" || !directory(candidate.stat)) return "C1S-ROOT";
    const state = contents(io, path);
    if (state === "material") return "C1S-INCOMPLETE";
    if (state === "error") return "C1S-IO";
  }
  return "C1S-NOT-FOUND";
}

function createOperation(factory, input, ports) {
  const fields = shape(input, ["context"]), context = fields ? safeContext(fields.context.value) : null;
  if (!context) return incompleteCreate("C1S-SHAPE");
  const root = safeRoot(factory.io, factory.root);
  if (!root) return incompleteCreate("C1S-ROOT");
  if (!platformEligible(ports.platform, root.path)) return incompleteCreate("C1S-PLATFORM");
  const evidencePath = join(root.path, "evidence"), collectionPath = join(evidencePath, "interruption-collection");
  let lockToken = null;
  try {
    for (const path of [evidencePath, collectionPath]) {
      const made = mkdirChecked(factory.io, path, root.stat);
      if (made === "root") return incompleteCreate("C1S-ROOT");
      if (made === "io" || !fsyncDirectory(factory.io, path === evidencePath ? root.path : evidencePath)) return incompleteCreate("C1S-IO");
    }
    let nonce;
    try { nonce = ports.randomId(); } catch { return incompleteCreate("C1S-IO"); }
    if (typeof nonce !== "string" || !ID.test(nonce)) return incompleteCreate("C1S-IO");
    const acquired = lock(factory.io, collectionPath, root.stat, nonce);
    if (acquired === null) return incompleteCreate("C1S-LOCKED");
    if (!acquired) return incompleteCreate("C1S-IO");
    lockToken = acquired;

    const storePath = join(collectionPath, "store"), entriesPath = join(collectionPath, "entries"), receiptsPath = join(evidencePath, "interruption-receipts"), telemetryPath = join(root.path, "telemetry"), reportsPath = join(telemetryPath, "interruptions");
    const storeState = lstat(factory.io, storePath);
    if (storeState.state === "present" && !sameDirectory(factory.io, storePath, root.stat)) return incompleteCreate("C1S-ROOT");
    if (storeState.state === "error") return incompleteCreate("C1S-IO");
    let storeId = null;
    if (storeState.state === "present" && !empty(factory.io, storePath)) {
      storeId = validStoreBundle(factory.io, storePath);
      if (!storeId) return incompleteCreate("C1S-INCOMPLETE");
    }
    for (const path of [entriesPath, receiptsPath, reportsPath]) {
      const found = lstat(factory.io, path);
      if (found.state === "error") return incompleteCreate("C1S-IO");
      if (found.state !== "present") continue;
      if (!sameDirectory(factory.io, path, root.stat)) return incompleteCreate("C1S-ROOT");
      if (path === entriesPath && storeId !== null && !validOperationInventory(factory.io, entriesPath, storeId)) return incompleteCreate("C1S-INCOMPLETE");
      if (storeId === null && !empty(factory.io, path)) return incompleteCreate("C1S-INCOMPLETE");
    }
    for (const path of [storePath, entriesPath, receiptsPath, telemetryPath, reportsPath]) {
      const parent = path === storePath || path === entriesPath ? collectionPath : path === receiptsPath ? evidencePath : path === telemetryPath ? root.path : telemetryPath;
      const made = mkdirChecked(factory.io, path, root.stat);
      if (made === "root") return incompleteCreate("C1S-ROOT");
      if (made === "io" || !fsyncDirectory(factory.io, parent)) return incompleteCreate("C1S-IO");
    }
    if (storeId === null) {
      try { storeId = ports.randomId(); } catch { return incompleteCreate("C1S-IO"); }
      if (typeof storeId !== "string" || !ID.test(storeId)) return incompleteCreate("C1S-IO");
      const payload = { schema: "pipeline.interruption-store.v1", storeId, layoutRevision: 1 };
      const marker = { schema: "pipeline.interruption-publication.v1", kind: "store", id: "store-definition", storeId, operationId: null, operationSha256: null,
        sequence: null, previousEntrySha256: null, lineageId: null, firstObservedAt: { value: null, status: "unknown" }, files: [] };
      if (!createPublishedBundle(factory.io, storePath, payload, marker)) return incompleteCreate("C1S-IO");
      storeId = validStoreBundle(factory.io, storePath);
      if (!storeId) return incompleteCreate("C1S-CORRUPT");
    }
    let operationId, createdAt;
    try { operationId = ports.randomId(); createdAt = safeTime(ports.clock()); } catch { return incompleteCreate("C1S-IO"); }
    if (typeof operationId !== "string" || !ID.test(operationId) || !createdAt) return incompleteCreate("C1S-IO");
    const operationPath = join(entriesPath, sha256(Buffer.from(operationId, "utf8")));
    const existing = lstat(factory.io, operationPath);
    if (existing.state === "present") return incompleteCreate("C1S-CONFLICT");
    if (existing.state === "error") return incompleteCreate("C1S-IO");
    const made = mkdirChecked(factory.io, operationPath, root.stat);
    if (made !== "created") return incompleteCreate(made === "root" ? "C1S-ROOT" : "C1S-IO");
    if (!fsyncDirectory(factory.io, entriesPath)) return incompleteCreate("C1S-IO");
    const payload = { schema: "pipeline.interruption-operation.v1", storeId, operationId, operationKind: "critic-preflight", createdAt,
      scope: context.scope, specSha256: context.ownerBinding.specSha256, specPathSha256: context.ownerBinding.specPathSha256 };
    const operationSha256 = sha256(canonicalBytes(payload));
    const marker = { schema: "pipeline.interruption-publication.v1", kind: "operation", id: operationId, storeId, operationId, operationSha256,
      sequence: 0, previousEntrySha256: null, lineageId: null, firstObservedAt: { value: null, status: "unknown" }, files: [] };
    if (!createPublishedBundle(factory.io, operationPath, payload, marker)) return incompleteCreate("C1S-IO");
    const handle = Object.freeze({ storeId, operationId, operationSha256 });
    return Object.freeze({ schema: CREATE_SCHEMA, ok: true, code: null, handle });
  } finally { releaseLock(factory.io, lockToken); }
}

function operationInput(value) {
  const fields = shape(value, ["operationId"]);
  return Boolean(fields && typeof fields.operationId.value === "string" && ID.test(fields.operationId.value));
}

function timeInput(value) {
  const fields = shape(value, ["value", "status"]);
  if (!fields || !["measured", "estimated", "unavailable", "unknown"].includes(fields.status.value)) return false;
  if (["unknown", "unavailable"].includes(fields.status.value)) return fields.value.value === null;
  return typeof fields.value.value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(fields.value.value)
    && Number.isFinite(Date.parse(fields.value.value)) && new Date(fields.value.value).toISOString() === fields.value.value;
}

function exactData(value, keys) { return Boolean(shape(value, keys)); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function canonicalBytes(value) { return Buffer.from(canonicalInvocationJson(value), "utf8"); }
function safeTime(value) { return timeInput(value) ? { value: value.value, status: value.status } : null; }
function safeContext(value) {
  const context = shape(value, ["scope", "ownerBinding"]);
  if (!context) return null;
  const scope = shape(context.scope.value, ["featureId", "packageId", "dispatchId", "phase"]);
  const owner = shape(context.ownerBinding.value, ["stateSha256", "continuityRevision", "specSha256", "specPathSha256"]);
  if (!scope || !owner || !ID.test(scope.featureId.value) || scope.packageId.value !== null || scope.dispatchId.value !== null
    || !(scope.phase.value === null || typeof scope.phase.value === "string" && ID.test(scope.phase.value))
    || ![owner.stateSha256.value, owner.specSha256.value, owner.specPathSha256.value].every((item) => typeof item === "string" && DIGEST.test(item))
    || !Number.isSafeInteger(owner.continuityRevision.value) || owner.continuityRevision.value < 0) return null;
  return Object.freeze({ scope: Object.freeze({ featureId: scope.featureId.value, packageId: null, dispatchId: null, phase: scope.phase.value }),
    ownerBinding: Object.freeze({ stateSha256: owner.stateSha256.value, continuityRevision: owner.continuityRevision.value, specSha256: owner.specSha256.value, specPathSha256: owner.specPathSha256.value }) });
}

function productionPlatform(root) {
  try {
    if (process.platform !== "linux" || process.versions.node !== "24.15.0" || !Number.isInteger(fs.constants.O_NOFOLLOW)
      || !Number.isInteger(fs.constants.O_DIRECTORY) || fs.constants.O_NOFOLLOW === 0 || fs.constants.O_DIRECTORY === 0) return { status: "unsupported", backendId: null };
    const rootInfo = fs.lstatSync(root, { bigint: true });
    if (!directory(rootInfo)) return { status: "unsupported", backendId: null };
    for (const parts of FIXED_DIRECTORIES) {
      let cursor = root;
      for (const part of parts) {
        const next = join(cursor, part);
        const found = lstat(fs, next);
        if (found.state === "absent") break;
        if (found.state !== "present" || !directory(found.stat) || found.stat.dev !== rootInfo.dev) return { status: "unsupported", backendId: null };
        cursor = next;
      }
      const anchor = lstat(fs, cursor);
      if (anchor.state !== "present" || !directory(anchor.stat) || anchor.stat.dev !== rootInfo.dev || fs.statfsSync(cursor, { bigint: true }).type !== EXT_TYPE) return { status: "unsupported", backendId: null };
    }
    return { status: "eligible", backendId: BACKEND_ID };
  } catch { return { status: "unsupported", backendId: null }; }
}

function platformEligible(platform, root) {
  try {
    const value = platform({ root });
    const fields = shape(value, ["status", "backendId"]);
    return Boolean(fields && fields.status.value === "eligible" && fields.backendId.value === BACKEND_ID);
  } catch { return false; }
}

function sameDirectory(io, path, rootStat) {
  const found = lstat(io, path);
  return found.state === "present" && directory(found.stat) && found.stat.dev === rootStat.dev;
}

function safeRoot(io, root) {
  const found = lstat(io, root);
  if (found.state !== "present" || !directory(found.stat)) return null;
  try {
    const physical = io.realpathSync(root), physicalStat = lstat(io, physical);
    if (physicalStat.state !== "present" || !directory(physicalStat.stat) || physicalStat.stat.dev !== found.stat.dev || physicalStat.stat.ino !== found.stat.ino) return null;
    return { path: physical, stat: physicalStat.stat };
  } catch { return null; }
}

function empty(io, path) { return contents(io, path) === "empty"; }
function mkdirChecked(io, path, rootStat) {
  const before = lstat(io, path);
  if (before.state === "present") return sameDirectory(io, path, rootStat) ? "present" : "root";
  if (before.state !== "absent") return "io";
  try { io.mkdirSync(path); }
  catch (error) { if (errorCode(error) === "EEXIST") return sameDirectory(io, path, rootStat) ? "present" : "root"; return "io"; }
  return sameDirectory(io, path, rootStat) ? "created" : "root";
}

function fsyncDirectory(io, path) {
  let fd;
  try { fd = io.openSync(path, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW); io.fsyncSync(fd); return true; }
  catch { return false; } finally { try { if (fd !== undefined) io.closeSync(fd); } catch {} }
}

function exclusiveFile(io, path, bytes) {
  let fd;
  try {
    fd = io.openSync(path, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    const stat = io.fstatSync(fd, { bigint: true });
    if (!regular(stat) || stat.nlink !== 1n || stat.size !== 0n || io.writeSync(fd, bytes, 0, bytes.length, 0) !== bytes.length) return false;
    io.fsyncSync(fd);
    return true;
  } catch { return false; } finally { try { if (fd !== undefined) io.closeSync(fd); } catch {} }
}

function readRegular(io, path, maximum = 8192, links = 1n) {
  let fd;
  try {
    const listed = lstat(io, path);
    if (listed.state !== "present" || !regular(listed.stat) || listed.stat.nlink !== links || listed.stat.size < 0n || listed.stat.size > BigInt(maximum)) return null;
    fd = io.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = io.fstatSync(fd, { bigint: true });
    if (!regular(stat) || stat.nlink !== links || stat.dev !== listed.stat.dev || stat.ino !== listed.stat.ino || stat.size !== listed.stat.size) return null;
    const bytes = Buffer.alloc(Number(stat.size));
    if (io.readSync(fd, bytes, 0, bytes.length, 0) !== bytes.length) return null;
    return bytes;
  } catch { return null; } finally { try { if (fd !== undefined) io.closeSync(fd); } catch {} }
}

function createPublishedBundle(io, directoryPath, payload, marker) {
  const metadata = canonicalBytes(payload), metadataPath = join(directoryPath, "metadata.json"), pendingPath = join(directoryPath, ".commit.pending"), commitPath = join(directoryPath, "commit.json");
  if (!exclusiveFile(io, metadataPath, metadata)) return false;
  const finalMarker = { ...marker, files: [{ name: "metadata.json", sha256: sha256(metadata), byteLength: metadata.length, recordSha256: null }] };
  const markerBytes = canonicalBytes(finalMarker);
  if (!exclusiveFile(io, pendingPath, markerBytes)) return false;
  try { io.linkSync(pendingPath, commitPath); } catch { return false; }
  if (!fsyncDirectory(io, directoryPath)) return false;
  const checkPayload = readRegular(io, metadataPath), checkMarker = readRegular(io, commitPath, 4096, 2n);
  return Boolean(checkPayload && checkMarker && checkPayload.equals(metadata) && checkMarker.equals(markerBytes));
}

function parseCanonical(bytes) { try { return JSON.parse(bytes.toString("utf8")); } catch { return null; } }
function validStoreBundle(io, storePath) {
  const metadataBytes = readRegular(io, join(storePath, "metadata.json")), markerBytes = readRegular(io, join(storePath, "commit.json"), 4096, 2n), pendingBytes = readRegular(io, join(storePath, ".commit.pending"), 4096, 2n);
  if (!metadataBytes || !markerBytes || !pendingBytes || !pendingBytes.equals(markerBytes)) return null;
  const metadata = parseCanonical(metadataBytes), marker = parseCanonical(markerBytes);
  if (!exactData(metadata, STORE_KEYS) || metadata.schema !== "pipeline.interruption-store.v1" || !ID.test(metadata.storeId) || metadata.layoutRevision !== 1
    || !exactData(marker, MARKER_KEYS) || marker.schema !== "pipeline.interruption-publication.v1" || marker.kind !== "store" || marker.id !== "store-definition"
    || marker.storeId !== metadata.storeId || marker.operationId !== null || marker.operationSha256 !== null || marker.sequence !== null || marker.previousEntrySha256 !== null
    || marker.lineageId !== null || !timeInput(marker.firstObservedAt) || marker.firstObservedAt.value !== null || marker.firstObservedAt.status !== "unknown"
    || !Array.isArray(marker.files) || marker.files.length !== 1) return null;
  const file = marker.files[0];
  if (!exactData(file, ["name", "sha256", "byteLength", "recordSha256"]) || file.name !== "metadata.json" || file.sha256 !== sha256(metadataBytes)
    || file.byteLength !== metadataBytes.length || file.recordSha256 !== null) return null;
  return metadata.storeId;
}

function directoryNames(io, path, maximum = 513) {
  let dir;
  try {
    dir = io.opendirSync(path); const names = [];
    for (let item = dir.readSync(); item !== null; item = dir.readSync()) {
      if (typeof item.name !== "string" || item.name.length === 0 || item.name === "." || item.name === "..") return null;
      names.push(item.name); if (names.length > maximum) return null;
    }
    return names;
  } catch { return null; } finally { try { dir?.closeSync(); } catch {} }
}

function validScope(value) {
  const scope = shape(value, ["featureId", "packageId", "dispatchId", "phase"]);
  return Boolean(scope && ID.test(scope.featureId.value) && scope.packageId.value === null && scope.dispatchId.value === null
    && (scope.phase.value === null || typeof scope.phase.value === "string" && ID.test(scope.phase.value)));
}

function validOperationBundle(io, path, storeId, directoryName) {
  const metadataBytes = readRegular(io, join(path, "metadata.json")), markerBytes = readRegular(io, join(path, "commit.json"), 4096, 2n), pendingBytes = readRegular(io, join(path, ".commit.pending"), 4096, 2n);
  if (!metadataBytes || !markerBytes || !pendingBytes || !pendingBytes.equals(markerBytes)) return false;
  const metadata = parseCanonical(metadataBytes), marker = parseCanonical(markerBytes);
  if (!exactData(metadata, OPERATION_KEYS) || metadata.schema !== "pipeline.interruption-operation.v1" || metadata.storeId !== storeId || !ID.test(metadata.operationId)
    || sha256(Buffer.from(metadata.operationId, "utf8")) !== directoryName || metadata.operationKind !== "critic-preflight" || !timeInput(metadata.createdAt) || !validScope(metadata.scope)
    || !DIGEST.test(metadata.specSha256) || !DIGEST.test(metadata.specPathSha256) || !exactData(marker, MARKER_KEYS)
    || marker.schema !== "pipeline.interruption-publication.v1" || marker.kind !== "operation" || marker.id !== metadata.operationId || marker.storeId !== storeId
    || marker.operationId !== metadata.operationId || marker.operationSha256 !== sha256(metadataBytes) || marker.sequence !== 0 || marker.previousEntrySha256 !== null
    || marker.lineageId !== null || !timeInput(marker.firstObservedAt) || marker.firstObservedAt.value !== null || marker.firstObservedAt.status !== "unknown"
    || !Array.isArray(marker.files) || marker.files.length !== 1) return false;
  const file = marker.files[0];
  return Boolean(exactData(file, ["name", "sha256", "byteLength", "recordSha256"]) && file.name === "metadata.json" && file.sha256 === sha256(metadataBytes)
    && file.byteLength === metadataBytes.length && file.recordSha256 === null);
}

function validOperationInventory(io, entriesPath, storeId) {
  const names = directoryNames(io, entriesPath);
  return Array.isArray(names) && names.length <= 512 && names.every((name) => /^[a-f0-9]{64}$/u.test(name) && sameDirectory(io, join(entriesPath, name), lstat(io, entriesPath).stat)
    && validOperationBundle(io, join(entriesPath, name), storeId, name));
}

function lock(io, collectionPath, rootStat, nonce) {
  const path = join(collectionPath, ".writer-lock");
  try { io.mkdirSync(path); }
  catch (error) { return errorCode(error) === "EEXIST" ? null : false; }
  const found = lstat(io, path);
  if (found.state !== "present" || !directory(found.stat) || found.stat.dev !== rootStat.dev) return false;
  const owner = canonicalBytes({ schema: "pipeline.interruption-writer-lock.v1", nonce });
  if (owner.length > 4096 || !exclusiveFile(io, join(path, "owner.json"), owner) || !fsyncDirectory(io, path) || !fsyncDirectory(io, collectionPath)) return false;
  return { path, stat: found.stat, owner };
}

function releaseLock(io, token) {
  if (!token) return;
  const found = lstat(io, token.path), owner = readRegular(io, join(token.path, "owner.json"), 4096);
  if (found.state !== "present" || !directory(found.stat) || found.stat.dev !== token.stat.dev || found.stat.ino !== token.stat.ino || !owner || !owner.equals(token.owner)) return;
  try { io.unlinkSync(join(token.path, "owner.json")); } catch { return; }
  try { io.rmdirSync(token.path); } catch {}
}

function snapshotInput(value) {
  const fields = shape(value, ["window", "scope"]);
  if (!fields) return false;
  const window = shape(fields.window.value, ["start", "end"]);
  const scope = shape(fields.scope.value, ["featureId", "packageId", "dispatchId"]);
  if (!window || !timeInput(window.start.value) || !timeInput(window.end.value) || !scope) return false;
  if (window.start.value.value !== null && window.end.value.value !== null && window.start.value.value > window.end.value.value) return false;
  return ["featureId", "packageId", "dispatchId"].every((key) => scope[key].value === null
    || typeof scope[key].value === "string" && ID.test(scope[key].value));
}

/**
 * Construct a closed C1 store façade.  Construction is deliberately lazy.
 */
export function createInterruptionStore(input, ports = productionPorts) {
  const factory = validFactory(input, ports);
  if (!factory) throw new TypeError("C1S-SHAPE");
  const read = (inputValid, makeResult) => (value) => {
    if (!inputValid(value)) return makeResult("C1S-SHAPE");
    return makeResult(inspectAbsentStore(factory.root, factory.io));
  };
  return Object.freeze({
    createOperation: (value) => createOperation(factory, value, ports),
    recordPreflight: (value) => unavailableInput(value, ["handle", "eventId", "observation"]) ? incompleteWrite() : incompleteWrite("C1S-SHAPE"),
    recordCompletion: (value) => unavailableInput(value, ["handle", "controlId", "source", "observedAt", "context"]) ? incompleteWrite() : incompleteWrite("C1S-SHAPE"),
    recordDiagnostic: (value) => unavailableInput(value, ["handle", "controlId", "code", "observedAt"]) ? incompleteWrite() : incompleteWrite("C1S-SHAPE"),
    readOperation: read(operationInput, operationResult),
    readSnapshot: read(snapshotInput, snapshotResult),
    publishReport: (value) => unavailableInput(value, ["snapshot"]) ? incompleteReport() : incompleteReport("C1S-SHAPE"),
  });
}
