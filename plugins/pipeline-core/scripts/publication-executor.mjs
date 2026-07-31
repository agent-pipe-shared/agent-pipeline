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
  closeSync, constants, fstatSync, lstatSync, mkdtempSync, openSync,
  readFileSync, realpathSync, rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  beginPublicationExecutionAuthority,
  closePublicationExecutionAuthority,
  observePublicationExecutionAuthority,
  readPublicationAuthority,
  startPublicationExecutionReadback,
} from "../lib/publication-authority.mjs";
import {
  publicationDigest,
  publicationRemoteFingerprint,
  publicationRepositoryFingerprint,
} from "../lib/publication-bundle.mjs";
export {
  publicationRemoteFingerprint,
  publicationRepositoryFingerprint,
} from "../lib/publication-bundle.mjs";

export const PUBLICATION_EXECUTOR_RESULT_SCHEMA = "pipeline.publication-executor-result.v1";
export const PUBLICATION_EXECUTOR_ERROR_SCHEMA = "pipeline.publication-executor-error.v1";
const SHA256 = /^[0-9a-f]{64}$/u;
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const TRANSACTION = /^[A-Za-z0-9._:@/-]{1,200}$/u;
const CHANNELS = new Set(["private", "neutral-public"]);
const MAIN_REF = "refs/heads/main";
const SCRIPT_PATH = fileURLToPath(import.meta.url);

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

function evidenceDigest(root, evidence, label) {
  const absolute = resolve(root, evidence.path);
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
  const digest = sha256(bytes);
  if (digest !== evidence.rawDigest) fail("PX-EVIDENCE", `${label} evidence digest drifted`);
  return digest;
}

function validateTuple(record, repository, remote, now, runGit, recovery = false) {
  const state = record.publication;
  if ((recovery ? record.status !== "executing" : record.status !== "active") || state.phase !== "push-authorized") {
    fail("PX-AUTHORITY", "publication authority is not available at the fixed execution boundary");
  }
  if (state.destinationRef !== MAIN_REF) fail("PX-DESTINATION", "fixed publication destination must be refs/heads/main");
  if (publicationRepositoryFingerprint(repository) !== state.repositoryFingerprint) fail("PX-REPOSITORY", "repository fingerprint drifted");
  if (remote.fingerprint !== state.remoteFingerprint) fail("PX-REMOTE", "sanitized remote fingerprint drifted");
  if (state.approval.tupleDigest !== state.pushIntent.tupleDigest
    || state.approval.id !== state.pushIntent.approvalId) fail("PX-APPROVAL", "approval digest binding drifted");
  if (!recovery && (!Number.isSafeInteger(now) || now < state.approval.approvedAt || now > state.approval.expiresAt)) {
    fail("PX-APPROVAL-EXPIRED", "publication approval is expired");
  }
  if (JSON.stringify(state.pushIntent.command)
    !== JSON.stringify(["git", "push", "--porcelain", state.remoteName, `${state.candidateOid}:${MAIN_REF}`])) {
    fail("PX-COMMAND", "publication authority carries a non-fixed Git intent");
  }
  const sourceTree = exactObjectTree(repository.root, state.sourceCommit, runGit, "SOURCE");
  if (sourceTree !== state.sourceTree) fail("PX-SOURCE-TREE", "source tree drifted");
  const candidateTree = exactObjectTree(repository.root, state.candidateOid, runGit, "CANDIDATE");
  if (candidateTree !== state.candidateTree) fail("PX-CANDIDATE-TREE", "candidate tree drifted");
  evidenceDigest(repository.root, state.identityProbe, "identity");
  evidenceDigest(repository.root, state.verifyEvidence, "Verify");
  evidenceDigest(repository.root, state.securityEvidence, "Security");
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
    destinationRef: MAIN_REF,
  });
  return closePublicationExecutionAuthority({
    ...authorityArgs(current, repository),
    fetchedRef: MAIN_REF,
    fetchedOid: observation.oid,
    fetchedTree: observation.tree,
    completedAt,
  });
}

function executorResult(authority, pushAttempted, readback, executorSha256) {
  const state = authority.record.publication;
  const body = {
    schema: PUBLICATION_EXECUTOR_RESULT_SCHEMA,
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
    || result.schema !== PUBLICATION_EXECUTOR_RESULT_SCHEMA
    || !["closed", "reapproval-required", "blocked-recovery"].includes(result.status)
    || !CHANNELS.has(result.channel) || !TRANSACTION.test(result.transactionId ?? "")
    || result.destinationRef !== MAIN_REF || !OID.test(result.candidateOid ?? "")
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
    const readback = freshAlternatesDisabledReadback(remote.endpoint, MAIN_REF, runGit);
    authority = finishReadback(authority, repository, readback, now());
    const result = executorResult(authority, false, readback, executorSha256);
    validatePublicationExecutorResult(result);
    return result;
  }
  validateTuple(authority.record, repository, remote, now(), runGit);
  const observedPreimage = exactRemoteOid(repository.root, remote.endpoint, MAIN_REF, runGit);
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
    const lease = `--force-with-lease=${MAIN_REF}:${state.remotePreimageOid ?? ""}`;
    try {
      runGit([
        "push", "--porcelain", "--atomic", lease, remote.endpoint,
        `${state.candidateOid}:${MAIN_REF}`,
      ], {
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
  const readback = freshAlternatesDisabledReadback(remote.endpoint, MAIN_REF, runGit);
  authority = finishReadback(authority, repository, readback, now());
  const result = executorResult(authority, pushAttempted, readback, executorSha256);
  validatePublicationExecutorResult(result);
  return result;
}

export function parsePublicationExecutorCli(argv) {
  if (argv[0] !== "execute") fail("PX-CLI", "expected execute subcommand");
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

if (process.argv[1] && resolve(process.argv[1]) === resolve(SCRIPT_PATH)) {
  try {
    const result = executePublication(parsePublicationExecutorCli(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.status === "closed" ? 0 : 2;
  } catch (error) {
    const code = error instanceof PublicationExecutorError ? error.code : "PX-UNAVAILABLE";
    const message = error instanceof PublicationExecutorError ? error.message : "publication executor failed closed";
    process.stderr.write(`${JSON.stringify({ schema: PUBLICATION_EXECUTOR_ERROR_SCHEMA, status: "rejected", code, message })}\n`);
    process.exitCode = 2;
  }
}
