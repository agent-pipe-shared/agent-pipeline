// SPDX-License-Identifier: SUL-1.0
/** AC-19 composition of project ADRs with the #9-validated inherited feed. */
import { createHash } from "node:crypto";
import { canonical } from "./po-approval-proof.mjs";
import { inspectEffectiveArchitectureDecisions } from "./architecture-effective-decisions.mjs";
import { inspectConfiguredOrganizationArchitectureSources } from "./organization-architecture-source-store.mjs";
import { inspectArchitectureDecisionWaivers } from "./architecture-decision-waiver-store.mjs";

export const ARCHITECTURE_DECISION_CONTINUITY_SCHEMA = "pipeline.architecture-decision-continuity.v1";
const sha = (value) => createHash("sha256").update(canonical(value)).digest("hex");
const fail = (code, area, findings) => ({ schema: ARCHITECTURE_DECISION_CONTINUITY_SCHEMA,
  status: "blocked", code, area, decisions: [], activeExceptions: [],
  sourceBindings: [], findings, projectionSha256: null });

/** Compose only outputs revalidated by their own owners; never choose a winner on conflict. */
export function composeArchitectureDecisionContinuity({ local, inherited, area,
  waivers = { status: "ready", waivers: [], findings: [] } } = {}) {
  if (typeof area !== "string" || !local || !inherited || local.area !== area
    || local.status === "blocked" || inherited.status === "blocked"
    || !Array.isArray(local.decisions) || !Array.isArray(local.activeExceptions)
    || !Array.isArray(local.findings) || !Array.isArray(inherited.decisions)
    || !Array.isArray(inherited.sourceBindings) || !Array.isArray(inherited.findings)
    || waivers.status === "blocked" || !Array.isArray(waivers.waivers)
    || !Array.isArray(waivers.findings)
    || typeof local.projectionSha256 !== "string") {
    return fail("ARCH-CONTINUITY-SOURCE-UNRESOLVED", area ?? null,
      [{ code: "source-unresolved" }]);
  }
  const inheritedForArea = inherited.decisions.filter((decision) => Array.isArray(decision.moduleIds)
    && decision.moduleIds.includes(area));
  const decisions = [
    ...local.decisions.map((decision) => ({ ...decision, layer: "project" })),
    ...inheritedForArea.map((decision) => ({ ...decision, moduleIds: [...decision.moduleIds] })),
  ].sort((left, right) => left.id.localeCompare(right.id) || left.layer.localeCompare(right.layer));
  const findings = [
    ...local.findings.map((entry) => ({ ...entry, owner: "project" })),
    ...inherited.findings.map((entry) => ({ ...entry, owner: "organization-policy" })),
    ...waivers.findings.map((entry) => ({ ...entry, owner: "project-waivers" })),
  ];
  const activeExceptions = [...local.activeExceptions];
  const byId = new Map();
  for (const decision of decisions) {
    const earlier = byId.get(decision.id);
    if (earlier && earlier.digest !== decision.digest) {
      const inheritedDecision = [earlier, decision].find((entry) => entry.layer !== "project");
      const projectDecision = [earlier, decision].find((entry) => entry.layer === "project");
      const waiver = inheritedDecision && projectDecision && waivers.waivers.find((entry) =>
        entry.decisionId === inheritedDecision.id && entry.decisionDigest === inheritedDecision.digest
        && entry.moduleIds.includes(area));
      if (waiver) activeExceptions.push({ id: waiver.id, decisionId: waiver.decisionId,
        decisionDigest: waiver.decisionDigest, moduleIds: [...waiver.moduleIds],
        expiresAt: waiver.expiresAt, rationaleSha256: waiver.rationaleSha256 });
      else findings.push({ code: "architecture-decision-authority-conflict", owner: "composition",
        id: decision.id });
    } else if (!earlier) byId.set(decision.id, decision);
  }
  if (findings.some((entry) => entry.code === "architecture-decision-authority-conflict")) {
    return fail("ARCH-CONTINUITY-CONFLICT", area, findings);
  }
  const status = local.status === "advisory" || inherited.status === "advisory"
    || waivers.status === "advisory" ? "advisory" : "ready";
  const subject = { schema: ARCHITECTURE_DECISION_CONTINUITY_SCHEMA, status, area,
    decisions, activeExceptions: activeExceptions.sort((left, right) => left.id.localeCompare(right.id)),
    sourceBindings: inherited.sourceBindings.map((entry) => ({ ...entry })), findings };
  return { ...subject, code: status === "ready" ? "ARCH-CONTINUITY-READY" : "ARCH-CONTINUITY-ADVISORY",
    projectionSha256: sha(subject) };
}

/** Production reader: project-local validation and #9 private-source readback. */
export function inspectArchitectureDecisionContinuity({ rootDir, area, now = new Date().toISOString(),
  gitCommonDir } = {}, dependencies = {}) {
  const local = (dependencies.inspectLocal ?? inspectEffectiveArchitectureDecisions)({ rootDir, area, now });
  const inherited = (dependencies.inspectInherited ?? inspectConfiguredOrganizationArchitectureSources)({
    rootDir, now, gitCommonDir,
  });
  const waivers = (dependencies.inspectWaivers ?? inspectArchitectureDecisionWaivers)({ rootDir, now });
  return composeArchitectureDecisionContinuity({ local, inherited, waivers, area });
}

export function compareArchitectureDecisionContinuity(left, right) {
  if (left?.schema !== ARCHITECTURE_DECISION_CONTINUITY_SCHEMA
    || right?.schema !== ARCHITECTURE_DECISION_CONTINUITY_SCHEMA
    || !["ready", "advisory"].includes(left.status)
    || !["ready", "advisory"].includes(right.status) || left.area !== right.area) {
    return { ok: false, code: "ARCH-CONTINUITY-PARITY-UNRESOLVED" };
  }
  const valid = (value) => {
    const { code, projectionSha256, ...subject } = value;
    return projectionSha256 === sha(subject)
      && code === (value.status === "ready" ? "ARCH-CONTINUITY-READY" : "ARCH-CONTINUITY-ADVISORY");
  };
  if (!valid(left) || !valid(right)) return { ok: false, code: "ARCH-CONTINUITY-PARITY-UNRESOLVED" };
  return left.projectionSha256 === right.projectionSha256
    ? { ok: true, code: "ARCH-CONTINUITY-PARITY-MATCH", projectionSha256: left.projectionSha256 }
    : { ok: false, code: "ARCH-CONTINUITY-PARITY-DIVERGENCE" };
}
