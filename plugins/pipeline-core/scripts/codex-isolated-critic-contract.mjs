#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Default-off validators and replay state machine for a future isolated Codex
 * Critic lane. This module deliberately has no child_process import and never
 * starts, signals, or kills a process. Callers inject process observations and
 * persist only the decisions produced here.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { validateAgainstSchema } from "../lib/schema-lite.mjs";

export const REQUEST_SCHEMA = "pipeline.codex-isolated-critic-request.v1";
export const JOURNAL_SCHEMA = "pipeline.codex-isolated-critic-journal.v1";
export const RECEIPT_SCHEMA = "pipeline.codex-isolated-critic-receipt.v1";
export const VERDICT_SCHEMA = "pipeline.codex-isolated-critic-verdict.v1";
export const CLAIMS_SCHEMA = "pipeline.codex-isolated-critic-claims.v1";

export const FIXED_BUDGETS = Object.freeze({
  firstEvidenceMs: 60_000,
  semanticLeaseMs: 180_000,
  totalMs: 480_000,
  maxStdoutBytes: 1_048_576,
  maxStderrBytes: 1_048_576,
});

export const TERMINAL_CODES = Object.freeze([
  "verdict-success",
  "verdict-schema-error",
  "permission-denial",
  "sandbox-setup-error",
  "child-stdio-error",
  "lifecycle-stall",
  "timeout",
  "coordinator-cleanup",
]);

export const CLEANUP_STATUSES = Object.freeze([
  "not-needed",
  "attempted-complete",
  "attempted-failed",
  "refused-not-owned",
]);

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATHS = Object.freeze({
  request: join(HERE, "codex-isolated-critic-request.schema.json"),
  journal: join(HERE, "codex-isolated-critic-journal.schema.json"),
  receipt: join(HERE, "codex-isolated-critic-receipt.schema.json"),
  verdict: join(HERE, "codex-isolated-critic-verdict.schema.json"),
});
const SCHEMAS = Object.freeze(Object.fromEntries(Object.entries(SCHEMA_PATHS).map(([key, path]) => [key, JSON.parse(readFileSync(path, "utf8"))])));
const VERDICT_SCHEMA_SHA256 = sha256(readFileSync(SCHEMA_PATHS.verdict));
const HEX32 = /^[0-9a-f]{32}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const INPUT_KINDS = new Set(["spec", "candidate-diff", "guardrail", "constraint", "evidence"]);
const PHASES = new Set(["prepared", "sandbox-started", "thread-started", "turn-started", "semantic-progress", "verdict-received", "validated", "cleanup", "complete"]);
const SEMANTIC_EVENT_TYPES = new Set(["sandbox-started", "thread-started", "turn-started", "semantic-progress", "verdict-received", "validated"]);
const CLAIM_NAMES = ["briefingBounded", "inputConfined", "technicallyIsolatedReadOnly", "verdictIntegrity"];
const CLAIM_STATES = new Set(["proven", "disproven", "not-proven"]);
const CLAIM_EVIDENCE_KINDS = new Set([
  "briefing",
  "candidate-diff",
  "constraint",
  "guardrail",
  "input-manifest",
  "sandbox-preflight",
  "canary",
  "lifecycle",
  "receipt",
  "verdict",
]);
const REQUIRED_PROOF_KIND = Object.freeze({
  briefingBounded: "briefing",
  inputConfined: "input-manifest",
  technicallyIsolatedReadOnly: "sandbox-preflight",
  verdictIntegrity: "verdict",
});
const CLAIM_LOCATOR = /^[A-Za-z0-9][A-Za-z0-9._/:#-]{0,511}$/;

export class IsolatedCriticContractError extends Error {
  constructor(code, message, details = []) {
    super(message);
    this.name = "IsolatedCriticContractError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = []) {
  throw new IsolatedCriticContractError(code, message, details);
}

export function canonicalJson(value) {
  function canonicalize(entry) {
    if (Array.isArray(entry)) return entry.map(canonicalize);
    if (!entry || typeof entry !== "object") return entry;
    return Object.fromEntries(Object.keys(entry).sort().map((key) => [key, canonicalize(entry[key])]));
  }
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("F3-SCHEMA", `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) fail("F3-SCHEMA", `${label} has missing or additional fields`);
}

function integerSchemaForLite(schema) {
  if (Array.isArray(schema)) return schema.map(integerSchemaForLite);
  if (!schema || typeof schema !== "object") return schema;
  const result = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "type" && value === "integer") result[key] = "number";
    else if (key === "type" && Array.isArray(value)) result[key] = value.map((entry) => entry === "integer" ? "number" : entry);
    else result[key] = integerSchemaForLite(value);
  }
  return result;
}

function validateLite(value, schema, label) {
  const result = validateAgainstSchema(value, integerSchemaForLite(schema));
  if (!result.valid) fail("F3-SCHEMA", `${label} does not match its closed schema`, result.errors);
}

function boundedString(value, label, max = 240) {
  if (typeof value !== "string" || !value || value.length > max || value.trim() !== value || /[\0\r\n]/.test(value)) {
    fail("F3-STRING", `${label} is not a bounded single-line string`);
  }
  return value;
}

function normalizeArtifactPath(value) {
  if (typeof value !== "string" || !value || value.length > 240 || isAbsolute(value) || value.includes("\\") || value.includes("\0")) {
    fail("F3-INPUT-PATH", "input artifact path must be a bounded slash-relative path");
  }
  const parts = value.split("/");
  const lowered = parts.map((part) => part.toLowerCase());
  if (parts.some((part) => !part || part === "." || part === "..") || lowered.includes(".git")) {
    fail("F3-INPUT-PATH", "input artifact path contains a forbidden component");
  }
  if (lowered.includes(".ssh") || lowered.includes("credentials") || lowered.includes("known_hosts")
    || lowered.some((part) => part.includes("credential")) || new Set([".gitconfig", ".gitmodules", "config.toml", "auth.json"]).has(lowered.at(-1))) {
    fail("F3-INPUT-PATH", "input materialization may not include credential, remote or global configuration");
  }
  return parts.join("/");
}

export function inputSetSha256(inputs) {
  return sha256(Buffer.from(canonicalJson(inputs)));
}

export function validateRequestShape(request) {
  validateLite(request, SCHEMAS.request, "request");
  if (!HEX32.test(request.dispatchNonce) || !HEX32.test(request.attemptNonce)
    || request.dispatchNonce === request.attemptNonce) fail("F3-NONCE", "dispatch and attempt nonces must be distinct 32-hex values");
  if (!OID.test(request.candidate.commit) || !OID.test(request.candidate.tree)
    || request.candidate.commit.length !== request.candidate.tree.length || !SHA256.test(request.candidate.diffSha256)) {
    fail("F3-CANDIDATE", "candidate commit/tree/diff binding is invalid");
  }
  if (!Array.isArray(request.inputs) || request.inputs.length < 2 || request.inputs.length > 128) {
    fail("F3-INPUTS", "request requires 2..128 ordered input artifacts");
  }
  const paths = new Set();
  const inodeKinds = new Map();
  for (const [index, input] of request.inputs.entries()) {
    if (!INPUT_KINDS.has(input.kind) || !SHA256.test(input.rawSha256)
      || !Number.isSafeInteger(input.size) || input.size < 0 || input.size > 1_048_576) {
      fail("F3-INPUTS", `input ${index} has an invalid kind, digest or size`);
    }
    const path = normalizeArtifactPath(input.path);
    if (path !== input.path || paths.has(path)) fail("F3-INPUTS", "input paths must be canonical and unique");
    paths.add(path);
    inodeKinds.set(input.kind, (inodeKinds.get(input.kind) ?? 0) + 1);
  }
  if (inodeKinds.get("spec") !== 1 || inodeKinds.get("candidate-diff") !== 1) {
    fail("F3-INPUTS", "request requires exactly one Spec and one fixed candidate diff");
  }
  if (request.inputSetSha256 !== inputSetSha256(request.inputs)) fail("F3-INPUT-DIGEST", "input-set digest does not match ordered artifacts");
  if (!SAFE_ID.test(request.permissionProfile.id) || !SHA256.test(request.permissionProfile.rawSha256)) {
    fail("F3-PROFILE", "permission profile binding is invalid");
  }
  boundedString(request.cli.version, "CLI version", 80);
  boundedString(request.cli.compatibilityClass, "CLI compatibility class", 80);
  boundedString(request.platform.kernelClass, "kernel class", 120);
  if (!SHA256.test(request.preflight.rawSha256) || request.preflight.schema !== "pipeline.codex-sandbox-preflight.v1") {
    fail("F3-PREFLIGHT", "preflight binding is invalid");
  }
  if (request.verdictSchemaSha256 !== VERDICT_SCHEMA_SHA256) fail("F3-VERDICT-SCHEMA", "request does not bind the owned verdict schema bytes");
  if (Object.entries(FIXED_BUDGETS).some(([name, value]) => request.budgets[name] !== value)) {
    fail("F3-BUDGET", "request budgets differ from the fixed 60/180/480 and 1 MiB contract");
  }
  const identity = request.process;
  boundedString(identity.hostBootId, "host boot ID", 160);
  boundedString(identity.processStartId, "process start ID", 160);
  if (!Number.isSafeInteger(identity.pid) || identity.pid < 1 || !Number.isSafeInteger(identity.pgid) || identity.pgid < 1
    || !HEX32.test(identity.coordinatorNonce)) fail("F3-PROCESS", "coordinator process identity is invalid");
  if (!Number.isSafeInteger(request.createdAtMs) || request.createdAtMs < 0) fail("F3-TIME", "request creation time is invalid");
  return request;
}

function isInside(root, path) {
  const rel = relative(root, path);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function walkMaterialization(root) {
  const files = [];
  const identities = new Set();
  function visit(directory, prefix) {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) fail("F3-INPUT-SYMLINK", "input materialization contains a symlink");
      const rel = prefix ? `${prefix}/${name}` : name;
      normalizeArtifactPath(rel);
      if (stat.isDirectory()) visit(path, rel);
      else if (stat.isFile()) {
        if (stat.nlink !== 1) fail("F3-INPUT-HARDLINK", "input materialization contains a hard-link alias");
        const identity = `${stat.dev}:${stat.ino}`;
        if (identities.has(identity)) fail("F3-INPUT-HARDLINK", "two input paths resolve to the same physical file");
        identities.add(identity);
        files.push({ path: rel, size: stat.size, rawSha256: sha256(readFileSync(path)) });
      } else fail("F3-INPUT-TYPE", "input materialization contains an unsupported object");
    }
  }
  visit(root, "");
  return files;
}

export function validateRequest(request, { inputRoot } = {}) {
  validateRequestShape(request);
  if (!inputRoot) fail("F3-INPUT-ROOT", "input materialization root is required");
  const stat = lstatSync(inputRoot);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("F3-INPUT-ROOT", "input root must be a physical directory");
  const root = realpathSync(inputRoot);
  if (root !== resolve(inputRoot)) fail("F3-INPUT-ROOT", "input root must be addressed by its physical path");
  const observed = walkMaterialization(root);
  const expected = request.inputs.map(({ path, size, rawSha256 }) => ({ path, size, rawSha256 })).sort((a, b) => a.path.localeCompare(b.path));
  observed.sort((a, b) => a.path.localeCompare(b.path));
  if (JSON.stringify(observed) !== JSON.stringify(expected)) fail("F3-INPUT-MATERIALIZATION", "materialized input set differs from the request");
  for (const input of request.inputs) {
    const absolute = resolve(root, input.path);
    if (!isInside(root, absolute)) fail("F3-INPUT-PATH", "input escaped materialization root");
  }
  return request;
}

function fsyncDirectory(path) {
  const fd = openSync(path, "r");
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function assertPrivateFile(path) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0) {
    fail("F3-PERSISTENCE", `${basename(path)} is not a mode-0600 single-link regular file`);
  }
}

function ensurePhysicalDirectory(path) {
  let existing = path;
  while (!existsSync(existing)) existing = dirname(existing);
  if (realpathSync(existing) !== resolve(existing)) fail("F3-PERSISTENCE", "dispatch path crosses a symlink");
  mkdirSync(path, { recursive: true, mode: 0o700 });
  if (lstatSync(path).isSymbolicLink() || realpathSync(path) !== resolve(path)) fail("F3-PERSISTENCE", "dispatch directory is not physical");
}

function writeExclusiveFile(path, bytes) {
  ensurePhysicalDirectory(dirname(path));
  const fd = openSync(path, "wx", 0o600);
  try {
    writeFileSync(fd, bytes);
    fsyncSync(fd);
  } finally { closeSync(fd); }
  fsyncDirectory(dirname(path));
}

export const filePersistence = Object.freeze({
  ensureDirectory: ensurePhysicalDirectory,
  exists: existsSync,
  list(path) { return existsSync(path) ? readdirSync(path) : []; },
  read(path) {
    assertPrivateFile(path);
    return readFileSync(path);
  },
  createExclusive(path, bytes) { writeExclusiveFile(path, bytes); },
  replace(path, expectedRawSha256, bytes) {
    const current = this.read(path);
    if (sha256(current) !== expectedRawSha256) fail("F3-CAS", "journal changed before atomic replacement");
    const temporary = join(dirname(path), `.journal.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
    writeExclusiveFile(temporary, bytes);
    renameSync(temporary, path);
    fsyncDirectory(dirname(path));
  },
  writeArtifactExclusive(path, bytes) { writeExclusiveFile(path, bytes); },
});

export function dispatchPaths(commonDir, dispatchNonce) {
  if (!HEX32.test(dispatchNonce)) fail("F3-NONCE", "dispatch nonce must be 32 lowercase hex");
  const common = realpathSync(commonDir);
  if (common !== resolve(commonDir) || lstatSync(common).isSymbolicLink() || !lstatSync(common).isDirectory()) {
    fail("F3-PERSISTENCE", "Git common directory must be physical");
  }
  const directory = join(common, "agent-pipeline", "isolated-critic", dispatchNonce);
  if (!isInside(common, directory)) fail("F3-PERSISTENCE", "dispatch directory escaped Git common directory");
  return {
    directory,
    journal: join(directory, "journal.json"),
    verdict: join(directory, "verdict.json"),
    receipt: join(directory, "receipt.json"),
  };
}

function eventHash(event) {
  const { eventHash: ignored, ...unsigned } = event;
  return sha256(Buffer.from(canonicalJson(unsigned)));
}

function makeEvent(events, type, observedAtMs, body) {
  const event = {
    sequence: events.length + 1,
    type,
    observedAtMs,
    previousHash: events.length === 0 ? null : events.at(-1).eventHash,
    body,
    eventHash: "",
  };
  event.eventHash = eventHash(event);
  return event;
}

function validateEventBody(event) {
  const label = `event ${event.sequence} ${event.type}`;
  if (event.type === "prepared") {
    exactKeys(event.body, ["requestSha256"], label);
    if (!SHA256.test(event.body.requestSha256)) fail("F3-EVENT", `${label} digest is invalid`);
  } else if (new Set(["sandbox-started", "thread-started", "turn-started"]).has(event.type)) {
    exactKeys(event.body, ["evidenceSha256"], label);
    if (!SHA256.test(event.body.evidenceSha256)) fail("F3-EVENT", `${label} evidence digest is invalid`);
  } else if (event.type === "semantic-progress") {
    exactKeys(event.body, ["kind", "contentSha256", "byteLength"], label);
    if (!new Set(["lifecycle", "evidence", "verdict-frame"]).has(event.body.kind)
      || !SHA256.test(event.body.contentSha256) || !Number.isSafeInteger(event.body.byteLength)
      || event.body.byteLength < 1 || event.body.byteLength > 1_048_576) {
      fail("F3-EVENT", `${label} semantic binding is invalid`);
    }
  } else if (event.type === "verdict-received") {
    exactKeys(event.body, ["verdictSha256", "size", "parseable"], label);
    if (!SHA256.test(event.body.verdictSha256) || !Number.isSafeInteger(event.body.size) || event.body.size < 1
      || typeof event.body.parseable !== "boolean") fail("F3-EVENT", `${label} verdict binding is invalid`);
  } else if (event.type === "validated") {
    exactKeys(event.body, ["verdictSha256", "reviewPass"], label);
    if (!SHA256.test(event.body.verdictSha256) || typeof event.body.reviewPass !== "boolean") fail("F3-EVENT", `${label} validation binding is invalid`);
  } else if (event.type === "cleanup") {
    exactKeys(event.body, ["status", "ownershipMatched", "preCleanupPhase"], label);
    if (!CLEANUP_STATUSES.includes(event.body.status) || typeof event.body.ownershipMatched !== "boolean"
      || !PHASES.has(event.body.preCleanupPhase) || new Set(["cleanup", "complete"]).has(event.body.preCleanupPhase)) {
      fail("F3-EVENT", `${label} cleanup binding is invalid`);
    }
  } else if (event.type === "complete") {
    exactKeys(event.body, ["terminalCode"], label);
    if (!TERMINAL_CODES.includes(event.body.terminalCode)) fail("F3-EVENT", `${label} terminal code is invalid`);
  } else fail("F3-EVENT", `${label} has an unsupported type`);
}

function transitionAllowed(previous, current) {
  const allowed = {
    prepared: ["sandbox-started", "cleanup"],
    "sandbox-started": ["thread-started", "cleanup"],
    "thread-started": ["turn-started", "cleanup"],
    "turn-started": ["semantic-progress", "verdict-received", "cleanup"],
    "semantic-progress": ["semantic-progress", "verdict-received", "cleanup"],
    "verdict-received": ["validated", "cleanup"],
    validated: ["cleanup"],
    cleanup: ["complete"],
    complete: [],
  };
  return allowed[previous]?.includes(current) ?? false;
}

export function validateJournal(journal) {
  validateLite(journal, SCHEMAS.journal, "journal");
  validateRequestShape(journal.request);
  if (!Number.isSafeInteger(journal.revision) || journal.revision < 0
    || (journal.priorRawSha256 !== null && !SHA256.test(journal.priorRawSha256))
    || journal.requestSha256 !== sha256(Buffer.from(canonicalJson(journal.request)))) fail("F3-JOURNAL", "journal revision/request binding is invalid");
  if (!Array.isArray(journal.events) || journal.events.length < 1 || journal.events[0].type !== "prepared") {
    fail("F3-JOURNAL", "journal must start with prepared");
  }
  for (let index = 0; index < journal.events.length; index += 1) {
    const event = journal.events[index];
    if (event.sequence !== index + 1 || event.previousHash !== (index === 0 ? null : journal.events[index - 1].eventHash)
      || event.eventHash !== eventHash(event) || !Number.isSafeInteger(event.observedAtMs)
      || (index > 0 && event.observedAtMs < journal.events[index - 1].observedAtMs)) {
      fail("F3-EVENT-CHAIN", "journal event chain is noncanonical or corrupt");
    }
    validateEventBody(event);
    if (index > 0 && !transitionAllowed(journal.events[index - 1].type, event.type)) fail("F3-TRANSITION", "journal contains an illegal lifecycle transition");
  }
  if (journal.events[0].body.requestSha256 !== journal.requestSha256 || journal.phase !== journal.events.at(-1).type) {
    fail("F3-JOURNAL", "journal phase or prepared binding drifted");
  }
  exactKeys(journal.streams, ["stdoutBytes", "stderrBytes", "stdoutLastChunk", "stderrLastChunk"], "journal streams");
  for (const [name, limit] of [["stdoutBytes", FIXED_BUDGETS.maxStdoutBytes], ["stderrBytes", FIXED_BUDGETS.maxStderrBytes]]) {
    if (!Number.isSafeInteger(journal.streams[name]) || journal.streams[name] < 0 || journal.streams[name] > limit) fail("F3-STREAM-LIMIT", `${name} exceeds its fixed budget`);
    const chunk = journal.streams[name.replace("Bytes", "LastChunk")];
    if (chunk !== null) {
      exactKeys(chunk, ["startOffset", "byteLength", "rawSha256"], `${name} last chunk`);
      if (!Number.isSafeInteger(chunk.startOffset) || chunk.startOffset < 0 || !Number.isSafeInteger(chunk.byteLength)
        || chunk.byteLength < 1 || chunk.startOffset + chunk.byteLength !== journal.streams[name] || !SHA256.test(chunk.rawSha256)) {
        fail("F3-OUTPUT", `${name} last-chunk binding is invalid`);
      }
    } else if (journal.streams[name] !== 0) fail("F3-OUTPUT", `${name} lacks its last-chunk binding`);
  }
  exactKeys(journal.verdict, ["status", "rawSha256", "size", "reviewPass"], "journal verdict");
  if (!new Set(["absent", "bytes-observed", "received", "validated"]).has(journal.verdict.status)
    || (journal.verdict.status === "absent" ? journal.verdict.rawSha256 !== null || journal.verdict.size !== 0
      : !SHA256.test(journal.verdict.rawSha256) || journal.verdict.size < 1)
    || (journal.verdict.status === "validated" ? typeof journal.verdict.reviewPass !== "boolean" : journal.verdict.reviewPass !== null)) {
    fail("F3-VERDICT-STATE", "journal verdict state is inconsistent");
  }
  if (journal.cleanup !== null) {
    exactKeys(journal.cleanup, ["status", "ownershipMatched", "preCleanupPhase"], "journal cleanup");
    const cleanupEvent = journal.events.find((event) => event.type === "cleanup");
    if (!CLEANUP_STATUSES.includes(journal.cleanup.status) || !cleanupEvent
      || canonicalJson(journal.cleanup) !== canonicalJson(cleanupEvent.body)) {
      fail("F3-CLEANUP", "journal cleanup projection is invalid");
    }
  }
  if (journal.terminal !== null) {
    exactKeys(journal.terminal, ["code"], "journal terminal");
    const terminalEvent = journal.events.find((event) => event.type === "complete");
    if (!TERMINAL_CODES.includes(journal.terminal.code) || !terminalEvent
      || journal.terminal.code !== terminalEvent.body.terminalCode) {
      fail("F3-TERMINAL", "journal terminal projection is invalid");
    }
  }
  if ((journal.phase === "cleanup" || journal.phase === "complete") !== (journal.cleanup !== null)
    || (journal.phase === "complete") !== (journal.terminal !== null)) fail("F3-JOURNAL", "cleanup/terminal projection does not match phase");
  if (!Number.isSafeInteger(journal.createdAtMs) || !Number.isSafeInteger(journal.updatedAtMs)
    || journal.createdAtMs !== journal.events[0].observedAtMs
    || journal.updatedAtMs < journal.events.at(-1).observedAtMs
    || journal.updatedAtMs < journal.createdAtMs) fail("F3-TIME", "journal timestamps are invalid");
  if ((journal.revision === 0) !== (journal.priorRawSha256 === null)) {
    fail("F3-JOURNAL", "journal revision does not bind a prior raw postimage");
  }
  const receivedEvent = journal.events.find((event) => event.type === "verdict-received");
  const validatedEvent = journal.events.find((event) => event.type === "validated");
  const verdictFrame = [...journal.events].reverse().find((event) => event.type === "semantic-progress" && event.body.kind === "verdict-frame");
  if (journal.verdict.status === "absent" && (receivedEvent || validatedEvent || verdictFrame)
    || journal.verdict.status !== "absent" && (!verdictFrame
      || verdictFrame.body.contentSha256 !== journal.verdict.rawSha256 || verdictFrame.body.byteLength !== journal.verdict.size)
    || journal.verdict.status === "bytes-observed" && receivedEvent
    || new Set(["received", "validated"]).has(journal.verdict.status) && (!receivedEvent
      || receivedEvent.body.verdictSha256 !== journal.verdict.rawSha256 || receivedEvent.body.size !== journal.verdict.size)
    || journal.verdict.status === "validated" && (!validatedEvent
      || validatedEvent.body.verdictSha256 !== journal.verdict.rawSha256
      || validatedEvent.body.reviewPass !== journal.verdict.reviewPass || receivedEvent.body.parseable !== true)
    || journal.verdict.status !== "validated" && validatedEvent) {
    fail("F3-VERDICT-STATE", "journal verdict projection does not match its event chain");
  }
  if (journal.terminal) {
    const cleanupFailed = new Set(["attempted-failed", "refused-not-owned"]).has(journal.cleanup.status);
    if (cleanupFailed && journal.terminal.code !== "coordinator-cleanup"
      || journal.terminal.code === "verdict-success"
        && (journal.cleanup.preCleanupPhase !== "validated" || journal.verdict.status !== "validated")
      || journal.terminal.code === "verdict-schema-error"
        && (journal.cleanup.preCleanupPhase !== "verdict-received" || journal.verdict.status !== "received")) {
      fail("F3-TERMINAL", "journal terminal result is inconsistent with verdict or cleanup state");
    }
  }
  return journal;
}

function contextPaths(context) {
  return dispatchPaths(context.commonDir, context.dispatchNonce);
}

function assertNoTornPostimage(context, paths) {
  const torn = context.persistence.list(paths.directory).filter((name) => /^\.journal\..+\.tmp$/.test(name));
  if (torn.length > 0) fail("F3-TORN-POSTIMAGE", "journal directory contains an unresolved temporary postimage");
}

export function createJournal({ commonDir, request, inputRoot, persistence = filePersistence, clock = Date.now }) {
  validateRequest(request, { inputRoot });
  const paths = dispatchPaths(commonDir, request.dispatchNonce);
  persistence.ensureDirectory(paths.directory);
  if (persistence.exists(paths.journal) || persistence.exists(paths.verdict) || persistence.exists(paths.receipt)) {
    fail("F3-REPLAY-CONFLICT", "dispatch directory already contains state");
  }
  const observedAtMs = clock();
  if (!Number.isSafeInteger(observedAtMs) || observedAtMs < request.createdAtMs) fail("F3-TIME", "journal clock precedes request creation");
  const requestSha256 = sha256(Buffer.from(canonicalJson(request)));
  const events = [makeEvent([], "prepared", observedAtMs, { requestSha256 })];
  const journal = {
    schema: JOURNAL_SCHEMA,
    revision: 0,
    priorRawSha256: null,
    request: structuredClone(request),
    requestSha256,
    phase: "prepared",
    events,
    streams: { stdoutBytes: 0, stderrBytes: 0, stdoutLastChunk: null, stderrLastChunk: null },
    verdict: { status: "absent", rawSha256: null, size: 0, reviewPass: null },
    cleanup: null,
    terminal: null,
    createdAtMs: observedAtMs,
    updatedAtMs: observedAtMs,
  };
  validateJournal(journal);
  const raw = Buffer.from(canonicalJson(journal));
  persistence.createExclusive(paths.journal, raw);
  return { journal, rawSha256: sha256(raw), paths };
}

export function loadJournal(context) {
  const paths = contextPaths(context);
  assertNoTornPostimage(context, paths);
  const raw = context.persistence.read(paths.journal);
  let journal;
  try { journal = JSON.parse(raw.toString("utf8")); } catch { fail("F3-JOURNAL-JSON", "journal JSON is malformed"); }
  validateJournal(journal);
  if (journal.request.dispatchNonce !== context.dispatchNonce) {
    fail("F3-JOURNAL", "journal dispatch nonce does not match its dispatch directory");
  }
  return { journal, raw, rawSha256: sha256(raw), paths };
}

function mutateJournal(context, mutation, clock = Date.now) {
  const loaded = loadJournal(context);
  const next = structuredClone(loaded.journal);
  const outcome = mutation(next, loaded);
  if (outcome?.noMutation) return { ...loaded, outcome };
  const observedAtMs = clock();
  if (!Number.isSafeInteger(observedAtMs) || observedAtMs < next.updatedAtMs) fail("F3-TIME", "journal clock moved backwards");
  next.revision += 1;
  next.priorRawSha256 = loaded.rawSha256;
  next.updatedAtMs = observedAtMs;
  validateJournal(next);
  const raw = Buffer.from(canonicalJson(next));
  context.persistence.replace(loaded.paths.journal, loaded.rawSha256, raw);
  return { journal: next, raw, rawSha256: sha256(raw), paths: loaded.paths, outcome };
}

function appendEvent(journal, type, body, observedAtMs) {
  if (journal.phase === "complete") fail("F3-TERMINAL", "terminal journal cannot advance");
  if (!transitionAllowed(journal.phase, type)) fail("F3-TRANSITION", `${journal.phase} cannot transition to ${type}`);
  const event = makeEvent(journal.events, type, observedAtMs, body);
  journal.events.push(event);
  journal.phase = type;
  return event;
}

export function advanceLifecycle(context, type, evidenceSha256, { clock = Date.now } = {}) {
  if (!new Set(["sandbox-started", "thread-started", "turn-started"]).has(type) || !SHA256.test(evidenceSha256)) {
    fail("F3-EVENT", "lifecycle advance requires a supported type and evidence digest");
  }
  const at = clock();
  return mutateJournal(context, (journal) => ({ event: appendEvent(journal, type, { evidenceSha256 }, at) }), () => at);
}

export function recordSemanticProgress(context, progress, { clock = Date.now } = {}) {
  if (!new Set(["lifecycle", "evidence", "verdict-frame"]).has(progress.kind)
    || !SHA256.test(progress.contentSha256) || !Number.isSafeInteger(progress.byteLength)
    || progress.byteLength < 1 || progress.byteLength > 1_048_576) {
    fail("F3-SEMANTIC", "semantic progress must bind new bounded content bytes");
  }
  const at = clock();
  return mutateJournal(context, (journal) => {
    const duplicate = [...journal.events].reverse().find((event) => event.type === "semantic-progress"
      && event.body.kind === progress.kind && event.body.contentSha256 === progress.contentSha256
      && event.body.byteLength === progress.byteLength);
    if (duplicate) return { noMutation: true, renewed: false, event: duplicate };
    return { renewed: true, event: appendEvent(journal, "semantic-progress", structuredClone(progress), at) };
  }, () => at);
}

export function recordOutputObservation(context, observation, { clock = Date.now } = {}) {
  if (!new Set(["stdout", "stderr"]).has(observation.stream) || !SHA256.test(observation.chunkSha256)
    || !Number.isSafeInteger(observation.startOffset) || observation.startOffset < 0
    || !Number.isSafeInteger(observation.byteLength) || observation.byteLength < 1) {
    fail("F3-OUTPUT", "output observation is invalid");
  }
  return mutateJournal(context, (journal) => {
    const key = `${observation.stream}Bytes`;
    const lastKey = `${observation.stream}LastChunk`;
    const limit = observation.stream === "stdout" ? FIXED_BUDGETS.maxStdoutBytes : FIXED_BUDGETS.maxStderrBytes;
    const candidate = { startOffset: observation.startOffset, byteLength: observation.byteLength, rawSha256: observation.chunkSha256 };
    if (journal.streams[lastKey] !== null && canonicalJson(journal.streams[lastKey]) === canonicalJson(candidate)) {
      return { noMutation: true, semanticRenewal: false, duplicate: true };
    }
    if (new Set(["cleanup", "complete"]).has(journal.phase)) fail("F3-TERMINAL", "cleanup is final and cannot record new output");
    if (observation.startOffset !== journal.streams[key]) fail("F3-REPLAY-CONFLICT", `${observation.stream} chunk offset is ambiguous`);
    if (journal.streams[key] + observation.byteLength > limit) fail("F3-STREAM-LIMIT", `${observation.stream} exceeds 1 MiB`);
    journal.streams[key] += observation.byteLength;
    journal.streams[lastKey] = candidate;
    return { semanticRenewal: false, duplicate: false };
  }, clock);
}

export function evaluateLease(journal, nowMs) {
  validateJournal(journal);
  if (!Number.isSafeInteger(nowMs) || nowMs < journal.createdAtMs) fail("F3-TIME", "lease observation time is invalid");
  const elapsed = nowMs - journal.createdAtMs;
  if (elapsed >= journal.request.budgets.totalMs) return { state: "expired", terminalCode: "timeout", reason: "total-timeout" };
  const semantic = journal.events.filter((event) => SEMANTIC_EVENT_TYPES.has(event.type));
  if (semantic.length === 0) {
    return elapsed >= journal.request.budgets.firstEvidenceMs
      ? { state: "expired", terminalCode: "timeout", reason: "first-evidence-timeout" }
      : { state: "active", terminalCode: null, reason: null };
  }
  const gap = nowMs - semantic.at(-1).observedAtMs;
  return gap >= journal.request.budgets.semanticLeaseMs
    ? { state: "expired", terminalCode: "lifecycle-stall", reason: "semantic-lease-expired" }
    : { state: "active", terminalCode: null, reason: null };
}

export function observeHeartbeat(context, { nowMs }) {
  const loaded = loadJournal(context);
  return { ...evaluateLease(loaded.journal, nowMs), revision: loaded.journal.revision, mutated: false };
}

function artifactWriteIdempotent(persistence, path, bytes) {
  if (persistence.exists(path)) {
    const current = persistence.read(path);
    if (!Buffer.from(current).equals(Buffer.from(bytes))) fail("F3-REPLAY-CONFLICT", `${basename(path)} already contains different bytes`);
    return false;
  }
  persistence.writeArtifactExclusive(path, bytes);
  return true;
}

export function recordVerdictBytes(context, bytes, { clock = Date.now } = {}) {
  const payload = Buffer.from(bytes);
  if (payload.length < 1 || payload.length > 1_048_576) fail("F3-VERDICT-SIZE", "verdict bytes must be 1..1048576 bytes");
  const paths = contextPaths(context);
  const digest = sha256(payload);
  artifactWriteIdempotent(context.persistence, paths.verdict, payload);
  const at = clock();
  return mutateJournal(context, (journal) => {
    if (journal.verdict.status !== "absent") {
      if (journal.verdict.rawSha256 === digest && journal.verdict.size === payload.length) return { noMutation: true, verdictSha256: digest };
      fail("F3-REPLAY-CONFLICT", "journal already binds different verdict bytes");
    }
    journal.verdict = { status: "bytes-observed", rawSha256: digest, size: payload.length, reviewPass: null };
    const duplicate = journal.events.at(-1)?.type === "semantic-progress"
      && journal.events.at(-1).body.kind === "verdict-frame" && journal.events.at(-1).body.contentSha256 === digest;
    if (!duplicate) appendEvent(journal, "semantic-progress", { kind: "verdict-frame", contentSha256: digest, byteLength: payload.length }, at);
    return { verdictSha256: digest };
  }, () => at);
}

export function recordVerdictReceived(context, { clock = Date.now } = {}) {
  const paths = contextPaths(context);
  if (!context.persistence.exists(paths.verdict)) fail("F3-VERDICT-MISSING", "verdict bytes are absent");
  const raw = context.persistence.read(paths.verdict);
  let parseable = true;
  try { JSON.parse(raw.toString("utf8")); } catch { parseable = false; }
  const digest = sha256(raw);
  const at = clock();
  return mutateJournal(context, (journal) => {
    if (journal.verdict.status === "received") return { noMutation: true, parseable };
    if (journal.verdict.status !== "bytes-observed" || journal.verdict.rawSha256 !== digest || journal.verdict.size !== raw.length) {
      fail("F3-VERDICT-BINDING", "journal and verdict artifact differ");
    }
    appendEvent(journal, "verdict-received", { verdictSha256: digest, size: raw.length, parseable }, at);
    journal.verdict.status = "received";
    return { parseable };
  }, () => at);
}

function boundedVerdictText(value, label) {
  if (typeof value !== "string" || value.length < 1 || value.length > 4_000 || value.includes("\0")) {
    fail("F3-VERDICT-SCHEMA", `${label} is not bounded text`);
  }
}

export function validateVerdictValue(value, request) {
  validateLite(value, SCHEMAS.verdict, "verdict");
  if (value.schema !== VERDICT_SCHEMA || value.dispatchNonce !== request.dispatchNonce || value.attemptNonce !== request.attemptNonce
    || value.candidate.commit !== request.candidate.commit || value.candidate.tree !== request.candidate.tree
    || value.candidate.diffSha256 !== request.candidate.diffSha256 || value.inputSetSha256 !== request.inputSetSha256) {
    fail("F3-VERDICT-BINDING", "verdict nonce/candidate/input binding differs from request");
  }
  const result = value.result;
  if (result.findings.length > 100 || result.deliberatelyNotFlagged.length > 100 || result.briefingViolations.length > 100) {
    fail("F3-VERDICT-SCHEMA", "verdict arrays exceed their bounds");
  }
  for (const finding of result.findings) {
    for (const field of ["gap", "risk", "evidence", "specRef"]) boundedVerdictText(finding[field], `finding.${field}`);
  }
  for (const text of [...result.deliberatelyNotFlagged, ...result.briefingViolations]) boundedVerdictText(text, "verdict list item");
  boundedVerdictText(result.trajectoryEvidence, "trajectory evidence");
  return value;
}

export function validateRecordedVerdict(context, { clock = Date.now } = {}) {
  const loaded = loadJournal(context);
  if (loaded.journal.phase !== "verdict-received" || loaded.journal.verdict.status !== "received") {
    fail("F3-TRANSITION", "verdict can be validated only after verdict-received");
  }
  const raw = context.persistence.read(loaded.paths.verdict);
  let value;
  try { value = JSON.parse(raw.toString("utf8")); } catch (error) {
    return { valid: false, code: "F3-VERDICT-SCHEMA", errors: [error.message] };
  }
  try { validateVerdictValue(value, loaded.journal.request); } catch (error) {
    if (error instanceof IsolatedCriticContractError) return { valid: false, code: error.code, errors: [error.message, ...error.details] };
    throw error;
  }
  const at = clock();
  const persisted = mutateJournal(context, (journal) => {
    appendEvent(journal, "validated", { verdictSha256: journal.verdict.rawSha256, reviewPass: value.result.pass }, at);
    journal.verdict.status = "validated";
    journal.verdict.reviewPass = value.result.pass;
    return { reviewPass: value.result.pass };
  }, () => at);
  return { valid: true, reviewPass: value.result.pass, journal: persisted.journal };
}

function observedIdentityMatches(expected, observed) {
  return observed && expected.hostBootId === observed.hostBootId && expected.pid === observed.pid
    && expected.processStartId === observed.processStartId && expected.pgid === observed.pgid
    && expected.coordinatorNonce === observed.coordinatorNonce;
}

export function decideCleanup(expected, observed, attemptResult = null) {
  exactKeys(observed, ["running", "hostBootId", "pid", "processStartId", "pgid", "coordinatorNonce"], "process observation");
  if (typeof observed.running !== "boolean" || !Number.isSafeInteger(observed.pid) || observed.pid < 1
    || !Number.isSafeInteger(observed.pgid) || observed.pgid < 1 || !HEX32.test(observed.coordinatorNonce)) {
    fail("F3-PROCESS", "process observation identity is invalid");
  }
  boundedString(observed.hostBootId, "observed host boot ID", 160);
  boundedString(observed.processStartId, "observed process start ID", 160);
  const ownershipMatched = observedIdentityMatches(expected, observed);
  if (!observed.running) return { status: "not-needed", ownershipMatched };
  if (!ownershipMatched) return { status: "refused-not-owned", ownershipMatched: false };
  if (attemptResult === "complete") return { status: "attempted-complete", ownershipMatched: true };
  if (attemptResult === "failed") return { status: "attempted-failed", ownershipMatched: true };
  fail("F3-CLEANUP-RESULT", "an owned running process requires an injected complete|failed cleanup observation");
}

export function recordCleanup(context, processObservation, attemptResult = null, { clock = Date.now } = {}) {
  const at = clock();
  return mutateJournal(context, (journal) => {
    if (journal.cleanup !== null) {
      const decision = decideCleanup(journal.request.process, processObservation, attemptResult);
      return decision.status === journal.cleanup.status && decision.ownershipMatched === journal.cleanup.ownershipMatched
        ? { noMutation: true, cleanup: journal.cleanup }
        : fail("F3-REPLAY-CONFLICT", "cleanup is already recorded differently");
    }
    const decision = decideCleanup(journal.request.process, processObservation, attemptResult);
    const cleanup = { ...decision, preCleanupPhase: journal.phase };
    appendEvent(journal, "cleanup", cleanup, at);
    journal.cleanup = cleanup;
    return { cleanup };
  }, () => at);
}

export function recordTerminal(context, requestedCode, { clock = Date.now } = {}) {
  if (!TERMINAL_CODES.includes(requestedCode)) fail("F3-TERMINAL", "terminal code is not closed");
  const at = clock();
  return mutateJournal(context, (journal) => {
    const cleanupFailed = new Set(["attempted-failed", "refused-not-owned"]).has(journal.cleanup?.status);
    const effectiveCode = cleanupFailed ? "coordinator-cleanup" : requestedCode;
    if (journal.terminal !== null) {
      if (journal.terminal.code === effectiveCode) return { noMutation: true, terminalCode: effectiveCode };
      fail("F3-REPLAY-CONFLICT", "terminal result is already recorded differently");
    }
    if (journal.phase !== "cleanup") fail("F3-TRANSITION", "mandatory cleanup must precede terminal result");
    const preCleanup = journal.cleanup.preCleanupPhase;
    if (effectiveCode === "verdict-success" && (preCleanup !== "validated" || journal.verdict.status !== "validated")) {
      fail("F3-TERMINAL", "verdict-success requires a validated verdict");
    }
    if (effectiveCode === "verdict-schema-error" && preCleanup !== "verdict-received") {
      fail("F3-TERMINAL", "verdict-schema-error is legal only after verdict-received");
    }
    appendEvent(journal, "complete", { terminalCode: effectiveCode }, at);
    journal.terminal = { code: effectiveCode };
    return { terminalCode: effectiveCode };
  }, () => at);
}

export function recoveryDecision(context) {
  const loaded = loadJournal(context);
  const verdictBytesObserved = context.persistence.exists(loaded.paths.verdict) || loaded.journal.verdict.status !== "absent";
  return {
    terminal: loaded.journal.terminal?.code ?? null,
    verdictBytesObserved,
    mayStartModel: !verdictBytesObserved && loaded.journal.phase === "prepared",
    action: loaded.journal.terminal ? "accept-terminal"
      : verdictBytesObserved ? "validate-existing-output-once"
        : loaded.journal.phase === "prepared" ? "start-once" : "recover-without-repeat",
  };
}

export function validateClaims(claims) {
  exactKeys(claims, ["schema", ...CLAIM_NAMES], "F1 claim vector");
  if (claims.schema !== CLAIMS_SCHEMA) fail("F3-CLAIMS", "claim vector schema is invalid");
  for (const name of CLAIM_NAMES) {
    const claim = claims[name];
    exactKeys(claim, ["state", "evidence"], `claim ${name}`);
    if (!CLAIM_STATES.has(claim.state) || !Array.isArray(claim.evidence) || claim.evidence.length > 32) {
      fail("F3-CLAIMS", `claim ${name} is invalid`);
    }
    if ((claim.state === "not-proven") !== (claim.evidence.length === 0)) {
      fail("F3-CLAIMS", `claim ${name} evidence does not match state`);
    }
    const tuples = new Set();
    for (const evidence of claim.evidence) {
      exactKeys(evidence, ["kind", "locator", "rawSha256"], `claim ${name} evidence`);
      if (!CLAIM_EVIDENCE_KINDS.has(evidence.kind) || !CLAIM_LOCATOR.test(evidence.locator)
        || !SHA256.test(evidence.rawSha256)) fail("F3-CLAIMS", `claim ${name} evidence tuple is invalid`);
      const tuple = `${evidence.kind}\0${evidence.locator}\0${evidence.rawSha256}`;
      if (tuples.has(tuple)) fail("F3-CLAIMS", `claim ${name} evidence is duplicated`);
      tuples.add(tuple);
    }
    if (claim.state === "proven" && !claim.evidence.some((evidence) => evidence.kind === REQUIRED_PROOF_KIND[name])) {
      fail("F3-CLAIMS", `claim ${name} lacks its required proof kind`);
    }
  }
  return claims;
}

export function buildReceipt(context, claims, { clock = Date.now } = {}) {
  validateClaims(claims);
  const loaded = loadJournal(context);
  const journal = loaded.journal;
  if (journal.phase !== "complete" || !journal.terminal || !journal.cleanup) fail("F3-RECEIPT", "terminal journal is required before receipt");
  const emittedAtMs = clock();
  if (!Number.isSafeInteger(emittedAtMs) || emittedAtMs < journal.events.at(-1).observedAtMs) {
    fail("F3-TIME", "receipt emission time precedes terminal state");
  }
  const receipt = {
    schema: RECEIPT_SCHEMA,
    dispatchNonce: journal.request.dispatchNonce,
    attemptNonce: journal.request.attemptNonce,
    candidate: structuredClone(journal.request.candidate),
    cli: structuredClone(journal.request.cli),
    platform: structuredClone(journal.request.platform),
    profile: structuredClone(journal.request.permissionProfile),
    inputSetSha256: journal.request.inputSetSha256,
    preflight: structuredClone(journal.request.preflight),
    eventChainSha256: journal.events.at(-1).eventHash,
    verdictSha256: journal.verdict.rawSha256,
    durationMs: journal.events.at(-1).observedAtMs - journal.events[0].observedAtMs,
    cleanup: { status: journal.cleanup.status, ownershipMatched: journal.cleanup.ownershipMatched },
    terminalCode: journal.terminal.code,
    reviewPass: journal.terminal.code === "verdict-success" && journal.verdict.reviewPass === true,
    claims: structuredClone(claims),
    emittedAtMs,
  };
  validateReceipt(receipt);
  return receipt;
}

export function validateReceipt(receipt) {
  validateLite(receipt, SCHEMAS.receipt, "receipt");
  if (!HEX32.test(receipt.dispatchNonce) || !HEX32.test(receipt.attemptNonce)
    || !OID.test(receipt.candidate.commit) || !OID.test(receipt.candidate.tree) || !SHA256.test(receipt.candidate.diffSha256)
    || !SAFE_ID.test(receipt.profile.id) || !SHA256.test(receipt.profile.rawSha256) || !SHA256.test(receipt.inputSetSha256)
    || receipt.preflight.schema !== "pipeline.codex-sandbox-preflight.v1"
    || !SHA256.test(receipt.preflight.rawSha256) || !SHA256.test(receipt.eventChainSha256)
    || (receipt.verdictSha256 !== null && !SHA256.test(receipt.verdictSha256))
    || !TERMINAL_CODES.includes(receipt.terminalCode) || !CLEANUP_STATUSES.includes(receipt.cleanup.status)
    || typeof receipt.cleanup.ownershipMatched !== "boolean" || typeof receipt.reviewPass !== "boolean"
    || !Number.isSafeInteger(receipt.durationMs) || receipt.durationMs < 0 || !Number.isSafeInteger(receipt.emittedAtMs)) {
    fail("F3-RECEIPT", "receipt contains an invalid binding");
  }
  boundedString(receipt.cli.version, "receipt CLI version", 80);
  boundedString(receipt.cli.compatibilityClass, "receipt CLI compatibility class", 80);
  boundedString(receipt.platform.kernelClass, "receipt kernel class", 120);
  if (receipt.platform.os !== "linux" || !new Set(["native-linux", "wsl-native", "drvfs"]).has(receipt.platform.filesystemClass)) {
    fail("F3-RECEIPT", "receipt platform class is invalid");
  }
  validateClaims(receipt.claims);
  if (receipt.terminalCode !== "verdict-success" && receipt.reviewPass) fail("F3-RECEIPT", "non-success terminal cannot report review pass");
  const forbiddenKey = /^(?:account|support.?case|credential|remote|rawPrompt|rawOutput|rawError)$/i;
  const forbiddenString = /(?:\baccount\b|support[\s._-]*case|\bcredential\b|\bremote\b)/i;
  const pending = [receipt];
  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current === "string") {
      if (/^(?:[A-Za-z]:[\\/]|\/)/.test(current) || forbiddenString.test(current)) {
        fail("F3-RECEIPT-SANITIZATION", "receipt contains a private path, account, support, credential or remote value");
      }
    } else if (Array.isArray(current)) pending.push(...current);
    else if (current && typeof current === "object") {
      for (const [key, value] of Object.entries(current)) {
        if (forbiddenKey.test(key)) fail("F3-RECEIPT-SANITIZATION", "receipt contains a forbidden raw/private field");
        pending.push(value);
      }
    }
  }
  return receipt;
}

export function writeReceipt(context, claims, { clock = Date.now } = {}) {
  const paths = contextPaths(context);
  if (context.persistence.exists(paths.receipt)) {
    const raw = context.persistence.read(paths.receipt);
    let existing;
    try { existing = JSON.parse(raw.toString("utf8")); } catch { fail("F3-RECEIPT", "existing receipt JSON is malformed"); }
    validateReceipt(existing);
    const expected = buildReceipt(context, claims, { clock: () => existing.emittedAtMs });
    const expectedBytes = Buffer.from(canonicalJson(expected));
    if (!raw.equals(expectedBytes)) fail("F3-REPLAY-CONFLICT", "receipt already contains different bindings");
    return { receipt: existing, written: false, path: paths.receipt, rawSha256: sha256(raw) };
  }
  const receipt = buildReceipt(context, claims, { clock });
  const bytes = Buffer.from(canonicalJson(receipt));
  artifactWriteIdempotent(context.persistence, paths.receipt, bytes);
  return { receipt, written: true, path: paths.receipt, rawSha256: sha256(bytes) };
}

export function schemaArtifacts() {
  return Object.fromEntries(Object.entries(SCHEMA_PATHS).map(([key, path]) => ({
    key,
    path,
    rawSha256: sha256(readFileSync(path)),
    schema: SCHEMAS[key],
  })).map(({ key, ...value }) => [key, value]));
}
