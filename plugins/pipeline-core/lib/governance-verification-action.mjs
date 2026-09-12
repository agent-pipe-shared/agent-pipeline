// SPDX-License-Identifier: SUL-1.0
/** Runner-neutral projection and create-only artifact boundary for one aggregate terminal Verify fact. */

import { randomBytes } from "node:crypto";
import {
  closeSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync,
  realpathSync, unlinkSync, writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import {
  buildGovernanceActionEvent,
  validateGovernanceActionEvent,
} from "./governance-action-events.mjs";
import { canonicalizeJson } from "./governance-event.mjs";

export const GOVERNANCE_VERIFICATION_TERMINAL_SCHEMA = "pipeline.governance-verification-terminal.v1";
export const GOVERNANCE_VERIFICATION_RETRY_SCHEMA = "pipeline.governance-verification-action-retry.v1";

const SHA256 = /^[a-f0-9]{64}$/u;
const OUTCOMES = Object.freeze({
  passed: Object.freeze({ status: "completed", reasonCode: "VERIFICATION_PASSED" }),
  failed: Object.freeze({ status: "failed", reasonCode: "VERIFICATION_FAILED" }),
  unknown: Object.freeze({ status: "unknown", reasonCode: "VERIFICATION_UNKNOWN" }),
  unavailable: Object.freeze({ status: "unavailable", reasonCode: "VERIFICATION_UNAVAILABLE" }),
});
const SOURCE_KEYS = Object.freeze([
  "schema", "terminalEvidenceSha256", "outcome", "candidate", "featureId", "sessionId",
]);
const RETRY_KEYS = Object.freeze(["schema", "eventOutPath", "event"]);

export class GovernanceVerificationActionError extends Error {
  constructor(code) {
    super("Governance verification action is invalid.");
    this.name = "GovernanceVerificationActionError";
    this.code = code;
  }
}

function fail(code) { throw new GovernanceVerificationActionError(code); }
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) {
  return record(value) && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}
function repoRelativePosixPath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 256 && !value.startsWith("/")
    && !value.includes("\\") && !value.includes("\0")
    && value.split("/").every((component) => component.length > 0 && component !== "." && component !== ".."
      && /^[A-Za-z0-9._-]+$/u.test(component));
}

/**
 * Build exactly one closed action from an aggregate terminal Verify binding.
 * The digest is the source identity; no suite or runner detail is admitted.
 */
export function buildGovernanceVerificationAction(source) {
  if (!exact(source, SOURCE_KEYS) || source.schema !== GOVERNANCE_VERIFICATION_TERMINAL_SCHEMA) fail("GVA-SOURCE-SHAPE");
  if (typeof source.terminalEvidenceSha256 !== "string" || !SHA256.test(source.terminalEvidenceSha256)) fail("GVA-SOURCE-DIGEST");
  const outcome = OUTCOMES[source.outcome];
  if (outcome === undefined) fail("GVA-SOURCE-OUTCOME");
  try {
    return buildGovernanceActionEvent({
      kind: "verification",
      status: outcome.status,
      reasonCode: outcome.reasonCode,
      requestId: source.terminalEvidenceSha256,
      featureId: source.featureId,
      sessionId: source.sessionId,
      candidate: source.candidate,
    });
  } catch { fail("GVA-SOURCE-BINDING"); }
}

/** Closed data sufficient to retry only the observational artifact write. */
export function buildGovernanceVerificationRetry({ eventOutPath, event } = {}) {
  let checked;
  try { checked = validateGovernanceActionEvent(event); } catch { fail("GVA-RETRY-EVENT"); }
  if (checked.kind !== "verification") fail("GVA-RETRY-EVENT");
  if (!repoRelativePosixPath(eventOutPath)) fail("GVA-RETRY-PATH");
  return Object.freeze({ schema: GOVERNANCE_VERIFICATION_RETRY_SCHEMA, eventOutPath, event: checked });
}

export function validateGovernanceVerificationRetry(retry) {
  if (!exact(retry, RETRY_KEYS) || retry.schema !== GOVERNANCE_VERIFICATION_RETRY_SCHEMA) fail("GVA-RETRY-SHAPE");
  return buildGovernanceVerificationRetry({ eventOutPath: retry.eventOutPath, event: retry.event });
}

function physicalDirectory(path) {
  let info;
  try { info = lstatSync(path); } catch { fail("GVA-OUTPUT-PATH"); }
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(path) !== resolve(path)) fail("GVA-OUTPUT-PATH");
}

/** Read-only target preflight. It creates no directory and never removes a leaf. */
export function preflightGovernanceVerificationActionOutput({ rootDir, eventOutPath } = {}) {
  const root = resolve(rootDir);
  physicalDirectory(root);
  if (!repoRelativePosixPath(eventOutPath) || isAbsolute(eventOutPath)) fail("GVA-OUTPUT-PATH");
  const target = resolve(root, eventOutPath);
  const rel = relative(root, target);
  if (target === root || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail("GVA-OUTPUT-PATH");
  let cursor = root;
  const components = rel.split(sep);
  for (let index = 0; index < components.length; index += 1) {
    cursor = resolve(cursor, components[index]);
    let info;
    try { info = lstatSync(cursor); } catch (error) {
      if (error?.code === "ENOENT") break;
      fail("GVA-OUTPUT-PATH");
    }
    if (index === components.length - 1) fail("GVA-OUTPUT-EXISTS");
    if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(cursor) !== cursor) fail("GVA-OUTPUT-PATH");
  }
  return Object.freeze({ root, target, eventOutPath: rel.split(sep).join("/") });
}

function ensurePhysicalParents(root, target) {
  let cursor = root;
  for (const component of relative(root, dirname(target)).split(sep).filter(Boolean)) {
    cursor = resolve(cursor, component);
    try { mkdirSync(cursor, { mode: 0o700 }); } catch (error) { if (error?.code !== "EEXIST") fail("GVA-OUTPUT-WRITE"); }
    physicalDirectory(cursor);
  }
}

function identicalExisting(target, event) {
  try {
    const info = lstatSync(target);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || realpathSync(target) !== target) return false;
    const bytes = readFileSync(target, "utf8");
    if (bytes !== eventArtifactBytes(event)) return false;
    const observed = validateGovernanceActionEvent(JSON.parse(bytes));
    return observed.kind === "verification" && canonicalizeJson(observed) === canonicalizeJson(event);
  } catch { return false; }
}

function eventArtifactBytes(event) { return `${JSON.stringify(event, null, 2)}\n`; }

/**
 * Publish one validated payload without replacing an existing path. An
 * event-only retry may accept an already-published byte-equivalent payload.
 */
export function writeGovernanceVerificationAction({ rootDir, eventOutPath, event, allowExistingIdentical = false } = {}) {
  let checked;
  try { checked = validateGovernanceActionEvent(event); } catch { fail("GVA-OUTPUT-EVENT"); }
  if (checked.kind !== "verification") fail("GVA-OUTPUT-EVENT");
  let plan;
  try { plan = preflightGovernanceVerificationActionOutput({ rootDir, eventOutPath }); }
  catch (error) {
    if (allowExistingIdentical && error?.code === "GVA-OUTPUT-EXISTS") {
      const root = resolve(rootDir);
      const target = resolve(root, eventOutPath);
      if (identicalExisting(target, checked)) return Object.freeze({ status: "existing-identical", outPath: target, event: checked });
    }
    throw error;
  }
  ensurePhysicalParents(plan.root, plan.target);
  // Recheck after directory creation so a replaced component or newly-created
  // leaf loses the race without being followed or overwritten.
  try { preflightGovernanceVerificationActionOutput({ rootDir: plan.root, eventOutPath: plan.eventOutPath }); }
  catch (error) {
    if (allowExistingIdentical && error?.code === "GVA-OUTPUT-EXISTS" && identicalExisting(plan.target, checked)) {
      return Object.freeze({ status: "existing-identical", outPath: plan.target, event: checked });
    }
    throw error;
  }
  const temporary = resolve(dirname(plan.target), `.${randomBytes(16).toString("hex")}.governance-verification.tmp`);
  let fd;
  try {
    fd = openSync(temporary, "wx", 0o600);
    writeFileSync(fd, eventArtifactBytes(checked));
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    linkSync(temporary, plan.target);
    unlinkSync(temporary);
    const directoryFd = openSync(dirname(plan.target), "r");
    try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
  } catch (error) {
    if (fd !== undefined) { try { closeSync(fd); } catch { /* preserve primary error */ } }
    try { unlinkSync(temporary); } catch { /* absent or retained only until cleanup */ }
    if (allowExistingIdentical && identicalExisting(plan.target, checked)) {
      return Object.freeze({ status: "existing-identical", outPath: plan.target, event: checked });
    }
    fail("GVA-OUTPUT-WRITE");
  }
  if (!identicalExisting(plan.target, checked)) fail("GVA-OUTPUT-READBACK");
  return Object.freeze({ status: "written", outPath: plan.target, event: checked });
}

export function retryGovernanceVerificationAction({ rootDir, retry } = {}) {
  const checked = validateGovernanceVerificationRetry(retry);
  return writeGovernanceVerificationAction({
    rootDir,
    eventOutPath: checked.eventOutPath,
    event: checked.event,
    allowExistingIdentical: true,
  });
}
