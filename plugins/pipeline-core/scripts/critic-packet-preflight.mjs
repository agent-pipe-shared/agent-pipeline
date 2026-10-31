#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { readDispatchBudgetLaunchObservation } from "../lib/dispatch-budget-launch-observation.mjs";
import { randomBytes } from "node:crypto";
import { chmodSync, closeSync, existsSync, fsyncSync, lstatSync, linkSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadManifest } from "../lib/manifest.mjs";
import { revalidateHistoricalFreshReviewPacketBinding } from "../lib/historical-fresh-review-admission.mjs";
import { isSafeTaskId } from "../lib/dispatch-record.mjs";
import { isSuccessfulSpawn } from "../lib/successful-spawn.mjs";
import { GIT_NULL_DEVICE } from "../lib/git-null-device.mjs";
import { assessWindowsPrivatePath, hardenWindowsPrivateDirectory } from "../lib/windows-private-state.mjs";
import { deriveCriticExportView, validateCriticExportAuthorization } from "../lib/critic-export-policy.mjs";
import { CRITIC_PACKET_GOVERNANCE_INPUT_SCHEMA, deriveCriticPacketGovernance, validateCriticPacketGovernance } from "../lib/critic-packet-governance.mjs";
import { validateCriticLineagePacketAdmission } from "../lib/critic-review-lineage.mjs";
import { createLocalDispatchEvidenceBinding, evaluateReviewAdmission, evaluateSignedQualityImportReviewAdmission } from "./check-critic-skip-coverage.mjs";
import { createDiagnosticBundle, materializeDiagnosticBundle, revalidateDiagnosticBundle } from "../lib/critic-diagnostic-packet.mjs";
import { PACKET_SCHEMA, RECORD_SCHEMA, SESSION_ADMISSION_SCHEMA, SAFE_ID, PACKET_ID, SHA256, OID, CriticPacketError, fail, isObject, exactKeys, canonicalJson, sha256, inside, assertRealPrivateDir, assertNoSymlinkPath, readJson, normalizeSessionBinding, bindingsFor, recordBody, normalizeCoordinatorOnly, packetContext, currentState, normalizedPacketView } from "../lib/critic-packet-preflight-read.mjs";
export { PACKET_SCHEMA, STATE_SCHEMA, RECORD_SCHEMA, SESSION_PACKET_BINDING_SCHEMA, SESSION_ADMISSION_SCHEMA, CriticPacketError, canonicalJson, sha256, normalizedPacketView, packetDigestMatches, readConsumedCandidateReceipt, readConsumedCandidateResult, readConsumedSessionAdmission } from "../lib/critic-packet-preflight-read.mjs";

/**
 * Candidate-bound Critic packet lifecycle.
 *
 * This coordinator-side module is deliberately runner agnostic.  It freezes a
 * candidate before a provider is selected and owns the disposable checkout and
 * lifecycle records.  Provider adapters may only claim/record/consume a packet;
 * they do not get to reinterpret its Git or governance bindings.
 */


export const PACKET_TTL_SECONDS = 900;
export const SESSION_REVIEW_TTL_SECONDS = 24 * 60 * 60;
export const PACKET_DIFF_PATH = ".git/agent-pipeline-review.diff";
export const PACKET_FILES = Object.freeze([
  "packet.json", "state.json", "claim.json", "export-native.json", "export-fallback.json",
  "session-admission.json", "result.json", "receipt.json", "cleanup.json",
]);

const REFERENCE_KINDS = new Set(["spec", "calibration", "guardrail", "evidence"]);
const RUNNERS = new Set(["claude", "codex", "antigravity"]);
function textCompare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
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

function git(root, args, { allowNonzero = false, timeout = 5000, input = undefined } = {}) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    // Packet Git is local candidate transport: repository config remains active,
    // while host system/global and inherited command-scope config are excluded.
    env: {
      LANG: "C", LC_ALL: "C", PATH: process.env.PATH ?? "",
      GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_SYSTEM: GIT_NULL_DEVICE,
      GIT_CONFIG_GLOBAL: GIT_NULL_DEVICE, GIT_CONFIG_COUNT: "0",
      GIT_TERMINAL_PROMPT: "0",
    },
    maxBuffer: 32 * 1024 * 1024,
    shell: false,
    timeout,
    input,
  });
  if (result.status === null || result.status === undefined
    || (result.status === 0 && !isSuccessfulSpawn(result))) {
    fail("CPP-GIT", `Git failed to start: ${result.error?.message ?? "unknown error"}`);
  }
  if (!allowNonzero && result.status !== 0) fail("CPP-GIT", `Git ${args[0]} failed.`);
  return result;
}

function gitText(root, args) { return String(git(root, args).stdout).trim(); }
function assertOid(value, objectFormat, label) {
  const length = objectFormat === "sha1" ? 40 : objectFormat === "sha256" ? 64 : 0;
  if (!OID.test(value) || value.length !== length) fail("CPP-REF", `${label} does not match ${objectFormat}.`);
  return value;
}
function unsupportedDirectoryDurability(error) {
  return process.platform === "win32"
    && (error?.code === "EPERM" || error?.code === "EINVAL"
      || error?.code === "EISDIR" || error?.code === "EACCES"
      || error?.code === "ENOTSUP");
}
function fsyncDir(path) {
  // Directory durability is a hard POSIX flush; native Windows raises EPERM/EINVAL
  // on directory handles. Regular-file fsync (above) is the hard guarantee; parent-
  // directory durability is best-effort on Windows and its typed-unavailable outcome
  // is not a failure.
  let fd;
  try {
    fd = openSync(path, "r");
  } catch (error) {
    if (unsupportedDirectoryDurability(error)) return;
    throw error;
  }
  try {
    fsyncSync(fd);
  } catch (error) {
    if (unsupportedDirectoryDurability(error)) return;
    throw error;
  } finally {
    closeSync(fd);
  }
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
  const { packetDir, packet } = packetContext(controlRoot, packetId, { allowLegacyPreAssurance: true });
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
  const { packetDir, packet } = packetContext(controlRoot, packetId, { allowLegacyPreAssurance: true });
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
function advanceState(packetDir, packet, expected, next, body, now) {
  const statePath = join(packetDir, "state.json");
  const state = currentState(packetDir, packet);
  if (!expected.includes(state.phase)) fail("CPP-STATE", `Cannot move packet from ${state.phase} to ${next}.`);
  const successor = recordBody(packet, state.revision + 1, sha256(canonicalJson(state)), next, body, nowIso(now));
  replaceState(statePath, successor);
  return successor;
}
function revalidateCandidate(packet) {
  if(packet.coordinatorOnly?.historicalFreshReview!==undefined
    && !revalidateHistoricalFreshReviewPacketBinding(packet.coordinatorOnly.historicalFreshReview)) fail("CPP-HISTORICAL-ADMISSION","Historical fresh-review source or authority drifted.");
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
  if (packet.diagnostics !== undefined) {
    try { revalidateDiagnosticBundle({ checkout, candidate: packet.candidate, bundle: packet.diagnostics }); }
    catch { fail("CPP-DIAGNOSTIC", "Diagnostic snapshot drifted or is invalid."); }
  }
}

export function prepareCandidatePacket(options, { now = new Date(), nonce = randomBytes, evaluateSignedQualityImportReviewAdmissionFn = evaluateSignedQualityImportReviewAdmission,
  createLocalDispatchEvidenceBindingFn = createLocalDispatchEvidenceBinding } = {}) {
  try {
    const repoRoot = realpathSync(resolve(options.repoRoot));
    const commonDirObserved = gitText(repoRoot, ["rev-parse", "--git-common-dir"]);
    const commonDir = realpathSync(resolve(repoRoot, commonDirObserved));
    const requiredControl = join(commonDir, "agent-pipeline", "critic-packets");
    const controlRoot = assertRealPrivateDir(resolve(options.controlRoot), "control root");
    if (controlRoot !== requiredControl) fail("CPP-CONTROL", "controlRoot is not the canonical Git common-dir packet root.");
    if (!PACKET_ID.test(options.packetId) || !isSafeTaskId(options.taskId) || !SAFE_ID.test(options.projectId)) fail("CPP-ARGUMENT", "Unsafe packet/task/project ID.");
    const route = normalizeRoute(options.route);
    const sessionBinding = options.sessionBinding === undefined ? undefined : normalizeSessionBinding(options.sessionBinding, route);
    const objectFormat = gitText(repoRoot, ["rev-parse", "--show-object-format"]);
    const base = assertOid(options.baseCommit, objectFormat, "baseCommit");
    const candidate = assertOid(options.candidateCommit, objectFormat, "candidateCommit");
    const rulesetOid = assertOid(options.rulesetOid, objectFormat, "rulesetOid");
    const signedImportAnchor = options.signedQualityImportAnchor === undefined
      ? undefined : normalizeCoordinatorOnly({ signedQualityImportAnchor: options.signedQualityImportAnchor }, { base, commit: candidate }).signedQualityImportAnchor;
    const reviewAdmission = signedImportAnchor === undefined
      ? evaluateReviewAdmission({ root: repoRoot, taskId: options.taskId, baseCommit: base, candidateCommit: candidate })
      : evaluateSignedQualityImportReviewAdmissionFn({ root: repoRoot, anchor: signedImportAnchor });
    if (!reviewAdmission.ok) {
      let producerHint = "";
      if (signedImportAnchor === undefined && reviewAdmission.admittedCount === 0) {
        const range = git(repoRoot, ["log", "--format=%B", `${base}..${candidate}`], { allowNonzero: true });
        if (range.status === 0 && /^Dispatch: \S+ \(goldfish\)$/mu.test(String(range.stdout))) {
          producerHint = " The range carries a Goldfish Dispatch trailer: the Elephant can reconstruct the missing record with node plugins/pipeline-core/scripts/dispatch-record-write.mjs --repo-root . --attested-request <request.json>, where the closed request names the briefing, the hand-back text and the delivery commits (pipeline.dispatch-attested-request.v1).";
        }
      }
      fail("CPP-REVIEW-ADMISSION", `Critic review admission is blocked: ${(reviewAdmission.readFindings ?? reviewAdmission.findings ?? []).join("; ")}${producerHint}`);
    }
    if (signedImportAnchor !== undefined && reviewAdmission.code !== "signed-quality-import-review-admitted") fail("CPP-REVIEW-ADMISSION", "Signed import review admission did not return its distinct success code.");
    if (signedImportAnchor !== undefined && options.taskId !== signedImportAnchor.taskId) fail("CPP-COORDINATOR-BINDING", "Packet task identity does not match the signed import intent.");
    const localDispatchEvidence = signedImportAnchor === undefined
      ? createLocalDispatchEvidenceBindingFn({ root: repoRoot, taskId: options.taskId, baseCommit: base, reviewCandidateCommit: candidate })
      : undefined;
    let coordinatorOnly = signedImportAnchor === undefined
      ? normalizeCoordinatorOnly({ localDispatchEvidence }, { base, commit: candidate })
      : normalizeCoordinatorOnly({ signedQualityImportAnchor: signedImportAnchor }, { base, commit: candidate });
    if(reviewAdmission.historicalFreshReview !== undefined) {
      coordinatorOnly=normalizeCoordinatorOnly({...coordinatorOnly,historicalFreshReview:reviewAdmission.historicalFreshReview},{base,commit:candidate});
    }
    const baseType = gitText(repoRoot, ["cat-file", "-t", base]);
    if (gitText(repoRoot, ["cat-file", "-t", candidate]) !== "commit") fail("CPP-REF", "Candidate ref is not a commit.");
    if (baseType === "commit") {
      if (git(repoRoot, ["merge-base", "--is-ancestor", base, candidate], { allowNonzero: true }).status !== 0) fail("CPP-ANCESTRY", "baseCommit is not an ancestor of candidateCommit.");
    } else {
      const parents = gitText(repoRoot, ["rev-list", "--parents", "-n", "1", candidate]).split(/\s+/u);
      const emptyTree = String(git(repoRoot, ["hash-object", "-t", "tree", "--stdin"], { input: "" }).stdout).trim();
      let exactRootSourceDescendant = false;
      if (baseType === "tree" && base === emptyTree && parents.length !== 1
        && reviewAdmission.admittedByDescendant === true
        && typeof reviewAdmission.targetRecordCandidateCommit === "string"
        && OID.test(reviewAdmission.targetRecordCandidateCommit)) {
        const sourceCandidate = reviewAdmission.targetRecordCandidateCommit;
        const sourceParents = gitText(repoRoot, ["rev-list", "--parents", "-n", "1", sourceCandidate]).split(/\s+/u);
        const sourceIsRootCommit = gitText(repoRoot, ["cat-file", "-t", sourceCandidate]) === "commit" && sourceParents.length === 1;
        const sourceIsAncestor = git(repoRoot, ["merge-base", "--is-ancestor", sourceCandidate, candidate], { allowNonzero: true }).status === 0;
        exactRootSourceDescendant = sourceIsRootCommit && sourceIsAncestor;
      }
      if (baseType !== "tree" || base !== emptyTree || (parents.length !== 1 && !exactRootSourceDescendant)) {
        fail("CPP-REF", "Base ref is neither an ancestor commit nor the empty tree of a root candidate or its exact admitted root-source descendant.");
      }
    }
    const candidateTree = assertOid(gitText(repoRoot, ["rev-parse", `${candidate}^{tree}`]), objectFormat, "candidate tree");
    let diagnostics;
    if (options.evidencePaths !== undefined) {
      const specRef = (options.references ?? []).filter(ref => ref.kind === "spec");
      if (specRef.length !== 1) fail("CPP-DIAGNOSTIC", "Diagnostics require exactly one specification reference.");
      const binding = path => ({ path, sha256: sha256(String(git(repoRoot, ["show", `${candidate}:${normalizePacketPath(path)}`]).stdout)) });
      const spec = binding(specRef[0].path);
      const guardrails = (options.references ?? []).filter(ref => ref.kind === "guardrail").map(ref => binding(ref.path));
      try { diagnostics = createDiagnosticBundle({ root: repoRoot, candidate: { commit: candidate, tree: candidateTree }, evidencePaths: options.evidencePaths, spec, guardrails }); }
      catch { fail("CPP-DIAGNOSTIC", "Diagnostic admission or source binding failed."); }
    }
    const diffPaths = changedPaths(repoRoot, base, candidate);
    const packetDir = assertNoSymlinkPath(join(controlRoot, options.packetId), controlRoot, "packet directory");
    mkdirSync(packetDir, { mode: 0o700 });
    if (process.platform === "win32" && hardenWindowsPrivateDirectory(packetDir).status !== "secure") fail("CPP-CONTROL", "packet directory Windows assurance is unavailable or insecure.");
    const checkoutPath = join(packetDir, "checkout");
    const creatorNonce = nonce(32).toString("hex");
    const cleanupCapability = nonce(32).toString("hex");
    createCheckout(repoRoot, checkoutPath, candidate);
    if (diagnostics !== undefined) materializeDiagnosticBundle(checkoutPath, diagnostics);
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
      request: {
        taskId: options.taskId,
        projectId: options.projectId,
        trigger: options.trigger ?? "T1",
        ...(sessionBinding === undefined ? {} : { sessionBinding }),
      },
      ruleset: { oid: rulesetOid, objectFormat },
      route,
      candidate: { base, commit: candidate, tree: candidateTree },
      diff,
      diffPaths,
      references: normalizeReferences(options.references ?? [], candidateByPath),
      governance,
      coordinatorOnly,
      ...(diagnostics === undefined ? {} : { diagnostics }),
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

export function claimCandidatePacket({ controlRoot, packetId, adapter, claimantNonce, lineage = null }, { now = new Date() } = {}) {
  const { packetDir, packet } = packetContext(controlRoot, packetId);
  assertLive(packet, now);
  if (packet.route.adapter !== adapter || !SHA256.test(claimantNonce)) fail("CPP-CLAIM", "Claim adapter or nonce mismatch.");
  revalidateCandidate(packet);
  const state = currentState(packetDir, packet);
  if (state.phase !== "prepared") fail("CPP-CLAIM", "Packet is not claimable.");
  let criticReviewLineageSha256 = null;
  if (lineage !== null) {
    const admission = validateCriticLineagePacketAdmission(lineage, packet);
    if (!admission.ok) fail("CPP-LINEAGE", `Critic lineage is not admissible: ${admission.code}`);
    criticReviewLineageSha256 = admission.lineageSha256;
  }
  const timestamp = nowIso(now);
  const body = criticReviewLineageSha256 === null
    ? { adapter, claimantNonce }
    : { adapter, claimantNonce, criticReviewLineageSha256 };
  const claim = { schema: RECORD_SCHEMA, packetId, packetDigest: sha256(canonicalJson(packet)), revision: 2, priorStateDigest: sha256(canonicalJson(state)), timestamp, phase: "claimed", body };
  publishExclusive(join(packetDir, "claim.json"), claim);
  replaceState(join(packetDir, "state.json"), recordBody(packet, 2, claim.priorStateDigest, "claimed", claim.body, timestamp));
  return { ok: true, code: "CPP-CLAIMED", packet, claim };
}

/** Read back the exact durable claim without issuing a new one. */
export function inspectClaimedCandidatePacket({ controlRoot, packetId }, { now = new Date(), allowLegacyPreAssurance = false } = {}) {
  const { packetDir, packet } = packetContext(controlRoot, packetId, { allowLegacyPreAssurance });
  revalidateCandidate(packet);
  const state = currentState(packetDir, packet);
  if (state.phase !== "claimed" || state.revision !== 2) fail("CPP-CLAIM-READ", "Packet is not in its claimed phase.");
  const claim = readJson(join(packetDir, "claim.json"));
  if (claim.schema !== RECORD_SCHEMA || claim.packetId !== packetId
    || claim.packetDigest !== sha256(canonicalJson(packet)) || claim.revision !== 2
    || claim.priorStateDigest !== state.priorStateDigest
    || claim.timestamp !== state.timestamp
    || canonicalJson(claim.body) !== canonicalJson(state.body)) fail("CPP-CLAIM-READ", "Claim and state differ.");
  if (packet.request.sessionBinding === undefined) assertLive(packet, now);
  else {
    const timestamp = new Date(now).getTime();
    const claimedAt = Date.parse(claim.timestamp);
    if (!Number.isFinite(timestamp) || !Number.isFinite(claimedAt)
      || timestamp < claimedAt || timestamp > claimedAt + SESSION_REVIEW_TTL_SECONDS * 1000) {
      fail("CPP-EXPIRED", "Claimed session review completion window expired.");
    }
  }
  return { ok: true, code: "CPP-CLAIM-READ", packet, claim, state };
}

/** Publish one session-only prelaunch admission bound to the durable claim. */
export function publishClaimedSessionAdmission({ controlRoot, packetId, preflightSha256, courseSourceSha256, courseDecisionSha256 }, { now = new Date() } = {}) {
  if (![preflightSha256, courseSourceSha256, courseDecisionSha256].every((value) => typeof value === "string" && SHA256.test(value))) {
    fail("CPP-SESSION-ADMISSION", "Admission digests are invalid.");
  }
  const { packet, claim } = inspectClaimedCandidatePacket({ controlRoot, packetId }, { now });
  assertLive(packet, now);
  const binding = packet.request.sessionBinding;
  if (!binding || binding.preflightSha256 !== preflightSha256
    || packet.route.projectionDigest !== preflightSha256) fail("CPP-SESSION-ADMISSION", "Session preflight binding differs.");
  const { packetDir } = packetContext(controlRoot, packetId);
  const admission = {
    schema: SESSION_ADMISSION_SCHEMA,
    packetId,
    packetDigest: sha256(canonicalJson(packet)),
    claimSha256: sha256(canonicalJson(claim)),
    sessionId: binding.sessionId,
    preflightSha256,
    courseSourceSha256,
    courseDecisionSha256,
    createdAt: nowIso(now),
  };
  publishExclusive(join(packetDir, "session-admission.json"), admission);
  return inspectClaimedSessionAdmission({ controlRoot, packetId }, { now });
}

/** Re-read the exact admission while the packet is still claimed. */
export function inspectClaimedSessionAdmission({ controlRoot, packetId }, { now = new Date() } = {}) {
  const { packet, claim } = inspectClaimedCandidatePacket({ controlRoot, packetId }, { now, allowLegacyPreAssurance: true });
  const { packetDir } = packetContext(controlRoot, packetId, { allowLegacyPreAssurance: true });
  const admissionPath = join(packetDir, "session-admission.json");
  if (!existsSync(admissionPath)) fail("CPP-SESSION-ADMISSION", "Session admission is absent.");
  const admission = readJson(admissionPath, "CPP-SESSION-ADMISSION");
  const binding = packet.request.sessionBinding;
  if (!exactKeys(admission, ["schema", "packetId", "packetDigest", "claimSha256", "sessionId", "preflightSha256", "courseSourceSha256", "courseDecisionSha256", "createdAt"])
    || admission.schema !== SESSION_ADMISSION_SCHEMA || admission.packetId !== packetId
    || admission.packetDigest !== sha256(canonicalJson(packet))
    || admission.claimSha256 !== sha256(canonicalJson(claim))
    || !binding || admission.sessionId !== binding.sessionId
    || admission.preflightSha256 !== binding.preflightSha256
    || admission.preflightSha256 !== packet.route.projectionDigest
    || !SHA256.test(admission.courseSourceSha256) || !SHA256.test(admission.courseDecisionSha256)
    || typeof admission.createdAt !== "string" || !Number.isFinite(Date.parse(admission.createdAt))) {
    fail("CPP-SESSION-ADMISSION", "Session admission is absent or drifted.");
  }
  // Digest checks above use the raw packet; the returned view carries the normalized coordinator binding.
  const view = normalizedPacketView(packet);
  return { ok: true, code: "CPP-SESSION-ADMISSION-READ", packet: view, claim, admission };
}

export function recordCandidateResult({ controlRoot, packetId, result }, { now = new Date() } = {}) {
  const { packetDir, packet } = packetContext(controlRoot, packetId, { allowLegacyPreAssurance: true });
  revalidateCandidate(packet);
  if (!isObject(result)) fail("CPP-RESULT", "Result must be an object.");
  const state = currentState(packetDir, packet);
  if (state.phase === "result-recorded") {
    const existing = readJson(join(packetDir, "result.json"));
    if (canonicalJson(existing.body) !== canonicalJson(result)) fail("CPP-RESULT-REPLAY", "Result replay does not match the durable result.");
    return { ok: true, code: "CPP-RESULT-RECORDED", replay: true, packet, record: existing };
  }
  if (state.phase !== "claimed") fail("CPP-RESULT", "Packet has not been claimed.");
  if (packet.request.sessionBinding === undefined) assertLive(packet, now);
  else inspectClaimedSessionAdmission({ controlRoot, packetId }, { now });
  const timestamp = nowIso(now);
  const record = { schema: RECORD_SCHEMA, packetId, packetDigest: sha256(canonicalJson(packet)), revision: state.revision + 1, priorStateDigest: sha256(canonicalJson(state)), timestamp, phase: "result-recorded", body: result };
  publishExclusive(join(packetDir, "result.json"), record);
  replaceState(join(packetDir, "state.json"), recordBody(packet, record.revision, record.priorStateDigest, record.phase, record.body, timestamp));
  return { ok: true, code: "CPP-RESULT-RECORDED", replay: false, packet, record };
}

export function consumeCandidatePacket({ controlRoot, packetId, receipt }, { now = new Date() } = {}) {
  const { packetDir, packet } = packetContext(controlRoot, packetId, { allowLegacyPreAssurance: true });
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
  // Cleanup acts on the packet the finalizer just consumed through the explicit legacy read, so it reads it the same way.
  const { packetDir, packet } = packetContext(controlRoot, packetId, { allowLegacyPreAssurance: true });
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
  const { packetDir, packet } = packetContext(controlRoot, packetId, { allowLegacyPreAssurance: true });
  if (typeof code !== "string" || !code.startsWith("CPP-")) fail("CPP-BLOCK", "Invalid block code.");
  const state = currentState(packetDir, packet);
  if (["consumed", "blocked"].includes(state.phase)) fail("CPP-BLOCK", "Terminal packet cannot be blocked again.");
  const blocked = advanceState(packetDir, packet, ["prepared", "claimed", "result-recorded"], "blocked", { code, detail }, now);
  return { ok: false, code, state: blocked };
}

export const __test = Object.freeze({ bindingsFor, observeCheckout, candidateInventory });

/** Observe the real owner and canonical packet root before genuine claim. */
export function claimCriticPacketWithLaunchContext(input, options) {
  if (options === undefined || exactKeys(options, [])
    || (exactKeys(options, ["hostDispatchContext"]) && options.hostDispatchContext === undefined)) {
    throw new CriticPacketError("DBLO-CURRENT-HOST-UNAVAILABLE", "Launch observation refused.");
  }
  if (!exactKeys(options, ["hostDispatchContext"])) {
    throw new CriticPacketError("DBLO-HANDLE-INVALID", "Launch observation refused.");
  }
  const required = ["rootDir", "controlRoot", "packetId", "adapter", "claimantNonce"];
  if (!(exactKeys(input, required) || exactKeys(input, [...required, "lineage"]))) {
    throw new CriticPacketError("DBLO-HANDLE-INVALID", "Launch observation refused.");
  }
  const observe = () => {
    const observed = readDispatchBudgetLaunchObservation({ rootDir: input.rootDir,
      hostDispatchContext: options.hostDispatchContext });
    if (!observed.ok) throw new CriticPacketError(observed.code, "Launch observation refused.");
    if (observed.value.status !== "working" && observed.value.status !== "not-applicable") {
      throw new CriticPacketError(observed.value.code, "Launch observation refused.");
    }
  };
  observe();
  let common, requiredControl;
  try {
    const root = realpathSync(input.rootDir);
    common = realpathSync(resolve(root, gitText(root, ["rev-parse", "--git-common-dir"])));
    requiredControl = join(common, "agent-pipeline", "critic-packets");
    if (typeof input.controlRoot !== "string" || resolve(input.controlRoot) !== requiredControl) {
      throw new CriticPacketError("DBLO-ROOT-BINDING", "Launch observation refused.");
    }
  } catch (error) {
    if (error instanceof CriticPacketError && error.code === "DBLO-ROOT-BINDING") throw error;
    throw new CriticPacketError("DBLO-ROOT-BINDING", "Launch observation refused.");
  }
  // Retain the original physical, private and symlink policy without writes.
  assertNoSymlinkPath(requiredControl, common, "control root");
  if (assertRealPrivateDir(requiredControl, "control root") !== requiredControl) {
    throw new CriticPacketError("DBLO-ROOT-BINDING", "Launch observation refused.");
  }
  observe();
  return claimCandidatePacket({ controlRoot: input.controlRoot, packetId: input.packetId,
    adapter: input.adapter, claimantNonce: input.claimantNonce,
    ...(Object.hasOwn(input, "lineage") ? { lineage: input.lineage } : {}),
  });
}

// Generic accounting retains the existing packet owner and genuine lifecycle readers.
export { registerGenericCriticBatch, appendGenericCriticBatchCorrection, readGenericCriticBatchAdmission, reserveGenericCriticBatchAdmission, readReservedGenericCriticBatchAdmission } from "../lib/critic-generic-batch.mjs";
