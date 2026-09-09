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
import { buildInterruptionReceipt, validateInterruptionReceipt } from "./interruption-receipts.mjs";
import registry from "../../../policies/interruption-registry.v1.json" with { type: "json" };

const CREATE_SCHEMA = "pipeline.interruption-store-create-result.v1";
const OPERATION_SCHEMA = "pipeline.interruption-store-operation-result.v1";
const WRITE_SCHEMA = "pipeline.interruption-store-write-result.v1";
const SNAPSHOT_SCHEMA = "pipeline.interruption-store-snapshot-result.v1";
const REPORT_SCHEMA = "pipeline.interruption-store-report-result.v1";
const IO_KEYS = ["lstatSync", "realpathSync", "openSync", "fstatSync", "readSync", "writeSync", "fsyncSync", "closeSync", "mkdirSync", "linkSync", "unlinkSync", "rmdirSync", "opendirSync", "statfsSync"];
const ID = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const PRIVATE_ID = /(?:^|[._:+-])(?:sk-|gh[pousr]_|github_pat_|AKIA[0-9A-Z]{16})/u;
const BACKEND_ID = "linux-node24.15.0-ef53-v1";
const EXT_TYPE = 0xef53n;
const STORE_KEYS = ["schema", "storeId", "layoutRevision"];
const OPERATION_KEYS = ["schema", "storeId", "operationId", "operationKind", "createdAt", "scope", "specSha256", "specPathSha256"];
const MARKER_KEYS = ["schema", "kind", "id", "storeId", "operationId", "operationSha256", "sequence", "previousEntrySha256", "lineageId", "firstObservedAt", "files"];
const RECEIPT_FILES = ["observation.json", "receipt.json"];
const RECEIPT_LIMIT = 4096;
const RECEIPT_BYTES_LIMIT = 64 * 1024 * 1024;
const SOURCE_STAGE_CODES = Object.freeze({
  arguments: ["CDP-ARGUMENT"], request: ["CDP-INPUT"], candidate: ["CDP-GIT", "CDP-REF", "CDP-RANGE"],
  paths: ["CDP-PATH", "CDP-PATHS", "CDP-DUPLICATE-PATH", "CDP-EVIDENCE-REQUIRED", "CDP-PRIOR-ALIASED"], inventory: ["CDP-GIT", "CDP-TREE", "CDP-PATH"],
  manifest: ["CDP-MANIFEST"], governance: ["CDP-GIT", "CDP-PATH"], "candidate-files": ["CDP-CANDIDATE-PATH", "CDP-CANDIDATE-READ"],
  evidence: ["CDP-EVIDENCE-PATH", "CDP-EVIDENCE-FILE", "CDP-EVIDENCE-JSON", "CDP-EVIDENCE-BINDING"], "prior-evidence": ["CDP-EVIDENCE-PATH", "CDP-EVIDENCE-FILE"],
});
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

function publicId(value) { return typeof value === "string" && ID.test(value) && !PRIVATE_ID.test(value); }

function safeScope(value) {
  const fields = shape(value, ["featureId", "packageId", "dispatchId", "phase"]);
  if (!fields || !ID.test(fields.featureId.value) || fields.packageId.value !== null || fields.dispatchId.value !== null
    || !(fields.phase.value === null || typeof fields.phase.value === "string" && ID.test(fields.phase.value))) return null;
  return { featureId: fields.featureId.value, packageId: null, dispatchId: null, phase: fields.phase.value };
}

function safeOwnerBinding(value) {
  const fields = shape(value, ["stateSha256", "continuityRevision", "specSha256", "specPathSha256"]);
  if (!fields || ![fields.stateSha256.value, fields.specSha256.value, fields.specPathSha256.value].every((item) => typeof item === "string" && DIGEST.test(item))
    || !Number.isSafeInteger(fields.continuityRevision.value) || fields.continuityRevision.value < 0) return null;
  return { stateSha256: fields.stateSha256.value, continuityRevision: fields.continuityRevision.value,
    specSha256: fields.specSha256.value, specPathSha256: fields.specPathSha256.value };
}

function safePreflightObservation(value) {
  const fields = shape(value, ["schema", "source", "observedAt", "scope", "actor", "ownerBinding"]);
  if (!fields || fields.schema.value !== "pipeline.critic-preflight-local-observation.v1") return null;
  const sourceFields = shape(fields.source.value, ["schema", "producer", "observationRevision", "stage", "outcome", "code", "candidate", "specSha256"]);
  const scope = safeScope(fields.scope.value), ownerBinding = safeOwnerBinding(fields.ownerBinding.value);
  const actor = shape(fields.actor.value, ["runner", "role"]), observedAt = safeTime(fields.observedAt.value);
  if (!sourceFields || !scope || !ownerBinding || !actor || !observedAt || actor.runner.value !== null || actor.role.value !== null
    || sourceFields.schema.value !== "pipeline.critic-preflight-observation.v1" || sourceFields.producer.value !== "critic-dispatch-preflight"
    || sourceFields.observationRevision.value !== 1 || !["rejected", "packet-ready"].includes(sourceFields.outcome.value)
    || typeof sourceFields.stage.value !== "string" || (sourceFields.outcome.value === "rejected"
      && sourceFields.code.value !== "CDP-UNEXPECTED" && !SOURCE_STAGE_CODES[sourceFields.stage.value]?.includes(sourceFields.code.value))
    || (sourceFields.specSha256.value !== null && !DIGEST.test(sourceFields.specSha256.value))) return null;
  const candidateFields = shape(sourceFields.candidate.value, ["commit", "tree"]);
  if (!candidateFields || !OID.test(candidateFields.commit.value) || !OID.test(candidateFields.tree.value)
    || candidateFields.commit.value.length !== candidateFields.tree.value.length) return null;
  if (sourceFields.outcome.value === "packet-ready" && (sourceFields.stage.value !== "complete" || sourceFields.code.value !== null || sourceFields.specSha256.value === null)) return null;
  if (sourceFields.outcome.value === "rejected" && (sourceFields.stage.value === "complete" || sourceFields.code.value === null || !Object.hasOwn(SOURCE_STAGE_CODES, sourceFields.stage.value))) return null;
  return { schema: fields.schema.value, source: { schema: sourceFields.schema.value, producer: sourceFields.producer.value,
    observationRevision: sourceFields.observationRevision.value, stage: sourceFields.stage.value, outcome: sourceFields.outcome.value,
    code: sourceFields.code.value, candidate: { commit: candidateFields.commit.value, tree: candidateFields.tree.value }, specSha256: sourceFields.specSha256.value },
  observedAt, scope, actor: { runner: null, role: null }, ownerBinding };
}

function preflightInput(value) {
  const fields = shape(value, ["handle", "eventId", "observation"]);
  const handle = fields ? shape(fields.handle.value, ["storeId", "operationId", "operationSha256"]) : null;
  const observation = fields ? safePreflightObservation(fields.observation.value) : null;
  if (!fields || !handle || !observation || !publicId(fields.eventId.value) || !ID.test(handle.storeId.value) || !ID.test(handle.operationId.value)
    || !DIGEST.test(handle.operationSha256.value)) return null;
  return { handle: { storeId: handle.storeId.value, operationId: handle.operationId.value, operationSha256: handle.operationSha256.value },
    eventId: fields.eventId.value, observation };
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

function sameTime(left, right) { return left.value === right.value && left.status === right.status; }
function markerFile(marker, name) { return Array.isArray(marker.files) ? marker.files.find((file) => file?.name === name) ?? null : null; }

function validReceiptBundle(io, path, rootStat, operationById, directoryName) {
  if (!sameDirectory(io, path, rootStat)) return null;
  const names = directoryNames(io, path, 4);
  if (!Array.isArray(names) || names.length !== 4 || ![...names].sort().every((name, index) => name === [".commit.pending", "commit.json", ...RECEIPT_FILES][index])) return null;
  const observationBytes = readRegular(io, join(path, "observation.json"), 1_048_576);
  const receiptBytes = readRegular(io, join(path, "receipt.json"), 1_048_576);
  const markerBytes = readRegular(io, join(path, "commit.json"), 4096, 2n);
  const pendingBytes = readRegular(io, join(path, ".commit.pending"), 4096, 2n);
  if (!observationBytes || !receiptBytes || !markerBytes || !pendingBytes || !markerBytes.equals(pendingBytes)) return null;
  const observation = safePreflightObservation(parseCanonical(observationBytes)), receipt = parseCanonical(receiptBytes), marker = parseCanonical(markerBytes);
  if (!observation || !receipt || !exactData(marker, MARKER_KEYS) || validateInterruptionReceipt(receipt, registry).ok !== true
    || !markerBytes.equals(canonicalBytes(marker)) || !observationBytes.equals(canonicalBytes(observation)) || !receiptBytes.equals(canonicalBytes(receipt))
    || marker.schema !== "pipeline.interruption-publication.v1" || marker.kind !== "receipt" || !publicId(marker.id) || sha256(Buffer.from(marker.id, "utf8")) !== directoryName || !ID.test(marker.storeId)
    || !ID.test(marker.operationId) || !DIGEST.test(marker.operationSha256) || !Number.isSafeInteger(marker.sequence) || marker.sequence < 1
    || !DIGEST.test(marker.previousEntrySha256) || !ID.test(marker.lineageId) || !timeInput(marker.firstObservedAt)
    || !Array.isArray(marker.files) || marker.files.length !== 2) return null;
  const operation = operationById.get(marker.operationId);
  if (!operation || operation.storeId !== marker.storeId || operation.sha256 !== marker.operationSha256
    || operation.metadata.scope.featureId !== observation.scope.featureId || operation.metadata.scope.phase !== observation.scope.phase
    || operation.metadata.specSha256 !== observation.ownerBinding.specSha256 || operation.metadata.specPathSha256 !== observation.ownerBinding.specPathSha256
    || observation.source.specSha256 !== null && observation.source.specSha256 !== operation.metadata.specSha256) return null;
  const observationFile = markerFile(marker, "observation.json"), receiptFile = markerFile(marker, "receipt.json");
  if (!observationFile || !receiptFile || !exactData(observationFile, ["name", "sha256", "byteLength", "recordSha256"])
    || !exactData(receiptFile, ["name", "sha256", "byteLength", "recordSha256"])
    || observationFile.sha256 !== sha256(observationBytes) || observationFile.byteLength !== observationBytes.length || observationFile.recordSha256 !== null
    || receiptFile.sha256 !== sha256(receiptBytes) || receiptFile.byteLength !== receiptBytes.length || receiptFile.recordSha256 !== receipt.recordSha256) return null;
  const artifact = receipt.observations.length === 1 ? receipt.observations[0].artifact : null;
  if (receipt.eventId !== marker.id || receipt.lineageId !== marker.lineageId || !sameTime(receipt.firstObservedAt, marker.firstObservedAt)
    || receipt.state !== "unknown" || receipt.typedCode !== observation.source.code || receipt.observedThroughAt.value !== observation.observedAt.value
    || receipt.observedThroughAt.status !== observation.observedAt.status || receipt.scope.featureId !== observation.scope.featureId
    || receipt.scope.packageId !== null || receipt.scope.dispatchId !== null || receipt.scope.phase !== observation.scope.phase
    || receipt.actor.runner !== null || receipt.actor.role !== null || receipt.resolution !== null || receipt.resolvedAt.value !== null || receipt.terminalAt.value !== null
    || receipt.attemptCount.status !== "unknown" || receipt.recoveryCount.status !== "unknown" || receipt.classification !== "unknown" || receipt.category !== "unknown"
    || receipt.matchedRuleIds.length !== 0 || marker.files[0]?.name !== "observation.json" || marker.files[1]?.name !== "receipt.json" || receipt.observations.length !== 1 || receipt.observations[0].sourceKind !== "workflow-observer"
    || receipt.observations[0].facts.length !== 0 || !artifact || artifact.id !== marker.id || artifact.sha256 !== sha256(observationBytes)
    || receipt.binding.artifacts.length !== 1 || receipt.binding.artifacts[0].id !== marker.id || receipt.binding.artifacts[0].sha256 !== sha256(observationBytes)
    || receipt.binding.candidate === null || receipt.binding.candidate.commit !== observation.source.candidate.commit || receipt.binding.candidate.tree !== observation.source.candidate.tree
    || Object.values(receipt.joins).some((rows) => rows.length !== 0)) return null;
  return { marker, markerSha256: sha256(markerBytes), observationBytes, receiptBytes, observation, receipt };
}

function operationInventory(io, entriesPath, storeId) {
  if (!validOperationInventory(io, entriesPath, storeId)) return null;
  const result = new Map();
  for (const name of directoryNames(io, entriesPath)) {
    const metadataBytes = readRegular(io, join(entriesPath, name, "metadata.json"));
    const metadata = metadataBytes ? parseCanonical(metadataBytes) : null;
    if (!metadata) return null;
    result.set(metadata.operationId, { storeId, sha256: sha256(metadataBytes), metadata, commitSha256: sha256(readRegular(io, join(entriesPath, name, "commit.json"), 4096, 2n)) });
  }
  return result;
}

function receiptInventory(io, receiptsPath, rootStat, operationById) {
  const names = directoryNames(io, receiptsPath, RECEIPT_LIMIT + 1);
  if (!Array.isArray(names) || names.length > RECEIPT_LIMIT || !names.every((name) => /^[a-f0-9]{64}$/u.test(name))) return null;
  const rows = [];
  for (const name of names) {
    const row = validReceiptBundle(io, join(receiptsPath, name), rootStat, operationById, name);
    if (!row) return null;
    rows.push({ name, ...row });
  }
  return rows;
}

function operationLineage(rows, operation) {
  const own = rows.filter((row) => row.marker.operationId === operation.metadata.operationId).sort((left, right) => left.marker.sequence - right.marker.sequence);
  let previous = operation.commitSha256, lineageId = null, firstObservedAt = null;
  for (let index = 0; index < own.length; index++) {
    const row = own[index];
    if (row.marker.sequence !== index + 1 || row.marker.previousEntrySha256 !== previous
      || lineageId !== null && row.marker.lineageId !== lineageId || firstObservedAt !== null && !sameTime(row.marker.firstObservedAt, firstObservedAt)) return null;
    lineageId = row.marker.lineageId; firstObservedAt = row.marker.firstObservedAt; previous = row.markerSha256;
  }
  return { sequence: own.length + 1, previousEntrySha256: previous, lineageId, firstObservedAt };
}

function createReceiptBundle(io, directoryPath, observationBytes, receiptBytes, marker) {
  const observationPath = join(directoryPath, "observation.json"), receiptPath = join(directoryPath, "receipt.json");
  if (!exclusiveFile(io, observationPath, observationBytes) || !exclusiveFile(io, receiptPath, receiptBytes)) return false;
  const finalMarker = { ...marker, files: [
    { name: "observation.json", sha256: sha256(observationBytes), byteLength: observationBytes.length, recordSha256: null },
    { name: "receipt.json", sha256: sha256(receiptBytes), byteLength: receiptBytes.length, recordSha256: parseCanonical(receiptBytes)?.recordSha256 ?? null },
  ] };
  const markerBytes = canonicalBytes(finalMarker), pendingPath = join(directoryPath, ".commit.pending"), commitPath = join(directoryPath, "commit.json");
  if (!exclusiveFile(io, pendingPath, markerBytes)) return false;
  try { io.linkSync(pendingPath, commitPath); } catch { return false; }
  if (!fsyncDirectory(io, directoryPath)) return false;
  const committed = readRegular(io, commitPath, 4096, 2n), pending = readRegular(io, pendingPath, 4096, 2n);
  return committed && pending && committed.equals(markerBytes) && pending.equals(markerBytes) ? sha256(markerBytes) : false;
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

function writeTopology(factory, root, lockHeld = false) {
  const evidencePath = join(root.path, "evidence"), collectionPath = join(evidencePath, "interruption-collection");
  for (const path of [evidencePath, collectionPath]) {
    const found = lstat(factory.io, path);
    if (found.state === "absent") return { code: "C1S-NOT-FOUND" };
    if (found.state !== "present" || !sameDirectory(factory.io, path, root.stat)) return { code: "C1S-ROOT" };
  }
  const lockPath = join(collectionPath, ".writer-lock"), lockState = lstat(factory.io, lockPath);
  if (lockState.state === "present" && !lockHeld) return { code: directory(lockState.stat) ? "C1S-LOCKED" : "C1S-ROOT" };
  if (lockState.state === "present" && !directory(lockState.stat)) return { code: "C1S-ROOT" };
  if (lockState.state === "error") return { code: "C1S-IO" };
  const paths = { collectionPath, storePath: join(collectionPath, "store"), entriesPath: join(collectionPath, "entries"),
    receiptsPath: join(evidencePath, "interruption-receipts"), telemetryPath: join(root.path, "telemetry"), reportsPath: join(root.path, "telemetry", "interruptions") };
  for (const path of [paths.storePath, paths.entriesPath, paths.receiptsPath, paths.telemetryPath, paths.reportsPath]) {
    const found = lstat(factory.io, path);
    if (found.state === "absent") return { code: "C1S-CORRUPT" };
    if (found.state !== "present" || !sameDirectory(factory.io, path, root.stat)) return { code: "C1S-ROOT" };
  }
  const storeId = validStoreBundle(factory.io, paths.storePath);
  if (!storeId) return { code: contents(factory.io, paths.storePath) === "material" ? "C1S-INCOMPLETE" : "C1S-CORRUPT" };
  return { code: null, storeId, ...paths };
}

function recordPreflight(factory, value, ports) {
  const input = preflightInput(value);
  if (!input) return incompleteWrite("C1S-SHAPE");
  const root = safeRoot(factory.io, factory.root);
  if (!root) return incompleteWrite("C1S-ROOT");
  if (!platformEligible(ports.platform, root.path)) return incompleteWrite("C1S-PLATFORM");
  const before = writeTopology(factory, root);
  if (before.code) return incompleteWrite(before.code);
  let nonce;
  try { nonce = ports.randomId(); } catch { return incompleteWrite("C1S-IO"); }
  if (!ID.test(nonce)) return incompleteWrite("C1S-IO");
  const token = lock(factory.io, before.collectionPath, root.stat, nonce);
  if (token === null) return incompleteWrite("C1S-LOCKED");
  if (!token) return incompleteWrite("C1S-IO");
  try {
    const topology = writeTopology(factory, root, true);
    if (topology.code) return incompleteWrite(topology.code);
    if (topology.storeId !== input.handle.storeId) return incompleteWrite("C1S-BINDING");
    const operations = operationInventory(factory.io, topology.entriesPath, topology.storeId);
    if (!operations) return incompleteWrite("C1S-CORRUPT");
    const operation = operations.get(input.handle.operationId);
    if (!operation) return incompleteWrite("C1S-NOT-FOUND");
    if (operation.sha256 !== input.handle.operationSha256) return incompleteWrite("C1S-BINDING");
    if (operation.metadata.scope.featureId !== input.observation.scope.featureId || operation.metadata.scope.phase !== input.observation.scope.phase
      || operation.metadata.specSha256 !== input.observation.ownerBinding.specSha256 || operation.metadata.specPathSha256 !== input.observation.ownerBinding.specPathSha256
      || input.observation.source.specSha256 !== null && input.observation.source.specSha256 !== operation.metadata.specSha256) return incompleteWrite("C1S-BINDING");
    const eventDirectory = sha256(Buffer.from(input.eventId, "utf8")), eventPath = join(topology.receiptsPath, eventDirectory);
    const target = lstat(factory.io, eventPath);
    if (target.state === "error") return incompleteWrite("C1S-IO");
    const observationBytes = canonicalBytes(input.observation);
    if (target.state === "present") {
      if (!sameDirectory(factory.io, eventPath, root.stat)) return incompleteWrite("C1S-ROOT");
      const committed = lstat(factory.io, join(eventPath, "commit.json"));
      if (committed.state === "absent") return incompleteWrite("C1S-INCOMPLETE");
      if (committed.state === "error") return incompleteWrite("C1S-IO");
      if (!regular(committed.stat)) return incompleteWrite("C1S-ROOT");
      const existing = validReceiptBundle(factory.io, eventPath, root.stat, operations, eventDirectory);
      if (!existing) return incompleteWrite("C1S-CORRUPT");
      if (existing.marker.id !== input.eventId || !existing.observationBytes.equals(observationBytes)) return incompleteWrite("C1S-CONFLICT");
      return Object.freeze({ schema: WRITE_SCHEMA, status: "replayed", code: null, coreCode: null, eventId: input.eventId,
        lineageId: existing.marker.lineageId, entrySha256: existing.markerSha256 });
    }
    const receipts = receiptInventory(factory.io, topology.receiptsPath, root.stat, operations);
    if (!receipts) return incompleteWrite("C1S-INCOMPLETE");
    const lineage = operationLineage(receipts, operation);
    if (!lineage) return incompleteWrite("C1S-CORRUPT");
    let lineageId = lineage.lineageId, firstObservedAt = lineage.firstObservedAt;
    if (lineageId === null) {
      try { lineageId = ports.randomId(); } catch { return incompleteWrite("C1S-IO"); }
      if (!ID.test(lineageId)) return incompleteWrite("C1S-IO");
      firstObservedAt = input.observation.observedAt;
    }
    const receiptInput = { eventId: input.eventId, lineageId, scope: input.observation.scope, actor: { runner: null, role: null }, typedCode: input.observation.source.code,
      observations: [{ sourceKind: "workflow-observer", facts: [], artifact: { id: input.eventId, sha256: sha256(observationBytes) } }], state: "unknown",
      firstObservedAt, observedThroughAt: input.observation.observedAt, resolvedAt: { value: null, status: "unknown" }, terminalAt: { value: null, status: "unknown" },
      attemptCoverage: "unknown", recoveryCoverage: "unknown", joins: { invocations: [], reviews: [], usages: [], recoveries: [] }, resolution: null,
      binding: { candidate: input.observation.source.candidate, artifacts: [{ id: input.eventId, sha256: sha256(observationBytes) }] } };
    const built = buildInterruptionReceipt(receiptInput, registry);
    if (!built.ok) return { ...incompleteWrite("C1S-RECEIPT"), coreCode: built.code };
    const receiptBytes = canonicalBytes(built.receipt);
    const retainedBytes = receipts.reduce((total, row) => total + row.observationBytes.length + row.receiptBytes.length, 0);
    if (receipts.length >= RECEIPT_LIMIT || retainedBytes + observationBytes.length + receiptBytes.length > RECEIPT_BYTES_LIMIT) return incompleteWrite("C1S-LIMIT");
    const made = mkdirChecked(factory.io, eventPath, root.stat);
    if (made !== "created") return incompleteWrite(made === "root" ? "C1S-ROOT" : "C1S-IO");
    if (!fsyncDirectory(factory.io, topology.receiptsPath)) return incompleteWrite("C1S-IO");
    const marker = { schema: "pipeline.interruption-publication.v1", kind: "receipt", id: input.eventId, storeId: topology.storeId,
      operationId: operation.metadata.operationId, operationSha256: operation.sha256, sequence: lineage.sequence, previousEntrySha256: lineage.previousEntrySha256,
      lineageId, firstObservedAt, files: [] };
    const entrySha256 = createReceiptBundle(factory.io, eventPath, observationBytes, receiptBytes, marker);
    if (!entrySha256) return incompleteWrite("C1S-IO");
    const readback = validReceiptBundle(factory.io, eventPath, root.stat, operations, eventDirectory);
    if (!readback || readback.markerSha256 !== entrySha256) return incompleteWrite("C1S-IO");
    return Object.freeze({ schema: WRITE_SCHEMA, status: "created", code: null, coreCode: null, eventId: input.eventId, lineageId, entrySha256 });
  } finally { releaseLock(factory.io, token); }
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
    recordPreflight: (value) => recordPreflight(factory, value, ports),
    recordCompletion: (value) => unavailableInput(value, ["handle", "controlId", "source", "observedAt", "context"]) ? incompleteWrite() : incompleteWrite("C1S-SHAPE"),
    recordDiagnostic: (value) => unavailableInput(value, ["handle", "controlId", "code", "observedAt"]) ? incompleteWrite() : incompleteWrite("C1S-SHAPE"),
    readOperation: read(operationInput, operationResult),
    readSnapshot: read(snapshotInput, snapshotResult),
    publishReport: (value) => unavailableInput(value, ["snapshot"]) ? incompleteReport() : incompleteReport("C1S-SHAPE"),
  });
}
