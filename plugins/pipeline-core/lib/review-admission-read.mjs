// SPDX-License-Identifier: SUL-1.0
/**
 * Read-only review admission (D216 option A, D219): the dispatch-record walk, the addendum and index readers and
 * evaluateReviewAdmission, split out of scripts/check-critic-skip-coverage.mjs so the read-only Critic dispatch preflight
 * reaches the admission through modules that carry no filesystem-write API. The old script imports and re-exports these
 * symbols under the same names.
 */
import { createHash } from "node:crypto";
import { sha256Canonical } from "./review-economy.mjs";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, relative, resolve, isAbsolute, join, parse, posix, sep, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { criticDecisionPathFinding, criticDisposition } from "./critic-skip-decision.mjs";
import { criticDispositionAddendumPath, validateCriticDispositionAddendum } from "./critic-disposition-addendum.mjs";
import { loadResidualAcceptanceDepsForPacket } from "./critic-verify-readiness-read.mjs";
import { residualReasonClassRefusal } from "./critical-action-authorization-read.mjs";
import { resolveRetainedCriticCourseRecords } from "./critic-course-admission.mjs";
import { DISPATCH_RECORD_SCHEMA, PREVIOUS_DISPATCH_RECORD_SCHEMA, LEGACY_DISPATCH_RECORD_SCHEMA, isNoDeliveryOutcome, isTerminalOutcome, normalizeDispatchRecordPath, validateDispatchRecord, validatePreviousDispatchRecord, validateLegacyDispatchRecord, isSafeTaskId } from "./dispatch-record.mjs";
import { parseStrictJson } from "./governance-event.mjs";
import { parseIntegrationTrailerBlock } from "./commit-message-policy.mjs";
import { canonical, verifyPoApprovalProof, createPoApprovalIntent } from "./po-approval-proof.mjs";
import { readCriticalHumanProofPolicy, readHumanApprovalMode, verifyAgainstTrustAnchors } from "./critical-human-proof-policy-read.mjs";
import { derivePoGateRepositoryFingerprint, validatePoGateAuthorityForRepository } from "./po-gate-authority-read.mjs";
import { resolveAuthorityArtifactPath } from "./project-authority-read.mjs";
import { resolvePoKeyDirectory } from "./po-human-approval-read.mjs";
import { assessWindowsPrivatePath } from "./windows-private-state.mjs";
import { canonicalJson, sha256, packetDigestMatches, readConsumedCandidateResult, readConsumedCandidateReceipt } from "./critic-packet-preflight-read.mjs";
import { validateSessionCriticReceipt } from "./session-critic-finalizer-read.mjs";
import { AGY_HOST_OBSERVED_TRAILER, agyAuthoredRecordBytes } from "./agy-host-observed-receipt.mjs";

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
export const SHA256 = /^[a-f0-9]{64}$/u;
export const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
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
export const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function readGit(root, args, options = {}) {
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

export function abandonedV3RecordFinding(entry, retirement) {
  if (!retirement) return null;
  if (entry.path !== retirement.recordPath || entry.sha256 !== retirement.recordSha256
    || entry.record?.schema !== PREVIOUS_DISPATCH_RECORD_SCHEMA
    || entry.record?.outcome !== "in-progress" || entry.record?.candidateCommit !== retirement.candidateCommit
    || !Array.isArray(entry.record?.commits) || entry.record.commits.length !== 0
    || entry.record?.taskId !== retirement.taskId) return `${entry.path}: recovery index no longer matches this exact in-progress v3 record`;
  return null;
}

export function terminalAuthoredDelivery(record) {
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

export function reconciledNoCommitFinding(record, entry) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return "reconciled historical record must be an object";
  if (!Array.isArray(record.commits) || record.commits.length !== 0) return "reconciled historical record must declare exactly zero commits";
  if (!isTerminalOutcome(record.outcome)) return "reconciled historical record must declare a terminal outcome";
  if (entry.terminalKind === "read-only" && !["completed", "completed-analysis-only", "analysis-complete", "partial-analysis-only"].includes(record.outcome) && !/(?:read-only|analysis-only)/u.test(record.outcome)) return "read-only reconciliation requires a completed, read-only, or analysis-only historical outcome";
  return null;
}

export function walkDispatchRecordsForReview(root, historicalEntries) {
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

export function readCriticDispositionAddenda(root) {
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
 * The base of a ROOT-candidate review (a greenfield consumer's round 1, the preflight's `base.commit` null) is the EMPTY TREE, not a
 * commit: no commit lies at or before it, and `merge-base --is-ancestor` refuses a tree object. The whole-chain walk found the close
 * ending in CLOSE-CRITIC-EVIDENCE-MISSING for such a course.
 */
const EMPTY_TREE_OID = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
function gitIsAtOrBeforeBase(gitRead, commit, base) {
  return base === EMPTY_TREE_OID ? false : gitIsAncestor(gitRead, commit, base);
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
    if (!connected || !(base === EMPTY_TREE_OID || gitIsAncestor(gitRead, base, head))) return `the registered rounds do not form one connected chain (round ${round + 1} breaks it)`;
  }
  if (!gitIsAncestor(gitRead, addendum.candidateCommit, last.candidate.commit)) return "the commit is not an ancestor of the last candidate of the registered course";
  if (gitIsAtOrBeforeBase(gitRead, addendum.candidateCommit, genesisBase)) return "the commit is not after the course genesis base";
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
  if (gitIsAtOrBeforeBase(gitRead, addendum.candidateCommit, range.base)) return `${prefix} (the commit is not after the reviewed range base)`;
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

export function resolvedCriticAddendumFinding(root, entry, addendumEntry, options) {
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

export function legacySchema(record) {
  return record?.schema === undefined || record?.schema === "pipeline.dispatch-record.v1" || record?.schema === "pipeline.dispatch-evidence.v1" || record?.schema === LEGACY_DISPATCH_RECORD_SCHEMA;
}

export function verifyCriticEvidence(root, sourcePath, reference) {
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
export function evaluateReviewAdmissionCore(options = {}, historicalEntries = [], signedImportAnchor = null) {
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
      ? `; ${DESCENDANT_ROUTE_HINT}${descendantTaskIds.length === 0 ? "" : ` This candidate descends from the delivered record of task id ${descendantTaskIds.join(", ")}: use that task id for this round.`} Otherwise the expected record is evidence/dispatch-record-${taskId}.json, which the host writes at the end of a foreground goldfish dispatch (host commit) and which cannot be authored by hand; a background dispatch leaves none of that kind, and its sanctioned route is the Git-verified orchestrator-attested record written by node plugins/pipeline-core/scripts/dispatch-record-write.mjs --repo-root . --attested-request <request.json>, admitted as weaker assurance than a host-observed record (for a runner other than claude the record also labels its model declared-unobserved: the briefing's declaration, never an observation, and the briefing must be the file dispatch-briefing.mjs wrote, whose allowedPaths are exact files); a range with no dispatch history is reconstructed from the briefing, the hand-back and the Dispatch-trailered commits through that request (item pipeline.critic-admission-requires-a-dispatch-record-a-project-cannot-have)`
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


export function historicalAdmission(root, currentTarget) {
  if (typeof root !== "string" || typeof currentTarget.baseCommit !== "string") return null;
  const observed = readHistoricalFreshReviewAdmission({repository:root,currentTarget});
  return observed.status === "authorized" ? observed : null;
}

export const SIGNED_QUALITY_PACKAGE_SCHEMA = "pipeline.signed-quality-package.v1";
export const QUALITY_PACKAGE_COMMIT_AUTHORIZATION_SCHEMA = "pipeline.signed-quality-package-commit-authorization.v1";
export const QUALITY_PACKAGE_POLICY_PATH = "project/critical-human-proof.json";

/** Pure lexical contract only; physicalQualityPackageFile still performs all filesystem admission. */
export function isCanonicalPhysicalQualityPackagePath(path, pathFlavor = process.platform === "win32" ? "win32" : "posix") {
  const pathApi = pathFlavor === "win32" ? win32 : pathFlavor === "posix" ? posix : null;
  if (!pathApi || typeof path !== "string" || !pathApi.isAbsolute(path) || pathApi.resolve(path) !== path || /[\u0000-\u001f]/u.test(path)) return false;
  if (pathFlavor === "posix" && path.includes("\\")) return false;
  if (pathFlavor === "win32" && path.includes("/")) return false;
  return true;
}

/** Closed filesystem grammar shared by the command classifier and CLI. */
export function physicalQualityPackageFile(path, root, maxBytes) {
  try {
    if (!isCanonicalPhysicalQualityPackagePath(path) || !isAbsolute(path) || resolve(path) !== path) return false;
    const rel = relative(root, path);
    if (!rel || rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel)) return false;
    let cursor = parse(path).root;
    const parts = relative(cursor, path).split(sep);
    for (let i = 0; i < parts.length; i++) {
      cursor = join(cursor, parts[i]);
      const st = lstatSync(cursor);
      if (st.isSymbolicLink() || (i < parts.length - 1 && !st.isDirectory())) return false;
      if (i === parts.length - 1 && (!st.isFile() || st.nlink !== 1 || st.size === 0 || st.size > maxBytes)) return false;
    }
    return realpathSync(path) === path;
  } catch { return false; }
}

const SQP_SHA256 = /^[a-f0-9]{64}$/u;
const SQP_OID = /^[a-f0-9]{40,64}$/u;
export const sqpOwn = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const sqpDigest = (value) => createHash("sha256").update(value, "utf8").digest("hex");
export const sqpFail = (code) => ({ ok: false, code });

/**
 * Operator hotfix 11: compare physical identities, not spellings. Git for Windows reports `D:/Dev/repo`
 * while Node's resolve() spells the same directory `D:\Dev\repo` (drive/folder case may differ too), so a
 * string comparison of a Git-reported path with a Node-resolved path can never succeed on win32. Both sides
 * go through realpath; case is folded on win32 only (NTFS is case-insensitive, while a case-sensitive POSIX
 * filesystem must keep distinguishing /a/B from /a/b). Fails closed on any error or non-absolute input.
 */
export function gitReportedPathIsSamePhysicalPath(gitReportedPath, nodePath) {
  try {
    if (typeof gitReportedPath !== "string" || gitReportedPath === "" || !isAbsolute(gitReportedPath)) return false;
    const identity = (path) => (process.platform === "win32" ? realpathSync(resolve(path)).toLocaleLowerCase("en-US") : realpathSync(resolve(path)));
    return identity(gitReportedPath) === identity(nodePath);
  } catch { return false; }
}

/**
 * Operator hotfix 11 (part 2): the POSIX mode-bit privacy term of the receipt checks applies only where the platform has mode
 * bits (Spec 21.4 platform parity, register K3-10). Node reports every regular file on native Windows as mode 0o666 whatever
 * mode was requested at creation, so `mode & 0o077` can never be 0 there and every receipt this module wrote itself would be
 * refused. Only this one term is skipped on win32; every other receipt check stays exactly as it was (regular file, no symlink,
 * nlink 1, size bounds, name and schema, the proof verified against the committed trust policy, the staged-index binding).
 * Windows privacy of the receipt directory relies on the user-profile and `.git` ACLs (documented in the hotfix README), and the
 * receipt's authority never rested on file privacy: it is re-verified by signature and index equality on every read.
 * `platform` is injectable for tests only; every production call site uses the default.
 */
export function receiptModeBitsRefused(mode, platform = process.platform) {
  if (platform === "win32") return false;
  return !Number.isInteger(mode) || (mode & 0o077) !== 0;
}

export function runGit(root, args, input = undefined) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`QUALITY-PACKAGE-GIT-${args[0]}`);
  return result.stdout;
}

function safeRepositoryPath(value) {
  if (typeof value !== "string" || value.length === 0 || /[\u0000-\u001f\\]/u.test(value) || value.startsWith("/") || /^[A-Za-z]:/u.test(value)) return false;
  const parts = value.split("/");
  return parts.every((part) => part !== "" && part !== "." && part !== "..") && parts[0] !== ".git";
}

function packagePayload(record) {
  return { schema: record.schema, baseCommit: record.baseCommit, unifiedDiff: record.unifiedDiff, expectedDigests: record.expectedDigests };
}

export function qualityPackageIntentSha256(record) { return sqpDigest(canonical(packagePayload(record))); }

function changedPathsFromPatch(unifiedDiff) {
  const paths = [];
  for (const line of unifiedDiff.split("\n")) {
    if (!line.startsWith("+++ ")) continue;
    const target = line.slice(4);
    if (!target.startsWith("b/") || target === "/dev/null") return null;
    const path = target.slice(2);
    if (!safeRepositoryPath(path) || paths.includes(path)) return null;
    paths.push(path);
  }
  return paths.length > 0 ? paths.sort() : null;
}

export function targetModeFromPatch(root, record, path) {
  const sections = record.unifiedDiff.split(/(?=^diff --git )/mu);
  const section = sections.find((part) => part.split("\n").some((line) => line === `+++ b/${path}`));
  if (!section) return null;
  const newMode = /^(?:new file mode|new mode) (100644|100755)$/mu.exec(section)?.[1];
  if (newMode) return newMode;
  const prior = runGit(root, ["ls-tree", record.baseCommit, "--", path]).trim();
  const priorMatch = /^(100644|100755) blob [a-f0-9]{40,64}\t/u.exec(prior);
  return priorMatch?.[1] ?? null;
}

export function validatePackage(record) {
  if (!sqpOwn(record, ["schema", "baseCommit", "unifiedDiff", "expectedDigests", "intentSha256"]) || record.schema !== SIGNED_QUALITY_PACKAGE_SCHEMA || !SQP_OID.test(record.baseCommit) || typeof record.unifiedDiff !== "string" || !SQP_SHA256.test(record.intentSha256)) return null;
  if (record.expectedDigests === null || typeof record.expectedDigests !== "object" || Array.isArray(record.expectedDigests)) return null;
  const paths = Object.keys(record.expectedDigests).sort();
  if (paths.length === 0 || paths.some((path) => !safeRepositoryPath(path) || !SQP_SHA256.test(record.expectedDigests[path]))) return null;
  const patchPaths = changedPathsFromPatch(record.unifiedDiff);
  if (!patchPaths || patchPaths.length !== paths.length || patchPaths.some((path, index) => path !== paths[index])) return null;
  return record.intentSha256 === qualityPackageIntentSha256(record) ? paths : null;
}

export function committedTrustPolicy(root, proof) {
  // Presence, regular blob mode, index and worktree equality are independently
  // established. Authority is selected from HEAD bytes, never a caller's path.
  try {
    if (realpathSync(root) !== root || !gitReportedPathIsSamePhysicalPath(runGit(root, ["rev-parse", "--show-toplevel"]).trim(), root)) return null;
    const path = join(root, QUALITY_PACKAGE_POLICY_PATH);
    if (!physicalQualityPackageFile(path, root, 32768)) return null;
    const entry = runGit(root, ["ls-tree", "HEAD", "--", QUALITY_PACKAGE_POLICY_PATH]).trim();
    const match = /^(100644|100755) blob ([a-f0-9]{40,64})\tproject\/critical-human-proof\.json$/u.exec(entry);
    if (!match || runGit(root, ["ls-files", "-s", "--", QUALITY_PACKAGE_POLICY_PATH]).trim() !== match[1] + " " + match[2] + " 0\t" + QUALITY_PACKAGE_POLICY_PATH) return null;
    const blob = runGit(root, ["show", "HEAD:" + QUALITY_PACKAGE_POLICY_PATH]);
    if (!Buffer.from(blob).equals(readFileSync(path))) return null;
    // Reuse the full policy schema validator, then select exclusively from the
    // established committed blob rather than the reader's mutable return value.
    if (!readCriticalHumanProofPolicy(root).ok) return null;
    const policy = JSON.parse(blob);
    const anchors = policy.schema === "pipeline.critical-human-proof-policy.v3" ? policy.trustAnchors : [policy.trustAnchor];
    return Array.isArray(anchors) && typeof proof?.keyReference === "string"
      ? anchors.find(anchor => anchor?.keyReference === proof.keyReference) ?? null : null;
  } catch { return null; }
}

export function authorizationDirectory(root) {
  try { return join(runGit(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim(), "agent-pipeline", "signed-quality-packages", "commit-authorizations"); }
  catch { return null; }
}

export function directoryHasNoSymlinkAncestors(path) {
  try {
    const parsed = parse(resolve(path));
    let cursor = parsed.root;
    for (const part of relative(parsed.root, resolve(path)).split(sep).filter(Boolean)) {
      cursor = join(cursor, part);
      const stat = lstatSync(cursor);
      if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
    }
    return true;
  } catch { return false; }
}

export function readExactAuthorization(root, intentSha256) {
  if (typeof intentSha256 !== "string" || !SQP_SHA256.test(intentSha256)) return sqpFail("QUALITY-PACKAGE-INTEGRATION-AUTHORIZATION-INVALID");
  const directory = authorizationDirectory(root);
  if (!directory) return sqpFail("QUALITY-PACKAGE-INTEGRATION-AUTHORIZATION-INVALID");
  const commonDir = resolve(directory, "../../../");
  if (!directoryHasNoSymlinkAncestors(commonDir)) return sqpFail("QUALITY-PACKAGE-INTEGRATION-AUTHORIZATION-INVALID");
  let cursor = commonDir;
  for (const part of relative(commonDir, directory).split(sep).filter(Boolean)) {
    cursor = join(cursor, part);
    try {
      const ancestor = lstatSync(cursor);
      if (!ancestor.isDirectory() || ancestor.isSymbolicLink()) return sqpFail("QUALITY-PACKAGE-INTEGRATION-AUTHORIZATION-INVALID");
    } catch (error) {
      if (error?.code === "ENOENT") return sqpFail("QUALITY-PACKAGE-INTEGRATION-AUTHORIZATION-ABSENT");
      return sqpFail("QUALITY-PACKAGE-INTEGRATION-AUTHORIZATION-INVALID");
    }
  }
  const target = join(directory, `${intentSha256}.json`);
  let stat;
  try { stat = lstatSync(target); }
  catch (error) {
    return sqpFail(error?.code === "ENOENT" ? "QUALITY-PACKAGE-INTEGRATION-AUTHORIZATION-ABSENT" : "QUALITY-PACKAGE-INTEGRATION-AUTHORIZATION-INVALID");
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || receiptModeBitsRefused(stat.mode) || stat.size === 0 || stat.size > 16 * 1024 * 1024) return sqpFail("QUALITY-PACKAGE-INTEGRATION-AUTHORIZATION-INVALID");
  try {
    const receipt = JSON.parse(readFileSync(target, "utf8"));
    if (!sqpOwn(receipt, ["schema", "packageIntent", "proof"]) || receipt.schema !== QUALITY_PACKAGE_COMMIT_AUTHORIZATION_SCHEMA) return sqpFail("QUALITY-PACKAGE-INTEGRATION-AUTHORIZATION-INVALID");
    if (receipt.packageIntent.intentSha256 !== intentSha256) return sqpFail("QUALITY-PACKAGE-INTEGRATION-AUTHORIZATION-INVALID");
    const paths = validatePackage(receipt.packageIntent);
    if (!paths || paths.includes(QUALITY_PACKAGE_POLICY_PATH)) return sqpFail("QUALITY-PACKAGE-INTEGRATION-AUTHORIZATION-INVALID");
    const trustPolicy = committedTrustPolicy(root, receipt.proof);
    if (!trustPolicy || !verifyPoApprovalProof({ intent: { sha256: intentSha256 }, proof: receipt.proof, trustPolicy }).verified) return sqpFail("QUALITY-PACKAGE-INTEGRATION-AUTHORIZATION-INVALID");
    return { ok: true, packageIntent: receipt.packageIntent, paths };
  } catch { return sqpFail("QUALITY-PACKAGE-INTEGRATION-AUTHORIZATION-INVALID"); }
}

/** Binds a committed import to its unique parent, complete changed-path set, exact blobs and modes. */
export function verifyQualityPackageIntegrationPostCommit({ repoRoot, commitSha, intentSha256 } = {}) {
  const root = typeof repoRoot === "string" ? resolve(repoRoot) : null;
  if (!root || typeof commitSha !== "string" || !SQP_OID.test(commitSha)) return sqpFail("QUALITY-PACKAGE-INTEGRATION-COMMIT-INVALID");
  const selected = readExactAuthorization(root, intentSha256);
  if (!selected.ok) return selected;
  try {
    const parents = runGit(root, ["rev-list", "--parents", "-n", "1", commitSha]).trim().split(/\s+/u).slice(1);
    if (parents.length !== 1 || parents[0] !== selected.packageIntent.baseCommit) return sqpFail("QUALITY-PACKAGE-INTEGRATION-PARENT-MISMATCH");
    const changed = runGit(root, ["diff-tree", "--no-commit-id", "--name-only", "-r", "-z", commitSha]).split("\0").filter(Boolean).sort();
    if (changed.length !== selected.paths.length || changed.some((path, index) => path !== selected.paths[index])) return sqpFail("QUALITY-PACKAGE-INTEGRATION-PATH-MISMATCH");
    for (const path of selected.paths) {
      const treeEntry = runGit(root, ["ls-tree", commitSha, "--", path]).trim();
      const match = /^(100644|100755) blob ([a-f0-9]{40,64})\t/u.exec(treeEntry);
      if (!match || match[1] !== targetModeFromPatch(root, selected.packageIntent, path)) return sqpFail("QUALITY-PACKAGE-INTEGRATION-TREE-MISMATCH");
      const bytes = runGit(root, ["cat-file", "blob", match[2]]);
      if (sqpDigest(bytes) !== selected.packageIntent.expectedDigests[path]) return sqpFail("QUALITY-PACKAGE-INTEGRATION-TREE-MISMATCH");
    }
    return { ok: true, code: "QUALITY-PACKAGE-INTEGRATION-POSTCOMMIT-VERIFIED", intentSha256 };
  } catch { return sqpFail("QUALITY-PACKAGE-INTEGRATION-COMMIT-INVALID"); }
}

export const HISTORICAL_FRESH_REVIEW_REQUEST_SCHEMA='pipeline.historical-fresh-review-request.v1';
const INVENTORY_SCHEMA='pipeline.historical-fresh-review-inventory.v1';
export const SCOPE='fresh-review-admission-only';
const HFR_OID=/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const handles=new WeakMap();
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const hfrDigest=value=>sha(canonical(value));
export const serialized=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
export const own=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
export function fail(code){const error=new Error(code);error.code=code;throw error;}
export function unavailable(code){return {status:'unavailable',code,qualification:'unknown',scope:SCOPE};}
function git(root,args){return execFileSync('git',args,{cwd:root,encoding:'buffer',shell:false,timeout:5000,maxBuffer:4*1024*1024,env:Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/iu.test(key)))});}
function text(root,args){return git(root,args).toString('utf8').trim();}
function safePath(root,path){
  if(typeof path!=='string'||!path||isAbsolute(path)||path.includes('\\')||path.split('/').some(part=>!part||part==='.'||part==='..'))fail('HFR-PATH');
  let cursor=root;
  for(const part of path.split('/')){cursor=join(cursor,part);if(lstatSync(cursor).isSymbolicLink())fail('HFR-ALIAS');}
  const absolute=realpathSync(cursor),rel=relative(root,absolute);
  if(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))fail('HFR-PATH');
  return absolute;
}
function file(root,path,max=1048576){
  const absolute=safePath(root,path),before=lstatSync(absolute);
  if(!before.isFile()||before.nlink!==1||before.size>max)fail('HFR-PHYSICAL-FILE');
  const bytes=readFileSync(absolute),after=lstatSync(absolute);
  if(before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||after.nlink!==1)fail('HFR-FILE-DRIFT');
  return {bytes,fact:{path,sha256:sha(bytes),byteLength:bytes.length,mode:after.mode&0o777,device:after.dev,inode:after.ino}};
}
export function context(repository,currentTarget){
  const root=realpathSync(resolve(repository));
  if(!own(currentTarget,['kind','taskId','baseCommit','candidateCommit'])||!['admitted-dispatch','signed-quality-import'].includes(currentTarget.kind)
    ||typeof currentTarget.taskId!=='string'||!currentTarget.taskId||currentTarget.taskId.length>160||/[\u0000-\u001f\u007f]/u.test(currentTarget.taskId)||![currentTarget.baseCommit,currentTarget.candidateCommit].every(value=>HFR_OID.test(value)))fail('HFR-TARGET');
  const commit=text(root,['rev-parse','HEAD']),tree=text(root,['rev-parse','HEAD^{tree}']);
  if(commit!==currentTarget.candidateCommit||text(root,['cat-file','-t',commit])!=='commit')fail('HFR-CANDIDATE');
  const baseType=text(root,['cat-file','-t',currentTarget.baseCommit]);
  if(baseType==='commit')git(root,['merge-base','--is-ancestor',currentTarget.baseCommit,commit]);
  else if(baseType!=='tree'||text(root,['hash-object','-t','tree','--stdin'])!==currentTarget.baseCommit)fail('HFR-BASE');
  const common=realpathSync(resolve(root,text(root,['rev-parse','--git-common-dir'])));
  const repositoryFingerprint=derivePoGateRepositoryFingerprint({gitCommonDir:common,primaryRoot:root});
  return {root,common,repositoryFingerprint,target:{...currentTarget,candidateTree:tree},key:hfrDigest({repositoryFingerprint,currentTarget})};
}
function authoritySources(ctx){
  const authority=validatePoGateAuthorityForRepository({repoRoot:ctx.root});
  if(!authority.ok||typeof authority.value?.planPath!=='string')fail('HFR-PLAN-AUTHORITY-UNAVAILABLE');
  const statePath=resolveAuthorityArtifactPath('state',{rootDir:ctx.root}).relPath;
  if(typeof statePath!=='string')fail('HFR-STATE-UNAVAILABLE');
  const stateFile=file(ctx.root,statePath),state=JSON.parse(stateFile.bytes);
  const featureId=state.activeFeature?.id;
  if(typeof featureId!=='string'||state.activeFeature.planPath!==authority.value.planPath)fail('HFR-FEATURE');
  const plan=file(ctx.root,authority.value.planPath),spec=file(ctx.root,authority.value.specPath);
  const bound=validatePoGateAuthorityForRepository({repoRoot:ctx.root,expectedPlanSha256:plan.fact.sha256,expectedSpecSha256:spec.fact.sha256});
  if(!bound.ok||bound.value?.repositoryFingerprint!==ctx.repositoryFingerprint)fail('HFR-PLAN-AUTHORITY-UNAVAILABLE');
  const mode=readHumanApprovalMode(ctx.root);
  if(!['signature','chat'].includes(mode.mode)||!['default','pipeline.user.yaml'].includes(mode.source))fail('HFR-MODE-UNAVAILABLE');
  const sourceComposition=['./historical-fresh-review-admission.mjs','./po-approval-proof.mjs','./chat-gate-ceremony.mjs','./critical-human-proof-policy.mjs','./po-gate-authority.mjs','../scripts/check-critic-skip-coverage.mjs','../scripts/critic-packet-preflight.mjs','../scripts/po-human-approval.mjs','./review-admission-read.mjs','./po-human-approval-read.mjs','./critical-human-proof-policy-read.mjs','./po-gate-authority-read.mjs'].map(path=>({path,sha256:sha(readFileSync(fileURLToPath(new URL(path,import.meta.url))))}));
  return {featureId,plan:plan.fact,spec:spec.fact,state:stateFile.fact,authority:bound.value,mode,sourceCompositionSha256:hfrDigest(sourceComposition),policyRevision:'m4-'+hfrDigest({authority:bound.value,mode}).slice(0,24)};
}
export function observe(ctx){
  const dir=safePath(ctx.root,'evidence');
  const catalogue=readdirSync(dir,{withFileTypes:true}).filter(entry=>/^dispatch-record-.+\.json$/u.test(entry.name)).map(entry=>entry.name).sort();
  if(catalogue.length>512)fail('HFR-INVENTORY-BOUND');
  let totalBytes=0;
  const entries=catalogue.map(name=>{
    const path='evidence/'+name,{bytes,fact}=file(ctx.root,path);
    totalBytes+=bytes.length;if(totalBytes>8*1024*1024)fail('HFR-INVENTORY-BYTE-BOUND');
    let record=null,defectCodes=[];
    try{record=JSON.parse(bytes);}catch{defectCodes=['record-json-shape'];}
    if(record?.schema===DISPATCH_RECORD_SCHEMA){try{validateDispatchRecord(record);}catch{defectCodes=['record-v4-shape'];}}
    else if(record?.schema===PREVIOUS_DISPATCH_RECORD_SCHEMA){try{validatePreviousDispatchRecord(record);}catch{defectCodes=['record-v3-shape'];}}
    else if(record?.schema===LEGACY_DISPATCH_RECORD_SCHEMA){try{validateLegacyDispatchRecord(record);}catch{defectCodes=['record-v2-shape'];}}
    else if(record!==null&&!['pipeline.dispatch-record.v1','pipeline.dispatch-evidence.v1',undefined].includes(record?.schema))defectCodes=['record-schema-unsupported'];
    let historical=false,anchorBlob=null;
    if(defectCodes.length&&record?.taskId!==ctx.target.taskId){
      try{
        const row=text(ctx.root,['ls-tree',ctx.target.baseCommit,'--',path]);
        const match=/^(100644|100755) blob ([a-f0-9]{40,64})\t/u.exec(row);
        if(match&&match[1]===((fact.mode&0o111)?'100755':'100644')&&git(ctx.root,['cat-file','blob',match[2]]).equals(bytes)){historical=true;anchorBlob=match[2];}
      }catch{ /* Membership remains unproven and therefore unlisted/blocking. */ }
    }
    return {...fact,taskId:typeof record?.taskId==='string'&&record.taskId.length<=160?record.taskId:null,recordSchema:typeof record?.schema==='string'&&record.schema.length<=160?record.schema:null,defectCodes,historical,anchorBlob,qualification:'unknown'};
  });
  return {schema:INVENTORY_SCHEMA,repositoryFingerprint:ctx.repositoryFingerprint,target:ctx.target,scope:SCOPE,qualification:'unknown',entries,sources:authoritySources(ctx)};
}
export function makeHandle(ctx,snapshot,dir){const handle=Object.freeze({});handles.set(handle,{ctx,snapshot,dir,inventorySha256:sha(serialized(snapshot))});return handle;}
export function readSnapshot(dir){const raw=file(dir,'inventory.json').bytes,snapshot=JSON.parse(raw);if(!raw.equals(serialized(snapshot)))fail('HFR-INVENTORY-BYTE-DRIFT');return snapshot;}
export function live(handle,repository){
  const retained=handles.get(handle);
  if(!retained||retained.ctx.root!==realpathSync(resolve(repository)))fail('HFR-HANDLE');
  const {kind,taskId,baseCommit,candidateCommit}=retained.ctx.target;
  const ctx=context(repository,{kind,taskId,baseCommit,candidateCommit});
  if(canonical(observe(ctx))!==canonical(retained.snapshot))fail('HFR-INVENTORY-DRIFT');
  return retained;
}
/** Internal source observer seam: cloned/serialized caller objects are rejected. */
export function historicalFreshReviewCaptureFacts({repository,inventoryHandle}={}){
  const {snapshot}=live(inventoryHandle,repository);
  return {target:structuredClone(snapshot.target),entries:structuredClone(snapshot.entries)};
}
export function requestFor(retained){
  const {snapshot,inventorySha256}=retained,subject={scope:SCOPE,qualification:'unknown',repositoryFingerprint:snapshot.repositoryFingerprint,inventorySha256,target:snapshot.target};
  const approvalIntent=createPoApprovalIntent({kind:'historical-fresh-review',featureId:snapshot.sources.featureId,planSha256:snapshot.sources.plan.sha256,specSha256:snapshot.sources.spec.sha256,candidate:{commit:snapshot.target.candidateCommit,tree:snapshot.target.candidateTree},policyRevision:snapshot.sources.policyRevision,subjectSha256:hfrDigest(subject),decision:'approve-fresh-review'});
  return {schema:HISTORICAL_FRESH_REVIEW_REQUEST_SCHEMA,subject,approvalIntent,intentSha256:approvalIntent.sha256,historicalDebtCount:snapshot.entries.filter(entry=>entry.historical).length};
}
export function readHistoricalFreshReviewApproval({repository,inventoryHandle}={}){
  try{
    const retained=live(inventoryHandle,repository);if(!retained.dir)fail('HFR-SNAPSHOT-UNPUBLISHED');
    const request=requestFor(retained);
    const recorded=JSON.parse(file(retained.dir,'request.json').bytes);
    if(canonical(recorded)!==canonical(request))fail('HFR-REQUEST-DRIFT');
    let authoritySha256,basis;
    if(retained.snapshot.sources.mode.mode==='chat'){
      const raw=file(retained.dir,'chat-approval.json').bytes,receipt=JSON.parse(raw);
      if(!own(receipt,['schema','intentSha256','subjectSha256','basis'])||receipt.schema!=='pipeline.historical-fresh-review-chat-receipt.v1'||receipt.intentSha256!==request.intentSha256||receipt.subjectSha256!==request.approvalIntent.value.subjectSha256||receipt.basis!=='chat-attributed-unattested')fail('HFR-CHAT-DRIFT');
      authoritySha256=sha(raw);basis=receipt.basis;
    }else{
      const selected=resolvePoKeyDirectory({repoRoot:retained.ctx.root});
      if(selected.status!=='resolved')fail('HFR-EXTERNAL-AUTHORITY-UNAVAILABLE');
      const external=realpathSync(resolve(selected.directory)),rel=relative(retained.ctx.root,external);
      if(rel===''||(!rel.startsWith('..'+sep)&&rel!=='..'&&!isAbsolute(rel)))fail('HFR-EXTERNAL-AUTHORITY-UNAVAILABLE');
      const trustPolicy=JSON.parse(file(external,'trust-policy.json').bytes);
      const proof=JSON.parse(file(external,`proof-${request.intentSha256}.json`).bytes);
      const verified=verifyPoApprovalProof({intent:request.approvalIntent,trustPolicy,proof});
      if(!verified.verified)fail(verified.code);
      authoritySha256=hfrDigest({trustPolicy,proof});basis='signature';
    }
    live(inventoryHandle,repository);
    return {status:'authorized',inventoryHandle,inventorySha256:retained.inventorySha256,authoritySha256,basis,scope:SCOPE,qualification:'unknown',target:structuredClone(retained.snapshot.target),repositoryFingerprint:retained.ctx.repositoryFingerprint};
  }catch(error){return unavailable(error.code??'HFR-APPROVAL-UNAVAILABLE');}
}
/** Noncreating production lookup; source observations are always recomputed. */
export function readHistoricalFreshReviewAdmission({repository,currentTarget}={}){
  try{
    const ctx=context(repository,currentTarget),dir=readLocation(ctx),snapshot=readSnapshot(dir);
    if(canonical(snapshot)!==canonical(observe(ctx)))fail('HFR-INVENTORY-DRIFT');
    const handle=makeHandle(ctx,snapshot,dir),approval=readHistoricalFreshReviewApproval({repository,inventoryHandle:handle});
    if(approval.status!=='authorized')return approval;
    return {...approval,entries:structuredClone(snapshot.entries.filter(entry=>entry.historical)),sourceRepository:ctx.root};
  }catch(error){return unavailable(error.code??'HFR-ADMISSION-UNAVAILABLE');}
}
export function historicalFreshReviewPacketBinding({repository,currentTarget}={}){
  const approval=readHistoricalFreshReviewAdmission({repository,currentTarget});
  if(approval.status!=='authorized')return null;
  return {schema:'pipeline.historical-fresh-review-packet-binding.v1',sourceRepository:approval.sourceRepository,repositoryFingerprint:approval.repositoryFingerprint,inventorySha256:approval.inventorySha256,authoritySha256:approval.authoritySha256,basis:approval.basis,scope:SCOPE,qualification:'unknown',target:approval.target};
}
function readPrivateDirectory(path){
  const info=lstatSync(path);
  if(!info.isDirectory()||info.isSymbolicLink()||realpathSync(path)!==path)fail('HFR-CONTROL');
  if(process.platform==='win32'){
    if(assessWindowsPrivatePath(path).status!=='secure')fail('HFR-WINDOWS-UNAVAILABLE');
  }else if((info.mode&0o077)!==0)fail('HFR-CONTROL');
  return path;
}
/** Noncreating location of the retained inventory directory: the same checks as the creating variant, without its creation branch. */
function readLocation(ctx){
  const pipeline=join(ctx.common,'agent-pipeline');readPrivateDirectory(pipeline);
  const store=join(pipeline,'historical-fresh-review');readPrivateDirectory(store);
  const dir=join(store,ctx.key);readPrivateDirectory(dir);
  return dir;
}

export function revalidateHistoricalFreshReviewPacketBinding(binding){
  try{
    if(!own(binding,['schema','sourceRepository','repositoryFingerprint','inventorySha256','authoritySha256','basis','scope','qualification','target'])||binding.schema!=='pipeline.historical-fresh-review-packet-binding.v1'||binding.scope!==SCOPE||binding.qualification!=='unknown')return false;
    const {kind,taskId,baseCommit,candidateCommit}=binding.target;
    return canonical(historicalFreshReviewPacketBinding({repository:binding.sourceRepository,currentTarget:{kind,taskId,baseCommit,candidateCommit}}))===canonical(binding);
  }catch{return false;}
}

export const RESIDUAL_ACCEPTANCE_BASIS = "po-acceptance-of-residual-minor-findings";
// D227 (N45): the basis of a receipt whose accepted findings include a MAJOR one; the fragment then also carries `reasonClass`.
export const RESIDUAL_ACCEPTANCE_CLASS_BASIS = "po-acceptance-of-residual-findings-with-reason-class";
export const CVL_OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
export const PACKET = /^[a-f0-9]{32}$/u;
export function cvlFail(code, message) { const error = new Error(message); error.code = code; throw error; }
export function exact(value, keys) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)); }
export function candidate(value) { return exact(value, ["commit", "tree"]) && CVL_OID.test(value.commit ?? "") && CVL_OID.test(value.tree ?? ""); }
export function bytesSha256(value) { return createHash("sha256").update(value).digest("hex"); }

/** Derived id of one open Critic finding (verdict findings carry no id of their own). */
export function residualFindingId(finding) {
  return sha256(canonicalJson(finding));
}

// A failed receipt qualifies only through a PO acceptance bound to the exact open findings, all minor.
// Returns the record fragment, or null (the caller keeps CVL-CRITIC-FAILED) on any shortfall.
function residualAcceptanceFor({ common, criticPacketId, critic, criticReceiptSha256 }, deps) {
  const acceptance = deps.residualAcceptance;
  if (acceptance === undefined || acceptance === null || typeof deps.verifyResidualAcceptanceFn !== "function") return null;
  try {
    const readOpen = deps.readOpenFindingsFn ?? (({ controlRoot, packetId }) => readConsumedCandidateResult({ controlRoot, packetId }).result.verdict.findings);
    const open = readOpen({ controlRoot: join(common, "agent-pipeline", "critic-packets"), packetId: criticPacketId });
    if (!Array.isArray(open) || open.length === 0 || open.length !== critic.findingCount
      || !open.every(finding => finding !== null && typeof finding === "object" && (finding.severity === "minor" || finding.severity === "major"))) return null;
    // D227: a major is accepted only when the acceptance names the reason class; a minor-only list carries none; a blocker never qualifies.
    if (residualReasonClassRefusal(open, acceptance.reasonClass) !== null) return null;
    const withMajor = open.some(finding => finding.severity === "major");
    const expected = open.map(finding => ({ id: residualFindingId(finding), severity: finding.severity }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (acceptance.candidate?.commit !== critic.candidate.commit || acceptance.candidate?.tree !== critic.candidate.tree
      || acceptance.criticReceiptSha256 !== criticReceiptSha256
      || canonicalJson(acceptance.findings) !== canonicalJson(expected)) return null;
    const verdict = deps.verifyResidualAcceptanceFn({ acceptance, candidate: { ...critic.candidate }, criticReceiptSha256, findings: expected,
      ...(acceptance.reasonClass === undefined ? {} : { reasonClass: acceptance.reasonClass }) });
    if (verdict?.authorized !== true || typeof verdict.mode !== "string" || verdict.mode.length === 0) return null;
    // A minor-only fragment keeps its exact four keys (it is part of recorded v3 lifecycle receipts); only an accepted major adds the class.
    return Object.freeze(withMajor
      ? { basis: RESIDUAL_ACCEPTANCE_CLASS_BASIS, mode: verdict.mode, acceptanceSha256: bytesSha256(canonicalJson(acceptance)), findings: expected, reasonClass: acceptance.reasonClass }
      : { basis: RESIDUAL_ACCEPTANCE_BASIS, mode: verdict.mode, acceptanceSha256: bytesSha256(canonicalJson(acceptance)), findings: expected });
  } catch { return null; }
}

/**
 * Read a consumed Critic receipt from its private packet and prove that the
 * receipt is the receipt for that packet's exact candidate and diff.  A
 * syntactically valid receipt on its own is deliberately insufficient: the
 * packet journal is the authority that makes it a completed, fresh review.
 */
export function readBoundConsumedCriticReceipt({ gitCommonDir, criticPacketId, candidate: sourceCandidate }, deps = {}) {
  if (typeof gitCommonDir !== "string" || gitCommonDir.length === 0 || !PACKET.test(criticPacketId ?? "") || !candidate(sourceCandidate)) {
    cvlFail("CVL-INPUT", "Critic/Verify lifecycle input is invalid.");
  }
  const common = resolve(gitCommonDir);
  const readReceipt = deps.readConsumedCandidateReceiptFn ?? readConsumedCandidateReceipt;
  let consumed;
  try { consumed = readReceipt({ controlRoot: join(common, "agent-pipeline", "critic-packets"), packetId: criticPacketId }); }
  catch (error) { cvlFail("CVL-CRITIC-UNAVAILABLE", `No consumed private Critic receipt is available for this packet (${error?.code ?? "unavailable"}).`); }
  const critic = consumed?.receipt;
  const packet = consumed?.packet;
  try { validateSessionCriticReceipt(critic); }
  catch { cvlFail("CVL-CRITIC-INVALID", "Private Critic receipt is malformed."); }
  if (!packet || packet.packetId !== criticPacketId || critic.packetId !== criticPacketId
    || !packetDigestMatches(packet, critic.packetDigest)
    || packet.candidate?.base !== critic.candidate.base || packet.candidate?.commit !== critic.candidate.commit
    || packet.candidate?.tree !== critic.candidate.tree || packet.diff?.base !== critic.reviewRange.base
    || packet.diff?.commit !== critic.reviewRange.commit || packet.diff?.sha256 !== critic.reviewRange.diffSha256) {
    cvlFail("CVL-CRITIC-PACKET-MISMATCH", "Private Critic receipt is not bound to its consumed packet.");
  }
  const failedReceipt = critic.reviewPass !== true;
  if (failedReceipt && (deps.residualAcceptance === undefined || deps.residualAcceptance === null)) {
    cvlFail("CVL-CRITIC-FAILED", "Critic findings remain unresolved; Verify cannot attest this candidate.");
  }
  if (critic.candidate.commit !== sourceCandidate.commit || critic.candidate.tree !== sourceCandidate.tree
    || critic.reviewRange.commit !== sourceCandidate.commit) cvlFail("CVL-CRITIC-STALE", "Private Critic receipt is not bound to the Verify candidate.");
  const criticReceiptSha256 = bytesSha256(canonicalJson(critic));
  let residual = null;
  if (failedReceipt) {
    residual = residualAcceptanceFor({ common, criticPacketId, critic, criticReceiptSha256 }, deps);
    if (residual === null) {
      // N36: with an acceptance on record the usual cause is that it no longer verifies (the signature window is short), not that none exists.
      if (deps.residualAcceptance !== undefined && deps.residualAcceptance !== null) {
        cvlFail("CVL-CRITIC-FAILED", `Critic findings remain unresolved and the recorded PO residual acceptance no longer verifies (most often it has expired, the signature window is short, or it does not match the open findings); capture it again with pipeline-state.mjs approve-residual-acceptance --by <name> --critic-packet ${criticPacketId} and approve it again, then retry`);
      }
      cvlFail("CVL-CRITIC-FAILED", "Critic findings remain unresolved; Verify cannot attest this candidate.");
    }
  }
  const roleRoute = criticRouteVerdict({ gitCommonDir: common, criticPacketId, critic, criticReceiptSha256 }, deps);
  return Object.freeze({ packet, critic, criticReceiptSha256, roleRoute, residual });
}

const CRITIC_HOST_OBSERVATION_SCHEMA = "pipeline.critic-host-observation.v1";
const ROUTE_RUNNERS = new Set(["claude", "codex", "antigravity"]);
// Typed `unavailable` verdicts shared by every reader. The reason codes mirror the role-route
// preflight vocabulary (R4-1); they are restated here because this reader is a separate seam.
export const ROUTE_NO_OBSERVATION = Object.freeze({ state: "unavailable", reasonCode: "RRP-NO-HOST-OBSERVATION", evidence: "" });
/**
 * Route verdict for the Critic behind a bound receipt (R4-2 / R4-12). REPORT-ONLY
 * per PO decision BD: with no host observation (no `deps.readCriticHostObservationFn`,
 * or one returning null) the verdict is a typed `unavailable` and nothing is refused,
 * so today's close outcome is unchanged. Only an observation that is SUPPLIED and
 * fails to prove a native, hook-recorded, per-call read-only Critic bound to this
 * exact packet and receipt is refused: forged or incomplete evidence never counts as
 * native. A `fallback-self-dispatch` observation is refused as fallback evidence.
 * The verdict is returned alongside the receipt and is never folded into the
 * private receipt bytes.
 */
function criticRouteVerdict({ gitCommonDir, criticPacketId, critic, criticReceiptSha256 }, deps) {
  const readObservation = deps.readCriticHostObservationFn;
  if (readObservation === undefined || readObservation === null) return ROUTE_NO_OBSERVATION;
  let observed;
  try { observed = readObservation({ gitCommonDir, criticPacketId }); }
  catch { cvlFail("CVL-ROUTE-UNAVAILABLE", "The supplied Critic host observation reader failed."); }
  if (observed === undefined || observed === null) return ROUTE_NO_OBSERVATION;
  if (typeof observed !== "object" || Array.isArray(observed)) cvlFail("CVL-ROUTE-UNAVAILABLE", "The supplied Critic host observation is malformed.");
  if (observed.kind === "fallback-self-dispatch") cvlFail("CVL-FALLBACK-EVIDENCE", "A fallback self-dispatch result is not Critic gate evidence.");
  const { start, readOnly, terminal } = observed;
  const native = observed.schema === CRITIC_HOST_OBSERVATION_SCHEMA && observed.kind === "native"
    && ROUTE_RUNNERS.has(observed.runner) && observed.packetId === criticPacketId
    && start?.hookRecorded === true && typeof start.subagentId === "string" && start.subagentId.length > 0
    && readOnly?.perCallEnforced === true && Array.isArray(readOnly.writeToolCalls) && readOnly.writeToolCalls.length === 0
    && terminal?.hookRecorded === true && terminal.packetDigest === critic.packetDigest
    && terminal.receiptSha256 === criticReceiptSha256;
  if (!native) cvlFail("CVL-ROUTE-UNAVAILABLE", "The supplied host observation does not prove a native Critic for this packet and receipt.");
  return Object.freeze({ state: "native", reasonCode: "RRP-NATIVE-OBSERVED", evidence: sha256(canonicalJson(observed)) });
}

export function walkDispatchRecords(root) {
  return walkDispatchRecordsForReview(root, []);
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

// Read-only copy of the coverage advisory readers of scripts/dispatch-record-write.mjs (that script is outside the write scope of the
// slice that introduced this module and also carries the dispatch-record writers). Follow-up: have the script import these.
function advisoryFail(code, message) { const error = new Error(message); error.code = code; throw error; }
function physicalRoot(path) {
  const absolute = resolve(path);
  const info = lstatSync(absolute);
  if (!info.isDirectory() || info.isSymbolicLink()) advisoryFail("repo-root", "repository root is not a physical directory");
  return realpathSync(absolute);
}
export const CRITIC_COVERAGE_ADVISORY_SCHEMA = "pipeline.critic-coverage-advisory.v1";
/** The one spelling of the command that publishes the addendum; the feature close (close-coordinator.mjs) and the close-feature skill name the same command. */
export const CRITIC_ADDENDUM_COMMAND = "node <plugin-root>/scripts/dispatch-record-write.mjs --repo-root <repo-root> --critic-addendum <request.json>";
const COVERAGE_LISTING_CAP = 25;

function reachableCommits(root, range) {
  if (range === null) return null;
  const base = range.base ?? null;
  for (const ref of [base, range.head]) {
    if (ref !== null && (typeof ref !== "string" || ref === "" || ref.startsWith("-") || /[\s\0]/u.test(ref))) throw new Error("the review range must name plain git refs");
  }
  const output = execFileSync("git", ["-C", root, "rev-list", base === null ? range.head : `${base}..${range.head}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  return new Set(output.split("\n").filter(Boolean));
}

/**
 * D212 (N33 D): the Critic-required v3/v4 dispatch records that the shared coverage evaluation (check-critic-skip-coverage.mjs
 * `evaluateRepositoryCriticSkipCoverage`, scoped by task id exactly as the feature close scopes it) reports without covering Critic
 * evidence. This function only chooses WHICH records to ask about (optionally those whose candidate commit lies in `range`, the git
 * half-open set (base, head], or the whole history up to head when base is null); the coverage rule itself is not reimplemented.
 * Never throws: a failure is returned as `unavailable`. `coverageOptions` is the injection seam the coverage evaluation already has.
 */
export function listUncoveredCriticRecords({ root, range = null, taskIds, coverageOptions = {} } = {}) {
  try {
    const physical = physicalRoot(root);
    const members = reachableCommits(physical, range);
    const candidates = walkDispatchRecords(physical).records.filter(({ record }) => (record?.schema === DISPATCH_RECORD_SCHEMA || record?.schema === PREVIOUS_DISPATCH_RECORD_SCHEMA)
      && criticDisposition(record) === "required"
      && (taskIds === undefined || taskIds.includes(record.taskId))
      && (members === null || (typeof record.candidateCommit === "string" && members.has(record.candidateCommit))));
    if (candidates.length === 0) return { records: [], totalCount: 0, unavailable: null };
    const owners = [...new Set(candidates.map(({ record }) => (typeof record.sliceId === "string" ? record.sliceId : record.taskId)))];
    const open = new Set(evaluateRepositoryCriticSkipCoverage({ ...coverageOptions, root: physical, taskIds: owners }).requiredTaskIds);
    const uncovered = candidates.filter(({ record }) => open.has(record.taskId))
      .map(({ path, sha256, record }) => ({ taskId: record.taskId, recordPath: path, recordSha256: sha256, candidateCommit: record.candidateCommit, appliedRow: record.criticRequired?.appliedRow ?? null }))
      .sort((left, right) => (left.recordPath < right.recordPath ? -1 : left.recordPath > right.recordPath ? 1 : 0));
    return { records: uncovered.slice(0, COVERAGE_LISTING_CAP), totalCount: uncovered.length, unavailable: null };
  } catch (error) {
    return { records: [], totalCount: 0, unavailable: `the Critic coverage evaluation could not run (${String(error?.message ?? error).split("\n")[0].slice(0, 200)})` };
  }
}

/**
 * The typed, plain-JSON advisory every runner reads the same way (writer result, Critic preflight output, push-init result), or null
 * when there is nothing to say. Advisory by construction: it carries no refusal, and the feature close
 * (CLOSE-CRITIC-EVIDENCE-MISSING) stays the one refusing gate.
 */
export function criticCoverageAdvisory({ records = [], totalCount = records.length, unavailable = null } = {}) {
  if (typeof unavailable === "string") {
    return { schema: CRITIC_COVERAGE_ADVISORY_SCHEMA, code: "CRITIC-COVERAGE-UNAVAILABLE", severity: "advisory", message: unavailable,
      line: `Critic coverage could not be checked early: ${unavailable}; the feature close still refuses a Critic-required record without covering evidence (CLOSE-CRITIC-EVIDENCE-MISSING).` };
  }
  if (!Array.isArray(records) || records.length === 0) return null;
  const nextStep = `a passed, consumed Critic receipt must cover each record (the receipt of its own task id, or a Critic course whose reviewed range contains its commit, or the last round of a registered Critic course whose rounds together contain its commit; a failed receipt never binds without a PO residual acceptance, which a course closed that way carries; run the Critic dispatch when none does), then write the byte-bound addendum with ${CRITIC_ADDENDUM_COMMAND} (the request file is the pipeline.critic-disposition-addendum.v1 object; see the close-feature skill); the feature close refuses with CLOSE-CRITIC-EVIDENCE-MISSING until then, and this notice itself refuses nothing`;
  const named = records.map((entry) => `${entry.recordPath} (${entry.appliedRow ?? "Critic required"}, commit ${String(entry.candidateCommit).slice(0, 12)})`).join(", ");
  const omitted = totalCount > records.length ? ` and ${totalCount - records.length} more` : "";
  return { schema: CRITIC_COVERAGE_ADVISORY_SCHEMA, code: "CRITIC-COVERAGE-PENDING", severity: "advisory", totalCount, records, command: CRITIC_ADDENDUM_COMMAND, nextStep,
    line: `Critic evidence is still missing for ${totalCount} Critic-required dispatch record(s): ${named}${omitted}. Next: ${nextStep}.` };
}

/** Git's ambient repository/index controls must not redirect the pinned root. */
export function agyHostGitEnvironment(source = process.env) {
  return Object.fromEntries(Object.entries(source).filter(([key]) => !/^GIT_/iu.test(key)));
}

export const PORTABLE_AGY_AUTHORSHIP_EXPORT_SCHEMA = "pipeline.portable-agy-authorship-export.v1";
export const PORTABLE_AGY_AUTHORSHIP_SUBJECT_SCHEMA = "pipeline.portable-agy-authorship-subject.v1";
export const PORTABLE_AGY_AUTHORSHIP_INTENT_SCHEMA = "pipeline.portable-agy-authorship-intent.v1";
export const PORTABLE_AGY_AUTHORSHIP_EXPORT_DIRECTORY = "project/agy-authorship-exports";
const TRUST_PATH = "project/critical-human-proof.json";
const AGY_SHA = /^[a-f0-9]{64}$/u;
const AGY_OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
export const agyExact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const agySha256 = (value) => createHash("sha256").update(value).digest("hex");
const agyDigest = (value) => agySha256(canonical(value));
export const agyFail = (code) => ({ ok: false, code });

export function portableAgyAuthorshipExportPath(taskId) {
  if (!isSafeTaskId(taskId)) throw new TypeError("portable Agy export task id is unsafe");
  return `${PORTABLE_AGY_AUTHORSHIP_EXPORT_DIRECTORY}/${taskId}.json`;
}

export function validSubject(subject) {
  if (!agyExact(subject, ["schema", "purpose", "taskId", "runner", "model", "effort", "candidateCommit",
    "authoredCommit", "authoredTree", "parentCommit", "changedPaths", "routePolicySha256",
    "consentSubjectSha256", "consentRecordSha256", "resultSha256", "reportSha256",
    "recordSha256", "hostReceiptSha256", "localVerdict"])
    || subject.schema !== PORTABLE_AGY_AUTHORSHIP_SUBJECT_SCHEMA
    || subject.purpose !== "portable-agy-authorship" || subject.runner !== "antigravity"
    || subject.localVerdict !== "bound" || !isSafeTaskId(subject.taskId)
    || typeof subject.model !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(subject.model)
    || typeof subject.effort !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(subject.effort)
    || ![subject.candidateCommit, subject.authoredCommit, subject.authoredTree, subject.parentCommit].every((v) => AGY_OID.test(v ?? ""))
    || subject.candidateCommit !== subject.parentCommit || subject.authoredCommit === subject.parentCommit
    || ![subject.routePolicySha256, subject.consentSubjectSha256, subject.consentRecordSha256,
      subject.resultSha256, subject.reportSha256, subject.recordSha256, subject.hostReceiptSha256]
      .every((v) => AGY_SHA.test(v ?? ""))) return false;
  const paths = subject.changedPaths;
  return Array.isArray(paths) && paths.length > 0 && paths.length <= 64
    && paths.every((path) => typeof path === "string" && path.length > 0
      && !path.startsWith("/") && !path.includes("\\")
      && !path.split("/").some((part) => !part || part === "." || part === ".."))
    && paths.every((path, index) => index === 0 || paths[index - 1] < path);
}

export function portableAgyAuthorshipIntent(subject) {
  if (!validSubject(subject)) throw new TypeError("portable Agy subject is invalid");
  const value = { schema: PORTABLE_AGY_AUTHORSHIP_INTENT_SCHEMA,
    kind: "agy-authorship-export", decision: "approve", purpose: subject.purpose,
    taskId: subject.taskId,
    candidate: { commit: subject.authoredCommit, tree: subject.authoredTree },
    subjectSha256: agyDigest(subject) };
  return { value, sha256: agyDigest(value) };
}

export function verifyPortableAgyAuthorshipExport({ exportRecord, taskId, commit, tree, parent,
  changedPaths, trustAnchors } = {}) {
  if (!agyExact(exportRecord, ["schema", "subject", "approvalIntent", "proof"])
    || exportRecord.schema !== PORTABLE_AGY_AUTHORSHIP_EXPORT_SCHEMA
    || !validSubject(exportRecord.subject) || exportRecord.subject.taskId !== taskId
    || exportRecord.subject.authoredCommit !== commit || exportRecord.subject.authoredTree !== tree
    || exportRecord.subject.parentCommit !== parent
    || canonical(exportRecord.subject.changedPaths) !== canonical(changedPaths)) return agyFail("agy-export-shape-or-git-binding");
  if (!Array.isArray(trustAnchors) || trustAnchors.length === 0) return agyFail("agy-export-trust-anchor-missing");
  const expected = portableAgyAuthorshipIntent(exportRecord.subject);
  if (!agyExact(exportRecord.approvalIntent, ["value", "sha256"])
    || canonical(exportRecord.approvalIntent) !== canonical(expected)) return agyFail("agy-export-intent-mismatch");
  const checked = verifyAgainstTrustAnchors({ intent: expected, anchors: trustAnchors,
    proof: exportRecord.proof });
  return checked.verified ? { ok: true, code: "agy-export-signature-verified",
    authority: "host-observed-portable", signer: checked.signer } : agyFail(checked.code);
}

function agyGit(root, args, encoding = "utf8") {
  return execFileSync("git", ["-C", root, ...args], { encoding, timeout: 10_000,
    maxBuffer: 1024 * 1024,
    env: { ...agyHostGitEnvironment(), GIT_OPTIONAL_LOCKS: "0", GIT_CONFIG_NOSYSTEM: "1" },
    stdio: ["ignore", "pipe", "ignore"] });
}

/** Physical, agyExact-HEAD clone reader; a missing export is not an authorship FAIL. */
export function readPortableAgyAuthorshipExport({ root, taskId, commit, record } = {}) {
  let path;
  try { path = portableAgyAuthorshipExportPath(taskId); }
  catch { return agyFail("agy-export-task-invalid"); }
  if (typeof root !== "string" || !AGY_OID.test(commit ?? "")) return agyFail("agy-export-input");
  let base;
  try { base = realpathSync(resolve(root)); }
  catch { return agyFail("agy-export-root-unavailable"); }
  let target = base;
  try {
    for (const segment of path.split("/")) {
      target = join(target, segment);
      const stat = lstatSync(target);
      if (stat.isSymbolicLink()) return agyFail("agy-export-path-alias");
    }
  } catch (error) {
    return agyFail(error?.code === "ENOENT" ? "agy-export-missing" : "agy-export-path-unreadable");
  }
  try {
    const stat = lstatSync(target);
    if (!stat.isFile() || stat.size < 1 || stat.size > 128 * 1024) return agyFail("agy-export-file-invalid");
    const bytes = readFileSync(target);
    if (!bytes.equals(agyGit(base, ["show", `HEAD:${path}`], null))) return agyFail("agy-export-committed-bytes-differ");
    const exportRecord = JSON.parse(bytes.toString("utf8"));
    if (!bytes.equals(Buffer.from(`${canonical(exportRecord)}\n`, "utf8"))) return agyFail("agy-export-canonical-bytes-differ");
    if (record !== undefined) {
      const subject = exportRecord.subject;
      const recordPath = `evidence/dispatch-record-${taskId}.json`;
      const evidence = join(base, "evidence");
      const physical = join(evidence, `dispatch-record-${taskId}.json`);
      const expected = agyAuthoredRecordBytes(record);
      const evidenceStat = lstatSync(evidence);
      const recordStat = lstatSync(physical);
      if (!evidenceStat.isDirectory() || evidenceStat.isSymbolicLink()
        || !recordStat.isFile() || recordStat.isSymbolicLink()
        || recordStat.size !== expected.length || !readFileSync(physical).equals(expected)
        || !agyGit(base, ["show", `HEAD:${recordPath}`], null).equals(expected)
        || subject?.recordSha256 !== agySha256(expected)
        || record.schema !== "pipeline.dispatch-record.v4"
        || record.outcomeClassification?.kind !== "authored-commit"
        || record.runner !== subject.runner || record.taskId !== taskId
        || record.model !== subject.model || record.effort !== subject.effort
        || record.rulesetSha !== subject.routePolicySha256
        || record.candidateCommit !== commit
        || !Array.isArray(record.commits) || record.commits.length !== 1
        || record.commits[0] !== commit
        || typeof record.report?.text !== "string"
        || record.resultSha256 !== agySha256(record.report.text)
        || subject.reportSha256 !== record.resultSha256) {
        return agyFail("agy-export-record-binding-failed");
      }
    }
    const tree = String(agyGit(base, ["rev-parse", `${commit}^{tree}`])).trim();
    const parent = String(agyGit(base, ["rev-parse", `${commit}^`])).trim();
    const changedPaths = agyGit(base, ["diff-tree", "--no-commit-id", "--name-only", "-r", "-z", commit])
      .split("\0").filter(Boolean).sort();
    agyGit(base, ["merge-base", "--is-ancestor", commit, "HEAD"]);
    const message = agyGit(base, ["show", "-s", "--format=%B", commit]);
    const lines = message.trimEnd().split(/\r?\n/u);
    if (canonical(lines.slice(-3)) !== canonical([
      `Dispatch: ${taskId} (goldfish)`, AGY_HOST_OBSERVED_TRAILER, "AI-Assisted: true",
    ]) || lines.filter((line) => line === `Dispatch: ${taskId} (goldfish)`).length !== 1
      || lines.filter((line) => line === AGY_HOST_OBSERVED_TRAILER).length !== 1) return agyFail("agy-export-commit-trailers");
    const policy = JSON.parse(agyGit(base, ["show", `${parent}:${TRUST_PATH}`]));
    const anchors = policy?.schema === "pipeline.critical-human-proof-policy.v3" ? policy.trustAnchors : null;
    return verifyPortableAgyAuthorshipExport({ exportRecord, taskId, commit, tree, parent,
      changedPaths, trustAnchors: anchors });
  } catch { return agyFail("agy-export-readback-failed"); }
}

