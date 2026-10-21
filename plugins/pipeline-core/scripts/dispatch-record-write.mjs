#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { inspectSourceOwnedNativeConfiguredRoute } from "../lib/native-goldfish-host-state.mjs";
import { randomBytes, createHash } from "node:crypto";
import { closeSync, constants, existsSync, fstatSync, fsyncSync, linkSync, lstatSync, openSync, readFileSync, realpathSync, statSync, unlinkSync, writeSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { DISPATCH_RECORD_SCHEMA, PREVIOUS_DISPATCH_RECORD_SCHEMA, assertTerminalLogForWrite, isTerminalOutcome, normalizeDispatchRecordPath, validateDispatchRecord, validatePreviousDispatchRecord } from "../lib/dispatch-record.mjs";
import { criticDispositionAddendumPath, validateCriticDispositionAddendum } from "../lib/critic-disposition-addendum.mjs";
import { parseStrictJson } from "../lib/governance-event.mjs";
import { compareRecordedModel } from "../lib/agent-model-registry.mjs";
import { agyAuthoredRecordBytes } from "../lib/agy-host-observed-receipt.mjs";
import { agyAgentTypeForRole } from "../lib/agy-final-return.mjs";
import { inspectAgyHostObservedLocalReadback } from "../lib/agy-host-observed-local-readback.mjs";
import { nativeAuthoredRecordBytes, inspectNativeGoldfishHostObservation, readNativeGoldfishHostObservation } from "../lib/native-goldfish-host-observation.mjs";

import { readNativeCodexPending, readNativeGoldfishPending } from "../lib/native-goldfish-host-state.mjs";
import { resolveGitCommonDir } from "../lib/po-key-directory.mjs";
import { CRITIC_REQUIRED_SCHEMA } from "../lib/critic-skip-decision.mjs";

const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const REQUEST_SCHEMA = "pipeline.dispatch-record-write-request.v1";
const RECEIPT_SCHEMA_V1 = "pipeline.dispatch-record-write-receipt.v1";
const RECEIPT_SCHEMA_V2 = "pipeline.dispatch-record-write-receipt.v2";

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
  return publishDispatchRecord(root, request.target, request.record, dependencies);
}

/** Host-owned in-memory request; publication still uses the same validation and exclusive inode path. */
export function writeDispatchRecordObject({ repoRoot, target, record }, dependencies = {}) {
  const root = physicalRoot(repoRoot);
  return publishDispatchRecord(root, target, record, dependencies);
}

/**
 * Host-only authored-Agy route. Its caller cannot supply an authority verdict:
 * the private receipt, consent, result bytes and Git objects are reopened here.
 * The public JSON/object writers above retain their model-authority denial.
 */
export function writeHostObservedAgyDispatchRecord({ repoRoot, target, record }, dependencies = {}) {
  const root = physicalRoot(repoRoot);
  return publishDispatchRecord(root, target, record, dependencies, { hostObservedAgy: true });
}

/** Host-only Claude/Codex authored-return publication after private and Git readback. */
export function writeHostObservedNativeGoldfishDispatchRecord({ repoRoot, target, record }, dependencies = {}) {
  const root = physicalRoot(repoRoot);
  return publishDispatchRecord(root, target, record, dependencies, { hostObservedNativeGoldfish: true });
}

function publishDispatchRecord(root, targetPath, inputRecord, dependencies,
  { hostObservedAgy = false, hostObservedNativeGoldfish = false } = {}) {
  const record = validateDispatchRecord(inputRecord);
  // D77 (K6, AC-163): the empty-log refusal for a NEW terminal v3/v4 record lives here; committed v3 history stays readable.
  assertTerminalLogForWrite(record);
  const modelCheck = compareRecordedModel(record);
  if (record.schema === DISPATCH_RECORD_SCHEMA && !isTerminalOutcome(record.outcome)) {
    if (hostObservedAgy || hostObservedNativeGoldfish) fail("attempt-host-route", "terminal host route cannot publish an opening");
    return publishOpening(root, targetPath, record, modelCheck, dependencies);
  }
  const agyUndelivered = record.schema === "pipeline.dispatch-record.v4"
    && record.runner === "antigravity"
    && record.outcomeClassification.kind === "completed-undelivered";
  const agyInterrupted = record.schema === "pipeline.dispatch-record.v4"
    && record.runner === "antigravity"
    && agyAgentTypeForRole(`pipeline-core:${record.agentType}`) !== null
    && record.outcomeClassification.kind === "stopped-without-commit"
    && record.commits.length === 0
    && record.report?.changedFiles.length === 0
    && record.log.length === 1 && record.log[0].phase === "interrupted"
    && /^attempt:[a-f0-9]{32};reason:AGY-[A-Z-]+$/u.test(record.log[0].note ?? "")
    && Object.hasOwn(record, "criticRequired")
    && !Object.hasOwn(record, "criticSkip") && !Object.hasOwn(record, "criticEvidence");
  const agyAuthored = record.schema === "pipeline.dispatch-record.v4"
    && record.runner === "antigravity"
    && agyAgentTypeForRole(`pipeline-core:${record.agentType}`) !== null
    && record.outcomeClassification.kind === "authored-commit";
  const nativeGoldfishAuthored = record.schema === "pipeline.dispatch-record.v4"
    && ["claude", "codex"].includes(record.runner)
    && record.outcomeClassification.kind === "authored-commit";
  if (hostObservedAgy && !agyAuthored) fail("record-host-observation", "host-observed route requires authored Agy v4");
  if (hostObservedNativeGoldfish && !nativeGoldfishAuthored) fail("record-host-observation", "native host-observed route requires authored Claude/Codex v4");
  if (nativeGoldfishAuthored && !hostObservedNativeGoldfish) {
    fail("record-host-observation", "authored Claude/Codex v4 must use the native host-observed writer");
  }
  if (nativeGoldfishAuthored && hostObservedNativeGoldfish) {
    const checked = inspectNativeGoldfishHostObservation({ root, taskId: record.taskId,
      record, recordBytes: nativeAuthoredRecordBytes(record) });
    if (!checked.ok) fail("record-host-observation", `native Goldfish host observation is not independently readable: ${checked.code}`);
  }
  if (agyAuthored && hostObservedAgy) {
    const checked = inspectAgyHostObservedLocalReadback({ root, taskId: record.taskId,
      record, recordBytes: agyAuthoredRecordBytes(record) });
    if (!checked.ok) fail("record-host-observation", `Agy host observation is not independently readable: ${checked.code}`);
  } else if (!hostObservedNativeGoldfish && !agyUndelivered && !agyInterrupted
    && modelCheck.classification !== "model-matches"
    && !(record.schema === PREVIOUS_DISPATCH_RECORD_SCHEMA
      && modelCheck.classification === "model-override-declared")) {
    // v3 already admits a closed, rationale-bearing declared override. It is
    // legacy model intent only; every v4 host/native predicate above remains.
    fail("record-model", `record model/effort is not bound to agentType or an exact v3 declared override: ${modelCheck.reason}`);
  }
  const targetRelative = normalizeDispatchRecordPath(targetPath, "target path");
  const expected = `evidence/dispatch-record-${record.taskId}.json`;
  if (targetRelative !== expected) fail("target-path", `target must exactly match ${expected}`);
  const bytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`, "utf8");
  const digest = publishExclusiveBytes(root, targetRelative, record.taskId, bytes, dependencies, "dispatch-record");
  const receipt = {
    schema: RECEIPT_SCHEMA_V1,
    target: targetRelative,
    sha256: digest,
    bytes: bytes.length,
    taskId: record.taskId,
    candidateCommit: record.candidateCommit,
    resultSha256: record.resultSha256,
  };
  if (record.schema === "pipeline.dispatch-record.v4"
    && ["read-only", "stopped-without-commit", "completed-undelivered"].includes(record.outcomeClassification.kind)) {
    return {
      ...receipt,
      schema: RECEIPT_SCHEMA_V2,
      outcomeClassification: structuredClone(record.outcomeClassification),
      ...(record.outcomeClassification.kind === "completed-undelivered"
        ? { observationIdentity: structuredClone(record.observationIdentity) } : {}),
    };
  }
  return receipt;
}

// Attempts are observations of configured intent, never execution or authorship authority.
function openingRecord(record) {
  const checked = validateDispatchRecord(record);
  if (checked.schema !== DISPATCH_RECORD_SCHEMA || isTerminalOutcome(checked.outcome)
    || checked.commits.length !== 0 || checked.resultSha256 !== null || checked.report !== null
    || checked.log.length !== 0 || (checked.orchestratorAddedFiles?.length ?? 0) !== 0
    || checked.outcomeClassification.kind !== "authored-commit") fail("attempt-opening", "opening cannot claim result, work, checkpoints or delivery");
  return checked;
}
function attemptPath(taskId) { return `evidence/dispatch-attempt-${taskId}.json`; }
function jsonBytes(value) { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}

/** Exclusive intent checkpoint. Neither a checkpoint nor its note authorizes work or claims host execution. */
export function writeDispatchAttemptCheckpoint({ repoRoot, taskId, openingSha256, checkpoint }) {
  const root = physicalRoot(repoRoot);
  const target = attemptPath(taskId);
  const original = readPhysicalRequest(root, target, {});
  if (createHash("sha256").update(original).digest("hex") !== openingSha256) fail("attempt-checkpoint-binding", "opening digest changed");
  const envelope = decodeJson(original);
  exactKeys(envelope, ["schema", "opening"], "attempt");
  if (envelope.schema !== "pipeline.dispatch-attempt.v1") fail("attempt-schema", "wrong attempt schema");
  const opening = openingRecord(envelope.opening);
  if (opening.taskId !== taskId) fail("attempt-checkpoint-binding", "foreign opening");
  // Reuse the durable record's bounded note/privacy and log-entry validation.
  const validated = validateDispatchRecord({ ...opening, log: [checkpoint] }).log[0];
  if (!["checkpoint", "blocked", "failed", "recovery-required"].includes(validated.phase)) fail("attempt-checkpoint-phase", "checkpoint phase is not an intent journal event");
  const bytes = jsonBytes({ schema: "pipeline.dispatch-attempt-checkpoint.v1", taskId,
    openingPath: target, openingSha256, checkpoint: validated, assurance: "caller-reported-intent-only" });
  const digest = createHash("sha256").update(bytes).digest("hex");
  const checkpointPath = `evidence/dispatch-attempt-checkpoint-${taskId}-${digest}.json`;
  return { target: checkpointPath, sha256: publishExclusiveBytes(root, checkpointPath, taskId, bytes, {}, "attempt-checkpoint") };
}
function publishOpening(root, targetPath, record, modelCheck, dependencies) {
  openingRecord(record);
  if (modelCheck.classification !== "model-matches") fail("record-model", "opening requires configured model/effort binding; it does not observe a host model");
  const normalized = normalizeDispatchRecordPath(targetPath, "opening target");
  if (![attemptPath(record.taskId), `evidence/dispatch-record-${record.taskId}.json`].includes(normalized)) fail("target-path", "opening target does not match task");
  const target = attemptPath(record.taskId);
  const bytes = jsonBytes({ schema: "pipeline.dispatch-attempt.v1", opening: record });
  const digest = publishExclusiveBytes(root, target, record.taskId, bytes, dependencies, "dispatch-attempt");
  return { schema: "pipeline.dispatch-attempt-write-receipt.v1", target, sha256: digest,
    bytes: bytes.length, taskId: record.taskId, candidateCommit: record.candidateCommit, assurance: "configured-intent-only" };
}

/** Reopen actual private native pending state; caller fields only select its real invocation. */
export function inspectNativeGoldfishDispatchAttempt(input) { return nativeDispatchAttempt(input, false); }
export function bindNativeGoldfishDispatchAttempt(input) { return nativeDispatchAttempt(input, true); }
function nativeDispatchAttempt({ repoRoot, runner, input, expectedPendingSha256 }, publish) {
  const root = physicalRoot(repoRoot);
  const commonDir = resolveGitCommonDir(root);
  const pending = runner === "codex" && input?.hook_event_name === "SubagentStop"
    ? readNativeCodexPending({ commonDir, input })
    : runner === "claude" && input?.hook_event_name === "PostToolUse" && ["Agent", "Task"].includes(input.tool_name)
      ? readNativeGoldfishPending({ commonDir, runner, sessionId: input.session_id, correlationId: input.tool_use_id }) : null;
  if (!pending?.ok || pending.state.root !== root || pending.state.commonDir !== commonDir
    || pending.state.runner !== runner || pending.state.binding.runner !== runner) fail("attempt-admission", "actual native pending invocation is unavailable or foreign");
  const state = pending.state;
  if (expectedPendingSha256 !== undefined && expectedPendingSha256 !== pending.sha256) fail("attempt-admission-drift", "pending invocation changed after precommit observation");
  const binding = state.binding;
  const target = attemptPath(binding.dispatchId);
  const expected = openingRecord({ schema: DISPATCH_RECORD_SCHEMA, runner, taskId: binding.dispatchId,
    agentType: binding.agentType, model: binding.model, effort: binding.effort, rulesetSha: binding.rulesetSha,
    dispatcher: "Elephant", candidateCommit: binding.candidateCommit, resultSha256: null,
    outcome: "in-progress", commits: [], log: [], report: null,
    outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind: "authored-commit" },
    ...(binding.criticDecision.schema === CRITIC_REQUIRED_SCHEMA ? { criticRequired: binding.criticDecision } : { criticSkip: binding.criticDecision }) });
  const present = existsSync(resolve(root,target));
  const configured=runner==="codex"?inspectSourceOwnedNativeConfiguredRoute({root,pendingSha256:pending.sha256}):null;
  if(configured&&(configured.model!==expected.model||configured.effort!==expected.effort||configured.role!==state.binding.role||configured.candidateCommit!==expected.candidateCommit))fail("record-model","native configured route differs from original opening");
  if (!present && publish) {
    if(configured){const envelope={schema:"pipeline.dispatch-attempt.v1",opening:expected};publishExclusiveBytes(root,target,binding.dispatchId,jsonBytes(envelope),{},"dispatch-attempt");}
    else publishOpening(root,target,expected,compareRecordedModel(expected),{});
  }
  if (!configured&&compareRecordedModel(expected).classification !== "model-matches") fail("record-model", "native opening model configuration mismatch");
  const bytes = !present && !publish ? jsonBytes({ schema: "pipeline.dispatch-attempt.v1", opening: expected }) : readPhysicalRequest(root,target,{});
  const envelope = decodeJson(bytes);
  exactKeys(envelope,["schema","opening"],"attempt");
  if (envelope.schema !== "pipeline.dispatch-attempt.v1") fail("attempt-schema","wrong attempt schema");
  const actual = openingRecord(envelope.opening);
  // Alternate pending spelling is still intent-only; all other configured fields must match.
  if (JSON.stringify(stable({ ...actual, outcome: "in-progress" })) !== JSON.stringify(stable(expected))) fail("attempt-binding","opening differs from actual admitted native briefing");
  const association = { schema: "pipeline.dispatch-attempt-admission.v1", taskId: binding.dispatchId,
    runner, openingPath: target, openingSha256: createHash("sha256").update(bytes).digest("hex"),
    pendingSha256: pending.sha256,
    invocationSha256: createHash("sha256").update(JSON.stringify([runner,state.sessionId,state.toolUseId,state.agentId])).digest("hex"),
    candidateCommit: binding.candidateCommit, candidateTree: binding.candidateTree,
    operation: "native-goldfish-host-commit", allowedPaths: [...binding.allowedPaths] };
  const associationPath = `evidence/dispatch-attempt-admission-${binding.dispatchId}.json`;
  const associationBytes = jsonBytes(association);
  if (!publish) return { status: "observed-not-published", pendingSha256: pending.sha256, openingPresent: present };
  const digest = publishExclusiveBytes(root,associationPath,binding.dispatchId,associationBytes,{},"attempt-admission");
  return { target: associationPath, sha256: digest, openingPath: target, openingSha256: association.openingSha256 };
}

/** Only a freshly reopened genuine terminal proof can create this separate association. */
export function writeNativeGoldfishAttemptTerminalAssociation({ repoRoot, record, attempt }) {
  const root = physicalRoot(repoRoot);
  const checked = validateDispatchRecord(record);
  const recordBytes = nativeAuthoredRecordBytes(checked);
  const proof = inspectNativeGoldfishHostObservation({ root, taskId: checked.taskId, record: checked, recordBytes });
  if (!proof.ok || !isTerminalOutcome(checked.outcome)) fail("attempt-terminal-proof","genuine native terminal proof unavailable");
  const expectedPath = `evidence/dispatch-attempt-admission-${checked.taskId}.json`;
  if (attempt?.target !== expectedPath) fail("attempt-terminal-binding","foreign attempt selector");
  const bytes = readPhysicalRequest(root,expectedPath,{});
  const admission = decodeJson(bytes);
  if (createHash("sha256").update(bytes).digest("hex") !== attempt.sha256
    || admission.schema !== "pipeline.dispatch-attempt-admission.v1" || admission.taskId !== checked.taskId
    || admission.runner !== checked.runner) fail("attempt-terminal-binding","admission association changed");
  // Public admission digests are selectors, not authority. Reopen the original
  // private invocation and its real prelaunch -> authored-commit lineage.
  const admissionKeys = ["schema", "taskId", "runner", "openingPath", "openingSha256",
    "pendingSha256", "invocationSha256", "candidateCommit", "candidateTree", "operation", "allowedPaths"];
  if (JSON.stringify(Object.keys(admission).sort()) !== JSON.stringify(admissionKeys.sort())
    || admission.openingPath !== attemptPath(checked.taskId)
    || admission.operation !== "native-goldfish-host-commit") fail("attempt-terminal-binding","admission shape or operation changed");
  const commonDir = resolveGitCommonDir(root);
  const observed = readNativeGoldfishHostObservation({ commonDir, taskId: checked.taskId,
    candidateCommit: checked.candidateCommit, record: checked, recordBytes });
  if (!observed.ok || observed.sha256 !== proof.receiptSha256) fail("attempt-terminal-binding","private terminal observation changed");
  const receipt = observed.receipt;
  const pending = checked.runner === "codex"
    ? readNativeCodexPending({ commonDir, input: { hook_event_name: "SubagentStop",
      session_id: receipt.sessionId, agent_id: receipt.agentId } })
    : readNativeGoldfishPending({ commonDir, runner: checked.runner,
      sessionId: receipt.sessionId, correlationId: receipt.toolUseId });
  if (!pending.ok) fail("attempt-terminal-binding","original private pending invocation unavailable");
  const state = pending.state;
  const binding = state.binding;
  const same = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));
  const invocationSha256 = createHash("sha256")
    .update(JSON.stringify([state.runner,state.sessionId,state.toolUseId,state.agentId])).digest("hex");
  if (state.root !== root || state.commonDir !== commonDir || state.runner !== checked.runner
    || state.sessionId !== receipt.sessionId || state.toolUseId !== receipt.toolUseId
    || state.agentId !== receipt.agentId || binding.runner !== checked.runner
    || binding.dispatchId !== checked.taskId || binding.role !== receipt.role
    || binding.model !== receipt.model || binding.effort !== receipt.effort
    || binding.rulesetSha !== receipt.rulesetSha || binding.candidateCommit !== receipt.candidateCommit
    || binding.candidateTree !== receipt.candidateTree || (receipt.schema!=="pipeline.native-goldfish-host-observation.v3"&&receipt.parent !== binding.candidateCommit)
    || receipt.commit !== checked.candidateCommit || receipt.commit === binding.candidateCommit
    || pending.sha256 !== admission.pendingSha256 || invocationSha256 !== admission.invocationSha256
    || admission.candidateCommit !== binding.candidateCommit || admission.candidateTree !== binding.candidateTree
    || !same(admission.allowedPaths,binding.allowedPaths)
    || !same([...binding.allowedPaths].sort(),receipt.allowedPaths)) fail("attempt-terminal-binding","original admission lineage changed");
  const opening = readPhysicalRequest(root,admission.openingPath,{});
  if (createHash("sha256").update(opening).digest("hex") !== admission.openingSha256) fail("attempt-terminal-binding","opening changed");
  let original;
  try {
    const envelope = decodeJson(opening);
    exactKeys(envelope,["schema","opening"],"attempt");
    if (envelope.schema !== "pipeline.dispatch-attempt.v1") throw new Error("attempt schema");
    original = openingRecord(envelope.opening);
  } catch { fail("attempt-terminal-binding","original opening invalid"); }
  const expected = { schema: DISPATCH_RECORD_SCHEMA, runner: state.runner, taskId: binding.dispatchId,
    agentType: binding.agentType, model: binding.model, effort: binding.effort, rulesetSha: binding.rulesetSha,
    dispatcher: "Elephant", candidateCommit: binding.candidateCommit, resultSha256: null,
    outcome: "in-progress", commits: [], log: [], report: null,
    outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind: "authored-commit" },
    ...(binding.criticDecision.schema === CRITIC_REQUIRED_SCHEMA ? { criticRequired: binding.criticDecision } : { criticSkip: binding.criticDecision }) };
  if (!same({ ...original, outcome: "in-progress" },expected)) fail("attempt-terminal-binding","opening differs from original private admission");
  const terminalPath = `evidence/dispatch-record-${checked.taskId}.json`;
  if (!readPhysicalRequest(root,terminalPath,{}).equals(recordBytes)) fail("attempt-terminal-binding","published terminal differs");
  const value = { schema: "pipeline.dispatch-attempt-terminal.v1", taskId: checked.taskId,
    admissionPath: expectedPath, admissionSha256: attempt.sha256, openingSha256: admission.openingSha256,
    terminalPath, terminalSha256: createHash("sha256").update(recordBytes).digest("hex"), candidateCommit: checked.candidateCommit };
  const target = `evidence/dispatch-attempt-terminal-${checked.taskId}.json`;
  return { target, sha256: publishExclusiveBytes(root,target,checked.taskId,jsonBytes(value),{},"attempt-terminal") };
}

function publishExclusiveBytes(root, targetRelative, taskId, bytes, dependencies, label) {
  const target = resolve(root, targetRelative);
  const parent = physicalParent(root, target);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const nonce = (dependencies.randomBytes ?? randomBytes)(16).toString("hex");
  const temporaryName = `.${taskId}.${nonce}.${label}.tmp`;
  const targetName = basename(target);
  pinnedDirectory(parent, dependencies.afterTargetDirectoryPinned, () => {
    if (existsSync(targetName)) fail("target-exists", `${label} target already exists`);
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
        || !readback.equals(bytes) || createHash("sha256").update(readback).digest("hex") !== digest) fail("readback", `${label} publication readback failed`);
      (dependencies.closeSync ?? closeSync)(targetFd); targetFd = undefined;
    } catch (error) {
      if (fd !== undefined) try { (dependencies.closeSync ?? closeSync)(fd); } catch {}
      if (targetFd !== undefined) try { (dependencies.closeSync ?? closeSync)(targetFd); } catch {}
      try { if (existsSync(temporaryName)) (dependencies.unlinkSync ?? unlinkSync)(temporaryName); } catch {}
      throw error;
    }
  });
  return digest;
}

/** Host-only publication of byte-bound evidence; coverage separately verifies the consumed Critic receipt. */
export function writeCriticDispositionAddendumObject({ repoRoot, addendum }, dependencies = {}) {
  const root = physicalRoot(repoRoot);
  if (!addendum || typeof addendum !== "object") fail("addendum-shape", "critic addendum is required");
  const target = criticDispositionAddendumPath(addendum.taskId);
  const recordBytes = readPhysicalRequest(root, addendum.recordPath, dependencies);
  let record;
  try { record = parseStrictJson(recordBytes); }
  catch (error) { fail("record-json", `dispatch record is not strict JSON: ${error.message}`); }
  if (record?.schema === PREVIOUS_DISPATCH_RECORD_SCHEMA) validatePreviousDispatchRecord(record);
  else if (record?.schema === DISPATCH_RECORD_SCHEMA) validateDispatchRecord(record);
  else fail("record-schema", "critic addendum source record schema must be v3 or v4");
  validateCriticDispositionAddendum(addendum, { recordPath: addendum.recordPath, recordBytes, record });
  const evidenceBytes = readPhysicalRequest(root, addendum.criticEvidence.path, dependencies);
  if (createHash("sha256").update(evidenceBytes).digest("hex") !== addendum.criticEvidence.sha256) fail("critic-evidence", "critic evidence digest mismatch");
  const bytes = Buffer.from(`${JSON.stringify(addendum, null, 2)}\n`, "utf8");
  const digest = publishExclusiveBytes(root, target, addendum.taskId, bytes, dependencies, "critic-addendum");
  return { schema: "pipeline.critic-disposition-addendum-write-receipt.v1", target, sha256: digest,
    bytes: bytes.length, taskId: addendum.taskId, candidateCommit: addendum.candidateCommit, recordSha256: addendum.recordSha256 };
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

// Source-private METHOD observation; never admitted by public/native record writers.
export { writeSourceOwnedControlledMethodDispatchObservation } from "../lib/controlled-method-dispatch-observation.mjs";
