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
import { evaluateArchitectureFitness, evaluateNavigationCurrency } from "../scripts/architecture-fitness.mjs";
import { inspectArchitectureReentryPointer, loadMapBundle, resolveModuleForPath } from "../scripts/module-inventory.mjs";
import { readCheckpointArchitectureDebt } from "./checkpoint-push-audit.mjs";
import { inspectArchitectureDesign } from "./architecture-design.mjs";
import { loadPhysicalArchitectureMap } from "./architecture-effective-decisions.mjs";
import { inspectArchitectureDecisionContinuity } from "./architecture-decision-continuity.mjs";

export const ARCHITECTURE_ENTRY_SCHEMA = "pipeline.architecture-entry-readiness.v1";
export const ARCHITECTURE_ENTRY_SCOPE = "architecture/map/";

/** The single definition of which planning-surface paths are architecture contracts (library and guard share it). */
export function architectureTouchedContracts(paths) {
  return (Array.isArray(paths) ? paths : []).filter((candidate) => /^(architecture\/|docs\/adr\/|schemas\/)/u.test(candidate));
}

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

function proposalAction(root, inspectedDesign = null, deps = {}) {
  const design = inspectedDesign ?? (deps.inspectArchitectureDesign ?? inspectArchitectureDesign)(root);
  if (design.ok && design.status === "materialization-required") return {
    kind: "command", executable: "node",
    argv: [fileURLToPath(new URL("../scripts/pipeline-state.mjs", import.meta.url)), "materialize-architecture"],
    mutation: true, requiresConfirmation: false,
    expected: { schema: "pipeline.architecture-design-materialization.v1", statuses: ["materialized"] },
  };
  if (!design.ok && design.code === "ARCHITECTURE-DESIGN-PACKAGE-REQUIRED" && typeof design.prdPath === "string") return {
    kind: "architecture-design-required",
    prdPath: design.prdPath,
    guidance: "Complete the architecture design block in this exact PO-bound PRD, then present and approve a new final design-workflow package before materialization.",
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

function checkpointDebtRepairAction(status) {
  return {
    kind: "repair-required",
    code: "ARCHITECTURE-CHECKPOINT-DEBT-REPAIR",
    path: status === "open" ? "architecture/map/" : ".git/agent-pipeline/feature-checkpoint-audit.jsonl",
    guidance: status === "open"
      ? "Update the affected architecture concept file or map index in a descendant commit, ensure the touched contract is represented, and re-run planning readiness. A checkpoint push never grants implementation authority over unresolved map debt."
      : "Restore readable checkpoint audit evidence through the sanctioned repository recovery route, then re-run planning readiness.",
  };
}

function inspectCheckpointDebt(root, map, deps) {
  // A non-Git directory cannot have received a checkpoint push. This also
  // preserves architecture inspection for uncommitted greenfield fixtures.
  if (!existsSync(resolve(root, ".git")) && !deps.readCheckpointArchitectureDebt) {
    return { status: "clear", openCount: 0, targets: [] };
  }
  let result;
  try {
    result = (deps.readCheckpointArchitectureDebt ?? readCheckpointArchitectureDebt)({ projectDir: root });
  } catch {
    return { status: "unavailable", openCount: 0, targets: [] };
  }
  if (!result?.ok || !Array.isArray(result.debt) || !Array.isArray(result.resolvedDebt)) {
    return { status: "unavailable", openCount: 0, targets: [] };
  }
  const open = result.debt.flatMap((record) => record.stalenessDebt ?? []);
  const provisional = result.resolvedDebt.flatMap((record) => record.stalenessDebt ?? []);
  if ([...open, ...provisional].some((entry) => entry?.type !== "architecture-map-stale"
    || typeof entry.contract !== "string" || typeof entry.target !== "string")) {
    return { status: "unavailable", openCount: 0, targets: [] };
  }
  const targets = [...new Set([...open, ...provisional].map((entry) => entry.target))].sort();
  if (open.length > 0) return { status: "open", openCount: open.length, targets };
  if (provisional.length > 0) {
    let currency;
    try {
      currency = (deps.evaluateNavigationCurrency ?? evaluateNavigationCurrency)({
        rootDir: root,
        inventory: map.modules,
        touchedContracts: [...new Set(provisional.map((entry) => entry.contract))],
        mode: "planning",
      });
    } catch {
      return { status: "unavailable", openCount: provisional.length, targets };
    }
    if (currency?.outcome !== "pass") return { status: "open", openCount: provisional.length, targets };
  }
  return { status: "clear", openCount: 0, targets: [] };
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
  const disposition = design.ok && design.materializationKind !== "prospective-adr-only"
    && ["materialization-required", "materialized"].includes(design.status)
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
  const readinessFailure = (code, message, failureArtifacts, failureDisposition, fitness = null, nextAction = null) =>
    failure(root, code, message, failureArtifacts, failureDisposition, fitness,
      nextAction ?? proposalAction(root, design, deps));

  if (existsSync(resolve(root, "architecture/design-materialization.json")) && !design.ok) {
    return readinessFailure(design.code, "The architecture design no longer matches its current PO-bound package", artifacts, disposition);
  }
  if (design.ok && design.status === "materialization-required") {
    return readinessFailure("ARCHITECTURE-MATERIALIZATION-REQUIRED",
      "The exact PO-approved architecture design is valid and awaits its fixed-target materialization action",
      artifacts, disposition);
  }
  if (!design.ok && design.code === "ARCHITECTURE-DESIGN-PACKAGE-REQUIRED") {
    return readinessFailure(design.code,
      "The final package is approved; its PRD still needs the explicit architecture design block",
      artifacts, disposition);
  }
  if (!map.ok || !map.indexFileExists || !indexValid) {
    return readinessFailure(map.indexFileExists ? "ARCHITECTURE-MAP-INVALID" : "ARCHITECTURE-MAP-MISSING",
      map.indexFileExists ? "the physical architecture map is malformed or has invalid module contracts"
        : "the physical architecture map index is missing",
      artifacts, disposition);
  }
  if (fitnessModel.status !== "current") {
    return readinessFailure("ARCHITECTURE-FITNESS-MODEL-INVALID", "the physical architecture fitness model is missing, unreadable, or malformed", artifacts, disposition);
  }
  if (baseline.status !== "current") {
    return readinessFailure("ARCHITECTURE-BASELINE-INVALID", "the physical architecture baseline is missing, unreadable, or malformed", artifacts, disposition);
  }
  if (!disposition.ok) {
    return readinessFailure("ARCHITECTURE-ADOPTION-DISPOSITION-REQUIRED", disposition.error ?? "a valid scoped architecture adoption disposition is required", artifacts, disposition);
  }
  if (!reentryPointer.ok) {
    return readinessFailure(reentryPointer.code,
      "the project-owned AGENTS.md must link to architecture/map/index.md before implementation; preserve its other instructions",
      artifacts, disposition, null, {
        kind: "repair-required",
        code: "ARCHITECTURE-ENTRY-POINTER-REPAIR",
        path: "AGENTS.md",
        guidance: "Add a Markdown link to architecture/map/index.md in the physical root AGENTS.md; do not replace existing project-owned content or follow an alias. Re-run architecture entry readiness afterward.",
      });
  }

  // Checkpoint pushes are allowed to preserve interrupted work, but the next
  // planning boundary must consume their typed map debt before implementation
  // authority. The PO's adoption deferral below affects ordinary fitness
  // findings; it does not erase a debt recorded by a real checkpoint push.
  const checkpointDebt = inspectCheckpointDebt(root, map, deps);
  artifacts.checkpointDebt = checkpointDebt;
  if (checkpointDebt.status !== "clear") {
    return readinessFailure(
      checkpointDebt.status === "open" ? "ARCHITECTURE-CHECKPOINT-DEBT-OPEN" : "ARCHITECTURE-CHECKPOINT-DEBT-UNAVAILABLE",
      checkpointDebt.status === "open"
        ? "checkpoint architecture-map staleness debt remains unresolved at the next planning boundary"
        : "checkpoint architecture-map staleness debt could not be inspected",
      artifacts, disposition, null, checkpointDebtRepairAction(checkpointDebt.status));
  }

  const surface = planningSurface === undefined
    ? (design.ok && design.status === "materialized" ? design.planningSurface : deriveArchitecturePlanningSurface(root))
    : planningSurface;
  if (surface === null) {
    return readinessFailure("ARCHITECTURE-PLAN-SURFACE-MISSING", "the active PO-bound plan has no valid declared implementation surface", artifacts, disposition);
  }
  artifacts.decisionApplicability = inspectPlanningDecisionApplicability(root, surface, now, deps);

  // Explicit adoption deferral keeps decision findings observable. Enforced
  // entry, including approved designs with pending physical surfaces, must
  // propagate a blocked dependent decision before claiming readiness.
  if (disposition.disposition !== "deferred" && artifacts.decisionApplicability.status === "blocked") {
    return readinessFailure("ARCHITECTURE-DECISION-APPLICABILITY-BLOCKED",
      "a required architecture decision for the declared implementation surface is unresolved or blocked",
      artifacts, disposition, null, {
        kind: "repair-required",
        code: "ARCHITECTURE-DECISION-APPLICABILITY-REPAIR",
        guidance: "Resolve the blocked area's decision findings through its owning authority, restore any required authenticated inherited source, and re-run architecture entry readiness. Preserve the original decision/source evidence; do not substitute a map, adoption approval, or fitness PASS for it.",
      });
  }

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
      touchedContracts: architectureTouchedContracts(surface.paths),
      now,
    });
  } catch (error) {
    return readinessFailure("ARCHITECTURE-FITNESS-UNAVAILABLE", `architecture fitness evaluation failed: ${error.message}`, artifacts, disposition);
  }
  const fitnessProjection = projectPlanningFitness(fitness, {
    adoptionDisposition: disposition.disposition,
  });
  if (fitnessProjection.malformed) {
    return readinessFailure("ARCHITECTURE-FITNESS-UNAVAILABLE", "planning architecture fitness returned an incomplete or malformed outcome set", artifacts, disposition, {
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
  // Net-new ratchet (PO decision 2026-10-16 #5): the deferral covers only paths
  // that already existed; a net-new implementation path gets the full check.
  // KNOWN LIMITATION (owner: Coordinator, due 2026-10-31): "existed" is judged by on-disk existence at entry time. The
  // deferral record (architecture-adoption.mjs: schema/state/scope/decidedAt/
  // expiresAt/reviewDate/decisionRef/...) carries neither a commit nor a captured
  // path list, so a path created by an earlier implementation entry reads as
  // established at a later entry. Tightening needs the record to capture a
  // baseline commit or path list (a schema/decision change, out of this scope).
  const netNewPaths = disposition.disposition === "deferred"
    ? surface.paths.filter((candidate) => !(deps.pathExists ?? existsSync)(resolve(root, candidate)))
    : [];
  if (disposition.disposition === "deferred" && netNewPaths.length === 0) {
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
    return readinessFailure("ARCHITECTURE-FITNESS-NOT-READY", `planning architecture fitness is ${fitnessProjection.blockingOverallStatus}`, artifacts, disposition, {
      overallStatus: fitness.overallStatus,
      blockingOverallStatus: fitnessProjection.blockingOverallStatus,
      reportOnly: fitnessProjection.reportOnly,
      outcomes: fitness.outcomes,
      summary: fitness.summary,
      planningSurface: surface,
      ...(netNewPaths.length > 0 ? { netNewPaths } : {}),
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

/** Closed set of codes `greenfieldPendingFitnessAllowance` can return; one per reason. */
export const GREENFIELD_PENDING_FITNESS_CODES = Object.freeze({
  ALLOWED: "PENDING-FITNESS-ALLOWED",
  MALFORMED: "PENDING-FITNESS-INPUT-MALFORMED",
  NOT_READY: "PENDING-FITNESS-READINESS-NOT-READY",
  NOT_DESIGN_PACKAGE: "PENDING-FITNESS-NOT-DESIGN-PACKAGE",
  NOT_DEFERRED: "PENDING-FITNESS-NOT-DEFERRED",
  NO_PENDING_SURFACES: "PENDING-FITNESS-NO-PENDING-SURFACES",
  OTHER_CLASS: "PENDING-FITNESS-OTHER-CLASS",
  TARGET_NOT_PENDING: "PENDING-FITNESS-TARGET-NOT-PENDING",
  UNEXPECTED_RULE: "PENDING-FITNESS-UNEXPECTED-RULE",
  NAVIGATION_UNPROVEN: "PENDING-FITNESS-NAVIGATION-UNPROVEN",
});

// The two evaluator classes whose findings can be caused by a surface that the approved design declares but its
// implementation owner has not written yet, with the only rules that mean "absent or empty" (exactly what
// `pendingPhysicalSurfaces` measures in lib/architecture-design.mjs). `unreadable-*` is a defect, not absence.
const PENDING_SURFACE_CLASSES = new Map([
  [2, { propertyId: "contract-presence-freshness", rules: new Set(["missing-contract", "stale-contract"]) }],
  [6, { propertyId: "verification-locality", rules: new Set(["missing-verification-entry-point", "empty-verification-entry-point"]) }],
]);

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

// The two `unavailable` shapes a design-package greenfield tree always produces. These are the same shapes
// `projectPlanningFitness` already treats as report-only (class 10 uncalibrated; class 9 without an adoption
// snapshot, which a design package never carries); they are not findings and are not pending-caused.
function isReportOnlyUnavailable(outcome) {
  if (outcome.outcome !== "unavailable" || outcome.evidence?.status !== "unavailable") return false;
  if (outcome.classId === 10 && outcome.propertyId === "calibrated-friction-thresholds") {
    return Array.isArray(outcome.evidence.required)
      && outcome.evidence.required.includes("measured-calibration")
      && outcome.evidence.required.includes("explicit-threshold-promotion");
  }
  return outcome.classId === 9 && outcome.propertyId === "profile-drift"
    && outcome.details === "Valid approved-scoped authority is unavailable";
}

function decideGreenfieldPendingFitness(input) {
  const codes = GREENFIELD_PENDING_FITNESS_CODES;
  const deny = (code) => ({ allowed: false, code });
  const readiness = input?.readiness;
  const fitness = input?.fitness;
  if (!isPlainObject(readiness) || !isPlainObject(fitness) || !Array.isArray(fitness.outcomes)) return deny(codes.MALFORMED);
  const outcomes = fitness.outcomes;
  if (outcomes.some((row) => !isPlainObject(row) || !Number.isInteger(row.classId) || typeof row.propertyId !== "string"
    || typeof row.outcome !== "string" || (row.violations !== undefined && !Array.isArray(row.violations)))) return deny(codes.MALFORMED);
  if (readiness.status !== "ready") return deny(codes.NOT_READY);
  const entry = readiness.fitness;
  if (!isPlainObject(entry)) return deny(codes.MALFORMED);
  if (entry.source !== "approved-design-package") return deny(codes.NOT_DESIGN_PACKAGE);
  if (entry.overallStatus !== "deferred") return deny(codes.NOT_DEFERRED);
  const pending = entry.pendingPhysicalSurfaces;
  if (!Array.isArray(pending) || pending.some((name) => typeof name !== "string" || name === "")) return deny(codes.MALFORMED);
  if (pending.length === 0) return deny(codes.NO_PENDING_SURFACES);
  const pendingSet = new Set(pending);
  for (const row of outcomes) {
    if (row.outcome === "pass" || isReportOnlyUnavailable(row)) continue;
    if (row.outcome !== "finding") return deny(codes.OTHER_CLASS);
    if (row.classId === 7 && row.propertyId === "navigation-currency") return deny(codes.NAVIGATION_UNPROVEN);
    const kind = PENDING_SURFACE_CLASSES.get(row.classId);
    if (kind === undefined || kind.propertyId !== row.propertyId) return deny(codes.OTHER_CLASS);
    const violations = row.violations ?? [];
    if (violations.length === 0) return deny(codes.TARGET_NOT_PENDING);
    for (const violation of violations) {
      if (!isPlainObject(violation) || typeof violation.target !== "string" || !pendingSet.has(violation.target)) {
        return deny(codes.TARGET_NOT_PENDING);
      }
      if (!kind.rules.has(violation.ruleId)) return deny(codes.UNEXPECTED_RULE);
    }
  }
  return { allowed: true, code: codes.ALLOWED, pendingPhysicalSurfaces: [...pending] };
}

/**
 * Pure decision: may a greenfield tree whose only missing surfaces are its own planned contracts and
 * verification entry points enter implementation although the planning-mode fitness evaluator is not green?
 *
 * Why it exists. After approve-plan and a successful materialize-architecture, `inspectArchitectureEntryReadiness`
 * answers `ready` with `fitness: { overallStatus: "deferred", source: "approved-design-package",
 * pendingPhysicalSurfaces }` (a deferral, never a fitness PASS). The guard's planning-mode evaluator, however,
 * reports every declared-but-unwritten entry point (class 6) and contract (class 2) as a finding, and test files
 * cannot be written before implementation is entered. The guard's only readiness-based allowance requires the
 * adoption disposition `deferred`; this tree's disposition is `approved-scoped`.
 *
 * Inputs (both already computed by the caller; nothing is read, nothing is thrown):
 * - `readiness`: the result of `inspectArchitectureEntryReadiness({ rootDir, taskScope })`.
 * - `fitness`:   the result of `evaluateArchitectureFitness` in planning mode for the same root (the guard's own
 *                `architectureFitnessAuthorityVerdict` result).
 *
 * Returns `{ allowed: true, code, pendingPhysicalSurfaces }` ONLY when ALL hold:
 * 1. readiness `status === "ready"`, `fitness.source === "approved-design-package"`,
 *    `fitness.overallStatus === "deferred"` and `fitness.pendingPhysicalSurfaces` is non-empty; and
 * 2. every non-`pass` evaluator outcome is either
 *    - a `finding` of class 6 `verification-locality` (rules missing/empty-verification-entry-point) or class 2
 *      `contract-presence-freshness` (rules missing/stale-contract) whose every `violations[].target` is exactly one of
 *      the pending surfaces, or
 *    - one of the two known report-only `unavailable` shapes: class 10 uncalibrated friction thresholds and class 9
 *      profile drift without an adoption snapshot (the shapes `projectPlanningFitness` already treats as report-only).
 * Otherwise `{ allowed: false, code }`, one distinct `GREENFIELD_PENDING_FITNESS_CODES` value per reason.
 *
 * What is matched on: `outcome.classId` + `outcome.propertyId` (both must agree), `violation.ruleId` and
 * `violation.target`. Class 2 targets are the declared contract string and class 6 targets the declared entry
 * path; `"none"` (a module declaring zero entry points) is never pending and so always denies. The predicate
 * deliberately does not read `evidence.remedyComparisons`, which planning mode appends.
 *
 * Class 7 `navigation-currency` is NEVER allowed: its violation is a constant `{ ruleId: "architecture-map-stale",
 * target: "architecture/map" }` (scripts/architecture-fitness.mjs evaluateNavigationCurrency) and does not name the
 * stale touched contract, so "each stale contract is itself pending" cannot be proven from these inputs. A real
 * pending-only tree does not trigger it (its touched contracts are already in the owning module's
 * `publicContracts`); a tree that does trigger it has genuine map staleness. Allowing it would require the
 * evaluator to name the contract, which is outside this function.
 *
 * SINGLE INTENDED CALL SITE (protected change, mechanical): `architectureFitnessAuthorityVerdict` in
 * lib/guard/entry-gates.mjs, next to the existing deferred-adoption allowance, inside the same try block and
 * after `const scope = ...` is validated. The existing allowance is conditioned on `adoption.disposition ===
 * "deferred"`; this one must sit OUTSIDE that condition because a design-package tree is `approved-scoped`:
 *
 *   // import { greenfieldPendingFitnessAllowance, inspectArchitectureEntryReadiness } from "../architecture-entry-readiness.mjs";
 *   const pendingEntry = (dependencies.inspectArchitectureEntryReadinessFn ?? inspectArchitectureEntryReadiness)({
 *     rootDir: root,
 *     taskScope: scope,
 *   });
 *   if (greenfieldPendingFitnessAllowance({ readiness: pendingEntry, fitness }).allowed) return null;
 *
 * i.e. three statements, placed immediately after the `if (adoption?.ok === true && adoption.disposition ===
 * "deferred") { ... }` block and still inside `if (typeof scope === "string" && scope.trim() !== "")`, with the
 * `fitness` variable already computed above (the guard's own planning-mode result, identical to the inputs the pin
 * lib/pins/greenfield-implementation-entry-with-pending-verification-surfaces.test.mjs uses). Any throw is caught by
 * the existing `catch { /* unchanged denial below *\/ }`, so a failure keeps the denial.
 *
 * The call must stay INSIDE the guard's standing `fitness.overallStatus !== "unavailable" && !== "unknown"` condition
 * (entry-gates ~172-175); do not relax it. Consequence, stated so it is not mistaken for end-to-end admission: a tree
 * whose evaluator yields only report-only unavailable classes (no class 2/6 finding, so overallStatus `unavailable`)
 * is allowed by THIS predicate but is still denied by that standing policy. The case this unblocks is the one with a
 * planned entry point missing: a class 6 finding makes overallStatus `blocked`, which reaches the call.
 */
export function greenfieldPendingFitnessAllowance(input) {
  try {
    return decideGreenfieldPendingFitness(input);
  } catch {
    return { allowed: false, code: GREENFIELD_PENDING_FITNESS_CODES.MALFORMED };
  }
}
