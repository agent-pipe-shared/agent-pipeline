#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Candidate-bound Critic packet lifecycle.
 *
 * This coordinator-side module is deliberately runner agnostic.  It freezes a
 * candidate before a provider is selected and owns the disposable checkout and
 * lifecycle records.  Provider adapters may only claim/record/consume a packet;
 * they do not get to reinterpret its Git or governance bindings.
 */
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

import { loadManifest } from "../lib/manifest.mjs";
import { assessWindowsPrivatePath, hardenWindowsPrivateDirectory } from "../lib/windows-private-state.mjs";
import { deriveCriticExportView, validateCriticExportAuthorization } from "../lib/critic-export-policy.mjs";
import {
  CRITIC_PACKET_GOVERNANCE_INPUT_SCHEMA,
  deriveCriticPacketGovernance,
  validateCriticPacketGovernance,
} from "../lib/critic-packet-governance.mjs";

export const PACKET_SCHEMA = "pipeline.critic-candidate-packet.v1";
export const STATE_SCHEMA = "pipeline.critic-candidate-state.v1";
export const RECORD_SCHEMA = "pipeline.critic-candidate-record.v1";
export const PACKET_TTL_SECONDS = 900;
export const PACKET_DIFF_PATH = ".git/agent-pipeline-review.diff";
export const PACKET_FILES = Object.freeze([
  "packet.json", "state.json", "claim.json", "export-native.json", "export-fallback.json",
  "result.json", "receipt.json", "cleanup.json",
]);

const SAFE_ID = /^[a-z0-9][a-z0-9._-]{1,79}$/;
const PACKET_ID = /^[a-f0-9]{32}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const REFERENCE_KINDS = new Set(["spec", "calibration", "guardrail", "evidence"]);
const RUNNERS = new Set(["claude", "codex"]);

export class CriticPacketError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CriticPacketError";
    this.code = code;
  }
}

function fail(code, message) { throw new CriticPacketError(code, message); }
function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value, keys) {
  return isObject(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function textCompare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
export function canonicalJson(value) { return `${JSON.stringify(value, null, 2)}\n`; }
export function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function nowIso(now) {
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) fail("CPP-TIME", "Invalid packet clock value.");
  return date.toISOString();
}

export function normalizePacketPath(value, label = "path") {
  if (typeof value !== "string" || value.length === 0 || value.length > 240 || value.trim() !== value
    || value.includes("\\") || value.includes("\0") || isAbsolute(value) || value.startsWith("./") || value.endsWith("/")) {
    fail("CPP-PATH", `${label} is not a normalized repository-relative path.`);
  }
  if (value.split("/").some((part) => part === "" || part === "." || part === "..")) {
    fail("CPP-PATH", `${label} is not a normalized repository-relative path.`);
  }
  return value;
}

function git(root, args, { allowNonzero = false, timeout = 5000 } = {}) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    env: { LANG: "C", LC_ALL: "C", PATH: process.env.PATH ?? "" },
    maxBuffer: 32 * 1024 * 1024,
    shell: false,
    timeout,
  });
  if (result.error) fail("CPP-GIT", `Git failed to start: ${result.error.message}`);
  if (!allowNonzero && result.status !== 0) fail("CPP-GIT", `Git ${args[0]} failed.`);
  return result;
}

function gitText(root, args) { return String(git(root, args).stdout).trim(); }
function assertOid(value, objectFormat, label) {
  const length = objectFormat === "sha1" ? 40 : objectFormat === "sha256" ? 64 : 0;
  if (!OID.test(value) || value.length !== length) fail("CPP-REF", `${label} does not match ${objectFormat}.`);
  return value;
}
function inside(root, child) {
  const rel = relative(root, child);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
function assertRealPrivateDir(path, label) {
  const lexical = lstatSync(path);
  if (lexical.isSymbolicLink() || !lexical.isDirectory()) fail("CPP-CONTROL", `${label} must be a real directory.`);
  if (process.platform !== "win32" && (lexical.mode & 0o077) !== 0) fail("CPP-CONTROL", `${label} must deny group and other access.`);
  const physical = realpathSync(path);
  if (process.platform === "win32" && assessWindowsPrivatePath(physical).status !== "secure") fail("CPP-CONTROL", `${label} Windows assurance is unavailable or insecure.`);
  return physical;
}
function assertNoSymlinkPath(path, root, label) {
  const realRoot = realpathSync(root);
  const absolute = resolve(path);
  if (!inside(realRoot, absolute)) fail("CPP-CONTROL", `${label} escapes the control root.`);
  let cursor = realRoot;
  for (const part of relative(realRoot, absolute).split(sep)) {
    cursor = join(cursor, part);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) fail("CPP-CONTROL", `${label} crosses a symlink.`);
  }
  return absolute;
}
function fsyncDir(path) {
  const fd = openSync(path, "r");
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
function publishExclusive(path, value) {
  const bytes = canonicalJson(value);
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`;
  const fd = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(fd, bytes, "utf8");
    fsyncSync(fd);
  } finally { closeSync(fd); }
  try {
    linkSync(temporary, path);
    fsyncDir(dirname(path));
  } catch (error) {
    if (error?.code === "EEXIST") fail("CPP-OVERWRITE", `Refusing to overwrite ${path}.`);
    throw error;
  } finally { unlinkSync(temporary); }
  chmodSync(path, 0o600);
  if (process.platform === "win32" && assessWindowsPrivatePath(path).status !== "secure") fail("CPP-RECORD", "Packet record Windows assurance is unavailable or insecure.");
  return { bytes: Buffer.byteLength(bytes), sha256: sha256(bytes) };
}
function replaceState(path, value) {
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`;
  const fd = openSync(temporary, "wx", 0o600);
  try { writeFileSync(fd, canonicalJson(value)); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temporary, path);
  if (process.platform === "win32" && assessWindowsPrivatePath(path).status !== "secure") fail("CPP-RECORD", "Packet state Windows assurance is unavailable or insecure.");
  fsyncDir(dirname(path));
}
function readJson(path, code = "CPP-RECORD") {
  const info = lstatSync(path);
  if (info.isSymbolicLink() || !info.isFile() || info.size > 1024 * 1024 || (process.platform !== "win32" && (info.mode & 0o077) !== 0)) {
    fail(code, `${path} is not a private bounded regular file.`);
  }
  if (process.platform === "win32" && (assessWindowsPrivatePath(path).status !== "secure" || assessWindowsPrivatePath(dirname(path)).status !== "secure")) fail(code, `${path} Windows assurance is unavailable or insecure.`);
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { fail(code, `${path} is not valid JSON.`); }
}

function normalizeRoute(route) {
  const keys = ["routeId", "runner", "adapter", "provider", "modelTier", "effortTier", "assurance", "projectionDigest"];
  if (!exactKeys(route, keys) || !keys.slice(0, -1).every((key) => typeof route[key] === "string" && route[key].length > 0)
    || !SAFE_ID.test(route.routeId) || !RUNNERS.has(route.runner) || !SHA256.test(route.projectionDigest)) {
    fail("CPP-ROUTE", "The packet route is not closed or valid.");
  }
  return Object.fromEntries(keys.map((key) => [key, route[key]]));
}
function normalizeReferences(references, candidateByPath) {
  if (!Array.isArray(references)) fail("CPP-REFERENCE", "references must be an array.");
  const normalized = references.map((reference) => {
    if (!exactKeys(reference, ["kind", "path"]) || !REFERENCE_KINDS.has(reference.kind)) fail("CPP-REFERENCE", "Invalid reference shape.");
    const path = normalizePacketPath(reference.path, "reference path");
    const candidate = candidateByPath.get(path);
    if (!candidate?.readable) fail("CPP-REFERENCE", `Reference is absent or unreadable: ${path}`);
    return { kind: reference.kind, path, candidateBlobOid: candidate.blobOid };
  }).sort((left, right) => textCompare(`${left.kind}:${left.path}`, `${right.kind}:${right.path}`));
  const keys = normalized.map(({ kind, path }) => `${kind}:${path}`);
  if (new Set(keys).size !== keys.length) fail("CPP-REFERENCE", "Duplicate packet reference.");
  return normalized;
}
function candidateInventory(checkout, objectFormat) {
  const output = git(checkout, ["ls-tree", "-r", "-z", "HEAD"]).stdout;
  const entries = [];
  for (const row of String(output).split("\0")) {
    if (!row) continue;
    const match = row.match(/^(\d{6}) (blob) ([a-f0-9]+)\t(.+)$/s);
    if (!match) fail("CPP-TREE", "Unexpected candidate tree entry.");
    const path = normalizePacketPath(match[4], "candidate path");
    entries.push({ path, blobOid: assertOid(match[3], objectFormat, "candidate blob"), readable: match[1] !== "120000" });
  }
  return entries.sort((left, right) => textCompare(left.path, right.path));
}
function changedPaths(repoRoot, base, candidate) {
  const rows = String(git(repoRoot, ["diff", "--name-only", "-z", base, candidate, "--"]).stdout)
    .split("\0").filter(Boolean).map((path) => normalizePacketPath(path, "changed path")).sort(textCompare);
  if (new Set(rows).size !== rows.length) fail("CPP-DIFF", "Git returned duplicate changed paths.");
  return rows;
}
function createCheckout(repoRoot, checkoutPath, candidateOid) {
  mkdirSync(checkoutPath, { mode: 0o700 });
  git(checkoutPath, ["init", "--quiet"]);
  git(checkoutPath, ["fetch", "--quiet", "--no-tags", "--no-write-fetch-head", repoRoot, candidateOid], { timeout: 30_000 });
  git(checkoutPath, ["checkout", "--quiet", "--detach", candidateOid]);
  if (gitText(checkoutPath, ["remote"]) !== "") fail("CPP-CHECKOUT", "Disposable checkout unexpectedly has a remote.");
  if (gitText(checkoutPath, ["rev-parse", "--git-path", "objects/info/alternates"]) !== ".git/objects/info/alternates"
    || existsSync(join(checkoutPath, ".git", "objects", "info", "alternates"))) {
    fail("CPP-CHECKOUT", "Disposable checkout uses alternates.");
  }
}
function materializeDiff(checkout, base, candidate) {
  const bytes = String(git(checkout, ["diff", "--binary", "--no-ext-diff", base, candidate, "--"]).stdout);
  const path = join(checkout, PACKET_DIFF_PATH);
  writeFileSync(path, bytes, { mode: 0o600, flag: "wx" });
  return { base, commit: candidate, path: PACKET_DIFF_PATH, bytes: Buffer.byteLength(bytes), sha256: sha256(bytes) };
}
function observeCheckout(checkout, candidateOid, candidateTree, creatorNonce) {
  if (gitText(checkout, ["status", "--porcelain=v1", "--untracked-files=all"]) !== "") fail("CPP-TREE", "Candidate checkout is not clean.");
  if (gitText(checkout, ["rev-parse", "HEAD"]) !== candidateOid || gitText(checkout, ["rev-parse", "HEAD^{tree}"]) !== candidateTree) {
    fail("CPP-TREE", "Candidate checkout ref or tree drifted.");
  }
  return {
    realPath: realpathSync(checkout),
    gitDir: realpathSync(join(checkout, ".git")),
    commonDir: realpathSync(join(checkout, ".git")),
    objectFormat: gitText(checkout, ["rev-parse", "--show-object-format"]),
    candidateOid,
    candidateTree,
    creatorNonce,
  };
}
function bindingsFor(packet) {
  return {
    requestSha256: sha256(canonicalJson(packet.request)),
    diffPathsSha256: sha256(canonicalJson(packet.diffPaths)),
    governanceSha256: sha256(canonicalJson(packet.governance)),
  };
}
function recordBody(packet, revision, priorStateDigest, phase, body, timestamp) {
  return { schema: STATE_SCHEMA, packetId: packet.packetId, packetDigest: sha256(canonicalJson(packet)), revision, priorStateDigest, timestamp, phase, body };
}
function validatePacketShape(packet) {
  if (!isObject(packet) || packet.schema !== PACKET_SCHEMA || !PACKET_ID.test(packet.packetId)
    || !SHA256.test(packet.bindings?.requestSha256) || !SHA256.test(packet.bindings?.diffPathsSha256)
    || !SHA256.test(packet.bindings?.governanceSha256)) fail("CPP-DIGEST", "Packet shape is invalid.");
  const expected = bindingsFor(packet);
  if (JSON.stringify(expected) !== JSON.stringify(packet.bindings)) fail("CPP-DIGEST", "Packet binding digest mismatch.");
}
function packetContext(controlRoot, packetId) {
  if (!PACKET_ID.test(packetId)) fail("CPP-ARGUMENT", "packetId must be 32 lowercase hex characters.");
  const root = assertRealPrivateDir(resolve(controlRoot), "control root");
  const packetDir = assertNoSymlinkPath(join(root, packetId), root, "packet directory");
  if (!existsSync(packetDir)) fail("CPP-ABSENT", "Packet does not exist.");
  const packet = readJson(join(packetDir, "packet.json"));
  validatePacketShape(packet);
  if (packet.packetId !== packetId) fail("CPP-DIGEST", "Packet ID mismatch.");
  return { root, packetDir, packet };
}
function assertLive(packet, now) {
  const time = new Date(now).getTime();
  if (!Number.isFinite(time) || time > new Date(packet.expiresAt).getTime()) fail("CPP-EXPIRED", "Packet expired.");
}

/** Read and revalidate one prepared immutable packet before any dispatch claim. */
export function inspectCandidatePacket({ controlRoot, packetId }, { now = new Date() } = {}) {
  const { packetDir, packet } = packetContext(controlRoot, packetId);
  assertLive(packet, now);
  if (currentState(packetDir, packet).phase !== "prepared") fail("CPP-INSPECT", "Packet is not prepared for authorization.");
  revalidateCandidate(packet);
  return { ok: true, code: "CPP-INSPECTED", packet };
}

/** Persist exactly one recomputable, redacted pre-export authorization per assurance class. */
export function recordCandidateExport({ controlRoot, packetId, receipt, exportView, policy }, options = {}) {
  const { packetDir, packet } = packetContext(controlRoot, packetId);
  if (currentState(packetDir, packet).phase !== "claimed") fail("CPP-EXPORT", "Packet is not claimed for export authorization.");
  if (!validateCriticExportAuthorization({ receipt, packet, exportView, policy }, options)) {
    fail("CPP-EXPORT", "Critic export authorization receipt is invalid or not authorized.");
  }
  const slot = receipt.assuranceClass === "claude-native-bare-read-only" ? "export-native.json" : "export-fallback.json";
  const published = publishExclusive(join(packetDir, slot), receipt);
  return { ok: true, code: "CPP-EXPORT-AUTHORIZED", receipt, published };
}

/** Re-read and revalidate the immutable authorization used by a final receipt. */
export function readCandidateExport({ controlRoot, packetId, assuranceClass, policy }, options = {}) {
  const { packetDir, packet } = packetContext(controlRoot, packetId);
  if (options.requireLiveCandidate === true) {
    assertLive(packet, options.now ?? new Date());
    revalidateCandidate(packet);
  }
  const slot = assuranceClass === "claude-native-bare-read-only" ? "export-native.json" : "export-fallback.json";
  const receipt = readJson(join(packetDir, slot), "CPP-EXPORT");
  const exportView = deriveCriticExportView(packet);
  if (receipt.assuranceClass !== assuranceClass
    || !validateCriticExportAuthorization({ receipt, packet, exportView, policy }, options)) {
    fail("CPP-EXPORT", "Persisted Critic export authorization is invalid or drifted.");
  }
  return { ok: true, code: "CPP-EXPORT-READ", packet, receipt };
}
function currentState(packetDir, packet) {
  const state = readJson(join(packetDir, "state.json"));
  if (state.schema !== STATE_SCHEMA || state.packetId !== packet.packetId || state.packetDigest !== sha256(canonicalJson(packet))) {
    fail("CPP-STATE", "Packet state binding mismatch.");
  }
  return state;
}
function advanceState(packetDir, packet, expected, next, body, now) {
  const statePath = join(packetDir, "state.json");
  const state = currentState(packetDir, packet);
  if (!expected.includes(state.phase)) fail("CPP-STATE", `Cannot move packet from ${state.phase} to ${next}.`);
  const successor = recordBody(packet, state.revision + 1, sha256(canonicalJson(state)), next, body, nowIso(now));
  replaceState(statePath, successor);
  return successor;
}
function revalidateCandidate(packet) {
  const checkout = packet.checkout.realPath;
  const observed = observeCheckout(checkout, packet.candidate.commit, packet.candidate.tree, packet.checkout.creatorNonce);
  if (JSON.stringify(observed) !== JSON.stringify(packet.checkout)) fail("CPP-CHECKOUT", "Checkout identity drift.");
  if (!exactKeys(packet.diff, ["base", "commit", "path", "bytes", "sha256"])
    || packet.diff.base !== packet.candidate.base || packet.diff.commit !== packet.candidate.commit
    || packet.diff.path !== PACKET_DIFF_PATH || !Number.isSafeInteger(packet.diff.bytes) || packet.diff.bytes < 0
    || !SHA256.test(packet.diff.sha256)) fail("CPP-DIFF", "Packet diff binding is invalid.");
  let diffBytes;
  try {
    const info = lstatSync(join(checkout, packet.diff.path));
    if (!info.isFile() || info.isSymbolicLink() || (process.platform !== "win32" && (info.mode & 0o077) !== 0) || info.size !== packet.diff.bytes) fail("CPP-DIFF", "Packet diff snapshot is not a private exact regular file.");
    if (process.platform === "win32" && (assessWindowsPrivatePath(join(checkout, packet.diff.path)).status !== "secure" || assessWindowsPrivatePath(dirname(join(checkout, packet.diff.path))).status !== "secure")) fail("CPP-DIFF", "Packet diff snapshot Windows assurance is unavailable or insecure.");
    diffBytes = readFileSync(join(checkout, packet.diff.path));
  } catch (error) {
    if (error instanceof CriticPacketError) throw error;
    fail("CPP-DIFF", "Packet diff snapshot is missing or unreadable.");
  }
  const recomputed = String(git(checkout, ["diff", "--binary", "--no-ext-diff", packet.candidate.base, packet.candidate.commit, "--"]).stdout);
  if (sha256(diffBytes) !== packet.diff.sha256 || sha256(recomputed) !== packet.diff.sha256
    || Buffer.byteLength(recomputed) !== packet.diff.bytes) fail("CPP-DIFF", "Packet diff snapshot drifted from the fixed range.");
  const inventory = candidateInventory(checkout, packet.ruleset.objectFormat);
  const manifestResult = loadManifest(checkout);
  if (manifestResult.status === "invalid") fail("CPP-MANIFEST", "Candidate manifest became invalid.");
  const source = {
    schema: CRITIC_PACKET_GOVERNANCE_INPUT_SCHEMA,
    manifest: manifestResult.status === "ok" ? manifestResult.manifest : null,
    candidateFiles: inventory,
    changedPaths: packet.diffPaths,
  };
  const validated = validateCriticPacketGovernance(source, packet.governance);
  if (!validated.ok) fail(validated.code, "Candidate governance drift.");
  for (const reference of packet.references) {
    const entry = inventory.find(({ path }) => path === reference.path);
    if (!entry?.readable || entry.blobOid !== reference.candidateBlobOid) fail("CPP-REFERENCE", `Reference drift: ${reference.path}`);
  }
}

export function prepareCandidatePacket(options, { now = new Date(), nonce = randomBytes } = {}) {
  try {
    const repoRoot = realpathSync(resolve(options.repoRoot));
    const commonDirObserved = gitText(repoRoot, ["rev-parse", "--git-common-dir"]);
    const commonDir = realpathSync(resolve(repoRoot, commonDirObserved));
    const requiredControl = join(commonDir, "agent-pipeline", "critic-packets");
    const controlRoot = assertRealPrivateDir(resolve(options.controlRoot), "control root");
    if (controlRoot !== requiredControl) fail("CPP-CONTROL", "controlRoot is not the canonical Git common-dir packet root.");
    if (!PACKET_ID.test(options.packetId) || !SAFE_ID.test(options.taskId) || !SAFE_ID.test(options.projectId)) fail("CPP-ARGUMENT", "Unsafe packet/task/project ID.");
    const objectFormat = gitText(repoRoot, ["rev-parse", "--show-object-format"]);
    const base = assertOid(options.baseCommit, objectFormat, "baseCommit");
    const candidate = assertOid(options.candidateCommit, objectFormat, "candidateCommit");
    const rulesetOid = assertOid(options.rulesetOid, objectFormat, "rulesetOid");
    if (git(repoRoot, ["merge-base", "--is-ancestor", base, candidate], { allowNonzero: true }).status !== 0) fail("CPP-ANCESTRY", "baseCommit is not an ancestor of candidateCommit.");
    if (gitText(repoRoot, ["cat-file", "-t", base]) !== "commit" || gitText(repoRoot, ["cat-file", "-t", candidate]) !== "commit") fail("CPP-REF", "Packet refs are not commits.");
    const candidateTree = assertOid(gitText(repoRoot, ["rev-parse", `${candidate}^{tree}`]), objectFormat, "candidate tree");
    const diffPaths = changedPaths(repoRoot, base, candidate);
    const packetDir = assertNoSymlinkPath(join(controlRoot, options.packetId), controlRoot, "packet directory");
    mkdirSync(packetDir, { mode: 0o700 });
    if (process.platform === "win32" && hardenWindowsPrivateDirectory(packetDir).status !== "secure") fail("CPP-CONTROL", "packet directory Windows assurance is unavailable or insecure.");
    const checkoutPath = join(packetDir, "checkout");
    const creatorNonce = nonce(32).toString("hex");
    const cleanupCapability = nonce(32).toString("hex");
    createCheckout(repoRoot, checkoutPath, candidate);
    const diff = materializeDiff(checkoutPath, base, candidate);
    const checkout = observeCheckout(checkoutPath, candidate, candidateTree, creatorNonce);
    const inventory = candidateInventory(checkoutPath, objectFormat);
    const candidateByPath = new Map(inventory.map((entry) => [entry.path, entry]));
    const manifestResult = loadManifest(checkoutPath);
    if (manifestResult.status === "invalid") fail("CPP-MANIFEST", "Candidate manifest is invalid.");
    const governanceInput = {
      schema: CRITIC_PACKET_GOVERNANCE_INPUT_SCHEMA,
      manifest: manifestResult.status === "ok" ? manifestResult.manifest : null,
      candidateFiles: inventory,
      changedPaths: diffPaths,
    };
    const governance = deriveCriticPacketGovernance(governanceInput);
    const createdAt = nowIso(now);
    const expiresAt = new Date(new Date(createdAt).getTime() + PACKET_TTL_SECONDS * 1000).toISOString();
    const packet = {
      schema: PACKET_SCHEMA,
      packetId: options.packetId,
      createdAt,
      expiresAt,
      request: { taskId: options.taskId, projectId: options.projectId, trigger: options.trigger ?? "T1" },
      ruleset: { oid: rulesetOid, objectFormat },
      route: normalizeRoute(options.route),
      candidate: { base, commit: candidate, tree: candidateTree },
      diff,
      diffPaths,
      references: normalizeReferences(options.references ?? [], candidateByPath),
      governance,
      checkout,
      cleanupCapability,
      bindings: null,
    };
    packet.bindings = bindingsFor(packet);
    const packetPublished = publishExclusive(join(packetDir, "packet.json"), packet);
    const prepared = recordBody(packet, 1, null, "prepared", { code: "CPP-PREPARED" }, createdAt);
    publishExclusive(join(packetDir, "state.json"), prepared);
    return { ok: true, code: "CPP-PREPARED", packet, packetDigest: packetPublished.sha256, packetDir };
  } catch (error) {
    if (error instanceof CriticPacketError) throw error;
    if (error?.code === "EEXIST") fail("CPP-OVERWRITE", "Packet directory already exists.");
    fail("CPP-INTERNAL", error instanceof Error ? error.message : String(error));
  }
}

export function claimCandidatePacket({ controlRoot, packetId, adapter, claimantNonce }, { now = new Date() } = {}) {
  const { packetDir, packet } = packetContext(controlRoot, packetId);
  assertLive(packet, now);
  if (packet.route.adapter !== adapter || !SHA256.test(claimantNonce)) fail("CPP-CLAIM", "Claim adapter or nonce mismatch.");
  revalidateCandidate(packet);
  const state = currentState(packetDir, packet);
  if (state.phase !== "prepared") fail("CPP-CLAIM", "Packet is not claimable.");
  const timestamp = nowIso(now);
  const claim = { schema: RECORD_SCHEMA, packetId, packetDigest: sha256(canonicalJson(packet)), revision: 2, priorStateDigest: sha256(canonicalJson(state)), timestamp, phase: "claimed", body: { adapter, claimantNonce } };
  publishExclusive(join(packetDir, "claim.json"), claim);
  replaceState(join(packetDir, "state.json"), recordBody(packet, 2, claim.priorStateDigest, "claimed", claim.body, timestamp));
  return { ok: true, code: "CPP-CLAIMED", packet, claim };
}

export function recordCandidateResult({ controlRoot, packetId, result }, { now = new Date() } = {}) {
  const { packetDir, packet } = packetContext(controlRoot, packetId);
  assertLive(packet, now);
  revalidateCandidate(packet);
  if (!isObject(result)) fail("CPP-RESULT", "Result must be an object.");
  const state = currentState(packetDir, packet);
  if (state.phase === "result-recorded") {
    const existing = readJson(join(packetDir, "result.json"));
    if (canonicalJson(existing.body) !== canonicalJson(result)) fail("CPP-RESULT-REPLAY", "Result replay does not match the durable result.");
    return { ok: true, code: "CPP-RESULT-RECORDED", replay: true, packet, record: existing };
  }
  if (state.phase !== "claimed") fail("CPP-RESULT", "Packet has not been claimed.");
  const timestamp = nowIso(now);
  const record = { schema: RECORD_SCHEMA, packetId, packetDigest: sha256(canonicalJson(packet)), revision: state.revision + 1, priorStateDigest: sha256(canonicalJson(state)), timestamp, phase: "result-recorded", body: result };
  publishExclusive(join(packetDir, "result.json"), record);
  replaceState(join(packetDir, "state.json"), recordBody(packet, record.revision, record.priorStateDigest, record.phase, record.body, timestamp));
  return { ok: true, code: "CPP-RESULT-RECORDED", replay: false, packet, record };
}

export function consumeCandidatePacket({ controlRoot, packetId, receipt }, { now = new Date() } = {}) {
  const { packetDir, packet } = packetContext(controlRoot, packetId);
  revalidateCandidate(packet);
  const state = currentState(packetDir, packet);
  if (state.phase === "consumed") {
    const existing = readJson(join(packetDir, "receipt.json"));
    if (canonicalJson(existing.body) !== canonicalJson(receipt)) fail("CPP-CONSUME-REPLAY", "Receipt replay does not match the durable receipt.");
    return { ok: true, code: "CPP-CONSUMED", replay: true, packet, record: existing };
  }
  if (state.phase !== "result-recorded" || !isObject(receipt)) fail("CPP-CONSUME", "Packet has no durable result or receipt is invalid.");
  const timestamp = nowIso(now);
  const record = { schema: RECORD_SCHEMA, packetId, packetDigest: sha256(canonicalJson(packet)), revision: state.revision + 1, priorStateDigest: sha256(canonicalJson(state)), timestamp, phase: "consumed", body: receipt };
  publishExclusive(join(packetDir, "receipt.json"), record);
  replaceState(join(packetDir, "state.json"), recordBody(packet, record.revision, record.priorStateDigest, record.phase, record.body, timestamp));
  return { ok: true, code: "CPP-CONSUMED", replay: false, packet, record };
}

export function cleanupCandidatePacket({ controlRoot, packetId, cleanupCapability }, { now = new Date() } = {}) {
  const { packetDir, packet } = packetContext(controlRoot, packetId);
  const state = currentState(packetDir, packet);
  if (state.phase !== "consumed" || cleanupCapability !== packet.cleanupCapability) fail("CPP-CLEANUP", "Cleanup is not authorized.");
  revalidateCandidate(packet);
  const checkout = packet.checkout.realPath;
  if (resolve(checkout) !== resolve(join(packetDir, "checkout")) || !inside(packetDir, checkout)) fail("CPP-CLEANUP", "Cleanup target identity mismatch.");
  rmSync(checkout, { recursive: true, force: false });
  if (existsSync(checkout)) fail("CPP-CLEANUP", "Checkout cleanup was incomplete.");
  const record = { schema: RECORD_SCHEMA, packetId, packetDigest: sha256(canonicalJson(packet)), revision: state.revision + 1, priorStateDigest: sha256(canonicalJson(state)), timestamp: nowIso(now), phase: "consumed", body: { code: "CPP-CLEANUP-COMPLETE", checkoutRemoved: true } };
  publishExclusive(join(packetDir, "cleanup.json"), record);
  return { ok: true, code: "CPP-CLEANUP-COMPLETE", record };
}

export function blockCandidatePacket({ controlRoot, packetId, code, detail = null }, { now = new Date() } = {}) {
  const { packetDir, packet } = packetContext(controlRoot, packetId);
  if (typeof code !== "string" || !code.startsWith("CPP-")) fail("CPP-BLOCK", "Invalid block code.");
  const state = currentState(packetDir, packet);
  if (["consumed", "blocked"].includes(state.phase)) fail("CPP-BLOCK", "Terminal packet cannot be blocked again.");
  const blocked = advanceState(packetDir, packet, ["prepared", "claimed", "result-recorded"], "blocked", { code, detail }, now);
  return { ok: false, code, state: blocked };
}

export const __test = Object.freeze({ bindingsFor, observeCheckout, candidateInventory });
