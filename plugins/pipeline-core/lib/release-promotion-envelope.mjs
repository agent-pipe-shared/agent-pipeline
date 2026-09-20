#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * release-promotion-envelope.mjs
 *
 * Implements the versioned promotion envelope binding a substantive verified
 * candidate S to a later record-only commit R (PO Decision D1, backlog item
 * pipeline.release-evidence-promotion-repeats-full-qualification).
 *
 * It proves that:
 * 1. R changes only allowlisted evidence/reconciliation paths (recordOnlyDelta);
 * 2. S's full commit and tree OIDs match the verified candidate;
 * 3. R is an ancestor descendant of S;
 * 4. Mode inclusion allows release to satisfy push (one-way; reverse forbidden);
 * 5. Verify evidence is full release qualification on S with zero omitted suites;
 * 6. All bindings are recomputed directly from Git objects and cannot be waived.
 */

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { validateVerifySelection } from "./verify-selection.mjs";

// v2 closes the last promotion substitution seam: both records a consumer
// relies on are now supplied explicitly and security is byte-bound.
export const RELEASE_PROMOTION_SCHEMA = "pipeline.release-promotion-envelope.v2";
export const RELEASE_PROMOTION_DEFAULT_PATH = "evidence/release-promotion-latest.json";
export const SECURITY_EVIDENCE_DEFAULT_PATH = "evidence/security-latest.json";
export const MODE_INCLUSION_RULE = "release-satisfies-push";
export const MODE_INCLUSION_RULE_SHA256 = createHash("sha256").update(MODE_INCLUSION_RULE).digest("hex");

const SOURCE_QUALIFICATION_KEYS = Object.freeze([
  "mode",
  "execution",
  "verifySelectionSha256",
  "ruleSha256",
  "changedInputSha256",
  "selectedSuiteIds",
  "omittedSuiteIds",
]);
const SHA256 = /^[a-f0-9]{64}$/u;
const SUITE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sameJson(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

/**
 * Security is deliberately an input envelope rather than a parsed object:
 * the promotion binds the exact bytes a consumer re-read from its canonical
 * path.  This prevents a same-shaped replacement after the envelope exists.
 */
export function securityEvidenceBindingFromInput(input, { sourceCommit, sourceTree } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)
      || Object.keys(input).some((key) => !["path", "raw", "data"].includes(key))
      || input.path !== SECURITY_EVIDENCE_DEFAULT_PATH
      || typeof input.raw !== "string" || input.raw.length === 0) return null;
  let parsed;
  try { parsed = JSON.parse(input.raw); } catch { return null; }
  if (input.data !== undefined && !sameJson(input.data, parsed)) return null;
  const candidate = parsed?.candidate;
  if (parsed?.exitCode !== 0 || parsed?.schema !== "pipeline.security-evidence.v1"
      || candidate?.status !== "clean" || candidate?.commit !== sourceCommit
      || candidate?.tree !== sourceTree) return null;
  return {
    path: input.path,
    commit: sourceCommit,
    tree: sourceTree,
    sha256: sha256Bytes(input.raw),
  };
}

export const RECORD_ONLY_PATH_PATTERNS = Object.freeze([
  /^evidence\/.*$/u,
  /^backlog\/evidence\/.*$/u,
  /^specs\/[^/]+\/evidence\/.*$/u,
  /^specs\/[^/]+\/lifecycle\.json$/u,
  /^specs\/[^/]+\/result\.md$/u,
  /^backlog\/STATUS\.md$/u,
  /^backlog\/index\.json$/u,
  /^backlog\/transitions\.ndjson$/u,
  /^backlog\/items\/.*$/u,
  /^backlog\/PO-TOPICS\.md$/u,
  /^docs\/state\.md$/u,
  /^\.claude\/pipeline-state\.json$/u,
  /^project\/pipeline-state\.json$/u,
]);

export function isRecordOnlyPath(path) {
  if (typeof path !== "string") return false;
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//u, "");
  return RECORD_ONLY_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function digestReleasePromotionEnvelope(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function validateSourceQualification(qualification) {
  if (!qualification || typeof qualification !== "object" || Array.isArray(qualification)
      || Object.keys(qualification).length !== SOURCE_QUALIFICATION_KEYS.length
      || Object.keys(qualification).some((key) => !SOURCE_QUALIFICATION_KEYS.includes(key))
      || qualification.mode !== "release" || qualification.execution !== "full"
      || ![qualification.verifySelectionSha256, qualification.ruleSha256, qualification.changedInputSha256].every((digest) => typeof digest === "string" && SHA256.test(digest))
      || !Array.isArray(qualification.selectedSuiteIds) || qualification.selectedSuiteIds.length === 0
      || !Array.isArray(qualification.omittedSuiteIds) || qualification.omittedSuiteIds.length !== 0) return false;
  return qualification.selectedSuiteIds.every((suiteId, index) => SUITE_ID.test(suiteId)
    && (index === 0 || qualification.selectedSuiteIds[index - 1] < suiteId));
}

/**
 * Derives the immutable qualification projection from the canonical Verify
 * evidence a consumer actually read.  Creation and admission deliberately
 * share this function so an envelope cannot substitute a different valid
 * release selection after it has been written.
 */
export function sourceQualificationFromVerifyEvidence(verifyEvidence, sourceCommit) {
  if (!verifyEvidence || verifyEvidence.exitCode !== 0 || verifyEvidence.commit !== sourceCommit) return null;
  const selection = verifyEvidence.selection;
  if (!validateVerifySelection(selection) || selection.candidateCommit !== sourceCommit
      || selection.mode !== "release" || selection.execution !== "full" || selection.omittedSuiteIds.length !== 0) return null;
  const qualification = {
    mode: selection.mode,
    execution: selection.execution,
    verifySelectionSha256: selection.selectionSha256,
    ruleSha256: selection.ruleSha256,
    changedInputSha256: selection.changedInputSha256,
    selectedSuiteIds: selection.selectedSuiteIds,
    omittedSuiteIds: selection.omittedSuiteIds,
  };
  return validateSourceQualification(qualification) ? qualification : null;
}

function runGit(args, dir, deps = {}) {
  const spawn = deps.spawn ?? deps.spawnSync ?? spawnSync;
  const result = spawn("git", ["-C", dir, ...args], { encoding: "utf8" });
  if (result.status !== 0 || typeof result.stdout !== "string") return null;
  return result.stdout.trim();
}

export function computeRecordOnlyDelta(sourceCommit, recordCommit, { repoDir, deps = {} }) {
  const spawn = deps.spawn ?? deps.spawnSync ?? spawnSync;
  const result = spawn("git", ["-C", repoDir, "diff-tree", "-r", "--no-commit-id", sourceCommit, recordCommit], { encoding: "utf8" });
  if (result.status !== 0 || typeof result.stdout !== "string") {
    return { ok: false, reason: "diff-tree-failed" };
  }
  const lines = result.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  const delta = [];
  for (const line of lines) {
    // Format: :old_mode new_mode old_sha new_sha status[score]\tpath[\tnewpath]
    const tabParts = line.split("\t");
    if (tabParts.length < 2) return { ok: false, reason: "invalid-diff-tree-format", raw: line };
    const metaParts = tabParts[0].slice(1).split(" ");
    if (metaParts.length < 5) return { ok: false, reason: "invalid-diff-tree-metadata", raw: line };
    const beforeBlob = metaParts[2];
    const afterBlob = metaParts[3];
    const status = metaParts[4];
    const filePath = tabParts[1];
    if (!isRecordOnlyPath(filePath)) {
      return { ok: false, reason: "unallowlisted-record-delta", path: filePath };
    }
    if (tabParts.length > 2) {
      const newPath = tabParts[2];
      if (!isRecordOnlyPath(newPath)) {
        return { ok: false, reason: "unallowlisted-record-delta", path: newPath };
      }
      delta.push({ path: filePath, newPath, status, beforeBlob, afterBlob });
    } else {
      delta.push({ path: filePath, status, beforeBlob, afterBlob });
    }
  }
  delta.sort((a, b) => a.path.localeCompare(b.path));
  return { ok: true, delta };
}

export function createReleasePromotionEnvelope({ repoDir, sourceCommit, recordCommit, verifyEvidence, securityEvidence, deps = {} }) {
  if (typeof sourceCommit !== "string" || !sourceCommit || typeof recordCommit !== "string" || !recordCommit) {
    return { ok: false, reason: "invalid-commit-binding" };
  }
  if (sourceCommit === recordCommit) {
    return { ok: false, reason: "source-equals-record" };
  }
  const sourceOid = runGit(["rev-parse", "--verify", `${sourceCommit}^{commit}`], repoDir, deps);
  const sourceTree = runGit(["rev-parse", "--verify", `${sourceCommit}^{tree}`], repoDir, deps);
  const recordOid = runGit(["rev-parse", "--verify", `${recordCommit}^{commit}`], repoDir, deps);
  const recordTree = runGit(["rev-parse", "--verify", `${recordCommit}^{tree}`], repoDir, deps);
  if (!sourceOid || !sourceTree || !recordOid || !recordTree) {
    return { ok: false, reason: "commit-resolution-failed" };
  }
  if (sourceOid === recordOid) {
    return { ok: false, reason: "source-equals-record" };
  }

  // S must be strict ancestor of R
  const spawn = deps.spawn ?? deps.spawnSync ?? spawnSync;
  const ancestry = spawn("git", ["-C", repoDir, "merge-base", "--is-ancestor", sourceOid, recordOid], { encoding: "utf8" });
  if (ancestry.status !== 0) {
    return { ok: false, reason: "source-not-ancestor-of-record" };
  }

  // Recompute record-only delta
  const deltaResult = computeRecordOnlyDelta(sourceOid, recordOid, { repoDir, deps });
  if (!deltaResult.ok) return deltaResult;
  if (deltaResult.delta.length === 0) {
    return { ok: false, reason: "empty-delta" };
  }

  // Validate verify evidence
  if (!verifyEvidence || verifyEvidence.exitCode !== 0 || verifyEvidence.commit !== sourceOid) {
    return { ok: false, reason: "invalid-verify-evidence" };
  }
  const sourceQualification = sourceQualificationFromVerifyEvidence(verifyEvidence, sourceOid);
  if (sourceQualification === null) return { ok: false, reason: "verify-evidence-not-full-release" };

  // Security is mandatory and exact-byte bound to the canonical input path.
  const securityBinding = securityEvidenceBindingFromInput(securityEvidence, { sourceCommit: sourceOid, sourceTree });
  if (securityBinding === null) return { ok: false, reason: "invalid-security-evidence" };

  const modeInclusion = {
    rule: MODE_INCLUSION_RULE,
    ruleSha256: MODE_INCLUSION_RULE_SHA256,
    requiredBoundary: "release",
    satisfiedBoundary: "push",
  };

  const body = {
    schema: RELEASE_PROMOTION_SCHEMA,
    source: { commit: sourceOid, tree: sourceTree },
    record: { commit: recordOid, tree: recordTree },
    sourceQualification,
    recordOnlyDelta: deltaResult.delta,
    modeInclusion,
    securityEvidence: securityBinding,
  };

  const envelopeSha256 = digestReleasePromotionEnvelope(body);
  return { ok: true, envelope: Object.freeze({ ...body, envelopeSha256 }) };
}

export function validateReleasePromotionEnvelope(envelope, { repoDir, targetBoundary = "push", verifyEvidence, securityEvidence, deps = {} }) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope) || envelope.schema !== RELEASE_PROMOTION_SCHEMA) {
    return { ok: false, reason: "invalid-schema" };
  }
  const { envelopeSha256, ...body } = envelope;
  if (!envelopeSha256 || digestReleasePromotionEnvelope(body) !== envelopeSha256) {
    return { ok: false, reason: "tampered-envelope" };
  }

  // Boundary check: D1 permits release -> push only; reverse is strictly forbidden
  if (targetBoundary === "release") {
    return { ok: false, reason: "reverse-inclusion-forbidden" };
  }
  if (targetBoundary !== "push") {
    return { ok: false, reason: "unsupported-target-boundary" };
  }
  if (envelope.modeInclusion?.rule !== MODE_INCLUSION_RULE
      || envelope.modeInclusion?.ruleSha256 !== MODE_INCLUSION_RULE_SHA256
      || envelope.modeInclusion?.satisfiedBoundary !== "push"
      || envelope.modeInclusion?.requiredBoundary !== "release") {
    return { ok: false, reason: "invalid-mode-inclusion" };
  }

  // Re-verify Git objects
  const sourceOid = runGit(["rev-parse", "--verify", `${envelope.source?.commit}^{commit}`], repoDir, deps);
  const sourceTree = runGit(["rev-parse", "--verify", `${envelope.source?.commit}^{tree}`], repoDir, deps);
  const recordOid = runGit(["rev-parse", "--verify", `${envelope.record?.commit}^{commit}`], repoDir, deps);
  const recordTree = runGit(["rev-parse", "--verify", `${envelope.record?.commit}^{tree}`], repoDir, deps);

  if (!sourceOid || sourceOid !== envelope.source?.commit || !sourceTree || sourceTree !== envelope.source?.tree) {
    return { ok: false, reason: "source-object-mismatch" };
  }
  if (!recordOid || recordOid !== envelope.record?.commit || !recordTree || recordTree !== envelope.record?.tree) {
    return { ok: false, reason: "record-object-mismatch" };
  }
  if (sourceOid === recordOid) {
    return { ok: false, reason: "source-equals-record" };
  }
  if (!validateSourceQualification(envelope.sourceQualification)) {
    return { ok: false, reason: "invalid-source-qualification" };
  }
  const actualQualification = sourceQualificationFromVerifyEvidence(verifyEvidence, sourceOid);
  if (actualQualification === null) {
    return { ok: false, reason: "invalid-verify-evidence-context" };
  }
  if (canonicalJson(actualQualification) !== canonicalJson(envelope.sourceQualification)) {
    return { ok: false, reason: "source-qualification-mismatch" };
  }
  const actualSecurity = securityEvidenceBindingFromInput(securityEvidence, { sourceCommit: sourceOid, sourceTree });
  if (actualSecurity === null) return { ok: false, reason: "invalid-security-evidence-context" };
  if (!sameJson(actualSecurity, envelope.securityEvidence)) {
    return { ok: false, reason: "security-evidence-mismatch" };
  }

  // Re-verify ancestry
  const spawn = deps.spawn ?? deps.spawnSync ?? spawnSync;
  const ancestry = spawn("git", ["-C", repoDir, "merge-base", "--is-ancestor", sourceOid, recordOid], { encoding: "utf8" });
  if (ancestry.status !== 0) {
    return { ok: false, reason: "source-not-ancestor-of-record" };
  }

  // Re-verify delta
  const deltaResult = computeRecordOnlyDelta(sourceOid, recordOid, { repoDir, deps });
  if (!deltaResult.ok) return deltaResult;
  if (deltaResult.delta.length === 0) {
    return { ok: false, reason: "empty-delta" };
  }

  if (canonicalJson(deltaResult.delta) !== canonicalJson(envelope.recordOnlyDelta)) {
    return { ok: false, reason: "delta-mismatch" };
  }

  return {
    ok: true,
    sourceCommit: sourceOid,
    recordCommit: recordOid,
    envelope,
  };
}
