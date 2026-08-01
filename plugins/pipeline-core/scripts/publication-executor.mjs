#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Fixed exact-candidate publication executor.
 *
 * The caller selects only an existing authority record. Repository identity,
 * endpoint, candidate, destination and Git argv are all recovered from and
 * checked against that record. No generic Git arguments or retry surface exist.
 */
import { createHash, randomBytes } from "node:crypto";
import {
  accessSync, closeSync, constants, fstatSync, lstatSync, mkdtempSync, openSync,
  readFileSync, realpathSync, rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  activatePublicationAuthorityV2,
  beginPublicationExecutionAuthority,
  closePublicationExecutionAuthority,
  observePublicationExecutionAuthority,
  readPublicationAuthority,
  preparePublicationAuthorityV2,
  startPublicationExecutionReadback,
} from "../lib/publication-authority.mjs";
import {
  PUBLICATION_SCHEMA,
  publicationDigest,
  publicationRemoteFingerprint,
  publicationRepositoryFingerprint,
} from "../lib/publication-bundle.mjs";
import { PUBLICATION_SCHEMA_V2 } from "../lib/publication-bundle-v2.mjs";
import {
  createPublicationCapabilityPreflight,
  validatePublicationCapabilityPreflight,
} from "../lib/publication-capability-preflight.mjs";
import { validateReleasePreflight } from "./release-preflight.mjs";
export {
  publicationRemoteFingerprint,
  publicationRepositoryFingerprint,
} from "../lib/publication-bundle.mjs";

export const PUBLICATION_EXECUTOR_RESULT_SCHEMA = "pipeline.publication-executor-result.v1";
export const PUBLICATION_EXECUTOR_RESULT_SCHEMA_V2 = "pipeline.publication-executor-result.v2";
export const PUBLICATION_EXECUTOR_ERROR_SCHEMA = "pipeline.publication-executor-error.v1";
const SHA256 = /^[0-9a-f]{64}$/u;
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const TRANSACTION = /^[A-Za-z0-9._:@/-]{1,200}$/u;
const CHANNELS = new Set(["private", "neutral-public"]);
const MAIN_REF = "refs/heads/main";
const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const PUBLICATION_AUTHORIZATION_PLAN_SCHEMA = "pipeline.publication-authorization-plan.v2";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
const sha256 = (value) => createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : canonical(value)).digest("hex");

export class PublicationExecutorError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PublicationExecutorError";
    this.code = code;
  }
}
function fail(code, message) {
  throw new PublicationExecutorError(code, message);
}

function nativeGit(args, options = {}) {
  return spawnSync("git", args, {
    cwd: options.cwd,
    encoding: "utf8",
    timeout: options.timeout ?? 15_000,
    env: options.env,
  });
}

function gitEnvironment(extra = {}) {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "Never",
    GIT_ASKPASS: "",
    SSH_ASKPASS: "",
    GIT_ALTERNATE_OBJECT_DIRECTORIES: "",
    ...extra,
  };
}

function checkedGit(runGit, args, { cwd, code, timeout, env = gitEnvironment() }) {
  const result = runGit(args, { cwd, timeout, env });
  if (result?.status !== 0) fail(code, "required Git observation was unavailable");
  return String(result.stdout ?? "").trim();
}

function physicalRepository(rootDir, runGit) {
  if (!isAbsolute(rootDir)) fail("PX-ROOT", "repository root must be absolute");
  let root;
  try { root = realpathSync(rootDir); } catch { fail("PX-ROOT", "repository root is unavailable"); }
  if (root !== resolve(rootDir)) fail("PX-ROOT", "repository root must be addressed by its physical path");
  const top = checkedGit(runGit, ["rev-parse", "--show-toplevel"], { cwd: root, code: "PX-REPOSITORY" });
  let physicalTop;
  try { physicalTop = realpathSync(top); } catch { fail("PX-REPOSITORY", "repository worktree is unavailable"); }
  if (physicalTop !== root) fail("PX-REPOSITORY", "selected root is not the repository worktree root");
  const rawCommon = checkedGit(runGit, ["rev-parse", "--git-common-dir"], { cwd: root, code: "PX-REPOSITORY" });
  let common;
  try { common = realpathSync(isAbsolute(rawCommon) ? rawCommon : resolve(root, rawCommon)); } catch {
    fail("PX-REPOSITORY", "Git common directory is unavailable");
  }
  return { root, common };
}

function remoteBinding(root, remoteName, runGit) {
  const output = checkedGit(runGit, ["remote", "get-url", "--push", "--all", remoteName], {
    cwd: root,
    code: "PX-REMOTE",
  });
  const urls = output.split(/\r?\n/u).filter(Boolean);
  try {
    return { fingerprint: publicationRemoteFingerprint(remoteName, urls), endpoint: urls[0] };
  } catch {
    fail("PX-REMOTE", "publication remote must resolve to exactly one push endpoint");
  }
}

function exactRemoteOid(root, remote, destinationRef, runGit) {
  const result = runGit(["ls-remote", "--refs", remote, destinationRef], {
    cwd: root,
    timeout: 20_000,
    env: gitEnvironment(),
  });
  if (result?.status !== 0) fail("PX-REMOTE-OBSERVATION", "remote preimage observation was unavailable");
  const lines = String(result.stdout ?? "").trim().split(/\r?\n/u).filter(Boolean);
  if (lines.length === 0) return null;
  if (lines.length !== 1) fail("PX-REMOTE-AMBIGUOUS", "remote destination observation was ambiguous");
  const fields = lines[0].split(/\s+/u);
  if (fields.length !== 2 || !OID.test(fields[0]) || fields[1] !== destinationRef) {
    fail("PX-REMOTE-AMBIGUOUS", "remote destination observation was malformed");
  }
  return fields[0];
}

function exactObjectTree(root, oid, runGit, label) {
  const exact = checkedGit(runGit, ["rev-parse", "--verify", "--end-of-options", `${oid}^{commit}`], {
    cwd: root,
    code: `PX-${label}-COMMIT`,
  });
  if (exact !== oid) fail(`PX-${label}-COMMIT`, `${label.toLowerCase()} commit identity drifted`);
  const tree = checkedGit(runGit, ["rev-parse", "--verify", "--end-of-options", `${oid}^{tree}`], {
    cwd: root,
    code: `PX-${label}-TREE`,
  });
  if (!OID.test(tree)) fail(`PX-${label}-TREE`, `${label.toLowerCase()} tree identity is invalid`);
  return tree;
}

function safeEvidenceBytes(root, relativePath, label) {
  if (typeof relativePath !== "string" || relativePath === "" || relativePath.startsWith("/") || relativePath.split(/[\\/]/u).includes("..")) fail("PX-EVIDENCE", `${label} evidence path is invalid`);
  const absolute = resolve(root, relativePath);
  const rel = relative(root, absolute);
  if (rel.startsWith("..") || isAbsolute(rel)) fail("PX-EVIDENCE", `${label} evidence escaped the repository`);
  let physical;
  try { physical = realpathSync(absolute); } catch { fail("PX-EVIDENCE", `${label} evidence is unavailable`); }
  if (physical !== absolute) fail("PX-EVIDENCE", `${label} evidence path is not physical`);
  let stat;
  try { stat = lstatSync(absolute); } catch { fail("PX-EVIDENCE", `${label} evidence is unavailable`); }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) fail("PX-EVIDENCE", `${label} evidence is not a single-link physical regular file`);
  let fd;
  let bytes;
  try {
    fd = openSync(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(fd);
    bytes = readFileSync(fd);
    const after = fstatSync(fd);
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) {
      fail("PX-EVIDENCE", `${label} evidence changed while it was read`);
    }
  } catch (error) {
    if (error instanceof PublicationExecutorError) throw error;
    fail("PX-EVIDENCE", `${label} evidence cannot be read safely`);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  return bytes;
}

function evidenceDigest(root, evidence, label) {
  const digest = sha256(safeEvidenceBytes(root, evidence.path, label));
  if (digest !== evidence.rawDigest) fail("PX-EVIDENCE", `${label} evidence digest drifted`);
  return digest;
}

function readBoundEvidenceRecord(root, evidence, label) {
  const bytes = safeEvidenceBytes(root, evidence.path, label);
  if (sha256(bytes) !== evidence.rawDigest) fail("PX-EVIDENCE", `${label} evidence digest drifted`);
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { fail("PX-EVIDENCE", `${label} evidence JSON is invalid`); }
}

function validateTuple(record, repository, remote, now, runGit, recovery = false) {
  const state = record.publication;
  const destinationRef = state.schema === PUBLICATION_SCHEMA_V2 ? state.destinationRef : MAIN_REF;
  if ((recovery ? record.status !== "executing" : record.status !== "active") || state.phase !== "push-authorized") {
    fail("PX-AUTHORITY", "publication authority is not available at the fixed execution boundary");
  }
  if (state.schema === PUBLICATION_SCHEMA && state.destinationRef !== MAIN_REF) fail("PX-DESTINATION", "fixed v1 publication destination must be refs/heads/main");
  if (publicationRepositoryFingerprint(repository) !== state.repositoryFingerprint) fail("PX-REPOSITORY", "repository fingerprint drifted");
  if (remote.fingerprint !== state.remoteFingerprint) fail("PX-REMOTE", "sanitized remote fingerprint drifted");
  if (state.approval.tupleDigest !== state.pushIntent.tupleDigest
    || state.approval.id !== state.pushIntent.approvalId) fail("PX-APPROVAL", "approval digest binding drifted");
  if (!recovery && (!Number.isSafeInteger(now) || now < state.approval.approvedAt || now > state.approval.expiresAt)) {
    fail("PX-APPROVAL-EXPIRED", "publication approval is expired");
  }
  if (JSON.stringify(state.pushIntent.command)
    !== JSON.stringify(["git", "push", "--porcelain", state.remoteName, `${state.candidateOid}:${destinationRef}`])) {
    fail("PX-COMMAND", "publication authority carries a non-fixed Git intent");
  }
  const sourceTree = exactObjectTree(repository.root, state.sourceCommit, runGit, "SOURCE");
  if (sourceTree !== state.sourceTree) fail("PX-SOURCE-TREE", "source tree drifted");
  const candidateTree = exactObjectTree(repository.root, state.candidateOid, runGit, "CANDIDATE");
  if (candidateTree !== state.candidateTree) fail("PX-CANDIDATE-TREE", "candidate tree drifted");
  if (state.schema === PUBLICATION_SCHEMA_V2) {
    const identity = readBoundEvidenceRecord(repository.root, state.identityProbe, "identity");
    const verify = readBoundEvidenceRecord(repository.root, state.verifyEvidence, "Verify");
    const security = readBoundEvidenceRecord(repository.root, state.securityEvidence, "Security");
    const critic = readBoundEvidenceRecord(repository.root, state.criticEvidence, "Critic");
    const release = readBoundEvidenceRecord(repository.root, state.releasePreflightEvidence, "release preflight");
    requireSuccessfulGate(identity, "identity", state.candidateOid, state.candidateTree);
    requireSuccessfulGate(verify, "verify", state.candidateOid, state.candidateTree);
    requireSuccessfulGate(security, "security", state.candidateOid, state.candidateTree);
    requireSuccessfulGate(critic, "critic", state.candidateOid, state.candidateTree);
    try { validateReleasePreflight(release); } catch { fail("PX-RELEASE-PREFLIGHT", "release preflight evidence is invalid"); }
    const capabilityRequirement = release.extensions.requirements.find((item) => item.id === "publication-capability-preflight");
    if (release.status !== "ready" || capabilityRequirement?.sha256 !== state.capabilityPreflight.recordSha256 || capabilityRequirement.status !== "accepted") fail("PX-RELEASE-PREFLIGHT", "release preflight capability binding drifted");
    validatePublicationCapabilityPreflight(state.capabilityPreflight);
    const currentExecutorSha256 = sha256(readFileSync(SCRIPT_PATH));
    if (state.executorSha256 !== currentExecutorSha256 || state.capabilityPreflight.executor.evidenceSha256 !== currentExecutorSha256) {
      fail("PX-EXECUTOR-DRIFT", "publication executor identity drifted");
    }
  } else {
    evidenceDigest(repository.root, state.identityProbe, "identity");
    evidenceDigest(repository.root, state.verifyEvidence, "Verify");
    evidenceDigest(repository.root, state.securityEvidence, "Security");
  }
  if (state.remotePreimageOid !== null) {
    const ancestry = runGit(["merge-base", "--is-ancestor", state.remotePreimageOid, state.candidateOid], {
      cwd: repository.root,
      timeout: 10_000,
      env: gitEnvironment(),
    });
    if (ancestry?.status !== 0) fail("PX-NON-FAST-FORWARD", "candidate is not a fast-forward of the authorized preimage");
  }
}

function freshAlternatesDisabledReadback(endpoint, destinationRef, runGit) {
  const directory = mkdtempSync(join(tmpdir(), "pipeline-publication-readback-"));
  const env = gitEnvironment();
  try {
    const init = runGit(["init", "--bare", "--quiet", directory], { cwd: directory, timeout: 10_000, env });
    if (init?.status !== 0) return { available: false, oid: null, tree: null };
    const oidResult = runGit(["ls-remote", "--refs", endpoint, destinationRef], {
      cwd: directory,
      timeout: 20_000,
      env,
    });
    if (oidResult?.status !== 0) return { available: false, oid: null, tree: null };
    const lines = String(oidResult.stdout ?? "").trim().split(/\r?\n/u).filter(Boolean);
    if (lines.length === 0) return { available: true, oid: null, tree: null };
    if (lines.length !== 1) return { available: false, oid: null, tree: null };
    const [oid, ref, ...extra] = lines[0].split(/\s+/u);
    if (extra.length !== 0 || !OID.test(oid ?? "") || ref !== destinationRef) return { available: false, oid: null, tree: null };
    const fetch = runGit(["fetch", "--quiet", "--no-tags", "--no-recurse-submodules", endpoint, destinationRef], {
      cwd: directory,
      timeout: 30_000,
      env,
    });
    if (fetch?.status !== 0) return { available: false, oid: null, tree: null };
    const fetchedOid = checkedGit(runGit, ["rev-parse", "--verify", "FETCH_HEAD^{commit}"], {
      cwd: directory,
      code: "PX-READBACK",
      env,
    });
    const tree = checkedGit(runGit, ["rev-parse", "--verify", "FETCH_HEAD^{tree}"], {
      cwd: directory,
      code: "PX-READBACK",
      env,
    });
    return fetchedOid === oid && OID.test(tree) ? { available: true, oid, tree } : { available: false, oid: null, tree: null };
  } catch {
    return { available: false, oid: null, tree: null };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function cell(status, kind, binding = "") {
  return { status, evidenceSha256: sha256({ schema: "pipeline.publication-capability-cell-evidence.v1", kind, status, binding }) };
}

function workflowUpdateRequired(root, preimage, candidate, runGit) {
  const args = preimage === null
    ? ["diff-tree", "--no-commit-id", "--name-only", "-r", candidate, "--", ".github/workflows"]
    : ["diff", "--name-only", preimage, candidate, "--", ".github/workflows"];
  return checkedGit(runGit, args, { cwd: root, code: "PX-WORKFLOW-OBSERVATION" }).split(/\r?\n/u).some(Boolean);
}

function defaultCapabilityObservation({ endpoint, workflowRequired, remoteFingerprint }) {
  const local = isAbsolute(endpoint) || endpoint.startsWith("file://");
  if (!local) {
    // A configured endpoint, authenticated read, or advertised credential does
    // not prove ref-write, workflow-write, or branch-policy admission. The
    // fixed default therefore reports non-local providers unavailable. A
    // provider adapter may replace this only with authoritative read-only
    // permission/policy observations; write probes and secret output remain
    // outside this contract.
    return {
      credential: cell("unavailable", "credential"), permissions: cell("unavailable", "permissions"),
      workflowUpdate: cell(workflowRequired ? "unavailable" : "not-required", "workflow-update", workflowRequired ? "required" : "not-required"),
      policy: cell("unavailable", "policy"),
    };
  }
  let writable = false;
  try {
    const path = endpoint.startsWith("file://") ? fileURLToPath(endpoint) : endpoint;
    accessSync(path, constants.W_OK); writable = true;
  } catch { writable = false; }
  return {
    credential: cell("available", "credential", "local-fixed-transport"),
    permissions: cell(writable ? "available" : "insufficient", "permissions", remoteFingerprint),
    workflowUpdate: cell(workflowRequired ? (writable ? "available" : "insufficient") : "not-required", "workflow-update", workflowRequired ? remoteFingerprint : "not-required"),
    policy: cell("available", "policy", "local-bare-ref-policy"),
  };
}

export function preflightPublication({ rootDir, preflightId, candidateOid, remoteName, destinationRef }, dependencies = {}) {
  if (!TRANSACTION.test(preflightId ?? "") || !OID.test(candidateOid ?? "")
    || !/^[A-Za-z0-9._-]{1,80}$/u.test(remoteName ?? "")
    || !/^refs\/heads\/[A-Za-z0-9._/-]+$/u.test(destinationRef ?? "")
    || destinationRef.includes("..") || destinationRef.includes("*")) fail("PX-INPUT", "publication preflight input is invalid");
  const runGit = dependencies.runGit ?? nativeGit;
  const repository = physicalRepository(rootDir, runGit);
  const candidateTree = exactObjectTree(repository.root, candidateOid, runGit, "CANDIDATE");
  const executorSha256 = sha256(readFileSync(SCRIPT_PATH));
  let remote;
  try { remote = remoteBinding(repository.root, remoteName, runGit); }
  catch (error) {
    const remoteStatus = String(error?.message ?? "").includes("exactly one") ? "insufficient" : "unavailable";
    const unavailable = cell(remoteStatus, "remote", remoteStatus === "insufficient" ? "ambiguous" : "transport-unavailable");
    return createPublicationCapabilityPreflight({
      preflightId, candidate: { commit: candidateOid, tree: candidateTree },
      remote: { name: remoteName, fingerprint: sha256({ remoteName, unavailable: true }), ...unavailable },
      destinationRef, remotePreimage: null, credential: cell("unavailable", "credential"),
      permissions: cell("unavailable", "permissions"), workflowUpdate: cell("unavailable", "workflow-update"),
      policy: cell("unavailable", "policy"), executor: cell("available", "executor", executorSha256),
    });
  }
  let preimage;
  try { preimage = exactRemoteOid(repository.root, remote.endpoint, destinationRef, runGit); }
  catch {
    return createPublicationCapabilityPreflight({
      preflightId, candidate: { commit: candidateOid, tree: candidateTree },
      remote: { name: remoteName, fingerprint: remote.fingerprint, ...cell("unavailable", "remote", remote.fingerprint) },
      destinationRef, remotePreimage: null, credential: cell("unavailable", "credential"),
      permissions: cell("unavailable", "permissions"), workflowUpdate: cell("unavailable", "workflow-update"),
      policy: cell("unavailable", "policy"), executor: cell("available", "executor", executorSha256),
    });
  }
  if (preimage !== null) {
    const ancestry = runGit(["merge-base", "--is-ancestor", preimage, candidateOid], { cwd: repository.root, timeout: 10_000, env: gitEnvironment() });
    if (ancestry?.status !== 0) fail("PX-NON-FAST-FORWARD", "candidate is not a fast-forward of the observed preimage");
  }
  const workflowRequired = workflowUpdateRequired(repository.root, preimage, candidateOid, runGit);
  const observe = dependencies.observeCapabilities ?? defaultCapabilityObservation;
  const capabilities = observe({ root: repository.root, endpoint: remote.endpoint, remoteName, remoteFingerprint: remote.fingerprint, destinationRef, preimage, candidateOid, candidateTree, workflowRequired });
  return createPublicationCapabilityPreflight({
    preflightId, candidate: { commit: candidateOid, tree: candidateTree },
    remote: { name: remoteName, fingerprint: remote.fingerprint, ...cell("available", "remote", remote.fingerprint) },
    destinationRef, remotePreimage: preimage,
    credential: capabilities.credential, permissions: capabilities.permissions,
    workflowUpdate: capabilities.workflowUpdate, policy: capabilities.policy,
    executor: { status: "available", evidenceSha256: executorSha256 },
  });
}

function readJsonEvidence(root, relativePath, candidateOid, candidateTree, label) {
  const bytes = safeEvidenceBytes(root, relativePath, label);
  const descriptor = { path: relativePath, rawDigest: sha256(bytes), commit: candidateOid, tree: candidateTree };
  let record;
  try { record = JSON.parse(bytes.toString("utf8")); } catch { fail("PX-EVIDENCE", `${label} evidence JSON is invalid`); }
  const binding = record.candidate ?? record;
  const commit = binding.commit ?? binding.candidateOid ?? record.candidateCommit;
  const tree = binding.tree ?? binding.candidateTree ?? record.candidateTree;
  if (commit !== candidateOid || tree !== candidateTree) fail("PX-EVIDENCE", `${label} evidence candidate binding drifted`);
  return { descriptor, record };
}

function requireSuccessfulGate(record, gate, candidateOid, candidateTree) {
  const candidate = record?.candidate;
  if (!candidate || candidate.commit !== candidateOid || candidate.tree !== candidateTree) fail("PX-GATE-EVIDENCE", `${gate} evidence candidate binding is invalid`);
  if (record.schema === "pipeline.publication-gate-evidence.v1") {
    const keys = ["schema", "gate", "candidate", "status", "exitCode"].sort();
    if (JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(keys) || record.gate !== gate || record.status !== "passed" || record.exitCode !== 0) fail("PX-GATE-EVIDENCE", `${gate} evidence did not pass`);
    return;
  }
  if (record.schema === "pipeline.nova-a-gate-observation.v1") {
    if (record.gate !== gate || record.status !== "passed" || record.exitCode !== 0) fail("PX-GATE-EVIDENCE", `${gate} evidence did not pass`);
    return;
  }
  if (gate === "critic" && typeof record.schema === "string" && record.schema.includes("critic-evidence")
    && record.status === "passed" && record.review?.verdict === "pass" && Array.isArray(record.review.findings) && record.review.findings.length === 0) return;
  fail("PX-GATE-EVIDENCE", `${gate} evidence schema or terminal outcome is invalid`);
}

export function preparePublicationTransaction({ rootDir, transactionId, channel, preflightPath, identityPath, verifyPath, securityPath, criticPath, releasePreflightPath, neutralEvidence = null }, dependencies = {}) {
  if (!TRANSACTION.test(transactionId ?? "") || !CHANNELS.has(channel)) fail("PX-INPUT", "publication prepare selection is invalid");
  const runGit = dependencies.runGit ?? nativeGit;
  const repository = physicalRepository(rootDir, runGit);
  let capability;
  try { capability = JSON.parse(safeEvidenceBytes(repository.root, preflightPath, "publication capability preflight").toString("utf8")); } catch (error) {
    if (error instanceof PublicationExecutorError) throw error;
    fail("PX-PREFLIGHT", "publication capability preflight is unavailable");
  }
  try { validatePublicationCapabilityPreflight(capability); } catch { fail("PX-PREFLIGHT", "publication capability preflight is invalid"); }
  if (capability.status !== "ready") fail("PX-PREFLIGHT-BLOCKED", "publication capability preflight is not ready");
  const fresh = preflightPublication({ rootDir: repository.root, preflightId: capability.preflightId, candidateOid: capability.candidate.commit, remoteName: capability.remote.name, destinationRef: capability.destinationRef }, dependencies);
  if (fresh.recordSha256 !== capability.recordSha256) fail("PX-PREFLIGHT-STALE", "publication capability preflight is stale");
  const candidateOid = capability.candidate.commit; const candidateTree = capability.candidate.tree;
  const identity = readJsonEvidence(repository.root, identityPath, candidateOid, candidateTree, "identity");
  const verify = readJsonEvidence(repository.root, verifyPath, candidateOid, candidateTree, "Verify");
  const security = readJsonEvidence(repository.root, securityPath, candidateOid, candidateTree, "Security");
  const critic = readJsonEvidence(repository.root, criticPath, candidateOid, candidateTree, "Critic");
  const releasePreflight = readJsonEvidence(repository.root, releasePreflightPath, candidateOid, candidateTree, "release preflight");
  requireSuccessfulGate(identity.record, "identity", candidateOid, candidateTree);
  requireSuccessfulGate(verify.record, "verify", candidateOid, candidateTree);
  requireSuccessfulGate(security.record, "security", candidateOid, candidateTree);
  requireSuccessfulGate(critic.record, "critic", candidateOid, candidateTree);
  try { validateReleasePreflight(releasePreflight.record); } catch { fail("PX-RELEASE-PREFLIGHT", "release preflight evidence is invalid"); }
  const capabilityRequirement = releasePreflight.record.extensions.requirements.find((item) => item.id === "publication-capability-preflight");
  if (releasePreflight.record.status !== "ready" || releasePreflight.record.extensions.status !== "registered"
    || capabilityRequirement?.sha256 !== capability.recordSha256 || capabilityRequirement.status !== "accepted") {
    fail("PX-RELEASE-PREFLIGHT", "release preflight is not bound to the current remote capability");
  }
  const proofSha256 = sha256({ schema: "pipeline.publication-fast-forward-proof.v1", baseOid: capability.remotePreimage, candidateOid, remoteFingerprint: capability.remote.fingerprint, destinationRef: capability.destinationRef });
  return preparePublicationAuthorityV2({
    gitCommonDir: repository.common,
    input: {
      channel, transactionId, repositoryFingerprint: publicationRepositoryFingerprint(repository),
      sourceCommit: candidateOid, sourceTree: candidateTree, remoteFingerprint: capability.remote.fingerprint,
      remoteName: capability.remote.name, destinationRef: capability.destinationRef,
      remotePreimageOid: capability.remotePreimage, candidateOid, candidateTree,
      ancestry: { baseOid: capability.remotePreimage, candidateOid, descends: true },
      identityProbe: identity.descriptor, verifyEvidence: verify.descriptor, securityEvidence: security.descriptor,
      criticEvidence: critic.descriptor, releasePreflightEvidence: releasePreflight.descriptor,
      capabilityPreflight: capability,
      fastForwardProof: { baseOid: capability.remotePreimage, candidateOid, descends: true, proofSha256 },
      executorSha256: capability.executor.evidenceSha256,
      neutralEvidence,
    },
  });
}

function authorizationPlanBody({ rootDir, authority, approvalId, attribution, approvedAt, expiresAt }) {
  const state = authority.record.publication;
  if (state.schema !== PUBLICATION_SCHEMA_V2 || authority.record.status !== "active" || state.phase !== "prepared") fail("PX-AUTHORITY", "authorization plan requires a prepared v2 authority");
  return {
    schema: PUBLICATION_AUTHORIZATION_PLAN_SCHEMA, status: "ready", transactionId: state.transactionId,
    channel: state.channel, remoteName: state.remoteName, candidateOid: state.candidateOid, candidateTree: state.candidateTree,
    destinationRef: state.destinationRef, remoteFingerprint: state.remoteFingerprint,
    remotePreimageOid: state.remotePreimageOid, authorityRawSha256: authority.rawDigest,
    publicationStateSha256: publicationDigest(state), approvalId, attribution, approvedAt, expiresAt,
    rootDir,
  };
}

export function planPublicationAuthorization({ rootDir, transactionId, channel, expectedAuthorityRawSha256, approvalId, attribution, approvedAt, expiresAt }, dependencies = {}) {
  if (!TRANSACTION.test(transactionId ?? "") || !CHANNELS.has(channel) || !SHA256.test(expectedAuthorityRawSha256 ?? "")
    || !TRANSACTION.test(approvalId ?? "") || typeof attribution !== "string" || attribution.trim() !== attribution
    || attribution.length === 0 || attribution.length > 200 || /[\u0000-\u001f\u007f]/u.test(attribution)
    || !Number.isSafeInteger(approvedAt) || !Number.isSafeInteger(expiresAt)
    || expiresAt <= approvedAt || expiresAt - approvedAt > 900_000) fail("PX-PLAN", "publication authorization plan input is invalid");
  const repository = physicalRepository(rootDir, dependencies.runGit ?? nativeGit);
  const authority = readPublicationAuthority({ gitCommonDir: repository.common, transactionId, channel });
  if (authority.rawDigest !== expectedAuthorityRawSha256) fail("PX-AUTHORITY-CAS", "publication authority selection is stale");
  const body = authorizationPlanBody({ rootDir: repository.root, authority, approvalId, attribution, approvedAt, expiresAt });
  const planSha256 = sha256(body);
  return {
    ...body, planSha256,
    applyAction: {
      executable: "node", argv: [SCRIPT_PATH, "authorize-apply", "--root", repository.root, "--transaction-id", transactionId, "--channel", channel, "--expected-authority-sha256", expectedAuthorityRawSha256, "--approval-id", approvalId, "--attribution", attribution, "--approved-at", String(approvedAt), "--expires-at", String(expiresAt), "--plan-sha256", planSha256, "--activate"],
      mutation: true, requiresConfirmation: true,
    },
  };
}

export function applyPublicationAuthorization(input, dependencies = {}) {
  if (input.activate !== true || !SHA256.test(input.planSha256 ?? "")) fail("PX-ACTIVATION", "publication authorization requires the exact activated plan");
  const expected = planPublicationAuthorization(input, dependencies);
  if (expected.planSha256 !== input.planSha256) fail("PX-PLAN-DRIFT", "publication authorization plan drifted");
  const repository = physicalRepository(input.rootDir, dependencies.runGit ?? nativeGit);
  const now = (dependencies.now ?? (() => Date.now()))();
  if (!Number.isSafeInteger(now) || now < input.approvedAt || now > input.expiresAt) fail("PX-APPROVAL-EXPIRED", "publication authorization plan is not active at apply time");
  const state = expected;
  return activatePublicationAuthorityV2({
    gitCommonDir: repository.common, transactionId: input.transactionId, channel: input.channel,
    expectedRawSha256: input.expectedAuthorityRawSha256, expectedRevision: 0,
    expectedStateSha256: state.publicationStateSha256, approvalId: input.approvalId,
    attribution: input.attribution, approvedAt: input.approvedAt, expiresAt: input.expiresAt,
    now,
    faultInjector: dependencies.faultInjector,
    command: ["git", "push", "--porcelain", expected.remoteName, `${expected.candidateOid}:${expected.destinationRef}`],
  }).reference;
}

function authorityArgs(authority, repository) {
  return {
    gitCommonDir: repository.common,
    transactionId: authority.record.transactionId,
    channel: authority.record.channel,
    expectedRawSha256: authority.rawDigest,
    expectedRevision: authority.record.publication.revision,
    expectedStateSha256: publicationDigest(authority.record.publication),
  };
}

function observe(authority, repository, observation, observedAt) {
  return observePublicationExecutionAuthority({
    ...authorityArgs(authority, repository),
    observedOid: observation.available ? observation.oid : null,
    observedAt,
    status: observation.available
      ? (observation.oid === authority.record.publication.candidateOid && observation.tree !== authority.record.publication.candidateTree ? "multiple" : "observed")
      : "unknown",
  });
}

function finishReadback(authority, repository, observation, completedAt) {
  let current = observe(authority, repository, observation, completedAt);
  const state = current.record.publication;
  if (state.phase !== "pushed-observed") return current;
  current = startPublicationExecutionReadback({
    ...authorityArgs(current, repository),
    repositoryKind: "fresh-disposable",
    alternatesDisabled: true,
    destinationRef: state.destinationRef,
  });
  return closePublicationExecutionAuthority({
    ...authorityArgs(current, repository),
    fetchedRef: state.destinationRef,
    fetchedOid: observation.oid,
    fetchedTree: observation.tree,
    completedAt,
  });
}

function executorResult(authority, pushAttempted, readback, executorSha256) {
  const state = authority.record.publication;
  const body = {
    schema: state.schema === PUBLICATION_SCHEMA_V2 ? PUBLICATION_EXECUTOR_RESULT_SCHEMA_V2 : PUBLICATION_EXECUTOR_RESULT_SCHEMA,
    status: state.phase,
    code: state.phase === "closed" ? "PX-CLOSED" : state.phase === "reapproval-required" ? "PX-REAPPROVAL-REQUIRED" : "PX-BLOCKED-RECOVERY",
    channel: state.channel,
    transactionId: state.transactionId,
    destinationDigest: state.remoteFingerprint,
    destinationRef: state.destinationRef,
    candidateOid: state.candidateOid,
    candidateTree: state.candidateTree,
    authorityRawSha256: authority.rawDigest,
    publicationReceiptDigest: state.receiptDigest,
    executorSha256,
    pushAttempted,
    readback: {
      repositoryKind: "fresh-disposable",
      alternatesDisabled: true,
      oid: readback.oid,
      tree: readback.tree,
    },
  };
  return { ...body, receiptSha256: sha256(body) };
}

export function validatePublicationExecutorResult(result) {
  const keys = [
    "schema", "status", "code", "channel", "transactionId", "destinationDigest",
    "destinationRef", "candidateOid", "candidateTree", "authorityRawSha256",
    "publicationReceiptDigest", "executorSha256", "pushAttempted", "readback",
    "receiptSha256",
  ];
  if (!result || typeof result !== "object" || Array.isArray(result)
    || JSON.stringify(Object.keys(result).sort()) !== JSON.stringify(keys.sort())
    || ![PUBLICATION_EXECUTOR_RESULT_SCHEMA, PUBLICATION_EXECUTOR_RESULT_SCHEMA_V2].includes(result.schema)
    || !["closed", "reapproval-required", "blocked-recovery"].includes(result.status)
    || !CHANNELS.has(result.channel) || !TRANSACTION.test(result.transactionId ?? "")
    || (result.schema === PUBLICATION_EXECUTOR_RESULT_SCHEMA ? result.destinationRef !== MAIN_REF : !/^refs\/heads\/[A-Za-z0-9._/-]+$/u.test(result.destinationRef ?? ""))
    || !OID.test(result.candidateOid ?? "")
    || !OID.test(result.candidateTree ?? "") || !SHA256.test(result.destinationDigest ?? "")
    || !SHA256.test(result.authorityRawSha256 ?? "") || !SHA256.test(result.executorSha256 ?? "")
    || typeof result.pushAttempted !== "boolean"
    || !result.readback || result.readback.repositoryKind !== "fresh-disposable"
    || result.readback.alternatesDisabled !== true
    || (result.readback.oid !== null && !OID.test(result.readback.oid ?? ""))
    || (result.readback.tree !== null && !OID.test(result.readback.tree ?? ""))) {
    fail("PX-RESULT", "publication executor result is invalid");
  }
  const expectedCode = result.status === "closed"
    ? "PX-CLOSED"
    : result.status === "reapproval-required"
      ? "PX-REAPPROVAL-REQUIRED"
      : "PX-BLOCKED-RECOVERY";
  if (result.code !== expectedCode) fail("PX-RESULT", "publication executor result code is invalid");
  if (result.status === "closed"
    ? (!SHA256.test(result.publicationReceiptDigest ?? "") || result.readback.oid !== result.candidateOid || result.readback.tree !== result.candidateTree)
    : result.publicationReceiptDigest !== null) fail("PX-RESULT", "publication executor terminal binding is invalid");
  const body = { ...result };
  delete body.receiptSha256;
  if (result.receiptSha256 !== sha256(body)) fail("PX-RESULT", "publication executor receipt digest is invalid");
  return true;
}

export function executePublication({
  rootDir,
  transactionId,
  channel,
  expectedAuthorityRawSha256,
}, dependencies = {}) {
  if (!TRANSACTION.test(transactionId ?? "") || transactionId.split("/").includes("..")
    || !CHANNELS.has(channel) || !SHA256.test(expectedAuthorityRawSha256 ?? "")) {
    fail("PX-INPUT", "executor selection input is invalid");
  }
  const runGit = dependencies.runGit ?? nativeGit;
  const now = dependencies.now ?? (() => Date.now());
  const faultInjector = dependencies.faultInjector ?? (() => {});
  const repository = physicalRepository(rootDir, runGit);
  let authority = readPublicationAuthority({ gitCommonDir: repository.common, transactionId, channel });
  if (authority.rawDigest !== expectedAuthorityRawSha256) fail("PX-AUTHORITY-CAS", "publication authority selection is stale");
  const state = authority.record.publication;
  const remote = remoteBinding(repository.root, state.remoteName, runGit);
  const executorSha256 = authority.record.execution?.executorSha256 ?? sha256(readFileSync(SCRIPT_PATH));

  if (authority.record.status === "executing") {
    validateTuple(authority.record, repository, remote, now(), runGit, true);
    const destinationRef = state.schema === PUBLICATION_SCHEMA_V2 ? state.destinationRef : MAIN_REF;
    const readback = freshAlternatesDisabledReadback(remote.endpoint, destinationRef, runGit);
    authority = finishReadback(authority, repository, readback, now());
    const result = executorResult(authority, false, readback, executorSha256);
    validatePublicationExecutorResult(result);
    return result;
  }
  validateTuple(authority.record, repository, remote, now(), runGit);
  const destinationRef = state.schema === PUBLICATION_SCHEMA_V2 ? state.destinationRef : MAIN_REF;
  const observedPreimage = exactRemoteOid(repository.root, remote.endpoint, destinationRef, runGit);
  authority = beginPublicationExecutionAuthority({
    ...authorityArgs(authority, repository),
    attemptId: randomBytes(16).toString("hex"),
    executorSha256,
    startedAt: now(),
  });
  faultInjector("after-authority-consumed");
  validateTuple(authority.record, repository, remoteBinding(repository.root, state.remoteName, runGit), now(), runGit, true);

  if (observedPreimage !== state.remotePreimageOid && observedPreimage !== state.candidateOid) {
    const stale = { available: true, oid: observedPreimage, tree: null };
    authority = observe(authority, repository, stale, now());
    const result = executorResult(authority, false, stale, executorSha256);
    validatePublicationExecutorResult(result);
    return result;
  }

  let pushAttempted = false;
  if (observedPreimage !== state.candidateOid) {
    pushAttempted = true;
    try {
      const pushArgs = state.schema === PUBLICATION_SCHEMA_V2
        ? ["push", "--porcelain", "--atomic", remote.endpoint, `${state.candidateOid}:${destinationRef}`]
        : ["push", "--porcelain", "--atomic", `--force-with-lease=${MAIN_REF}:${state.remotePreimageOid ?? ""}`, remote.endpoint, `${state.candidateOid}:${MAIN_REF}`];
      runGit(pushArgs, {
        cwd: repository.root,
        timeout: 60_000,
        env: gitEnvironment(),
      });
    } catch {
      // A thrown transport adapter is ambiguous. The single allowed response is
      // fresh readback below; this executor never retries the push.
    }
    faultInjector("after-push-before-readback");
  }
  const readback = freshAlternatesDisabledReadback(remote.endpoint, destinationRef, runGit);
  authority = finishReadback(authority, repository, readback, now());
  const result = executorResult(authority, pushAttempted, readback, executorSha256);
  validatePublicationExecutorResult(result);
  return result;
}

export function readbackPublication({ rootDir, transactionId, channel, expectedAuthorityRawSha256 }, dependencies = {}) {
  if (!TRANSACTION.test(transactionId ?? "") || !CHANNELS.has(channel) || !SHA256.test(expectedAuthorityRawSha256 ?? "")) fail("PX-INPUT", "readback selection input is invalid");
  const runGit = dependencies.runGit ?? nativeGit; const now = dependencies.now ?? (() => Date.now());
  const repository = physicalRepository(rootDir, runGit);
  let authority = readPublicationAuthority({ gitCommonDir: repository.common, transactionId, channel });
  if (authority.rawDigest !== expectedAuthorityRawSha256) fail("PX-AUTHORITY-CAS", "publication authority selection is stale");
  const state = authority.record.publication;
  const destinationRef = state.schema === PUBLICATION_SCHEMA_V2 ? state.destinationRef : MAIN_REF;
  const remote = remoteBinding(repository.root, state.remoteName, runGit);
  const executorSha256 = authority.record.execution?.executorSha256 ?? sha256(readFileSync(SCRIPT_PATH));
  if (authority.record.status === "consumed" && state.phase === "closed") {
    const fresh = freshAlternatesDisabledReadback(remote.endpoint, destinationRef, runGit);
    if (!fresh.available || fresh.oid !== state.candidateOid || fresh.tree !== state.candidateTree) fail("PX-READBACK-MISMATCH", "fresh remote readback no longer matches the closed publication");
    const result = executorResult(authority, false, fresh, executorSha256); validatePublicationExecutorResult(result); return result;
  }
  if (authority.record.status === "active") {
    validateTuple(authority.record, repository, remote, now(), runGit);
    const observed = freshAlternatesDisabledReadback(remote.endpoint, destinationRef, runGit);
    if (!observed.available || observed.oid !== state.candidateOid || observed.tree !== state.candidateTree) fail("PX-READBACK-NOT-PUBLISHED", "readback cannot consume an unpublished or ambiguous authority");
    authority = beginPublicationExecutionAuthority({ ...authorityArgs(authority, repository), attemptId: randomBytes(16).toString("hex"), executorSha256, startedAt: now() });
    authority = finishReadback(authority, repository, observed, now());
    const result = executorResult(authority, false, observed, executorSha256); validatePublicationExecutorResult(result); return result;
  }
  if (authority.record.status === "executing") {
    validateTuple(authority.record, repository, remote, now(), runGit, true);
    const observed = freshAlternatesDisabledReadback(remote.endpoint, destinationRef, runGit);
    authority = finishReadback(authority, repository, observed, now());
    const result = executorResult(authority, false, observed, executorSha256); validatePublicationExecutorResult(result); return result;
  }
  fail("PX-READBACK-STATE", "publication authority has no executable readback route");
}

function parsePairs(argv, required, optional = [], booleans = []) {
  const allowed = new Set([...required, ...optional, ...booleans]); const values = {};
  for (let index = 0; index < argv.length;) {
    const flag = argv[index];
    if (!allowed.has(flag) || values[flag] !== undefined) fail("PX-CLI", "operation accepts only its fixed closed flags");
    if (booleans.includes(flag)) { values[flag] = true; index += 1; continue; }
    if (argv[index + 1] === undefined || String(argv[index + 1]).startsWith("--")) fail("PX-CLI", "operation flag value is missing");
    values[flag] = argv[index + 1]; index += 2;
  }
  if (required.some((flag) => values[flag] === undefined)) fail("PX-CLI", "operation input is incomplete");
  return values;
}

export function parsePublicationExecutorCli(argv) {
  if (argv[0] !== "execute") return parseProductivePublicationCli(argv);
  const allowed = new Set(["--root", "--transaction-id", "--channel", "--expected-authority-sha256"]);
  const values = {};
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index];
    if (!allowed.has(flag) || values[flag] !== undefined || argv[index + 1] === undefined) {
      fail("PX-CLI", "executor accepts only its fixed authority-selection flags");
    }
    values[flag] = argv[index + 1];
  }
  if (Object.keys(values).length !== allowed.size) fail("PX-CLI", "executor authority selection is incomplete");
  return {
    rootDir: values["--root"],
    transactionId: values["--transaction-id"],
    channel: values["--channel"],
    expectedAuthorityRawSha256: values["--expected-authority-sha256"],
  };
}

export function parseProductivePublicationCli(argv) {
  const operation = argv[0];
  if (!new Set(["preflight", "prepare", "authorize-plan", "authorize-apply", "readback"]).has(operation)) fail("PX-CLI", "unknown publication operation");
  if (operation === "preflight") {
    const value = parsePairs(argv.slice(1), ["--root", "--preflight-id", "--candidate", "--remote-name", "--destination-ref"]);
    return { operation, input: { rootDir: value["--root"], preflightId: value["--preflight-id"], candidateOid: value["--candidate"], remoteName: value["--remote-name"], destinationRef: value["--destination-ref"] } };
  }
  if (operation === "prepare") {
    const value = parsePairs(argv.slice(1), ["--root", "--transaction-id", "--channel", "--preflight", "--identity", "--verify", "--security", "--critic", "--release-preflight"], ["--neutral-evidence"]);
    let neutralEvidence = null;
    if (value["--neutral-evidence"] !== undefined) {
      try { neutralEvidence = JSON.parse(readFileSync(resolve(value["--root"], value["--neutral-evidence"]), "utf8")); } catch { fail("PX-EVIDENCE", "neutral evidence is unavailable"); }
    }
    return { operation, input: { rootDir: value["--root"], transactionId: value["--transaction-id"], channel: value["--channel"], preflightPath: value["--preflight"], identityPath: value["--identity"], verifyPath: value["--verify"], securityPath: value["--security"], criticPath: value["--critic"], releasePreflightPath: value["--release-preflight"], neutralEvidence } };
  }
  if (["authorize-plan", "authorize-apply"].includes(operation)) {
    const required = ["--root", "--transaction-id", "--channel", "--expected-authority-sha256", "--approval-id", "--attribution", "--approved-at", "--expires-at"];
    if (operation === "authorize-apply") required.push("--plan-sha256");
    const value = parsePairs(argv.slice(1), required, [], operation === "authorize-apply" ? ["--activate"] : []);
    const approvedAt = Number(value["--approved-at"]); const expiresAt = Number(value["--expires-at"]);
    if (!Number.isSafeInteger(approvedAt) || !Number.isSafeInteger(expiresAt)) fail("PX-CLI", "authorization times must be safe integers");
    return { operation, input: { rootDir: value["--root"], transactionId: value["--transaction-id"], channel: value["--channel"], expectedAuthorityRawSha256: value["--expected-authority-sha256"], approvalId: value["--approval-id"], attribution: value["--attribution"], approvedAt, expiresAt, ...(operation === "authorize-apply" ? { planSha256: value["--plan-sha256"], activate: value["--activate"] === true } : {}) } };
  }
  const value = parsePairs(argv.slice(1), ["--root", "--transaction-id", "--channel", "--expected-authority-sha256"]);
  return { operation, input: { rootDir: value["--root"], transactionId: value["--transaction-id"], channel: value["--channel"], expectedAuthorityRawSha256: value["--expected-authority-sha256"] } };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(SCRIPT_PATH)) {
  try {
    const parsed = parsePublicationExecutorCli(process.argv.slice(2));
    const result = parsed.operation === "preflight" ? preflightPublication(parsed.input)
      : parsed.operation === "prepare" ? preparePublicationTransaction(parsed.input).reference
        : parsed.operation === "authorize-plan" ? planPublicationAuthorization(parsed.input)
          : parsed.operation === "authorize-apply" ? applyPublicationAuthorization(parsed.input)
            : parsed.operation === "readback" ? readbackPublication(parsed.input)
              : executePublication(parsed);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = ["blocked", "reapproval-required", "blocked-recovery"].includes(result.status) ? 2 : 0;
  } catch (error) {
    const code = error instanceof PublicationExecutorError ? error.code : "PX-UNAVAILABLE";
    const message = error instanceof PublicationExecutorError ? error.message : "publication executor failed closed";
    process.stderr.write(`${JSON.stringify({ schema: PUBLICATION_EXECUTOR_ERROR_SCHEMA, status: "rejected", code, message })}\n`);
    process.exitCode = 2;
  }
}
