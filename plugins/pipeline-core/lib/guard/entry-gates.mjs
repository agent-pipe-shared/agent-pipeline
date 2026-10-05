// SPDX-License-Identifier: SUL-1.0
// Guard module "entry-gates" (layer 3), split out of guard-lifecycle-ready.mjs; declarations moved verbatim (s2-guard-split-plan.md).

import { readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { checkPlanningAdoptionDisposition } from "../../scripts/architecture-adoption.mjs";
import { evaluateArchitectureFitness } from "../../scripts/architecture-fitness.mjs";
import { inspectArchitectureEntryReadiness } from "../architecture-entry-readiness.mjs";
import { deriveMinimumRigor, inferInputsFromRepo, isContractPath, isProtectedPath, loadPolicy } from "../../scripts/rigor-floor.mjs";
import { classifyVerifyCommand } from "../../scripts/pipeline-state.mjs";
import { ARCHITECTURE_ADOPTION_DENIAL_CODE, ARCHITECTURE_FITNESS_DENIAL_CODE, MINIMUM_RIGOR_ADVISORY_CODE, PIPELINE_STATE_SCRIPT } from "./constants.mjs";
import { verdict } from "./verdict.mjs";
import { resolveSanctionedScriptInvocation } from "./sanctioned-args-scripts.mjs";

/**
 * The implementation transition is the lifecycle's authority boundary: a
 * submitted and PO-approved plan may still not authorize implementation until
 * the architecture adoption disposition for that plan's governed scope is
 * resolved. Keep this recognition closed over the same parsed argv that the
 * lifecycle-command admission already uses; a substring check would make an
 * unrelated shell command look like an authority transition.
 */
function isImplementationAuthorityTransition(command, root, dependencies = {}) {
  const invocation = resolveSanctionedScriptInvocation(command, root, dependencies);
  if (invocation === null || invocation.script !== PIPELINE_STATE_SCRIPT) return false;
  const { args } = invocation;
  return args[0] === "set-phase"
    && args[1] === "--phase"
    && args[2] === "implementation"
    && (args.length === 3
      || (args.length === 5 && args[3] === "--verify-command" && classifyVerifyCommand(args[4]) === "configured"));
}

/**
 * Reads only the active feature's already writer-owned plan path. It is the
 * authority artifact that identifies the work package at the instant
 * implementation authority is requested; accepting a caller-supplied path
 * here would let a command select an unrelated approved scope.
 */
function activeFeaturePlanningScope(root, dependencies = {}) {
  try {
    const source = (dependencies.readFileSyncFn ?? readFileSync)(join(root, "project", "pipeline-state.json"), "utf8");
    const state = JSON.parse(source);
    const planPath = state?.activeFeature?.planPath;
    return typeof planPath === "string" && planPath.trim() !== "" && !planPath.includes("\0")
      ? planPath
      : null;
  } catch {
    return null;
  }
}

/**
 * Derive the implementation surface from the writer-owned, PO-bound plan.
 *
 * A lifecycle transition must not substitute the currently dirty working tree
 * for the plan: a clean tree is normal immediately before the first dispatch.
 * The grammar is deliberately conservative and repository-relative.  A plan
 * which names no governed implementation path is not evidence of a small
 * change, so callers receive null and fail closed rather than silently
 * evaluating the Markdown plan file itself.
 */
function activeFeaturePlanningSurface(root, dependencies = {}) {
  const scope = (dependencies.activeFeaturePlanningScopeFn ?? activeFeaturePlanningScope)(root, dependencies);
  if (scope === null || isAbsolute(scope) || scope.includes("\\") || scope.split("/").some((part) => part === "" || part === "." || part === "..")) {
    return null;
  }
  const plan = resolve(root, scope);
  if (relative(root, plan).startsWith(`..${sep}`) || relative(root, plan) === "") return null;
  let source;
  try {
    source = (dependencies.readFileSyncFn ?? readFileSync)(plan, "utf8");
  } catch {
    return null;
  }
  const paths = new Set();
  const token = /(?:^|[\s`"'([{])((?:(?:\.claude|app|architecture|backlog|bin|config|docs|governance|harness|lib|plugins|policies|project|roles|schemas|scripts|specs|src|templates|test|tests)\/[A-Za-z0-9_@+./-]+)|(?:package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|pipeline-manifest\.schema\.json|pipeline\.user\.schema\.json))/gmu;
  for (const match of source.matchAll(token)) {
    const candidate = match[1].replace(/[),.;:\]}`]+$/u, "");
    if (candidate.length > 0 && !candidate.split("/").some((part) => part === "" || part === "." || part === "..")) {
      paths.add(candidate);
    }
  }
  return paths.size > 0
    ? { planPath: scope, paths: [...paths].sort() }
    : null;
}

/** Read the PO-bound lifecycle profile; never accept a caller-provided value. */
function activeFeatureSelectedProfile(root, dependencies = {}) {
  try {
    const source = (dependencies.readFileSyncFn ?? readFileSync)(join(root, "project", "pipeline-state.json"), "utf8");
    const profile = JSON.parse(source)?.planSubmission?.profile;
    return new Set(["mini", "feature", "epic"]).has(profile) ? profile : null;
  } catch {
    return null;
  }
}

export function architectureAdoptionAuthorityVerdict(root, command, dependencies = {}) {
  if (!isImplementationAuthorityTransition(command, root, dependencies)) return null;
  const scope = (dependencies.activeFeaturePlanningScopeFn ?? activeFeaturePlanningScope)(root, dependencies);
  if (scope === null) {
    return verdict(
      2,
      "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
        + `${ARCHITECTURE_ADOPTION_DENIAL_CODE}: the active feature has no valid plan path to bind an architecture adoption disposition.\n`
        + "Repair the writer-owned lifecycle state, then record the PO's scoped architecture adoption decision before requesting implementation authority.\n",
    );
  }
  let disposition;
  try {
    disposition = (dependencies.checkPlanningAdoptionDispositionFn ?? checkPlanningAdoptionDisposition)(root, scope);
  } catch {
    disposition = null;
  }
  if (disposition?.ok === true) return null;
  const detail = typeof disposition?.error === "string" && disposition.error.trim() !== ""
    ? disposition.error
    : "Architecture adoption disposition could not be resolved.";
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
      + `${ARCHITECTURE_ADOPTION_DENIAL_CODE}: ${detail}\n`
      + "Record one PO-owned approved-scoped, deferred, or partial adoption decision for the active plan scope before requesting implementation authority.\n",
  );
}

/**
 * Adoption resolves who has accepted the repository's architecture posture;
 * fitness establishes whether the active planning scope is mechanically green
 * enough to receive implementation authority. Keep the two gates separate:
 * a PO's adoption decision never turns an unavailable or failing evaluator
 * result into a pass.
 *
 * One narrow rule (operator hotfix 10): when the active plan scope's adoption
 * disposition is a PO deferral AND the writer's own library gate
 * (inspectArchitectureEntryReadiness) reports "ready" for the same root and
 * task scope -- it validates the physical map, fitness model, baseline,
 * re-entry pointer and checkpoint debt, and treats fitness as non-enforced
 * under deferral -- the fitness FINDINGS are report-only and do not block.
 * An unavailable or unknown evaluator result, a missing planning surface, any
 * other disposition, and any error while deciding all keep the denial.
 */
export function architectureFitnessAuthorityVerdict(root, command, dependencies = {}) {
  if (!isImplementationAuthorityTransition(command, root, dependencies)) return null;
  const surface = (dependencies.activeFeaturePlanningSurfaceFn ?? activeFeaturePlanningSurface)(root, dependencies);
  if (surface === null) {
    return verdict(
      2,
      "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
        + `${ARCHITECTURE_FITNESS_DENIAL_CODE}: the active plan has no valid declared implementation surface.\n`
        + "Repair the PO-bound plan path or declare repository-relative implementation paths before requesting implementation authority.\n",
    );
  }
  let fitness;
  try {
    fitness = (dependencies.evaluateArchitectureFitnessFn ?? evaluateArchitectureFitness)({
      rootDir: root,
      mode: "planning",
      candidatePaths: surface.paths,
      files: surface.paths,
      touchedContracts: surface.paths.filter(isContractPath),
    });
  } catch {
    fitness = null;
  }
  if (fitness?.overallStatus === "pass" || fitness?.overallStatus === "excepted") return null;
  // Operator hotfix 10: a complete findings-bearing fitness result under a PO-deferred
  // adoption is report-only, but only while the library entry gate agrees. Any throw,
  // any shortfall, any other disposition falls through to the unchanged denial below.
  if (fitness !== null && typeof fitness === "object"
    && typeof fitness.overallStatus === "string"
    && fitness.overallStatus !== "unavailable" && fitness.overallStatus !== "unknown"
    && Array.isArray(fitness.outcomes)) {
    try {
      const scope = (dependencies.activeFeaturePlanningScopeFn ?? activeFeaturePlanningScope)(root, dependencies);
      if (typeof scope === "string" && scope.trim() !== "") {
        const adoption = (dependencies.checkPlanningAdoptionDispositionFn ?? checkPlanningAdoptionDisposition)(root, scope);
        if (adoption?.ok === true && adoption.disposition === "deferred") {
          const entry = (dependencies.inspectArchitectureEntryReadinessFn ?? inspectArchitectureEntryReadiness)({
            rootDir: root,
            taskScope: scope,
          });
          if (entry?.status === "ready") return null;
        }
      }
    } catch { /* unchanged denial below */ }
  }
  const status = typeof fitness?.overallStatus === "string" ? fitness.overallStatus : "unavailable";
  const remedyIds = (Array.isArray(fitness?.outcomes) ? fitness.outcomes : [])
    .filter((outcome) => outcome?.outcome === "finding")
    .flatMap((outcome) => Array.isArray(outcome?.evidence?.remedyComparisons)
      ? outcome.evidence.remedyComparisons.map((comparison) => ({
        propertyId: outcome.propertyId,
        remedyId: comparison?.bestRemedy?.id,
      })) : [])
    .filter(({ propertyId, remedyId }) => [propertyId, remedyId].every((id) =>
      typeof id === "string" && /^[a-z][a-z0-9-]{0,63}$/u.test(id)))
    .map(({ propertyId, remedyId }) => `${propertyId}:${remedyId}`);
  const remedyGuidance = remedyIds.length > 0
    ? `Proposed conformant architecture remedies: ${[...new Set(remedyIds)].slice(0, 5).join(", ")}. Compare them in the planning fitness evidence before changing the plan.\n`
    : "";
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
      + `${ARCHITECTURE_FITNESS_DENIAL_CODE}: planning architecture fitness is ${status}.\n`
      + remedyGuidance
      + "Resolve new or worsened findings, record a valid exception, or repair the evaluator/profile evidence before requesting implementation authority.\n",
  );
}

/**
 * B1 is report-only until measured C1 calibration and an explicit PO
 * promotion decision (Alfred Spec §5.1). The PO may decide the immediate
 * approach and model at the transition; an absent or disagreeing B1 input
 * cannot become a second, implicit lifecycle authority gate. Other readiness,
 * architecture and safety checks still run before this observation.
 */
export function minimumRigorObservation(root, command, dependencies = {}) {
  if (!isImplementationAuthorityTransition(command, root, dependencies)) return null;
  const selectedProfile = (dependencies.activeFeatureSelectedProfileFn ?? activeFeatureSelectedProfile)(root, dependencies);
  if (selectedProfile === null) {
    return verdict(
      0,
      `WARNING (guard-lifecycle-ready): ${MINIMUM_RIGOR_ADVISORY_CODE}: no valid PO-bound lifecycle profile was observed; B1 cannot compare selected and derived rigor. Ask the PO to choose the approach and model. This B1 observation does not block the transition.\n`,
    );
  }
  const surface = (dependencies.activeFeaturePlanningSurfaceFn ?? activeFeaturePlanningSurface)(root, dependencies);
  if (surface === null) {
    return verdict(
      0,
      `WARNING (guard-lifecycle-ready): ${MINIMUM_RIGOR_ADVISORY_CODE}: no valid declared implementation surface was observed; B1 cannot compare planned and actual paths. Ask the PO to choose the approach and model. This B1 observation does not block the transition.\n`,
    );
  }
  let derived;
  let actualSurfaceUnavailable = false;
  try {
    const inputs = (dependencies.inferRigorInputsFn ?? inferInputsFromRepo)(root);
    if (inputs?.actualPaths?.status !== "available" || !Array.isArray(inputs.actualPaths.value)) {
      actualSurfaceUnavailable = true;
      throw new Error("actual Git surface unavailable");
    }
    const actualPaths = Array.isArray(inputs.actualPaths?.value) ? inputs.actualPaths.value : [];
    const observedPaths = [...new Set([...surface.paths, ...actualPaths])];
    inputs.plannedPaths = {
      value: surface.paths,
      status: "available",
      sourceContract: "pipeline.po-bound-plan-surface.v1",
    };
    inputs.protectedTouches = {
      value: observedPaths.some(isProtectedPath),
      status: "available",
      sourceContract: "pipeline.po-bound-plan-surface.v1+pipeline.protected-baseline.v1",
    };
    inputs.contractDeltas = {
      value: observedPaths.some(isContractPath),
      status: "available",
      sourceContract: "pipeline.po-bound-plan-surface.v1+pipeline.contract-freeze.v1",
    };
    inputs.selectedProfile = {
      value: selectedProfile,
      status: "available",
      sourceContract: "pipeline.plan-submission.v1",
    };
    derived = (dependencies.deriveMinimumRigorFn ?? deriveMinimumRigor)(
      inputs,
      (dependencies.loadRigorPolicyFn ?? loadPolicy)(root),
    );
  } catch {
    derived = null;
  }
  if (actualSurfaceUnavailable) {
    return verdict(
      0,
      `WARNING (guard-lifecycle-ready): ${MINIMUM_RIGOR_ADVISORY_CODE}: the actual Git change surface is unavailable; it is unknown, not clean. Ask the PO to choose the approach and model; restore the Git observation for B1 evidence. This B1 observation does not block the transition.\n`,
    );
  }
  const validDerivation = derived?.schema === "pipeline.rigor-derivation.v1"
    && new Set(["mini", "feature", "epic"]).has(derived.minProfile)
    && derived.disagreementLog === undefined;
  if (validDerivation) return null;
  // An incomplete derivation is not a floor or authority claim. It remains a
  // visible B1 evidence gap, not an implementation-transition refusal.
  const minimum = derived?.schema === "pipeline.rigor-derivation.v1"
    && new Set(["mini", "feature", "epic"]).has(derived.minProfile)
    ? derived.minProfile
    : "unavailable";
  return verdict(
    0,
    `WARNING (guard-lifecycle-ready): ${MINIMUM_RIGOR_ADVISORY_CODE}: selected ${selectedProfile}; derived minimum ${minimum}. Record the B1 disagreement and ask the PO to choose the approach and model. This B1 observation does not block the transition.\n`,
  );
}
