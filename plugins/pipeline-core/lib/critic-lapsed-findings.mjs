// SPDX-License-Identifier: SUL-1.0
/**
 * C29 (Claude greenfield run 3, L1; PO tile 2026-11-13, mechanical route): an earlier Critic blocker or major that the course carries
 * to the close without a correction anyone reviewed.
 *
 * The retained lineage marks every open finding of the parent "fixed" as soon as a later round passes (lib/critic-review-lineage.mjs).
 * A delta round over docs or evidence alone can pass, and the earlier blocker then read as fixed without any correction of what it
 * named: the run closed a feature with two round-1 majors that no acceptance question named. This module reads the same retained course
 * and names those findings; it never rewrites the lineage (its records are immutable and validated).
 *
 * A finding of severity critical/high (blocker/major) of an earlier round is UNRESOLVED when
 *   - a later round marked it fixed, and neither that round nor any reviewed round after it changed a product path outside the
 *     Spec text, evidence and administration (lib/close-commit-split.mjs isCorrectionPath), or
 *   - the latest round still carries it open (a later round that failed only on its own minors, accepted by the PO, ends the course).
 * It is DISPOSITIONED instead when an applied, registered Spec addendum (ADR-0095, PO-approved) names it: that is the sanctioned
 * correction of a Spec defect, and it changes no code. An unresolved major is SETTLED by a PO residual acceptance of its origin round
 * with the uncorrectable-past-authorship reason class, verified through the configured approval mode; a blocker never.
 *
 * Read-only. The close stops on an unresolved finding that is not settled; the acceptance question names the settled ones.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { isCorrectionPath } from "./close-commit-split.mjs";
import { canonicalJson, readConsumedCandidateResult, sha256 } from "./critic-packet-preflight-read.mjs";
import { sha256Canonical } from "./review-economy.mjs";
import { resolveRetainedCriticCourseRecords } from "./critic-course-admission.mjs";
import { loadResidualAcceptanceDepsForPacket } from "./critic-verify-readiness-read.mjs";
import { RESIDUAL_REASON_CLASS } from "./critic-verify-lifecycle.mjs";
import { readSpecAddenda } from "./spec-addendum.mjs";

export const CRITIC_LAPSED_FINDINGS_SCHEMA = "pipeline.critic-lapsed-findings.v1";
const SEVERITY = Object.freeze({ critical: "blocker", high: "major" });
const REVIEWED = new Set(["no-findings", "findings"]);
const ORIGIN = /^CRF-([a-f0-9]{32})-\d+$/u;

const entry = (finding, prior, reviewId, state) => Object.freeze({
  findingId: finding.id,
  severity: SEVERITY[prior.severity],
  originPacketId: ORIGIN.exec(finding.id)?.[1] ?? null,
  // The digest of the raw finding as its own round recorded it (the residual acceptance binds the same digest).
  evidenceSha256: typeof prior.evidenceSha256 === "string" ? prior.evidenceSha256 : null,
  state, // "marked-fixed-without-code" or "still-open"
  reviewId,
});

/**
 * Pure: the unresolved blocker/major findings of an ordered (oldest first) retained course. `dispositioned` holds finding ids an applied
 * Spec addendum names.
 */
export function lapsedCriticFindings({ history, featureId, dispositioned = [] }) {
  if (!Array.isArray(history) || history.length === 0) return [];
  const settledByAddendum = new Set(dispositioned);
  const codeRound = (record) => REVIEWED.has(record?.verdict?.status)
    && (record?.diff?.changedPaths ?? []).some((path) => isCorrectionPath(path, featureId));
  const lapsed = [];
  for (let index = 1; index < history.length; index += 1) {
    const parent = new Map((history[index - 1]?.findings ?? []).map((finding) => [finding.id, finding]));
    for (const finding of history[index]?.findings ?? []) {
      const prior = finding?.priorFindingId === null || finding?.priorFindingId === undefined ? null : parent.get(finding.priorFindingId);
      if (finding?.status !== "fixed" || prior?.status !== "open" || !Object.hasOwn(SEVERITY, prior.severity)) continue;
      if (settledByAddendum.has(finding.id) || history.slice(index).some(codeRound)) continue;
      lapsed.push(entry(finding, prior, history[index].reviewId, "marked-fixed-without-code"));
    }
  }
  const latest = history.at(-1);
  if (history.length > 1) {
    for (const finding of latest?.findings ?? []) {
      if (finding?.status !== "open" || finding.priorFindingId === null || finding.priorFindingId === undefined
        || !Object.hasOwn(SEVERITY, finding.severity) || settledByAddendum.has(finding.id)) continue;
      lapsed.push(entry(finding, finding, latest.reviewId, "still-open"));
    }
  }
  return lapsed;
}

/**
 * True when a recorded PO residual acceptance of the finding's origin round settles it: a major only, the reason class named, the
 * finding's own digest in the accepted list, and the record verified through the configured approval mode. A blocker never.
 */
export function lapsedFindingSettled(finding, { gitCommonDir, projectDir = null, loadFn = loadResidualAcceptanceDepsForPacket, readRawFindingsFn = readOriginRawFindings } = {}) {
  if (finding?.severity !== "major" || finding.originPacketId === null || finding.evidenceSha256 === null) return false;
  // The lineage and the residual acceptance hash the same raw finding with different canonical forms: join through the origin round's raw finding.
  const index = Number(/-(\d+)$/u.exec(finding.findingId)?.[1]) - 1;
  const raw = (readRawFindingsFn({ gitCommonDir, packetId: finding.originPacketId }) ?? [])[index];
  if (raw === undefined || sha256Canonical(raw) !== finding.evidenceSha256) return false;
  const residualId = sha256(canonicalJson(raw));
  const deps = loadFn({ gitCommonDir, projectDir, criticPacketId: finding.originPacketId });
  const accepted = deps?.residualAcceptance;
  if (accepted?.reasonClass !== RESIDUAL_REASON_CLASS || !Array.isArray(accepted.findings)
    || !accepted.findings.some((row) => row?.id === residualId) || typeof deps.verifyResidualAcceptanceFn !== "function") return false;
  const verdict = deps.verifyResidualAcceptanceFn({ acceptance: accepted, candidate: accepted.candidate, criticReceiptSha256: accepted.criticReceiptSha256,
    findings: accepted.findings, reasonClass: accepted.reasonClass });
  return verdict?.authorized === true;
}

/** The raw findings of a consumed Critic round, as its private packet holds them. */
export function readOriginRawFindings({ gitCommonDir, packetId }) {
  const findings = readConsumedCandidateResult({ controlRoot: join(gitCommonDir, "agent-pipeline", "critic-packets"), packetId }).result?.verdict?.findings;
  return Array.isArray(findings) ? findings : [];
}

/** The finding ids the applied, registered Spec addenda of the package at `commit` name (ADR-0095). Unreadable: none. */
export function addendumDispositionedFindingIds({ repoRoot, featureId, commit }) {
  const show = (path) => {
    const result = spawnSync("git", ["-C", repoRoot, "show", `${commit}:${path}`], { encoding: null, shell: false, timeout: 10_000, maxBuffer: 16 * 1024 * 1024 });
    if (result.error || result.status !== 0) throw new Error("unreadable");
    return result.stdout;
  };
  try {
    const manifest = JSON.parse(show(`specs/${featureId}/lifecycle.json`).toString("utf8"));
    const read = readSpecAddenda({ root: repoRoot, featureId, manifest, read: show });
    return (read.applied ?? []).flatMap((addendum) => (Array.isArray(addendum.findingIds) ? addendum.findingIds : []));
  } catch { return []; }
}

/**
 * Read the retained course of `featureId` at `candidateCommit` and split its unresolved findings into open and settled.
 * A course that cannot be read is `unavailable` (the close keeps its own course-evidence checks); never throws.
 */
export function readLapsedCriticFindings({ repoRoot, featureId, candidateCommit, gitCommonDir, projectDir = null, boundPacketId = null,
  resolveFn = resolveRetainedCriticCourseRecords, loadFn = loadResidualAcceptanceDepsForPacket, dispositionedFn = addendumDispositionedFindingIds, readRawFindingsFn = readOriginRawFindings } = {}) {
  const unavailable = (reason) => Object.freeze({ schema: CRITIC_LAPSED_FINDINGS_SCHEMA, status: "unavailable", reason: String(reason).slice(0, 200), open: [], settled: [] });
  let history;
  try { history = resolveFn({ repoRoot, featureId, candidateCommit }).history; } catch (error) { return unavailable(error?.message ?? error); }
  // A pre-check bound to a round whose lineage is not registered yet would judge the course without that round; the close's own check reads it later.
  if (boundPacketId !== null && history.length > 0 && history.at(-1)?.request?.packetId !== boundPacketId) return unavailable("the bound Critic round is not the last registered round yet");
  let dispositioned = [];
  try { dispositioned = dispositionedFn({ repoRoot, featureId, commit: candidateCommit }); } catch { dispositioned = []; }
  const open = [];
  const settled = [];
  for (const finding of lapsedCriticFindings({ history, featureId, dispositioned })) {
    let ok = false;
    try { ok = lapsedFindingSettled(finding, { gitCommonDir, projectDir, loadFn, readRawFindingsFn }); } catch { ok = false; }
    (ok ? settled : open).push(finding);
  }
  return Object.freeze({ schema: CRITIC_LAPSED_FINDINGS_SCHEMA, status: open.length > 0 ? "open" : "clear", open, settled });
}

/** One phrase per finding, for a stop text or the acceptance question. */
export function describeLapsedFinding(finding) {
  return `${finding.severity} ${finding.findingId}${finding.originPacketId === null ? "" : ` (raised in Critic round ${finding.originPacketId})`}${finding.state === "still-open" ? ", still open" : ", marked fixed by a round that changed only the Spec text, evidence or administration"}`;
}

/** The repair a close names for open unresolved findings. */
export function lapsedFindingsRepair({ open, stateWriter = "pipeline-state.mjs" }) {
  const majors = open.filter((finding) => finding.severity === "major" && finding.originPacketId !== null);
  const packets = [...new Set(majors.map((finding) => finding.originPacketId))];
  return `correct the named findings through a dispatch and run a Critic delta round over that change: a change of the product (code, tests, configuration), or, for a defect of the Spec itself, an approved and registered Spec addendum that names the finding (ADR-0095); a later round that only changed the Spec text, evidence or administration does not count as a correction. A blocker can never be accepted.${packets.length === 0 ? "" : ` A major that no commit can correct may instead be accepted by the PO in the PO's own attended step: ${packets.map((packet) => `node ${stateWriter} approve-residual-acceptance --by <name> --critic-packet ${packet} --reason-class ${RESIDUAL_REASON_CLASS}`).join("; ")}.`}`;
}
