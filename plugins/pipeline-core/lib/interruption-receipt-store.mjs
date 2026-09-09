// SPDX-License-Identifier: SUL-1.0
/**
 * Local interruption-store boundary.
 *
 * This is intentionally only the C1 read foundation.  In particular, it does
 * not initialise a collection or allocate any public identity.
 */
import * as fs from "node:fs";
import { join } from "node:path";

const CREATE_SCHEMA = "pipeline.interruption-store-create-result.v1";
const OPERATION_SCHEMA = "pipeline.interruption-store-operation-result.v1";
const WRITE_SCHEMA = "pipeline.interruption-store-write-result.v1";
const SNAPSHOT_SCHEMA = "pipeline.interruption-store-snapshot-result.v1";
const REPORT_SCHEMA = "pipeline.interruption-store-report-result.v1";
const IO_KEYS = ["lstatSync", "realpathSync", "openSync", "fstatSync", "readSync", "writeSync", "fsyncSync", "closeSync", "mkdirSync", "linkSync", "unlinkSync", "rmdirSync", "opendirSync", "statfsSync"];
const ID = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/u;

export const productionPorts = Object.freeze({
  io: Object.freeze(Object.fromEntries(IO_KEYS.map((key) => [key, fs[key]]))),
  clock: () => ({ value: null, status: "unknown" }),
  randomId: () => null,
  platform: () => ({ status: "unsupported", backendId: null }),
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
    createOperation: (value) => unavailableInput(value, ["context"]) ? incompleteCreate() : incompleteCreate("C1S-SHAPE"),
    recordPreflight: (value) => unavailableInput(value, ["handle", "eventId", "observation"]) ? incompleteWrite() : incompleteWrite("C1S-SHAPE"),
    recordCompletion: (value) => unavailableInput(value, ["handle", "controlId", "source", "observedAt", "context"]) ? incompleteWrite() : incompleteWrite("C1S-SHAPE"),
    recordDiagnostic: (value) => unavailableInput(value, ["handle", "controlId", "code", "observedAt"]) ? incompleteWrite() : incompleteWrite("C1S-SHAPE"),
    readOperation: read(operationInput, operationResult),
    readSnapshot: read(snapshotInput, snapshotResult),
    publishReport: (value) => unavailableInput(value, ["snapshot"]) ? incompleteReport() : incompleteReport("C1S-SHAPE"),
  });
}
