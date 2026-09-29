// SPDX-License-Identifier: SUL-1.0

/**
 * Shared implementation-entry predicate for the architecture contract.
 *
 * This is deliberately read-only. Adoption authority answers whether a
 * scoped disposition exists; module inventory, fitness model, baseline, and
 * fitness evaluation answer whether the physical architecture evidence is
 * actually present and valid. One cannot substitute for the other.
 */
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkPlanningAdoptionDisposition,
  generateAdoptionProposal,
  resolveAdoptionState,
} from "../scripts/architecture-adoption.mjs";
import { evaluateArchitectureFitness } from "../scripts/architecture-fitness.mjs";
import { inspectArchitectureReentryPointer, loadMapBundle, resolveModuleForPath } from "../scripts/module-inventory.mjs";
import { inspectArchitectureDesign } from "./architecture-design.mjs";
import { loadPhysicalArchitectureMap } from "./architecture-effective-decisions.mjs";
import { inspectArchitectureDecisionContinuity } from "./architecture-decision-continuity.mjs";

export const ARCHITECTURE_ENTRY_SCHEMA = "pipeline.architecture-entry-readiness.v1";
export const ARCHITECTURE_ENTRY_SCOPE = "architecture/map/";

const ARCHITECTURE_ADOPTION_SCRIPT = fileURLToPath(new URL("../scripts/architecture-adoption.mjs", import.meta.url));
const PLAN_PATH_TOKEN = /(?:^|[\s`"'([{])((?:(?:\.claude|app|architecture|backlog|bin|config|docs|governance|harness|lib|plugins|policies|project|roles|schemas|scripts|specs|src|templates|test|tests)\/[A-Za-z0-9_@+./-]+)|(?:package(?:-lock)?\.json|pnpm-lock\.yaml|yarn-lock\.yaml|pipeline-manifest\.schema\.json|pipeline\.user\.schema\.json))/gmu;

export function deriveArchitecturePlanningSurface(rootDir, read = readFileSync) {
  const root = resolve(rootDir);
  let state;
  for (const relState of ["project/pipeline-state.json", ".claude/pipeline-state.json"]) {
    try {
      const candidate = JSON.parse(read(resolve(root, relState), "utf8"));
      if (candidate?.activeFeature?.planPath) { state = candidate; break; }
      if (!state) state = candidate;
    } catch { /* try next layout */ }
  }
  if (!state) return null;
  const planPath = state?.activeFeature?.planPath;
  if (typeof planPath !== "string" || planPath.trim() === "" || planPath.includes("\0")
    || planPath.startsWith("/") || planPath.includes("\\")
    || planPath.split("/").some((part) => part === "" || part === "." || part === "..")) return null;
  const plan = resolve(root, planPath);
  const planRelative = relative(root, plan);
  if (planRelative === "" || planRelative.startsWith(`..${sep}`) || planRelative.startsWith("..\\") || planRelative.includes("\0")) return null;
  let source;
  try { source = read(plan, "utf8"); } catch { return null; }
  const paths = new Set();
  for (const match of source.matchAll(PLAN_PATH_TOKEN)) {
    const candidate = match[1].replace(/[),.;:\]}`]+$/u, "");
    if (candidate.length > 0 && !candidate.split("/").some((part) => part === "" || part === "." || part === "..")) paths.add(candidate);
  }
  return paths.size > 0 ? { planPath, paths: [...paths].sort() } : null;
}

function physicalJson(root, relativePath, expectedSchema, validShape) {
  const path = resolve(root, relativePath);
  if (!existsSync(path)) return { status: "missing", path, schema: expectedSchema };
  try {
    if (!lstatSync(path).isFile()) return { status: "invalid", path, schema: expectedSchema };
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)
      || parsed.schema !== expectedSchema || (validShape && !validShape(parsed))) {
      return { status: "invalid", path, schema: expectedSchema };
    }
    return { status: "current", path, schema: expectedSchema };
  } catch {
    return { status: "unavailable", path, schema: expectedSchema };
  }
}

function proposalAction(root) {
  const design = inspectArchitectureDesign(root);
  if (design.ok && design.status === "materialization-required") return {
    kind: "command", executable: "node",
    argv: [fileURLToPath(new URL("../scripts/pipeline-state.mjs", import.meta.url)), "materialize-architecture"],
    mutation: true, requiresConfirmation: false,
    expected: { schema: "pipeline.architecture-design-materialization.v1", statuses: ["materialized"] },
  };
  let proposal = null;
  try { proposal = generateAdoptionProposal(root); } catch { /* the primary refusal remains authoritative */ }
  return {
    kind: "collect-input",
    input: { name: "architecture-adoption-disposition", encoding: "utf8", trim: true, minBytes: 1, maxBytes: 128, singleLine: true, rejectNul: true },
    guidance: "Complete the governed architecture design before approval. A greenfield PRD includes one explicit pipeline-architecture-design package and scoped disposition in the normal PO decision. Existing repositories require the attached read-only adoption proposal and explicit PO disposition; bootstrap never invents or adopts their map.",
    designCode: design.code ?? null,
    proposal,
    proposalSchema: "pipeline.adoption-proposal.v1",
    proposalSource: ARCHITECTURE_ADOPTION_SCRIPT,
  };
}

function failure(root, code, message, artifacts, disposition, fitness = null, nextAction = null) {
  return {
    schema: ARCHITECTURE_ENTRY_SCHEMA,
    status: "blocked",
    root,
    code,
    message,
    artifacts,
    disposition,
    fitness,
    nextAction: nextAction ?? proposalAction(root),
  };
}

function projectPlanningFitness(fitness, { adoptionDisposition = null } = {}) {
  const outcomes = Array.isArray(fitness?.outcomes) ? fitness.outcomes : [];
  const expectedClasses = new Set(Array.from({ length: 10 }, (_, index) => index + 1));
  const seenClasses = new Set();
  const knownOutcomes = new Set(["pass", "finding", "excepted", "unavailable", "unsupported", "unknown"]);
  const malformed = outcomes.length !== 10 || outcomes.some((outcome) => {
    if (!Number.isInteger(outcome?.classId) || !expectedClasses.has(outcome.classId)
      || seenClasses.has(outcome.classId) || !knownOutcomes.has(outcome.outcome)) return true;
    seenClasses.add(outcome.classId);
    return false;
  });
  if (malformed || seenClasses.size !== 10) {
    return { blockingOverallStatus: "unavailable", reportOnly: [], malformed: true };
  }
  const reportOnly = outcomes.filter((outcome) => (
    outcome.classId === 10
      && outcome.outcome === "unavailable"
      && outcome.evidence?.status === "unavailable"
      && Array.isArray(outcome.evidence?.required)
      && outcome.evidence.required.includes("measured-calibration")
      && outcome.evidence.required.includes("explicit-threshold-promotion")
  ) || (
    // A PO-authorized deferral honestly has no approved-scoped snapshot to
    // compare.  That makes profile-drift observation unavailable, not a
    // reason to negate the PO's explicit deferral.  Findings remain blocking.
    adoptionDisposition === "deferred"
      && outcome.classId === 9
      && outcome.outcome === "unavailable"
      && outcome.evidence?.status === "unavailable"
      && outcome.details === "Valid approved-scoped authority is unavailable"
  ));
  const blocking = outcomes.filter((outcome) => !reportOnly.includes(outcome));
  let blockingOverallStatus = "pass";
  if (blocking.some((outcome) => outcome.outcome === "finding")) blockingOverallStatus = "blocked";
  else if (blocking.some((outcome) => outcome.outcome === "unavailable")) blockingOverallStatus = "unavailable";
  else if (blocking.some((outcome) => outcome.outcome === "excepted")) blockingOverallStatus = "excepted";
  else if (blocking.some((outcome) => outcome.outcome === "unknown")) blockingOverallStatus = "unknown";
  else if (blocking.some((outcome) => outcome.outcome === "unsupported")) blockingOverallStatus = "unsupported";
  return { blockingOverallStatus, reportOnly, malformed: false };
}

/** Expose task-scoped decisions without assigning unknown paths or promoting legacy ADRs. */
export function inspectPlanningDecisionApplicability(root, surface, now,
  { loadPhysicalMap = loadPhysicalArchitectureMap,
    inspectDecisions = inspectArchitectureDecisionContinuity } = {}) {
  const paths = Array.isArray(surface?.paths) ? surface.paths : [];
  const observedAt = now instanceof Date && Number.isFinite(now.getTime())
    ? now.toISOString() : null;
  if (observedAt === null) return { status: "unavailable", areas: [],
    unresolvedPaths: [...paths], code: "ARCH-DECISION-CLOCK-UNAVAILABLE" };
  let inventory;
  try { inventory = loadPhysicalMap(root); } catch { inventory = null; }
  if (!inventory) return { status: "unavailable", areas: [], unresolvedPaths: [...paths],
    code: "ARCH-DECISION-MODULE-INVENTORY-UNAVAILABLE" };
  const areas = new Set();
  const unresolvedPaths = [];
  for (const path of paths) {
    let owner = null;
    try { owner = typeof path === "string" ? resolveModuleForPath(path, inventory) : null; }
    catch { /* an invalid optional path is a diagnostic, not module authority */ }
    if (owner) areas.add(owner.id);
    else unresolvedPaths.push(path);
  }
  const projections = [...areas].sort().map((area) => {
    try { return inspectDecisions({ rootDir: root, area, now: observedAt }); }
    catch { return { area, status: "blocked", code: "ARCH-DECISION-SOURCE-UNAVAILABLE",
      decisions: [], findings: [], projectionSha256: null }; }
  });
  return {
    status: projections.some((item) => item.status === "blocked") ? "blocked"
      : projections.some((item) => item.status === "advisory") || unresolvedPaths.length > 0
        ? "advisory" : "ready",
    areas: projections,
    unresolvedPaths,
  };
}

export function summarizePlanningDecisionApplicability(value) {
  if (!value || !Array.isArray(value.areas) || !Array.isArray(value.unresolvedPaths)) return null;
  return {
    schema: "pipeline.architecture-planning-decisions.v1",
    status: value.status,
    areas: value.areas.map((item) => ({ area: item.area, status: item.status,
      decisions: Array.isArray(item.decisions)
        ? item.decisions.map(({ id, digest: decisionSha256, path }) => ({ id, decisionSha256, path })) : [],
      findingCount: Array.isArray(item.findings) ? item.findings.length : 0 })),
    unresolvedPaths: value.unresolvedPaths,
  };
}

/**
 * Inspect the evidence required before a project enters implementation.
 * `taskScope` is intentionally optional; callers entering the shared project
 * lifecycle check the architecture-map disposition itself, while tests and
 * other readers may bind a narrower task scope explicitly.
 */
export function inspectArchitectureEntryReadiness({ rootDir = process.cwd(), taskScope = null, planningSurface = undefined, now = new Date(), deps = {} } = {}) {
  const root = resolve(rootDir);
  const adoption = (deps.resolveAdoptionState ?? resolveAdoptionState)(root, now);
  const design = (deps.inspectArchitectureDesign ?? inspectArchitectureDesign)(root, taskScope);
  const disposition = design.ok && design.status === "materialized"
    ? { ok: true, disposition: design.disposition, scope: design.scope, authority: design.authority }
    : (deps.checkPlanningAdoptionDisposition ?? checkPlanningAdoptionDisposition)(root, taskScope, now);
  const map = loadMapBundle(root);
  const reentryPointer = inspectArchitectureReentryPointer(root);
  const fitnessModel = physicalJson(root, "architecture/fitness-model.json", "pipeline.fitness-model.v1", (value) =>
    typeof value.profileId === "string"
    && Number.isInteger(value.revision) && value.revision > 0
    && Array.isArray(value.modules)
    && Array.isArray(value.allowedBoundaryCrossings)
    && value.antiFragmentationPolicy !== null
    && typeof value.antiFragmentationPolicy === "object"
    && !Array.isArray(value.antiFragmentationPolicy));
  const baseline = physicalJson(root, "architecture/baseline.json", "pipeline.architecture-baseline.v1", (value) =>
    Number.isInteger(value.baselineRevision) && value.baselineRevision > 0
    && Array.isArray(value.acceptedViolations)
    && value.ratchetMetrics !== null
    && typeof value.ratchetMetrics === "object"
    && !Array.isArray(value.ratchetMetrics)
    && ["totalAcceptedViolations", "cycleCount", "boundaryCrossingsCount"].every((key) => Number.isInteger(value.ratchetMetrics[key]) && value.ratchetMetrics[key] >= 0));
  const indexPath = resolve(root, "architecture/map/index.md");
  let indexValid = false;
  try {
    const index = readFileSync(indexPath, "utf8");
    indexValid = /^# Architecture Navigation Map Index\s*$/mu.test(index)
      && /Governed Modules/u.test(index);
  } catch { /* reported as invalid/missing below */ }
  const artifacts = {
    map: {
      status: map.ok && map.indexFileExists && indexValid ? "current" : (map.indexFileExists ? "invalid" : "missing"),
      indexFileExists: map.indexFileExists,
      indexValid,
      moduleCount: map.modules.length,
      errors: [...map.errors],
    },
    reentryPointer: { status: reentryPointer.ok ? "current" : "invalid", code: reentryPointer.code, path: "AGENTS.md" },
    fitnessModel,
    baseline,
    adoption: { state: adoption.state, coverageClass: adoption.coverageClass, confidence: adoption.confidence },
  };

  if (existsSync(resolve(root, "architecture/design-materialization.json")) && !design.ok) {
    return failure(root, design.code, "The architecture design no longer matches its current PO-bound package", artifacts, disposition);
  }
  if (!map.ok || !map.indexFileExists || !indexValid) {
    return failure(root, map.indexFileExists ? "ARCHITECTURE-MAP-INVALID" : "ARCHITECTURE-MAP-MISSING",
      map.indexFileExists ? "the physical architecture map is malformed or has invalid module contracts"
        : "the physical architecture map index is missing",
      artifacts, disposition);
  }
  if (fitnessModel.status !== "current") {
    return failure(root, "ARCHITECTURE-FITNESS-MODEL-INVALID", "the physical architecture fitness model is missing, unreadable, or malformed", artifacts, disposition);
  }
  if (baseline.status !== "current") {
    return failure(root, "ARCHITECTURE-BASELINE-INVALID", "the physical architecture baseline is missing, unreadable, or malformed", artifacts, disposition);
  }
  if (!disposition.ok) {
    return failure(root, "ARCHITECTURE-ADOPTION-DISPOSITION-REQUIRED", disposition.error ?? "a valid scoped architecture adoption disposition is required", artifacts, disposition);
  }
  if (!reentryPointer.ok) {
    return failure(root, reentryPointer.code,
      "the project-owned AGENTS.md must link to architecture/map/index.md before implementation; preserve its other instructions",
      artifacts, disposition, null, {
        kind: "repair-required",
        code: "ARCHITECTURE-ENTRY-POINTER-REPAIR",
        path: "AGENTS.md",
        guidance: "Add a Markdown link to architecture/map/index.md in the physical root AGENTS.md; do not replace existing project-owned content or follow an alias. Re-run architecture entry readiness afterward.",
      });
  }

  const surface = planningSurface === undefined
    ? (design.ok && design.status === "materialized" ? design.planningSurface : deriveArchitecturePlanningSurface(root))
    : planningSurface;
  if (surface === null) {
    return failure(root, "ARCHITECTURE-PLAN-SURFACE-MISSING", "the active PO-bound plan has no valid declared implementation surface", artifacts, disposition);
  }
  artifacts.decisionApplicability = inspectPlanningDecisionApplicability(root, surface, now, deps);

  // Greenfield design may be materialized before the implementation owner writes
  // its declared contracts and tests. The approved design authorizes entry, but
  // a missing physical surface is a deferral, never a fitness PASS.
  if (design.ok && design.status === "materialized" && design.pendingPhysicalSurfaces.length > 0) return {
    schema: ARCHITECTURE_ENTRY_SCHEMA,
    status: "ready",
    root,
    code: null,
    message: "the PO-bound greenfield architecture design is materialized; physical contract and verification checks remain pending",
    artifacts,
    disposition,
    fitness: { overallStatus: "deferred", blockingOverallStatus: "deferred", source: "approved-design-package",
      planningSurface: surface, pendingPhysicalSurfaces: design.pendingPhysicalSurfaces },
    nextAction: null,
  };

  let fitness;
  try {
    fitness = (deps.evaluateArchitectureFitness ?? evaluateArchitectureFitness)({
      rootDir: root,
      mode: "planning",
      candidatePaths: surface.paths,
      files: surface.paths,
      touchedContracts: surface.paths.filter((candidate) => /^(architecture\/|docs\/adr\/|schemas\/)/u.test(candidate)),
      now,
    });
  } catch (error) {
    return failure(root, "ARCHITECTURE-FITNESS-UNAVAILABLE", `architecture fitness evaluation failed: ${error.message}`, artifacts, disposition);
  }
  const fitnessProjection = projectPlanningFitness(fitness, {
    adoptionDisposition: disposition.disposition,
  });
  if (fitnessProjection.malformed) {
    return failure(root, "ARCHITECTURE-FITNESS-UNAVAILABLE", "planning architecture fitness returned an incomplete or malformed outcome set", artifacts, disposition, {
      overallStatus: fitness.overallStatus,
      blockingOverallStatus: fitnessProjection.blockingOverallStatus,
      reportOnly: [],
      summary: fitness.summary,
      planningSurface: surface,
    });
  }
  // A deliberate PO deferral means architecture fitness is observed but not
  // enforced until the recorded review. Physical artifacts and the signed
  // disposition above remain mandatory; this never fabricates a passing
  // fitness result and keeps every outcome visible for the later adoption.
  if (disposition.disposition === "deferred") {
    return {
      schema: ARCHITECTURE_ENTRY_SCHEMA,
      status: "ready",
      root,
      code: null,
      message: "physical architecture artifacts are valid; PO-approved architecture enforcement is deferred",
      artifacts,
      disposition,
      fitness: {
        overallStatus: fitness.overallStatus,
        blockingOverallStatus: "deferred",
        reportOnly: fitness.outcomes,
        outcomes: fitness.outcomes,
        summary: fitness.summary,
      },
      nextAction: null,
    };
  }
  if (!(fitnessProjection.blockingOverallStatus === "pass" || fitnessProjection.blockingOverallStatus === "excepted")) {
    return failure(root, "ARCHITECTURE-FITNESS-NOT-READY", `planning architecture fitness is ${fitnessProjection.blockingOverallStatus}`, artifacts, disposition, {
      overallStatus: fitness.overallStatus,
      blockingOverallStatus: fitnessProjection.blockingOverallStatus,
      reportOnly: fitnessProjection.reportOnly,
      outcomes: fitness.outcomes,
      summary: fitness.summary,
      planningSurface: surface,
    });
  }

  return {
    schema: ARCHITECTURE_ENTRY_SCHEMA,
    status: "ready",
    root,
    code: null,
    message: "physical architecture map, fitness evidence, and scoped adoption disposition are ready",
    artifacts,
    disposition,
    fitness: { overallStatus: fitness.overallStatus, blockingOverallStatus: fitnessProjection.blockingOverallStatus, reportOnly: fitnessProjection.reportOnly, outcomes: fitness.outcomes, summary: fitness.summary },
    nextAction: null,
  };
}
