#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Closed Pipeline distribution-channel selection and its sole portable
 * per-repository writer. Distribution source selection and Git authority do
 * not cross this boundary.
 */
import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  NEUTRAL_CALIBRATION,
  readProjectAuthority,
} from "../lib/project-authority.mjs";

export const PIPELINE_UPDATE_CHANNELS = Object.freeze(["alpha", "beta", "stable"]);
export const PIPELINE_UPDATE_CHANNEL_PLAN_SCHEMA =
  "pipeline.pipeline-update-channel-plan.v1";
export const PIPELINE_UPDATE_ALPHA_REF_PLAN_SCHEMA =
  "pipeline.pipeline-update-alpha-ref-plan.v1";

const SHA256 = /^[a-f0-9]{64}$/u;
const TOPOLOGIES = new Set(["local-self-development", "installed-consumer"]);
const SCRIPT_PATH = fileURLToPath(import.meta.url);

function filesystem(deps = {}) {
  return {
    close: deps.close ?? closeSync,
    constants: deps.constants ?? constants,
    fchmod: deps.fchmod ?? fchmodSync,
    fstat: deps.fstat ?? fstatSync,
    fsync: deps.fsync ?? fsyncSync,
    lstat: deps.lstat ?? lstatSync,
    open: deps.open ?? openSync,
    read: deps.read ?? readFileSync,
    realpath: deps.realpath ?? realpathSync,
    rename: deps.rename ?? renameSync,
    unlink: deps.unlink ?? unlinkSync,
    write: deps.write ?? writeFileSync,
  };
}

function identity(info) {
  return info && info.isFile() && !info.isSymbolicLink() && info.nlink === 1
    ? {
      dev: String(info.dev),
      ino: String(info.ino),
      mode: info.mode & 0o777,
      size: info.size,
      mtimeMs: info.mtimeMs,
      ctimeMs: info.ctimeMs,
    }
    : null;
}

function sameObject(left, right) {
  return left !== null && right !== null
    && left.dev === right.dev
    && left.ino === right.ino;
}

function sameEvidence(left, right) {
  return sameObject(left, right)
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

function physicalDirectoryIdentity(path, fs) {
  const info = fs.lstat(path);
  return info.isDirectory() && !info.isSymbolicLink() && fs.realpath(path) === path
    ? { dev: String(info.dev), ino: String(info.ino) }
    : null;
}

function syncDirectory(path, fs) {
  let fd;
  try {
    fd = fs.open(path, fs.constants.O_RDONLY);
    fs.fsync(fd);
    return { ok: true, supported: true };
  } catch (error) {
    if (process.platform === "win32"
      && ["EPERM", "EINVAL", "EISDIR", "EACCES", "ENOTSUP"].includes(error?.code)) {
      return { ok: true, supported: false };
    }
    return { ok: false, supported: true };
  } finally {
    if (fd !== undefined) {
      try { fs.close(fd); } catch { /* the caller receives the sync disposition */ }
    }
  }
}

function unlinkOwned(path, expected, fs) {
  try {
    const current = identity(fs.lstat(path));
    if (!sameObject(expected, current)) return false;
    fs.unlink(path);
    return true;
  } catch {
    return false;
  }
}

function unsafePhysicalFile(reason) {
  const error = new Error(reason);
  error.code = "PIPELINE_UNSAFE_FILE";
  return error;
}

function readPhysicalFile(path, fs) {
  if (!physicalDirectoryIdentity(dirname(path), fs)) throw unsafePhysicalFile("unsafe-parent");
  let fd;
  try {
    fd = fs.open(path, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    const descriptorBefore = identity(fs.fstat(fd));
    const pathBefore = identity(fs.lstat(path));
    if (!sameObject(descriptorBefore, pathBefore)) throw unsafePhysicalFile("unsafe-file");
    const bytes = fs.read(fd);
    const descriptorAfter = identity(fs.fstat(fd));
    const pathAfter = identity(fs.lstat(path));
    if (!sameEvidence(descriptorBefore, descriptorAfter)
      || !sameEvidence(descriptorAfter, pathAfter)) throw unsafePhysicalFile("changed-file");
    return { bytes: Buffer.from(bytes), identity: descriptorAfter };
  } finally {
    if (fd !== undefined) fs.close(fd);
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isPipelineUpdateChannel(value) {
  return typeof value === "string" && PIPELINE_UPDATE_CHANNELS.includes(value);
}

// Defensive subset of `git check-ref-format --branch`, not a reimplementation
// of it: rejects control characters, whitespace, glob/special git ref
// characters, path traversal, the reflog `@{` form, and the `.lock` suffix.
// Good enough to keep a malformed value from ever reaching a `git ls-remote`
// argv, without claiming to be the authority on ref-name validity.
const ALPHA_REF_UNSAFE = /[\x00-\x1F\x7F ~^:?*[\\]/u;

export function isPipelineUpdateAlphaRef(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 255) return false;
  if (ALPHA_REF_UNSAFE.test(value)) return false;
  if (value.startsWith("/") || value.endsWith("/") || value.includes("//")) return false;
  if (value.startsWith(".") || value.endsWith(".") || value.includes("..")) return false;
  if (value.includes("@{")) return false;
  if (value.endsWith(".lock")) return false;
  if (value.startsWith("-")) return false;
  return true;
}

function neutralCalibrationAuthority(repoPath, readAuthority) {
  const root = resolve(repoPath);
  const path = join(root, NEUTRAL_CALIBRATION);
  let authority;
  try {
    authority = readAuthority({ rootDir: root });
  } catch {
    return { status: "unknown", path, reason: "project-authority-unavailable" };
  }
  if (authority.status === "ready" && authority.source === "neutral") {
    if (authority.calibration === NEUTRAL_CALIBRATION) {
      return { status: "ready", path, reason: null };
    }
    if (authority.calibration === null) {
      return { status: "absent", path, reason: "calibration-unavailable" };
    }
    return { status: "unknown", path, reason: "project-authority-unavailable" };
  }
  // Legacy-only and authority-free consumers have no portable override.  The
  // caller may therefore choose the consumer default, but this writer still
  // has no sanctioned mutation target.
  if (authority.status === "missing"
    || (authority.status === "ready" && authority.source === "legacy")) {
    return { status: "absent", path, reason: "calibration-unavailable" };
  }
  return { status: "unknown", path, reason: "project-authority-unavailable" };
}

function readCalibration(repoPath, {
  readProjectAuthority: readAuthority = readProjectAuthority,
  ...deps
} = {}) {
  const fs = filesystem(deps);
  const selected = neutralCalibrationAuthority(repoPath, readAuthority);
  const { path } = selected;
  if (selected.status !== "ready") {
    return {
      status: selected.status,
      path,
      raw: null,
      value: null,
      rawSha256: null,
      reason: selected.reason,
    };
  }
  try {
    const physical = readPhysicalFile(path, fs);
    const raw = physical.bytes.toString("utf8");
    const value = JSON.parse(raw);
    if (!isObject(value)) {
      return { status: "unknown", path, raw: null, value: null, rawSha256: null, reason: "malformed-configuration" };
    }
    const layout = topLevelLayout(raw);
    // Field-agnostic on purpose: readCalibration is shared by both fields'
    // read/plan/apply paths, so it must never gate on one field's value or
    // duplicate-key state -- that is exactly the coupling this function used
    // to carry (a broken pipelineUpdateChannel value or duplicate key used to
    // fail the whole read here, silently refusing an unrelated
    // pipelineUpdateAlphaRef operation with a reason naming the wrong field).
    // Each field's own value validity and duplicate-key check now live next
    // to that field's own readers/planners/appliers (duplicateFieldKey,
    // below), so validation of one field gates only operations on that field.
    return {
      status: "ready",
      path,
      raw,
      value,
      layout,
      identity: physical.identity,
      rawSha256: sha256(raw),
      reason: null,
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        status: "absent",
        path,
        raw: null,
        value: null,
        rawSha256: null,
        reason: "calibration-unavailable",
      };
    }
    if (error?.code === "ELOOP" || error?.code === "PIPELINE_UNSAFE_FILE") {
      return {
        status: "unknown",
        path,
        raw: null,
        value: null,
        rawSha256: null,
        reason: "calibration-unavailable",
      };
    }
    return {
      status: "unknown",
      path,
      raw: null,
      value: null,
      rawSha256: null,
      reason: "malformed-configuration",
    };
  }
}

function skipWhitespace(raw, start) {
  let index = start;
  while (/\s/u.test(raw[index] ?? "")) index += 1;
  return index;
}

function stringEnd(raw, start) {
  let escaped = false;
  for (let index = start + 1; index < raw.length; index += 1) {
    if (escaped) escaped = false;
    else if (raw[index] === "\\") escaped = true;
    else if (raw[index] === "\"") return index + 1;
  }
  throw new Error("unterminated JSON string");
}

function valueEnd(raw, start) {
  if (raw[start] === "\"") return stringEnd(raw, start);
  if (raw[start] === "{" || raw[start] === "[") {
    const opening = raw[start];
    const closing = opening === "{" ? "}" : "]";
    let depth = 0;
    for (let index = start; index < raw.length; index += 1) {
      if (raw[index] === "\"") {
        index = stringEnd(raw, index) - 1;
      } else if (raw[index] === opening) {
        depth += 1;
      } else if (raw[index] === closing) {
        depth -= 1;
        if (depth === 0) return index + 1;
      }
    }
    throw new Error("unterminated JSON value");
  }
  let index = start;
  while (index < raw.length && raw[index] !== "," && raw[index] !== "}") index += 1;
  while (index > start && /\s/u.test(raw[index - 1])) index -= 1;
  return index;
}

function topLevelLayout(raw) {
  let index = skipWhitespace(raw, 0);
  if (raw[index] !== "{") throw new Error("calibration is not an object");
  index = skipWhitespace(raw, index + 1);
  const properties = [];
  while (raw[index] !== "}") {
    if (raw[index] !== "\"") throw new Error("invalid top-level key");
    const keyStart = index;
    const keyEnd = stringEnd(raw, keyStart);
    const key = JSON.parse(raw.slice(keyStart, keyEnd));
    index = skipWhitespace(raw, keyEnd);
    if (raw[index] !== ":") throw new Error("invalid top-level property");
    const start = skipWhitespace(raw, index + 1);
    const end = valueEnd(raw, start);
    properties.push({ key, keyStart, keyEnd, valueStart: start, valueEnd: end });
    index = skipWhitespace(raw, end);
    if (raw[index] === ",") index = skipWhitespace(raw, index + 1);
    else if (raw[index] !== "}") throw new Error("invalid top-level separator");
  }
  return { properties, close: index };
}

// Field-agnostic byte-surgical postimage: replaces or appends exactly one
// top-level `key` without reserializing or reordering anything else. Shared
// by the channel and alpha-ref writers -- the channel wrapper below produces
// byte-identical output to the pre-refactor implementation (verified by the
// unchanged channel-writer test suite), so this is a pure extraction, not a
// behaviour change.
function fieldPostimage(observation, key, value) {
  const raw = observation.raw;
  const jsonKey = JSON.stringify(key);
  const jsonValue = JSON.stringify(value);
  const existing = observation.layout.properties.find((entry) => entry.key === key);
  if (existing) {
    return `${raw.slice(0, existing.valueStart)}${jsonValue}${raw.slice(existing.valueEnd)}`;
  }
  const last = observation.layout.properties.at(-1);
  const newline = raw.includes("\r\n") ? "\r\n" : "\n";
  if (last) {
    const lineStart = raw.lastIndexOf("\n", last.keyStart - 1) + 1;
    const indent = raw.slice(lineStart, last.keyStart);
    const multiline = raw.slice(last.valueEnd, observation.layout.close).includes("\n");
    const addition = multiline
      ? `,${newline}${indent}${jsonKey}: ${jsonValue}`
      : `,${jsonKey}:${jsonValue}`;
    return `${raw.slice(0, last.valueEnd)}${addition}${raw.slice(last.valueEnd)}`;
  }
  const inside = raw.slice(skipWhitespace(raw, 0) + 1, observation.layout.close);
  const addition = inside.includes("\n")
    ? `  ${jsonKey}: ${jsonValue}${newline}`
    : `${jsonKey}:${jsonValue}`;
  return `${raw.slice(0, observation.layout.close)}${addition}${raw.slice(observation.layout.close)}`;
}

function channelPostimage(observation, channel) {
  return fieldPostimage(observation, "pipelineUpdateChannel", channel);
}

function alphaRefPostimage(observation, alphaRef) {
  return fieldPostimage(observation, "pipelineUpdateAlphaRef", alphaRef);
}

// Shared duplicate-top-level-key check, applied symmetrically to both
// fields by their own readers/planners/appliers rather than centrally in
// `readCalibration` (which stays field-agnostic; see the comment there). A
// duplicated key reaches the writer undetected without this check:
// `fieldPostimage` resolves its write target via `.find()` (the FIRST
// occurrence) while `JSON.parse` -- and therefore every value comparison --
// resolves to the LAST occurrence, so the byte edit and the value check
// would silently address two different properties (finding F1, originally
// caught for `pipelineUpdateAlphaRef`; the same failure mode applies
// identically to `pipelineUpdateChannel`).
function duplicateFieldKey(observed, key) {
  return observed.layout.properties.filter((entry) => entry.key === key).length > 1;
}

/** Read back only the closed portable channel field. */
export function readProjectPipelineUpdateChannel(repoPath, deps = {}) {
  const observed = readCalibration(repoPath, deps);
  if (observed.status === "absent") {
    return { status: "absent", updateChannel: null, source: null, reason: null };
  }
  if (observed.status !== "ready") {
    return { status: "unknown", updateChannel: null, source: "project-config", reason: "channel-unavailable" };
  }
  if (duplicateFieldKey(observed, "pipelineUpdateChannel")) {
    return { status: "unknown", updateChannel: null, source: "project-config", reason: "malformed-configuration" };
  }
  if (!Object.hasOwn(observed.value, "pipelineUpdateChannel")) {
    return { status: "absent", updateChannel: null, source: null, reason: null };
  }
  if (!isPipelineUpdateChannel(observed.value.pipelineUpdateChannel)) {
    return { status: "unknown", updateChannel: null, source: "project-config", reason: "invalid-channel" };
  }
  return {
    status: "ready",
    updateChannel: observed.value.pipelineUpdateChannel,
    source: "project-config",
    reason: null,
  };
}

/**
 * Read back the closed portable alpha-ref field (ADR-0078 D3). Same
 * read/validate/default shape as `readProjectPipelineUpdateChannel`: only
 * this persisted project field may name the branch alpha follows -- no
 * caller-provided ref is ever accepted here or downstream.
 */
export function readProjectPipelineUpdateAlphaRef(repoPath, deps = {}) {
  const observed = readCalibration(repoPath, deps);
  if (observed.status === "absent") {
    return { status: "absent", alphaRef: null, source: null, reason: null };
  }
  if (observed.status !== "ready") {
    return { status: "unknown", alphaRef: null, source: "project-config", reason: "channel-unavailable" };
  }
  if (duplicateFieldKey(observed, "pipelineUpdateAlphaRef")) {
    return { status: "unknown", alphaRef: null, source: "project-config", reason: "malformed-configuration" };
  }
  if (!Object.hasOwn(observed.value, "pipelineUpdateAlphaRef")) {
    return { status: "absent", alphaRef: null, source: null, reason: null };
  }
  const raw = observed.value.pipelineUpdateAlphaRef;
  if (!isPipelineUpdateAlphaRef(raw)) {
    return { status: "unknown", alphaRef: null, source: "project-config", reason: "invalid-alpha-ref" };
  }
  return { status: "ready", alphaRef: raw, source: "project-config", reason: null };
}

function trustedTopology({ distributionTopology, selfApplication }) {
  if (distributionTopology !== undefined) {
    return TOPOLOGIES.has(distributionTopology) ? distributionTopology : null;
  }
  // Only explicit lifecycle/project authority may establish self-application.
  // The loaded host selector (including local development) is irrelevant.
  return selfApplication === true ? "local-self-development" : "installed-consumer";
}

/**
 * Resolve project override or the trusted per-project default. `alphaRef`
 * (ADR-0078 D3) is carried alongside the channel string regardless of which
 * channel is actually selected -- it is only consumed by the resolver when
 * the selected channel is `alpha`, so a malformed or absent alpha-ref field
 * never blocks resolving `beta` or `stable`.
 */
export function resolvePipelineUpdateChannel(options = {}) {
  const projectConfig = options.projectConfig;
  const alphaRefConfig = options.alphaRefConfig;
  const alphaRef = alphaRefConfig?.status === "ready" ? alphaRefConfig.alphaRef : null;
  // Carry the DISTINCT reason `readProjectPipelineUpdateAlphaRef` already
  // computed (`channel-unavailable` for an unreadable calibration -- a
  // transient/environmental failure that invites a retry -- versus
  // `malformed-configuration`/`invalid-alpha-ref` for a persistent,
  // operator-fixable value) through to the caller, rather than collapsing
  // all three into one boolean. A collapsed boolean is exactly what let a
  // config typo get reported as transient in the first place: the resolver
  // discarded the very reason it had just computed.
  const alphaRefReason = alphaRefConfig?.status === "unknown" ? alphaRefConfig.reason : null;
  if (projectConfig?.status === "unknown") {
    return { status: "unknown", channel: null, source: "project-config", topology: null, alphaRef, alphaRefReason, reason: "channel-unavailable" };
  }
  if (projectConfig?.status === "ready") {
    return isPipelineUpdateChannel(projectConfig.updateChannel)
      ? { status: "ready", channel: projectConfig.updateChannel, source: "project-config", topology: null, alphaRef, alphaRefReason, reason: null }
      : { status: "unknown", channel: null, source: "project-config", topology: null, alphaRef, alphaRefReason, reason: "channel-unavailable" };
  }
  const topology = trustedTopology(options);
  if (!topology) {
    return { status: "unknown", channel: null, source: null, topology: null, alphaRef, alphaRefReason, reason: "channel-unavailable" };
  }
  return {
    status: "ready",
    channel: topology === "local-self-development" ? "alpha" : "stable",
    source: "distribution-default",
    topology,
    alphaRef,
    alphaRefReason,
    reason: null,
  };
}

function planBinding(repoPath, channel, preimageSha256, postimageSha256) {
  return {
    schema: PIPELINE_UPDATE_CHANNEL_PLAN_SCHEMA,
    repo: resolve(repoPath),
    calibrationPath: NEUTRAL_CALIBRATION,
    channel,
    preimageSha256,
    postimageSha256,
  };
}

function alphaRefPlanBinding(repoPath, alphaRef, preimageSha256, postimageSha256) {
  return {
    schema: PIPELINE_UPDATE_ALPHA_REF_PLAN_SCHEMA,
    repo: resolve(repoPath),
    calibrationPath: NEUTRAL_CALIBRATION,
    alphaRef,
    preimageSha256,
    postimageSha256,
  };
}

export function planPipelineUpdateChannel(repoPath, channel, deps = {}) {
  if (!isPipelineUpdateChannel(channel)) {
    return { schema: PIPELINE_UPDATE_CHANNEL_PLAN_SCHEMA, status: "unknown", reason: "invalid-channel" };
  }
  const observed = readCalibration(repoPath, deps);
  if (observed.status !== "ready") {
    return { schema: PIPELINE_UPDATE_CHANNEL_PLAN_SCHEMA, status: "unknown", reason: observed.reason };
  }
  // Mirrors planPipelineUpdateAlphaRef's own field-local guards (finding F1,
  // decoupled here): checked unconditionally, before any digest comparison,
  // so a caller cannot plan against a duplicated or already-invalid channel
  // key even with a correctly-computed target channel. Symmetric with the
  // alpha-ref path -- and, unlike the alpha-ref path, deliberately still
  // blocks THIS field's own plan (an invalid existing channel value staying
  // a channel-operation refusal is the one coupling worth keeping).
  if (duplicateFieldKey(observed, "pipelineUpdateChannel")) {
    return { schema: PIPELINE_UPDATE_CHANNEL_PLAN_SCHEMA, status: "unknown", reason: "malformed-configuration" };
  }
  if (Object.hasOwn(observed.value, "pipelineUpdateChannel")
    && !isPipelineUpdateChannel(observed.value.pipelineUpdateChannel)) {
    return { schema: PIPELINE_UPDATE_CHANNEL_PLAN_SCHEMA, status: "unknown", reason: "invalid-channel" };
  }
  const postimage = channelPostimage(observed, channel);
  const binding = planBinding(repoPath, channel, observed.rawSha256, sha256(postimage));
  const planSha256 = sha256(canonicalJson(binding));
  const current = observed.raw === postimage;
  return {
    ...binding,
    status: current ? "current" : "ready",
    planSha256,
    applyAction: {
      kind: "command",
      executable: "node",
      mutation: !current,
      requiresConfirmation: !current,
      executionBoundary: "host-authorized-wsl",
      argv: [
        SCRIPT_PATH, "apply", "--repo", binding.repo, "--channel", channel,
        "--expected-calibration-sha256", binding.preimageSha256,
        "--expected-postimage-sha256", binding.postimageSha256,
        "--plan-sha256", planSha256, "--activate",
      ],
      expected: {
        schema: PIPELINE_UPDATE_CHANNEL_PLAN_SCHEMA,
        statuses: current ? ["replayed"] : ["applied", "replayed"],
      },
    },
  };
}

/**
 * Plan/apply pair for the alpha-ref field (ADR-0078 D3), mirroring
 * `planPipelineUpdateChannel`/`applyPipelineUpdateChannel` exactly: same
 * digest binding, same drift/forgery refusal, same shared transaction
 * (`atomicReplaceCalibration`, the writer lock pair, `readCalibration`).
 * Only the postimage and plan binding are field-specific.
 */
export function planPipelineUpdateAlphaRef(repoPath, alphaRef, deps = {}) {
  if (!isPipelineUpdateAlphaRef(alphaRef)) {
    return { schema: PIPELINE_UPDATE_ALPHA_REF_PLAN_SCHEMA, status: "unknown", reason: "invalid-alpha-ref" };
  }
  const observed = readCalibration(repoPath, deps);
  if (observed.status !== "ready") {
    return { schema: PIPELINE_UPDATE_ALPHA_REF_PLAN_SCHEMA, status: "unknown", reason: observed.reason };
  }
  if (duplicateFieldKey(observed, "pipelineUpdateAlphaRef")) {
    return { schema: PIPELINE_UPDATE_ALPHA_REF_PLAN_SCHEMA, status: "unknown", reason: "malformed-configuration" };
  }
  const postimage = alphaRefPostimage(observed, alphaRef);
  const binding = alphaRefPlanBinding(repoPath, alphaRef, observed.rawSha256, sha256(postimage));
  const planSha256 = sha256(canonicalJson(binding));
  const current = observed.raw === postimage;
  return {
    ...binding,
    status: current ? "current" : "ready",
    planSha256,
    applyAction: {
      kind: "command",
      executable: "node",
      mutation: !current,
      requiresConfirmation: !current,
      executionBoundary: "host-authorized-wsl",
      argv: [
        SCRIPT_PATH, "apply", "--repo", binding.repo, "--alpha-ref", alphaRef,
        "--expected-calibration-sha256", binding.preimageSha256,
        "--expected-postimage-sha256", binding.postimageSha256,
        "--plan-sha256", planSha256, "--activate",
      ],
      expected: {
        schema: PIPELINE_UPDATE_ALPHA_REF_PLAN_SCHEMA,
        statuses: current ? ["replayed"] : ["applied", "replayed"],
      },
    },
  };
}

function transactionFailure(reason, committed = false) {
  const error = new Error(reason);
  error.transactionReason = reason;
  error.committed = committed;
  return error;
}

function lockOwned(lock, fs) {
  try {
    return sameObject(lock.identity, identity(fs.fstat(lock.fd)))
      && sameObject(lock.identity, identity(fs.lstat(lock.path)))
      && sameObject(lock.directoryIdentity, physicalDirectoryIdentity(lock.directory, fs));
  } catch {
    return false;
  }
}

function acquireWriterLock(observation, planSha256, deps) {
  const fs = filesystem(deps);
  const directory = dirname(observation.path);
  const path = `${observation.path}.pipeline-update-channel.lock`;
  let directoryIdentity;
  try { directoryIdentity = physicalDirectoryIdentity(directory, fs); } catch { directoryIdentity = null; }
  if (!directoryIdentity) {
    return { ok: false, reason: "writer-path-unsafe", committed: false };
  }
  const nonce = (deps.nonce ?? (() => randomBytes(16).toString("hex")))();
  if (!/^[a-f0-9]{32}$/u.test(nonce)) {
    return { ok: false, reason: "write-unavailable", committed: false };
  }
  const owner = `${JSON.stringify({
    schema: "pipeline.pipeline-update-channel-lock.v1",
    nonce,
    planSha256,
  })}\n`;
  let fd;
  let lockIdentity = null;
  try {
    fd = fs.open(
      path,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL
        | (fs.constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    lockIdentity = identity(fs.fstat(fd));
    if (!lockIdentity || !sameObject(lockIdentity, identity(fs.lstat(path)))) {
      throw transactionFailure("writer-lock-unsafe");
    }
    if (!sameObject(directoryIdentity, physicalDirectoryIdentity(directory, fs))) {
      throw transactionFailure("writer-path-unsafe");
    }
    fs.write(fd, owner);
    fs.fsync(fd);
    if (!syncDirectory(directory, fs).ok) throw transactionFailure("writer-lock-durability-unknown");
    return {
      ok: true,
      path,
      fd,
      identity: lockIdentity,
      nonce,
      directory,
      directoryIdentity,
      fs,
    };
  } catch (error) {
    if (fd !== undefined) {
      try { fs.close(fd); } catch { /* cleanup continues by identity */ }
    }
    if (lockIdentity) unlinkOwned(path, lockIdentity, fs);
    return {
      ok: false,
      reason: error?.code === "EEXIST"
        ? "writer-locked"
        : error?.transactionReason ?? "write-unavailable",
      committed: false,
    };
  }
}

function releaseWriterLock(lock) {
  const owned = lockOwned(lock, lock.fs);
  try { lock.fs.close(lock.fd); } catch { return false; }
  if (!owned || !unlinkOwned(lock.path, lock.identity, lock.fs)) return false;
  return syncDirectory(lock.directory, lock.fs).ok;
}

function atomicReplaceCalibration(repoPath, observation, postimage, options, deps) {
  const lock = acquireWriterLock(observation, options.planSha256, deps);
  if (!lock.ok) return lock;
  const { fs } = lock;
  const temporary = `${observation.path}.pipeline-update-channel.${lock.nonce}.tmp`;
  let temporaryFd;
  let temporaryIdentity = null;
  let renamed = false;
  let outcome;
  try {
    if (!lockOwned(lock, fs)) throw transactionFailure("writer-lock-lost");
    temporaryFd = fs.open(
      temporary,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL
        | (fs.constants.O_NOFOLLOW ?? 0),
      observation.identity.mode,
    );
    temporaryIdentity = identity(fs.fstat(temporaryFd));
    if (!temporaryIdentity
      || !sameObject(temporaryIdentity, identity(fs.lstat(temporary)))) {
      throw transactionFailure("temporary-file-unsafe");
    }
    fs.write(temporaryFd, postimage);
    fs.fchmod(temporaryFd, observation.identity.mode);
    fs.fsync(temporaryFd);
    fs.close(temporaryFd);
    temporaryFd = undefined;
    const prepared = readPhysicalFile(temporary, fs);
    if (!sameObject(temporaryIdentity, prepared.identity)
      || sha256(prepared.bytes) !== options.expectedPostimageSha256) {
      throw transactionFailure("temporary-file-invalid");
    }
    if (!lockOwned(lock, fs)) throw transactionFailure("writer-lock-lost");
    deps.beforeCommitValidation?.({ target: observation.path, temporary });
    const current = readCalibration(repoPath, deps);
    if (current.status !== "ready"
      || !sameObject(observation.identity, current.identity)
      || current.rawSha256 !== options.expectedCalibrationSha256) {
      throw transactionFailure("calibration-drift");
    }
    if (!lockOwned(lock, fs)) throw transactionFailure("writer-lock-lost");
    const commitPreimage = readPhysicalFile(observation.path, fs);
    if (!sameObject(observation.identity, commitPreimage.identity)
      || sha256(commitPreimage.bytes) !== options.expectedCalibrationSha256) {
      throw transactionFailure("calibration-drift");
    }
    fs.rename(temporary, observation.path);
    renamed = true;
    if (!syncDirectory(dirname(observation.path), fs).ok) {
      throw transactionFailure("commit-durability-unknown", true);
    }
    const committed = readPhysicalFile(observation.path, fs);
    if (!sameObject(temporaryIdentity, committed.identity)
      || sha256(committed.bytes) !== options.expectedPostimageSha256) {
      throw transactionFailure("commit-readback-failed", true);
    }
    outcome = { ok: true, committed: true, reason: null };
  } catch (error) {
    if (renamed && error?.committed !== true) {
      try {
        const committed = readPhysicalFile(observation.path, fs);
        if (sameObject(temporaryIdentity, committed.identity)
          && sha256(committed.bytes) === options.expectedPostimageSha256) {
          error.committed = true;
        }
      } catch { /* commit disposition remains indeterminate */ }
    }
    outcome = {
      ok: false,
      committed: error?.committed ?? (renamed ? null : false),
      reason: error?.transactionReason
        ?? (renamed ? "commit-indeterminate" : "write-unavailable"),
    };
  } finally {
    if (temporaryFd !== undefined) {
      try { fs.close(temporaryFd); } catch { /* cleanup continues by identity */ }
    }
    if (!renamed && temporaryIdentity) unlinkOwned(temporary, temporaryIdentity, fs);
    const released = releaseWriterLock(lock);
    if (!released && outcome?.ok) {
      outcome = { ok: false, committed: true, reason: "writer-lock-release-failed" };
    }
  }
  return outcome;
}

export function applyPipelineUpdateChannel(repoPath, options = {}, deps = {}) {
  const unknown = (reason, committed) => ({
    schema: PIPELINE_UPDATE_CHANNEL_PLAN_SCHEMA,
    status: "unknown",
    channel: isPipelineUpdateChannel(options.channel) ? options.channel : null,
    reason,
    ...(committed === undefined ? {} : { committed }),
  });
  if (options.activate !== true) return unknown("activation-required");
  if (!isPipelineUpdateChannel(options.channel)) return unknown("invalid-channel");
  if (![options.expectedCalibrationSha256, options.expectedPostimageSha256, options.planSha256].every((value) => SHA256.test(value ?? ""))) {
    return unknown("invalid-plan");
  }
  const binding = planBinding(
    repoPath,
    options.channel,
    options.expectedCalibrationSha256,
    options.expectedPostimageSha256,
  );
  if (sha256(canonicalJson(binding)) !== options.planSha256) return unknown("invalid-plan");
  const observed = readCalibration(repoPath, deps);
  if (observed.status !== "ready") return unknown(observed.reason);
  // Mirrors applyPipelineUpdateAlphaRef's own field-local guards, checked
  // unconditionally before the replay short circuit and before any digest
  // comparison -- see the identical comment on planPipelineUpdateChannel.
  if (duplicateFieldKey(observed, "pipelineUpdateChannel")) return unknown("malformed-configuration");
  if (Object.hasOwn(observed.value, "pipelineUpdateChannel")
    && !isPipelineUpdateChannel(observed.value.pipelineUpdateChannel)) return unknown("invalid-channel");
  if (observed.rawSha256 === options.expectedPostimageSha256
    && observed.value.pipelineUpdateChannel === options.channel) {
    return { ...binding, status: "replayed", planSha256: options.planSha256, reason: null };
  }
  if (observed.rawSha256 !== options.expectedCalibrationSha256) return unknown("calibration-drift");
  const postimage = channelPostimage(observed, options.channel);
  if (sha256(postimage) !== options.expectedPostimageSha256) return unknown("plan-drift");
  const transaction = atomicReplaceCalibration(repoPath, observed, postimage, options, deps);
  if (!transaction.ok) return unknown(transaction.reason, transaction.committed);
  const readback = readCalibration(repoPath, deps);
  if (readback.status !== "ready"
    || readback.rawSha256 !== options.expectedPostimageSha256
    || readback.value.pipelineUpdateChannel !== options.channel) {
    return unknown("readback-failed", true);
  }
  return { ...binding, status: "applied", planSha256: options.planSha256, reason: null };
}

export function applyPipelineUpdateAlphaRef(repoPath, options = {}, deps = {}) {
  const unknown = (reason, committed) => ({
    schema: PIPELINE_UPDATE_ALPHA_REF_PLAN_SCHEMA,
    status: "unknown",
    alphaRef: isPipelineUpdateAlphaRef(options.alphaRef) ? options.alphaRef : null,
    reason,
    ...(committed === undefined ? {} : { committed }),
  });
  if (options.activate !== true) return unknown("activation-required");
  if (!isPipelineUpdateAlphaRef(options.alphaRef)) return unknown("invalid-alpha-ref");
  if (![options.expectedCalibrationSha256, options.expectedPostimageSha256, options.planSha256].every((value) => SHA256.test(value ?? ""))) {
    return unknown("invalid-plan");
  }
  const binding = alphaRefPlanBinding(
    repoPath,
    options.alphaRef,
    options.expectedCalibrationSha256,
    options.expectedPostimageSha256,
  );
  if (sha256(canonicalJson(binding)) !== options.planSha256) return unknown("invalid-plan");
  const observed = readCalibration(repoPath, deps);
  if (observed.status !== "ready") return unknown(observed.reason);
  // Mirrors planPipelineUpdateAlphaRef's own guard (finding F1): readCalibration
  // does not detect a duplicated `pipelineUpdateAlphaRef` key, and this writer's
  // postimage (`.find()`, first occurrence) and its own subsequent reads
  // (`JSON.parse`, last occurrence) would otherwise silently address two
  // different properties. Checked unconditionally, before the replay short
  // circuit and before any digest comparison, so a caller cannot reach the
  // write path on such a file even with a correctly-computed digest binding.
  if (duplicateFieldKey(observed, "pipelineUpdateAlphaRef")) return unknown("malformed-configuration");
  if (observed.rawSha256 === options.expectedPostimageSha256
    && observed.value.pipelineUpdateAlphaRef === options.alphaRef) {
    return { ...binding, status: "replayed", planSha256: options.planSha256, reason: null };
  }
  if (observed.rawSha256 !== options.expectedCalibrationSha256) return unknown("calibration-drift");
  const postimage = alphaRefPostimage(observed, options.alphaRef);
  if (sha256(postimage) !== options.expectedPostimageSha256) return unknown("plan-drift");
  const transaction = atomicReplaceCalibration(repoPath, observed, postimage, options, deps);
  if (!transaction.ok) return unknown(transaction.reason, transaction.committed);
  const readback = readCalibration(repoPath, deps);
  if (readback.status !== "ready"
    || readback.rawSha256 !== options.expectedPostimageSha256
    || readback.value.pipelineUpdateAlphaRef !== options.alphaRef) {
    return unknown("readback-failed", true);
  }
  return { ...binding, status: "applied", planSha256: options.planSha256, reason: null };
}

function parseCli(argv) {
  const operation = argv[0];
  if (!["plan", "apply", "readback"].includes(operation)) return null;
  const parsed = { operation, repo: process.cwd(), activate: false };
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--activate" && operation === "apply") parsed.activate = true;
    else if (token === "--repo" && argv[index + 1]) parsed.repo = argv[++index];
    else if (token === "--channel" && argv[index + 1] && operation !== "readback") parsed.channel = argv[++index];
    else if (token === "--alpha-ref" && argv[index + 1] && operation !== "readback") parsed.alphaRef = argv[++index];
    else if (token === "--expected-calibration-sha256" && argv[index + 1] && operation === "apply") parsed.expectedCalibrationSha256 = argv[++index];
    else if (token === "--expected-postimage-sha256" && argv[index + 1] && operation === "apply") parsed.expectedPostimageSha256 = argv[++index];
    else if (token === "--plan-sha256" && argv[index + 1] && operation === "apply") parsed.planSha256 = argv[++index];
    else return null;
  }
  if (operation !== "readback") {
    // `--channel` and `--alpha-ref` select two different writer pairs; a
    // caller supplying both gets an error, never silent precedence.
    if (parsed.channel === undefined && parsed.alphaRef === undefined) return null;
    if (parsed.channel !== undefined && parsed.alphaRef !== undefined) return null;
  }
  return parsed;
}

/** Combined CLI readback: channel and alpha-ref side by side (ADR-0078 D3). */
function readbackResult(repoPath) {
  return {
    ...readProjectPipelineUpdateChannel(repoPath),
    alphaRef: readProjectPipelineUpdateAlphaRef(repoPath),
  };
}

const isCli = process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH;
if (isCli) {
  const parsed = parseCli(process.argv.slice(2));
  if (!parsed) {
    process.stderr.write("pipeline-update-channel: use readback, plan (--channel <alpha|beta|stable> | --alpha-ref <ref>), or the exact digest-bound apply action -- never both --channel and --alpha-ref together\n");
    process.exit(64);
  }
  const result = parsed.operation === "readback"
    ? readbackResult(parsed.repo)
    : parsed.alphaRef !== undefined
      ? (parsed.operation === "plan"
        ? planPipelineUpdateAlphaRef(parsed.repo, parsed.alphaRef)
        : applyPipelineUpdateAlphaRef(parsed.repo, parsed))
      : (parsed.operation === "plan"
        ? planPipelineUpdateChannel(parsed.repo, parsed.channel)
        : applyPipelineUpdateChannel(parsed.repo, parsed));
  process.stdout.write(`${JSON.stringify(result)}\n`);
  // `readback` carries two independently-typed statuses in one JSON payload
  // -- channel at top level, alphaRef nested -- but the exit code used to
  // read only the top-level channel status, so a broken alpha-ref field
  // (e.g. `unknown`) exited 0 (finding F2). `plan`/`apply` still expose
  // exactly one status each, so their exit check is unchanged.
  const failed = parsed.operation === "readback"
    ? ["unknown"].includes(result.status) || ["unknown"].includes(result.alphaRef.status)
    : ["unknown"].includes(result.status);
  process.exit(failed ? 2 : 0);
}
