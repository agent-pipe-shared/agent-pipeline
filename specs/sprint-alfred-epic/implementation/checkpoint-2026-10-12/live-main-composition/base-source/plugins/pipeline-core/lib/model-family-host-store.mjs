// SPDX-License-Identifier: SUL-1.0
/**
 * Inert private host store/controller for model-family invocations.
 *
 * The caller never supplies discovery, an authority Result, a selection, or a
 * receipt to persist. Source functions are a trusted host wiring boundary:
 * they reload raw authority/proof/anchors and obtain a freshly verified S2
 * preparation. The controller invokes S1 and S3 itself. This module alone
 * cannot qualify a provider or cause a native runner to launch.
 */
import { createHash, randomBytes } from "node:crypto";
import {
  closeSync, constants, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync,
  openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { canonicalizeJson, parseStrictJson } from "./governance-event.mjs";
import { verifyModelFamilyAuthority, verifyModelFamilyPinDecision } from "./model-family-authority.mjs";
import { evaluateModelFamilySelection } from "./model-family-latest-selection.mjs";

const SHA = /^[a-f0-9]{64}$/u;
const OID = /^[a-f0-9]{40}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const ROUTERS = new Set(["codex", "claude", "antigravity"]);
const MAX_BYTES = 1024 * 1024;
const MAX_RECEIPTS = 4096;
const RETRIES = 2;
const FRESH_MS = 60_000;
const MARKER = "activation.json";
const STATE = "current.json";
const RECEIPTS = "receipts";
const LOCK = ".writer.lock";
const frozenHandles = new WeakSet();
const driverContexts = new WeakMap();
const MAX_NATIVE_REQUEST_BYTES = 7 * 1024 * 1024;
const MAX_NATIVE_REQUEST_DEPTH = 64;
const MAX_NATIVE_REQUEST_NODES = 100_000;

const fail = (code, retryable = false) => ({ ok: false, code, retryable });
const digest = (value) => createHash("sha256").update(canonicalizeJson(value)).digest("hex");
const own = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
const invocationTuple = (key) => JSON.stringify([key.runner, key.installationBindingSha256,
  key.accountBindingSha256, key.sessionId, key.invocationId]);
const slotTuple = (a) => JSON.stringify([a.runner, a.taskRoute, a.role, a.effort, a.familyId]);

function frozenClone(value) {
  const copy = structuredClone(value);
  const seen = new WeakSet();
  const freeze = (item) => {
    if (!item || typeof item !== "object" || seen.has(item)) return item;
    seen.add(item);
    for (const child of Object.values(item)) freeze(child);
    return Object.freeze(item);
  };
  return freeze(copy);
}

function deeplyFrozen(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return true;
  seen.add(value);
  return Object.isFrozen(value) && Object.values(value).every((child) => deeplyFrozen(child, seen));
}

function snapshotNativeRequest(input) {
  let nodes = 0;
  const clone = (value, depth, seen) => {
    nodes += 1;
    if (nodes > MAX_NATIVE_REQUEST_NODES || depth > MAX_NATIVE_REQUEST_DEPTH) throw new Error("NATIVE_REQUEST_BOUNDS");
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "object" || seen.has(value)) throw new Error("NATIVE_REQUEST_VALUE");
    const proto = Object.getPrototypeOf(value);
    if (Array.isArray(value)) {
      if (proto !== Array.prototype || Object.getOwnPropertySymbols(value).length) throw new Error("NATIVE_REQUEST_ARRAY");
      if (Object.getOwnPropertyNames(value).length !== value.length + 1) throw new Error("NATIVE_REQUEST_ARRAY");
      seen.add(value);
      const result = [];
      for (let i = 0; i < value.length; i += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
        if (!descriptor || !Object.hasOwn(descriptor, "value")) throw new Error("NATIVE_REQUEST_ARRAY");
        result.push(clone(descriptor.value, depth + 1, seen));
      }
      if (Object.keys(value).length !== value.length) throw new Error("NATIVE_REQUEST_ARRAY");
      seen.delete(value);
      return Object.freeze(result);
    }
    if (proto !== Object.prototype && proto !== null) throw new Error("NATIVE_REQUEST_OBJECT");
    if (Object.getOwnPropertySymbols(value).length) throw new Error("NATIVE_REQUEST_OBJECT");
    if (Object.getOwnPropertyNames(value).length !== Object.keys(value).length) throw new Error("NATIVE_REQUEST_OBJECT");
    seen.add(value);
    const result = Object.create(null);
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.hasOwn(descriptor, "value")) throw new Error("NATIVE_REQUEST_OBJECT");
      result[key] = clone(descriptor.value, depth + 1, seen);
    }
    seen.delete(value);
    return Object.freeze(result);
  };
  const value = clone(input, 0, new WeakSet());
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Buffer.byteLength(canonicalizeJson(value), "utf8") > MAX_NATIVE_REQUEST_BYTES) throw new Error("NATIVE_REQUEST_BOUNDS");
  return value;
}

/**
 * Consume the one-shot private context passed only to the trusted launch
 * driver after S4 has admitted the native request and repeated its locked
 * prelaunch/candidate checks. The opaque handle cannot be reconstructed from
 * a receipt or checksum; the returned values retain the original S4 handle,
 * key/assignment and immutable native request snapshot.
 */
export function consumeModelFamilyHostDriverContext(context) {
  const held = context !== null && (typeof context === "object" || typeof context === "function")
    ? driverContexts.get(context) : null;
  if (!held || held.consumed) return fail("MODEL-FAMILY-DRIVER-CONTEXT-REQUIRED");
  held.consumed = true;
  return { ok: true, code: "MODEL-FAMILY-DRIVER-CONTEXT-READY", value: Object.freeze({
    rootDir: held.rootDir,
    invocation: held.invocation,
    key: held.invocation.key,
    assignment: held.invocation.assignment,
    prelaunchToken: held.prelaunchToken,
    nativeRequest: held.nativeRequest,
    revalidate: held.revalidate,
  }) };
}

function validKey(key) {
  return own(key, ["runner", "installationBindingSha256", "accountBindingSha256", "sessionId", "invocationId"])
    && ROUTERS.has(key.runner) && SHA.test(key.installationBindingSha256 ?? "")
    && SHA.test(key.accountBindingSha256 ?? "") && ID.test(key.sessionId ?? "")
    && ID.test(key.invocationId ?? "");
}

function validAssignment(a, authority) {
  if (!own(a, ["runner", "taskRoute", "role", "effort", "familyId"]) || !ROUTERS.has(a.runner)
    || typeof a.taskRoute !== "string" || !/^(?:profile|duty)\.[A-Za-z0-9_.-]{1,120}$/u.test(a.taskRoute)
    || !["frontier", "worker", "efficient"].includes(a.role)
    || !["low", "medium", "high", "xhigh", "max", "not-applicable"].includes(a.effort)
    || typeof a.familyId !== "string" || !/^[a-z][a-z0-9-]{0,31}$/u.test(a.familyId)) return false;
  return authority.assignments.filter((x) => x.runner === a.runner && x.taskRoute === a.taskRoute
    && x.role === a.role && x.effort === a.effort && x.familyId === a.familyId).length === 1;
}

function resolverAssignment(authority, assignment) {
  const rows = authority.assignments.filter((x) => x.runner === assignment.runner
    && x.taskRoute === assignment.taskRoute && x.role === assignment.role && x.effort === assignment.effort
    && x.familyId === assignment.familyId);
  if (rows.length !== 1) return null;
  return { ...assignment, adapterContractSha256: rows[0].adapterContractSha256,
    minimumVersion: rows[0].minimumVersion, update: "latest" };
}

function assertNoLinks(path, allowMissingLeaf = false) {
  if (typeof path !== "string" || !path.startsWith("/")) throw new Error("STORE_ROOT");
  const absolute = resolve(path);
  if (absolute !== path || absolute === sep) throw new Error("STORE_ALIAS");
  const parts = absolute.split(sep).filter(Boolean);
  let cursor = sep;
  for (let index = 0; index < parts.length; index += 1) {
    cursor = join(cursor, parts[index]);
    let st;
    try { st = lstatSync(cursor); }
    catch (error) {
      if (allowMissingLeaf && index === parts.length - 1 && error?.code === "ENOENT") return;
      throw error;
    }
    if (st.isSymbolicLink() || realpathSync(cursor) !== cursor) throw new Error("STORE_LINK");
    if (index < parts.length - 1 && !st.isDirectory()) throw new Error("STORE_ANCESTOR");
  }
}

function ensureDir(path, create) {
  assertNoLinks(path, true);
  if (create) {
    try { mkdirSync(path, { mode: 0o700 }); }
    catch (error) { if (error?.code !== "EEXIST") throw error; }
  }
  assertNoLinks(path);
  const st = lstatSync(path);
  if (!st.isDirectory() || (st.mode & 0o077) !== 0) throw new Error("STORE_PERMISSIONS");
}

function safeRead(path, limit = MAX_BYTES) {
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size < 1
    || before.size > limit || (before.mode & 0o077) !== 0) throw new Error("STORE_FILE");
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const pinned = fstatSync(fd);
    if (!pinned.isFile() || pinned.nlink !== 1 || pinned.dev !== before.dev || pinned.ino !== before.ino
      || pinned.size !== before.size || (pinned.mode & 0o077) !== 0) throw new Error("STORE_RACE");
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    const named = lstatSync(path);
    if (bytes.length !== after.size || after.dev !== pinned.dev || after.ino !== pinned.ino
      || after.size !== pinned.size || after.mtimeMs !== pinned.mtimeMs
      || named.dev !== pinned.dev || named.ino !== pinned.ino || named.isSymbolicLink()) throw new Error("STORE_RACE");
    return bytes;
  } finally { closeSync(fd); }
}

function writeNew(path, value, limit = MAX_BYTES) {
  const bytes = Buffer.from(`${canonicalizeJson(value)}\n`, "utf8");
  if (bytes.length > limit) throw new Error("STORE_SIZE");
  const temp = join(dirname(path), `.stage-${randomBytes(16).toString("hex")}`);
  const fd = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
    | (constants.O_NOFOLLOW ?? 0), 0o600);
  try {
    let offset = 0;
    while (offset < bytes.length) {
      const count = writeSync(fd, bytes, offset, bytes.length - offset, offset);
      if (count < 1) throw new Error("STORE_WRITE");
      offset += count;
    }
    fsyncSync(fd);
    if (fstatSync(fd).size !== bytes.length) throw new Error("STORE_WRITE");
    linkSync(temp, path);
  } finally {
    closeSync(fd);
    try { unlinkSync(temp); } catch {}
  }
  syncDirectory(dirname(path));
}

function replaceAtomic(path, value) {
  const bytes = Buffer.from(`${canonicalizeJson(value)}\n`, "utf8");
  if (bytes.length > MAX_BYTES) throw new Error("STORE_SIZE");
  const temp = join(dirname(path), `.stage-${randomBytes(16).toString("hex")}`);
  const fd = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
    | (constants.O_NOFOLLOW ?? 0), 0o600);
  try {
    let offset = 0;
    while (offset < bytes.length) {
      const count = writeSync(fd, bytes, offset, bytes.length - offset, offset);
      if (count < 1) throw new Error("STORE_WRITE");
      offset += count;
    }
    fsyncSync(fd);
    if (fstatSync(fd).size !== bytes.length) throw new Error("STORE_WRITE");
  } finally { closeSync(fd); }
  try {
    renameSync(temp, path);
    syncDirectory(dirname(path));
  } finally { try { unlinkSync(temp); } catch {} }
}

function syncDirectory(path) {
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    fsyncSync(fd);
  } catch (error) {
    if (!new Set(["EPERM", "EINVAL", "EISDIR", "EACCES", "ENOTSUP", "EBADF"]).has(error?.code)) throw error;
  } finally { if (fd !== undefined) closeSync(fd); }
}

function strictObject(value, keys) { return own(value, keys); }

function validateState(value) {
  if (!strictObject(value, ["schema", "generation", "activation", "authoritySha256", "pinStates", "watermarks", "invocationIndex"])
    || value.schema !== "pipeline.model-family-host-state.v1" || !Number.isSafeInteger(value.generation)
    || value.generation < 0 || value.activation !== "family-active" || !SHA.test(value.authoritySha256 ?? "")
    || !Array.isArray(value.pinStates) || value.pinStates.length > 512 || !Array.isArray(value.watermarks)
    || value.watermarks.length > MAX_RECEIPTS || !Array.isArray(value.invocationIndex)
    || value.invocationIndex.length > MAX_RECEIPTS) return false;
  const keys = new Set();
  const watermarks = new Set();
  for (const entry of value.invocationIndex) {
    if (!strictObject(entry, ["runner", "installationBindingSha256", "accountBindingSha256", "sessionId", "invocationId", "receiptSha256"])
      || !ROUTERS.has(entry.runner) || !SHA.test(entry.installationBindingSha256 ?? "")
      || !SHA.test(entry.accountBindingSha256 ?? "") || !ID.test(entry.sessionId ?? "")
      || !ID.test(entry.invocationId ?? "") || !SHA.test(entry.receiptSha256 ?? "")) return false;
    const key = invocationTuple(entry);
    if (keys.has(key)) return false;
    keys.add(key);
  }
  for (const pin of value.pinStates) {
    if (!strictObject(pin, ["scopeSha256", "decisionSha256", "revision", "state", "runner", "familyId", "role", "effort", "taskRoutes", "modelId"])
      || !SHA.test(pin.scopeSha256 ?? "") || !SHA.test(pin.decisionSha256 ?? "")
      || !Number.isSafeInteger(pin.revision) || pin.revision < 1 || !["pinned", "unpinned"].includes(pin.state)
      || !ROUTERS.has(pin.runner) || !/^[a-z][a-z0-9-]{0,31}$/u.test(pin.familyId ?? "")
      || !["frontier", "worker", "efficient"].includes(pin.role)
      || !["low", "medium", "high", "xhigh", "max", "not-applicable"].includes(pin.effort)
      || !Array.isArray(pin.taskRoutes) || pin.taskRoutes.length < 1 || pin.taskRoutes.length > 256
      || new Set(pin.taskRoutes).size !== pin.taskRoutes.length
      || pin.taskRoutes.some((r) => typeof r !== "string" || !/^(?:profile|duty)\.[A-Za-z0-9_.-]{1,120}$/u.test(r))
      || !(pin.modelId === null || (typeof pin.modelId === "string" && pin.modelId.length <= 128))) return false;
  }
  for (const mark of value.watermarks) {
    if (!strictObject(mark, ["runner", "installationBindingSha256", "accountBindingSha256", "familyId",
      "version", "admittedReceiptSha256"]) || !ROUTERS.has(mark.runner)
      || !SHA.test(mark.installationBindingSha256 ?? "") || !SHA.test(mark.accountBindingSha256 ?? "")
      || !/^[a-z][a-z0-9-]{0,31}$/u.test(mark.familyId ?? "")
      || !Array.isArray(mark.version) || mark.version.length < 1 || mark.version.length > 8
      || mark.version.some((n) => !Number.isSafeInteger(n) || n < 0) || !SHA.test(mark.admittedReceiptSha256 ?? "")) return false;
    const key = JSON.stringify([mark.runner, mark.installationBindingSha256, mark.accountBindingSha256, mark.familyId]);
    if (watermarks.has(key)) return false;
    watermarks.add(key);
  }
  return true;
}

function receiptDigest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { receiptSha256, ...preimage } = value;
  return SHA.test(receiptSha256 ?? "") && digest(preimage) === receiptSha256 ? receiptSha256 : null;
}

function validInvocationReceipt(value) {
  const fields = ["schema", "kind", "runner", "sessionId", "invocationId", "candidateCommit", "candidateTree",
    "taskRoute", "role", "effort", "familyId", "releaseId", "version", "selectedModelId", "canonicalModelId",
    "groupingEvidenceSha256", "variantSelectionEvidenceSha256", "selection", "authoritySha256", "pinDecisionSha256",
    "adapterContractSha256", "discoverySha256", "compatibilityEvidenceSha256", "observedAt", "expiresAt",
    "storeGeneration", "watermarkBefore", "watermarkAfter", "packetBindingSha256", "receiptSha256"];
  return strictObject(value, fields) && value.schema === "pipeline.model-family-invocation.v2"
    && value.kind === "model-family-invocation" && ROUTERS.has(value.runner) && ID.test(value.sessionId ?? "")
    && ID.test(value.invocationId ?? "") && OID.test(value.candidateCommit ?? "") && OID.test(value.candidateTree ?? "")
    && typeof value.taskRoute === "string" && /^(?:profile|duty)\.[A-Za-z0-9_.-]{1,120}$/u.test(value.taskRoute)
    && ["frontier", "worker", "efficient"].includes(value.role)
    && ["low", "medium", "high", "xhigh", "max", "not-applicable"].includes(value.effort)
    && typeof value.familyId === "string" && /^[a-z][a-z0-9-]{0,31}$/u.test(value.familyId)
    && ID.test(value.releaseId ?? "") && Array.isArray(value.version) && value.version.length > 0
    && value.version.length <= 8 && value.version.every((n) => Number.isSafeInteger(n) && n >= 0)
    && typeof value.selectedModelId === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value.selectedModelId)
    && (value.canonicalModelId === null || (typeof value.canonicalModelId === "string" && value.canonicalModelId.length <= 128))
    && SHA.test(value.groupingEvidenceSha256 ?? "") && SHA.test(value.variantSelectionEvidenceSha256 ?? "")
    && ["latest", "explicit-po-pin"].includes(value.selection) && SHA.test(value.authoritySha256 ?? "")
    && (value.pinDecisionSha256 === null || SHA.test(value.pinDecisionSha256 ?? ""))
    && [value.adapterContractSha256, value.discoverySha256, value.compatibilityEvidenceSha256].every((s) => SHA.test(s ?? ""))
    && validTime(value.observedAt) && validTime(value.expiresAt) && Number.isSafeInteger(value.storeGeneration)
    && value.storeGeneration > 0 && (value.watermarkBefore === null || (Array.isArray(value.watermarkBefore)
      && value.watermarkBefore.length > 0 && value.watermarkBefore.length <= 8
      && value.watermarkBefore.every((n) => Number.isSafeInteger(n) && n >= 0)))
    && Array.isArray(value.watermarkAfter) && value.watermarkAfter.length > 0 && value.watermarkAfter.length <= 8
    && value.watermarkAfter.every((n) => Number.isSafeInteger(n) && n >= 0)
    && SHA.test(value.packetBindingSha256 ?? "") && SHA.test(value.receiptSha256 ?? "");
}

function sealState({ generation, authoritySha256,
  sourceProjectionSha256, watermarks, receiptIndex, pinStates = [] }) {
  void sourceProjectionSha256;
  const value = { schema: "pipeline.model-family-host-state.v1", generation,
    activation: "family-active", authoritySha256, pinStates, watermarks, invocationIndex: receiptIndex };
  return value;
}

function isFresh(selection, nowMs) {
  const observed = Date.parse(selection.observedAt);
  const expires = Date.parse(selection.expiresAt);
  return Number.isFinite(observed) && Number.isFinite(expires) && observed <= nowMs
    && expires > nowMs && expires - observed <= FRESH_MS && nowMs - observed < FRESH_MS;
}

function mapPin(verifiedPin, assignment) {
  if (!verifiedPin || verifiedPin.state !== "pinned") return null;
  const s = verifiedPin.decision.subject;
  if (s.runner !== assignment.runner || s.familyId !== assignment.familyId || s.role !== assignment.role
    || s.effort !== assignment.effort || !s.taskRoutes.includes(assignment.taskRoute)) return null;
  return { decisionSha256: verifiedPin.decisionSha256, authoritySha256: verifiedPin.authoritySha256,
    runner: s.runner, familyId: s.familyId, taskRoutes: s.taskRoutes, role: s.role, effort: s.effort,
    modelId: s.modelId, revision: s.revision };
}

function createFilesystemStore(rootDir) {
  const root = resolve(rootDir ?? "");
  if (!root.startsWith(sep) || root === sep) throw new TypeError("absolute fixture store root required");
  const directory = join(root, "model-family-host");
  const receiptDir = join(directory, RECEIPTS);
  const markerPath = join(directory, MARKER);
  const statePath = join(directory, STATE);
  const lockPath = join(directory, LOCK);

  function prepare(create = false) {
    ensureDir(root, false);
    ensureDir(directory, create);
    ensureDir(receiptDir, create);
    return { directory, receiptDir, markerPath, statePath, lockPath };
  }

  function readMarker() {
    try {
      prepare(false);
      const marker = parseStrictJson(safeRead(markerPath, 16 * 1024));
      if (!strictObject(marker, ["schema", "activationId", "authoritySha256", "createdAt"])
        || marker.schema !== "pipeline.model-family-host-activation.v1" || !SHA.test(marker.activationId ?? "")
        || !SHA.test(marker.authoritySha256 ?? "") || typeof marker.createdAt !== "string") throw new Error("MARKER_SHAPE");
      return { ok: true, marker };
    } catch (error) {
      if (error?.code === "ENOENT") return { ok: true, marker: null };
      return fail("MODEL-FAMILY-ACTIVATION-UNCERTAIN");
    }
  }

  function readState() {
    const marker = readMarker();
    if (!marker.ok) return marker;
    if (!marker.marker) return fail("MODEL-FAMILY-INACTIVE");
    try {
      const pointer = parseStrictJson(safeRead(statePath, 16 * 1024));
      if (!strictObject(pointer, ["schema", "generation", "stateFile", "stateSha256"])
        || pointer.schema !== "pipeline.model-family-host-state-pointer.v1"
        || !Number.isSafeInteger(pointer.generation) || pointer.generation < 0
        || !SHA.test(pointer.stateSha256 ?? "")
        || pointer.stateFile !== `generation-${pointer.generation}-${pointer.stateSha256}.json`) return fail("MODEL-FAMILY-STATE-UNCERTAIN");
      const state = parseStrictJson(safeRead(join(directory, pointer.stateFile)));
      if (!validateState(state) || state.authoritySha256 !== marker.marker.authoritySha256
        || state.generation !== pointer.generation || digest(state) !== pointer.stateSha256) {
        return fail("MODEL-FAMILY-STATE-UNCERTAIN");
      }
      const receipts = [];
      const invocationEntries = [];
      for (const entry of state.invocationIndex) {
        const key = { runner: entry.runner, installationBindingSha256: entry.installationBindingSha256,
          accountBindingSha256: entry.accountBindingSha256, sessionId: entry.sessionId, invocationId: entry.invocationId };
        const value = parseStrictJson(safeRead(join(receiptDir, `${digest(key)}.json`)));
        if (!validInvocationReceipt(value) || value.receiptSha256 !== entry.receiptSha256
          || receiptDigest(value) !== entry.receiptSha256 || value.runner !== key.runner
          || value.sessionId !== key.sessionId || value.invocationId !== key.invocationId) {
          return fail("MODEL-FAMILY-RECEIPT-UNCERTAIN");
        }
        receipts.push(value);
        invocationEntries.push({ key, receipt: value });
      }
      return { ok: true, code: "MODEL-FAMILY-STATE-READ", state, receipts, invocationEntries,
        activation: marker.marker };
    } catch { return fail("MODEL-FAMILY-STATE-UNCERTAIN"); }
  }

  function lock() {
    prepare(true);
    const fd = openSync(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
      | (constants.O_NOFOLLOW ?? 0), 0o600);
    fsyncSync(fd);
    closeSync(fd);
    syncDirectory(directory);
    return () => { unlinkSync(lockPath); syncDirectory(directory); };
  }

  function activate(authority) {
    if (!authority || typeof authority.authoritySha256 !== "string" || !SHA.test(authority.authoritySha256)
      || !strictObject(authority.authority?.candidateAtApproval, ["commit", "tree"])) return fail("MODEL-FAMILY-ACTIVATION-INVALID");
    try {
      prepare(true);
      const marker = { schema: "pipeline.model-family-host-activation.v1",
        activationId: createHash("sha256").update(randomBytes(32)).digest("hex"),
        authoritySha256: authority.authoritySha256, createdAt: new Date().toISOString() };
      try { writeNew(markerPath, marker, 16 * 1024); }
      catch (error) {
        if (error?.code !== "EEXIST") throw error;
        const prior = readMarker();
        if (!prior.ok || prior.marker?.authoritySha256 !== authority.authoritySha256) return fail("MODEL-FAMILY-ACTIVATION-CONFLICT");
      }
      const state = sealState({ generation: 0, authoritySha256: authority.authoritySha256,
        candidateAtApproval: authority.authority.candidateAtApproval,
        sourceProjectionSha256: digest(authority.assignments), watermarks: [], receiptIndex: [] });
      const stateSha256 = digest(state);
      const stateFile = `generation-0-${stateSha256}.json`;
      try { writeNew(join(directory, stateFile), state); }
      catch (error) {
        if (error?.code !== "EEXIST") throw error;
      }
      try { writeNew(statePath, { schema: "pipeline.model-family-host-state-pointer.v1", generation: 0, stateFile, stateSha256 }, 16 * 1024); }
      catch (error) {
        if (error?.code !== "EEXIST") throw error;
        const current = readState();
        if (!current.ok || current.state.authoritySha256 !== authority.authoritySha256) return fail("MODEL-FAMILY-STATE-UNCERTAIN");
      }
      return readState();
    } catch { return fail("MODEL-FAMILY-ACTIVATION-UNAVAILABLE"); }
  }

  function transitionAuthority({ expectedGeneration, expectedAuthoritySha256, successorAuthority, recheck } = {}) {
    if (!Number.isSafeInteger(expectedGeneration) || !SHA.test(expectedAuthoritySha256 ?? "")
      || !successorAuthority?.authority || !SHA.test(successorAuthority.authoritySha256 ?? "")
      || successorAuthority.authoritySha256 === expectedAuthoritySha256 || typeof recheck !== "function") {
      return fail("MODEL-FAMILY-SUCCESSOR-INPUT");
    }
    let release;
    try {
      release = lock();
      const current = readState();
      if (!current.ok) return current;
      if (current.state.generation !== expectedGeneration
        || current.state.authoritySha256 !== expectedAuthoritySha256) return fail("CONCURRENT_RESELECTION_REQUIRED", true);
      const marker = readMarker();
      if (!marker.ok || marker.marker?.authoritySha256 !== expectedAuthoritySha256) {
        return fail("MODEL-FAMILY-AUTHORITY-SOURCE-SUPERSEDED");
      }
      const checked = recheck(current.state);
      if (!checked?.ok || checked.predecessor?.authoritySha256 !== expectedAuthoritySha256
        || checked.successor?.authoritySha256 !== successorAuthority.authoritySha256
        || checked.successor?.authority?.subject?.predecessorAuthoritySha256 !== expectedAuthoritySha256) {
        return checked?.ok ? fail("MODEL-FAMILY-SUCCESSOR-SOURCE-RACED", true) : checked;
      }
      const next = sealState({ generation: current.state.generation + 1,
        authoritySha256: successorAuthority.authoritySha256,
        sourceProjectionSha256: digest(successorAuthority.assignments), watermarks: current.state.watermarks,
        receiptIndex: current.state.invocationIndex, pinStates: [] });
      const stateSha256 = digest(next);
      const stateFile = `generation-${next.generation}-${stateSha256}.json`;
      writeNew(join(directory, stateFile), next);
      replaceAtomic(statePath, { schema: "pipeline.model-family-host-state-pointer.v1",
        generation: next.generation, stateFile, stateSha256 });
      replaceAtomic(markerPath, { ...marker.marker, authoritySha256: successorAuthority.authoritySha256 });
      const readback = readState();
      if (!readback.ok || readback.state.generation !== next.generation
        || readback.state.authoritySha256 !== successorAuthority.authoritySha256
        || readback.receipts.length !== current.receipts.length
        || readback.state.watermarks.length !== current.state.watermarks.length) return fail("MODEL-FAMILY-SUCCESSOR-READBACK");
      return { ok: true, code: "MODEL-FAMILY-AUTHORITY-SUPERSEDED", state: readback.state,
        predecessorAuthoritySha256: expectedAuthoritySha256,
        authoritySha256: successorAuthority.authoritySha256 };
    } catch (error) {
      if (error?.code === "EEXIST") return fail("CONCURRENT_RESELECTION_REQUIRED", true);
      const observed = readState();
      return observed.ok ? fail("MODEL-FAMILY-SUCCESSOR-UNAVAILABLE")
        : fail("MODEL-FAMILY-STATE-UNCERTAIN");
    } finally { try { release?.(); } catch {} }
  }

  function commit({ expectedGeneration, authority, assignment, key, proposal, now, recheck } = {}) {
    if (!Number.isSafeInteger(expectedGeneration) || !validKey(key) || !validAssignment(assignment, authority)
      || !proposal || proposal.authorityCeiling !== "pure-selection-proposal" || !validTime(now)) {
      return fail("MODEL-FAMILY-COMMIT-INPUT");
    }
    let release;
    try {
      release = lock();
      const current = readState();
      if (!current.ok) return current;
      if (current.state.generation !== expectedGeneration) return fail("CONCURRENT_RESELECTION_REQUIRED", true);
      if (current.state.authoritySha256 !== authority.authoritySha256) return fail("MODEL-FAMILY-AUTHORITY-SUPERSEDED");
      if (current.state.invocationIndex.some((r) => invocationTuple(r) === invocationTuple(key))) {
        const existing = current.invocationEntries.find((r) => invocationTuple(r.key) === invocationTuple(key))?.receipt;
        return existing ? { ok: true, code: "MODEL-FAMILY-REPLAY", receipt: existing, state: current.state }
          : fail("MODEL-FAMILY-RECEIPT-UNCERTAIN");
      }
      if (current.state.invocationIndex.length >= MAX_RECEIPTS) return fail("MODEL-FAMILY-RECEIPT-LIMIT");
      let commitAuthority = authority;
      let commitProposal = proposal;
      let commitNow = now;
      if (typeof recheck !== "function") return fail("MODEL-FAMILY-COMMIT-RECHECK-REQUIRED");
      const checked = recheck(current.state);
      if (!checked?.ok || checked.authority?.authoritySha256 !== authority.authoritySha256
        || checked.proposal?.authorityCeiling !== "pure-selection-proposal" || !validTime(checked.now)) {
        return checked?.ok ? fail("MODEL-FAMILY-AUTHORITY-SUPERSEDED") : checked;
      }
      commitAuthority = checked.authority;
      commitProposal = checked.proposal;
      commitNow = checked.now;
      const watermarkKey = JSON.stringify([key.runner, key.installationBindingSha256,
        key.accountBindingSha256, assignment.familyId]);
      const oldMark = current.state.watermarks.find((m) => JSON.stringify([m.runner,
        m.installationBindingSha256, m.accountBindingSha256, m.familyId]) === watermarkKey);
      const watermarkAfter = commitProposal.watermarkAfter;
      if (!Array.isArray(watermarkAfter) || watermarkAfter.length < 1 || watermarkAfter.length > 8
        || watermarkAfter.some((x) => !Number.isSafeInteger(x) || x < 0)) return fail("MODEL-FAMILY-WATERMARK-INVALID");
      const packetFields = { runner: key.runner, sessionId: key.sessionId, invocationId: key.invocationId,
        candidateCommit: checked.candidate.candidateCommit,
        candidateTree: checked.candidate.candidateTree, taskRoute: assignment.taskRoute,
        role: assignment.role, effort: assignment.effort, selectedModelId: commitProposal.selectedModelId,
        authoritySha256: commitAuthority.authoritySha256, observedAt: commitProposal.observedAt };
      const receiptBase = { schema: "pipeline.model-family-invocation.v2", kind: "model-family-invocation",
        runner: key.runner, sessionId: key.sessionId, invocationId: key.invocationId,
        candidateCommit: checked.candidate.candidateCommit,
        candidateTree: checked.candidate.candidateTree,
        taskRoute: assignment.taskRoute, role: assignment.role, effort: assignment.effort,
        familyId: assignment.familyId, releaseId: commitProposal.releaseId,
        version: commitProposal.version, selectedModelId: commitProposal.selectedModelId,
        canonicalModelId: commitProposal.canonicalModelId,
        groupingEvidenceSha256: commitProposal.groupingEvidenceSha256,
        variantSelectionEvidenceSha256: commitProposal.variantSelectionEvidenceSha256,
        selection: commitProposal.selection, authoritySha256: commitAuthority.authoritySha256,
        pinDecisionSha256: commitProposal.pinDecisionSha256,
        adapterContractSha256: commitProposal.adapterContractSha256,
        discoverySha256: commitProposal.discoverySha256,
        compatibilityEvidenceSha256: commitProposal.compatibilityEvidenceSha256,
        observedAt: commitProposal.observedAt, expiresAt: commitProposal.expiresAt,
        storeGeneration: current.state.generation + 1, watermarkBefore: oldMark?.version ?? null,
        watermarkAfter, packetBindingSha256: digest({ ...packetFields,
          installationBindingSha256: key.installationBindingSha256,
          accountBindingSha256: key.accountBindingSha256 }) };
      const receipt = { ...receiptBase, receiptSha256: digest(receiptBase) };
      if (!validInvocationReceipt(receipt)) return fail("MODEL-FAMILY-RECEIPT-SHAPE");
      const filename = `${digest(key)}.json`;
      const receiptPath = join(receiptDir, filename);
      try { writeNew(receiptPath, receipt); }
      catch (error) {
        if (error?.code === "EEXIST") {
          const prior = parseStrictJson(safeRead(receiptPath));
          if (receiptDigest(prior) !== receipt.receiptSha256 || prior.runner !== key.runner
            || prior.sessionId !== key.sessionId || prior.invocationId !== key.invocationId) {
            return fail("MODEL-FAMILY-RECEIPT-COLLISION");
          }
        } else throw error;
      }
      const entry = { ...key, receiptSha256: receipt.receiptSha256 };
      const receiptIndex = [...current.state.invocationIndex, entry];
      const watermarks = current.state.watermarks.filter((m) => JSON.stringify([m.runner,
        m.installationBindingSha256, m.accountBindingSha256, m.familyId]) !== watermarkKey);
      if (!oldMark || compareVersion(watermarkAfter, oldMark.version) > 0) {
        watermarks.push({ runner: key.runner, installationBindingSha256: key.installationBindingSha256,
          accountBindingSha256: key.accountBindingSha256, familyId: assignment.familyId,
          version: watermarkAfter, admittedReceiptSha256: receipt.receiptSha256 });
      } else watermarks.push(oldMark);
      watermarks.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      const pinScope = checked.pinState ?? null;
      const pinStates = current.state.pinStates.filter((p) => p.scopeSha256 !== pinScope?.scopeSha256);
      if (pinScope) pinStates.push(pinScope);
      pinStates.sort((a, b) => a.scopeSha256.localeCompare(b.scopeSha256));
      const next = sealState({ generation: current.state.generation + 1,
        authoritySha256: commitAuthority.authoritySha256, watermarks, receiptIndex, pinStates });
      const stateSha256 = digest(next);
      const stateFile = `generation-${next.generation}-${stateSha256}.json`;
      writeNew(join(directory, stateFile), next);
      replaceAtomic(statePath, { schema: "pipeline.model-family-host-state-pointer.v1",
        generation: next.generation, stateFile, stateSha256 });
      const readback = readState();
      if (!readback.ok || readback.state.generation !== next.generation
        || readback.receipts.at(-1)?.receiptSha256 !== receipt.receiptSha256) return fail("MODEL-FAMILY-STATE-READBACK");
      return { ok: true, code: "MODEL-FAMILY-RECEIPT-APPENDED", receipt, state: readback.state };
    } catch (error) {
      return error?.code === "EEXIST" ? fail("CONCURRENT_RESELECTION_REQUIRED", true)
        : fail("MODEL-FAMILY-STORE-UNAVAILABLE");
    } finally { try { release?.(); } catch {} }
  }

  return Object.freeze({ activate, transitionAuthority, readState, commit });
}

function compareVersion(left, right) {
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const a = left[i] ?? 0; const b = right[i] ?? 0;
    if (a !== b) return a < b ? -1 : 1;
  }
  return 0;
}

function validTime(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function verifiedAuthority(inputs) {
  if (!strictObject(inputs, ["bundle", "routeSource", "trustAnchors", "predecessor"])
    || !Array.isArray(inputs.trustAnchors) || inputs.trustAnchors.length === 0) return fail("MODEL-FAMILY-AUTHORITY-SOURCE");
  const result = verifyModelFamilyAuthority({ bundle: inputs.bundle, routeSource: inputs.routeSource,
    trustAnchors: inputs.trustAnchors, predecessor: inputs.predecessor });
  return result.ok ? { value: result.value, trustAnchors: inputs.trustAnchors } : fail(result.code);
}

function verifyPins(pinInputs, authority, trustAnchors, assignment) {
  if (!Array.isArray(pinInputs) || pinInputs.length > 256) return fail("MODEL-FAMILY-PIN-SOURCE");
  const chains = new Map();
  for (const decision of pinInputs) {
    const s = decision?.subject;
    if (!s || !ROUTERS.has(s.runner) || !Array.isArray(s.taskRoutes)) return fail("MODEL-FAMILY-PIN-SOURCE");
    const scope = JSON.stringify([s.runner, s.familyId, s.role, s.effort, [...s.taskRoutes].sort()]);
    const previousDecision = chains.get(scope) ?? null;
    const result = verifyModelFamilyPinDecision({ decision, authority, previousDecision, trustAnchors });
    if (!result.ok) return fail(result.code);
    chains.set(scope, result.value);
  }
  const matches = [...chains.values()].filter((pin) => {
    const s = pin.decision.subject;
    return s.runner === assignment.runner && s.familyId === assignment.familyId && s.role === assignment.role
      && s.effort === assignment.effort && s.taskRoutes.includes(assignment.taskRoute);
  });
  if (matches.length > 1) return fail("MODEL-FAMILY-PIN-AMBIGUOUS");
  return { ok: true, pin: matches[0] ?? null };
}

function pinStateRecord(pin, authoritySha256) {
  if (!pin) return null;
  const s = pin.decision.subject;
  return { scopeSha256: digest({ authoritySha256, runner: s.runner, familyId: s.familyId,
    role: s.role, effort: s.effort, taskRoutes: [...s.taskRoutes].sort() }),
    decisionSha256: pin.decisionSha256, revision: s.revision, state: pin.state,
    runner: s.runner, familyId: s.familyId, role: s.role, effort: s.effort,
    taskRoutes: [...s.taskRoutes].sort(), modelId: s.decision === "pin" ? s.modelId : null };
}

/**
 * `trustedSources` is wired only by a future host integration. Its callbacks
 * must read current local policy/proofs and provide an S2 discovery host plus
 * its opaque discovery handle on every call. Selection context is a separate
 * trusted-code port output; caller JSON is never promoted to discovery. The
 * readCurrentCandidate port independently reads the candidate currently being
 * prepared, never a dispatch claim or the older proof's approval candidate.
 * optional readSuccessorAuthorityInputs({predecessorAuthoritySha256}) port
 * returns only {bundle,routeSource,trustAnchors}; this controller supplies the
 * branded predecessor to S1 and repeats the read and verification under lock.
 */
export function createModelFamilyHostController({ rootDir, trustedSources, clock = () => Date.now() } = {}) {
  const required = ["readAuthorityInputs", "readPinInputs", "readFreshDiscovery", "readCurrentCandidate", "launchDriver"];
  if (typeof rootDir !== "string" || !rootDir.startsWith("/") || !trustedSources
    || required.some((name) => typeof trustedSources[name] !== "function") || typeof clock !== "function") {
    throw new TypeError("trusted family host source boundary is incomplete");
  }
  const store = createFilesystemStore(rootDir);
  const nativeAdmissions = new Map();
  const nativeCapabilities = new WeakMap();

  function loadAuthority() {
    let input;
    try { input = trustedSources.readAuthorityInputs(); } catch { return fail("MODEL-FAMILY-AUTHORITY-SOURCE"); }
    return verifiedAuthority(input);
  }

  function loadSuccessorAuthority(predecessor) {
    let input;
    try { input = trustedSources.readSuccessorAuthorityInputs({
      predecessorAuthoritySha256: predecessor.authoritySha256 }); }
    catch { return fail("MODEL-FAMILY-SUCCESSOR-SOURCE"); }
    if (!strictObject(input, ["bundle", "routeSource", "trustAnchors"]) || !Array.isArray(input.trustAnchors)
      || input.trustAnchors.length === 0) return fail("MODEL-FAMILY-SUCCESSOR-SOURCE");
    const verified = verifyModelFamilyAuthority({ ...input, predecessor });
    return verified.ok ? { value: verified.value, trustAnchors: input.trustAnchors } : fail(verified.code);
  }

  function loadPin(authority, trustAnchors, assignment) {
    let raw;
    try { raw = trustedSources.readPinInputs(authority.authoritySha256, structuredClone(assignment)); }
    catch { return fail("MODEL-FAMILY-PIN-SOURCE"); }
    return verifyPins(raw, authority, trustAnchors, assignment);
  }

  function loadCurrentCandidate(key, assignment) {
    let candidate;
    try { candidate = trustedSources.readCurrentCandidate({ key: structuredClone(key), assignment: structuredClone(assignment) }); }
    catch { return fail("MODEL-FAMILY-CANDIDATE-SOURCE"); }
    if (!strictObject(candidate, ["candidateCommit", "candidateTree"])
      || !OID.test(candidate.candidateCommit ?? "") || !OID.test(candidate.candidateTree ?? "")
      || candidate.candidateCommit === candidate.candidateTree) return fail("MODEL-FAMILY-CANDIDATE-SHAPE");
    return { ok: true, value: Object.freeze({ candidateCommit: candidate.candidateCommit, candidateTree: candidate.candidateTree }) };
  }

  function loadPreparation(authority, assignment, key) {
    let prepared;
    try { prepared = trustedSources.readFreshDiscovery({ authoritySha256: authority.authoritySha256,
      assignment: structuredClone(assignment), key: structuredClone(key) }); }
    catch { return fail("MODEL-FAMILY-PREPARATION-SOURCE"); }
    if (!strictObject(prepared, ["discoveryHost", "discoveryHandle", "context"])
      || !prepared.discoveryHost || typeof prepared.discoveryHost.readDiscovery !== "function") {
      return fail("MODEL-FAMILY-PREPARATION-SOURCE");
    }
    let read;
    try { read = prepared.discoveryHost.readDiscovery(prepared.discoveryHandle); }
    catch { return fail("MODEL-FAMILY-PREPARATION-SOURCE"); }
    if (!strictObject(read, ["ok", "code", "value"]) || read.ok !== true
      || !deeplyFrozen(read.value) || read.value?.schema !== "pipeline.model-family-discovery.v1") {
      return fail("MODEL-FAMILY-DISCOVERY-HANDLE-REQUIRED");
    }
    const discovery = read.value;
    if (discovery.runner !== key.runner || discovery.installationBindingSha256 !== key.installationBindingSha256
      || discovery.accountBindingSha256 !== key.accountBindingSha256 || !validTime(discovery.observedAt)) {
      return fail("MODEL-FAMILY-DISCOVERY-CONTEXT-MISMATCH");
    }
    return { ok: true, value: { discovery, context: prepared.context, observedAt: discovery.observedAt } };
  }

  function prepareOnce({ key, assignment } = {}) {
    if (!validKey(key)) return fail("MODEL-FAMILY-INVOCATION-KEY");
    const heldState = store.readState();
    if (!heldState.ok) return heldState;
    const indexed = heldState.invocationEntries.find((item) => invocationTuple(item.key) === invocationTuple(key));
    if (indexed) {
      const held = indexed.receipt;
      const handle = frozenClone({ key: indexed.key, assignment: { runner: held.runner, taskRoute: held.taskRoute,
        role: held.role, effort: held.effort, familyId: held.familyId }, receipt: held,
        activation: heldState.activation, issuedAt: held.createdAt });
      frozenHandles.add(handle);
      return { ok: true, code: "MODEL-FAMILY-REPLAY", value: handle };
    }
    const loaded = loadAuthority();
    if (!loaded?.value?.authoritySha256) return loaded;
    const authority = loaded.value;
    if (!validAssignment(assignment, authority)) return fail("MODEL-FAMILY-ASSIGNMENT");
    const stateResult = heldState;
    const state = stateResult.state;
    if (state.authoritySha256 !== authority.authoritySha256) return fail("MODEL-FAMILY-AUTHORITY-SUPERSEDED");
    const candidate = loadCurrentCandidate(key, assignment);
    if (!candidate.ok) return candidate;
    const pin = loadPin(authority, loaded.trustAnchors, assignment);
    if (!pin.ok) return pin;
    const prep = loadPreparation(authority, assignment, key);
    if (!prep.ok) return prep;
    const mark = state.watermarks.find((w) => w.runner === key.runner
      && w.installationBindingSha256 === key.installationBindingSha256
      && w.accountBindingSha256 === key.accountBindingSha256 && w.familyId === assignment.familyId) ?? null;
    const pinSelection = mapPin(pin.pin, assignment);
    if (pin.pin?.state === "pinned" && !pinSelection) return fail("MODEL-FAMILY-PIN-SCOPE");
    const normalizedAssignment = resolverAssignment(authority, assignment);
    if (!normalizedAssignment) return fail("MODEL-FAMILY-ASSIGNMENT");
    const evaluated = evaluateModelFamilySelection({ assignment: normalizedAssignment,
      discovery: prep.value.discovery, watermark: mark ? { runner: key.runner,
        installationBindingSha256: key.installationBindingSha256, accountBindingSha256: key.accountBindingSha256,
        familyId: assignment.familyId, version: mark.version, admittedReceiptSha256: mark.admittedReceiptSha256 } : null,
      pinSelection, context: prep.value.context, now: new Date(clock()).toISOString() });
    if (!evaluated.ok) return fail(evaluated.code, evaluated.retryable);
    if (!isFresh(evaluated.value, clock())) return fail("MODEL-FAMILY-PREPARATION-STALE", true);
    const pinnedSha = pin.pin?.decisionSha256 ?? null;
    const recheck = () => {
      const latestAuthority = loadAuthority();
      if (!latestAuthority?.value?.authoritySha256) return latestAuthority;
      if (latestAuthority.value.authoritySha256 !== authority.authoritySha256) return fail("MODEL-FAMILY-AUTHORITY-SUPERSEDED");
      const latestState = store.readState();
      if (!latestState.ok) return latestState;
      if (latestState.state.generation !== state.generation) return fail("CONCURRENT_RESELECTION_REQUIRED", true);
      const latestPin = loadPin(latestAuthority.value, latestAuthority.trustAnchors, assignment);
      if (!latestPin.ok) return latestPin;
      if ((latestPin.pin?.decisionSha256 ?? null) !== pinnedSha) return fail("MODEL-FAMILY-PIN-SUPERSEDED", true);
      const latestPrep = loadPreparation(latestAuthority.value, assignment, key);
      if (!latestPrep.ok) return latestPrep;
      const latestMark = latestState.state.watermarks.find((w) => w.runner === key.runner
        && w.installationBindingSha256 === key.installationBindingSha256
        && w.accountBindingSha256 === key.accountBindingSha256 && w.familyId === assignment.familyId) ?? null;
      const latestPinSelection = mapPin(latestPin.pin, assignment);
      if (latestPin.pin?.state === "pinned" && !latestPinSelection) return fail("MODEL-FAMILY-PIN-SCOPE");
      const latestAssignment = resolverAssignment(latestAuthority.value, assignment);
      if (!latestAssignment) return fail("MODEL-FAMILY-ASSIGNMENT");
      const latestProposal = evaluateModelFamilySelection({ assignment: latestAssignment,
        discovery: latestPrep.value.discovery, watermark: latestMark ? { runner: key.runner,
          installationBindingSha256: key.installationBindingSha256, accountBindingSha256: key.accountBindingSha256,
          familyId: assignment.familyId, version: latestMark.version, admittedReceiptSha256: latestMark.admittedReceiptSha256 } : null,
        pinSelection: latestPinSelection, context: latestPrep.value.context, now: new Date(clock()).toISOString() });
      if (!latestProposal.ok) return fail(latestProposal.code, latestProposal.retryable);
      if (!isFresh(latestProposal.value, clock())) return fail("MODEL-FAMILY-PREPARATION-STALE", true);
      const latestCandidate = loadCurrentCandidate(key, assignment);
      if (!latestCandidate.ok) return latestCandidate;
      if (latestCandidate.value.candidateCommit !== candidate.value.candidateCommit
        || latestCandidate.value.candidateTree !== candidate.value.candidateTree) {
        return fail("MODEL-FAMILY-CANDIDATE-SUPERSEDED", true);
      }
      return { ok: true, authority: latestAuthority.value, proposal: latestProposal.value,
        candidate: latestCandidate.value,
        pinState: pinStateRecord(latestPin.pin, latestAuthority.value.authoritySha256),
        now: new Date(clock()).toISOString() };
    };
    const committed = store.commit({ expectedGeneration: state.generation, authority, assignment, key,
      proposal: evaluated.value, now: new Date(clock()).toISOString(), recheck });
    if (!committed.ok) return committed;
    const handle = frozenClone({ key, assignment: structuredClone(assignment), receipt: committed.receipt,
      activation: stateResult.activation, issuedAt: new Date(clock()).toISOString() });
    frozenHandles.add(handle);
    return { ok: true, code: committed.code, value: handle };
  }

  function prepare(input = {}) {
    if (!validKey(input.key)) return fail("MODEL-FAMILY-INVOCATION-KEY");
    const heldState = store.readState();
    if (!heldState.ok) return heldState;
    const indexed = heldState.invocationEntries.find((item) => invocationTuple(item.key) === invocationTuple(input.key));
    if (indexed) {
      const held = indexed.receipt;
      const handle = frozenClone({ key: indexed.key, assignment: { runner: held.runner, taskRoute: held.taskRoute,
        role: held.role, effort: held.effort, familyId: held.familyId }, receipt: held,
        activation: heldState.activation, issuedAt: held.createdAt });
      frozenHandles.add(handle);
      return { ok: true, code: "MODEL-FAMILY-REPLAY", value: handle };
    }
    let result;
    for (let reselection = 0; reselection <= RETRIES; reselection += 1) {
      result = prepareOnce(input);
      if (result?.code !== "CONCURRENT_RESELECTION_REQUIRED") return result;
      if (reselection < RETRIES) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5 * (reselection + 1));
    }
    return fail("CONCURRENT_RESELECTION_REQUIRED", true);
  }

  function transitionAuthority() {
    if (typeof trustedSources.readSuccessorAuthorityInputs !== "function") {
      return fail("MODEL-FAMILY-SUCCESSOR-SOURCE-UNAVAILABLE");
    }
    for (let retry = 0; retry <= RETRIES; retry += 1) {
      const state = store.readState();
      if (!state.ok) return state;
      const current = loadAuthority();
      if (!current?.value?.authoritySha256) return current;
      if (current.value.authoritySha256 !== state.state.authoritySha256) {
        return fail("MODEL-FAMILY-AUTHORITY-SOURCE-SUPERSEDED");
      }
      const successor = loadSuccessorAuthority(current.value);
      if (!successor?.value?.authoritySha256) return successor;
      if (successor.value.authoritySha256 === current.value.authoritySha256
        || successor.value.authority.subject.predecessorAuthoritySha256 !== current.value.authoritySha256) {
        return fail("MODEL-FAMILY-AUTHORITY-PREDECESSOR");
      }
      const recheck = () => {
        const latestCurrent = loadAuthority();
        if (!latestCurrent?.value?.authoritySha256) return latestCurrent;
        if (latestCurrent.value.authoritySha256 !== state.state.authoritySha256) {
          return fail("MODEL-FAMILY-AUTHORITY-SOURCE-SUPERSEDED");
        }
        const latestSuccessor = loadSuccessorAuthority(latestCurrent.value);
        if (!latestSuccessor?.value?.authoritySha256) return latestSuccessor;
        if (latestSuccessor.value.authoritySha256 !== successor.value.authoritySha256) {
          return fail("MODEL-FAMILY-SUCCESSOR-SOURCE-RACED", true);
        }
        return { ok: true, predecessor: latestCurrent.value, successor: latestSuccessor.value };
      };
      const committed = store.transitionAuthority({ expectedGeneration: state.state.generation,
        expectedAuthoritySha256: state.state.authoritySha256, successorAuthority: successor.value, recheck });
      if (committed.code === "CONCURRENT_RESELECTION_REQUIRED" && retry < RETRIES) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5 * (retry + 1));
        continue;
      }
      return committed;
    }
    return fail("CONCURRENT_RESELECTION_REQUIRED", true);
  }

  function prelaunch({ invocation, packetBindingSha256 } = {}) {
    if (!invocation || !frozenHandles.has(invocation) || !SHA.test(packetBindingSha256 ?? "")
      || packetBindingSha256 !== invocation.receipt.packetBindingSha256) return fail("MODEL-FAMILY-PRELAUNCH-BINDING");
    const now = clock();
    const receipt = invocation.receipt;
    if (!isFresh(receipt, now) || now >= Date.parse(receipt.expiresAt)) return fail("MODEL-FAMILY-PREPARATION-STALE", true);
    const candidate = loadCurrentCandidate(invocation.key, invocation.assignment);
    if (!candidate.ok) return candidate;
    if (candidate.value.candidateCommit !== receipt.candidateCommit || candidate.value.candidateTree !== receipt.candidateTree) {
      return fail("MODEL-FAMILY-CANDIDATE-SUPERSEDED", true);
    }
    const loaded = loadAuthority();
    if (!loaded?.value?.authoritySha256 || loaded.value.authoritySha256 !== receipt.authoritySha256) return fail("MODEL-FAMILY-AUTHORITY-SUPERSEDED");
    const authority = loaded.value;
    const state = store.readState();
    if (!state.ok || state.state.authoritySha256 !== receipt.authoritySha256
      || !state.state.invocationIndex.some((entry) => entry.receiptSha256 === receipt.receiptSha256
        && invocationTuple(entry) === invocationTuple(invocation.key))) return fail("MODEL-FAMILY-STATE-SUPERSEDED", true);
    const pin = loadPin(authority, loaded.trustAnchors, invocation.assignment);
    if (!pin.ok) return pin;
    const prep = loadPreparation(authority, invocation.assignment, invocation.key);
    if (!prep.ok) return prep;
    const mark = state.state.watermarks.find((m) => m.runner === invocation.key.runner
      && m.installationBindingSha256 === invocation.key.installationBindingSha256
      && m.accountBindingSha256 === invocation.key.accountBindingSha256
      && m.familyId === invocation.assignment.familyId) ?? null;
    const normalizedAssignment = resolverAssignment(authority, invocation.assignment);
    if (!normalizedAssignment) return fail("MODEL-FAMILY-ASSIGNMENT");
    const latest = evaluateModelFamilySelection({ assignment: normalizedAssignment, discovery: prep.value.discovery, watermark: mark ? {
      runner: invocation.key.runner, installationBindingSha256: invocation.key.installationBindingSha256,
      accountBindingSha256: invocation.key.accountBindingSha256, familyId: invocation.assignment.familyId,
      version: mark.version, admittedReceiptSha256: mark.admittedReceiptSha256,
    } : null, pinSelection: mapPin(pin.pin, invocation.assignment), context: prep.value.context,
    now: new Date(clock()).toISOString() });
    if (!latest.ok || latest.value.selectedModelId !== receipt.selectedModelId
      || latest.value.discoverySha256 !== receipt.discoverySha256
      || latest.value.pinDecisionSha256 !== receipt.pinDecisionSha256
      || latest.value.releaseId !== receipt.releaseId
      || compareVersion(latest.value.version, receipt.version) !== 0
      || !isFresh(latest.value, clock())) return fail("MODEL-FAMILY-PRELAUNCH-SUPERSEDED", true);
    const attempt = frozenClone({ schema: "pipeline.model-family-prelaunch-token.v1",
      receiptSha256: receipt.receiptSha256, packetBindingSha256, selectedModelId: receipt.selectedModelId,
      expiresAt: receipt.expiresAt });
    frozenHandles.add(attempt);
    return { ok: true, code: "MODEL-FAMILY-PRELAUNCH-READY", value: attempt };
  }

  async function admitNativeRequest({ invocation, request } = {}) {
    if (!invocation || !frozenHandles.has(invocation)) return fail("MODEL-FAMILY-PRELAUNCH-BINDING");
    if (typeof trustedSources.admitNativeRequest !== "function") return fail("MODEL-FAMILY-NATIVE-PORT-UNQUALIFIED");
    let snapshot;
    try { snapshot = snapshotNativeRequest(request); }
    catch { return fail("MODEL-FAMILY-NATIVE-REQUEST-INVALID"); }
    const receiptSha256 = invocation.receipt.receiptSha256;
    if (nativeAdmissions.has(receiptSha256)) return fail("MODEL-FAMILY-NATIVE-CAPABILITY-CONSUMED");
    const admission = { status: "pending" };
    nativeAdmissions.set(receiptSha256, admission);
    let admitted;
    try {
      admitted = await trustedSources.admitNativeRequest({ rootDir,
        invocation: frozenClone(invocation.receipt), key: frozenClone(invocation.key),
        assignment: frozenClone(invocation.assignment), request: snapshot });
    } catch { nativeAdmissions.delete(receiptSha256); return fail("MODEL-FAMILY-NATIVE-REQUEST-REFUSED"); }
    if (!admitted || admitted.ok !== true || Object.keys(admitted).some((key) => !["ok", "code"].includes(key))) {
      nativeAdmissions.delete(receiptSha256);
      return fail(admitted?.code === "MODEL-FAMILY-NATIVE-PORT-UNQUALIFIED"
        ? admitted.code : "MODEL-FAMILY-NATIVE-REQUEST-REFUSED");
    }
    const capability = Object.freeze(Object.create(null));
    admission.status = "issued";
    nativeCapabilities.set(capability, { invocation, request: snapshot, admission });
    return { ok: true, code: "MODEL-FAMILY-NATIVE-CAPABILITY", value: capability };
  }

  function launchResult(result) {
    if (!result || typeof result !== "object" || Array.isArray(result)) return fail("MODEL-FAMILY-LAUNCH-FAILED");
    const keys = Object.keys(result).sort();
    if (result.ok === true && keys.every((key) => ["ok", "code", "value"].includes(key))
      && (result.code === undefined || result.code === "MAIN_PRELAUNCH_OBSERVED")) {
      return { ok: true, code: result.code ?? "MODEL-FAMILY-LAUNCH-RETURNED", value: result.value ?? null };
    }
    const mainRefusals = ["MAIN_PRELAUNCH_UNQUALIFIED", "MAIN_PRELAUNCH_CONTEXT_REQUIRED",
      "MAIN_PRELAUNCH_REQUEST_REFUSED", "MAIN_PRELAUNCH_CONFIGURATION_REFUSED",
      "MAIN_PRELAUNCH_CONFIGURATION_MISMATCH", "MAIN_PRELAUNCH_LAUNCH_FAILED",
      "MAIN_PRELAUNCH_RECHECK_REFUSED", "MAIN_PRELAUNCH_IDENTITY_UNAVAILABLE",
      "MAIN_PRELAUNCH_IDENTITY_MISMATCH"];
    if (result.ok === false && ["MODEL-FAMILY-NATIVE-PORT-UNQUALIFIED", ...mainRefusals].includes(result.code)
      && keys.every((key) => key === "ok" || key === "code" || key === "retryable")
      && (result.retryable === undefined || typeof result.retryable === "boolean")) {
      return fail(result.code, result.retryable === true);
    }
    return fail("MODEL-FAMILY-LAUNCH-FAILED");
  }

  function launch({ invocation, packetBindingSha256, nativeRequestCapability } = {}) {
    const native = nativeRequestCapability === undefined ? null : nativeCapabilities.get(nativeRequestCapability);
    if (nativeRequestCapability !== undefined && (!native || native.invocation !== invocation
      || native.admission.status !== "issued")) return fail("MODEL-FAMILY-NATIVE-CAPABILITY-REQUIRED");
    const checked = prelaunch({ invocation, packetBindingSha256 });
    if (!checked.ok) return checked;
    const candidate = loadCurrentCandidate(invocation.key, invocation.assignment);
    if (!candidate.ok) return candidate;
    if (candidate.value.candidateCommit !== invocation.receipt.candidateCommit
      || candidate.value.candidateTree !== invocation.receipt.candidateTree) {
      return fail("MODEL-FAMILY-CANDIDATE-SUPERSEDED", true);
    }
    if (native) native.admission.status = "consumed";
    let driverContext;
    if (native) {
      driverContext = Object.freeze(Object.create(null));
      let revalidationState = "ready";
      const revalidate = () => {
        if (revalidationState !== "ready") return fail("MODEL-FAMILY-RECHECK-CONSUMED");
        revalidationState = "consumed";
        const latest = prelaunch({ invocation, packetBindingSha256 });
        if (!latest.ok) return latest;
        const current = loadCurrentCandidate(invocation.key, invocation.assignment);
        if (!current.ok) return current;
        if (current.value.candidateCommit !== invocation.receipt.candidateCommit
          || current.value.candidateTree !== invocation.receipt.candidateTree) {
          return fail("MODEL-FAMILY-CANDIDATE-SUPERSEDED", true);
        }
        return { ok: true, code: "MODEL-FAMILY-PRELAUNCH-REVALIDATED", value: latest.value };
      };
      driverContexts.set(driverContext, { rootDir, invocation, prelaunchToken: checked.value,
        nativeRequest: native.request, revalidate, consumed: false });
    }
    let result;
    try {
      result = trustedSources.launchDriver({ invocation: invocation.receipt,
        prelaunchToken: checked.value, ...(native ? { nativeRequest: native.request, driverContext } : {}) });
    } catch { return fail("MODEL-FAMILY-LAUNCH-FAILED"); }
    try {
      if (result !== null && (typeof result === "object" || typeof result === "function")
        && typeof result.then === "function") {
        return Promise.resolve(result).then(launchResult, () => fail("MODEL-FAMILY-LAUNCH-FAILED"))
          .catch(() => fail("MODEL-FAMILY-LAUNCH-FAILED"));
      }
      return launchResult(result);
    } catch { return fail("MODEL-FAMILY-LAUNCH-FAILED"); }
  }

  return Object.freeze({ activate() { const loaded = loadAuthority(); return loaded?.value?.authoritySha256
    ? store.activate(loaded.value) : loaded; }, transitionAuthority, prepare, prelaunch, admitNativeRequest,
    launch, readState: store.readState });
}

/** Offline held-receipt read: reads exactly one already-indexed invocation. */
export function readHeldModelFamilyInvocation({ rootDir, key } = {}) {
  if (!validKey(key)) return fail("MODEL-FAMILY-INVOCATION-KEY");
  try {
    const store = createFilesystemStore(rootDir);
    const state = store.readState();
    if (!state.ok) return state;
    const held = state.invocationEntries.find((entry) => invocationTuple(entry.key) === invocationTuple(key))?.receipt;
    return held ? { ok: true, code: "MODEL-FAMILY-HELD-RECEIPT", value: frozenClone(held) }
      : fail("MODEL-FAMILY-RECEIPT-UNAVAILABLE");
  } catch { return fail("MODEL-FAMILY-STORE-UNAVAILABLE"); }
}

/** Test-only fixture store seam is intentionally not exported. */
export const MODEL_FAMILY_HOST_STORE_LIMITS = Object.freeze({ freshMs: FRESH_MS, casRetries: RETRIES,
  maxBytes: MAX_BYTES, maxReceipts: MAX_RECEIPTS });
