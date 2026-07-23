#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Default-off F5 journal/decision contract. Route I/O remains caller-injected. */

import { createHash, randomBytes } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export const ACTIVATION_SCHEMA = "pipeline.critic-route-activation.v1";
const SHA256 = /^[0-9a-f]{64}$/;
const SAFE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const EVIDENCE_KEYS = ["preflightSha256", "runnerSha256", "compatibilitySha256", "shadowSha256", "verifySha256", "t1Sha256", "compatibilityEntryId"];

export class ActivationError extends Error { constructor(code, message) { super(message); this.name = "ActivationError"; this.code = code; } }
function fail(code, message) { throw new ActivationError(code, message); }
export function canonicalJson(value) {
  const normalize = (entry) => Array.isArray(entry) ? entry.map(normalize) : entry && typeof entry === "object"
    ? Object.fromEntries(Object.keys(entry).sort().map((key) => [key, normalize(entry[key])])) : entry;
  return `${JSON.stringify(normalize(value), null, 2)}\n`;
}
export function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail("F5-SCHEMA", `${label} is not closed`);
}
function digest(value, label, nullable = false) { if (!(nullable && value === null) && !SHA256.test(value)) fail("F5-DIGEST", `${label} is not SHA-256`); }
function safe(value, label) { if (!SAFE.test(value)) fail("F5-STRING", `${label} is invalid`); }
function safePath(value, label) {
  if (typeof value !== "string" || !value || value.length > 240 || isAbsolute(value) || value.includes("\\") || value.includes("\0")
    || value.split("/").some((part) => !part || part === "." || part === "..")) fail("F5-PATH", `${label} is not a normalized repository-relative path`);
  return value;
}
function eventHash(event) { const { eventHash: ignored, ...unsigned } = event; return sha256(Buffer.from(canonicalJson(unsigned))); }
function append(journal, type, atMs) {
  if (!Number.isSafeInteger(atMs) || atMs < journal.updatedAtMs) fail("F5-TIME", "activation clock moved backwards");
  const event = { sequence: journal.events.length + 1, type, atMs, previousHash: journal.events.length ? journal.events.at(-1).eventHash : null, eventHash: "" };
  event.eventHash = eventHash(event); journal.events.push(event); journal.status = type; journal.revision += 1; journal.updatedAtMs = atMs;
}

export function createActivationJournal(request) {
  exactKeys(request, ["activationId", "mode", "runnerId", "primaryLaneId", "fallbackLaneId", "route", "createdAtMs"], "activation request");
  for (const [name, value] of Object.entries({ activationId: request.activationId, runnerId: request.runnerId, primaryLaneId: request.primaryLaneId, fallbackLaneId: request.fallbackLaneId })) safe(value, name);
  if (!new Set(["intermediate", "strong", "rollback"]).has(request.mode) || !Number.isSafeInteger(request.createdAtMs)) fail("F5-ACTIVATION", "activation mode/time is invalid");
  exactKeys(request.route, ["projectionPath", "preimageSha256", "postimageSha256", "inventory", "inventorySha256"], "route binding");
  safePath(request.route.projectionPath, "route projection path");
  for (const name of ["preimageSha256", "postimageSha256", "inventorySha256"]) digest(request.route[name], name);
  if (!Array.isArray(request.route.inventory) || request.route.inventory.length < 1) fail("F5-ACTIVATION", "route inventory is empty");
  const paths = new Set();
  for (const entry of request.route.inventory) {
    exactKeys(entry, ["path", "preimageSha256", "postimageSha256"], "route inventory entry"); safePath(entry.path, "route inventory path");
    digest(entry.preimageSha256, "inventory preimage"); digest(entry.postimageSha256, "inventory postimage");
    if (paths.has(entry.path)) fail("F5-ACTIVATION", "route inventory contains duplicate paths"); paths.add(entry.path);
  }
  if (!paths.has(request.route.projectionPath) || request.route.inventorySha256 !== sha256(Buffer.from(canonicalJson(request.route.inventory)))) fail("F5-ACTIVATION", "route inventory digest/projection is invalid");
  if (request.route.preimageSha256 === request.route.postimageSha256) fail("F5-ACTIVATION", "route transition must change bytes");
  const journal = {
    schema: ACTIVATION_SCHEMA, activationId: request.activationId, mode: request.mode, status: "prepared", revision: 0,
    runnerId: request.runnerId, primaryLaneId: request.primaryLaneId, fallbackLaneId: request.fallbackLaneId,
    route: structuredClone(request.route), evidence: Object.fromEntries(EVIDENCE_KEYS.map((key) => [key, null])), approval: null,
    events: [], createdAtMs: request.createdAtMs, updatedAtMs: request.createdAtMs,
  };
  append(journal, "prepared", request.createdAtMs); journal.revision = 0;
  return validateActivationJournal(journal);
}

export function bindActivationEvidence(journal, evidence, atMs) {
  validateActivationJournal(journal);
  if (journal.status !== "prepared") fail("F5-TRANSITION", "evidence can only bind prepared activation");
  exactKeys(evidence, EVIDENCE_KEYS, "activation evidence");
  for (const key of EVIDENCE_KEYS.slice(0, -1)) digest(evidence[key], key);
  safe(evidence.compatibilityEntryId, "compatibilityEntryId");
  const next = structuredClone(journal); next.evidence = structuredClone(evidence); append(next, "evidence-bound", atMs); return validateActivationJournal(next);
}

export function approveActivation(journal, approval, atMs) {
  validateActivationJournal(journal);
  if (journal.status !== "evidence-bound") fail("F5-TRANSITION", "PO approval requires bound evidence");
  exactKeys(approval, ["approvalId", "approvedAtMs", "attributedTo"], "approval");
  if (approval.attributedTo !== "PO" || approval.approvedAtMs !== atMs) fail("F5-APPROVAL", "approval must be exact, PO-attributed and contemporaneous");
  safe(approval.approvalId, "approvalId");
  const next = structuredClone(journal); next.approval = structuredClone(approval); append(next, "po-approved", atMs); return validateActivationJournal(next);
}

export function decideRouteApplication(journal, observedRouteSha256) {
  validateActivationJournal(journal); digest(observedRouteSha256, "observed route");
  if (journal.status === "po-approved" && observedRouteSha256 === journal.route.preimageSha256) return { action: "compare-and-replace", expectedSha256: journal.route.preimageSha256, postimageSha256: journal.route.postimageSha256 };
  if (new Set(["po-approved", "applied", "verified"]).has(journal.status) && observedRouteSha256 === journal.route.postimageSha256) return { action: journal.status === "po-approved" ? "record-applied" : "zero-write-replay" };
  return { action: "suspend", reason: "route-drift" };
}

export function recordApplied(journal, observedRouteSha256, atMs) {
  validateActivationJournal(journal);
  if (journal.status !== "po-approved" || observedRouteSha256 !== journal.route.postimageSha256) fail("F5-CAS", "route postimage was not observed after approval");
  const next = structuredClone(journal); append(next, "applied", atMs); return validateActivationJournal(next);
}

export function recordVerified(journal, productionProjection, activationAppliedSha256, atMs) {
  validateActivationJournal(journal); digest(activationAppliedSha256, "activation applied receipt");
  if (journal.status !== "applied" || productionProjection?.state !== `${journal.mode}-production-eligible`
    || productionProjection.activationReceiptSha256 !== activationAppliedSha256 || productionProjection.routePostimageSha256 !== journal.route.postimageSha256) fail("F5-VERIFY", "production projection does not bind the applied activation and route");
  const next = structuredClone(journal); append(next, "verified", atMs); return validateActivationJournal(next);
}

export function suspendActivation(journal, atMs) {
  validateActivationJournal(journal);
  if (journal.status === "suspended") return journal;
  const next = structuredClone(journal); append(next, "suspended", atMs); return validateActivationJournal(next);
}

export function validateActivationJournal(journal) {
  exactKeys(journal, ["schema", "activationId", "mode", "status", "revision", "runnerId", "primaryLaneId", "fallbackLaneId", "route", "evidence", "approval", "events", "createdAtMs", "updatedAtMs"], "activation journal");
  exactKeys(journal.route, ["projectionPath", "preimageSha256", "postimageSha256", "inventory", "inventorySha256"], "route"); exactKeys(journal.evidence, EVIDENCE_KEYS, "evidence");
  if (journal.schema !== ACTIVATION_SCHEMA || !new Set(["intermediate", "strong", "rollback"]).has(journal.mode)
    || !new Set(["prepared", "evidence-bound", "po-approved", "applied", "verified", "suspended"]).has(journal.status)
    || !Number.isSafeInteger(journal.revision) || journal.revision !== journal.events.length - 1 || journal.createdAtMs > journal.updatedAtMs) fail("F5-ACTIVATION", "activation header/revision is invalid");
  safePath(journal.route.projectionPath, "route projection path");
  for (const name of ["preimageSha256", "postimageSha256", "inventorySha256"]) digest(journal.route[name], name);
  if (!Array.isArray(journal.route.inventory) || journal.route.inventory.length < 1
    || journal.route.inventorySha256 !== sha256(Buffer.from(canonicalJson(journal.route.inventory)))) fail("F5-ACTIVATION", "route inventory binding is invalid");
  const inventoryPaths = new Set();
  for (const entry of journal.route.inventory) {
    exactKeys(entry, ["path", "preimageSha256", "postimageSha256"], "route inventory entry"); safePath(entry.path, "route inventory path");
    digest(entry.preimageSha256, "inventory preimage"); digest(entry.postimageSha256, "inventory postimage");
    if (inventoryPaths.has(entry.path)) fail("F5-ACTIVATION", "route inventory path repeats"); inventoryPaths.add(entry.path);
  }
  if (!inventoryPaths.has(journal.route.projectionPath)) fail("F5-ACTIVATION", "route projection is absent from inventory");
  if (!Array.isArray(journal.events) || journal.events.length < 1 || journal.events[0].type !== "prepared" || journal.events.at(-1).type !== journal.status) fail("F5-EVENT", "event chain does not project status");
  for (let index = 0; index < journal.events.length; index += 1) {
    const event = journal.events[index]; exactKeys(event, ["sequence", "type", "atMs", "previousHash", "eventHash"], "activation event");
    if (event.sequence !== index + 1 || event.previousHash !== (index ? journal.events[index - 1].eventHash : null) || event.eventHash !== eventHash(event)
      || index && event.atMs < journal.events[index - 1].atMs) fail("F5-EVENT", "activation event chain is invalid");
    if (index > 0) {
      const prior = journal.events[index - 1].type;
      const allowed = {
        prepared: ["evidence-bound", "suspended"],
        "evidence-bound": ["po-approved", "suspended"],
        "po-approved": ["applied", "suspended"],
        applied: ["verified", "suspended"],
        verified: ["suspended"],
        suspended: [],
      };
      if (!allowed[prior]?.includes(event.type)) fail("F5-TRANSITION", "activation event chain contains an illegal transition");
    }
  }
  const evidenceBound = journal.events.some(({ type }) => type === "evidence-bound");
  for (const key of EVIDENCE_KEYS.slice(0, -1)) digest(journal.evidence[key], key, !evidenceBound);
  if (evidenceBound) safe(journal.evidence.compatibilityEntryId, "compatibilityEntryId"); else if (journal.evidence.compatibilityEntryId !== null) fail("F5-EVIDENCE", "prepared journal already carries evidence");
  const approved = journal.events.some(({ type }) => type === "po-approved");
  if (approved) {
    exactKeys(journal.approval, ["approvalId", "approvedAtMs", "attributedTo"], "approval");
    if (journal.approval.attributedTo !== "PO") fail("F5-APPROVAL", "activation approval is not PO-attributed");
  } else if (journal.approval !== null) fail("F5-APPROVAL", "unapproved journal carries approval");
  return journal;
}

export function evaluateStrongUnblock(input) {
  exactKeys(input, ["cliVersion", "releasedArtifactSha256", "officialReleaseReceiptSha256", "compatibilityPolicySha256", "profileSha256", "schemaSha256", "upstreamIssueReproduces", "nowMs", "receipts"], "strong unblock");
  digest(input.releasedArtifactSha256, "released artifact"); digest(input.officialReleaseReceiptSha256, "official release receipt"); digest(input.compatibilityPolicySha256, "compatibility policy"); digest(input.profileSha256, "profile"); digest(input.schemaSha256, "schema");
  if (input.upstreamIssueReproduces !== false) return { eligible: false, reason: "upstream-still-reproduces" };
  if (!SAFE.test(input.cliVersion) || !Number.isSafeInteger(input.nowMs) || !Array.isArray(input.receipts) || input.receipts.length !== 3) return { eligible: false, reason: "matrix-incomplete" };
  const target = new Set(["native-linux", "drvfs", "wsl-native"]); const seen = new Set();
  for (const receipt of input.receipts) {
    if (!target.has(receipt.filesystemClass) || seen.has(receipt.filesystemClass) || receipt.cliVersion !== input.cliVersion
      || receipt.releasedArtifactSha256 !== input.releasedArtifactSha256 || receipt.officialReleaseReceiptSha256 !== input.officialReleaseReceiptSha256
      || receipt.compatibilityPolicySha256 !== input.compatibilityPolicySha256 || receipt.profileSha256 !== input.profileSha256
      || receipt.schemaSha256 !== input.schemaSha256 || receipt.eligibility !== "strong" || receipt.networkEnabled !== false
      || receipt.bootId !== receipt.runBootId || !Number.isSafeInteger(receipt.observedAtMs) || receipt.observedAtMs > input.nowMs
      || input.nowMs - receipt.observedAtMs > 86_400_000) return { eligible: false, reason: "matrix-mismatch" };
    seen.add(receipt.filesystemClass);
  }
  return { eligible: seen.size === target.size, reason: seen.size === target.size ? "exact-three-target-matrix" : "matrix-incomplete" };
}

function inside(root, path) {
  const rel = relative(root, path);
  return rel === "" || rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
function syncDirectory(path) { const fd = openSync(path, "r"); try { fsyncSync(fd); } finally { closeSync(fd); } }
function ensurePhysicalDirectory(path) {
  let existing = path;
  while (!existsSync(existing)) existing = dirname(existing);
  if (realpathSync(existing) !== resolve(existing)) fail("F5-PERSISTENCE", "activation path crosses a symlink");
  mkdirSync(path, { recursive: true, mode: 0o700 });
  if (realpathSync(path) !== resolve(path) || lstatSync(path).isSymbolicLink()) fail("F5-PERSISTENCE", "activation directory is not physical");
}
function assertPrivate(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0) fail("F5-PERSISTENCE", "activation journal is not a mode-0600 single-link file");
}
function writeExclusive(path, bytes) {
  ensurePhysicalDirectory(dirname(path)); const fd = openSync(path, "wx", 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
  syncDirectory(dirname(path));
}
export const activationFilePersistence = Object.freeze({
  exists: existsSync,
  list(path) { return existsSync(path) ? readdirSync(path) : []; },
  read(path) { assertPrivate(path); return readFileSync(path); },
  create(path, bytes) { writeExclusive(path, bytes); },
  replace(path, expectedSha256, bytes) {
    if (sha256(this.read(path)) !== expectedSha256) fail("F5-CAS", "activation journal changed before replacement");
    const temporary = join(dirname(path), `.journal.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
    writeExclusive(temporary, bytes); renameSync(temporary, path); syncDirectory(dirname(path));
  },
});

export function activationPaths(commonDir, activationId) {
  safe(activationId, "activationId");
  const common = realpathSync(commonDir);
  if (common !== resolve(commonDir) || !lstatSync(common).isDirectory() || lstatSync(common).isSymbolicLink()) fail("F5-PERSISTENCE", "Git common directory must be physical");
  const directory = join(common, "agent-pipeline", "critic-route-activation", activationId);
  if (!inside(common, directory)) fail("F5-PERSISTENCE", "activation directory escaped Git common directory");
  return { directory, journal: join(directory, "journal.json") };
}

export function persistNewActivation(commonDir, journal, persistence = activationFilePersistence) {
  validateActivationJournal(journal); const paths = activationPaths(commonDir, journal.activationId);
  if (persistence.exists(paths.journal)) fail("F5-REPLAY", "activation journal already exists");
  const raw = Buffer.from(canonicalJson(journal)); persistence.create(paths.journal, raw); return { paths, rawSha256: sha256(raw) };
}

export function loadPersistedActivation(commonDir, activationId, persistence = activationFilePersistence) {
  const paths = activationPaths(commonDir, activationId);
  const torn = persistence.list(paths.directory).filter((name) => /^\.journal\..+\.tmp$/.test(name));
  if (torn.length) fail("F5-TORN-POSTIMAGE", "activation directory contains an unresolved temporary postimage");
  const raw = persistence.read(paths.journal); let journal;
  try { journal = JSON.parse(raw.toString("utf8")); } catch { fail("F5-PERSISTENCE", "activation journal is malformed JSON"); }
  validateActivationJournal(journal); return { journal, paths, rawSha256: sha256(raw) };
}

export function replacePersistedActivation(commonDir, expectedRawSha256, next, persistence = activationFilePersistence) {
  validateActivationJournal(next); const current = loadPersistedActivation(commonDir, next.activationId, persistence);
  if (current.rawSha256 !== expectedRawSha256 || next.revision !== current.journal.revision + 1) fail("F5-CAS", "activation replacement is stale or skips a revision");
  const raw = Buffer.from(canonicalJson(next)); persistence.replace(current.paths.journal, current.rawSha256, raw);
  return { paths: current.paths, rawSha256: sha256(raw) };
}
