#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";

import { createLocalWorkerPool } from "./local-worker-pool.mjs";
import {
  LOCAL_WORKER_SUPERVISOR_RECORD_SCHEMA,
  LOCAL_WORKER_SUPERVISOR_REQUEST_SCHEMA,
  LOCAL_WORKER_SUPERVISOR_RESULT_SCHEMA,
  LOCAL_WORKER_SUPERVISOR_CANCEL_SCHEMA,
  LOCAL_WORKER_SUPERVISOR_REQUEST_VALIDATION_CONTRACT,
  buildLocalWorkerLaunch,
  canonicalLocalWorkerSupervisorJson,
  inspectLocalWorkerSupervisor,
  localWorkerSupervisorFixturePath,
  localWorkerSupervisorPackageSha256,
  localWorkerSupervisorSha256,
  localWorkerSupervisorWorkerRequestSha256,
  readLocalWorkerProcessIdentity,
  validateLocalWorkerSupervisorRecord,
  validateLocalWorkerSupervisorRequest,
  validateLocalWorkerSupervisorResult,
  validateLocalWorkerSupervisorCancel,
} from "./local-worker-supervisor.mjs";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const D = "d".repeat(64);
const OID = "1".repeat(40);
const executable = realpathSync(process.execPath);
const executableSha256 = createHash("sha256").update(readFileSync(executable)).digest("hex");

function capacity() {
  return {
    configured: { concurrentTasks: 8, required: true },
    operator: { concurrentTasks: 8, required: true },
    certified: { concurrentTasks: 8, required: true },
    observed: { concurrentTasks: 8, required: true },
    pressure: { concurrentTasks: 8, required: false },
    reserved: { elephant: 1, verify: 1, critic: 1 },
    effective: { status: "available", concurrentTasks: 5, reasonCodes: [] },
  };
}

function pool(workerRequests) {
  const worker = (subject, leaseId, writePath, evidence) => ({
    subjectSha256: subject,
    workspaceLease: {
      leaseId,
      subjectSha256: subject,
      repository: A,
      baseCommit: OID,
      candidateCommit: OID,
      worktreePathSha256: evidence,
      writePaths: [writePath],
      ownerNonce: `owner-${leaseId}`,
      issuedMonotonicMs: 1,
      expiresMonotonicMs: 60_000,
      cleanupState: "active",
      evidenceSha256: C,
    },
    process: {
      identitySha256: evidence,
      separation: "observed",
      assuranceEvidenceSha256: C,
    },
    heartbeat: {
      intervalMs: 1_000,
      orphanAfterMs: 3_000,
      lastObservedMonotonicMs: 1,
      evidenceSha256: C,
    },
    state: "admitted",
    lastTransitionMonotonicMs: 1,
    stateEvidenceSha256: C,
  });
  return createLocalWorkerPool({
    poolId: "pool-b1i",
    candidate: { repositorySha256: A, baseCommit: OID, candidateCommit: OID },
    queueRevision: 7,
    capacity: capacity(),
    workers: [
      worker(A, "lease-a", "src/a.txt", B),
      worker(B, "lease-b", "src/b.txt", D),
    ],
    admissionSet: [
      { taskId: "task-a", subjectSha256: A, requestSha256: localWorkerSupervisorWorkerRequestSha256(workerRequests[0]), baseCommit: OID, candidateCommit: OID, writePaths: ["src/a.txt"], state: "admitted" },
      { taskId: "task-b", subjectSha256: B, requestSha256: localWorkerSupervisorWorkerRequestSha256(workerRequests[1]), baseCommit: OID, candidateCommit: OID, writePaths: ["src/b.txt"], state: "admitted" },
    ],
    cleanupOwner: { subjectSha256: A, ownerNonce: "owner-lease-a", evidenceSha256: C },
    serialFallback: false,
  });
}

function request(kind = "fixture") {
  const instructionA = "Edit only src/a.txt.";
  const instructionB = "Edit only src/b.txt.";
  const workers = [
    { taskId: "task-a", subjectSha256: A, leaseId: "lease-a", writePaths: ["src/a.txt"], instruction: instructionA, instructionSha256: localWorkerSupervisorSha256(instructionA), heartbeatIntervalMs: 1_000, orphanAfterMs: 3_000 },
    { taskId: "task-b", subjectSha256: B, leaseId: "lease-b", writePaths: ["src/b.txt"], instruction: instructionB, instructionSha256: localWorkerSupervisorSha256(instructionB), heartbeatIntervalMs: 1_000, orphanAfterMs: 3_000 },
  ];
  const dispatch = { dispatchId: "dispatch-b1i", attempt: 1, queueRevision: 7, packageSha256: null };
  dispatch.packageSha256 = localWorkerSupervisorPackageSha256({ ...dispatch, workers });
  return {
    schema: LOCAL_WORKER_SUPERVISOR_REQUEST_SCHEMA,
    repository: {
      fingerprint: A,
      sourceRoot: "/tmp/repository",
      sourceRootSha256: localWorkerSupervisorSha256("/tmp/repository"),
      baseCommit: OID,
      candidateCommit: OID,
      candidateSha256: localWorkerSupervisorSha256(OID),
    },
    dispatch,
    supervisor: {
      subject: "nova-b1i",
      ownerNonce: "supervisor-owner",
      heartbeatMs: 1_000,
      orphanAfterMs: 3_000,
      cleanupLeaseMs: 120_000,
      recoveryReserve: 1,
    },
    git: { executable, executableSha256 },
    pool: pool(workers),
    runner: kind === "fixture" ? {
      kind,
      executable,
      executableSha256,
      model: null,
      effort: null,
      timeoutMs: 5_000,
      maxOutputBytes: 65_536,
      fixture: { delayMs: 200, exitCode: 0, behavior: "first-authorized" },
    } : {
      kind,
      executable: "/tmp/codex",
      executableSha256,
      model: "gpt-5.6-luna",
      effort: "medium",
      timeoutMs: 60_000,
      maxOutputBytes: 65_536,
      fixture: null,
    },
    workers,
  };
}

function finalize(value, field) {
  const copy = structuredClone(value);
  delete copy[field];
  value[field] = localWorkerSupervisorSha256(copy);
  return value;
}

function resolveSchemaReference(reference, root, documents) {
  const [documentName, fragment = ""] = reference.split("#", 2);
  const document = documentName === "" ? root : documents[documentName];
  if (!document) return null;
  if (fragment === "") return { schema: document, root: document };
  if (!fragment.startsWith("/")) return null;
  const schema = fragment.slice(1).split("/").reduce(
    (value, key) => value?.[key.replaceAll("~1", "/").replaceAll("~0", "~")],
    document,
  );
  return schema ? { schema, root: document } : null;
}

function schemaAccepts(schema, value, root, documents) {
  if (schema?.$ref) {
    const resolved = resolveSchemaReference(schema.$ref, root, documents);
    return resolved !== null && schemaAccepts(resolved.schema, value, resolved.root, documents);
  }
  if (Array.isArray(schema?.allOf)
    && !schema.allOf.every((entry) => schemaAccepts(entry, value, root, documents))) return false;
  if (Array.isArray(schema?.anyOf)
    && !schema.anyOf.some((entry) => schemaAccepts(entry, value, root, documents))) return false;
  if (Array.isArray(schema?.oneOf)
    && schema.oneOf.filter((entry) => schemaAccepts(entry, value, root, documents)).length !== 1) return false;
  if (Object.hasOwn(schema ?? {}, "const") && value !== schema.const) return false;
  if (Array.isArray(schema?.enum) && !schema.enum.includes(value)) return false;

  const types = schema?.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  const matchesType = (type) => ({
    object: value !== null && typeof value === "object" && !Array.isArray(value),
    array: Array.isArray(value),
    string: typeof value === "string",
    integer: Number.isInteger(value),
    number: typeof value === "number",
    boolean: typeof value === "boolean",
    null: value === null,
  })[type] === true;
  if (types.length > 0 && !types.some(matchesType)) return false;

  if (typeof value === "string") {
    if (schema.pattern && !(new RegExp(schema.pattern, "u")).test(value)) return false;
    if (schema.minLength !== undefined && value.length < schema.minLength) return false;
    if (schema.maxLength !== undefined && value.length > schema.maxLength) return false;
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) return false;
    if (schema.maximum !== undefined && value > schema.maximum) return false;
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) return false;
    if (schema.maxItems !== undefined && value.length > schema.maxItems) return false;
    if (schema.uniqueItems === true
      && new Set(value.map((entry) => canonicalLocalWorkerSupervisorJson(entry))).size !== value.length) return false;
    return !schema.items || value.every((entry) => schemaAccepts(schema.items, entry, root, documents));
  }
  if (value !== null && typeof value === "object") {
    if (!(schema.required ?? []).every((key) => Object.hasOwn(value, key))) return false;
    const properties = schema.properties ?? {};
    if (schema.additionalProperties === false
      && Object.keys(value).some((key) => !Object.hasOwn(properties, key))) return false;
    return Object.entries(value).every(([key, entry]) =>
      !Object.hasOwn(properties, key) || schemaAccepts(properties[key], entry, root, documents));
  }
  return true;
}

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS LWS${String(passed).padStart(2, "0")} ${name}`);
}

check("accepts one closed request bound to pool, runner, instructions, Git, and recovery reserve", () => {
  assert.deepEqual(validateLocalWorkerSupervisorRequest(request()), { ok: true, code: "LWS-REQUEST-VALID" });
  assert.equal(localWorkerSupervisorFixturePath().endsWith("local-worker-supervisor-worker.mjs"), true);
});

check("rejects unknown fields, path escape, instruction drift, malformed runner, and missing Git identity", () => {
  for (const mutate of [
    (value) => { value.extra = true; },
    (value) => { value.workers[0].writePaths = ["../escape"]; },
    (value) => { value.workers[0].instruction += " drift"; },
    (value) => { value.runner.kind = "shell"; },
    (value) => { delete value.git; },
  ]) {
    const value = request();
    mutate(value);
    assert.equal(validateLocalWorkerSupervisorRequest(value).ok, false);
  }
});

check("builds only the fixed fixture launch with shell false and a bounded nonce environment", () => {
  const value = request();
  const built = buildLocalWorkerLaunch({ request: value, worker: value.workers[0], workspacePath: "/tmp/workspace" });
  assert.equal(built.ok, true);
  assert.equal(built.launch.command, executable);
  assert.equal(built.launch.args[0], localWorkerSupervisorFixturePath());
  assert.equal(built.launch.shell, false);
  assert.match(built.launch.env.PIPELINE_LOCAL_WORKER_NONCE, /^[a-f0-9]{32}$/u);
  assert.equal(Object.hasOwn(built.launch.env, "CODEX_API_KEY"), false);
  assert.equal(Object.hasOwn(built.launch.env, "CODEX_ACCESS_TOKEN"), false);
  assert.equal(Object.hasOwn(built.launch.env, "HOME"), false);
  assert.equal(Object.hasOwn(built.launch.env, "CODEX_HOME"), false);
});

check("builds a fixed Codex exec adapter without arbitrary argv, web, network, or interactive approval", () => {
  const value = request("codex-exec");
  const built = buildLocalWorkerLaunch({ request: value, worker: value.workers[0], workspacePath: "/tmp/workspace" });
  assert.equal(built.ok, true);
  assert.deepEqual(built.launch.args.slice(0, 8), ["--ask-for-approval", "never", "exec", "--strict-config", "--ignore-user-config", "--sandbox", "workspace-write", "--ephemeral"]);
  assert.equal(built.launch.args.includes("--json"), true);
  assert.equal(built.launch.args.includes("--cd"), true);
  assert.equal(built.launch.args.includes("web_search=\"disabled\""), true);
  assert.equal(built.launch.args.includes("sandbox_workspace_write.network_access=false"), true);
  assert.equal(built.launch.args.includes("shell_environment_policy.inherit=\"none\""), true);
  assert.equal(built.launch.args.includes("shell_environment_policy.include_only=[\"PATH\",\"LANG\",\"LC_ALL\"]"), true);
  assert.equal(built.launch.args.at(-1), "-");
  assert.equal(built.launch.args.includes(value.workers[0].instruction), false);
  assert.equal(built.launch.stdin, value.workers[0].instruction);
  assert.equal(built.launch.shell, false);
});

check("observes the live Linux owner with PID, start, boot, and executable digests", () => {
  const observed = readLocalWorkerProcessIdentity(process.pid);
  assert.equal(observed.ok, process.platform === "linux");
  if (process.platform === "linux") {
    assert.equal(observed.identity.pid, process.pid);
    for (const key of ["processStartSha256", "bootSha256", "executableSha256"]) assert.match(observed.identity[key], /^[a-f0-9]{64}$/u);
    assert.equal(readLocalWorkerProcessIdentity(process.pid, "wrong-owner").ok, false);
  }
});

check("validates closed terminal result and supervisor record digests", () => {
  const result = finalize({
    schema: LOCAL_WORKER_SUPERVISOR_RESULT_SCHEMA,
    taskId: "task-a",
    subjectSha256: A,
    candidateCommit: OID,
    status: "completed",
    exitCode: 0,
    signal: null,
    changed: [{ path: "src/a.txt", kind: "modified", mode: "100644", bytes: 10, sha256: B }],
    changeManifestSha256: localWorkerSupervisorSha256([{ path: "src/a.txt", kind: "modified", mode: "100644", bytes: 10, sha256: B }]),
    stdoutSha256: C,
    stderrSha256: D,
    startedMonotonicMs: 10,
    completedMonotonicMs: 20,
    resultSha256: null,
  }, "resultSha256");
  assert.equal(validateLocalWorkerSupervisorResult(result).ok, true);
  const processIdentity = { nonce: "worker-owner", pid: 42, processStartSha256: B, bootSha256: C, executableSha256: D };
  const record = finalize({
    schema: LOCAL_WORKER_SUPERVISOR_RECORD_SCHEMA,
    repositoryFingerprint: A,
    sourceRootSha256: B,
    sourceStatusSha256: D,
    candidate: { baseCommit: OID, candidateCommit: OID, candidateSha256: C },
    dispatch: { dispatchId: "dispatch-b1i", attempt: 1, queueRevision: 7, packageSha256: D },
    requestSha256: A,
    planSha256: B,
    poolSha256: C,
    status: "completed",
    owner: { ...processIdentity, nonce: "supervisor-owner" },
    lease: { heartbeatMs: 1_000, orphanAfterMs: 3_000, lastHeartbeatMonotonicMs: 10, cleanupExpiresMonotonicMs: 30_000 },
    effectiveCapacity: 2,
    workers: [{
      taskId: "task-a",
      subjectSha256: A,
      leaseId: "lease-a",
      writePathsSha256: B,
      workspaceMember: "lease-a",
      workspacePathSha256: C,
      state: "completed",
      cleanupState: "cleanup-pending",
      process: processIdentity,
      startedMonotonicMs: 10,
      completedMonotonicMs: 20,
      result,
    }],
    recordSha256: null,
  }, "recordSha256");
  assert.equal(validateLocalWorkerSupervisorRecord(record).ok, true);
  const ownerless = structuredClone(record);
  ownerless.owner = null;
  finalize(ownerless, "recordSha256");
  assert.equal(validateLocalWorkerSupervisorRecord(ownerless).ok, false);
  record.recordSha256 = A;
  assert.equal(validateLocalWorkerSupervisorRecord(record).ok, false);
});

check("keeps representable terminal result combinations in JSON Schema parity with runtime admission", () => {
  const schema = JSON.parse(readFileSync(new URL("../scripts/local-worker-supervisor.schema.json", import.meta.url), "utf8"));
  const structural = (value) => schemaAccepts(schema.$defs.result, value, schema, {});
  const result = (patch = {}) => finalize({
    schema: LOCAL_WORKER_SUPERVISOR_RESULT_SCHEMA,
    taskId: "task-a",
    subjectSha256: A,
    candidateCommit: OID,
    status: "completed",
    exitCode: 0,
    signal: null,
    changed: [{ path: "src/a.txt", kind: "modified", mode: "100644", bytes: 10, sha256: B }],
    changeManifestSha256: localWorkerSupervisorSha256([{ path: "src/a.txt", kind: "modified", mode: "100644", bytes: 10, sha256: B }]),
    stdoutSha256: C,
    stderrSha256: D,
    startedMonotonicMs: 10,
    completedMonotonicMs: 20,
    resultSha256: null,
    ...patch,
  }, "resultSha256");
  const valid = [
    result(),
    result({ status: "failed", exitCode: 1 }),
    result({ status: "failed", exitCode: 0, signal: "SIGTERM" }),
    result({ status: "failed", exitCode: null }),
    result({ status: "cancelled" }),
    result({ changed: [{ path: "src/a.txt", kind: "deleted", mode: null, bytes: 0, sha256: null }], changeManifestSha256: localWorkerSupervisorSha256([{ path: "src/a.txt", kind: "deleted", mode: null, bytes: 0, sha256: null }]) }),
  ];
  const invalid = [
    result({ exitCode: 1 }),
    result({ signal: "SIGTERM" }),
    result({ status: "failed" }),
    result({ changed: [{ path: "src/a.txt", kind: "added", mode: null, bytes: 10, sha256: B }], changeManifestSha256: localWorkerSupervisorSha256([{ path: "src/a.txt", kind: "added", mode: null, bytes: 10, sha256: B }]) }),
    result({ changed: [{ path: "src/a.txt", kind: "modified", mode: "100644", bytes: 10, sha256: null }], changeManifestSha256: localWorkerSupervisorSha256([{ path: "src/a.txt", kind: "modified", mode: "100644", bytes: 10, sha256: null }]) }),
    result({ changed: [{ path: "src/a.txt", kind: "deleted", mode: "100644", bytes: 0, sha256: null }], changeManifestSha256: localWorkerSupervisorSha256([{ path: "src/a.txt", kind: "deleted", mode: "100644", bytes: 0, sha256: null }]) }),
    result({ changed: [{ path: "src/a.txt", kind: "deleted", mode: null, bytes: 1, sha256: null }], changeManifestSha256: localWorkerSupervisorSha256([{ path: "src/a.txt", kind: "deleted", mode: null, bytes: 1, sha256: null }]) }),
    result({ changed: [{ path: "src/a.txt", kind: "deleted", mode: null, bytes: 0, sha256: B }], changeManifestSha256: localWorkerSupervisorSha256([{ path: "src/a.txt", kind: "deleted", mode: null, bytes: 0, sha256: B }]) }),
  ];
  for (const value of valid) {
    assert.equal(structural(value), true, JSON.stringify(value));
    assert.equal(validateLocalWorkerSupervisorResult(value).ok, true, JSON.stringify(value));
  }
  for (const value of invalid) {
    assert.equal(structural(value), false, JSON.stringify(value));
    assert.equal(validateLocalWorkerSupervisorResult(value).ok, false, JSON.stringify(value));
  }
});

check("rejects unavailable or missing exact state rather than inferring recovery success", () => {
  assert.deepEqual(inspectLocalWorkerSupervisor({ stateRoot: "/definitely/not/a/state/root" }), {
    ok: false,
    code: "LWS-STATE-ROOT",
    disposition: "unavailable",
    record: null,
  });
});

check("canonical digest is key-order independent and sensitive to semantic drift", () => {
  assert.equal(canonicalLocalWorkerSupervisorJson({ b: 2, a: 1 }), canonicalLocalWorkerSupervisorJson({ a: 1, b: 2 }));
  assert.equal(localWorkerSupervisorSha256({ b: 2, a: 1 }), localWorkerSupervisorSha256({ a: 1, b: 2 }));
  assert.notEqual(localWorkerSupervisorSha256({ a: 1 }), localWorkerSupervisorSha256({ a: 2 }));
});

check("validates a digest-bound cancellation intent and rejects a drifted nonce", () => {
  const intent = finalize({
    schema: LOCAL_WORKER_SUPERVISOR_CANCEL_SCHEMA,
    requestSha256: A,
    planSha256: B,
    recordSha256: C,
    owner: { nonce: "supervisor-owner", pid: 42, processStartSha256: B, bootSha256: C, executableSha256: D },
    issuedMonotonicMs: 10,
    cancelNonce: "cancel-owner",
    cancelSha256: null,
  }, "cancelSha256");
  assert.equal(validateLocalWorkerSupervisorCancel(intent).ok, true);
  intent.cancelNonce = "drifted";
  assert.equal(validateLocalWorkerSupervisorCancel(intent).ok, false);
});

check("ships one closed JSON Schema for request, plan, record, result, and cancel", () => {
  const schema = JSON.parse(readFileSync(new URL("../scripts/local-worker-supervisor.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.oneOf.length, 5);
  assert.equal(schema.$defs.request.additionalProperties, false);
  assert.equal(schema.$defs.record.additionalProperties, false);
  assert.equal(schema.$defs.result.additionalProperties, false);
  assert.equal(schema.$defs.request.required.includes("git"), true);
  assert.deepEqual(schema["x-pipeline-validation"], LOCAL_WORKER_SUPERVISOR_REQUEST_VALIDATION_CONTRACT);
});

check("keeps JSON Schema safe relative paths in parity with runtime admission", () => {
  const schema = JSON.parse(readFileSync(new URL("../scripts/local-worker-supervisor.schema.json", import.meta.url), "utf8"));
  const safePathPattern = new RegExp(schema.$defs.safePath.pattern, "u");
  assert.doesNotMatch("../escape", safePathPattern);
  assert.doesNotMatch("src/../escape", safePathPattern);
  assert.doesNotMatch("/absolute", safePathPattern);
  assert.doesNotMatch("src//file.txt", safePathPattern);
  assert.doesNotMatch("src/", safePathPattern);
  assert.match("src/.hidden/file.txt", safePathPattern);
});

check("combines structural Schema and canonical semantic admission over one request corpus", () => {
  const supervisorSchema = JSON.parse(readFileSync(new URL("../scripts/local-worker-supervisor.schema.json", import.meta.url), "utf8"));
  const poolSchema = JSON.parse(readFileSync(new URL("../scripts/local-worker-pool.schema.json", import.meta.url), "utf8"));
  const documents = { "local-worker-pool.schema.json": poolSchema };
  const structural = (value) => schemaAccepts(supervisorSchema.$defs.request, value, supervisorSchema, documents);
  const semantic = (value) => validateLocalWorkerSupervisorRequest(value).ok;
  const combined = (value) => structural(value) && semantic(value);

  const valid = request();
  assert.equal(structural(valid), true);
  assert.equal(semantic(valid), true);
  assert.equal(combined(valid), true);

  const pathEscape = request();
  pathEscape.workers[0].writePaths = ["../escape"];
  assert.equal(structural(pathEscape), false);
  assert.equal(semantic(pathEscape), false);
  assert.equal(combined(pathEscape), false);

  for (const mutate of [
    (value) => { value.workers[0].writePaths = ["src/z.txt", "src/a.txt"]; },
    (value) => {
      value.supervisor.heartbeatMs = 2_000;
      value.supervisor.orphanAfterMs = 3_000;
      value.workers.forEach((worker) => {
        worker.heartbeatIntervalMs = 2_000;
        worker.orphanAfterMs = 3_000;
      });
    },
    (value) => { value.workers[1].subjectSha256 = value.workers[0].subjectSha256; },
  ]) {
    const semanticNegative = request();
    mutate(semanticNegative);
    assert.equal(structural(semanticNegative), true);
    assert.equal(semantic(semanticNegative), false);
    assert.equal(combined(semanticNegative), false);
  }
});

console.log(`${passed}/13 checks passed.`);
