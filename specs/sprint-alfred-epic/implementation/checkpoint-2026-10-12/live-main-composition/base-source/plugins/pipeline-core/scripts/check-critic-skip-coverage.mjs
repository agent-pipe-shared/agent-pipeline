#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Per-dispatch Critic disposition enforcement for dispatch-record v3. */
import { createHash } from "node:crypto";
import { sha256Canonical } from "../lib/review-economy.mjs";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { CRITIC_SKIP_SCHEMA, criticDecisionPathFinding, criticDisposition } from "../lib/critic-skip-decision.mjs";
import { criticDispositionAddendumPath, validateCriticDispositionAddendum } from "../lib/critic-disposition-addendum.mjs";
import { readBoundConsumedCriticReceipt } from "../lib/critic-verify-lifecycle.mjs";
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
  return record?.schema === DISPATCH_RECORD_SCHEMA
    && record?.outcomeClassification?.kind === "authored-commit" && delivered;
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
export function createLocalDispatchEvidenceBinding({ root, taskId, reviewCandidateCommit } = {}) {
  if (typeof root !== "string" || typeof taskId !== "string" || typeof reviewCandidateCommit !== "string"
    || !/^[a-f0-9]{40}$/u.test(reviewCandidateCommit)) throw new TypeError("local dispatch evidence input is invalid");
  const scan = walkDispatchRecords(root);
  if (scan.findings.length > 0) throw new Error("local dispatch evidence source is unreadable");
  const matches = scan.records.filter(({ record }) => record?.taskId === taskId);
  if (matches.length !== 1) throw new Error("local dispatch evidence requires one exact source record");
  const entry = matches[0];
  const record = entry.record;
  const v3 = record?.schema === PREVIOUS_DISPATCH_RECORD_SCHEMA;
  const v4 = record?.schema === DISPATCH_RECORD_SCHEMA;
  if (!v3 && !v4) throw new Error("local dispatch evidence source is not a required authored delivery");
  try { (v3 ? validatePreviousDispatchRecord : validateDispatchRecord)(record); }
  catch { throw new Error("local dispatch evidence source is not a required authored delivery"); }
  if (criticDisposition(record) !== "required"
    || !/^[a-f0-9]{40}$/u.test(record.candidateCommit ?? "")) {
    throw new Error("local dispatch evidence source is not a required authored delivery");
  }
  const admission = evaluateReviewAdmission({ root, taskId, candidateCommit: reviewCandidateCommit });
  if (!admission.ok || admission.targetRecordCandidateCommit !== record.candidateCommit) {
    throw new Error("local dispatch evidence candidate is not admitted for this task");
  }
  const binding = {
    schema: "pipeline.local-dispatch-evidence.v1",
    taskId,
    recordPath: entry.path,
    recordSha256: entry.sha256,
    sourceCandidateCommit: record.candidateCommit,
    reviewCandidateCommit,
  };
  return Object.freeze({ ...binding, snapshotId: sha256Canonical(binding) });
}

/** Admit a signed source import as its own review target without fabricating a dispatch row. */
export function evaluateSignedQualityImportReviewAdmission({ root, anchor } = {}) {
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
    const coverage = evaluateRepositoryCriticSkipCoverage({ root });
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
  const findings = [];
  const records = [];
  let entries;
  try { entries = readdirSync(resolve(root, EVIDENCE_DIR), { withFileTypes: true }); }
  catch (error) { return { records, findings: [`${EVIDENCE_DIR} is missing or unreadable: ${error.message}`], filesScanned: 0 }; }
  const names = entries.filter((entry) => entry.isFile() && DISPATCH_RECORD_PATTERN.test(entry.name)).map((entry) => entry.name).sort();
  for (const name of names) {
    const path = `${EVIDENCE_DIR}/${name}`;
    try {
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

function boundCriticReviewFinding(root, addendum, recordBytes, options = {}) {
  try {
    const readBound = options.readBoundCriticReceipt ?? ((input) => readBoundConsumedCriticReceipt(input));
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
    const bound = readBound({ gitCommonDir, criticPacketId: addendum.criticPacketId,
      candidate: { commit: addendum.reviewCandidateCommit, tree } });
    if (bound?.packet?.request?.taskId !== addendum.taskId
      || bound?.critic?.reviewPass !== true
      || bound?.critic?.candidate?.commit !== addendum.reviewCandidateCommit
      || bound.criticReceiptSha256 !== addendum.criticReceiptSha256) {
      return "Critic addendum does not match a passed, consumed, task-bound Critic receipt";
    }
    const localDispatchEvidence = bound.packet.coordinatorOnly?.localDispatchEvidence;
    if (localDispatchEvidence !== undefined) {
      try {
        exactObject(localDispatchEvidence, ["schema", "taskId", "recordPath", "recordSha256",
          "sourceCandidateCommit", "reviewCandidateCommit", "snapshotId"], "private local dispatch evidence");
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
        if (addendumFinding) { requiredRecordCount += 1; findings.push(addendumFinding); }
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
  const taskId = options.taskId;
  const candidateCommit = options.candidateCommit;
  const readChangedPaths = options.readChangedPaths ?? ((record) => readCommitChangedPaths(root, record.commits));
  const scan = walkDispatchRecords(root);
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
      } else if (record.taskId === taskId && record.candidateCommit === candidateCommit) {
        targetRecordCandidateCommit = record.candidateCommit;
        admittedCount += 1;
      } else if (record.taskId === taskId && terminalAuthoredDelivery(record)) {
        targetRecordCandidateCommit = record.candidateCommit;
        const ancestry = verifyCandidateDescendsFromRecord(root, record.candidateCommit, candidateCommit, options);
        if (ancestry.ok) { admittedCount += 1; admittedByDescendant = true; }
        else if (ancestry.finding) findings.push(`${path}: ${ancestry.finding}`);
        else findings.push(`${path}: requested review candidate is not a descendant of the record's original candidateCommit`);
      } else if (record.taskId === taskId) {
        targetRecordCandidateCommit = record.candidateCommit;
        findings.push(`${path}: candidate mismatch is not an exact match or a delivered authored record ancestor`);
      } else {
        pendingRecordCount += 1;
        pendingRecordPaths.push(path);
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
  if (admittedCount !== 1) findings.push(`review admission requires exactly one matching target for ${taskId}@${candidateCommit}; found ${admittedCount}`);
  const ok = findings.length === 0 && admittedCount === 1;
  return { ok, finding: !ok, taskId, candidateCommit, admittedCount, applicableRecordCount, coveredRecordCount,
    pendingRecordCount, pendingRecordPaths, administrativelyRetiredRecordCount, targetRecordCandidateCommit,
    admittedByDescendant, readFindings: findings };
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
