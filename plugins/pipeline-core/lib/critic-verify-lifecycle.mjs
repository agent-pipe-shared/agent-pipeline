// SPDX-License-Identifier: SUL-1.0
/**
 * Private bridge between a completed fresh Critic and a Verify run.
 *
 * The public Verify JSON deliberately remains consumable evidence, not an
 * assertion that a reviewer existed.  This module records that assertion only
 * after re-reading the consumed Critic packet from the private journal.  A
 * feature close can consequently demand this record and cannot be fooled by a
 * caller-supplied `{ status: "passed" }` object.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { isSuccessfulSpawn } from "./successful-spawn.mjs";
import { GIT_NULL_DEVICE } from "./git-null-device.mjs";
import { canonicalJson as canonicalCourseJson, sha256Canonical } from "./review-economy.mjs";
import { validateCriticReviewLineage } from "./critic-review-lineage.mjs";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import { canonicalJson, sha256 } from "../scripts/critic-packet-preflight.mjs";
import { readConsumedSessionAdmission, readConsumedCandidateResult, readConsumedCandidateReceipt } from "../scripts/critic-packet-preflight.mjs";
import { validateSessionCriticResult, sessionCriticReceiptForResult, validateSessionCriticReceipt } from "../scripts/session-critic-finalizer.mjs";
import { classifyRegisteredEvidenceOnlyCommits } from "./critic-course-admission.mjs";

export const CRITIC_VERIFY_LIFECYCLE_RECEIPT_SCHEMA = "pipeline.critic-verify-lifecycle-receipt.v1";
export const CRITIC_VERIFY_CARRY_LIFECYCLE_RECEIPT_SCHEMA = "pipeline.critic-verify-lifecycle-receipt.v2";
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const SHA = /^[a-f0-9]{64}$/u;
const PACKET = /^[a-f0-9]{32}$/u;
const FEATURE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function exact(value, keys) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)); }
function candidate(value) { return exact(value, ["commit", "tree"]) && OID.test(value.commit ?? "") && OID.test(value.tree ?? ""); }
function bytesSha256(value) { return createHash("sha256").update(value).digest("hex"); }

export function criticVerifyLifecycleId({ candidate: sourceCandidate, criticPacketId, verifyEvidenceSha256 }) {
  if (!candidate(sourceCandidate) || !PACKET.test(criticPacketId ?? "") || !SHA.test(verifyEvidenceSha256 ?? "")) fail("CVL-IDENTITY", "Lifecycle identity is invalid.");
  return sha256(canonicalJson({ candidate: sourceCandidate, criticPacketId, verifyEvidenceSha256 }));
}

function recordPath(privateRoot, id) {
  if (!SHA.test(id ?? "")) fail("CVL-IDENTITY", "Lifecycle receipt identity is invalid.");
  return join(privateRoot, "critic-verify-lifecycle", `${id}.json`);
}

/**
 * Read a consumed Critic receipt from its private packet and prove that the
 * receipt is the receipt for that packet's exact candidate and diff.  A
 * syntactically valid receipt on its own is deliberately insufficient: the
 * packet journal is the authority that makes it a completed, fresh review.
 */
export function readBoundConsumedCriticReceipt({ gitCommonDir, criticPacketId, candidate: sourceCandidate }, deps = {}) {
  if (typeof gitCommonDir !== "string" || gitCommonDir.length === 0 || !PACKET.test(criticPacketId ?? "") || !candidate(sourceCandidate)) {
    fail("CVL-INPUT", "Critic/Verify lifecycle input is invalid.");
  }
  const common = resolve(gitCommonDir);
  const readReceipt = deps.readConsumedCandidateReceiptFn ?? readConsumedCandidateReceipt;
  let consumed;
  try { consumed = readReceipt({ controlRoot: join(common, "agent-pipeline", "critic-packets"), packetId: criticPacketId }); }
  catch (error) { fail("CVL-CRITIC-UNAVAILABLE", `No consumed private Critic receipt is available for this packet (${error?.code ?? "unavailable"}).`); }
  const critic = consumed?.receipt;
  const packet = consumed?.packet;
  try { validateSessionCriticReceipt(critic); }
  catch { fail("CVL-CRITIC-INVALID", "Private Critic receipt is malformed."); }
  if (!packet || packet.packetId !== criticPacketId || critic.packetId !== criticPacketId
    || critic.packetDigest !== sha256(canonicalJson(packet))
    || packet.candidate?.base !== critic.candidate.base || packet.candidate?.commit !== critic.candidate.commit
    || packet.candidate?.tree !== critic.candidate.tree || packet.diff?.base !== critic.reviewRange.base
    || packet.diff?.commit !== critic.reviewRange.commit || packet.diff?.sha256 !== critic.reviewRange.diffSha256) {
    fail("CVL-CRITIC-PACKET-MISMATCH", "Private Critic receipt is not bound to its consumed packet.");
  }
  if (critic.reviewPass !== true) fail("CVL-CRITIC-FAILED", "Critic findings remain unresolved; Verify cannot attest this candidate.");
  if (critic.candidate.commit !== sourceCandidate.commit || critic.candidate.tree !== sourceCandidate.tree
    || critic.reviewRange.commit !== sourceCandidate.commit) fail("CVL-CRITIC-STALE", "Private Critic receipt is not bound to the Verify candidate.");
  const criticReceiptSha256 = bytesSha256(canonicalJson(critic));
  const roleRoute = criticRouteVerdict({ gitCommonDir: common, criticPacketId, critic, criticReceiptSha256 }, deps);
  return Object.freeze({ packet, critic, criticReceiptSha256, roleRoute });
}

const CRITIC_HOST_OBSERVATION_SCHEMA = "pipeline.critic-host-observation.v1";
const ROUTE_RUNNERS = new Set(["claude", "codex", "antigravity"]);
// Typed `unavailable` verdicts shared by every reader. The reason codes mirror the role-route
// preflight vocabulary (R4-1); they are restated here because this reader is a separate seam.
const ROUTE_NO_OBSERVATION = Object.freeze({ state: "unavailable", reasonCode: "RRP-NO-HOST-OBSERVATION", evidence: "" });
const ROUTE_NOT_REGISTERED = Object.freeze({ state: "unavailable", reasonCode: "RRP-ROLE-NOT-REGISTERED", evidence: "" });

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
  catch { fail("CVL-ROUTE-UNAVAILABLE", "The supplied Critic host observation reader failed."); }
  if (observed === undefined || observed === null) return ROUTE_NO_OBSERVATION;
  if (typeof observed !== "object" || Array.isArray(observed)) fail("CVL-ROUTE-UNAVAILABLE", "The supplied Critic host observation is malformed.");
  if (observed.kind === "fallback-self-dispatch") fail("CVL-FALLBACK-EVIDENCE", "A fallback self-dispatch result is not Critic gate evidence.");
  const { start, readOnly, terminal } = observed;
  const native = observed.schema === CRITIC_HOST_OBSERVATION_SCHEMA && observed.kind === "native"
    && ROUTE_RUNNERS.has(observed.runner) && observed.packetId === criticPacketId
    && start?.hookRecorded === true && typeof start.subagentId === "string" && start.subagentId.length > 0
    && readOnly?.perCallEnforced === true && Array.isArray(readOnly.writeToolCalls) && readOnly.writeToolCalls.length === 0
    && terminal?.hookRecorded === true && terminal.packetDigest === critic.packetDigest
    && terminal.receiptSha256 === criticReceiptSha256;
  if (!native) fail("CVL-ROUTE-UNAVAILABLE", "The supplied host observation does not prove a native Critic for this packet and receipt.");
  return Object.freeze({ state: "native", reasonCode: "RRP-NATIVE-OBSERVED", evidence: sha256(canonicalJson(observed)) });
}

/**
 * Read-only eligibility proof for a reviewed commit followed solely by
 * immutable, feature-package-registered evidence commits. This is not itself
 * Verify admission or a persisted lifecycle receipt: the eventual consumer
 * must bind the returned digest to the target Verify evidence.
 */
export function inspectConsumedCriticEvidenceCarryForward({ repoRoot, gitCommonDir, featureId,
  criticPacketId, targetCandidate }, deps = {}) {
  if (typeof repoRoot !== "string" || !isAbsolute(repoRoot)
    || typeof gitCommonDir !== "string" || gitCommonDir.length === 0
    || !FEATURE_ID.test(featureId ?? "") || !PACKET.test(criticPacketId ?? "")
    || !candidate(targetCandidate)) fail("CVL-CARRY-INPUT", "Critic carry-forward input is invalid.");
  let consumed;
  try {
    consumed = (deps.readConsumedCandidateReceiptFn ?? readConsumedCandidateReceipt)({
      controlRoot: join(resolve(gitCommonDir), "agent-pipeline", "critic-packets"),
      packetId: criticPacketId,
    });
  } catch { fail("CVL-CRITIC-UNAVAILABLE", "Consumed Critic packet is unavailable."); }
  const reviewedCandidate = consumed?.packet?.candidate;
  if (!reviewedCandidate || !candidate({ commit: reviewedCandidate.commit, tree: reviewedCandidate.tree })
    || reviewedCandidate.commit === targetCandidate.commit) {
    fail("CVL-CARRY-INPUT", "Carry-forward requires distinct reviewed and target commits.");
  }
  const bound = readBoundConsumedCriticReceipt({ gitCommonDir, criticPacketId,
    candidate: { commit: reviewedCandidate.commit, tree: reviewedCandidate.tree } },
  { readConsumedCandidateReceiptFn: () => consumed });
  let range;
  try {
    range = (deps.classifyRegisteredEvidenceOnlyCommitsFn ?? classifyRegisteredEvidenceOnlyCommits)({
      repoRoot, featureId, baseCommit: reviewedCandidate.commit,
      candidateCommit: targetCandidate.commit,
    });
  } catch { fail("CVL-CARRY-RANGE", "Evidence-only Git range cannot be verified."); }
  if (range.candidateTree !== targetCandidate.tree
    || !Array.isArray(range.rangeCommits) || range.rangeCommits.length === 0
    || !Array.isArray(range.evidenceOnlyCommits)
    || range.evidenceOnlyCommits.length !== range.rangeCommits.length
    || !range.rangeCommits.every((commit, index) => commit === range.evidenceOnlyCommits[index])
    || !Array.isArray(range.correctionCommits) || range.correctionCommits.length !== 0) {
    fail("CVL-CARRY-CONTENT-CHANGED", "Critic carry-forward range contains unreviewed content.");
  }
  const proof = Object.freeze({
    schema: "pipeline.critic-evidence-carry-forward.v1", featureId,
    reviewedCandidate: { commit: reviewedCandidate.commit, tree: reviewedCandidate.tree },
    targetCandidate: { ...targetCandidate }, criticPacketId,
    criticReceiptSha256: bound.criticReceiptSha256,
    manifestSha256: range.manifestSha256,
    evidenceOnlyCommits: [...range.evidenceOnlyCommits],
  });
  return Object.freeze({ proof, proofSha256: sha256(canonicalJson(proof)) });
}

/**
 * Revalidate a consumed Critic packet and persist an immutable Verify binding.
 * `gitCommonDir` is supplied by the caller's already-resolved repository
 * boundary; this module never discovers or follows a user-provided path.
 */
export function recordCriticVerifyLifecycle({ repoRoot = null, featureId = null, gitCommonDir,
  criticPacketId, candidate: sourceCandidate, evidencePath, evidence }, deps = {}) {
  if (typeof gitCommonDir !== "string" || gitCommonDir.length === 0 || !PACKET.test(criticPacketId ?? "") || !candidate(sourceCandidate)
    || typeof evidencePath !== "string" || evidencePath.length === 0 || !evidence || typeof evidence !== "object"
    || (featureId === null) !== (repoRoot === null)) fail("CVL-INPUT", "Critic/Verify lifecycle input is invalid.");
  if (evidence.schema !== "pipeline.verify-evidence.v0" || evidence.exitCode !== 0 || !candidate(evidence.candidate)
    || evidence.candidate.commit !== sourceCandidate.commit || evidence.candidate.tree !== sourceCandidate.tree) fail("CVL-VERIFY", "Passing Verify evidence is not bound to the current candidate.");
  const common = resolve(gitCommonDir);
  const privateRoot = join(common, "agent-pipeline");
  const carry = featureId === null ? null : inspectConsumedCriticEvidenceCarryForward({
    repoRoot, gitCommonDir: common, featureId, criticPacketId, targetCandidate: sourceCandidate,
  }, deps);
  const bound = readBoundConsumedCriticReceipt({ gitCommonDir: common, criticPacketId,
    candidate: carry === null ? sourceCandidate : carry.proof.reviewedCandidate }, deps);
  const { critic } = bound;
  const verifyEvidenceSha256 = bytesSha256(canonicalJson(evidence));
  const criticReceiptSha256 = bound.criticReceiptSha256;
  const id = criticVerifyLifecycleId({ candidate: sourceCandidate, criticPacketId, verifyEvidenceSha256 });
  const receipt = Object.freeze({
    schema: carry === null ? CRITIC_VERIFY_LIFECYCLE_RECEIPT_SCHEMA : CRITIC_VERIFY_CARRY_LIFECYCLE_RECEIPT_SCHEMA,
    id,
    candidate: { ...sourceCandidate },
    critic: { packetId: criticPacketId, packetDigest: critic.packetDigest, receiptSha256: criticReceiptSha256, verdictSha256: critic.verdictSha256, reviewRange: { ...critic.reviewRange } },
    verify: { evidencePath, evidenceSha256: verifyEvidenceSha256, verifyRunTerminalSha256: evidence.verifyRun?.terminalSha256 ?? null },
    ...(carry === null ? {} : { carryForward: carry }),
  });
  const target = recordPath(privateRoot, id);
  mkdirSync(join(privateRoot, "critic-verify-lifecycle"), { recursive: true, mode: 0o700 });
  const encoded = `${canonicalJson(receipt)}\n`;
  if (existsSync(target)) {
    let previous;
    try { previous = readFileSync(target, "utf8"); } catch { fail("CVL-RECEIPT-READBACK", "Existing private lifecycle receipt cannot be read."); }
    if (previous !== encoded) fail("CVL-RECEIPT-COLLISION", "Existing lifecycle receipt has a different binding.");
  } else {
    try { writeFileSync(target, encoded, { flag: "wx", mode: 0o600 }); }
    catch { fail("CVL-RECEIPT-WRITE", "Private lifecycle receipt could not be persisted."); }
  }
  const observed = readFileSync(target, "utf8");
  if (observed !== encoded) fail("CVL-RECEIPT-READBACK", "Private lifecycle receipt readback differs.");
  return Object.freeze({ receipt, receiptSha256: bytesSha256(canonicalJson(receipt)), path: target });
}

/** Re-read a receipt by its opaque ID and bind it to the expected candidate/evidence. */
export function readCriticVerifyLifecycle({ repoRoot = null, gitCommonDir, id,
  candidate: sourceCandidate, evidencePath = null, evidence }, deps = {}) {
  if (typeof gitCommonDir !== "string" || !SHA.test(id ?? "") || !candidate(sourceCandidate) || (evidencePath !== null && typeof evidencePath !== "string")) fail("CVL-INPUT", "Lifecycle read input is invalid.");
  const target = recordPath(join(resolve(gitCommonDir), "agent-pipeline"), id);
  let receipt;
  try { receipt = JSON.parse(readFileSync(target, "utf8")); } catch { fail("CVL-RECEIPT-UNAVAILABLE", "Private Critic/Verify lifecycle receipt is unavailable."); }
  const carrying = receipt?.schema === CRITIC_VERIFY_CARRY_LIFECYCLE_RECEIPT_SCHEMA;
  const keys = ["schema", "id", "candidate", "critic", "verify", ...(carrying ? ["carryForward"] : [])];
  if (!exact(receipt, keys) || (![CRITIC_VERIFY_LIFECYCLE_RECEIPT_SCHEMA,
    CRITIC_VERIFY_CARRY_LIFECYCLE_RECEIPT_SCHEMA].includes(receipt.schema))
    || receipt.id !== id || !candidate(receipt.candidate)
    || receipt.candidate.commit !== sourceCandidate.commit || receipt.candidate.tree !== sourceCandidate.tree
    || !exact(receipt.critic, ["packetId", "packetDigest", "receiptSha256", "verdictSha256", "reviewRange"])
    || !PACKET.test(receipt.critic.packetId ?? "") || !SHA.test(receipt.critic.packetDigest ?? "")
    || !SHA.test(receipt.critic.receiptSha256 ?? "") || !SHA.test(receipt.critic.verdictSha256 ?? "")
    || !exact(receipt.critic.reviewRange, ["base", "commit", "diffSha256"])
    || !OID.test(receipt.critic.reviewRange.base ?? "")
    || (!carrying && receipt.critic.reviewRange.commit !== sourceCandidate.commit)
    || (carrying && !OID.test(receipt.critic.reviewRange.commit ?? ""))
    || !SHA.test(receipt.critic.reviewRange.diffSha256 ?? "")
    || !exact(receipt.verify, ["evidencePath", "evidenceSha256", "verifyRunTerminalSha256"])
    || (evidencePath !== null && receipt.verify.evidencePath !== evidencePath) || !SHA.test(receipt.verify.evidenceSha256 ?? "")
    || (receipt.verify.verifyRunTerminalSha256 !== null && !SHA.test(receipt.verify.verifyRunTerminalSha256 ?? ""))) {
    fail("CVL-RECEIPT-INVALID", "Private lifecycle receipt is malformed or stale.");
  }
  if (criticVerifyLifecycleId({ candidate: sourceCandidate, criticPacketId: receipt.critic.packetId,
    verifyEvidenceSha256: receipt.verify.evidenceSha256 }) !== id) {
    fail("CVL-RECEIPT-IDENTITY", "Private lifecycle identity differs from its candidate and Verify binding.");
  }
  let carry = null;
  if (carrying) {
    if (typeof repoRoot !== "string" || !isAbsolute(repoRoot)
      || !exact(receipt.carryForward, ["proof", "proofSha256"])
      || !SHA.test(receipt.carryForward.proofSha256 ?? "")
      || !FEATURE_ID.test(receipt.carryForward.proof?.featureId ?? "")) {
      fail("CVL-CARRY-INVALID", "Private evidence-only carry binding is invalid.");
    }
    carry = inspectConsumedCriticEvidenceCarryForward({ repoRoot, gitCommonDir,
      featureId: receipt.carryForward.proof.featureId,
      criticPacketId: receipt.critic.packetId, targetCandidate: sourceCandidate }, deps);
    if (carry.proofSha256 !== receipt.carryForward.proofSha256
      || canonicalJson(carry.proof) !== canonicalJson(receipt.carryForward.proof)
      || receipt.critic.reviewRange.commit !== carry.proof.reviewedCandidate.commit) {
      fail("CVL-CARRY-DRIFT", "Private evidence-only carry proof differs from Git or the consumed review.");
    }
  }
  const bound = readBoundConsumedCriticReceipt({ gitCommonDir, criticPacketId: receipt.critic.packetId,
    candidate: carry === null ? sourceCandidate : carry.proof.reviewedCandidate }, deps);
  if (receipt.critic.packetDigest !== bound.critic.packetDigest
    || receipt.critic.receiptSha256 !== bound.criticReceiptSha256
    || receipt.critic.verdictSha256 !== bound.critic.verdictSha256
    || canonicalJson(receipt.critic.reviewRange) !== canonicalJson(bound.critic.reviewRange)) {
    fail("CVL-CRITIC-DRIFT", "Private lifecycle Critic binding differs from the consumed packet.");
  }
  if (evidence !== undefined) {
    if (evidence?.schema !== "pipeline.verify-evidence.v0" || evidence.exitCode !== 0
      || !candidate(evidence.candidate) || evidence.candidate.commit !== sourceCandidate.commit
      || evidence.candidate.tree !== sourceCandidate.tree) {
      fail("CVL-VERIFY", "Passing Verify evidence is not bound to the current candidate.");
    }
    if (bytesSha256(canonicalJson(evidence)) !== receipt.verify.evidenceSha256) {
      fail("CVL-VERIFY-DRIFT", "Verify evidence differs from the private lifecycle binding.");
    }
    if (receipt.verify.verifyRunTerminalSha256 !== (evidence.verifyRun?.terminalSha256 ?? null)) {
      fail("CVL-VERIFY-DRIFT", "Verify terminal receipt differs from the private lifecycle binding.");
    }
  }
  // Report-only role-route verdicts (R4-12, PO decision BD). Not part of `receipt`, so `receiptSha256` is unchanged.
  // plan-verifier has no lifecycle slot; readiness has no observation seam in this reader.
  const roleRoutes = Object.freeze({ critic: bound.roleRoute, "plan-verifier": ROUTE_NOT_REGISTERED, readiness: ROUTE_NO_OBSERVATION });
  return Object.freeze({ receipt, receiptSha256: bytesSha256(canonicalJson(receipt)), path: target, roleRoutes });
}

/** Pure projection; only readConsumedCriticCourseResult supplies journal authority. */
export function projectConsumedCriticFindings({ packetId, findings }) {
  if (!PACKET.test(packetId ?? "") || !Array.isArray(findings)) fail("CVL-COURSE-FINDINGS", "Invalid consumed finding projection.");
  const severity = { blocker: "critical", major: "high", minor: "medium" };
  return findings.map((finding, index) => {
    if (!exact(finding, ["gap", "risk", "severity", "evidence", "spec_ref"])
      || !Object.hasOwn(severity, finding.severity)
      || ["gap", "risk", "evidence", "spec_ref"].some(key => typeof finding[key] !== "string")) {
      fail("CVL-COURSE-FINDINGS", "Invalid raw consumed finding.");
    }
    return Object.freeze({ id: `CRF-${packetId}-${index + 1}`, priorFindingId: null,
      severity: severity[finding.severity], status: "open", evidenceSha256: sha256Canonical(finding) });
  });
}

// `spawn` is a test seam (default: the real spawnSync) so a stub can capture the git child environment.
export function courseGitBytes(root, args, spawn = spawnSync) {
  const result = spawn("git", ["-C", root, ...args], { shell: false, encoding: null,
    timeout: 10000, maxBuffer: 1024 * 1024, env: { PATH: process.env.PATH ?? "", LANG: "C", LC_ALL: "C",
      GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_SYSTEM: GIT_NULL_DEVICE,
      GIT_CONFIG_GLOBAL: GIT_NULL_DEVICE, GIT_CONFIG_COUNT: "0", GIT_TERMINAL_PROMPT: "0" } });
  if (!isSuccessfulSpawn(result) || result.signal !== null) fail("CVL-COURSE-REGISTRATION-UNAVAILABLE", "Registered course observation unavailable.");
  return result.stdout;
}
function coursePath(path) {
  return typeof path === "string" && path.length <= 256 && !isAbsolute(path)
    && !path.includes("\\") && !path.includes("\0") && path.split("/").every(part => part !== "" && part !== "." && part !== "..");
}
function courseRecordAt(repository, expected) {
  if (!exact(expected, ["path", "sha256", "recordSha256", "reviewId", "courseKey"])
    || !coursePath(expected.path) || !SHA.test(expected.sha256 ?? "") || !SHA.test(expected.recordSha256 ?? "")
    || typeof expected.reviewId !== "string" || !(expected.courseKey === null || SHA.test(expected.courseKey ?? ""))) {
    fail("CVL-COURSE-RECORD", "Expected retained record locator is invalid.");
  }
  const match = /^specs\/([^/]+)\/evidence\//u.exec(expected.path);
  if (!match || !FEATURE_ID.test(match[1])) fail("CVL-COURSE-RECORD", "Retained record path is invalid.");
  const root = repository.repoRoot, commit = repository.registrationCommit;
  const manifest = JSON.parse(courseGitBytes(root, ["show", `${commit}:specs/${match[1]}/lifecycle.json`]));
  const registrations = manifest?.artifacts?.filter(row => row.path === expected.path) ?? [];
  if (manifest.schema !== "pipeline.feature-package.v1" || manifest.feature?.id !== match[1] || registrations.length !== 1) {
    fail("CVL-COURSE-REGISTRATION", "Retained record is not uniquely registered.");
  }
  const registration = registrations[0];
  if (registration.class !== "candidate-evidence" || registration.authority !== false || registration.mutability !== "immutable"
    || registration.retention !== "retain" || registration.sha256 !== expected.sha256) fail("CVL-COURSE-REGISTRATION", "Retained registration is invalid.");
  const treeRow = courseGitBytes(root, ["ls-tree", "-z", commit, "--", expected.path]).toString("utf8");
  if (!/^100644 blob (?:[a-f0-9]{40}|[a-f0-9]{64})\t[^\0]+\0$/u.test(treeRow)
    || !treeRow.endsWith(`\t${expected.path}\0`)) fail("CVL-COURSE-REGISTRATION", "Retained record must be a regular nonexecuting Git blob.");
  const bytes = courseGitBytes(root, ["show", `${commit}:${expected.path}`]);
  if (bytesSha256(bytes) !== expected.sha256) fail("CVL-COURSE-RECORD", "Retained record digest differs.");
  const retained = JSON.parse(bytes);
  if (!validateCriticReviewLineage(retained).ok || retained.reviewId !== expected.reviewId
    || retained.recordSha256 !== expected.recordSha256 || (retained.courseBinding?.courseKey ?? null) !== expected.courseKey) {
    fail("CVL-COURSE-RECORD", "Retained course record binding differs.");
  }
  return retained;
}

/** Re-read the actual consumed journal and the exact registered terminal record. */
export function readConsumedCriticCourseResult(input) {
  try {
    if (!exact(input, ["resolvedRepository", "packetId", "expectedCandidate", "expectedRange", "expectedRecord"])
      || !PACKET.test(input.packetId ?? "") || !candidate(input.expectedCandidate)
      || !exact(input.expectedRange, ["base", "commit", "diffSha256"])
      || !OID.test(input.expectedRange.base ?? "") || !OID.test(input.expectedRange.commit ?? "")
      || !SHA.test(input.expectedRange.diffSha256 ?? "")) fail("CVL-COURSE-INPUT", "Consumed course input is invalid.");
    const repository = input.resolvedRepository;
    if (!exact(repository, ["repoRoot", "gitCommonDir", "controlRoot", "registrationCommit"])
      || !isAbsolute(repository.repoRoot) || !isAbsolute(repository.gitCommonDir) || !OID.test(repository.registrationCommit ?? "")) {
      fail("CVL-COURSE-INPUT", "Resolved repository is invalid.");
    }
    const root = realpathSync(repository.repoRoot);
    const common = realpathSync(resolve(root, courseGitBytes(root, ["rev-parse", "--git-common-dir"]).toString("utf8").trim()));
    if (root !== repository.repoRoot || common !== repository.gitCommonDir
      || repository.controlRoot !== join(common, "agent-pipeline", "critic-packets")) fail("CVL-COURSE-INPUT", "Resolved journal boundary differs.");
    let consumed;
    try { consumed = readConsumedCandidateResult({ controlRoot: repository.controlRoot, packetId: input.packetId }); }
    catch (error) {
      if (error?.code === "ENOENT" || error?.code === "CPP-ABSENT" || /UNAVAILABLE|NOT-FOUND|READ/u.test(error?.code ?? "")) {
        return Object.freeze({ ok: false, status: "unavailable", code: "CVL-COURSE-JOURNAL-UNAVAILABLE" });
      }
      fail("CVL-COURSE-JOURNAL", "Consumed journal is contradictory or unavailable.");
    }
    const { packet, receipt, result } = consumed;
    validateSessionCriticResult(result, packet);
    validateSessionCriticReceipt(receipt);
    if (canonicalCourseJson(sessionCriticReceiptForResult(result)) !== canonicalCourseJson(receipt)
      || packet.packetId !== input.packetId || packet.candidate.commit !== input.expectedCandidate.commit
      || packet.candidate.tree !== input.expectedCandidate.tree
      || canonicalCourseJson(result.reviewRange) !== canonicalCourseJson(input.expectedRange)) fail("CVL-COURSE-BINDING", "Consumed packet/result/receipt binding differs.");
    const receiptSha256 = sha256Canonical(receipt), resultSha256 = sha256Canonical(result);
    const findings = projectConsumedCriticFindings({ packetId: input.packetId, findings: result.verdict.findings });
    let recordSha256 = null;
    if (input.expectedRecord !== null) {
      const retained = courseRecordAt(repository, input.expectedRecord);
      if (retained.request.packetId !== input.packetId || retained.candidate.commit !== packet.candidate.commit
        || retained.candidate.tree !== packet.candidate.tree || retained.diff.base !== packet.diff.base
        || retained.diff.sha256 !== packet.diff.sha256
        || retained.verdict.resultSha256 !== resultSha256 || !retained.verdict.schemaValid
        || retained.verdict.status !== (result.verdict.pass ? "no-findings" : "findings")
        || retained.references.packetSha256 !== sha256Canonical(packet)
        || retained.references.requestSha256 !== packet.bindings.requestSha256
        || retained.coverage.complete !== true || retained.coverage.receiptSha256 !== receiptSha256
        || retained.lane.laneId !== result.session.id || retained.lane.contextSha256 !== sha256Canonical(result.session)) {
        fail("CVL-COURSE-RECORD", "Retained record is not bound to the genuine consumed result.");
      }
      if (retained.schema === "pipeline.critic-review-lineage.v2") {
        const claim = readConsumedCourseClaimBinding({ resolvedRepository: repository, packetId: input.packetId, expectedCandidate: input.expectedCandidate });
        if (!claim.ok) return claim;
        if (retained.courseBinding.courseSourceSha256 !== claim.value.courseSourceSha256
          || retained.courseBinding.courseDecisionSha256 !== claim.value.courseDecisionSha256) fail("CVL-COURSE-RECORD", "Retained course digests differ from actual consumed admission.");
        const bindings = result.verdict.findings.map((finding,index) => ({ findingId: findings[index].id, index, sha256: sha256Canonical(finding) }));
        const expected = { packetId: input.packetId, packetDigest: receipt.packetDigest, receiptSha256,
          resultSha256, verdictSha256: receipt.verdictSha256, findingBindings: bindings };
        if (canonicalCourseJson(retained.consumedResult) !== canonicalCourseJson(expected)) fail("CVL-COURSE-RECORD", "Retained consumed-result bindings differ.");
      }
      for (const finding of findings) {
        const rows = retained.findings.filter(row => row.evidenceSha256 === finding.evidenceSha256 && row.severity === finding.severity && row.status === "open"
          && (retained.schema !== "pipeline.critic-review-lineage.v2" || row.id === finding.id));
        if (rows.length !== 1 || (retained.schema === "pipeline.critic-review-lineage.v2" && rows[0].id !== finding.id)) fail("CVL-COURSE-FINDINGS", "Retained raw finding binding differs.");
      }
      recordSha256 = retained.recordSha256;
    }
    return Object.freeze({ ok: true, value: Object.freeze({ packet, receipt, result,
      receiptSha256, resultSha256, recordSha256, findings }) });
  } catch (error) {
    return Object.freeze({ ok: false, status: /UNAVAILABLE/u.test(error?.code ?? "") ? "unavailable" : "refused",
      code: typeof error?.code === "string" && /^(?:CVL|SCF)-/u.test(error.code) ? error.code : "CVL-COURSE-INVALID" });
  }
}

/** Observe the real consumed admission; serialized caller course claims are not inputs. */
export function readConsumedCourseClaimBinding(input) {
  try {
    if (!exact(input, ["resolvedRepository", "packetId", "expectedCandidate"])) fail("CVL-COURSE-INPUT", "Claim-binding input is invalid.");
    const repository = input.resolvedRepository;
    if (!exact(repository, ["repoRoot", "gitCommonDir", "controlRoot", "registrationCommit"])
      || !isAbsolute(repository.repoRoot) || !isAbsolute(repository.gitCommonDir)
      || !OID.test(repository.registrationCommit ?? "") || !PACKET.test(input.packetId ?? "")
      || !candidate(input.expectedCandidate)) fail("CVL-COURSE-INPUT", "Claim-binding repository is invalid.");
    const root = realpathSync(repository.repoRoot);
    const common = realpathSync(resolve(root, courseGitBytes(root, ["rev-parse", "--git-common-dir"]).toString("utf8").trim()));
    if (root !== repository.repoRoot || common !== repository.gitCommonDir
      || repository.controlRoot !== join(common, "agent-pipeline", "critic-packets")) fail("CVL-COURSE-INPUT", "Claim journal boundary differs.");
    const actual = readConsumedSessionAdmission({ controlRoot: repository.controlRoot, packetId: input.packetId });
    validateSessionCriticResult(actual.result, actual.packet);
    validateSessionCriticReceipt(actual.receipt);
    if (canonicalCourseJson(sessionCriticReceiptForResult(actual.result)) !== canonicalCourseJson(actual.receipt)
      || actual.packet.candidate.commit !== input.expectedCandidate.commit
      || actual.packet.candidate.tree !== input.expectedCandidate.tree) fail("CVL-COURSE-BINDING", "Consumed claim candidate/result differs.");
    return Object.freeze({ ok: true, value: Object.freeze({
      courseSourceSha256: actual.admission.courseSourceSha256,
      courseDecisionSha256: actual.admission.courseDecisionSha256,
      preflightSha256: actual.admission.preflightSha256,
      admissionSha256: sha256Canonical(actual.admission) }) });
  } catch (error) {
    return Object.freeze({ ok: false, status: error?.code === "ENOENT" || error?.code === "CPP-ABSENT"
      || /UNAVAILABLE/u.test(error?.code ?? "") ? "unavailable" : "refused",
      code: /^(?:CVL|CPP|SCF)-/u.test(error?.code ?? "") ? error.code : "CVL-COURSE-INVALID" });
  }
}
