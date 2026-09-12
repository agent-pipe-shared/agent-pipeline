// SPDX-License-Identifier: SUL-1.0
/** Physical create-only artifact boundary shared by governance action producers. */

import { randomBytes } from "node:crypto";
import {
  closeSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync,
  realpathSync, unlinkSync, writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { validateGovernanceActionEvent } from "./governance-action-events.mjs";
import { canonicalizeJson } from "./governance-event.mjs";

export const GOVERNANCE_ACTION_ARTIFACT_RETRY_SCHEMA = "pipeline.governance-action-artifact-retry.v1";

const RETRY_KEYS = Object.freeze(["schema", "eventOutPath", "event"]);

export class GovernanceActionArtifactError extends Error {
  constructor(code) {
    super("Governance action artifact is invalid.");
    this.name = "GovernanceActionArtifactError";
    this.code = code;
  }
}

function fail(code) { throw new GovernanceActionArtifactError(code); }
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
function checkedEvent(event) {
  try { return validateGovernanceActionEvent(event); } catch { fail("GAA-EVENT"); }
}

/** Closed data sufficient to retry only the observational artifact write. */
export function buildGovernanceActionArtifactRetry({ eventOutPath, event } = {}) {
  const checked = checkedEvent(event);
  if (!repoRelativePosixPath(eventOutPath)) fail("GAA-RETRY-PATH");
  return Object.freeze({ schema: GOVERNANCE_ACTION_ARTIFACT_RETRY_SCHEMA, eventOutPath, event: checked });
}

export function validateGovernanceActionArtifactRetry(retry) {
  if (!exact(retry, RETRY_KEYS) || retry.schema !== GOVERNANCE_ACTION_ARTIFACT_RETRY_SCHEMA) fail("GAA-RETRY-SHAPE");
  return buildGovernanceActionArtifactRetry({ eventOutPath: retry.eventOutPath, event: retry.event });
}

function physicalDirectory(path) {
  let info;
  try { info = lstatSync(path); } catch { fail("GAA-OUTPUT-PATH"); }
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(path) !== resolve(path)) fail("GAA-OUTPUT-PATH");
}

/** Read-only target preflight. It creates no directory and never removes a leaf. */
export function preflightGovernanceActionOutput({ rootDir, eventOutPath } = {}) {
  if (typeof rootDir !== "string" || rootDir.length === 0) fail("GAA-OUTPUT-PATH");
  const root = resolve(rootDir);
  physicalDirectory(root);
  if (!repoRelativePosixPath(eventOutPath) || isAbsolute(eventOutPath)) fail("GAA-OUTPUT-PATH");
  const target = resolve(root, eventOutPath);
  const rel = relative(root, target);
  if (target === root || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail("GAA-OUTPUT-PATH");
  let cursor = root;
  const components = rel.split(sep);
  for (let index = 0; index < components.length; index += 1) {
    cursor = resolve(cursor, components[index]);
    let info;
    try { info = lstatSync(cursor); } catch (error) {
      if (error?.code === "ENOENT") break;
      fail("GAA-OUTPUT-PATH");
    }
    if (index === components.length - 1) fail("GAA-OUTPUT-EXISTS");
    if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(cursor) !== cursor) fail("GAA-OUTPUT-PATH");
  }
  return Object.freeze({ root, target, eventOutPath: rel.split(sep).join("/") });
}

function ensurePhysicalParents(root, target) {
  let cursor = root;
  for (const component of relative(root, dirname(target)).split(sep).filter(Boolean)) {
    cursor = resolve(cursor, component);
    try { mkdirSync(cursor, { mode: 0o700 }); } catch (error) { if (error?.code !== "EEXIST") fail("GAA-OUTPUT-WRITE"); }
    physicalDirectory(cursor);
  }
}

function artifactBytes(event) { return `${JSON.stringify(event, null, 2)}\n`; }
function identicalExisting(target, event) {
  try {
    const info = lstatSync(target);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || realpathSync(target) !== target) return false;
    const bytes = readFileSync(target, "utf8");
    if (bytes !== artifactBytes(event)) return false;
    const observed = validateGovernanceActionEvent(JSON.parse(bytes));
    return canonicalizeJson(observed) === canonicalizeJson(event);
  } catch { return false; }
}

/** Publish one validated payload without replacing any existing path. */
export function writeGovernanceActionArtifact({ rootDir, eventOutPath, event, allowExistingIdentical = false } = {}) {
  const checked = checkedEvent(event);
  let plan;
  try { plan = preflightGovernanceActionOutput({ rootDir, eventOutPath }); }
  catch (error) {
    if (allowExistingIdentical && error?.code === "GAA-OUTPUT-EXISTS" && typeof rootDir === "string") {
      const root = resolve(rootDir);
      const target = resolve(root, eventOutPath);
      if (identicalExisting(target, checked)) return Object.freeze({ status: "existing-identical", outPath: target, event: checked });
    }
    throw error;
  }
  ensurePhysicalParents(plan.root, plan.target);
  // Recheck after parent creation so replaced components and new leaves lose
  // the race before any bytes are published to the requested path.
  try { preflightGovernanceActionOutput({ rootDir: plan.root, eventOutPath: plan.eventOutPath }); }
  catch (error) {
    if (allowExistingIdentical && error?.code === "GAA-OUTPUT-EXISTS" && identicalExisting(plan.target, checked)) {
      return Object.freeze({ status: "existing-identical", outPath: plan.target, event: checked });
    }
    throw error;
  }
  const temporary = resolve(dirname(plan.target), `.${randomBytes(16).toString("hex")}.governance-action.tmp`);
  let fd;
  try {
    fd = openSync(temporary, "wx", 0o600);
    writeFileSync(fd, artifactBytes(checked));
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    linkSync(temporary, plan.target);
    unlinkSync(temporary);
    const directoryFd = openSync(dirname(plan.target), "r");
    try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
  } catch {
    if (fd !== undefined) { try { closeSync(fd); } catch { /* preserve primary failure */ } }
    try { unlinkSync(temporary); } catch { /* absent or retained only until cleanup */ }
    if (allowExistingIdentical && identicalExisting(plan.target, checked)) {
      return Object.freeze({ status: "existing-identical", outPath: plan.target, event: checked });
    }
    fail("GAA-OUTPUT-WRITE");
  }
  if (!identicalExisting(plan.target, checked)) fail("GAA-OUTPUT-READBACK");
  return Object.freeze({ status: "written", outPath: plan.target, event: checked });
}

export function retryGovernanceActionArtifact({ rootDir, retry } = {}) {
  const checked = validateGovernanceActionArtifactRetry(retry);
  return writeGovernanceActionArtifact({
    rootDir,
    eventOutPath: checked.eventOutPath,
    event: checked.event,
    allowExistingIdentical: true,
  });
}
