#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Per-dispatch Critic disposition enforcement for dispatch-record v3. */
import { createHash } from "node:crypto";
import { historicalFreshReviewCaptureFacts, readHistoricalFreshReviewAdmission, historicalFreshReviewPacketBinding } from "../lib/historical-fresh-review-admission.mjs";
import { sha256Canonical } from "../lib/review-economy.mjs";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { CRITIC_SKIP_SCHEMA, criticDecisionPathFinding, criticDisposition } from "../lib/critic-skip-decision.mjs";
import { criticDispositionAddendumPath, validateCriticDispositionAddendum } from "../lib/critic-disposition-addendum.mjs";
import { readBoundConsumedCriticReceipt } from "../lib/critic-verify-lifecycle.mjs";
import { loadResidualAcceptanceDepsForPacket } from "../lib/critic-verify-readiness.mjs";
import { resolveRetainedCriticCourseRecords } from "../lib/critic-course-admission.mjs";
import { DISPATCH_RECORD_SCHEMA, PREVIOUS_DISPATCH_RECORD_SCHEMA, LEGACY_DISPATCH_RECORD_SCHEMA, isNoDeliveryOutcome, isTerminalOutcome, normalizeDispatchRecordPath, validateDispatchRecord, validatePreviousDispatchRecord, validateLegacyDispatchRecord } from "../lib/dispatch-record.mjs";
import { parseStrictJson } from "../lib/governance-event.mjs";
import { readPortableAgyAuthorshipExport } from "../lib/portable-agy-authorship-export.mjs";
import { parseIntegrationTrailerBlock } from "../lib/commit-message-policy.mjs";
import { verifyQualityPackageIntegrationPostCommit } from "../lib/signed-quality-package.mjs";
import { checkRunnerManifestParity } from "./check-runner-manifest-parity.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(HERE, "..", "..", "..");
const EVIDENCE_DIR = "evidence";
const DISPATCH_RECORD_PATTERN = /^dispatch-record-.+\.json$/u;
const CRITIC_ADDENDUM_PATTERN = /^dispatch-critic-addendum-.+\.json$/u;
export const LEGACY_RECONCILE_SCHEMA = "pipeline.legacy-dispatch-reconcile-index.v1";
export const DEFAULT_LEGACY_RECONCILE_INDEX_PATH = "evidence/legacy-dispatch-reconcile-index.json";
export const ABANDONED_V3_RECOVERY_INDEX_SCHEMA = "pipeline.abandoned-v3-dispatch-recovery-index.v1";
export const DEFAULT_ABANDONED_V3_RECOVERY_INDEX_PATH = "evidence/abandoned-v3-dispatch-recovery-index.json";
const ABANDONED_V3_TASKS = ["ALF-ADOPTION-PROOF", "ALF-RECOVERY-PLAN"];
const ABANDONED_V3_OBSERVATION_SCHEMA = "pipeline.abandoned-v3-dispatch-recovery-observation.v1";
const SHA256 = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const RUNNER_MANIFESTS = Object.freeze([
  { runner: "codex", path: "plugins/pipeline-core/.codex-plugin/plugin.json" },
  { runner: "claude", path: "plugins/pipeline-core/.claude-plugin/plugin.json" },
  { runner: "antigravity", path: "plugins/pipeline-core/plugin.json" },
]);

function physicalRegularFile(root, path, label) {
  let absolute;
  try { absolute = resolve(root, path); } catch (error) { return { finding: `${label}: path could not be resolved (${error.message})` }; }
  try { normalizeDispatchRecordPath(path, label); }
  catch (error) { return { finding: `${label}: ${error.message}` }; }
  const physicalRoot = realpathSync(resolve(root));
  const rel = relative(physicalRoot, absolute);
  if (rel === "" || rel === ".." || rel.startsWith("../") || rel.startsWith("..\\")) return { finding: `${label}: path escapes repository root` };
  try {
    const info = lstatSync(absolute);
    if (!info.isFile() || info.isSymbolicLink()) return { finding: `${label}: path is not a physical file` };
    const physical = realpathSync(absolute);
    const physicalRel = relative(physicalRoot, physical);
    if (physicalRel === "" || physicalRel === ".." || physicalRel.startsWith("../") || physicalRel.startsWith("..\\")) return { finding: `${label}: physical path escapes repository root` };
    return { bytes: readFileSync(absolute) };
  } catch (error) { return { finding: `${label}: file is missing or unreadable (${error.message})` }; }
}

function exactObject(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value);
  const unknown = actual.filter((key) => !keys.includes(key));
  const missing = keys.filter((key) => !Object.hasOwn(value, key));
  if (unknown.length || missing.length) throw new Error(`${label} is not closed (unknown=${unknown.join(",") || "none"}; missing=${missing.join(",") || "none"})`);
}

function digestMatches(bytes, expected, label) {
  if (typeof expected !== "string" || !SHA256.test(expected)) return `${label}: sha256 must be a lowercase SHA-256 digest`;
  const actual = createHash("sha256").update(bytes).digest("hex");
  return actual === expected ? null : `${label}: SHA-256 digest mismatch`;
}
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

function readGit(root, args, options = {}) {
  const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/iu.test(key)));
  return (options.gitRead ?? ((gitArgs) => execFileSync("git", gitArgs, {
    cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024, env: gitEnv,
  }).trim()))(args);
}

/**
 * Retire only the two source-bound stale v3 rows after a canonical signed
 * package committed the exact index. The index cannot authorize itself: its
 * owning commit must be an ancestor, its current bytes/mode must match that
 * commit, and the commit's canonical integration trailer must verify against
 * the signed package receipt.
 */
export function readAbandonedV3RecoveryIndex(root, options = {}) {
  const indexPath = options.abandonedV3RecoveryIndexPath ?? DEFAULT_ABANDONED_V3_RECOVERY_INDEX_PATH;
  const entriesByPath = new Map();
  const absolute = resolve(root, indexPath);
  if (!existsSync(absolute)) return { findings: [], entriesByPath, indexPresent: false };
  const findings = [];
  let indexBytes;
  try {
    const file = physicalRegularFile(root, indexPath, "abandoned v3 recovery index");
    if (file.finding) throw new Error(file.finding);
    indexBytes = file.bytes;
  } catch (error) { return { findings: [`${indexPath}: ${error.message}`], entriesByPath, indexPresent: true }; }
  let index;
  try { index = parseStrictJson(indexBytes); }
  catch (error) { return { findings: [`${indexPath}: malformed recovery index (${error.message})`], entriesByPath, indexPresent: true }; }
  try {
    exactObject(index, ["schema", "entries"], "abandoned v3 recovery index");
    if (index.schema !== ABANDONED_V3_RECOVERY_INDEX_SCHEMA) throw new Error(`schema must be ${ABANDONED_V3_RECOVERY_INDEX_SCHEMA}`);
    if (!Array.isArray(index.entries) || index.entries.length !== ABANDONED_V3_TASKS.length) throw new Error("entries must contain exactly the two bounded historical task IDs");
    const observedPaths = new Set();
    for (const [position, entry] of index.entries.entries()) {
      const label = `${indexPath}: entries[${position}]`;
      exactObject(entry, ["taskId", "recordPath", "recordSha256", "recordSchema", "outcome", "candidateCommit", "commits", "disposition", "observationPath", "observationSha256"], label);
      const expectedTaskId = ABANDONED_V3_TASKS[position];
      if (entry.taskId !== expectedTaskId) throw new Error(`${label}.taskId must be ${expectedTaskId} in canonical order`);
      const expectedRecordPath = `evidence/dispatch-record-${expectedTaskId}.json`;
      if (entry.recordPath !== expectedRecordPath || entry.recordSchema !== PREVIOUS_DISPATCH_RECORD_SCHEMA
        || entry.outcome !== "in-progress" || !Array.isArray(entry.commits) || entry.commits.length !== 0
        || entry.disposition !== "abandoned-no-delivery") throw new Error(`${label} is outside the closed zero-commit v3 retirement scope`);
      if (entry.candidateCommit !== null && (typeof entry.candidateCommit !== "string" || !/^[a-f0-9]{40}$/u.test(entry.candidateCommit))) throw new Error(`${label}.candidateCommit is invalid`);
      if ((entry.taskId === "ALF-ADOPTION-PROOF") !== (entry.candidateCommit === null)) throw new Error(`${label}.candidateCommit does not match the exact observed historical row`);
      if (!SHA256.test(entry.recordSha256 ?? "") || !SHA256.test(entry.observationSha256 ?? "")) throw new Error(`${label} digest is invalid`);
      normalizeDispatchRecordPath(entry.observationPath, `${label}.observationPath`);
      if (!/^evidence\/alf-abandoned-v3-recovery-observation\.json$/u.test(entry.observationPath)) throw new Error(`${label}.observationPath is outside the fixed observation path`);
      if (observedPaths.has(entry.recordPath)) throw new Error(`${label}.recordPath duplicates an earlier entry`);
      observedPaths.add(entry.recordPath);
      const observationFile = physicalRegularFile(root, entry.observationPath, `${label}.observationPath`);
      if (observationFile.finding) throw new Error(observationFile.finding);
      if (digestMatches(observationFile.bytes, entry.observationSha256, `${label}.observationSha256`)) throw new Error(`${label}.observationSha256 does not match the observation`);
      const observation = parseStrictJson(observationFile.bytes);
      exactObject(observation, ["schema", "observedAt", "baseHead", "records", "coordinatorQueue", "scope"], `${label}.observation`);
      exactObject(observation.coordinatorQueue, ["observedAt", "dispatchesFound", "taskIds", "scope"], `${label}.observation.coordinatorQueue`);
      if (observation.schema !== ABANDONED_V3_OBSERVATION_SCHEMA || !/^[a-f0-9]{40}$/u.test(observation.baseHead ?? "")
        || !Array.isArray(observation.records) || observation.records.length !== ABANDONED_V3_TASKS.length
        || observation.coordinatorQueue?.dispatchesFound !== false
        || JSON.stringify(observation.coordinatorQueue.taskIds) !== JSON.stringify(ABANDONED_V3_TASKS)
        || observation.coordinatorQueue.scope !== "current coordinator queue snapshot only"
        || observation.scope !== "administrative-retirement-only; no worker-terminal, delivery, completion, or Critic-pass claim") throw new Error(`${label}.observation is not a closed current administrative observation`);
      const observedRecord = observation.records[position];
      exactObject(observedRecord, ["taskId", "recordPath", "recordSha256", "schema", "outcome", "candidateCommit", "commits"], `${label}.observation record`);
      if (observedRecord.taskId !== entry.taskId || observedRecord.recordPath !== entry.recordPath
        || observedRecord.recordSha256 !== entry.recordSha256 || observedRecord.schema !== entry.recordSchema
        || observedRecord.outcome !== entry.outcome || observedRecord.candidateCommit !== entry.candidateCommit
        || JSON.stringify(observedRecord.commits) !== JSON.stringify(entry.commits)) throw new Error(`${label} does not match the durable observation`);
      const recordFile = physicalRegularFile(root, entry.recordPath, `${label}.recordPath`);
      if (recordFile.finding) throw new Error(recordFile.finding);
      if (digestMatches(recordFile.bytes, entry.recordSha256, `${label}.recordSha256`)) throw new Error(`${label}.recordSha256 does not match the current record`);
      const currentRecord = parseStrictJson(recordFile.bytes);
      if (currentRecord?.schema !== PREVIOUS_DISPATCH_RECORD_SCHEMA || currentRecord?.taskId !== entry.taskId
        || currentRecord?.outcome !== "in-progress" || currentRecord?.candidateCommit !== entry.candidateCommit
        || !Array.isArray(currentRecord?.commits) || currentRecord.commits.length !== 0) throw new Error(`${label} current source row is not the exact in-progress zero-commit v3 record`);
      // These two exact SHA-bound historical rows are administratively retired
      // even if their v3 payload contains the known invalid candidate/appliedRow
      // fields. The signed index is the narrow correction boundary; no other
      // malformed record can use this branch.
    }
    const owner = readGit(root, ["log", "-1", "--format=%H", "--", indexPath], options);
    if (!/^[a-f0-9]{40}$/u.test(owner)) throw new Error("index has no unique owning commit");
    readGit(root, ["merge-base", "--is-ancestor", owner, "HEAD"], options);
    const treeEntry = readGit(root, ["ls-tree", owner, "--", indexPath], options);
    const treeMatch = /^(100644|100755) blob ([a-f0-9]{40,64})\t/u.exec(treeEntry);
    const info = lstatSync(absolute);
    const physicalMode = (info.mode & 0o111) ? "100755" : "100644";
    if (!treeMatch || treeMatch[1] !== physicalMode) throw new Error("current index mode differs from its owning commit");
    const committedBytes = (options.readGitBlob ?? ((oid) => execFileSync("git", ["cat-file", "blob", oid], { cwd: root, maxBuffer: 2 * 1024 * 1024 })))(treeMatch[2]);
    if (!Buffer.from(committedBytes).equals(indexBytes)) throw new Error("current index bytes differ from its owning commit");
    const message = readGit(root, ["show", "-s", "--format=%B", owner], options);
    const trailer = parseIntegrationTrailerBlock(message);
    if (!trailer.ok) throw new Error("index owner lacks one canonical signed-package integration trailer");
    const verify = options.verifyQualityPackageIntegrationPostCommit ?? verifyQualityPackageIntegrationPostCommit;
    const proof = verify({ repoRoot: root, commitSha: owner, intentSha256: trailer.intentSha256 });
    if (!proof?.ok || proof.code !== "QUALITY-PACKAGE-INTEGRATION-POSTCOMMIT-VERIFIED") throw new Error("signed quality-package post-commit verification failed");
    for (const entry of index.entries) entriesByPath.set(entry.recordPath, entry);
  } catch (error) { findings.push(`${indexPath}: invalid or unauthorized abandoned-v3 recovery index (${error.message})`); }
  return { findings, entriesByPath, indexPresent: true };
}

function abandonedV3RecordFinding(entry, retirement) {
  if (!retirement) return null;
  if (entry.path !== retirement.recordPath || entry.sha256 !== retirement.recordSha256
    || entry.record?.schema !== PREVIOUS_DISPATCH_RECORD_SCHEMA
    || entry.record?.outcome !== "in-progress" || entry.record?.candidateCommit !== retirement.candidateCommit
    || !Array.isArray(entry.record?.commits) || entry.record.commits.length !== 0
    || entry.record?.taskId !== retirement.taskId) return `${entry.path}: recovery index no longer matches this exact in-progress v3 record`;
  return null;
}

function terminalAuthoredDelivery(record) {
  const delivered = isTerminalOutcome(record?.outcome) && !isNoDeliveryOutcome(record?.outcome)
    && Array.isArray(record?.commits) && record.commits.length > 0
    && record.commits.at(-1) === record.candidateCommit;
  if (record?.schema === PREVIOUS_DISPATCH_RECORD_SCHEMA) return delivered;
  return record?.schema === DISPATCH_RECORD_SCHEMA && delivered
    && (record?.outcomeClassification?.kind === "authored-commit"
      || record?.outcomeClassification?.kind === "orchestrator-attested");
}
function admittedKindOf(record) {
  return record?.schema === DISPATCH_RECORD_SCHEMA ? record.outcomeClassification.kind : null;
}

function verifyCandidateDescendsFromRecord(root, recordCandidate, reviewCandidate, options = {}) {
  const gitRead = options.gitRead ?? ((args) => execFileSync("git", args, {
    cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/iu.test(key))),
  }).trim());
  try { gitRead(["merge-base", "--is-ancestor", recordCandidate, reviewCandidate]); return { ok: true }; }
  catch (error) {
    if (error?.status === 1) return { ok: false, notDescendant: true };
    return { ok: false, finding: `candidate ancestry could not be verified (${error.code ?? error.status ?? "git-readback"})` };
  }
}

function gitBlobBytes(root, commit, path) {
  return execFileSync("git", ["-C", root, "show", `${commit}:${path}`], {
    encoding: "buffer", maxBuffer: 2 * 1024 * 1024,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/iu.test(key))),
  });
}

function signedImportFailure(code, details = null) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  throw error;
}

function manifestValue(bytes, label) {
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { signedImportFailure("signed-import-manifest-json", { path: label }); }
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.version !== "string") {
    signedImportFailure("signed-import-manifest-shape", { path: label });
  }
  return value;
}

function validateStampOnlyRange(root, integrationCommit, candidateCommit) {
  const objectFormat = readGit(root, ["rev-parse", "--show-object-format"]);
  const oidLength = objectFormat === "sha1" ? 40 : objectFormat === "sha256" ? 64 : 0;
  if (![integrationCommit, candidateCommit].every((oid) => oid.length === oidLength && OID.test(oid))) {
    signedImportFailure("signed-import-oid");
  }
  if (readGit(root, ["cat-file", "-t", integrationCommit]) !== "commit"
    || readGit(root, ["cat-file", "-t", candidateCommit]) !== "commit") signedImportFailure("signed-import-commit");
  const ancestor = spawnSync("git", ["-C", root, "merge-base", "--is-ancestor", integrationCommit, candidateCommit], {
    encoding: "utf8", env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/iu.test(key))),
  });
  if (ancestor.status !== 0) signedImportFailure("signed-import-candidate-ancestry");

  const integrationParents = readGit(root, ["rev-list", "--parents", "-n", "1", integrationCommit]).split(/\s+/u);
  if (integrationParents.length !== 2) signedImportFailure("signed-import-parent");
  const baseCommit = integrationParents[1];
  const candidateParentLine = readGit(root, ["rev-list", "--parents", "-n", "1", candidateCommit]).split(/\s+/u);
  const rangeCommits = readGit(root, ["rev-list", "--reverse", `${integrationCommit}..${candidateCommit}`]).split("\n").filter(Boolean);
  if (rangeCommits.length > 32 || rangeCommits.some((oid) => !OID.test(oid))) signedImportFailure("signed-import-range-bound");
  const allowedPaths = new Set(RUNNER_MANIFESTS.map(({ path }) => path));
  const changedPaths = readGit(root, ["diff", "--name-only", "-z", integrationCommit, candidateCommit, "--"])
    .split("\0").filter(Boolean).sort();
  if (changedPaths.some((path) => !allowedPaths.has(path))) signedImportFailure("signed-import-nonversion-path", { changedPaths });

  let priorCommit = integrationCommit;
  for (const commit of rangeCommits) {
    const parents = readGit(root, ["rev-list", "--parents", "-n", "1", commit]).split(/\s+/u);
    if (parents.length !== 2 || parents[1] !== priorCommit) signedImportFailure("signed-import-linear-range");
    const changedAtCommit = readGit(root, ["diff-tree", "--no-commit-id", "--name-only", "-r", "-z", commit])
      .split("\0").filter(Boolean).sort();
    if (changedAtCommit.length === 0 || changedAtCommit.some((path) => !allowedPaths.has(path))) {
      signedImportFailure("signed-import-nonversion-commit", { commit, changedPaths: changedAtCommit });
    }
    for (const path of changedAtCommit) {
      const beforeRaw = gitBlobBytes(root, priorCommit, path);
      const afterRaw = gitBlobBytes(root, commit, path);
      const before = manifestValue(beforeRaw, path);
      const after = manifestValue(afterRaw, path);
      const token = JSON.stringify(before.version);
      const first = beforeRaw.indexOf(token);
      if (first < 0 || beforeRaw.indexOf(token, first + token.length) >= 0
        || !Buffer.from(beforeRaw.toString("utf8").replace(token, JSON.stringify(after.version))).equals(afterRaw)) {
        signedImportFailure("signed-import-nonversion-manifest-change", { commit, path });
      }
      const entry = RUNNER_MANIFESTS.find((item) => item.path === path);
      const version = new RegExp(`^0\\.7\\.0\\+${entry.runner}\\.([0-9]{14})\\.${integrationCommit.slice(0, 8)}$`, "u").exec(after.version);
      if (!version) signedImportFailure("signed-import-version-binding", { commit, path });
    }
    priorCommit = commit;
  }
  if (candidateParentLine.length !== 2 && candidateCommit !== integrationCommit) signedImportFailure("signed-import-candidate-parent");

  const candidateManifests = RUNNER_MANIFESTS.map(({ runner, path }) => {
    const bytes = gitBlobBytes(root, candidateCommit, path);
    const value = manifestValue(bytes, path);
    return { runner, path, bytes, value };
  });
  const tempRoot = mkdtempSync(join(tmpdir(), "pipeline-critic-runner-parity-"));
  try {
    if (realpathSync(tempRoot) !== tempRoot || lstatSync(tempRoot).isSymbolicLink()) signedImportFailure("signed-import-parity-temp");
    for (const { path, bytes } of candidateManifests) {
      const relativePath = path.slice("plugins/pipeline-core/".length);
      const target = join(tempRoot, relativePath);
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
      writeFileSync(target, bytes, { mode: 0o600, flag: "wx" });
    }
    const parity = checkRunnerManifestParity(tempRoot);
    if (!parity.ok || parity.baseVersion !== "0.7.0") signedImportFailure("signed-import-manifest-parity", parity);
  } finally {
    const info = lstatSync(tempRoot);
    if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(tempRoot) !== tempRoot) signedImportFailure("signed-import-parity-temp");
    rmSync(tempRoot, { recursive: true, force: true });
  }

  if (rangeCommits.length > 0) {
    const stampedVersions = candidateManifests.map(({ runner, value, path }) => {
      const match = new RegExp(`^0\\.7\\.0\\+${runner}\\.([0-9]{14})\\.${integrationCommit.slice(0, 8)}$`, "u").exec(value.version);
      if (!match) signedImportFailure("signed-import-version-binding", { path });
      return { timestamp: match[1], version: value.version };
    });
    if (new Set(stampedVersions.map(({ timestamp }) => timestamp)).size !== 1) signedImportFailure("signed-import-version-timestamp");
  }
  return { baseCommit, integrationCommit, candidateCommit, rangeCommits, changedPaths, candidateManifests };
}

/** Create a private, content-bound reference from the trusted local dispatch reader. */
export function createLocalDispatchEvidenceBinding({ root, taskId, reviewCandidateCommit, baseCommit } = {}) {
  if (typeof root !== "string" || typeof taskId !== "string" || typeof reviewCandidateCommit !== "string"
    || !/^[a-f0-9]{40}$/u.test(reviewCandidateCommit)) throw Object.assign(new TypeError("local dispatch evidence input is invalid"), { code: "LDE-INPUT" });
  const historical = historicalAdmission(root,{kind:"admitted-dispatch",taskId,baseCommit,candidateCommit:reviewCandidateCommit});
  const scan = walkDispatchRecordsForReview(root,historical?.entries ?? []);
  if (scan.findings.length > 0) throw Object.assign(new Error("local dispatch evidence source is unreadable"), { code: "LDE-SOURCE-UNREADABLE" });
  const matches = scan.records.filter(({ record }) => record?.taskId === taskId);
  if (matches.length !== 1) throw Object.assign(new Error("local dispatch evidence requires one exact source record"), { code: "LDE-SOURCE-RECORD-MISSING" });
  const entry = matches[0];
  const record = entry.record;
  const v3 = record?.schema === PREVIOUS_DISPATCH_RECORD_SCHEMA;
  const v4 = record?.schema === DISPATCH_RECORD_SCHEMA;
  if (!v3 && !v4) throw Object.assign(new Error("local dispatch evidence source is not a required authored delivery"), { code: "LDE-SCHEMA" });
  try { (v3 ? validatePreviousDispatchRecord : validateDispatchRecord)(record); }
  catch { throw Object.assign(new Error("local dispatch evidence source is not a required authored delivery"), { code: "LDE-RECORD-INVALID" }); }
  if (criticDisposition(record) !== "required"
    || !/^[a-f0-9]{40}$/u.test(record.candidateCommit ?? "")) {
    throw Object.assign(new Error("local dispatch evidence source is not a required authored delivery"), { code: "LDE-CRITIC-NOT-REQUIRED" });
  }
  const admission = evaluateReviewAdmission({ root, taskId, baseCommit, candidateCommit: reviewCandidateCommit });
  if (!admission.ok || admission.targetRecordCandidateCommit !== record.candidateCommit) {
    throw Object.assign(new Error("local dispatch evidence candidate is not admitted for this task"), { code: "LDE-CANDIDATE-BINDING" });
  }
  const binding = {
    schema: "pipeline.local-dispatch-evidence.v1",
    taskId,
    recordPath: entry.path,
    recordSha256: entry.sha256,
    sourceCandidateCommit: record.candidateCommit,
    reviewCandidateCommit,
    assurance: admission.assurance === "orchestrator-attested" ? "orchestrator-attested" : null,
  };
  return Object.freeze({ ...binding, snapshotId: sha256Canonical(binding) });
}

/** Admit a signed source import as its own review target without fabricating a dispatch row. */
export function evaluateSignedQualityImportReviewAdmission({ root, anchor } = {}) {
  const historical = historicalAdmission(root, {kind:"signed-quality-import",taskId:anchor?.taskId,baseCommit:anchor?.baseCommit,candidateCommit:anchor?.candidateCommit});
  return evaluateSignedQualityImportReviewAdmissionCore({root,anchor}, historical?.entries ?? [], historical);
}
function evaluateSignedQualityImportReviewAdmissionCore({ root, anchor } = {}, historicalEntries = [], historical = null) {
  try {
    const anchorKeys = ["schema", "intentSha256", "integrationCommit", "baseCommit", "candidateCommit", "taskId"];
    if (typeof root !== "string" || !anchor || typeof anchor !== "object" || Array.isArray(anchor)
      || Object.keys(anchor).length !== anchorKeys.length || anchorKeys.some((key) => !Object.hasOwn(anchor, key))
      || anchor.schema !== "pipeline.signed-quality-import-review-anchor.v1"
      || !SHA256.test(anchor.intentSha256 ?? "") || !OID.test(anchor.integrationCommit ?? "")
      || !OID.test(anchor.baseCommit ?? "") || !OID.test(anchor.candidateCommit ?? "")
      || anchor.taskId !== `signed-import-${anchor.intentSha256}`) {
      signedImportFailure("signed-import-anchor-shape");
    }
    const range = validateStampOnlyRange(root, anchor.integrationCommit, anchor.candidateCommit);
    if (range.baseCommit !== anchor.baseCommit) signedImportFailure("signed-import-base-mismatch");
    const signed = verifyQualityPackageIntegrationPostCommit({ repoRoot: root,
      commitSha: anchor.integrationCommit, intentSha256: anchor.intentSha256 });
    if (!signed?.ok || signed.code !== "QUALITY-PACKAGE-INTEGRATION-POSTCOMMIT-VERIFIED"
      || signed.intentSha256 !== anchor.intentSha256) signedImportFailure("signed-import-not-authorized");
    const coverage = historical !== null || historicalEntries.length > 0
      ? evaluateReviewAdmissionCore({root,taskId:anchor.taskId,candidateCommit:anchor.candidateCommit},historicalEntries,anchor)
      : evaluateRepositoryCriticSkipCoverage({ root });
    if (!coverage.ok) return { ok: false, code: "signed-import-ordinary-coverage-pending",
      authorityKind: "signed-quality-import", anchor, ordinaryCoverage: coverage,
      findings: coverage.readFindings };
    const tree = readGit(root, ["rev-parse", `${anchor.candidateCommit}^{tree}`]);
    return {
      ok: true,
      code: "signed-quality-import-review-admitted",
      authorityKind: "signed-quality-import",
      anchor,
      reviewCandidate: { commit: anchor.candidateCommit, tree },
      candidateRange: { baseCommit: range.baseCommit, integrationCommit: range.integrationCommit,
        candidateCommit: range.candidateCommit, commits: range.rangeCommits, changedPaths: range.changedPaths },
      ordinaryCoverage: { ok: coverage.ok, applicableRecordCount: coverage.applicableRecordCount,
        requiredRecordCount: coverage.requiredRecordCount, criticEvidenceRecordCount: coverage.criticEvidenceRecordCount,
        skipRecordCount: coverage.skipRecordCount, legacyRecordCount: coverage.legacyRecordCount,
        administrativelyRetiredRecordCount: coverage.administrativelyRetiredRecordCount },
      targetRecordCount: 0,
      historicalQualification: historical ? "unknown" : null,
      historicalDebtCount: historical?.entries.length ?? 0,
      ...(historical ? { historicalFreshReview: historicalFreshReviewPacketBinding({repository:root,currentTarget:{kind:"signed-quality-import",taskId:anchor.taskId,baseCommit:anchor.baseCommit,candidateCommit:anchor.candidateCommit}}) } : {}),
    };
  } catch (error) {
    return { ok: false, code: error?.code ?? "signed-import-invalid", details: error?.details ?? null,
      authorityKind: "signed-quality-import", findings: [error?.code ?? "signed-import-invalid"] };
  }
}

/**
 * Load the append-only reconciliation index for old terminal records which
 * truthfully produced no commit. The index is intentionally a byte binding:
 * editing either the historical record or its named successor/evidence makes
 * the corpus fail again rather than silently grandfathering new content.
 */
export function readLegacyDispatchReconcileIndex(root, { indexPath = DEFAULT_LEGACY_RECONCILE_INDEX_PATH } = {}) {
  const findings = [];
  const entriesByPath = new Map();
  const absolute = resolve(root, indexPath);
  if (!existsSync(absolute)) return { findings, entriesByPath, indexPresent: false };
  let index;
  try { index = JSON.parse(readFileSync(absolute, "utf8")); }
  catch (error) { return { findings: [`${indexPath}: could not be read as valid JSON (${error.message})`], entriesByPath, indexPresent: true }; }
  try {
    exactObject(index, ["schema", "entries"], "legacy reconcile index");
    if (index.schema !== LEGACY_RECONCILE_SCHEMA) throw new Error(`legacy reconcile index schema must be ${LEGACY_RECONCILE_SCHEMA}`);
    if (!Array.isArray(index.entries) || index.entries.length === 0 || index.entries.length > 512) throw new Error("legacy reconcile index entries must be a non-empty bounded array");
  } catch (error) { return { findings: [`${indexPath}: invalid legacy reconcile index (${error.message})`], entriesByPath, indexPresent: true }; }
  for (const [position, entry] of index.entries.entries()) {
    const label = `${indexPath}: entries[${position}]`;
    try {
      exactObject(entry, ["recordPath", "recordSha256", "terminalKind", "disposition"], label);
      normalizeDispatchRecordPath(entry.recordPath, `${label}.recordPath`);
      if (!/^evidence\/dispatch-record-.+\.json$/u.test(entry.recordPath)) throw new Error(`${label}.recordPath must name an evidence dispatch record`);
      if (entriesByPath.has(entry.recordPath)) throw new Error(`${label}.recordPath duplicates an earlier reconciliation entry`);
      if (!["read-only", "stopped-without-commit"].includes(entry.terminalKind)) throw new Error(`${label}.terminalKind is invalid`);
      exactObject(entry.disposition, ["kind", "path", "sha256"], `${label}.disposition`);
      if (!["successor", "evidence"].includes(entry.disposition.kind)) throw new Error(`${label}.disposition.kind is invalid`);
      normalizeDispatchRecordPath(entry.disposition.path, `${label}.disposition.path`);
      if (!/^(?:evidence|backlog\/evidence)\//u.test(entry.disposition.path)) throw new Error(`${label}.disposition.path must be under evidence/ or backlog/evidence/`);
      if (entry.disposition.kind === "successor" && !/^evidence\/dispatch-record-.+\.json$/u.test(entry.disposition.path)) throw new Error(`${label}.disposition successor must name an evidence dispatch record`);
      if (!existsSync(resolve(root, entry.recordPath))) {
        continue;
      }
      if (!existsSync(resolve(root, entry.recordPath))) {
        continue;
      }
      const source = physicalRegularFile(root, entry.recordPath, `${label}.recordPath`);
      if (source.finding) throw new Error(source.finding);
      const sourceDigestFinding = digestMatches(source.bytes, entry.recordSha256, `${label}.recordSha256`);
      if (sourceDigestFinding) throw new Error(sourceDigestFinding);
      const target = physicalRegularFile(root, entry.disposition.path, `${label}.disposition.path`);
      if (target.finding) throw new Error(target.finding);
      const targetDigestFinding = digestMatches(target.bytes, entry.disposition.sha256, `${label}.disposition.sha256`);
      if (targetDigestFinding) throw new Error(targetDigestFinding);
      entriesByPath.set(entry.recordPath, entry);
    } catch (error) { findings.push(`${label}: invalid legacy reconciliation (${error.message})`); }
  }
  return { findings, entriesByPath, indexPresent: true };
}

function reconciledNoCommitFinding(record, entry) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return "reconciled historical record must be an object";
  if (!Array.isArray(record.commits) || record.commits.length !== 0) return "reconciled historical record must declare exactly zero commits";
  if (!isTerminalOutcome(record.outcome)) return "reconciled historical record must declare a terminal outcome";
  if (entry.terminalKind === "read-only" && !["completed", "completed-analysis-only", "analysis-complete", "partial-analysis-only"].includes(record.outcome) && !/(?:read-only|analysis-only)/u.test(record.outcome)) return "read-only reconciliation requires a completed, read-only, or analysis-only historical outcome";
  return null;
}

export function walkDispatchRecords(root) {
  return walkDispatchRecordsForReview(root, []);
}
function walkDispatchRecordsForReview(root, historicalEntries) {
  const findings = [];
  const records = [];
  let entries;
  try { entries = readdirSync(resolve(root, EVIDENCE_DIR), { withFileTypes: true }); }
  catch (error) { return { records, findings: [`${EVIDENCE_DIR} is missing or unreadable: ${error.message}`], filesScanned: 0 }; }
  const names = entries.filter((entry) => entry.isFile() && DISPATCH_RECORD_PATTERN.test(entry.name)).map((entry) => entry.name).sort();
  for (const name of names) {
    const path = `${EVIDENCE_DIR}/${name}`;
    try {
      const historical = historicalEntries.find(entry => entry.path === path);
      if (historical) {
        const source = physicalRegularFile(root, path, path);
        const info = lstatSync(resolve(root, path));
        if (source.finding || info.nlink !== 1 || source.bytes.length !== historical.byteLength
          || (info.mode & 0o777) !== historical.mode || digest(source.bytes) !== historical.sha256) {
          findings.push(`${path}: historical fresh-review inventory drifted`);
        }
        continue; // zero authorship/review coverage; debt remains in the admission report
      }
      const bytes = readFileSync(resolve(root, path));
      records.push({ path, bytes, sha256: createHash("sha256").update(bytes).digest("hex"), record: JSON.parse(bytes.toString("utf8")) });
    }
    catch (error) { findings.push(`${path}: could not be read as valid JSON (${error.message})`); }
  }
  return { records, findings, filesScanned: names.length };
}

function readCriticDispositionAddenda(root) {
  const findings = [];
  const entriesByPath = new Map();
  let names;
  try { names = readdirSync(resolve(root, EVIDENCE_DIR)).filter((name) => CRITIC_ADDENDUM_PATTERN.test(name)).sort(); }
  catch (error) { return { entriesByPath, findings: [`${EVIDENCE_DIR} is missing or unreadable: ${error.message}`] }; }
  for (const name of names) {
    const path = `${EVIDENCE_DIR}/${name}`;
    const file = physicalRegularFile(root, path, path);
    if (file.finding) { findings.push(file.finding); continue; }
    try {
      const addendum = parseStrictJson(file.bytes);
      if (path !== criticDispositionAddendumPath(addendum.taskId)) throw new TypeError("critic addendum filename does not match taskId");
      if (entriesByPath.has(addendum.recordPath)) throw new TypeError("duplicate critic addendum for dispatch record");
      entriesByPath.set(addendum.recordPath, { path, addendum });
    } catch (error) { findings.push(`${path}: invalid critic addendum (${error.message})`); }
  }
  return { entriesByPath, findings };
}

const COMMIT_OID = /^[a-f0-9]{40}$/u;
/** True when `ancestor` is an ancestor of, or equal to, `descendant`; false only on git's "not an ancestor" exit (1). Anything else throws. */
function gitIsAncestor(gitRead, ancestor, descendant) {
  try { gitRead(["merge-base", "--is-ancestor", ancestor, descendant]); return true; }
  catch (error) { if (error?.status === 1) return false; throw error; }
}

/**
 * D212 (N33 B): a consumed, passed Critic receipt whose packet carries ANOTHER task id (a feature-wide Critic course) satisfies a
 * required record when the record's commit lies inside the receipt's reviewed range.
 *
 * The reviewed range is read from the validated receipt, `bound.critic.reviewRange = { base, commit, diffSha256 }`.
 * `readBoundConsumedCriticReceipt` has already proved that it equals the consumed packet's `diff` and that its `commit` is the
 * review candidate; a receipt always names a `base` (the receipt validator requires one). The range is the half-open set
 * (base, commit]: the record's commit must be an ancestor of, or equal to, the review candidate and must NOT be an ancestor of, or
 * equal to, the base. A course packet never lists the record as reviewed evidence, so the record-binding checks of the task-bound
 * route do not apply; the private snapshot, when present, keeps its exact key shape and its assurance (null or orchestrator-attested).
 */
/** D217 (N35 A, C): shared text of a failed receipt that no valid PO residual acceptance binds; names the accept route. */
const FAILED_RECEIPT_FINDING = "Critic addendum does not match a passed, consumed, task-bound Critic receipt: a failed receipt never binds without a PO residual acceptance of its minor findings (the PO's own attended step: node <plugin-root>/scripts/pipeline-state.mjs approve-residual-acceptance --by <name> --critic-packet <packet-id>)";
const COURSE_LINEAGE_FEATURE_LIMIT = 256;
const courseHistoryCache = new Map();
/**
 * D217 (N35 B): the registered Critic course the addendum's packet belongs to, or null. The course is derived from the packet id
 * alone (no field is added to the addendum): every registered lineage record carries `request.packetId`, and the records of one
 * course live in one feature package's `specs/<featureId>/lifecycle.json`. The feature id therefore falls out of the path that holds
 * the record, whichever feature the close is for. The manifest is read at the repository HEAD, not at the review candidate: the
 * lineage record of the LAST round is registered in a commit after that round's candidate.
 */
function defaultReadCourseHistory({ root, gitRead, criticPacketId }) {
  const head = gitRead(["rev-parse", "HEAD"]);
  const repoRoot = resolve(root);
  const key = `${repoRoot}\0${head}\0${criticPacketId}`;
  if (courseHistoryCache.has(key)) return courseHistoryCache.get(key);
  let found = null;
  const listing = gitRead(["ls-tree", "--name-only", "-d", head, "specs/"]);
  for (const entry of listing.split("\n").filter(Boolean).slice(0, COURSE_LINEAGE_FEATURE_LIMIT)) {
    const featureId = entry.replace(/^specs\//u, "");
    let resolved;
    // The reader of the CURRENT registration route (lineage rows of schema v1 and v2), not the v1-only runtime reader.
    try { resolved = resolveRetainedCriticCourseRecords({ repoRoot, featureId, candidateCommit: head }); } catch { continue; }
    if (Array.isArray(resolved?.history) && resolved.history.some((row) => row?.request?.packetId === criticPacketId)) { found = resolved.history; break; }
  }
  if (courseHistoryCache.size > 64) courseHistoryCache.clear();
  courseHistoryCache.set(key, found);
  return found;
}

/**
 * D217 (N35 B): a record is covered by the UNION of the reviewed ranges of the registered rounds of one course when (1) the addendum
 * names the LAST round of that course (its packet and its review candidate), (2) that round passed or is residual-accepted (checked by
 * the caller through the bound receipt), (3) the rounds form one connected chain (a delta round starts at the previous round's
 * candidate; a full round starts at the course genesis base) and (4) the record's commit is an ancestor of, or equal to, the last
 * candidate and not an ancestor of, or equal to, the genesis base. Earlier rounds may carry findings: the later rounds reviewed the
 * corrections. Returns null when covered, else the reason.
 */
function courseChainFinding(addendum, bound, history, gitRead) {
  const notRound = "the Critic packet is no round of a registered Critic course";
  if (!Array.isArray(history) || history.length === 0) return notRound;
  const index = history.findIndex((row) => row?.request?.packetId === addendum.criticPacketId);
  if (index < 0) return notRound;
  const last = history.at(-1);
  if (index !== history.length - 1 || last?.candidate?.commit !== addendum.reviewCandidateCommit) {
    return "the addendum must name the last round of the registered Critic course (an earlier round does not cover the records of the later rounds)";
  }
  if (bound.critic?.reviewRange?.base !== last?.diff?.base) return "the registered last round and the consumed receipt name different reviewed ranges";
  const genesisBase = history[0]?.diff?.base;
  if (!COMMIT_OID.test(genesisBase ?? "")) return "the registered rounds do not form one connected chain (the course genesis base is not a commit)";
  for (let round = 0; round < history.length; round += 1) {
    const base = history[round]?.diff?.base;
    const head = history[round]?.candidate?.commit;
    const mode = history[round]?.request?.mode;
    const connected = COMMIT_OID.test(base ?? "") && COMMIT_OID.test(head ?? "")
      && (round === 0 || (mode === "delta" && base === history[round - 1].candidate.commit) || (mode === "full" && base === genesisBase));
    if (!connected || !gitIsAncestor(gitRead, base, head)) return `the registered rounds do not form one connected chain (round ${round + 1} breaks it)`;
  }
  if (!gitIsAncestor(gitRead, addendum.candidateCommit, last.candidate.commit)) return "the commit is not an ancestor of the last candidate of the registered course";
  if (gitIsAncestor(gitRead, addendum.candidateCommit, genesisBase)) return "the commit is not after the course genesis base";
  return null;
}

function courseReceiptFinding(addendum, bound, gitRead, { root, readCourseHistory } = {}) {
  const single = singleReceiptFinding(addendum, bound, gitRead);
  if (single === null) return null;
  // Not inside this one receipt's range: the registered course, when there is one, may still cover the record (D217 B).
  let chain;
  try {
    const history = (readCourseHistory ?? defaultReadCourseHistory)({ root, gitRead, criticPacketId: addendum.criticPacketId });
    chain = courseChainFinding(addendum, bound, history, gitRead);
  } catch { return single; }
  return chain === null ? null : `${single}; nor does the registered Critic course cover it (${chain})`;
}

function singleReceiptFinding(addendum, bound, gitRead) {
  const prefix = "Critic addendum does not match a passed, consumed Critic receipt of this task or a course receipt whose reviewed range contains the record's commit";
  const range = bound.critic.reviewRange;
  if (range === null || typeof range !== "object" || !COMMIT_OID.test(range.base ?? "") || range.commit !== addendum.reviewCandidateCommit) {
    return `${prefix} (the receipt names no reviewed range ending at the review candidate)`;
  }
  const local = bound.packet?.coordinatorOnly?.localDispatchEvidence;
  if (local !== undefined) {
    const legacyForm = !Object.hasOwn(local ?? {}, "assurance");
    try {
      exactObject(local, legacyForm
        ? ["schema", "taskId", "recordPath", "recordSha256", "sourceCandidateCommit", "reviewCandidateCommit", "snapshotId"]
        : ["schema", "taskId", "recordPath", "recordSha256", "sourceCandidateCommit", "reviewCandidateCommit", "assurance", "snapshotId"], "private local dispatch evidence");
    } catch { return "Critic packet private local dispatch snapshot does not bind the exact immutable dispatch record"; }
    if (!legacyForm && local.assurance !== null && local.assurance !== "orchestrator-attested") {
      return "Critic packet private local dispatch snapshot does not bind the exact immutable dispatch record";
    }
  }
  if (!gitIsAncestor(gitRead, addendum.candidateCommit, range.commit)) return `${prefix} (the commit is not an ancestor of the reviewed candidate)`;
  if (gitIsAncestor(gitRead, addendum.candidateCommit, range.base)) return `${prefix} (the commit is not after the reviewed range base)`;
  return null;
}

function boundCriticReviewFinding(root, addendum, recordBytes, options = {}) {
  try {
    const readBound = options.readBoundCriticReceipt ?? ((input, deps) => readBoundConsumedCriticReceipt(input, deps));
    const loadResidualDeps = options.loadResidualDeps ?? ((input) => loadResidualAcceptanceDepsForPacket(input));
    const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/iu.test(key)));
    const gitRead = options.gitRead ?? ((args) => execFileSync("git", args, {
      cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024,
      env: gitEnv,
    }).trim());
    const readGitBlob = options.readGitBlob ?? ((oid) => execFileSync("git", ["cat-file", "blob", oid], {
      cwd: root, maxBuffer: 1024 * 1024, env: gitEnv,
    }));
    const gitCommonDir = resolve(root, gitRead(["rev-parse", "--git-common-dir"]));
    gitRead(["merge-base", "--is-ancestor", addendum.candidateCommit, addendum.reviewCandidateCommit]);
    const tree = gitRead(["rev-parse", "--verify", `${addendum.reviewCandidateCommit}^{tree}`]);
    // D217 (N35 A): the PO residual acceptance of this packet's receipt (the same loader Verify and the push gate use) reaches the
    // receipt reader, which admits a failed receipt only through a candidate-, digest- and finding-set-bound, all-minor acceptance.
    const residualDeps = loadResidualDeps({ gitCommonDir, projectDir: root, criticPacketId: addendum.criticPacketId }) ?? undefined;
    let bound;
    try {
      bound = readBound({ gitCommonDir, criticPacketId: addendum.criticPacketId,
        candidate: { commit: addendum.reviewCandidateCommit, tree } }, residualDeps);
    } catch (error) {
      if (error?.code === "CVL-CRITIC-FAILED") return FAILED_RECEIPT_FINDING;
      throw error;
    }
    if (bound?.critic?.candidate?.commit !== addendum.reviewCandidateCommit
      || bound.criticReceiptSha256 !== addendum.criticReceiptSha256) {
      return "Critic addendum does not match a passed, consumed, task-bound Critic receipt";
    }
    // A failed receipt never binds without a valid PO residual acceptance (`residual` is non-null only then).
    if (bound.critic.reviewPass !== true && (bound.residual === null || bound.residual === undefined)) return FAILED_RECEIPT_FINDING;
    if (bound?.packet?.request?.taskId !== addendum.taskId) {
      // D212 (N33 B): task-id equality stays sufficient (below); a receipt of another task id is a course receipt and satisfies the
      // record when the record's commit lies inside the receipt's reviewed range or, D217 (N35 B), inside the union of the
      // reviewed ranges of the registered rounds of the same course (this receipt being its last round).
      return courseReceiptFinding(addendum, bound, gitRead, { root, readCourseHistory: options.readCourseHistory });
    }
    const localDispatchEvidence = bound.packet.coordinatorOnly?.localDispatchEvidence;
    if (localDispatchEvidence !== undefined) {
      // A packet claimed before the assurance field carries the exact old key set and the old digest; it reads as assurance null.
      const legacyForm = !Object.hasOwn(localDispatchEvidence ?? {}, "assurance");
      try {
        exactObject(localDispatchEvidence, legacyForm
          ? ["schema", "taskId", "recordPath", "recordSha256", "sourceCandidateCommit", "reviewCandidateCommit", "snapshotId"]
          : ["schema", "taskId", "recordPath", "recordSha256",
            "sourceCandidateCommit", "reviewCandidateCommit", "assurance", "snapshotId"], "private local dispatch evidence");
      } catch {
        return "Critic packet private local dispatch snapshot does not bind the exact immutable dispatch record";
      }
      const binding = {
        schema: localDispatchEvidence.schema,
        taskId: localDispatchEvidence.taskId,
        recordPath: localDispatchEvidence.recordPath,
        recordSha256: localDispatchEvidence.recordSha256,
        sourceCandidateCommit: localDispatchEvidence.sourceCandidateCommit,
        reviewCandidateCommit: localDispatchEvidence.reviewCandidateCommit,
        ...(legacyForm ? {} : { assurance: localDispatchEvidence.assurance }),
      };
      const packetCandidate = bound.packet.candidate?.commit;
      const expectedPath = `evidence/dispatch-record-${addendum.taskId}.json`;
      let sourceRecord;
      try { sourceRecord = parseStrictJson(recordBytes); }
      catch { return "Critic packet private local dispatch snapshot does not bind the exact immutable dispatch record"; }
      if (localDispatchEvidence.schema !== "pipeline.local-dispatch-evidence.v1"
        || localDispatchEvidence.taskId !== addendum.taskId
        || sourceRecord?.taskId !== addendum.taskId
        || localDispatchEvidence.recordPath !== expectedPath
        || localDispatchEvidence.recordSha256 !== digest(recordBytes)
        || localDispatchEvidence.sourceCandidateCommit !== addendum.candidateCommit
        || localDispatchEvidence.sourceCandidateCommit !== sourceRecord?.candidateCommit
        || localDispatchEvidence.reviewCandidateCommit !== addendum.reviewCandidateCommit
        || localDispatchEvidence.reviewCandidateCommit !== packetCandidate
        || (!legacyForm && localDispatchEvidence.assurance !== null && localDispatchEvidence.assurance !== "orchestrator-attested")
        || localDispatchEvidence.snapshotId !== sha256Canonical(binding)
        || bound.packet.request?.taskId !== addendum.taskId
        || !Array.isArray(bound.packet.references)
        || bound.packet.references.some((reference) => reference?.path === expectedPath)) {
        return "Critic packet private local dispatch snapshot does not bind the exact immutable dispatch record";
      }
      gitRead(["merge-base", "--is-ancestor", localDispatchEvidence.sourceCandidateCommit,
        localDispatchEvidence.reviewCandidateCommit]);
      return null;
    }
    const blobOid = gitRead(["rev-parse", "--verify", `${addendum.reviewCandidateCommit}:${addendum.recordPath}`]);
    if (!bound.packet.references?.some((reference) => reference.kind === "evidence"
      && reference.path === addendum.recordPath && reference.candidateBlobOid === blobOid)
      || !Buffer.from(readGitBlob(blobOid)).equals(recordBytes)) {
      return "Critic packet does not bind the exact immutable dispatch record as reviewed evidence";
    }
    return null;
  } catch (error) { return `consumed Critic receipt is unavailable or invalid (${error.code ?? "readback"})`; }
}

function resolvedCriticAddendumFinding(root, entry, addendumEntry, options) {
  try { validateCriticDispositionAddendum(addendumEntry.addendum, { recordPath: entry.path, recordBytes: entry.bytes, record: entry.record }); }
  catch (error) { return `${addendumEntry.path}: ${error.message}`; }
  const evidenceFinding = verifyCriticEvidence(root, addendumEntry.path, addendumEntry.addendum.criticEvidence);
  if (evidenceFinding) return evidenceFinding;
  const reviewFinding = boundCriticReviewFinding(root, addendumEntry.addendum, entry.bytes, options);
  return reviewFinding ? `${addendumEntry.path}: ${reviewFinding}` : null;
}

/**
 * Finding (string) or null for an addendum that is NOT yet on disk: the same evidence and receipt checks the coverage evaluation
 * applies to a published addendum, so the sanctioned writer can refuse an unbound addendum before its exclusive, irreplaceable
 * publication (D212 C). Additive export; shares resolvedCriticAddendumFinding with every other consumer.
 */
export function criticAddendumBindingFinding({ root, addendum, record, recordBytes, options = {} } = {}) {
  return resolvedCriticAddendumFinding(root,
    { path: addendum.recordPath, bytes: recordBytes, record },
    { path: criticDispositionAddendumPath(addendum.taskId), addendum }, options);
}

/** Single-record readback for authorship consumers; does not waive corpus coverage. */
export function verifyCriticDispositionAddendumForRecord({ root, taskId, record, recordBytes, options = {} } = {}) {
  if (typeof root !== "string" || !Buffer.isBuffer(recordBytes)) {
    return { ok: false, code: "critic-addendum-input" };
  }
  let addendumPath;
  try { addendumPath = criticDispositionAddendumPath(taskId); }
  catch { return { ok: false, code: "critic-addendum-task-invalid" }; }
  if (!existsSync(resolve(root, addendumPath))) return { ok: false, code: "critic-addendum-missing" };
  const file = physicalRegularFile(root, addendumPath, "critic addendum");
  if (!file.bytes) return { ok: false, code: "critic-addendum-unreadable" };
  let addendum;
  try { addendum = parseStrictJson(file.bytes); }
  catch { return { ok: false, code: "critic-addendum-malformed" }; }
  const recordPath = `evidence/dispatch-record-${taskId}.json`;
  const finding = resolvedCriticAddendumFinding(root,
    { path: recordPath, bytes: recordBytes, record },
    { path: addendumPath, addendum }, options);
  return finding ? { ok: false, code: "critic-addendum-invalid" }
    : { ok: true, code: "critic-addendum-bound" };
}


function legacySchema(record) {
  return record?.schema === undefined || record?.schema === "pipeline.dispatch-record.v1" || record?.schema === "pipeline.dispatch-evidence.v1" || record?.schema === LEGACY_DISPATCH_RECORD_SCHEMA;
}

function verifyCriticEvidence(root, sourcePath, reference) {
  const absolute = resolve(root, reference.path);
  const physicalRoot = realpathSync(resolve(root));
  const rel = relative(physicalRoot, absolute);
  if (rel === "" || rel === ".." || rel.startsWith("../") || rel.startsWith("..\\")) return `${sourcePath}: criticEvidence path escapes repository root`;
  let info;
  let bytes;
  try {
    info = lstatSync(absolute);
    if (!info.isFile() || info.isSymbolicLink()) return `${sourcePath}: criticEvidence path is not a physical file: ${reference.path}`;
    const physicalEvidence = realpathSync(absolute);
    const physicalRel = relative(physicalRoot, physicalEvidence);
    if (physicalRel === "" || physicalRel === ".." || physicalRel.startsWith("../") || physicalRel.startsWith("..\\")) return `${sourcePath}: criticEvidence physical path escapes repository root`;
    bytes = readFileSync(absolute);
  } catch (error) { return `${sourcePath}: criticEvidence is missing or unreadable at ${reference.path} (${error.message})`; }
  const actual = createHash("sha256").update(bytes).digest("hex");
  return actual === reference.sha256 ? null : `${sourcePath}: criticEvidence digest mismatch for ${reference.path}`;
}

export function readCommitChangedPaths(root, commits, { execFile = execFileSync } = {}) {
  if (!Array.isArray(commits)) throw new Error("criticSkip commits must be an array for path verification");
  const paths = new Set();
  for (const sha of commits) {
    const output = execFile("git", ["diff-tree", "--root", "--no-commit-id", "--no-renames", "--name-only", "-r", "-z", sha], {
      cwd: root, encoding: "buffer", maxBuffer: 32 * 1024 * 1024,
    });
    for (const path of Buffer.from(output).toString("utf8").split("\0").filter(Boolean)) paths.add(path);
  }
  return [...paths].sort();
}

export function evaluateRepositoryCriticSkipCoverage(options = {}) {
  const root = options.root ?? DEFAULT_ROOT;
  const readChangedPaths = options.readChangedPaths ?? ((record) => readCommitChangedPaths(root, record.commits));
  const scan = walkDispatchRecords(root);
  const reconciliations = readLegacyDispatchReconcileIndex(root, options);
  const abandoned = readAbandonedV3RecoveryIndex(root, options);
  const addenda = readCriticDispositionAddenda(root);
  const findings = [...scan.findings, ...reconciliations.findings, ...abandoned.findings, ...addenda.findings];
  const usedAddenda = new Set();
  let applicableRecordCount = 0;
  let legacyRecordCount = 0;
  let skipRecordCount = 0;
  let requiredRecordCount = 0;
  let criticEvidenceRecordCount = 0;
  let reconciledLegacyRecordCount = 0;
  let administrativelyRetiredRecordCount = 0;
  // Optional scope: only records belonging to one of these ids (`sliceId ?? taskId`) are evaluated.
  // Without it behaviour and every count are unchanged. `requiredTaskIds` is only reported when scoped.
  const scope = options.taskIds === undefined ? null : new Set(options.taskIds);
  const requiredTaskIds = new Set();
  for (const entry of scan.records) {
    const { path, record } = entry;
    if (scope !== null) {
      const owner = typeof record?.sliceId === "string" ? record.sliceId : record?.taskId;
      if (!scope.has(owner)) { usedAddenda.add(path); continue; }
    }
    const retirement = abandoned.entriesByPath.get(path);
    if (retirement) {
      const retirementFinding = abandonedV3RecordFinding(entry, retirement);
      if (retirementFinding) findings.push(retirementFinding);
      else { administrativelyRetiredRecordCount += 1; continue; }
    }
    const reconciliation = reconciliations.entriesByPath.get(path);
    if (reconciliation) {
      if (record?.schema === DISPATCH_RECORD_SCHEMA) {
        findings.push(`${path}: a v4 record cannot be removed from coverage by the historical no-commit reconciliation index`);
        continue;
      }
      const reconciliationFinding = reconciledNoCommitFinding(record, reconciliation);
      if (reconciliationFinding) findings.push(`${path}: ${reconciliationFinding}`);
      else { legacyRecordCount += 1; reconciledLegacyRecordCount += 1; }
      continue;
    }
    if (legacySchema(record)) {
      legacyRecordCount += 1;
      if (record?.schema === LEGACY_DISPATCH_RECORD_SCHEMA) {
        try { validateLegacyDispatchRecord(record); } catch (error) { findings.push(`${path}: invalid legacy v2 record (${error.message})`); }
      }
      continue;
    }
    const isV4 = record?.schema === DISPATCH_RECORD_SCHEMA;
    const isV3 = record?.schema === PREVIOUS_DISPATCH_RECORD_SCHEMA;
    if (!isV3 && !isV4) {
      findings.push(`${path}: unsupported dispatch record schema ${JSON.stringify(record?.schema)}`);
      continue;
    }
    applicableRecordCount += 1;
    try { isV4 ? validateDispatchRecord(record) : validatePreviousDispatchRecord(record); }
    catch (error) { findings.push(`${path}: invalid ${isV4 ? "v4" : "v3"} dispatch record (${error.message})`); continue; }
    const disposition = criticDisposition(record);
    const addendum = addenda.entriesByPath.get(path);
    if (addendum && disposition !== "required") {
      findings.push(`${addendum.path}: critic addendum is only valid for a required dispatch record`);
      usedAddenda.add(path);
    }
    if (disposition === "skipped") {
      try {
        const pathFinding = criticDecisionPathFinding(record.criticSkip, readChangedPaths(record));
        if (pathFinding) findings.push(`${path}: ${pathFinding.reason}`);
        else skipRecordCount += 1;
      } catch (error) {
        findings.push(`${path}: actual changed paths could not be derived (${error.message})`);
      }
      continue;
    }
    if (disposition === "required") {
      if (addendum) {
        usedAddenda.add(path);
        const addendumFinding = resolvedCriticAddendumFinding(root, entry, addendum, options);
        if (addendumFinding) { requiredRecordCount += 1; requiredTaskIds.add(record.taskId); findings.push(addendumFinding); }
        else criticEvidenceRecordCount += 1;
      } else {
        const portable = isV4 && record.runner === "antigravity"
          && record.outcomeClassification?.kind === "authored-commit"
          && record.commits.length === 1
          ? readPortableAgyAuthorshipExport({ root, taskId: record.taskId,
            commit: record.commits[0], record }) : null;
        if (portable?.ok && portable.authority === "host-observed-portable") {
          criticEvidenceRecordCount += 1;
        } else {
          requiredRecordCount += 1;
          requiredTaskIds.add(record.taskId);
          findings.push(portable && portable.code !== "agy-export-missing"
            ? `${path}: signed portable Agy export is invalid (${portable.code})`
            : `${path}: Critic is required by ${record.criticRequired.appliedRow}; task/candidate/digest-bound criticEvidence is missing`);
        }
      }
      continue;
    }
    if (disposition === "evidenced") {
      const evidenceFinding = verifyCriticEvidence(root, path, record.criticEvidence);
      if (evidenceFinding) findings.push(evidenceFinding);
      else criticEvidenceRecordCount += 1;
      continue;
    }
    findings.push(`${path}: requires exactly one Critic disposition`);
  }
  for (const [path, addendum] of addenda.entriesByPath) if (!usedAddenda.has(path)) findings.push(`${addendum.path}: orphan critic addendum has no applicable pending record`);
  const uncoveredRecordCount = applicableRecordCount - skipRecordCount - criticEvidenceRecordCount;
  const ok = findings.length === 0 && uncoveredRecordCount === 0;
  return {
    ok,
    finding: !ok,
    reason: ok
      ? `${skipRecordCount} skipped and ${criticEvidenceRecordCount} evidenced v3/v4 dispatch record(s); ${legacyRecordCount} pre-cutover record(s) preserved as legacy (${reconciledLegacyRecordCount} byte-bound no-commit reconciliation(s))`
      : findings.length > 0
        ? `${findings.length} dispatch/evidence validation finding(s); ${uncoveredRecordCount} applicable v3/v4 record(s) remain uncovered`
        : `${uncoveredRecordCount} of ${applicableRecordCount} applicable v3/v4 dispatch record(s) lack a valid per-record Critic disposition`,
    dispatchedWorkCount: applicableRecordCount,
    applicableRecordCount,
    legacyRecordCount,
    criticArtifactCount: criticEvidenceRecordCount,
    criticEvidenceRecordCount,
    requiredRecordCount,
    skipRecordCount,
    reconciledLegacyRecordCount,
    administrativelyRetiredRecordCount,
    readFindings: findings,
    ...(scope === null ? {} : { requiredTaskIds: [...requiredTaskIds].sort() }),
  };
}

/**
 * Admit exactly one current dispatch record to independent review without
 * treating any pending Critic disposition as completion. Coverage remains a
 * separate gate: other valid required records are reported as pending, while
 * malformed or stale corpus entries remain blocking.
 */
export function evaluateReviewAdmission(options = {}) {
  const root = options.root ?? DEFAULT_ROOT;
  const historical = historicalAdmission(root, { kind: "admitted-dispatch", taskId: options.taskId,
    baseCommit: options.baseCommit, candidateCommit: options.candidateCommit });
  const result = evaluateReviewAdmissionCore(options, historical?.entries ?? []);
  return { ...result, historicalQualification: historical ? "unknown" : null,
    historicalDebtCount: historical?.entries.length ?? 0,
    ...(historical ? { historicalFreshReview: historicalFreshReviewPacketBinding({repository:root,currentTarget:{kind:"admitted-dispatch",taskId:options.taskId,baseCommit:options.baseCommit,candidateCommit:options.candidateCommit}}) } : {}) };
}
// N13 (Toolbox, 2026-10-29): admission has two routes, and the refusal named only the first. A later Critic round carries the
// task id of the first delivery; a candidate that descends from that delivered record is admitted without any new record.
const DESCENDANT_ROUTE_HINT = "a later Critic round carries the task id of its first delivery: a review candidate that descends from a delivered Goldfish record (authored-commit or orchestrator-attested) with the SAME task id is admitted without a new record, so do not invent a task id per round.";
const DESCENDANT_TASK_ID_SEARCH_LIMIT = 25;
function descendantTaskIdsOfDeliveredRecords(root, records, candidateCommit, options) {
  const found = new Set();
  for (const record of records.slice(-DESCENDANT_TASK_ID_SEARCH_LIMIT)) {
    try { if (verifyCandidateDescendsFromRecord(root, record.candidateCommit, candidateCommit, options).ok) found.add(record.taskId); }
    catch { /* a record whose ancestry cannot be read names no suggestion */ }
  }
  return [...found].sort();
}
function evaluateReviewAdmissionCore(options = {}, historicalEntries = [], signedImportAnchor = null) {
  const root = options.root ?? DEFAULT_ROOT;
  const taskId = options.taskId;
  const candidateCommit = options.candidateCommit;
  const readChangedPaths = options.readChangedPaths ?? ((record) => readCommitChangedPaths(root, record.commits));
  const scan = walkDispatchRecordsForReview(root, historicalEntries);
  const reconciliations = readLegacyDispatchReconcileIndex(root, options);
  const abandoned = readAbandonedV3RecoveryIndex(root, options);
  const addenda = readCriticDispositionAddenda(root);
  const findings = [...scan.findings, ...reconciliations.findings, ...abandoned.findings, ...addenda.findings];
  const usedAddenda = new Set();
  let admittedCount = 0;
  let applicableRecordCount = 0;
  let coveredRecordCount = 0;
  let pendingRecordCount = 0;
  let administrativelyRetiredRecordCount = 0;
  const pendingRecordPaths = [];
  let targetRecordCandidateCommit = null;
  let admittedByDescendant = false;
  let admittedRecordKind = null;
  const pendingDeliveredRecords = [];
  if (typeof taskId !== "string" || taskId.trim() === "") findings.push("review admission taskId is required");
  if (typeof candidateCommit !== "string" || !/^[a-f0-9]{40}$/u.test(candidateCommit)) findings.push("review admission candidateCommit must be a full lowercase Git SHA");

  for (const entry of scan.records) {
    const { path, record } = entry;
    const retirement = abandoned.entriesByPath.get(path);
    if (retirement) {
      const retirementFinding = abandonedV3RecordFinding(entry, retirement);
      if (retirementFinding) findings.push(retirementFinding);
      else { administrativelyRetiredRecordCount += 1; continue; }
    }
    const reconciliation = reconciliations.entriesByPath.get(path);
    if (reconciliation) {
      if (record?.schema === DISPATCH_RECORD_SCHEMA) {
        findings.push(`${path}: a v4 record cannot be removed from review admission by the historical no-commit reconciliation index`);
        continue;
      }
      const reconciliationFinding = reconciledNoCommitFinding(record, reconciliation);
      if (reconciliationFinding) findings.push(`${path}: ${reconciliationFinding}`);
      continue;
    }
    if (legacySchema(record)) {
      if (record?.schema === LEGACY_DISPATCH_RECORD_SCHEMA) {
        try { validateLegacyDispatchRecord(record); } catch (error) { findings.push(`${path}: invalid legacy v2 record (${error.message})`); }
      }
      continue;
    }
    const isV4 = record?.schema === DISPATCH_RECORD_SCHEMA;
    const isV3 = record?.schema === PREVIOUS_DISPATCH_RECORD_SCHEMA;
    if (!isV3 && !isV4) {
      findings.push(`${path}: unsupported dispatch record schema ${JSON.stringify(record?.schema)}`);
      continue;
    }
    applicableRecordCount += 1;
    try { isV4 ? validateDispatchRecord(record) : validatePreviousDispatchRecord(record); }
    catch (error) { findings.push(`${path}: invalid ${isV4 ? "v4" : "v3"} dispatch record (${error.message})`); continue; }
    const disposition = criticDisposition(record);
    const addendum = addenda.entriesByPath.get(path);
    if (addendum && disposition !== "required") {
      findings.push(`${addendum.path}: critic addendum is only valid for a required dispatch record`);
      usedAddenda.add(path);
    }
    if (disposition === "required") {
      if (addendum) {
        usedAddenda.add(path);
        const addendumFinding = resolvedCriticAddendumFinding(root, entry, addendum, options);
        if (addendumFinding) findings.push(addendumFinding);
        else coveredRecordCount += 1;
      } else if (record.taskId === taskId && record.candidateCommit === candidateCommit && isV4
        && !["authored-commit", "orchestrator-attested"].includes(record.outcomeClassification.kind)) {
        targetRecordCandidateCommit = record.candidateCommit;
        findings.push(`${path}: a v4 ${record.outcomeClassification.kind} record does not deliver an authored commit and cannot admit a review at its candidate`);
      } else if (record.taskId === taskId && record.candidateCommit === candidateCommit) {
        targetRecordCandidateCommit = record.candidateCommit;
        admittedCount += 1;
        admittedRecordKind = admittedKindOf(record);
      } else if (record.taskId === taskId && terminalAuthoredDelivery(record)) {
        targetRecordCandidateCommit = record.candidateCommit;
        const ancestry = verifyCandidateDescendsFromRecord(root, record.candidateCommit, candidateCommit, options);
        if (ancestry.ok) { admittedCount += 1; admittedByDescendant = true; admittedRecordKind = admittedKindOf(record); }
        else if (ancestry.finding) findings.push(`${path}: ${ancestry.finding}`);
        else findings.push(`${path}: requested review candidate is not a descendant of the record's original candidateCommit`);
      } else if (record.taskId === taskId) {
        targetRecordCandidateCommit = record.candidateCommit;
        findings.push(`${path}: candidate mismatch is not an exact match or a delivered authored record ancestor`);
      } else {
        pendingRecordCount += 1;
        pendingRecordPaths.push(path);
        if (terminalAuthoredDelivery(record)) pendingDeliveredRecords.push(record);
      }
      continue;
    }
    if (disposition === "skipped") {
      try {
        const pathFinding = criticDecisionPathFinding(record.criticSkip, readChangedPaths(record));
        if (pathFinding) findings.push(`${path}: ${pathFinding.reason}`);
        else coveredRecordCount += 1;
      } catch (error) { findings.push(`${path}: actual changed paths could not be derived (${error.message})`); }
      continue;
    }
    if (disposition === "evidenced") {
      const evidenceFinding = verifyCriticEvidence(root, path, record.criticEvidence);
      if (evidenceFinding) findings.push(evidenceFinding);
      else coveredRecordCount += 1;
      continue;
    }
    findings.push(`${path}: requires exactly one Critic disposition`);
  }
  for (const [path, addendum] of addenda.entriesByPath) if (!usedAddenda.has(path)) findings.push(`${addendum.path}: orphan critic addendum has no applicable pending record`);
  if (signedImportAnchor !== null) admittedCount = 1;
  if (admittedCount !== 1) {
    const descendantTaskIds = admittedCount === 0 ? descendantTaskIdsOfDeliveredRecords(root, pendingDeliveredRecords, candidateCommit, options) : [];
    const missingRecordHint = admittedCount === 0
      ? `; ${DESCENDANT_ROUTE_HINT}${descendantTaskIds.length === 0 ? "" : ` This candidate descends from the delivered record of task id ${descendantTaskIds.join(", ")}: use that task id for this round.`} Otherwise the expected record is evidence/dispatch-record-${taskId}.json, which the host writes at the end of a foreground goldfish dispatch (host commit) and which cannot be authored by hand; a background dispatch leaves none of that kind, and its sanctioned route is the Git-verified orchestrator-attested record written by node plugins/pipeline-core/scripts/dispatch-record-write.mjs --repo-root . --attested-request <request.json>, admitted as weaker assurance than a host-observed record; a range with no dispatch history is reconstructed from the briefing, the hand-back and the Dispatch-trailered commits through that request (item pipeline.critic-admission-requires-a-dispatch-record-a-project-cannot-have)`
      : "";
    findings.push(`review admission requires exactly one matching target for ${taskId}@${candidateCommit}; found ${admittedCount}${missingRecordHint}`);
  }
  const ok = findings.length === 0 && admittedCount === 1;
  return { ok, finding: !ok, taskId, candidateCommit, admittedCount, applicableRecordCount, coveredRecordCount,
    pendingRecordCount, pendingRecordPaths, administrativelyRetiredRecordCount, targetRecordCandidateCommit,
    admittedByDescendant, admittedRecordKind: admittedCount === 1 ? admittedRecordKind : null,
    assurance: admittedCount === 1 && admittedRecordKind === "orchestrator-attested" ? "orchestrator-attested" : null,
    readFindings: findings };
}


function historicalAdmission(root, currentTarget) {
  if (typeof root !== "string" || typeof currentTarget.baseCommit !== "string") return null;
  const observed = readHistoricalFreshReviewAdmission({repository:root,currentTarget});
  return observed.status === "authorized" ? observed : null;
}
/** Diagnostic source capture only: not a public review-admission grant. */
export function observeHistoricalFreshReviewTargetAuthority({repository,inventoryHandle} = {}) {
  try {
    const facts=historicalFreshReviewCaptureFacts({repository,inventoryHandle});
    const historical=facts.entries.filter(entry=>entry.historical);
    let result;
    if(facts.target.kind === "signed-quality-import") {
      const intent=facts.target.taskId.replace(/^signed-import-/u, "");
      const commits=readGit(repository,["rev-list","--reverse",`${facts.target.baseCommit}..${facts.target.candidateCommit}`]).split("\n").filter(Boolean);
      const matches=commits.filter(commit=>{const trailer=parseIntegrationTrailerBlock(readGit(repository,["show","-s","--format=%B",commit]));return trailer.ok&&trailer.intentSha256===intent;});
      if(matches.length!==1) return {targetValid:false,code:"HFR-IMPORT-ANCHOR-UNAVAILABLE"};
      const anchor={schema:"pipeline.signed-quality-import-review-anchor.v1",intentSha256:intent,integrationCommit:matches[0],baseCommit:facts.target.baseCommit,candidateCommit:facts.target.candidateCommit,taskId:facts.target.taskId};
      // The private helper verifies real signed integration/range before the view.
      result=evaluateSignedQualityImportReviewAdmissionCore({root:repository,anchor},historical,{entries:historical});
    } else {
      const scan=walkDispatchRecordsForReview(repository,historical);
      const targets=scan.records.filter(entry=>entry.record?.taskId===facts.target.taskId);
      if(targets.length!==1 || !terminalAuthoredDelivery(targets[0].record))return {targetValid:false,code:"HFR-TARGET-NOT-AUTHORED-DELIVERY"};
      result=evaluateReviewAdmissionCore({root:repository,taskId:facts.target.taskId,candidateCommit:facts.target.candidateCommit},historical);
    }
    return {targetValid:result.ok===true,code:result.ok?"HFR-TARGET-OBSERVED":"HFR-TARGET-BLOCKED",findings:result.readFindings??result.findings??[]};
  } catch {return {targetValid:false,code:"HFR-TARGET-UNAVAILABLE"};}
}

function runCli() {
  const args = process.argv.slice(2);
  const rootIndex = args.indexOf("--root");
  if (args.length && (rootIndex !== 0 || args.length !== 2)) {
    process.stderr.write("usage: check-critic-skip-coverage.mjs [--root <repository>]\n");
    process.exitCode = 2; return;
  }
  const result = evaluateRepositoryCriticSkipCoverage({ root: rootIndex === 0 ? args[1] : DEFAULT_ROOT });
  for (const finding of result.readFindings) process.stderr.write(`CRITIC-SKIP-COVERAGE ${finding}\n`);
  process.stdout.write(`Critic-skip coverage: ${result.applicableRecordCount} applicable v3/v4, ${result.skipRecordCount} skipped, ${result.requiredRecordCount} required-pending, ${result.criticEvidenceRecordCount} evidenced, ${result.legacyRecordCount} legacy (schema ${CRITIC_SKIP_SCHEMA}) -- ${result.reason}\n`);
  if (!result.ok) process.exitCode = result.readFindings.some((finding) => /unreadable|invalid JSON/u.test(finding)) ? 2 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();

// Dedicated source-private METHOD binding; ordinary Critic/M2/M3 admission is unchanged.
export { createLocalControlledMethodDispatchEvidenceBinding, inspectLocalControlledMethodDispatchEvidenceBinding } from "../lib/controlled-method-dispatch-observation.mjs";
